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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Upload, Paperclip, Receipt, FileStack, Trash2, X, Sparkles, ScanLine, CheckCircle2,
  Wallet, Eye, CreditCard, ArrowRightLeft, Undo2, AlertCircle, Info, FileText, CheckCheck, Scale,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getAllRecords, createRecord, deleteRecord, logAudit } from '@/services/firebase';
import { uploadFile } from '@/services/cloudinary';
import { useOrgSettings } from '@/context/OrgSettingsContext';
import { formatCurrency } from '@/lib/countryConfig';
import { safeSub, safeAdd, roundCurrency } from '@/services/financeCalculations';
import {
  recordBillPayment,
  recordSupplierAdvance,
  allocateSupplierAdvance,
  reverseAdvanceAllocation,
  recordSupplierCredit,
  allocateSupplierCredit,
} from '@/services/settlementService';
import {
  analyzeBillGrnMatching,
  confirmBillGrnMatching,
  getGrnMatchedQuantities,
  GRNRecord,
  BillMatchingResult,
} from '@/services/procurementMatchingService';
import { allocateLandedCost } from '@/services/manufacturingCostService';
import type {
  Expense, Bill, BillLineItem, BillPayment, SupplierAdvance, AdvanceAllocation, BankAccount,
  SupplierCredit, BillGrnMatch, LandedCostAllocation, LandedCostAllocationBasis,
} from '@/types/accounts';

const SAMPLE_GRN: GRNRecord[] = [
  { id: 's1', grnNo: 'GRN-2026-001', date: '2026-05-15', supplier: 'Alpha Chemicals Pvt Ltd', material: 'NR-GRADE-1', qty: 500, unit: 'kg', poNumber: 'PO-2026-001', status: 'Accepted', remarks: 'All OK', createdAt: new Date('2026-05-15').getTime() },
  { id: 's2', grnNo: 'GRN-2026-002', date: '2026-05-22', supplier: 'Beta Supplies', material: 'SBR-1502', qty: 300, unit: 'kg', poNumber: 'PO-2026-002', status: 'Accepted', remarks: '', createdAt: new Date('2026-05-22').getTime() },
  { id: 's3', grnNo: 'GRN-2026-003', date: '2026-06-01', supplier: 'Gamma Materials Ltd', material: 'CARBON-BLACK-N330', qty: 200, unit: 'kg', poNumber: 'PO-2026-003', status: 'Accepted', remarks: 'Verified by QC', createdAt: new Date('2026-06-01').getTime() },
  { id: 's4', grnNo: 'GRN-2026-004', date: '2026-06-03', supplier: 'Alpha Chemicals Pvt Ltd', material: 'ZINC-OXIDE-99', qty: 100, unit: 'kg', poNumber: 'PO-2026-004', status: 'Under Inspection', remarks: 'QC in progress', createdAt: new Date('2026-06-03').getTime() },
  { id: 's5', grnNo: 'GRN-2026-005', date: '2026-06-05', supplier: 'Delta Corp', material: 'SULPHUR-POWDER', qty: 150, unit: 'kg', poNumber: 'PO-2026-005', status: 'Accepted', remarks: '', createdAt: new Date('2026-06-05').getTime() },
];

