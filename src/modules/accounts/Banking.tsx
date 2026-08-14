import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Landmark, CreditCard, Wallet, CheckCircle2, Circle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getAllRecords, createRecord, updateRecord, deleteRecord, logAudit } from '@/services/firebase';
import { useOrgSettings } from '@/context/OrgSettingsContext';
import { formatCurrency } from '@/lib/countryConfig';
import type { BankAccount, BankTransaction } from '@/types/accounts';

const ACCOUNT_TYPE_ICON: Record<BankAccount['accountType'], any> = {
  Bank: Landmark, 'Credit Card': CreditCard, Cash: Wallet,
};

export default function Banking() {
  const { country } = useOrgSettings();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [acctDialogOpen, setAcctDialogOpen] = useState(false);
  const [acctForm, setAcctForm] = useState({
    accountName: '', bankName: '', accountNumber: '', ifscOrSwift: '',
    accountType: 'Bank' as BankAccount['accountType'], openingBalance: '',
  });

  const [txnDialogOpen, setTxnDialogOpen] = useState(false);
  const [txnForm, setTxnForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'), description: '', type: 'Deposit' as BankTransaction['type'],
    amount: '', reference: '',
  });

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [accData, txnData] = await Promise.all([
        getAllRecords('accounts/bankAccounts'),
        getAllRecords('accounts/bankTransactions'),
      ]);
      const sortedAccounts = (accData as BankAccount[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setAccounts(sortedAccounts);
      setTransactions((txnData as BankTransaction[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
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

  const accountTxns = transactions.filter((t) => t.bankAccountId === selectedAccountId);
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const balance = selectedAccount
    ? accountTxns.reduce((s, t) => s + (t.type === 'Deposit' ? t.amount : -t.amount), selectedAccount.openingBalance)
    : 0;
  const unreconciledCount = accountTxns.filter((t) => !t.reconciled).length;

  return (
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
            <p className="text-xs text-muted-foreground text-center py-6 px-4">No bank accounts added yet. Add one to start tracking cash position.</p>
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

      {/* Transactions */}
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-sm">{selectedAccount ? selectedAccount.accountName : 'Select an account'}</CardTitle>
            {selectedAccount && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Balance: <span className="font-semibold text-foreground">{formatCurrency(balance, country)}</span>
                {unreconciledCount > 0 && <span className="ml-2 text-amber-600">{unreconciledCount} unreconciled</span>}
              </p>
            )}
          </div>
          {selectedAccount && (
            <Button size="sm" onClick={() => setTxnDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add Transaction
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!selectedAccount ? (
            <p className="text-sm text-muted-foreground text-center py-10">Add a bank account to get started.</p>
          ) : accountTxns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No transactions yet for this account.</p>
          ) : (
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

      {/* Add account dialog */}
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
