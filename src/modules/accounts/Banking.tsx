import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Plus, Landmark, CreditCard, Wallet, CheckCircle2, Circle, Trash2,
  Upload, FileSpreadsheet, Sparkles, Check, ArrowRight, Info, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getAllRecords, createRecord, updateRecord, deleteRecord, logAudit } from '@/services/firebase';
import { useOrgSettings } from '@/context/OrgSettingsContext';
import { formatCurrency } from '@/lib/countryConfig';
import {
  parseBankStatementCSV,
  saveImportedStatement,
  hashString,
  findSuggestedMatches,
  confirmBankStatementMatch,
  ParsedStatementRow,
} from '@/services/bankImportMatchingService';
import type { BankAccount, BankTransaction, ImportedBankStatementRow } from '@/types/accounts';

const ACCOUNT_TYPE_ICON: Record<BankAccount['accountType'], any> = {
  Bank: Landmark, 'Credit Card': CreditCard, Cash: Wallet,
};

export default function Banking() {
  const { country } = useOrgSettings();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [importedRows, setImportedRows] = useState<ImportedBankStatementRow[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ---- Add Account Dialog ----
  const [acctDialogOpen, setAcctDialogOpen] = useState(false);
  const [acctForm, setAcctForm] = useState({
    accountName: '', bankName: '', accountNumber: '', ifscOrSwift: '',
    accountType: 'Bank' as BankAccount['accountType'], openingBalance: '',
  });

  // ---- Add Transaction Dialog ----
  const [txnDialogOpen, setTxnDialogOpen] = useState(false);
  const [txnForm, setTxnForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'), description: '', type: 'Deposit' as BankTransaction['type'],
    amount: '', reference: '',
  });

  // ---- Bank Statement CSV Import Dialog ----
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState<string>('');
  const [mapping, setMapping] = useState({
    dateCol: 0,
    descCol: 1,
    refCol: 2,
    withdrawalCol: 3,
    depositCol: 4,
  });
  const [previewRows, setPreviewRows] = useState<ParsedStatementRow[]>([]);
  const [previewTotals, setPreviewTotals] = useState({ deposits: 0, withdrawals: 0 });
  const [isImporting, setIsImporting] = useState(false);

  // ---- Statement Reconciliation Drawer ----
  const [matchingViewOpen, setMatchingViewOpen] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [accData, txnData, rowsData] = await Promise.all([
        getAllRecords('accounts/bankAccounts'),
        getAllRecords('accounts/bankTransactions'),
        getAllRecords('accounts/importedBankStatementRows'),
      ]);
      const sortedAccounts = (accData as BankAccount[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setAccounts(sortedAccounts);
      setTransactions((txnData as BankTransaction[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      setImportedRows((rowsData as ImportedBankStatementRow[]).sort((a, b) => a.rowNumber - b.rowNumber));
      if (!selectedAccountId && sortedAccounts.length > 0) setSelectedAccountId(sortedAccounts[0].id);
    } finally {
      setLoading(false);
    }
  };

  const saveAccount = async () => {
    if (!acctForm.accountName.trim() || !acctForm.bankName.trim()) {
      toast.error('Account name and bank name are required');
      return;
    }
    try {
      const id = await createRecord('accounts/bankAccounts', {
        accountName: acctForm.accountName,
        bankName: acctForm.bankName,
        accountNumber: acctForm.accountNumber,
        ifscOrSwift: acctForm.ifscOrSwift || undefined,
        accountType: acctForm.accountType,
        currency: country,
        openingBalance: Number(acctForm.openingBalance || 0),
        status: 'active',
      });
      toast.success('Bank account added');
      setAcctDialogOpen(false);
      setAcctForm({ accountName: '', bankName: '', accountNumber: '', ifscOrSwift: '', accountType: 'Bank', openingBalance: '' });
      await loadAll();
      if (id) setSelectedAccountId(id);
    } catch {
      toast.error('Failed to add account');
    }
  };

  const saveTransaction = async () => {
    if (!selectedAccountId) return;
    if (!txnForm.description.trim() || !txnForm.amount) {
      toast.error('Description and amount are required');
      return;
    }
    try {
      const amount = Number(txnForm.amount);
      const id = await createRecord('accounts/bankTransactions', {
        bankAccountId: selectedAccountId,
        date: txnForm.date,
        description: txnForm.description,
        type: txnForm.type,
        amount,
        reference: txnForm.reference || undefined,
        reconciled: false,
      }, { skipAudit: true });
      logAudit(
        'accounts/bankTransactions',
        id,
        txnForm.type === 'Deposit' ? 'payment_received' : 'payment_made',
        `${txnForm.type} of ${formatCurrency(amount, country)} — ${txnForm.description}`,
      );
      toast.success('Transaction added');
      setTxnDialogOpen(false);
      setTxnForm({ date: format(new Date(), 'yyyy-MM-dd'), description: '', type: 'Deposit', amount: '', reference: '' });
      loadAll();
    } catch {
      toast.error('Failed to add transaction');
    }
  };

  const toggleReconciled = async (txn: BankTransaction) => {
    await updateRecord('accounts/bankTransactions', txn.id, { reconciled: !txn.reconciled });
    loadAll();
  };

  const deleteTxn = async (id: string) => {
    if (!confirm('Delete this transaction?')) return;
    await deleteRecord('accounts/bankTransactions', id);
    toast.success('Transaction deleted');
    loadAll();
  };

  // ---- Handle CSV File Selection ----
  const handleCsvFileChange = (file: File) => {
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      setCsvText(text);
      try {
        const { rows, totalDeposits, totalWithdrawals } = parseBankStatementCSV(text, mapping);
        setPreviewRows(rows.slice(0, 5));
        setPreviewTotals({ deposits: totalDeposits, withdrawals: totalWithdrawals });
      } catch (err: any) {
        toast.error(err?.message || 'Failed to parse CSV preview');
      }
    };
    reader.readAsText(file);
  };

  // Update preview on mapping change
  const handleMappingChange = (field: keyof typeof mapping, val: number) => {
    const nextMapping = { ...mapping, [field]: val };
    setMapping(nextMapping);
    if (csvText) {
      try {
        const { rows, totalDeposits, totalWithdrawals } = parseBankStatementCSV(csvText, nextMapping);
        setPreviewRows(rows.slice(0, 5));
        setPreviewTotals({ deposits: totalDeposits, withdrawals: totalWithdrawals });
      } catch { /* ignore */ }
    }
  };

  const handleExecuteImport = async () => {
    if (!selectedAccount || !csvFile || !csvText) {
      toast.error('Please select a file and bank account');
      return;
    }

    setIsImporting(true);
    try {
      const { rows, totalDeposits, totalWithdrawals } = parseBankStatementCSV(csvText, mapping);
      const fileHash = hashString(csvText);

      await saveImportedStatement({
        fileName: csvFile.name,
        fileHash,
        bankAccountId: selectedAccount.id,
        bankAccountName: selectedAccount.accountName,
        rows,
        totalDeposits,
        totalWithdrawals,
      });

      toast.success(`Imported ${rows.length} bank statement rows successfully`);
      setImportDialogOpen(false);
      setCsvFile(null);
      setCsvText('');
      setPreviewRows([]);
      await loadAll();
      setMatchingViewOpen(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to import statement');
    } finally {
      setIsImporting(false);
    }
  };

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const accountTxns = transactions.filter((t) => t.bankAccountId === selectedAccountId);
  const accountImportedRows = importedRows.filter((r) => r.bankAccountId === selectedAccountId);

  const balance = selectedAccount
    ? accountTxns.reduce((s, t) => s + (t.type === 'Deposit' ? t.amount : -t.amount), selectedAccount.openingBalance)
    : 0;
  const unreconciledCount = accountTxns.filter((t) => !t.reconciled).length;

  // Suggested matches
  const matchCandidates = findSuggestedMatches(accountImportedRows.filter((r) => r.matchedStatus !== 'Matched'), accountTxns);

  const handleConfirmMatch = async (importedRowId: string, bookTxnId: string) => {
    try {
      await confirmBankStatementMatch({ importedRowId, bookTransactionId: bookTxnId });
      toast.success('Transaction matched and reconciled successfully');
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || 'Match confirmation failed');
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Accounts list */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Bank &amp; Cash Accounts</CardTitle>
            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setAcctDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="text-xs text-muted-foreground text-center py-6">Loading...</p>
            ) : accounts.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6 px-4">No bank accounts added yet.</p>
            ) : (
              <div className="divide-y">
                {accounts.map((acc) => {
                  const Icon = ACCOUNT_TYPE_ICON[acc.accountType];
                  const isSelected = acc.id === selectedAccountId;
                  return (
                    <button
                      key={acc.id}
                      onClick={() => setSelectedAccountId(acc.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isSelected ? 'bg-primary/5 border-l-2 border-primary' : 'hover:bg-muted/40 border-l-2 border-transparent'}`}
                    >
                      <div className="p-2 rounded-lg bg-blue-50"><Icon className="h-4 w-4 text-blue-600" /></div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{acc.accountName}</p>
                        <p className="text-xs text-muted-foreground truncate">{acc.bankName} · {acc.accountType}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transactions & Reconciliation Register */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2 pb-3">
            <div>
              <CardTitle className="text-sm">{selectedAccount ? selectedAccount.accountName : 'Select an account'}</CardTitle>
              {selectedAccount && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Book Balance: <span className="font-semibold text-foreground">{formatCurrency(balance, country)}</span>
                  {unreconciledCount > 0 && <span className="ml-2 text-amber-600 font-medium">({unreconciledCount} unreconciled)</span>}
                </p>
              )}
            </div>

            {selectedAccount && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="h-3.5 w-3.5 mr-1.5 text-primary" />Import CSV
                </Button>

                {accountImportedRows.length > 0 && (
                  <Button
                    size="sm"
                    variant={matchingViewOpen ? 'default' : 'outline'}
                    className="h-8 text-xs"
                    onClick={() => setMatchingViewOpen(!matchingViewOpen)}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    {matchingViewOpen ? 'View Ledger' : `Match Statements (${accountImportedRows.filter((r) => r.matchedStatus !== 'Matched').length})`}
                  </Button>
                )}

                <Button size="sm" className="h-8 text-xs" onClick={() => setTxnDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />Add Transaction
                </Button>
              </div>
            )}
          </CardHeader>

          <CardContent>
            {!selectedAccount ? (
              <p className="text-sm text-muted-foreground text-center py-10">Add a bank account to get started.</p>
            ) : matchingViewOpen ? (
              /* STATEMENT MATCHING VIEW */
              <div className="space-y-4 text-xs">
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg flex items-start gap-2 text-blue-950">
                  <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Bank Statement Reconciliation: </span>
                    Review imported bank statement lines and confirm matches against book transactions.
                    Confirming a match reconciles the existing payment without creating redundant cash movements.
                  </div>
                </div>

                {matchCandidates.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">All imported statement lines have been reconciled! ✓</p>
                ) : (
                  <div className="border rounded-md overflow-hidden divide-y">
                    {matchCandidates.map(({ importedRow, suggestedTransaction, matchScore, matchReason }) => {
                      const amount = importedRow.depositAmount > 0 ? importedRow.depositAmount : importedRow.withdrawalAmount;
                      const isDeposit = importedRow.depositAmount > 0;

                      return (
                        <div key={importedRow.id} className="p-3 flex items-center justify-between gap-3 hover:bg-muted/20">
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-muted-foreground">{importedRow.date}</span>
                              <span className="font-medium truncate">{importedRow.description}</span>
                              {importedRow.reference && <Badge variant="outline" className="text-[10px]">Ref: {importedRow.reference}</Badge>}
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                              <span>Statement Evidence: <strong>{isDeposit ? '+' : '-'}{formatCurrency(amount, country)}</strong></span>
                              {suggestedTransaction ? (
                                <span className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-1 font-medium">
                                  <Sparkles className="h-3 w-3" />
                                  Suggested Match: {suggestedTransaction.description} ({matchReason})
                                </span>
                              ) : (
                                <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">No exact book match</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {suggestedTransaction && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                                onClick={() => handleConfirmMatch(importedRow.id, suggestedTransaction.id)}
                              >
                                <Check className="h-3 w-3 mr-1" />Confirm Match
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : accountTxns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No transactions yet for this account.</p>
            ) : (
              /* BOOK TRANSACTIONS VIEW */
              <div className="divide-y">
                {accountTxns.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-3">
                    <button onClick={() => toggleReconciled(t)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      {t.reconciled ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" /> : <Circle className="h-4 w-4 text-muted-foreground shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{t.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {(() => { try { return format(new Date(t.date), 'dd-MM-yyyy'); } catch { return t.date; } })()}
                          {t.reference && ` · Ref: ${t.reference}`}
                          {t.reconciled && <span className="ml-2 text-green-600 font-medium">Reconciled</span>}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge className={t.type === 'Deposit' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                        {t.type === 'Deposit' ? '+' : '-'}{formatCurrency(t.amount, country)}
                      </Badge>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteTxn(t.id)}>
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* CSV Bank Statement Import Modal */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              Import Bank Statement (CSV)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <p className="text-muted-foreground">
              Upload a standard CSV bank statement for account <strong>{selectedAccount?.accountName}</strong>.
              Configure column positions to map statement rows safely.
            </p>

            <div>
              <Label>Select Statement CSV File</Label>
              <Input
                type="file"
                accept=".csv"
                className="mt-1"
                onChange={(e) => e.target.files?.[0] && handleCsvFileChange(e.target.files[0])}
              />
            </div>

            {csvFile && (
              <div className="space-y-3 p-3 bg-muted/40 rounded-lg border">
                <h4 className="font-semibold text-xs text-foreground">Column Mapping (0-Indexed Column Positions)</h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div>
                    <Label className="text-[10px]">Date Col</Label>
                    <Input
                      type="number"
                      value={mapping.dateCol}
                      onChange={(e) => handleMappingChange('dateCol', Number(e.target.value))}
                      className="h-7 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">Description Col</Label>
                    <Input
                      type="number"
                      value={mapping.descCol}
                      onChange={(e) => handleMappingChange('descCol', Number(e.target.value))}
                      className="h-7 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">Reference Col</Label>
                    <Input
                      type="number"
                      value={mapping.refCol}
                      onChange={(e) => handleMappingChange('refCol', Number(e.target.value))}
                      className="h-7 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">Withdrawal Col</Label>
                    <Input
                      type="number"
                      value={mapping.withdrawalCol}
                      onChange={(e) => handleMappingChange('withdrawalCol', Number(e.target.value))}
                      className="h-7 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">Deposit Col</Label>
                    <Input
                      type="number"
                      value={mapping.depositCol}
                      onChange={(e) => handleMappingChange('depositCol', Number(e.target.value))}
                      className="h-7 text-xs bg-white"
                    />
                  </div>
                </div>

                {previewRows.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <div className="flex justify-between font-medium text-[11px]">
                      <span>Parsed Preview (First {previewRows.length} Rows):</span>
                      <span className="text-muted-foreground">
                        Total Deposits: +{formatCurrency(previewTotals.deposits, country)} · Total Withdrawals: -{formatCurrency(previewTotals.withdrawals, country)}
                      </span>
                    </div>
                    <div className="border rounded-md overflow-hidden bg-white">
                      <Table>
                        <TableHeader className="bg-muted/30 text-[10px]">
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Reference</TableHead>
                            <TableHead className="text-right">Withdrawal</TableHead>
                            <TableHead className="text-right">Deposit</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-[11px]">
                          {previewRows.map((r, idx) => (
                            <TableRow key={idx}>
                              <TableCell>{r.date}</TableCell>
                              <TableCell className="max-w-[180px] truncate">{r.description}</TableCell>
                              <TableCell>{r.reference || '—'}</TableCell>
                              <TableCell className="text-right text-red-600 font-mono">
                                {r.withdrawalAmount > 0 ? formatCurrency(r.withdrawalAmount, country) : '—'}
                              </TableCell>
                              <TableCell className="text-right text-green-600 font-mono">
                                {r.depositAmount > 0 ? formatCurrency(r.depositAmount, country) : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setImportDialogOpen(false)} disabled={isImporting}>
                Cancel
              </Button>
              <Button onClick={handleExecuteImport} disabled={!csvFile || previewRows.length === 0 || isImporting}>
                {isImporting ? 'Importing...' : 'Confirm & Save Statement'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Account dialog */}
      <Dialog open={acctDialogOpen} onOpenChange={setAcctDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Bank / Cash Account</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Account Nickname</Label>
              <Input value={acctForm.accountName} onChange={(e) => setAcctForm((f) => ({ ...f, accountName: e.target.value }))} placeholder="e.g. Primary Current Account" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Bank Name</Label>
                <Input value={acctForm.bankName} onChange={(e) => setAcctForm((f) => ({ ...f, bankName: e.target.value }))} />
              </div>
              <div>
                <Label>Account Type</Label>
                <Select value={acctForm.accountType} onValueChange={(v: BankAccount['accountType']) => setAcctForm((f) => ({ ...f, accountType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bank">Bank</SelectItem>
                    <SelectItem value="Credit Card">Credit Card</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Account Number</Label>
                <Input value={acctForm.accountNumber} onChange={(e) => setAcctForm((f) => ({ ...f, accountNumber: e.target.value }))} />
              </div>
              <div>
                <Label>IFSC / SWIFT</Label>
                <Input value={acctForm.ifscOrSwift} onChange={(e) => setAcctForm((f) => ({ ...f, ifscOrSwift: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Opening Balance</Label>
              <Input type="number" value={acctForm.openingBalance} onChange={(e) => setAcctForm((f) => ({ ...f, openingBalance: e.target.value }))} placeholder="0.00" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAcctDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveAccount}>Save Account</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add transaction dialog */}
      <Dialog open={txnDialogOpen} onOpenChange={setTxnDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={txnForm.date} onChange={(e) => setTxnForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={txnForm.type} onValueChange={(v: BankTransaction['type']) => setTxnForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Deposit">Deposit</SelectItem>
                    <SelectItem value="Withdrawal">Withdrawal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={txnForm.description} onChange={(e) => setTxnForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Customer payment received" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount</Label>
                <Input type="number" value={txnForm.amount} onChange={(e) => setTxnForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <Label>Reference</Label>
                <Input value={txnForm.reference} onChange={(e) => setTxnForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Cheque / UTR no." />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTxnDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveTransaction}>Save Transaction</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