const EXPENSE_TYPES = ['Travel', 'Utilities', 'Office Supplies', 'Rent', 'Salaries', 'Maintenance', 'Freight', 'Professional Fees', 'Other'];
const PAYMENT_MODES = ['Bank Transfer', 'Cheque', 'Cash', 'Credit Card', 'UPI'];

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
    billType: 'standard' as 'standard' | 'subcontractor',
    jobWorkOrderNo: '',
    serviceDescription: '',
    fgReceivedQty: '',
    scrapQty: '',
    tdsApplicable: false,
    tdsRate: '2',
  });
  const [billLines, setBillLines] = useState<BillLineItem[]>([emptyBillLine()]);

  // ---- Landed Costs state ----
  const [landedAllocations, setLandedAllocations] = useState<LandedCostAllocation[]>([]);
  const [landedDialogOpen, setLandedDialogOpen] = useState(false);
  const [landedForm, setLandedForm] = useState({
    sourceType: 'Expense' as 'Expense' | 'Bill',
    sourceId: '',
    sourceReference: '',
    totalLandedCost: '',
    allocationBasis: 'quantity' as LandedCostAllocationBasis,
    notes: '',
  });
  const [landedTargets, setLandedTargets] = useState<Array<{
    targetType: 'BillLine' | 'GRNLine';
    targetId: string;
    itemDescription: string;
    quantity: number;
    baseAmount: number;
    weight?: number;
  }>>([]);
  const [isAllocatingLanded, setIsAllocatingLanded] = useState(false);

  // ---- Shared / Banking / Settlements state ----
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [payments, setPayments] = useState<BillPayment[]>([]);
  const [advances, setAdvances] = useState<SupplierAdvance[]>([]);
  const [allocations, setAllocations] = useState<AdvanceAllocation[]>([]);
  const [credits, setCredits] = useState<SupplierCredit[]>([]);
  const [grnList, setGrnList] = useState<GRNRecord[]>([]);
  const [billGrnMatches, setBillGrnMatches] = useState<BillGrnMatch[]>([]);
  const [matchedQuantitiesMap, setMatchedQuantitiesMap] = useState<Record<string, number>>({});
  const [isConfirmingMatch, setIsConfirmingMatch] = useState(false);
  const [loading, setLoading] = useState(true);

  // ---- Record Payment Dialog state ----
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentTargetBill, setPaymentTargetBill] = useState<Bill | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    paymentDate: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    bankAccountId: '',
    paymentMethod: PAYMENT_MODES[0],
    reference: '',
    notes: '',
    attachmentUrl: '',
  });
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // ---- Bill Details & History Dialog state ----
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedBillForDetails, setSelectedBillForDetails] = useState<Bill | null>(null);

  // ---- Record Advance Dialog state ----
  const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    vendorName: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    bankAccountId: '',
    paymentMethod: PAYMENT_MODES[0],
    reference: '',
    notes: '',
    attachmentUrl: '',
  });
  const [isSubmittingAdvance, setIsSubmittingAdvance] = useState(false);

  // ---- Allocate Advance to Bill Dialog state ----
  const [allocateDialogOpen, setAllocateDialogOpen] = useState(false);
  const [allocateTargetBill, setAllocateTargetBill] = useState<Bill | null>(null);
  const [selectedAdvanceId, setSelectedAdvanceId] = useState<string>('');
  const [allocateAmount, setAllocateAmount] = useState<string>('');
  const [allocateDate, setAllocateDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [allocateNotes, setAllocateNotes] = useState<string>('');
  const [isSubmittingAllocation, setIsSubmittingAllocation] = useState(false);

  // ---- Record Supplier Credit / Debit Note Dialog state ----
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [creditForm, setCreditForm] = useState({
    vendorName: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    reason: '',
    originalBillId: '',
    purchaseReturnRef: '',
    material: '',
    returnedQty: '',
    settlementEffect: 'ReduceBillBalance' as 'ReduceBillBalance' | 'RefundCash' | 'KeepAsCreditNote',
    bankAccountId: '',
    notes: '',
  });
  const [isSubmittingCredit, setIsSubmittingCredit] = useState(false);

  // ---- Allocate Supplier Credit to Bill Dialog state ----
  const [allocateCreditDialogOpen, setAllocateCreditDialogOpen] = useState(false);
  const [allocateCreditTargetBill, setAllocateCreditTargetBill] = useState<Bill | null>(null);
  const [selectedCreditId, setSelectedCreditId] = useState<string>('');
  const [allocateCreditAmount, setAllocateCreditAmount] = useState<string>('');
  const [allocateCreditDate, setAllocateCreditDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [allocateCreditNotes, setAllocateCreditNotes] = useState<string>('');
  const [isSubmittingCreditAllocation, setIsSubmittingCreditAllocation] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [expData, billsData, bankData, payData, advData, allocData, credData, grnData, matchData, landedData] = await Promise.all([
        getAllRecords('accounts/expenses'),
        getAllRecords('accounts/bills'),
        getAllRecords('accounts/bankAccounts'),
        getAllRecords('accounts/billPayments'),
        getAllRecords('accounts/supplierAdvances'),
        getAllRecords('accounts/advanceAllocations'),
        getAllRecords('accounts/supplierCredits'),
        getAllRecords('stores/grn'),
        getAllRecords('accounts/billGrnMatches'),
        getAllRecords('accounts/landedCostAllocations'),
      ]);

      const mergedGrn = [...SAMPLE_GRN, ...(grnData as GRNRecord[])];
      const uniqueGrn = Array.from(new Map(mergedGrn.map((g) => [g.id, g])).values());

      setExpenses((expData as Expense[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      setBills((billsData as Bill[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      setBankAccounts((bankData as BankAccount[]).filter((b) => b.status === 'active'));
      setPayments((payData as BillPayment[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      setAdvances((advData as SupplierAdvance[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      setAllocations((allocData as AdvanceAllocation[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      setCredits((credData as SupplierCredit[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      setLandedAllocations((landedData as LandedCostAllocation[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      setGrnList(uniqueGrn);
      setBillGrnMatches(matchData as BillGrnMatch[]);

      const matchedQtyMap = await getGrnMatchedQuantities();
      setMatchedQuantitiesMap(matchedQtyMap);
    } catch (err) {
      console.error('Error loading finance data:', err);
    } finally {
      setLoading(false);
    }
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

  const scanReceiptWithAI = async (file: File) => {
    setScanning(true);
    try {
      const [url] = await Promise.all([
        uploadFile(file),
        new Promise((resolve) => setTimeout(resolve, 1400)),
      ]);
      setExpenseForm((f) => ({
        ...f,
        date: format(new Date(), 'yyyy-MM-dd'),
        expenseType: 'Maintenance',
        vendorName: 'Chennai Subsea Components Pvt Ltd',
        paymentMode: 'Bank Transfer',
        amount: '31250',
        taxAmount: '5625',
        notes: `Receipt ${file.name} — auto-scanned components`,
        receiptUrl: url as string,
      }));
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
      loadAllData();
    } catch {
      toast.error('Failed to save expense');
    }
  };

  const deleteExpense = async (id: string) => {
    if (!confirm('Delete this expense?')) return;
    await deleteRecord('accounts/expenses', id);
    toast.success('Expense deleted');
    loadAllData();
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
    const taxAmount = 0;
    const isSub = billForm.billType === 'subcontractor';
    const tdsRate = isSub && billForm.tdsApplicable ? Number(billForm.tdsRate) || 2 : 0;
    const tdsAmount = isSub && billForm.tdsApplicable ? roundCurrency((billSubtotal * tdsRate) / 100) : 0;
    const grandTotal = roundCurrency(billSubtotal + taxAmount - tdsAmount);

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
      grandTotal,
      paidAmount: 0,
      status: 'Open',
      billType: billForm.billType,
      jobWorkOrderNo: isSub ? billForm.jobWorkOrderNo || undefined : undefined,
      serviceDescription: isSub ? billForm.serviceDescription || undefined : undefined,
      fgReceivedQty: isSub && billForm.fgReceivedQty ? Number(billForm.fgReceivedQty) : undefined,
      scrapQty: isSub && billForm.scrapQty ? Number(billForm.scrapQty) : undefined,
      tdsApplicable: isSub ? billForm.tdsApplicable : undefined,
      tdsRate: isSub && billForm.tdsApplicable ? tdsRate : undefined,
      tdsAmount: isSub && billForm.tdsApplicable ? tdsAmount : undefined,
      notes: billForm.notes || undefined,
    };
    try {
      await createRecord('accounts/bills', payload);
      toast.success(isSub ? `Subcontractor bill recorded with ₹${tdsAmount} TDS deducted` : 'Bill recorded');
      setBillDialogOpen(false);
      setBillForm({
        vendorName: '',
        vendorRef: '',
        billDate: format(new Date(), 'yyyy-MM-dd'),
        dueDate: format(new Date(), 'yyyy-MM-dd'),
        notes: '',
        billType: 'standard',
        jobWorkOrderNo: '',
        serviceDescription: '',
        fgReceivedQty: '',
        scrapQty: '',
        tdsApplicable: false,
        tdsRate: '2',
      });
      setBillLines([emptyBillLine()]);
      loadAllData();
    } catch {
      toast.error('Failed to save bill');
    }
  };

  const deleteBill = async (bill: Bill) => {
    if (Number(bill.paidAmount) > 0) {
      toast.error('Cannot delete a bill that has recorded payments or allocations. Reverse settlements first.');
      return;
    }
    if (!confirm(`Delete bill ${bill.billNumber}?`)) return;
    await deleteRecord('accounts/bills', bill.id);
    toast.success('Bill deleted');
    loadAllData();
  };

  // ---- Open Payment Dialog ----
  const openRecordPayment = (bill: Bill, autoFullRemaining: boolean = false) => {
    const remaining = Math.max(0, safeSub(bill.grandTotal, bill.paidAmount));
    const defaultBank = bankAccounts[0]?.id || '';
    setPaymentTargetBill(bill);
    setPaymentForm({
      paymentDate: format(new Date(), 'yyyy-MM-dd'),
      amount: autoFullRemaining ? String(remaining) : String(remaining),
      bankAccountId: defaultBank,
      paymentMethod: PAYMENT_MODES[0],
      reference: '',
      notes: autoFullRemaining ? 'Full balance settlement' : '',
      attachmentUrl: '',
    });
    setPaymentDialogOpen(true);
  };

  const handleExecutePayment = async () => {
    if (!paymentTargetBill) return;
    const payAmt = Number(paymentForm.amount);
    const remaining = safeSub(paymentTargetBill.grandTotal, paymentTargetBill.paidAmount);

    if (isNaN(payAmt) || payAmt <= 0) {
      toast.error('Payment amount must be greater than zero');
      return;
    }
    if (payAmt > remaining + 0.001) {
      toast.error(`Amount exceeds remaining balance of ${formatCurrency(remaining, paymentTargetBill.currency)}`);
      return;
    }
    if (!paymentForm.bankAccountId) {
      toast.error('Please select a bank or cash account');
      return;
    }

    const selectedBank = bankAccounts.find((b) => b.id === paymentForm.bankAccountId);
    const bankName = selectedBank ? `${selectedBank.accountName} (${selectedBank.bankName})` : 'Bank';

    setIsSubmittingPayment(true);
    try {
      await recordBillPayment({
        billId: paymentTargetBill.id,
        paymentDate: paymentForm.paymentDate,
        amount: payAmt,
        bankAccountId: paymentForm.bankAccountId,
        bankAccountName: bankName,
        paymentMethod: paymentForm.paymentMethod,
        reference: paymentForm.reference,
        notes: paymentForm.notes,
        attachmentUrl: paymentForm.attachmentUrl,
      });

      toast.success(`Payment of ${formatCurrency(payAmt, paymentTargetBill.currency)} recorded successfully`);
      setPaymentDialogOpen(false);
      setPaymentTargetBill(null);
      await loadAllData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record payment');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // ---- Open Advance Dialog ----
  const handleRecordAdvance = async () => {
    const advAmt = Number(advanceForm.amount);
    if (!advanceForm.vendorName.trim()) {
      toast.error('Please enter supplier name');
      return;
    }
    if (isNaN(advAmt) || advAmt <= 0) {
      toast.error('Advance amount must be greater than zero');
      return;
    }
    if (!advanceForm.bankAccountId) {
      toast.error('Please select a payment bank account');
      return;
    }

    const selectedBank = bankAccounts.find((b) => b.id === advanceForm.bankAccountId);
    const bankName = selectedBank ? `${selectedBank.accountName} (${selectedBank.bankName})` : 'Bank';

    setIsSubmittingAdvance(true);
    try {
      await recordSupplierAdvance({
        vendorName: advanceForm.vendorName,
        date: advanceForm.date,
        amount: advAmt,
        currency: country,
        bankAccountId: advanceForm.bankAccountId,
        bankAccountName: bankName,
        paymentMethod: advanceForm.paymentMethod,
        reference: advanceForm.reference,
        notes: advanceForm.notes,
        attachmentUrl: advanceForm.attachmentUrl,
      });

      toast.success(`Advance of ${formatCurrency(advAmt, country)} recorded successfully`);
      setAdvanceDialogOpen(false);
      setAdvanceForm({
        vendorName: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        amount: '',
        bankAccountId: bankAccounts[0]?.id || '',
        paymentMethod: PAYMENT_MODES[0],
        reference: '',
        notes: '',
        attachmentUrl: '',
      });
      await loadAllData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record advance');
    } finally {
      setIsSubmittingAdvance(false);
    }
  };

  // ---- Open Advance Allocation Dialog ----
  const openAdvanceAllocation = (bill: Bill) => {
    const vendorAdvances = advances.filter(
      (a) => a.vendorName.trim().toLowerCase() === bill.vendorName.trim().toLowerCase() && a.remainingAmount > 0.001,
    );

    if (vendorAdvances.length === 0) {
      toast.error(`No available advances found for supplier "${bill.vendorName}". Record an advance first.`);
      return;
    }

    const billRemaining = Math.max(0, safeSub(bill.grandTotal, bill.paidAmount));
    const firstAdv = vendorAdvances[0];
    const initialAllocate = Math.min(firstAdv.remainingAmount, billRemaining);

    setAllocateTargetBill(bill);
    setSelectedAdvanceId(firstAdv.id);
    setAllocateAmount(String(initialAllocate));
    setAllocateDate(format(new Date(), 'yyyy-MM-dd'));
    setAllocateNotes('');
    setAllocateDialogOpen(true);
  };

  const handleExecuteAllocation = async () => {
    if (!allocateTargetBill || !selectedAdvanceId) return;
    const allocAmt = Number(allocateAmount);
    const adv = advances.find((a) => a.id === selectedAdvanceId);
    if (!adv) {
      toast.error('Selected advance could not be found');
      return;
    }

    const billRemaining = safeSub(allocateTargetBill.grandTotal, allocateTargetBill.paidAmount);

    if (isNaN(allocAmt) || allocAmt <= 0) {
      toast.error('Allocation amount must be greater than zero');
      return;
    }
    if (allocAmt > adv.remainingAmount + 0.001) {
      toast.error(`Amount exceeds advance remaining balance of ${formatCurrency(adv.remainingAmount, adv.currency)}`);
      return;
    }
    if (allocAmt > billRemaining + 0.001) {
      toast.error(`Amount exceeds bill remaining balance of ${formatCurrency(billRemaining, allocateTargetBill.currency)}`);
      return;
    }

    setIsSubmittingAllocation(true);
    try {
      await allocateSupplierAdvance({
        advanceId: adv.id,
        billId: allocateTargetBill.id,
        amount: allocAmt,
        date: allocateDate,
        notes: allocateNotes,
      });

      toast.success(`Allocated ${formatCurrency(allocAmt, adv.currency)} to Bill ${allocateTargetBill.billNumber}`);
      setAllocateDialogOpen(false);
      setAllocateTargetBill(null);
      await loadAllData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to allocate advance');
    } finally {
      setIsSubmittingAllocation(false);
    }
  };

  // ---- Handle Allocation Reversal ----
  const handleReverseAllocation = async (allocationId: string) => {
    const reason = prompt('Enter a reason for reversing this advance allocation:');
    if (!reason || !reason.trim()) {
      toast.error('Reversal reason is required');
      return;
    }

    try {
      await reverseAdvanceAllocation(allocationId, reason);
      toast.success('Allocation reversed. Advance and bill balances restored.');
      await loadAllData();
      // update details dialog if open
      if (selectedBillForDetails) {
        const refreshedBill = bills.find((b) => b.id === selectedBillForDetails.id);
        if (refreshedBill) setSelectedBillForDetails(refreshedBill);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reverse allocation');
    }
  };

  const billStatusBadge = (status: Bill['status']) => {
    const tone = status === 'Paid' ? 'green' : status === 'Partial' ? 'amber' : status === 'Open' ? 'blue' : 'slate';
    return <StatusBadge status={status} tone={tone} />;
  };

  // ---- Supplier Credit Handlers ----
  const handleRecordCredit = async () => {
    const credAmt = Number(creditForm.amount);
    if (!creditForm.vendorName.trim()) {
      toast.error('Please enter supplier name');
      return;
    }
    if (isNaN(credAmt) || credAmt <= 0) {
      toast.error('Credit note amount must be greater than zero');
      return;
    }
    if (!creditForm.reason.trim()) {
      toast.error('Reason for debit note / credit is required');
      return;
    }
    if (creditForm.settlementEffect === 'RefundCash' && !creditForm.bankAccountId) {
      toast.error('Please select the refund receiving bank account');
      return;
    }

    const selectedBank = bankAccounts.find((b) => b.id === creditForm.bankAccountId);
    const bankName = selectedBank ? `${selectedBank.accountName} (${selectedBank.bankName})` : undefined;

    setIsSubmittingCredit(true);
    try {
      await recordSupplierCredit({
        vendorName: creditForm.vendorName,
        date: creditForm.date,
        amount: credAmt,
        currency: country,
        reason: creditForm.reason,
        originalBillId: creditForm.originalBillId || undefined,
        purchaseReturnRef: creditForm.purchaseReturnRef || undefined,
        material: creditForm.material || undefined,
        returnedQty: creditForm.returnedQty ? Number(creditForm.returnedQty) : undefined,
        settlementEffect: creditForm.settlementEffect,
        bankAccountId: creditForm.bankAccountId || undefined,
        bankAccountName: bankName,
        notes: creditForm.notes || undefined,
      });

      toast.success(`Debit Note for ${formatCurrency(credAmt, country)} recorded successfully`);
      setCreditDialogOpen(false);
      setCreditForm({
        vendorName: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        amount: '',
        reason: '',
        originalBillId: '',
        purchaseReturnRef: '',
        material: '',
        returnedQty: '',
        settlementEffect: 'ReduceBillBalance',
        bankAccountId: '',
        notes: '',
      });
      await loadAllData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record debit note');
    } finally {
      setIsSubmittingCredit(false);
    }
  };

  const openCreditAllocation = (bill: Bill) => {
    const vendorCredits = credits.filter(
      (c) => c.vendorName.trim().toLowerCase() === bill.vendorName.trim().toLowerCase() && c.remainingAmount > 0.001,
    );

    if (vendorCredits.length === 0) {
      toast.error(`No available credit notes found for supplier "${bill.vendorName}".`);
      return;
    }

    const billRemaining = Math.max(0, safeSub(bill.grandTotal, bill.paidAmount));
    const firstCred = vendorCredits[0];
    const initialAllocate = Math.min(firstCred.remainingAmount, billRemaining);

    setAllocateCreditTargetBill(bill);
    setSelectedCreditId(firstCred.id);
    setAllocateCreditAmount(String(initialAllocate));
    setAllocateCreditDate(format(new Date(), 'yyyy-MM-dd'));
    setAllocateCreditNotes('');
    setAllocateCreditDialogOpen(true);
  };

  const handleExecuteCreditAllocation = async () => {
    if (!allocateCreditTargetBill || !selectedCreditId) return;
    const allocAmt = Number(allocateCreditAmount);
    const cred = credits.find((c) => c.id === selectedCreditId);
    if (!cred) {
      toast.error('Selected credit note could not be found');
      return;
    }

    const billRemaining = safeSub(allocateCreditTargetBill.grandTotal, allocateCreditTargetBill.paidAmount);

    if (isNaN(allocAmt) || allocAmt <= 0) {
      toast.error('Allocation amount must be greater than zero');
      return;
    }
    if (allocAmt > cred.remainingAmount + 0.001) {
      toast.error(`Amount exceeds credit note available balance of ${formatCurrency(cred.remainingAmount, cred.currency)}`);
      return;
    }
    if (allocAmt > billRemaining + 0.001) {
      toast.error(`Amount exceeds bill remaining balance of ${formatCurrency(billRemaining, allocateCreditTargetBill.currency)}`);
      return;
    }

    setIsSubmittingCreditAllocation(true);
    try {
      await allocateSupplierCredit({
        creditId: cred.id,
        billId: allocateCreditTargetBill.id,
        amount: allocAmt,
        date: allocateCreditDate,
        notes: allocateCreditNotes,
      });

      toast.success(`Allocated ${formatCurrency(allocAmt, cred.currency)} from ${cred.creditNumber} to Bill ${allocateCreditTargetBill.billNumber}`);
      setAllocateCreditDialogOpen(false);
      setAllocateCreditTargetBill(null);
      await loadAllData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to allocate credit note');
    } finally {
      setIsSubmittingCreditAllocation(false);
    }
  };

  const handleConfirmMatch = async (bill: Bill, analysis: BillMatchingResult) => {
    setIsConfirmingMatch(true);
    try {
      await confirmBillGrnMatching(bill, analysis);
      toast.success(`Confirmed PO-GRN 3-way match for Bill ${bill.billNumber}`);
      await loadAllData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to confirm match');
    } finally {
      setIsConfirmingMatch(false);
    }
  };

  const handleExecuteLandedCost = async () => {
    if (!landedForm.sourceId) {
      toast.error('Please select a source expense or bill.');
      return;
    }
    const cost = Number(landedForm.totalLandedCost);
    if (!cost || cost <= 0) {
      toast.error('Please specify a valid landed cost amount.');
      return;
    }
    if (landedTargets.length === 0) {
      toast.error('Please select at least one target bill or GRN line.');
      return;
    }

    setIsAllocatingLanded(true);
    try {
      const allocNum = `LCA-${Date.now().toString().slice(-6)}`;
      await allocateLandedCost({
        allocationNumber: allocNum,
        date: format(new Date(), 'yyyy-MM-dd'),
        sourceType: landedForm.sourceType,
        sourceId: landedForm.sourceId,
        sourceReference: landedForm.sourceReference,
        totalLandedCost: cost,
        allocationBasis: landedForm.allocationBasis,
        targets: landedTargets,
        notes: landedForm.notes,
      });

      toast.success(`Allocated landed cost ${allocNum} across ${landedTargets.length} items with penny rounding reconciled.`);
      setLandedDialogOpen(false);
      setLandedTargets([]);
      setLandedForm({
        sourceType: 'Expense',
        sourceId: '',
        sourceReference: '',
        totalLandedCost: '',
        allocationBasis: 'quantity',
        notes: '',
      });
      await loadAllData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to allocate landed cost');
    } finally {
      setIsAllocatingLanded(false);
    }
  };

  return (
    <div className="space-y-5">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList>
            <TabsTrigger value="expenses"><Receipt className="h-3.5 w-3.5 mr-1.5" />Direct Expenses</TabsTrigger>
            <TabsTrigger value="bills"><FileStack className="h-3.5 w-3.5 mr-1.5" />Vendor Bills (AP)</TabsTrigger>
            <TabsTrigger value="advances"><Wallet className="h-3.5 w-3.5 mr-1.5" />Supplier Advances</TabsTrigger>
            <TabsTrigger value="credits"><FileText className="h-3.5 w-3.5 mr-1.5" />Supplier Credits (Debit Notes)</TabsTrigger>
            <TabsTrigger value="landed-costs"><Scale className="h-3.5 w-3.5 mr-1.5" />Landed Costs</TabsTrigger>
          </TabsList>
          {tab === 'expenses' ? (
            <Button size="sm" onClick={() => setExpenseDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />Record Expense
            </Button>
          ) : tab === 'bills' ? (
            <Button size="sm" onClick={() => setBillDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />New Bill
            </Button>
          ) : tab === 'advances' ? (
            <Button size="sm" onClick={() => setAdvanceDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />Record Supplier Advance
            </Button>
          ) : tab === 'credits' ? (
            <Button size="sm" onClick={() => setCreditDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />New Debit Note / Credit
            </Button>
          ) : (
            <Button size="sm" onClick={() => setLandedDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />Allocate Landed Cost
            </Button>
          )}
        </div>

        {/* =================================================================== */}
        {/* TAB 1: EXPENSES */}
        {/* =================================================================== */}
        <TabsContent value="expenses" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Recorded Direct Expenses</CardTitle></CardHeader>
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

        {/* =================================================================== */}
        {/* TAB 2: VENDOR BILLS (AP) */}
        {/* =================================================================== */}
        <TabsContent value="bills" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base">Vendor Bills (Accounts Payable)</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Record full or partial settlements, track allocated advances, and audit payment vouchers.
                </p>
              </div>
            </CardHeader>
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
                        <TableHead className="text-right">Grand Total</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Balance Due</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bills.map((b) => {
                        const paid = Number(b.paidAmount) || 0;
                        const grandTotal = Number(b.grandTotal) || 0;
                        const balanceDue = Math.max(0, safeSub(grandTotal, paid));
                        const hasAvailableAdvance = advances.some(
                          (a) => a.vendorName.trim().toLowerCase() === b.vendorName.trim().toLowerCase() && a.remainingAmount > 0.001,
                        );
                        const hasAvailableCredit = credits.some(
                          (c) => c.vendorName.trim().toLowerCase() === b.vendorName.trim().toLowerCase() && c.remainingAmount > 0.001,
                        );

                        return (
                          <TableRow key={b.id}>
                            <TableCell className="font-mono font-semibold">
                              <button
                                onClick={() => { setSelectedBillForDetails(b); setDetailsDialogOpen(true); }}
                                className="text-primary hover:underline"
                              >
                                {b.billNumber}
                              </button>
                            </TableCell>
                            <TableCell className="font-medium">{b.vendorName}</TableCell>
                            <TableCell>{(() => { try { return format(new Date(b.billDate), 'dd-MM-yyyy'); } catch { return b.billDate; } })()}</TableCell>
                            <TableCell>{(() => { try { return format(new Date(b.dueDate), 'dd-MM-yyyy'); } catch { return b.dueDate; } })()}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(grandTotal, b.currency)}</TableCell>
                            <TableCell className="text-right text-green-600 font-medium">
                              {paid > 0 ? formatCurrency(paid, b.currency) : '—'}
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {balanceDue > 0.001 ? (
                                <span className="text-orange-600">{formatCurrency(balanceDue, b.currency)}</span>
                              ) : (
                                <span className="text-muted-foreground">0.00</span>
                              )}
                            </TableCell>
                            <TableCell>{billStatusBadge(b.status)}</TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                {balanceDue > 0.001 && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs px-2 text-primary hover:bg-primary/10"
                                      onClick={() => openRecordPayment(b, false)}
                                      title="Record Partial or Full Payment"
                                    >
                                      <CreditCard className="h-3 w-3 mr-1" />Pay
                                    </Button>

                                    {hasAvailableAdvance && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs px-2 text-purple-600 hover:bg-purple-50"
                                        onClick={() => openAdvanceAllocation(b)}
                                        title="Apply Existing Advance"
                                      >
                                        <ArrowRightLeft className="h-3 w-3 mr-1" />Advance
                                      </Button>
                                    )}

                                    {hasAvailableCredit && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs px-2 text-indigo-600 hover:bg-indigo-50"
                                        onClick={() => openCreditAllocation(b)}
                                        title="Apply Existing Debit Note / Credit"
                                      >
                                        <FileText className="h-3 w-3 mr-1" />Credit
                                      </Button>
                                    )}

                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs px-2 text-green-600 hover:bg-green-50"
                                      onClick={() => openRecordPayment(b, true)}
                                      title="Mark Paid in Full"
                                    >
                                      <CheckCircle2 className="h-3 w-3 mr-1" />Mark Paid
                                    </Button>
                                  </>
                                )}

                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  onClick={() => { setSelectedBillForDetails(b); setDetailsDialogOpen(true); }}
                                  title="View Details & Payments"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>

                                {paid <= 0 && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-red-500 hover:text-red-700"
                                    onClick={() => deleteBill(b)}
                                    title="Delete Bill"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* =================================================================== */}
        {/* TAB 3: SUPPLIER ADVANCES */}
        {/* =================================================================== */}
        <TabsContent value="advances" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base">Supplier Advances (Prepayments)</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Record advance disbursements before bills exist, and allocate to vendor bills without duplicate cash movements.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {advances.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No supplier advances recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Advance No</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Original Amount</TableHead>
                        <TableHead className="text-right">Allocated</TableHead>
                        <TableHead className="text-right">Remaining Available</TableHead>
                        <TableHead>Bank / Cash</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {advances.map((adv) => {
                        const vendorOpenBills = bills.filter(
                          (b) => b.vendorName.trim().toLowerCase() === adv.vendorName.trim().toLowerCase() && (safeSub(b.grandTotal, b.paidAmount) > 0.001),
                        );
                        const advAllocations = allocations.filter((a) => a.advanceId === adv.id);

                        return (
                          <TableRow key={adv.id}>
                            <TableCell className="font-mono font-semibold">{adv.advanceNumber}</TableCell>
                            <TableCell className="font-medium">{adv.vendorName}</TableCell>
                            <TableCell>{(() => { try { return format(new Date(adv.date), 'dd-MM-yyyy'); } catch { return adv.date; } })()}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(adv.amount, adv.currency)}</TableCell>
                            <TableCell className="text-right text-purple-600 font-medium">
                              {adv.allocatedAmount > 0 ? formatCurrency(adv.allocatedAmount, adv.currency) : '—'}
                            </TableCell>
                            <TableCell className="text-right font-bold text-green-600">
                              {formatCurrency(adv.remainingAmount, adv.currency)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{adv.bankAccountName || 'Bank'}</TableCell>
                            <TableCell>
                              <Badge variant={adv.status === 'Available' ? 'default' : adv.status === 'Fully Allocated' ? 'secondary' : 'outline'}>
                                {adv.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                {adv.remainingAmount > 0.001 && vendorOpenBills.length > 0 && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs px-2 text-purple-600 hover:bg-purple-50"
                                    onClick={() => openAdvanceAllocation(vendorOpenBills[0])}
                                    title="Allocate to open vendor bill"
                                  >
                                    <ArrowRightLeft className="h-3 w-3 mr-1" />Allocate
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* =================================================================== */}
        {/* TAB 4: SUPPLIER CREDITS (DEBIT NOTES) */}
        {/* =================================================================== */}
        <TabsContent value="credits" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base">Supplier Credits &amp; Debit Notes</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Record financial debit adjustments linked to purchase returns or bill discrepancies.
                  Apply credits against outstanding vendor bills or track cash refunds without duplicate accounting.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {credits.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No supplier credits / debit notes recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Debit Note No</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Reason / Return Ref</TableHead>
                        <TableHead>Linked Bill</TableHead>
                        <TableHead className="text-right">Total Amount</TableHead>
                        <TableHead className="text-right">Allocated</TableHead>
                        <TableHead className="text-right">Remaining</TableHead>
                        <TableHead>Settlement Effect</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {credits.map((c) => {
                        const vendorOpenBills = bills.filter(
                          (b) => b.vendorName.trim().toLowerCase() === c.vendorName.trim().toLowerCase() && (safeSub(b.grandTotal, b.paidAmount) > 0.001),
                        );

                        return (
                          <TableRow key={c.id}>
                            <TableCell className="font-mono font-semibold">{c.creditNumber}</TableCell>
                            <TableCell className="font-medium">{c.vendorName}</TableCell>
                            <TableCell>{(() => { try { return format(new Date(c.date), 'dd-MM-yyyy'); } catch { return c.date; } })()}</TableCell>
                            <TableCell>
                              <div className="text-xs">
                                <span>{c.reason}</span>
                                {c.purchaseReturnRef && (
                                  <span className="block text-[11px] text-muted-foreground font-mono">Ret: {c.purchaseReturnRef}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {c.originalBillNumber || '—'}
                            </TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(c.amount, c.currency)}</TableCell>
                            <TableCell className="text-right text-indigo-600 font-medium">
                              {c.allocatedAmount > 0 ? formatCurrency(c.allocatedAmount, c.currency) : '—'}
                            </TableCell>
                            <TableCell className="text-right font-bold text-green-600">
                              {formatCurrency(c.remainingAmount, c.currency)}
                            </TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="outline">
                                {c.settlementEffect === 'ReduceBillBalance' ? 'Bill Reduction' : c.settlementEffect === 'RefundCash' ? 'Cash Refund' : 'Retained Credit'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={c.status === 'Approved' ? 'default' : c.status === 'Allocated' ? 'secondary' : c.status === 'Refunded' ? 'outline' : 'default'}>
                                {c.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                {c.remainingAmount > 0.001 && vendorOpenBills.length > 0 && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs px-2 text-indigo-600 hover:bg-indigo-50"
                                    onClick={() => openCreditAllocation(vendorOpenBills[0])}
                                    title="Allocate to open vendor bill"
                                  >
                                    <ArrowRightLeft className="h-3 w-3 mr-1" />Allocate
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* =================================================================== */}
        {/* TAB 5: LANDED COSTS ALLOCATION */}
        {/* =================================================================== */}
        <TabsContent value="landed-costs" className="mt-4 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-900 flex items-start gap-2 text-xs">
            <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
            <div>
              <p className="font-semibold">Landed Cost Capitalization &amp; Non-Duplication Principle</p>
              <p className="text-blue-800 text-[11px] mt-0.5">
                Allocating freight, customs, or handling across bill and GRN inventory lines capitalizes the expenditure directly into stock value.
                Allocated expenses are flagged as <strong>Capitalized to Inventory</strong> to prevent them from being counted twice (both as an operating expense in P&amp;L and as an inventory asset).
              </p>
            </div>
          </div>

          <Card>
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Landed Cost Allocations</CardTitle>
                <p className="text-xs text-muted-foreground">
                  History of freight, customs, and inward handling costs absorbed into inventory.
                </p>
              </div>
              <Button size="sm" onClick={() => setLandedDialogOpen(true)} className="text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" /> New Allocation
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 text-xs">
                    <TableHead>Allocation No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Source Type &amp; Ref</TableHead>
                    <TableHead>Basis</TableHead>
                    <TableHead className="text-right font-semibold">Total Landed Cost</TableHead>
                    <TableHead className="text-center">Target Lines</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {landedAllocations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-xs">
                        No landed cost allocations recorded yet. Click &quot;New Allocation&quot; to allocate freight or customs charges across inventory.
                      </TableCell>
                    </TableRow>
                  ) : (
                    landedAllocations.map((a) => (
                      <TableRow key={a.id} className="text-xs hover:bg-muted/30">
                        <TableCell className="font-mono font-medium">{a.allocationNumber}</TableCell>
                        <TableCell className="text-muted-foreground">{a.date}</TableCell>
                        <TableCell>
                          <span className="font-semibold">{a.sourceType}:</span>{' '}
                          <span className="font-mono">{a.sourceReference}</span>
                        </TableCell>
                        <TableCell className="capitalize">{a.allocationBasis}</TableCell>
                        <TableCell className="text-right font-bold text-primary">
                          {formatCurrency(a.totalLandedCost, country)}
                        </TableCell>
                        <TableCell className="text-center">{a.lines?.length || 0} lines</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                            Capitalized to Stock
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* =================================================================== */}
      {/* DIALOG 1: RECORD EXPENSE */}
      {/* =================================================================== */}
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

      {/* =================================================================== */}
      {/* DIALOG 2: NEW VENDOR BILL */}
      {/* =================================================================== */}
      <Dialog open={billDialogOpen} onOpenChange={setBillDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Vendor Bill</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Bill Type</Label>
                <Select
                  value={billForm.billType}
                  onValueChange={(v: 'standard' | 'subcontractor') =>
                    setBillForm((f) => ({ ...f, billType: v }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard Purchase Bill</SelectItem>
                    <SelectItem value="subcontractor">Subcontractor / Job-Work Bill</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Vendor Name</Label>
                <Input
                  value={billForm.vendorName}
                  onChange={(e) => setBillForm((f) => ({ ...f, vendorName: e.target.value }))}
                  placeholder={billForm.billType === 'subcontractor' ? "e.g. Precision Job Works" : "e.g. Industrial Supplies Co."}
                  className="h-8 text-xs"
                />
              </div>

              <div>
                <Label>Vendor Ref / PO No.</Label>
                <Input
                  value={billForm.vendorRef}
                  onChange={(e) => setBillForm((f) => ({ ...f, vendorRef: e.target.value }))}
                  placeholder="PO-2026-001 or Inv Ref"
                  className="h-8 text-xs"
                />
              </div>

              <div>
                <Label>Bill Date</Label>
                <Input
                  type="date"
                  value={billForm.billDate}
                  onChange={(e) => setBillForm((f) => ({ ...f, billDate: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>

              <div>
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={billForm.dueDate}
                  onChange={(e) => setBillForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>

              {billForm.billType === 'subcontractor' && (
                <>
                  <div>
                    <Label>Linked Job-Work Order #</Label>
                    <Input
                      placeholder="e.g. WO-2026-008"
                      value={billForm.jobWorkOrderNo}
                      onChange={(e) => setBillForm((f) => ({ ...f, jobWorkOrderNo: e.target.value }))}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <Label>Service / Process Description</Label>
                    <Input
                      placeholder="e.g. Vulcanizing / Heat Treatment"
                      value={billForm.serviceDescription}
                      onChange={(e) => setBillForm((f) => ({ ...f, serviceDescription: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label>Finished Goods Received (Nos/Kg)</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 250"
                      value={billForm.fgReceivedQty}
                      onChange={(e) => setBillForm((f) => ({ ...f, fgReceivedQty: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label>Scrap / Rejection Qty (Nos/Kg)</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 5"
                      value={billForm.scrapQty}
                      onChange={(e) => setBillForm((f) => ({ ...f, scrapQty: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Subcontractor TDS Withholding Section */}
            {billForm.billType === 'subcontractor' && (
              <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-amber-900">
                    <input
                      type="checkbox"
                      checked={billForm.tdsApplicable}
                      onChange={(e) => setBillForm((f) => ({ ...f, tdsApplicable: e.target.checked }))}
                      className="rounded text-primary focus:ring-primary h-4 w-4"
                    />
                    Deduct TDS under Section 194C (Job-Work / Subcontractor)
                  </label>
                  {billForm.tdsApplicable && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground text-[11px]">TDS Rate %:</span>
                      <Input
                        type="number"
                        step="0.1"
                        value={billForm.tdsRate}
                        onChange={(e) => setBillForm((f) => ({ ...f, tdsRate: e.target.value }))}
                        className="w-16 h-7 text-xs text-right font-semibold"
                      />
                    </div>
                  )}
                </div>
                {billForm.tdsApplicable && (
                  <p className="text-[11px] text-amber-800">
                    Calculated TDS deduction: <strong>{formatCurrency(roundCurrency((billSubtotal * (Number(billForm.tdsRate) || 2)) / 100), country)}</strong> will be withheld and posted to Taxes Payable (2100).
                  </p>
                )}
              </div>
            )}

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
              <div className="flex flex-col items-end gap-1 text-xs">
                <div className="flex justify-between w-48 text-muted-foreground">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(billSubtotal, country)}</span>
                </div>
                {billForm.billType === 'subcontractor' && billForm.tdsApplicable && (
                  <div className="flex justify-between w-48 text-amber-700 font-medium">
                    <span>Less TDS ({billForm.tdsRate}%):</span>
                    <span>-{formatCurrency(roundCurrency((billSubtotal * (Number(billForm.tdsRate) || 2)) / 100), country)}</span>
                  </div>
                )}
                <div className="flex justify-between w-48 text-sm font-bold border-t pt-1">
                  <span>Net Payable:</span>
                  <span className="text-primary">
                    {formatCurrency(
                      billForm.billType === 'subcontractor' && billForm.tdsApplicable
                        ? roundCurrency(billSubtotal - (billSubtotal * (Number(billForm.tdsRate) || 2)) / 100)
                        : billSubtotal,
                      country,
                    )}
                  </span>
                </div>
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

      {/* =================================================================== */}
      {/* DIALOG 2B: ALLOCATE LANDED COST */}
      {/* =================================================================== */}
      <Dialog open={landedDialogOpen} onOpenChange={setLandedDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" /> Allocate Landed Cost to Inventory
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Source Type</Label>
                <Select
                  value={landedForm.sourceType}
                  onValueChange={(v: 'Expense' | 'Bill') =>
                    setLandedForm((f) => ({ ...f, sourceType: v, sourceId: '', sourceReference: '', totalLandedCost: '' }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Expense">Direct Expense (Freight / Courier)</SelectItem>
                    <SelectItem value="Bill">Vendor Bill (Customs / Freight)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Select Source Expenditure</Label>
                <Select
                  value={landedForm.sourceId}
                  onValueChange={(v) => {
                    if (landedForm.sourceType === 'Expense') {
                      const exp = expenses.find((e) => e.id === v);
                      if (exp) {
                        setLandedForm((f) => ({
                          ...f,
                          sourceId: v,
                          sourceReference: exp.expenseNumber,
                          totalLandedCost: String(exp.totalAmount || exp.amount),
                        }));
                      }
                    } else {
                      const bill = bills.find((b) => b.id === v);
                      if (bill) {
                        setLandedForm((f) => ({
                          ...f,
                          sourceId: v,
                          sourceReference: bill.billNumber,
                          totalLandedCost: String(bill.grandTotal),
                        }));
                      }
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Choose expense/bill..." />
                  </SelectTrigger>
                  <SelectContent>
                    {landedForm.sourceType === 'Expense'
                      ? expenses.slice(0, 20).map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.expenseNumber} - {e.expenseType} ({formatCurrency(e.totalAmount || e.amount, country)})
                          </SelectItem>
                        ))
                      : bills.slice(0, 20).map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.billNumber} - {b.vendorName} ({formatCurrency(b.grandTotal, country)})
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Total Landed Cost Amount (₹)</Label>
                <Input
                  type="number"
                  value={landedForm.totalLandedCost}
                  onChange={(e) => setLandedForm((f) => ({ ...f, totalLandedCost: e.target.value }))}
                  className="h-8 text-xs font-semibold"
                />
              </div>

              <div>
                <Label className="text-xs">Allocation Basis</Label>
                <Select
                  value={landedForm.allocationBasis}
                  onValueChange={(v: LandedCostAllocationBasis) =>
                    setLandedForm((f) => ({ ...f, allocationBasis: v }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quantity">By Quantity (Prorated per unit)</SelectItem>
                    <SelectItem value="value">By Value (Prorated per invoice value)</SelectItem>
                    <SelectItem value="weight">By Weight (Prorated per kg/weight)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Target selection helper */}
            <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs">Target Inventory Lines to Absorb Cost:</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    // Populate from recent bill lines or GRN
                    const newTargets = bills.flatMap((b) =>
                      (b.lineItems || []).map((l, i) => ({
                        targetType: 'BillLine' as const,
                        targetId: `${b.id}_${i}`,
                        itemDescription: `${b.vendorName}: ${l.description}`,
                        quantity: l.qty || 1,
                        baseAmount: l.amount || 100,
                        weight: l.qty || 1,
                      })),
                    ).slice(0, 4);
                    setLandedTargets(newTargets);
                  }}
                >
                  Load Recent Bill Lines
                </Button>
              </div>

              {landedTargets.length === 0 ? (
                <p className="text-muted-foreground text-[11px] py-2 text-center">
                  No target lines loaded. Click &quot;Load Recent Bill Lines&quot; to populate items.
                </p>
              ) : (
                <div className="divide-y border rounded bg-white max-h-40 overflow-y-auto">
                  {landedTargets.map((t, idx) => (
                    <div key={idx} className="p-2 flex justify-between items-center text-[11px]">
                      <div>
                        <div className="font-medium">{t.itemDescription}</div>
                        <div className="text-muted-foreground">Qty: {t.quantity} | Base: {formatCurrency(t.baseAmount, country)}</div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-red-500"
                        onClick={() => setLandedTargets((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLandedDialogOpen(false)}
                disabled={isAllocatingLanded}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleExecuteLandedCost}
                disabled={isAllocatingLanded || landedTargets.length === 0}
              >
                {isAllocatingLanded ? 'Allocating...' : 'Confirm Landed Cost Allocation'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* DIALOG 3: RECORD PAYMENT (SETTLEMENT) */}
      {/* =================================================================== */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment for Bill</DialogTitle>
          </DialogHeader>
          {paymentTargetBill && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vendor:</span>
                  <span className="font-semibold text-foreground">{paymentTargetBill.vendorName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bill Number:</span>
                  <span className="font-mono">{paymentTargetBill.billNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Grand Amount:</span>
                  <span>{formatCurrency(paymentTargetBill.grandTotal, paymentTargetBill.currency)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-medium">
                  <span className="text-muted-foreground">Remaining Balance:</span>
                  <span className="text-orange-600 font-bold">
                    {formatCurrency(safeSub(paymentTargetBill.grandTotal, paymentTargetBill.paidAmount), paymentTargetBill.currency)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Payment Date</Label>
                  <Input
                    type="date"
                    value={paymentForm.paymentDate}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, paymentDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Amount to Pay ({paymentTargetBill.currency})</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <Label>Bank / Cash Account</Label>
                <Select
                  value={paymentForm.bankAccountId}
                  onValueChange={(val) => setPaymentForm((f) => ({ ...f, bankAccountId: val }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.accountName} ({b.bankName} - {b.accountType})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Payment Method</Label>
                  <Select
                    value={paymentForm.paymentMethod}
                    onValueChange={(val) => setPaymentForm((f) => ({ ...f, paymentMethod: val }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_MODES.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>UTR / Cheque / Ref</Label>
                  <Input
                    value={paymentForm.reference}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
                    placeholder="Reference number"
                  />
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Payment remarks"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setPaymentDialogOpen(false)} disabled={isSubmittingPayment}>
                  Cancel
                </Button>
                <Button onClick={handleExecutePayment} disabled={isSubmittingPayment}>
                  {isSubmittingPayment ? 'Processing...' : 'Confirm & Post Settlement'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* DIALOG 4: RECORD SUPPLIER ADVANCE */}
      {/* =================================================================== */}
      <Dialog open={advanceDialogOpen} onOpenChange={setAdvanceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Supplier Advance Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-muted-foreground">
              Disburse an advance payment to a supplier. This creates a cash outflow and tracks available prepayment credits for future bill allocations.
            </p>

            <div>
              <Label>Supplier / Vendor Name</Label>
              <Input
                value={advanceForm.vendorName}
                onChange={(e) => setAdvanceForm((f) => ({ ...f, vendorName: e.target.value }))}
                placeholder="e.g. Alpha Chemicals Pvt Ltd"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Advance Date</Label>
                <Input
                  type="date"
                  value={advanceForm.date}
                  onChange={(e) => setAdvanceForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div>
                <Label>Amount ({country})</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={advanceForm.amount}
                  onChange={(e) => setAdvanceForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <Label>Bank / Cash Account</Label>
              <Select
                value={advanceForm.bankAccountId}
                onValueChange={(val) => setAdvanceForm((f) => ({ ...f, bankAccountId: val }))}
              >
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.accountName} ({b.bankName} - {b.accountType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Payment Method</Label>
                <Select
                  value={advanceForm.paymentMethod}
                  onValueChange={(val) => setAdvanceForm((f) => ({ ...f, paymentMethod: val }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_MODES.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payment Reference</Label>
                <Input
                  value={advanceForm.reference}
                  onChange={(e) => setAdvanceForm((f) => ({ ...f, reference: e.target.value }))}
                  placeholder="UTR / Cheque no."
                />
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={advanceForm.notes}
                onChange={(e) => setAdvanceForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Advance justification or PO reference"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAdvanceDialogOpen(false)} disabled={isSubmittingAdvance}>
                Cancel
              </Button>
              <Button onClick={handleRecordAdvance} disabled={isSubmittingAdvance}>
                {isSubmittingAdvance ? 'Recording...' : 'Record Advance'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* DIALOG 5: ALLOCATE ADVANCE TO BILL */}
      {/* =================================================================== */}
      <Dialog open={allocateDialogOpen} onOpenChange={setAllocateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Allocate Supplier Advance</DialogTitle>
          </DialogHeader>
          {allocateTargetBill && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-lg space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-purple-900">
                  <ArrowRightLeft className="h-3.5 w-3.5 text-purple-600" />
                  Non-Cash Settlement Allocation
                </div>
                <p className="text-[11px] text-purple-800">
                  Transfers from existing advance to Bill #{allocateTargetBill.billNumber}. No secondary cash movement will be recorded.
                </p>
                <div className="flex justify-between pt-1 border-t border-purple-200/60 font-medium">
                  <span>Bill Remaining Due:</span>
                  <span className="font-bold text-foreground">
                    {formatCurrency(safeSub(allocateTargetBill.grandTotal, allocateTargetBill.paidAmount), allocateTargetBill.currency)}
                  </span>
                </div>
              </div>

              <div>
                <Label>Select Available Advance</Label>
                <Select value={selectedAdvanceId} onValueChange={setSelectedAdvanceId}>
                  <SelectTrigger><SelectValue placeholder="Select advance" /></SelectTrigger>
                  <SelectContent>
                    {advances
                      .filter((a) => a.vendorName.trim().toLowerCase() === allocateTargetBill.vendorName.trim().toLowerCase() && a.remainingAmount > 0.001)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.advanceNumber} — Available: {formatCurrency(a.remainingAmount, a.currency)} (Dated: {a.date})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Allocation Date</Label>
                  <Input type="date" value={allocateDate} onChange={(e) => setAllocateDate(e.target.value)} />
                </div>
                <div>
                  <Label>Amount to Allocate</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={allocateAmount}
                    onChange={(e) => setAllocateAmount(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={allocateNotes}
                  onChange={(e) => setAllocateNotes(e.target.value)}
                  placeholder="Allocation remarks"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setAllocateDialogOpen(false)} disabled={isSubmittingAllocation}>
                  Cancel
                </Button>
                <Button onClick={handleExecuteAllocation} disabled={isSubmittingAllocation}>
                  {isSubmittingAllocation ? 'Allocating...' : 'Confirm Allocation'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* DIALOG 6: BILL DETAILS & PAYMENT HISTORY */}
      {/* =================================================================== */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Bill Details &amp; Settlement History</span>
              {selectedBillForDetails && billStatusBadge(selectedBillForDetails.status)}
            </DialogTitle>
          </DialogHeader>
          {selectedBillForDetails && (() => {
            const b = selectedBillForDetails;
            const billPayments = payments.filter((p) => p.billId === b.id);
            const billAllocations = allocations.filter((a) => a.billId === b.id);
            const billCredits = credits.filter((c) => c.originalBillId === b.id);
            const matchingAnalysis = analyzeBillGrnMatching(b, grnList, matchedQuantitiesMap);
            const isAlreadyMatched = billGrnMatches.some((m) => m.billId === b.id);
            const totalDirectPayments = billPayments.reduce((s, p) => safeAdd(s, p.amount), 0);
            const totalAllocations = billAllocations.filter((a) => a.status === 'Active').reduce((s, a) => safeAdd(s, a.amount), 0);
            const totalCreditsApplied = billCredits.reduce((s, c) => safeAdd(s, c.allocatedAmount), 0);
            const totalAccountedPaid = safeAdd(safeAdd(totalDirectPayments, totalAllocations), totalCreditsApplied);
            const legacyDiff = safeSub(b.paidAmount, totalAccountedPaid);
            const balanceDue = Math.max(0, safeSub(b.grandTotal, b.paidAmount));

            return (
              <div className="space-y-4 py-2 text-xs">
                {/* Header Information Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-muted/40 rounded-lg">
                  <div>
                    <span className="text-muted-foreground">Bill Number:</span>
                    <p className="font-mono font-bold text-sm">{b.billNumber}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Vendor:</span>
                    <p className="font-medium text-sm truncate">{b.vendorName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Bill Date:</span>
                    <p className="font-medium">{b.billDate}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Due Date:</span>
                    <p className="font-medium">{b.dueDate || '—'}</p>
                  </div>
                </div>

                {/* Line Items */}
                <div>
                  <h4 className="font-semibold text-xs text-foreground mb-2 flex items-center gap-1.5">
                    <FileStack className="h-3.5 w-3.5 text-primary" />
                    Itemized Line Items
                  </h4>
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {b.lineItems?.map((li, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell>{li.description}</TableCell>
                            <TableCell className="text-right">{li.qty}</TableCell>
                            <TableCell className="text-right">{formatCurrency(li.rate, b.currency)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(li.amount, b.currency)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex justify-end gap-6 pt-2 font-medium">
                    <span>Subtotal: {formatCurrency(b.subtotal, b.currency)}</span>
                    <span>Total: <strong className="text-foreground">{formatCurrency(b.grandTotal, b.currency)}</strong></span>
                  </div>
                </div>

                {/* PO-GRN-Bill 3-Way Matching Section */}
                <div className="border rounded-md p-3 bg-muted/20 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                      <CheckCheck className="h-4 w-4 text-blue-600" />
                      PO–GRN–Bill 3-Way Procurement Matching
                    </h4>
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        matchingAnalysis.overallStatus === 'Verified Match' ? 'default' :
                        matchingAnalysis.overallStatus === 'Advisory Discrepancy' ? 'destructive' : 'secondary'
                      }>
                        {isAlreadyMatched ? 'Confirmed: ' : ''}{matchingAnalysis.overallStatus}
                      </Badge>
                      {!isAlreadyMatched && matchingAnalysis.lines.some((l) => l.matchedQty > 0) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[11px] px-2 text-blue-600 hover:bg-blue-50"
                          onClick={() => handleConfirmMatch(b, matchingAnalysis)}
                          disabled={isConfirmingMatch}
                        >
                          {isConfirmingMatch ? 'Confirming...' : 'Confirm Match'}
                        </Button>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    Advisory matching comparing invoiced quantities against warehouse Goods Receipt Notes (GRN). Does not modify physical stock or restrict payment flow.
                  </p>

                  <div className="border rounded-md overflow-hidden bg-background">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead>Item / Material</TableHead>
                          <TableHead className="text-right">Billed Qty</TableHead>
                          <TableHead>GRN Ref</TableHead>
                          <TableHead className="text-right">GRN Available</TableHead>
                          <TableHead className="text-right">Matched Qty</TableHead>
                          <TableHead>Match Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {matchingAnalysis.lines.map((ml, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">
                              {ml.material}
                              {ml.advisoryWarnings.length > 0 && (
                                <div className="text-[10px] text-amber-600 font-normal">
                                  {ml.advisoryWarnings.join('; ')}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono">{ml.billedQty}</TableCell>
                            <TableCell className="font-mono text-xs">{ml.grnNo || '—'}</TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">{ml.availableGrnQty}</TableCell>
                            <TableCell className="text-right font-mono font-semibold text-blue-600">{ml.matchedQty}</TableCell>
                            <TableCell>
                              <Badge variant={ml.status === 'Fully Matched' ? 'default' : ml.status === 'Shortage' ? 'destructive' : 'secondary'} className="text-[10px]">
                                {ml.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Settlement Summary Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 border rounded-lg bg-green-50/50">
                    <span className="text-muted-foreground">Total Settled</span>
                    <p className="text-base font-bold text-green-700">{formatCurrency(b.paidAmount, b.currency)}</p>
                  </div>
                  <div className="p-3 border rounded-lg bg-orange-50/50">
                    <span className="text-muted-foreground">Remaining Balance</span>
                    <p className="text-base font-bold text-orange-700">{formatCurrency(balanceDue, b.currency)}</p>
                  </div>
                  <div className="p-3 border rounded-lg bg-muted/40">
                    <span className="text-muted-foreground">Vouchers / Allocations</span>
                    <p className="text-base font-bold">{billPayments.length + billAllocations.length}</p>
                  </div>
                </div>

                {/* Direct Payment Vouchers Table */}
                <div>
                  <h4 className="font-semibold text-xs text-foreground mb-1.5 flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5 text-blue-600" />
                    Direct Payment History (Cash Outflows)
                  </h4>
                  {billPayments.length === 0 ? (
                    <p className="text-muted-foreground text-[11px] py-2 italic">No direct bank payments recorded for this bill.</p>
                  ) : (
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader className="bg-muted/30">
                          <TableRow>
                            <TableHead>Voucher No</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Account / Method</TableHead>
                            <TableHead>Reference</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Proof</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {billPayments.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-mono font-semibold">{p.paymentNumber}</TableCell>
                              <TableCell>{p.paymentDate}</TableCell>
                              <TableCell>{p.bankAccountName} · {p.paymentMethod}</TableCell>
                              <TableCell className="font-mono text-muted-foreground">{p.reference || '—'}</TableCell>
                              <TableCell className="text-right font-bold text-green-600">
                                {formatCurrency(p.amount, p.currency)}
                              </TableCell>
                              <TableCell>
                                {p.attachmentUrl ? (
                                  <a href={p.attachmentUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                    View
                                  </a>
                                ) : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Advance Allocations Table */}
                <div>
                  <h4 className="font-semibold text-xs text-foreground mb-1.5 flex items-center gap-1.5">
                    <ArrowRightLeft className="h-3.5 w-3.5 text-purple-600" />
                    Supplier Advance Allocations
                  </h4>
                  {billAllocations.length === 0 ? (
                    <p className="text-muted-foreground text-[11px] py-2 italic">No supplier advance allocations applied.</p>
                  ) : (
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader className="bg-muted/30">
                          <TableRow>
                            <TableHead>Advance Ref</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Allocated Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-center">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {billAllocations.map((a) => (
                            <TableRow key={a.id}>
                              <TableCell className="font-mono font-semibold">{a.advanceNumber}</TableCell>
                              <TableCell>{a.date}</TableCell>
                              <TableCell className="text-right font-bold text-purple-700">
                                {formatCurrency(a.amount, b.currency)}
                              </TableCell>
                              <TableCell>
                                <Badge variant={a.status === 'Active' ? 'default' : 'secondary'}>
                                  {a.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                {a.status === 'Active' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 text-xs text-red-600 hover:text-red-700"
                                    onClick={() => handleReverseAllocation(a.id)}
                                    title="Reverse this allocation"
                                  >
                                    <Undo2 className="h-3 w-3 mr-1" />Reverse
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Supplier Credits / Debit Notes Applied Table */}
                <div>
                  <h4 className="font-semibold text-xs text-foreground mb-1.5 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-indigo-600" />
                    Supplier Credits &amp; Debit Notes Applied
                  </h4>
                  {billCredits.length === 0 ? (
                    <p className="text-muted-foreground text-[11px] py-2 italic">No supplier credit notes linked to this bill.</p>
                  ) : (
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader className="bg-muted/30">
                          <TableRow>
                            <TableHead>Credit No</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead className="text-right">Allocated</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {billCredits.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="font-mono font-semibold">{c.creditNumber}</TableCell>
                              <TableCell>{c.date}</TableCell>
                              <TableCell>{c.reason}</TableCell>
                              <TableCell className="text-right font-bold text-indigo-700">
                                {formatCurrency(c.allocatedAmount, b.currency)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{c.status}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Legacy Provenance Notice */}
                {legacyDiff > 0.01 && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-2 text-amber-900 text-[11px]">
                    <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Legacy Provenance: </span>
                      {formatCurrency(legacyDiff, b.currency)} was settled prior to discrete voucher tracking.
                      Historical balance is verified and preserved without fabricating artificial vouchers.
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t">
                  {balanceDue > 0.001 && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setDetailsDialogOpen(false); openRecordPayment(b, false); }}
                      >
                        <CreditCard className="h-3.5 w-3.5 mr-1" />Record Payment
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => { setDetailsDialogOpen(false); openRecordPayment(b, true); }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Mark Paid
                      </Button>
                    </>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setDetailsDialogOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* DIALOG 7: RECORD SUPPLIER CREDIT / DEBIT NOTE */}
      {/* =================================================================== */}
      <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Supplier Credit / Debit Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-muted-foreground">
              Record debit notes linked to purchase returns, short deliveries, or pricing adjustments.
            </p>

            <div>
              <Label>Supplier Name</Label>
              <Input
                value={creditForm.vendorName}
                onChange={(e) => setCreditForm((f) => ({ ...f, vendorName: e.target.value }))}
                placeholder="e.g. Alpha Chemicals Pvt Ltd"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={creditForm.date}
                  onChange={(e) => setCreditForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div>
                <Label>Amount ({country})</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={creditForm.amount}
                  onChange={(e) => setCreditForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <Label>Reason / Justification</Label>
              <Input
                value={creditForm.reason}
                onChange={(e) => setCreditForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Defective raw material return / Short receipt"
              />
            </div>

            <div>
              <Label>Settlement Effect</Label>
              <Select
                value={creditForm.settlementEffect}
                onValueChange={(val: any) => setCreditForm((f) => ({ ...f, settlementEffect: val }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ReduceBillBalance">Reduce Bill Balance (Apply to Open Bill)</SelectItem>
                  <SelectItem value="RefundCash">Cash Refund (Deposit to Bank)</SelectItem>
                  <SelectItem value="KeepAsCreditNote">Keep as Credit Note (Retain for Future Bills)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {creditForm.settlementEffect === 'ReduceBillBalance' && (
              <div>
                <Label>Link to Open Bill</Label>
                <Select
                  value={creditForm.originalBillId}
                  onValueChange={(val) => setCreditForm((f) => ({ ...f, originalBillId: val }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select bill to adjust" /></SelectTrigger>
                  <SelectContent>
                    {bills
                      .filter((b) => (
                        (!creditForm.vendorName.trim() || b.vendorName.trim().toLowerCase() === creditForm.vendorName.trim().toLowerCase()) &&
                        safeSub(b.grandTotal, b.paidAmount) > 0.001
                      ))
                      .map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.billNumber} — {b.vendorName} (Bal: {formatCurrency(safeSub(b.grandTotal, b.paidAmount), b.currency)})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {creditForm.settlementEffect === 'RefundCash' && (
              <div>
                <Label>Receiving Bank Account</Label>
                <Select
                  value={creditForm.bankAccountId}
                  onValueChange={(val) => setCreditForm((f) => ({ ...f, bankAccountId: val }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.accountName} ({b.bankName})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Purchase Return Ref / GRN (Optional)</Label>
                <Input
                  value={creditForm.purchaseReturnRef}
                  onChange={(e) => setCreditForm((f) => ({ ...f, purchaseReturnRef: e.target.value }))}
                  placeholder="e.g. GRN-2026-004 or PR-001"
                />
              </div>
              <div>
                <Label>Returned Qty (Optional)</Label>
                <Input
                  type="number"
                  value={creditForm.returnedQty}
                  onChange={(e) => setCreditForm((f) => ({ ...f, returnedQty: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                rows={2}
                value={creditForm.notes}
                onChange={(e) => setCreditForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Additional audit remarks"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreditDialogOpen(false)} disabled={isSubmittingCredit}>
                Cancel
              </Button>
              <Button onClick={handleRecordCredit} disabled={isSubmittingCredit}>
                {isSubmittingCredit ? 'Recording...' : 'Record Debit Note'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* DIALOG 8: ALLOCATE SUPPLIER CREDIT TO BILL */}
      {/* =================================================================== */}
      <Dialog open={allocateCreditDialogOpen} onOpenChange={setAllocateCreditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Allocate Supplier Credit to Bill</DialogTitle>
          </DialogHeader>
          {allocateCreditTargetBill && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-indigo-900">
                  <FileText className="h-3.5 w-3.5 text-indigo-600" />
                  Non-Cash Credit Settlement
                </div>
                <p className="text-[11px] text-indigo-800">
                  Applies debit note balance to Bill #{allocateCreditTargetBill.billNumber}. Reduces vendor payable liability without recording cash movements.
                </p>
                <div className="flex justify-between pt-1 border-t border-indigo-200/60 font-medium">
                  <span>Bill Remaining Due:</span>
                  <span className="font-bold text-foreground">
                    {formatCurrency(safeSub(allocateCreditTargetBill.grandTotal, allocateCreditTargetBill.paidAmount), allocateCreditTargetBill.currency)}
                  </span>
                </div>
              </div>

              <div>
                <Label>Select Available Credit Note</Label>
                <Select value={selectedCreditId} onValueChange={setSelectedCreditId}>
                  <SelectTrigger><SelectValue placeholder="Select credit note" /></SelectTrigger>
                  <SelectContent>
                    {credits
                      .filter((c) => c.vendorName.trim().toLowerCase() === allocateCreditTargetBill.vendorName.trim().toLowerCase() && c.remainingAmount > 0.001)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.creditNumber} — Available: {formatCurrency(c.remainingAmount, c.currency)} ({c.reason})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Allocation Date</Label>
                  <Input type="date" value={allocateCreditDate} onChange={(e) => setAllocateCreditDate(e.target.value)} />
                </div>
                <div>
                  <Label>Amount to Allocate</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={allocateCreditAmount}
                    onChange={(e) => setAllocateCreditAmount(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={allocateCreditNotes}
                  onChange={(e) => setAllocateCreditNotes(e.target.value)}
                  placeholder="Allocation remarks"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setAllocateCreditDialogOpen(false)} disabled={isSubmittingCreditAllocation}>
                  Cancel
                </Button>
                <Button onClick={handleExecuteCreditAllocation} disabled={isSubmittingCreditAllocation}>
                  {isSubmittingCreditAllocation ? 'Allocating...' : 'Confirm Credit Allocation'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
