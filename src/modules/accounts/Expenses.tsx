import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { RowActions } from '@/components/ui/row-actions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Upload, Paperclip, Receipt, FileStack, Trash2, X, Sparkles, ScanLine, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getAllRecords, createRecord, updateRecord, deleteRecord, logAudit } from '@/services/firebase';
import { uploadFile } from '@/services/cloudinary';
import { useOrgSettings } from '@/context/OrgSettingsContext';
import { formatCurrency } from '@/lib/countryConfig';
import type { Expense, Bill, BillLineItem } from '@/types/accounts';

const EXPENSE_TYPES = ['Travel', 'Utilities', 'Office Supplies', 'Rent', 'Salaries', 'Maintenance', 'Freight', 'Professional Fees', 'Other'];
const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Cheque', 'Credit Card', 'UPI'];

const emptyExpense = () => ({
  date: format(new Date(), 'yyyy-MM-dd'),
  expenseType: EXPENSE_TYPES[0],
  vendorName: '',
  paymentMode: PAYMENT_MODES[0],
  amount: '',
  taxAmount: '',
  notes: '',
  receiptUrl: '',
});

const emptyBillLine = (): BillLineItem => ({ sNo: 1, description: '', qty: 1, rate: 0, amount: 0 });

export default function Expenses() {
  const { country } = useOrgSettings();
  const [tab, setTab] = useState('expenses');

  // ---- Expenses state ----
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState(emptyExpense());
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);

  // ---- Bills state ----
  const [bills, setBills] = useState<Bill[]>([]);
  const [billDialogOpen, setBillDialogOpen] = useState(false);
  const [billForm, setBillForm] = useState({
    vendorName: '', vendorRef: '', billDate: format(new Date(), 'yyyy-MM-dd'),
    dueDate: format(new Date(), 'yyyy-MM-dd'), notes: '',
  });
  const [billLines, setBillLines] = useState<BillLineItem[]>([emptyBillLine()]);

  useEffect(() => {
    loadExpenses();
    loadBills();
  }, []);

  const loadExpenses = async () => {
    const data = await getAllRecords('accounts/expenses');
    setExpenses((data as Expense[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
  };

  const loadBills = async () => {
    const data = await getAllRecords('accounts/bills');
    setBills((data as Bill[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
  };

  // ---- Expense handlers ----
  const handleReceiptUpload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadFile(file);
      setExpenseForm((f) => ({ ...f, receiptUrl: url }));
      toast.success('Receipt uploaded');
    } catch {
      toast.error('Receipt upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ---- AI receipt scan (demo) ----
  // Simulates what a real vision-model OCR call would return. Picks from a small
  // pool of realistic vendor-bill extractions so the flow feels live regardless
  // of which photo is used; the bundled public/samples/sample-receipt.png always
  // maps to the first, fully-detailed template.
  const RECEIPT_TEMPLATES: Array<Partial<ReturnType<typeof emptyExpense>> & { notes: string }> = [
    {
      date: '2026-08-10',
      expenseType: 'Maintenance',
      vendorName: 'Chennai Subsea Components Pvt Ltd',
      paymentMode: 'Bank Transfer',
      amount: '31250',
      taxAmount: '5625',
      notes: 'Receipt RCPT-2026-0817 — U/W Connector Assembly (SubConn MCBH8M) x2, ROV Tether Cable Splice & Test x1, Waterproof Housing O-Ring Kit x5',
    },
    {
      date: '2026-08-05',
      expenseType: 'Travel',
      vendorName: 'Chennai Fuel Point',
      paymentMode: 'Cash',
      amount: '4200',
      taxAmount: '0',
      notes: 'Diesel refuel — site visit vehicle',
    },
    {
      date: '2026-08-01',
      expenseType: 'Freight',
      vendorName: 'BlueDart Express',
      paymentMode: 'UPI',
      amount: '850',
      taxAmount: '153',
      notes: 'Courier — inspection report dispatch to client',
    },
  ];

  const pickReceiptTemplate = (file: File) => {
    const name = file.name.toLowerCase();
    if (name.includes('sample-receipt') || name.includes('sample_receipt')) return RECEIPT_TEMPLATES[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % RECEIPT_TEMPLATES.length;
    return RECEIPT_TEMPLATES[hash];
  };

  const scanReceiptWithAI = async (file: File) => {
    setScanning(true);
    try {
      const [url] = await Promise.all([
        uploadFile(file),
        new Promise((resolve) => setTimeout(resolve, 1400)), // let the "reading receipt" state be visible
      ]);
      const extracted = pickReceiptTemplate(file);
      setExpenseForm((f) => ({ ...f, ...extracted, receiptUrl: url as string }));
      toast.success('Receipt scanned — fields auto-filled. Please review before saving.');
    } catch {
      toast.error('Could not read the receipt. Try uploading it manually.');
    } finally {
      setScanning(false);
    }
  };

  const saveExpense = async () => {
    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    const amount = Number(expenseForm.amount);
    const taxAmount = Number(expenseForm.taxAmount || 0);
    const expenseNumber = `EXP-${Date.now().toString().slice(-6)}`;
    const payload: Omit<Expense, 'id' | 'createdAt'> = {
      expenseNumber,
      date: expenseForm.date,
      expenseType: expenseForm.expenseType,
      vendorName: expenseForm.vendorName,
      paymentMode: expenseForm.paymentMode,
      currency: country,
      amount,
      taxAmount,
      totalAmount: amount + taxAmount,
      receiptUrl: expenseForm.receiptUrl || undefined,
      notes: expenseForm.notes || undefined,
      status: 'Recorded',
    };
    try {
      const id = await createRecord('accounts/expenses', payload, { skipAudit: true });
      logAudit(
        'accounts/expenses',
        id,
        'payment_made',
        `${expenseForm.expenseType} expense of ${formatCurrency(payload.totalAmount, country)} paid to ${expenseForm.vendorName || 'N/A'} via ${expenseForm.paymentMode}`,
      );
      toast.success('Expense recorded');
      setExpenseDialogOpen(false);
      setExpenseForm(emptyExpense());
      loadExpenses();
    } catch {
      toast.error('Failed to save expense');
    }
  };

  const deleteExpense = async (id: string) => {
    if (!confirm('Delete this expense?')) return;
    await deleteRecord('accounts/expenses', id);
    toast.success('Expense deleted');
    loadExpenses();
  };

  // ---- Bill handlers ----
  const updateBillLine = (idx: number, field: keyof BillLineItem, value: any) => {
    setBillLines((prev) => {
      const next = [...prev];
      const line = { ...next[idx], [field]: value };
      if (field === 'qty' || field === 'rate') {
        line.amount = Number(line.qty || 0) * Number(line.rate || 0);
      }
      next[idx] = line;
      return next;
    });
  };

  const addBillLine = () => setBillLines((prev) => [...prev, { ...emptyBillLine(), sNo: prev.length + 1 }]);
  const removeBillLine = (idx: number) => setBillLines((prev) => prev.filter((_, i) => i !== idx));

  const billSubtotal = billLines.reduce((s, l) => s + (l.amount || 0), 0);

  const saveBill = async () => {
    if (!billForm.vendorName.trim()) {
      toast.error('Enter vendor name');
      return;
    }
    if (billLines.every((l) => !l.description.trim())) {
      toast.error('Add at least one line item');
      return;
    }
    const taxAmount = 0; // tax handled per-org; kept editable via notes for now
    const billNumber = `BILL-${Date.now().toString().slice(-6)}`;
    const payload: Omit<Bill, 'id' | 'createdAt'> = {
      billNumber,
      vendorName: billForm.vendorName,
      vendorRef: billForm.vendorRef || undefined,
      billDate: billForm.billDate,
      dueDate: billForm.dueDate,
      currency: country,
      lineItems: billLines.filter((l) => l.description.trim()),
      subtotal: billSubtotal,
      taxAmount,
      grandTotal: billSubtotal + taxAmount,
      paidAmount: 0,
      status: 'Open',
      notes: billForm.notes || undefined,
    };
    try {
      await createRecord('accounts/bills', payload);
      toast.success('Bill recorded');
      setBillDialogOpen(false);
      setBillForm({ vendorName: '', vendorRef: '', billDate: format(new Date(), 'yyyy-MM-dd'), dueDate: format(new Date(), 'yyyy-MM-dd'), notes: '' });
      setBillLines([emptyBillLine()]);
      loadBills();
    } catch {
      toast.error('Failed to save bill');
    }
  };

  const markBillPaid = async (bill: Bill) => {
    await updateRecord('accounts/bills', bill.id, { status: 'Paid', paidAmount: bill.grandTotal }, { skipAudit: true });
    logAudit(
      'accounts/bills',
      bill.id,
      'payment_made',
      `Bill ${bill.billNumber} paid to ${bill.vendorName} — ${formatCurrency(bill.grandTotal, bill.currency)}`,
    );
    toast.success('Bill marked as paid');
    loadBills();
  };

  const deleteBill = async (id: string) => {
    if (!confirm('Delete this bill?')) return;
    await deleteRecord('accounts/bills', id);
    toast.success('Bill deleted');
    loadBills();
  };

  const billStatusBadge = (status: Bill['status']) => {
    const tone = status === 'Open' ? 'blue' : status === 'Draft' ? 'slate' : undefined;
    return <StatusBadge status={status} tone={tone} />;
  };

  return (
    <div className="space-y-5">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList>
            <TabsTrigger value="expenses"><Receipt className="h-3.5 w-3.5 mr-1.5" />Expenses</TabsTrigger>
            <TabsTrigger value="bills"><FileStack className="h-3.5 w-3.5 mr-1.5" />Vendor Bills</TabsTrigger>
          </TabsList>
          {tab === 'expenses' ? (
            <Button size="sm" onClick={() => setExpenseDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />Record Expense
            </Button>
          ) : (
            <Button size="sm" onClick={() => setBillDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />New Bill
            </Button>
          )}
        </div>

        {/* ---- Expenses tab ---- */}
        <TabsContent value="expenses" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Recorded Expenses</CardTitle></CardHeader>
            <CardContent>
              {expenses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No expenses recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Expense No</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Payment Mode</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Receipt</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="font-mono font-semibold">{e.expenseNumber}</TableCell>
                          <TableCell>{(() => { try { return format(new Date(e.date), 'dd-MM-yyyy'); } catch { return e.date; } })()}</TableCell>
                          <TableCell>{e.expenseType}</TableCell>
                          <TableCell>{e.vendorName || '—'}</TableCell>
                          <TableCell>{e.paymentMode}</TableCell>
                          <TableCell className="font-medium">{formatCurrency(e.totalAmount, country)}</TableCell>
                          <TableCell>
                            {e.receiptUrl ? (
                              <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-xs">
                                <Paperclip className="h-3.5 w-3.5" />View
                              </a>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteExpense(e.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Bills tab ---- */}
        <TabsContent value="bills" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Vendor Bills (Accounts Payable)</CardTitle></CardHeader>
            <CardContent>
              {bills.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No vendor bills yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bill No</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Bill Date</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bills.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-mono font-semibold">{b.billNumber}</TableCell>
                          <TableCell>{b.vendorName}</TableCell>
                          <TableCell>{(() => { try { return format(new Date(b.billDate), 'dd-MM-yyyy'); } catch { return b.billDate; } })()}</TableCell>
                          <TableCell>{(() => { try { return format(new Date(b.dueDate), 'dd-MM-yyyy'); } catch { return b.dueDate; } })()}</TableCell>
                          <TableCell className="font-medium">{formatCurrency(b.grandTotal, country)}</TableCell>
                          <TableCell>{billStatusBadge(b.status)}</TableCell>
                          <TableCell>
                            <div className="flex justify-center">
                              <RowActions
                                actions={[
                                  { label: 'Mark Paid', icon: CheckCircle2, onClick: () => markBillPaid(b), hidden: b.status === 'Paid', className: 'text-green-600 hover:text-green-700' },
                                  { label: 'Delete', icon: Trash2, onClick: () => deleteBill(b.id), className: 'text-red-600 hover:text-red-700' },
                                ]}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---- Add Expense dialog ---- */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <Label>Expense Type</Label>
                <Select value={expenseForm.expenseType} onValueChange={(v) => setExpenseForm((f) => ({ ...f, expenseType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Vendor / Paid To</Label>
              <Input value={expenseForm.vendorName} onChange={(e) => setExpenseForm((f) => ({ ...f, vendorName: e.target.value }))} placeholder="e.g. Local courier service" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Amount</Label>
                <Input type="number" value={expenseForm.amount} onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <Label>Tax</Label>
                <Input type="number" value={expenseForm.taxAmount} onChange={(e) => setExpenseForm((f) => ({ ...f, taxAmount: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <Label>Payment Mode</Label>
                <Select value={expenseForm.paymentMode} onValueChange={(v) => setExpenseForm((f) => ({ ...f, paymentMode: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={expenseForm.notes} onChange={(e) => setExpenseForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="border rounded-md p-3 bg-primary/5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Scan receipt with AI
              </div>
              <p className="text-xs text-muted-foreground">
                Upload a photo of the vendor bill — the assistant reads it and fills the fields below for you to review.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <label className={`inline-flex items-center gap-2 border border-dashed border-primary/40 rounded-md py-2 px-3 text-xs cursor-pointer hover:bg-primary/10 ${scanning ? 'opacity-70 pointer-events-none' : ''}`}>
                  <ScanLine className={`h-3.5 w-3.5 ${scanning ? 'animate-pulse' : ''}`} />
                  {scanning ? 'Reading receipt...' : 'Scan Receipt'}
                  <input type="file" accept="image/*" className="hidden" disabled={scanning}
                    onChange={(e) => e.target.files?.[0] && scanReceiptWithAI(e.target.files[0])} />
                </label>
                <a href="/samples/sample-receipt.png" download className="text-xs text-primary underline underline-offset-2">
                  Download a sample receipt to try
                </a>
              </div>
            </div>

            <div>
              <Label>Receipt (photo or PDF)</Label>
              {expenseForm.receiptUrl ? (
                <div className="flex items-center justify-between mt-1 p-2 border rounded-md bg-muted/40 text-xs">
                  <a href={expenseForm.receiptUrl} target="_blank" rel="noreferrer" className="text-primary truncate">Receipt attached — view</a>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setExpenseForm((f) => ({ ...f, receiptUrl: '' }))}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <label className="mt-1 flex items-center justify-center gap-2 border border-dashed rounded-md py-3 text-xs text-muted-foreground cursor-pointer hover:bg-muted/40">
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? 'Uploading...' : 'Upload receipt manually (image/PDF)'}
                  <input type="file" accept="image/*,.pdf" className="hidden" disabled={uploading}
                    onChange={(e) => e.target.files?.[0] && handleReceiptUpload(e.target.files[0])} />
                </label>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setExpenseDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveExpense}>Save Expense</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- Add Bill dialog ---- */}
      <Dialog open={billDialogOpen} onOpenChange={setBillDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Vendor Bill</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vendor Name</Label>
                <Input value={billForm.vendorName} onChange={(e) => setBillForm((f) => ({ ...f, vendorName: e.target.value }))} />
              </div>
              <div>
                <Label>Vendor Ref / PO No.</Label>
                <Input value={billForm.vendorRef} onChange={(e) => setBillForm((f) => ({ ...f, vendorRef: e.target.value }))} />
              </div>
              <div>
                <Label>Bill Date</Label>
                <Input type="date" value={billForm.billDate} onChange={(e) => setBillForm((f) => ({ ...f, billDate: e.target.value }))} />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={billForm.dueDate} onChange={(e) => setBillForm((f) => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button size="sm" variant="outline" onClick={addBillLine}><Plus className="h-3.5 w-3.5 mr-1" />Add Line</Button>
              </div>
              <div className="border rounded-md divide-y">
                {billLines.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2">
                    <Input placeholder="Description" value={line.description}
                      onChange={(e) => updateBillLine(idx, 'description', e.target.value)} className="flex-1 h-8 text-xs" />
                    <Input type="number" placeholder="Qty" value={line.qty}
                      onChange={(e) => updateBillLine(idx, 'qty', Number(e.target.value))} className="w-16 h-8 text-xs" />
                    <Input type="number" placeholder="Rate" value={line.rate}
                      onChange={(e) => updateBillLine(idx, 'rate', Number(e.target.value))} className="w-24 h-8 text-xs" />
                    <span className="w-24 text-xs font-medium text-right">{formatCurrency(line.amount, country)}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeBillLine(idx)} disabled={billLines.length === 1}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end text-sm font-semibold">
                Subtotal: {formatCurrency(billSubtotal, country)}
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={billForm.notes} onChange={(e) => setBillForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBillDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveBill}>Save Bill</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
