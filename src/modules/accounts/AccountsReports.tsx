import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  TrendingUp, TrendingDown, Wallet, Scale, Clock, BookOpen, Download,
  Filter, Search, AlertTriangle, Info, ExternalLink, FileSpreadsheet, FileText,
  Calculator, CheckCircle2, Boxes, Factory, PieChart, Layers, FileCode, Play,
  Eye,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { getAllRecords } from '@/services/firebase';
import { useOrgSettings } from '@/context/OrgSettingsContext';
import { formatCurrency } from '@/lib/countryConfig';
import { format, subMonths, startOfMonth } from 'date-fns';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import {
  calculateReceivablesAgeing,
  calculatePayablesAgeing,
  generateSupplierStatement,
  generateCustomerStatement,
  safeAdd,
  safeSub,
} from '@/services/financeCalculations';
import { generateTrialBalance } from '@/services/ledgerTrialBalanceService';
import {
  calculateInventoryValuation,
  calculateProductionCosting,
  calculateProductProfitability,
} from '@/services/manufacturingCostService';
import { generateCashFlowForecast } from '@/services/cashFlowForecastService';
import { exportVouchersToTallyXml } from '@/services/tallyExportService';
import type {
  ChartOfAccount, Bill, BillPayment, SupplierAdvance, AdvanceAllocation,
  AgeingItem, AgeingBucket, PartyStatement, TrialBalanceSummary, TrialBalanceRow,
  InventoryValuationReport, ProductionCostingReport, ProductProfitabilityReport,
  CashFlowForecastReport, UnifiedVoucher,
} from '@/types/accounts';

function lastNMonths(n: number) {
  const months: { key: string; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = startOfMonth(subMonths(new Date(), i));
    months.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMM yy') });
  }
  return months;
}

export default function AccountsReports() {
  const { country } = useOrgSettings();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [bankTxns, setBankTxns] = useState<any[]>([]);
  const [coa, setCoa] = useState<ChartOfAccount[]>([]);
  const [payments, setPayments] = useState<BillPayment[]>([]);
  const [advances, setAdvances] = useState<SupplierAdvance[]>([]);
  const [allocations, setAllocations] = useState<AdvanceAllocation[]>([]);
  const [rawMaterials, setRawMaterials] = useState<any[]>([]);
  const [wipStock, setWipStock] = useState<any[]>([]);
  const [fgStock, setFgStock] = useState<any[]>([]);
  const [grnRecords, setGrnRecords] = useState<any[]>([]);
  const [productionJobs, setProductionJobs] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [journals, setJournals] = useState<UnifiedVoucher[]>([]);
  const [loading, setLoading] = useState(true);

  // ---- Ageing tab state ----
  const [ageingReportType, setAgeingReportType] = useState<'ar' | 'ap'>('ar');
  const [asOfDate, setAsOfDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [ageingSearch, setAgeingSearch] = useState<string>('');
  const [ageingBucketFilter, setAgeingBucketFilter] = useState<string>('all');

  // ---- Party Statement tab state ----
  const [stmtPartyType, setStmtPartyType] = useState<'Supplier' | 'Customer'>('Supplier');
  const [selectedParty, setSelectedParty] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>(format(startOfMonth(subMonths(new Date(), 2)), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  // ---- Trial Balance tab state ----
  const [tbFromDate, setTbFromDate] = useState<string>(format(startOfMonth(subMonths(new Date(), 2)), 'yyyy-MM-dd'));
  const [tbToDate, setTbToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [trialBalance, setTrialBalance] = useState<TrialBalanceSummary | null>(null);
  const [tbLoading, setTbLoading] = useState<boolean>(false);
  const [tbFilterNonZero, setTbFilterNonZero] = useState<boolean>(false);

  // ---- Phase 3 Tabs State ----
  const [valCategoryFilter, setValCategoryFilter] = useState<string>('all');
  const [valSearch, setValSearch] = useState<string>('');
  const [costingSearch, setCostingSearch] = useState<string>('');
  const [selectedCostingJob, setSelectedCostingJob] = useState<any | null>(null);
  const [profitSearch, setProfitSearch] = useState<string>('');
  const [cashFlowMode, setCashFlowMode] = useState<'actual' | 'forecast'>('actual');

  // ---- Tally Export Dialog State ----
  const [tallyDialogOpen, setTallyDialogOpen] = useState<boolean>(false);
  const [tallyFrom, setTallyFrom] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [tallyTo, setTallyTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [isExportingTally, setIsExportingTally] = useState<boolean>(false);

  useEffect(() => {
    loadAllRecords();
  }, []);

  const loadTrialBalance = async () => {
    setTbLoading(true);
    try {
      const summary = await generateTrialBalance({ fromDate: tbFromDate, toDate: tbToDate });
      setTrialBalance(summary);
    } catch (err) {
      console.error('Error loading trial balance:', err);
    } finally {
      setTbLoading(false);
    }
  };

  useEffect(() => {
    loadTrialBalance();
  }, [tbFromDate, tbToDate]);

  const loadAllRecords = async () => {
    try {
      const [inv, exp, bl, ba, bt, ca, pay, adv, alloc, rm, wip, fg, grn, jobs, wo, jnl] = await Promise.all([
        getAllRecords('sales/invoices'),
        getAllRecords('accounts/expenses'),
        getAllRecords('accounts/bills'),
        getAllRecords('accounts/bankAccounts'),
        getAllRecords('accounts/bankTransactions'),
        getAllRecords('accounts/chartOfAccounts'),
        getAllRecords('accounts/billPayments'),
        getAllRecords('accounts/supplierAdvances'),
        getAllRecords('accounts/advanceAllocations'),
        getAllRecords('stores/raw'),
        getAllRecords('stores/wip'),
        getAllRecords('stores/fg'),
        getAllRecords('stores/grn'),
        getAllRecords('production/jobs'),
        getAllRecords('production/workOrders'),
        getAllRecords('accounts/journals'),
      ]);
      setInvoices(inv);
      setExpenses(exp);
      setBills(bl as Bill[]);
      setBankAccounts(ba);
      setBankTxns(bt);
      setCoa(ca as ChartOfAccount[]);
      setPayments(pay as BillPayment[]);
      setAdvances(adv as SupplierAdvance[]);
      setAllocations(alloc as AdvanceAllocation[]);
      setRawMaterials(rm);
      setWipStock(wip);
      setFgStock(fg);
      setGrnRecords(grn);
      setProductionJobs(jobs);
      setWorkOrders(wo);
      setJournals((jnl as UnifiedVoucher[]) || []);
    } finally {
      setLoading(false);
    }
  };

  const months = lastNMonths(6);

  // -------------------------------------------------------------------------
  // PHASE 3 ENGINES: INVENTORY VALUATION, COSTING, PROFITABILITY, FORECAST
  // -------------------------------------------------------------------------
  const inventoryValuation: InventoryValuationReport = calculateInventoryValuation({
    rawMaterials,
    wipItems: wipStock,
    fgItems: fgStock,
    bills,
    grns: grnRecords,
    glAccounts: coa,
    asOfDate,
  });

  const productionCosting: ProductionCostingReport = calculateProductionCosting({
    jobs: productionJobs,
    workOrders,
    bills,
    asOfDate,
  });

  const productProfitability: ProductProfitabilityReport = calculateProductProfitability({
    invoices,
    jobs: productionCosting.jobs,
    fgStock,
    asOfDate,
  });

  const cashFlowForecast: CashFlowForecastReport = generateCashFlowForecast({
    asOfDate,
    horizonWeeks: 8,
    invoices,
    bills,
    bankAccounts,
    bankTxns,
    purchaseOrders: grnRecords.map((g) => ({
      id: g.id,
      poNumber: g.poNumber || `PO-${g.id}`,
      supplier: g.supplier,
      orderDate: g.date,
      expectedDate: g.date,
      totalAmount: (Number(g.qty) || 0) * (Number(g.rate) || 0),
      status: g.status,
    })),
  });

  // -------------------------------------------------------------------------
  // 1. P&L CALCULATIONS (Zero Double-Counting of Capitalized Landed Costs)
  // -------------------------------------------------------------------------
  const totalIncome = invoices.filter((i) => i.status !== 'cancelled').reduce((s, i) => s + (i.grandTotal || 0), 0);
  // Exclude capitalized landed cost expenses from operating expenses
  const totalExpense = expenses
    .filter((e) => !e.capitalizedToInventory)
    .reduce((s, e) => s + (e.totalAmount || e.amount || 0), 0);
  const netProfit = totalIncome - totalExpense;

  const plByMonth = months.map(({ key, label }) => {
    const income = invoices
      .filter((i) => i.status !== 'cancelled' && (i.invoiceDate || '').startsWith(key))
      .reduce((s, i) => s + (i.grandTotal || 0), 0);
    const expense = expenses
      .filter((e) => !e.capitalizedToInventory && (e.date || '').startsWith(key))
      .reduce((s, e) => s + (e.totalAmount || e.amount || 0), 0);
    return { month: label, Income: Math.round(income), Expense: Math.round(expense) };
  });

  // -------------------------------------------------------------------------
  // 2. CASH FLOW CALCULATIONS
  // -------------------------------------------------------------------------
  const cashIn = bankTxns.filter((t) => t.type === 'Deposit').reduce((s, t) => s + (t.amount || 0), 0);
  const cashOut = bankTxns.filter((t) => t.type === 'Withdrawal').reduce((s, t) => s + (t.amount || 0), 0);
  const netCashFlow = cashIn - cashOut;

  const cashFlowByMonth = months.map(({ key, label }) => {
    const inflow = bankTxns.filter((t) => t.type === 'Deposit' && (t.date || '').startsWith(key)).reduce((s, t) => s + (t.amount || 0), 0);
    const outflow = bankTxns.filter((t) => t.type === 'Withdrawal' && (t.date || '').startsWith(key)).reduce((s, t) => s + (t.amount || 0), 0);
    return { month: label, 'Cash In': Math.round(inflow), 'Cash Out': Math.round(outflow) };
  });

  // -------------------------------------------------------------------------
  // 3. BALANCE SHEET CALCULATIONS (Accounting Alignment: Inventory & Fixed Assets)
  // -------------------------------------------------------------------------
  const cashAndBank = bankAccounts.reduce((s, b) => {
    const txns = bankTxns.filter((t) => t.bankAccountId === b.id);
    const bal = txns.reduce((acc, t) => acc + (t.type === 'Deposit' ? t.amount : -t.amount), b.openingBalance || 0);
    return s + bal;
  }, 0);
  const receivables = invoices
    .filter((i) => i.status !== 'cancelled' && i.paymentStatus !== 'Paid')
    .reduce((s, i) => s + ((i.grandTotal || 0) - (i.paidAmount || 0)), 0);
  const payables = bills
    .filter((b) => b.status !== 'Paid')
    .reduce((s, b) => s + ((b.grandTotal || 0) - (b.paidAmount || 0)), 0);

  // Inventory Asset from physical stock valuation or GL 1400
  const inventoryAssetVal = inventoryValuation.totalValuation > 0
    ? inventoryValuation.totalValuation
    : (coa.find((a) => a.code === '1400')?.openingBalance || 0);

  // Fixed Assets carrying value (Cost less Accumulated Depreciation)
  const fixedAssetAccount = coa.find((a) => a.code === '1500');
  const accumDepAccount = coa.find((a) => a.code === '1510');
  const fixedAssetsNet = Math.max(
    0,
    (fixedAssetAccount?.openingBalance || 0) - (accumDepAccount?.openingBalance || 0),
  );

  const otherAssets = coa
    .filter((a) => a.type === 'Asset' && a.subType !== 'Bank' && a.code !== '1400' && a.code !== '1500' && a.code !== '1510')
    .reduce((s, a) => s + (a.openingBalance || 0), 0);
  const otherLiabilities = coa.filter((a) => a.type === 'Liability').reduce((s, a) => s + (a.openingBalance || 0), 0);

  const totalAssets = cashAndBank + receivables + inventoryAssetVal + fixedAssetsNet + otherAssets;
  const totalLiabilities = payables + otherLiabilities;
  const totalEquity = totalAssets - totalLiabilities;

  // -------------------------------------------------------------------------
  // 4. AGEING REPORT ENGINE
  // -------------------------------------------------------------------------
  const ageingData = ageingReportType === 'ar'
    ? calculateReceivablesAgeing(invoices, asOfDate)
    : calculatePayablesAgeing(bills, payments, allocations, asOfDate);

  const filteredAgeingItems = ageingData.items.filter((item) => {
    if (ageingSearch) {
      const q = ageingSearch.toLowerCase();
      const matchParty = item.partyName.toLowerCase().includes(q);
      const matchDoc = item.documentNumber.toLowerCase().includes(q);
      if (!matchParty && !matchDoc) return false;
    }
    if (ageingBucketFilter !== 'all' && item.bucket !== ageingBucketFilter) {
      return false;
    }
    return true;
  });

  const exportAgeingCSV = () => {
    const headers = ['Document No', 'Party Name', 'Type', 'Doc Date', 'Due Date', 'Billed/Grand Total', 'Paid Amount', 'Outstanding Balance', 'Overdue Days', 'Ageing Bucket', 'Status'];
    const rows = filteredAgeingItems.map((i) => [
      `"${i.documentNumber}"`,
      `"${i.partyName.replace(/"/g, '""')}"`,
      i.partyType,
      i.documentDate,
      i.dueDate || 'Unassigned',
      i.grandTotal,
      i.paidAmount,
      i.outstandingAmount,
      i.overdueDays,
      `"${i.bucket}"`,
      i.status,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `${ageingReportType.toUpperCase()}_Ageing_AsOf_${asOfDate}.csv`);
  };

  // -------------------------------------------------------------------------
  // 5. PARTY STATEMENTS ENGINE
  // -------------------------------------------------------------------------
  // Unique suppliers & customers list
  const uniqueSuppliers = Array.from(new Set(bills.map((b) => b.vendorName).concat(advances.map((a) => a.vendorName))))
    .filter(Boolean)
    .sort();
  const uniqueCustomers = Array.from(new Set(invoices.map((i) => i.customerName)))
    .filter(Boolean)
    .sort();

  // Active party list for dropdown
  const partyList = stmtPartyType === 'Supplier' ? uniqueSuppliers : uniqueCustomers;

  // Compute Statement if party is selected
  let currentStatement: PartyStatement | null = null;
  if (selectedParty) {
    if (stmtPartyType === 'Supplier') {
      currentStatement = generateSupplierStatement({
        vendorName: selectedParty,
        fromDate,
        toDate,
        currency: country,
        bills,
        payments,
        advances,
        allocations,
      });
    } else {
      currentStatement = generateCustomerStatement({
        customerName: selectedParty,
        fromDate,
        toDate,
        currency: country,
        invoices,
      });
    }
  }

  const exportStatementCSV = () => {
    if (!currentStatement) return;
    const headers = ['Date', 'Type', 'Reference', 'Description', 'Debit', 'Credit', 'Running Balance'];
    const rows = currentStatement.lines.map((l) => [
      l.date,
      l.type,
      `"${l.reference}"`,
      `"${l.description.replace(/"/g, '""')}"`,
      l.debit,
      l.credit,
      l.runningBalance,
    ]);

    const meta = [
      `"Statement of Account - ${currentStatement.partyName} (${currentStatement.partyType})"`,
      `"Period: ${currentStatement.fromDate} to ${currentStatement.toDate}"`,
      `"Opening Balance: ${currentStatement.openingBalance}"`,
      `"Closing Balance: ${currentStatement.closingBalance}"`,
      '',
    ];

    const csvContent = [...meta, headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `Statement_${currentStatement.partyName.replace(/[^a-z0-9]/gi, '_')}_${fromDate}_to_${toDate}.csv`);
  };

  const exportStatementPDF = () => {
    if (!currentStatement) return;
    const doc = new jsPDF();

    // Title & Meta
    doc.setFontSize(16);
    doc.text('STATEMENT OF ACCOUNT', 14, 18);
    doc.setFontSize(10);
    doc.text(`Party: ${currentStatement.partyName} (${currentStatement.partyType})`, 14, 26);
    doc.text(`Period: ${currentStatement.fromDate} to ${currentStatement.toDate}`, 14, 32);
    doc.text(`Opening Balance: ${formatCurrency(currentStatement.openingBalance, currentStatement.currency)}`, 14, 38);
    doc.text(`Closing Balance: ${formatCurrency(currentStatement.closingBalance, currentStatement.currency)}`, 140, 38);

    const tableRows = currentStatement.lines.map((l) => [
      l.date,
      l.type,
      l.reference,
      l.description,
      l.debit > 0 ? l.debit.toFixed(2) : '—',
      l.credit > 0 ? l.credit.toFixed(2) : '—',
      l.runningBalance.toFixed(2),
    ]);

    (doc as any).autoTable({
      startY: 44,
      head: [['Date', 'Type', 'Reference', 'Description', 'Debit', 'Credit', 'Balance']],
      body: tableRows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
    });

    doc.save(`Statement_${currentStatement.partyName.replace(/[^a-z0-9]/gi, '_')}.pdf`);
  };

  const exportTrialBalanceCSV = () => {
    if (!trialBalance) return;
    const headers = [
      'Account Code',
      'Account Name',
      'Account Type',
      'Opening Debit',
      'Opening Credit',
      'Period Debit',
      'Period Credit',
      'Closing Debit',
      'Closing Credit',
    ];
    const rows = trialBalance.rows.map((r) => [
      `"${r.accountCode}"`,
      `"${r.accountName.replace(/"/g, '""')}"`,
      `"${r.accountType}"`,
      r.openingDebit.toFixed(2),
      r.openingCredit.toFixed(2),
      r.periodDebit.toFixed(2),
      r.periodCredit.toFixed(2),
      r.closingDebit.toFixed(2),
      r.closingCredit.toFixed(2),
    ]);
    const meta = [
      `"Trial Balance Report"`,
      `"Period: ${trialBalance.fromDate} to ${trialBalance.toDate}"`,
      `"Balanced: ${trialBalance.isBalanced ? 'YES' : 'NO (Discrepancy: ' + trialBalance.unexplainedDifference.toFixed(2) + ')'}"`,
      '',
    ];
    const totalRow = [
      '"TOTAL"',
      '""',
      '""',
      trialBalance.totalOpeningDebit.toFixed(2),
      trialBalance.totalOpeningCredit.toFixed(2),
      trialBalance.totalPeriodDebit.toFixed(2),
      trialBalance.totalPeriodCredit.toFixed(2),
      trialBalance.totalClosingDebit.toFixed(2),
      trialBalance.totalClosingCredit.toFixed(2),
    ];
    const csvContent = [...meta, headers.join(','), ...rows.map((r) => r.join(',')), totalRow.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `Trial_Balance_${trialBalance.fromDate}_to_${trialBalance.toDate}.csv`);
  };

  const exportTrialBalancePDF = () => {
    if (!trialBalance) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text('TRIAL BALANCE', 14, 18);
    doc.setFontSize(10);
    doc.text(`Period: ${trialBalance.fromDate} to ${trialBalance.toDate}`, 14, 26);
    doc.text(`Status: ${trialBalance.isBalanced ? 'BALANCED' : `UNEXPLAINED DISCREPANCY: ${formatCurrency(trialBalance.unexplainedDifference, country)}`}`, 14, 32);

    const tableRows = trialBalance.rows.map((r) => [
      r.accountCode,
      r.accountName,
      r.accountType,
      r.openingDebit > 0 ? r.openingDebit.toFixed(2) : '—',
      r.openingCredit > 0 ? r.openingCredit.toFixed(2) : '—',
      r.periodDebit > 0 ? r.periodDebit.toFixed(2) : '—',
      r.periodCredit > 0 ? r.periodCredit.toFixed(2) : '—',
      r.closingDebit > 0 ? r.closingDebit.toFixed(2) : '—',
      r.closingCredit > 0 ? r.closingCredit.toFixed(2) : '—',
    ]);

    tableRows.push([
      'TOTAL',
      '',
      '',
      trialBalance.totalOpeningDebit.toFixed(2),
      trialBalance.totalOpeningCredit.toFixed(2),
      trialBalance.totalPeriodDebit.toFixed(2),
      trialBalance.totalPeriodCredit.toFixed(2),
      trialBalance.totalClosingDebit.toFixed(2),
      trialBalance.totalClosingCredit.toFixed(2),
    ]);

    (doc as any).autoTable({
      startY: 38,
      head: [['Code', 'Account Name', 'Type', 'Op Dr', 'Op Cr', 'Period Dr', 'Period Cr', 'Close Dr', 'Close Cr']],
      body: tableRows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [44, 62, 80] },
    });

    doc.save(`Trial_Balance_${trialBalance.fromDate}_to_${trialBalance.toDate}.pdf`);
  };

  const exportValuationCSV = () => {
    const headers = ['Category', 'Item Code', 'Item Name', 'Batch/Stage', 'Quantity', 'UoM', 'Unit Cost', 'Total Value', 'Cost Source', 'Exception'];
    const rows = inventoryValuation.items.map((i) => [
      `"${i.category}"`,
      `"${i.itemCode}"`,
      `"${i.itemName.replace(/"/g, '""')}"`,
      `"${i.batchNumber || i.stage || i.location || ''}"`,
      i.quantity,
      `"${i.uom}"`,
      i.unitCost.toFixed(2),
      i.totalValue.toFixed(2),
      `"${i.costSource}"`,
      `"${i.hasCostException ? (i.exceptionReason || 'Missing Cost') : 'Verified'}"`,
    ]);
    const meta = [
      `"Inventory Valuation Report"`,
      `"As of Date: ${inventoryValuation.asOfDate}"`,
      `"Raw Materials: ${inventoryValuation.rawMaterialsTotal.toFixed(2)}"`,
      `"Work in Progress: ${inventoryValuation.wipTotal.toFixed(2)}"`,
      `"Finished Goods: ${inventoryValuation.finishedGoodsTotal.toFixed(2)}"`,
      `"Total Valuation: ${inventoryValuation.totalValuation.toFixed(2)}"`,
      `"GL Account 1400: ${inventoryValuation.glInventoryBalance.toFixed(2)}"`,
      `"Unreconciled Variance: ${inventoryValuation.unreconciledVariance.toFixed(2)}"`,
      '',
    ];
    const csvContent = [...meta, headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `Inventory_Valuation_${inventoryValuation.asOfDate}.csv`);
  };

  const exportValuationPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text('INVENTORY VALUATION REPORT', 14, 18);
    doc.setFontSize(10);
    doc.text(`As of Date: ${inventoryValuation.asOfDate}`, 14, 25);
    doc.text(`Total Valuation: ${formatCurrency(inventoryValuation.totalValuation, country)} (RM: ${formatCurrency(inventoryValuation.rawMaterialsTotal, country)}, WIP: ${formatCurrency(inventoryValuation.wipTotal, country)}, FG: ${formatCurrency(inventoryValuation.finishedGoodsTotal, country)})`, 14, 31);
    doc.text(`GL 1400 Inventory: ${formatCurrency(inventoryValuation.glInventoryBalance, country)} | Variance: ${formatCurrency(inventoryValuation.unreconciledVariance, country)}`, 14, 37);

    const tableRows = inventoryValuation.items.map((i) => [
      i.category,
      i.itemCode,
      i.itemName,
      i.batchNumber || i.stage || '',
      `${i.quantity} ${i.uom}`,
      formatCurrency(i.unitCost, country),
      formatCurrency(i.totalValue, country),
      i.costSource,
      i.hasCostException ? 'Exception' : 'OK',
    ]);

    (doc as any).autoTable({
      startY: 42,
      head: [['Category', 'Code', 'Name', 'Batch/Stage', 'Qty', 'Unit Cost', 'Total Value', 'Source', 'Status']],
      body: tableRows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [44, 62, 80] },
    });

    doc.save(`Inventory_Valuation_${inventoryValuation.asOfDate}.pdf`);
  };

  const handleTallyExport = async () => {
    setIsExportingTally(true);
    try {
      const eligibleVouchers = journals.filter((j) => {
        if (!j.date) return false;
        return j.date >= tallyFrom && j.date <= tallyTo;
      });
      if (eligibleVouchers.length === 0) {
        toast.error('No vouchers found in the selected date range.');
        return;
      }
      await exportVouchersToTallyXml({
        vouchers: eligibleVouchers,
        fromDate: tallyFrom,
        toDate: tallyTo,
        voucherTypes: ['Sales', 'Purchase', 'Payment', 'Receipt', 'Journal'],
      });
      toast.success(`Exported ${eligibleVouchers.length} vouchers to Tally XML! Import via Gateway of Tally > Import Data > Vouchers.`);
      setTallyDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to export Tally XML');
    } finally {
      setIsExportingTally(false);
    }
  };

  return (
    <div className="space-y-5">
      <Tabs defaultValue="pl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-wrap">
          <TabsList className="flex flex-wrap gap-1 w-fit max-w-full h-auto p-1 bg-muted/70">
            <TabsTrigger value="pl"><TrendingUp className="h-3.5 w-3.5 mr-1.5" />Profit &amp; Loss</TabsTrigger>
            <TabsTrigger value="cashflow"><Wallet className="h-3.5 w-3.5 mr-1.5" />Cash Flow</TabsTrigger>
            <TabsTrigger value="balance"><Scale className="h-3.5 w-3.5 mr-1.5" />Balance Sheet</TabsTrigger>
            <TabsTrigger value="valuation"><Boxes className="h-3.5 w-3.5 mr-1.5" />Inventory Valuation</TabsTrigger>
            <TabsTrigger value="costing"><Factory className="h-3.5 w-3.5 mr-1.5" />Production Costing</TabsTrigger>
            <TabsTrigger value="profitability"><PieChart className="h-3.5 w-3.5 mr-1.5" />Profitability</TabsTrigger>
            <TabsTrigger value="ageing"><Clock className="h-3.5 w-3.5 mr-1.5" />AR &amp; AP Ageing</TabsTrigger>
            <TabsTrigger value="statements"><BookOpen className="h-3.5 w-3.5 mr-1.5" />Party Statements</TabsTrigger>
            <TabsTrigger value="trialbalance"><Calculator className="h-3.5 w-3.5 mr-1.5" />Trial Balance</TabsTrigger>
          </TabsList>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setTallyDialogOpen(true)}
            className="text-xs border-primary/30 text-primary hover:bg-primary/5 font-semibold"
          >
            <FileCode className="h-3.5 w-3.5 mr-1.5" /> Export to Tally XML
          </Button>
        </div>

        {/* ---- TAB 1: P&L ---- */}
        <TabsContent value="pl" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-green-600" />Total Income</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalIncome, country)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3.5 w-3.5 text-red-600" />Total Expenses</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(totalExpense, country)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground">Net Profit</p>
              <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(netProfit, country)}</p>
            </CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm">Income vs Expenses (Last 6 Months)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={plByMonth}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: number) => formatCurrency(v, country)} />
                  <Legend />
                  <Bar dataKey="Income" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Expense" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- TAB 2: Cash Flow & Forecast ---- */}
        <TabsContent value="cashflow" className="mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
              <Button
                size="sm"
                variant={cashFlowMode === 'actual' ? 'default' : 'ghost'}
                onClick={() => setCashFlowMode('actual')}
                className="text-xs h-7"
              >
                Historical Cash Flow
              </Button>
              <Button
                size="sm"
                variant={cashFlowMode === 'forecast' ? 'default' : 'ghost'}
                onClick={() => setCashFlowMode('forecast')}
                className="text-xs h-7"
              >
                Manufacturing Cash-Flow Forecast (8-Week)
              </Button>
            </div>
            {cashFlowMode === 'forecast' && (
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-800 border-amber-200">
                Prospective Projections · Zero Billed PO Duplication
              </Badge>
            )}
          </div>

          {cashFlowMode === 'actual' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card><CardContent className="pt-5 pb-4">
                  <p className="text-xs text-muted-foreground">Cash In</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(cashIn, country)}</p>
                </CardContent></Card>
                <Card><CardContent className="pt-5 pb-4">
                  <p className="text-xs text-muted-foreground">Cash Out</p>
                  <p className="text-2xl font-bold text-red-600">{formatCurrency(cashOut, country)}</p>
                </CardContent></Card>
                <Card><CardContent className="pt-5 pb-4">
                  <p className="text-xs text-muted-foreground">Net Cash Flow</p>
                  <p className={`text-2xl font-bold ${netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(netCashFlow, country)}</p>
                </CardContent></Card>
              </div>
              <Card>
                <CardHeader><CardTitle className="text-sm">Cash In vs Cash Out (Last 6 Months)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={cashFlowByMonth}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip formatter={(v: number) => formatCurrency(v, country)} />
                      <Legend />
                      <Bar dataKey="Cash In" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Cash Out" fill="#f97316" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Card className="border shadow-sm"><CardContent className="pt-5 pb-4">
                  <p className="text-xs text-muted-foreground">Starting Cash &amp; Bank</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(cashFlowForecast.currentCashBalance, country)}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Live verified balance</p>
                </CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="pt-5 pb-4">
                  <p className="text-xs text-green-700 font-medium">Projected Inflows (AR)</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(cashFlowForecast.totalProjectedInflow, country)}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Open sales invoices by due date</p>
                </CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="pt-5 pb-4">
                  <p className="text-xs text-orange-700 font-medium">Projected Outflows (AP + POs)</p>
                  <p className="text-2xl font-bold text-orange-600 mt-1">{formatCurrency(cashFlowForecast.totalProjectedOutflow, country)}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Payables &amp; unbilled commitments</p>
                </CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="pt-5 pb-4">
                  <p className="text-xs text-muted-foreground font-medium">Net Projected Change</p>
                  <p className={`text-2xl font-bold mt-1 ${cashFlowForecast.netProjectedChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(cashFlowForecast.netProjectedChange, country)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Over 8-week horizon</p>
                </CardContent></Card>
              </div>

              <Card className="border shadow-sm">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-semibold">Rolling Weekly Liquidity Buckets</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Prospective weekly schedule factoring invoice due dates, vendor bills, unbilled purchase orders, and factory overheads.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 text-xs">
                        <TableHead>Week Bucket</TableHead>
                        <TableHead className="text-right">Opening Cash</TableHead>
                        <TableHead className="text-right text-green-700">Inflows (AR)</TableHead>
                        <TableHead className="text-right text-orange-700">Bills (AP)</TableHead>
                        <TableHead className="text-right text-amber-700">Unbilled POs</TableHead>
                        <TableHead className="text-right text-muted-foreground">Overheads</TableHead>
                        <TableHead className="text-right font-semibold">Net Flow</TableHead>
                        <TableHead className="text-right font-bold">Closing Cash</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cashFlowForecast.buckets.map((b) => (
                        <TableRow key={b.bucketKey} className="text-xs hover:bg-muted/30">
                          <TableCell className="font-semibold">{b.label}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(b.openingCash, country)}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">+{formatCurrency(b.receivablesInflow, country)}</TableCell>
                          <TableCell className="text-right font-mono text-orange-600">-{formatCurrency(b.payablesOutflow, country)}</TableCell>
                          <TableCell className="text-right font-mono text-amber-700">-{formatCurrency(b.unbilledPoCommitments, country)}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">-{formatCurrency(b.overheadsOutflow, country)}</TableCell>
                          <TableCell className={`text-right font-mono font-semibold ${b.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(b.netCashFlow, country)}
                          </TableCell>
                          <TableCell className={`text-right font-mono font-bold ${b.closingCash >= 50000 ? 'text-green-700' : 'text-red-700'}`}>
                            {formatCurrency(b.closingCash, country)}
                          </TableCell>
                          <TableCell className="text-center">
                            {b.isDeficit ? (
                              <Badge variant="destructive" className="text-[10px]">Cushion Alert</Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-green-100 text-green-800 text-[10px]">Healthy</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ---- TAB 3: Balance Sheet ---- */}
        <TabsContent value="balance" className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            Summary view combining live cash/AR/AP with Inventory valuation (RM+WIP+FG), Fixed Assets net of depreciation, and Chart of Accounts. Equity is shown as Assets − Liabilities.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-700">Assets</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Cash &amp; Bank</span><span>{formatCurrency(cashAndBank, country)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Accounts Receivable</span><span>{formatCurrency(receivables, country)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Inventory (RM+WIP+FG)</span><span className="text-primary font-medium">{formatCurrency(inventoryAssetVal, country)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Fixed Assets (Net of Dep)</span><span>{formatCurrency(fixedAssetsNet, country)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Other Assets</span><span>{formatCurrency(otherAssets, country)}</span></div>
                <div className="flex justify-between font-bold border-t pt-1.5 mt-1.5"><span>Total Assets</span><span>{formatCurrency(totalAssets, country)}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-red-700">Liabilities</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Accounts Payable</span><span>{formatCurrency(payables, country)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Other Liabilities</span><span>{formatCurrency(otherLiabilities, country)}</span></div>
                <div className="flex justify-between font-bold border-t pt-1.5 mt-1.5"><span>Total Liabilities</span><span>{formatCurrency(totalLiabilities, country)}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-purple-700">Equity</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Net Equity (plug)</span><span>{formatCurrency(totalEquity, country)}</span></div>
                <div className="flex justify-between font-bold border-t pt-1.5 mt-1.5"><span>Total Equity</span><span>{formatCurrency(totalEquity, country)}</span></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---- TAB 4: AR & AP AGEING REPORT ---- */}
        <TabsContent value="ageing" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3 flex-wrap gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Detailed Ageing Report
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Overdue analysis classified into 5 standard buckets + unassigned items as of the selected calculation date.
                </p>
              </div>

              {/* Sub-toggle AR vs AP */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg text-xs">
                  <button
                    onClick={() => setAgeingReportType('ar')}
                    className={`px-3 py-1.5 rounded-md transition-colors ${ageingReportType === 'ar' ? 'bg-white font-semibold text-primary shadow-xs' : 'text-muted-foreground'}`}
                  >
                    Receivables (AR)
                  </button>
                  <button
                    onClick={() => setAgeingReportType('ap')}
                    className={`px-3 py-1.5 rounded-md transition-colors ${ageingReportType === 'ap' ? 'bg-white font-semibold text-primary shadow-xs' : 'text-muted-foreground'}`}
                  >
                    Payables (AP)
                  </button>
                </div>

                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={exportAgeingCSV}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Filter Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 bg-muted/30 rounded-lg text-xs">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Calculation As-of Date</label>
                  <Input
                    type="date"
                    value={asOfDate}
                    onChange={(e) => setAsOfDate(e.target.value)}
                    className="h-8 text-xs bg-white"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Search Party / Doc #</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search..."
                      value={ageingSearch}
                      onChange={(e) => setAgeingSearch(e.target.value)}
                      className="pl-8 h-8 text-xs bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Bucket Filter</label>
                  <Select value={ageingBucketFilter} onValueChange={setAgeingBucketFilter}>
                    <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Buckets</SelectItem>
                      <SelectItem value="current">Not Yet Due</SelectItem>
                      <SelectItem value="1-30">1–30 Days Overdue</SelectItem>
                      <SelectItem value="31-60">31–60 Days Overdue</SelectItem>
                      <SelectItem value="61-90">61–90 Days Overdue</SelectItem>
                      <SelectItem value="90+">&gt;90 Days Overdue</SelectItem>
                      <SelectItem value="no-due-date">No Due Date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() => { setAsOfDate(format(new Date(), 'yyyy-MM-dd')); setAgeingSearch(''); setAgeingBucketFilter('all'); }}
                  >
                    Reset Filters
                  </Button>
                </div>
              </div>

              {/* Bucket KPI Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <div className="p-3 rounded-lg border bg-muted/20">
                  <span className="text-muted-foreground block truncate">Total Outstanding</span>
                  <p className="text-base font-bold text-foreground mt-0.5">
                    {formatCurrency(ageingData.summary.totalOutstanding, country)}
                  </p>
                  <span className="text-[10px] text-muted-foreground">{ageingData.summary.count} items</span>
                </div>
                <div className="p-3 rounded-lg border bg-green-50/60">
                  <span className="text-muted-foreground block truncate">Not Yet Due</span>
                  <p className="text-base font-bold text-green-700 mt-0.5">
                    {formatCurrency(ageingData.summary.current, country)}
                  </p>
                </div>
                <div className="p-3 rounded-lg border bg-amber-50/60">
                  <span className="text-muted-foreground block truncate">1–30 Days</span>
                  <p className="text-base font-bold text-amber-700 mt-0.5">
                    {formatCurrency(ageingData.summary.days1_30, country)}
                  </p>
                </div>
                <div className="p-3 rounded-lg border bg-orange-50/60">
                  <span className="text-muted-foreground block truncate">31–60 Days</span>
                  <p className="text-base font-bold text-orange-700 mt-0.5">
                    {formatCurrency(ageingData.summary.days31_60, country)}
                  </p>
                </div>
                <div className="p-3 rounded-lg border bg-red-50/60">
                  <span className="text-muted-foreground block truncate">61–90 Days</span>
                  <p className="text-base font-bold text-red-600 mt-0.5">
                    {formatCurrency(ageingData.summary.days61_90, country)}
                  </p>
                </div>
                <div className="p-3 rounded-lg border bg-red-100/60">
                  <span className="text-muted-foreground block truncate">&gt;90 Days Overdue</span>
                  <p className="text-base font-bold text-red-800 mt-0.5">
                    {formatCurrency(ageingData.summary.days90Plus, country)}
                  </p>
                </div>
              </div>

              {/* Notice for Items Without Due Date */}
              {ageingData.summary.noDueDate > 0 && (
                <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-md flex items-center justify-between text-xs text-amber-900">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>
                      <strong>Missing Due Dates: </strong>
                      {formatCurrency(ageingData.summary.noDueDate, country)} outstanding has no due date assigned.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px] bg-white border-amber-300"
                    onClick={() => setAgeingBucketFilter('no-due-date')}
                  >
                    View Unassigned
                  </Button>
                </div>
              )}

              {/* Ageing Table */}
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/40 text-xs">
                    <TableRow>
                      <TableHead>Document #</TableHead>
                      <TableHead>{ageingReportType === 'ar' ? 'Customer' : 'Supplier'}</TableHead>
                      <TableHead>Doc Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead className="text-right">Paid to Date</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead>Overdue Days</TableHead>
                      <TableHead>Bucket</TableHead>
                      <TableHead className="text-center">Link</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {filteredAgeingItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          No outstanding items found for the selected criteria.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAgeingItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono font-semibold">{item.documentNumber}</TableCell>
                          <TableCell className="font-medium max-w-[180px] truncate" title={item.partyName}>
                            {item.partyName}
                          </TableCell>
                          <TableCell>{item.documentDate}</TableCell>
                          <TableCell>
                            {item.dueDate ? item.dueDate : <span className="text-muted-foreground italic text-[11px]">Unassigned</span>}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(item.grandTotal, item.currency)}
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            {item.paidAmount > 0 ? formatCurrency(item.paidAmount, item.currency) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-bold text-orange-600">
                            {formatCurrency(item.outstandingAmount, item.currency)}
                          </TableCell>
                          <TableCell>
                            {item.bucket === 'no-due-date' ? (
                              <span className="text-muted-foreground">—</span>
                            ) : item.overdueDays <= 0 ? (
                              <span className="text-green-700">0d</span>
                            ) : (
                              <span className="text-red-600 font-semibold">{item.overdueDays}d</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                item.bucket === 'current'
                                  ? 'text-green-700 bg-green-50 border-green-200'
                                  : item.bucket === 'no-due-date'
                                  ? 'text-muted-foreground'
                                  : 'text-red-700 bg-red-50 border-red-200'
                              }`}
                            >
                              {item.bucket === 'current'
                                ? 'Not Yet Due'
                                : item.bucket === 'no-due-date'
                                ? 'No Due Date'
                                : `${item.bucket} days`}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button asChild size="icon" variant="ghost" className="h-6 w-6">
                              <Link to={item.sourcePath} title="Open source document">
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- TAB 5: PARTY STATEMENTS ---- */}
        <TabsContent value="statements" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3 flex-wrap gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Supplier &amp; Customer Statement of Account
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Complete ledger statement with opening balances, document debits/credits, non-duplicating advance tracking, and running balance.
                </p>
              </div>

              {/* Sub-toggle: Supplier vs Customer */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg text-xs">
                  <button
                    onClick={() => { setStmtPartyType('Supplier'); setSelectedParty(''); }}
                    className={`px-3 py-1.5 rounded-md transition-colors ${stmtPartyType === 'Supplier' ? 'bg-white font-semibold text-primary shadow-xs' : 'text-muted-foreground'}`}
                  >
                    Supplier Ledger (AP)
                  </button>
                  <button
                    onClick={() => { setStmtPartyType('Customer'); setSelectedParty(''); }}
                    className={`px-3 py-1.5 rounded-md transition-colors ${stmtPartyType === 'Customer' ? 'bg-white font-semibold text-primary shadow-xs' : 'text-muted-foreground'}`}
                  >
                    Customer Ledger (AR)
                  </button>
                </div>

                {currentStatement && (
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={exportStatementCSV}>
                      <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />CSV
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={exportStatementPDF}>
                      <FileText className="h-3.5 w-3.5 mr-1" />PDF
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Parameters Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 bg-muted/30 rounded-lg text-xs">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                    Select {stmtPartyType}
                  </label>
                  <Select value={selectedParty} onValueChange={setSelectedParty}>
                    <SelectTrigger className="h-8 text-xs bg-white">
                      <SelectValue placeholder={`Choose ${stmtPartyType.toLowerCase()}...`} />
                    </SelectTrigger>
                    <SelectContent>
                      {partyList.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">From Date</label>
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="h-8 text-xs bg-white"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">To Date</label>
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="h-8 text-xs bg-white"
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    size="sm"
                    className="h-8 text-xs w-full"
                    disabled={!selectedParty}
                  >
                    Generate Statement
                  </Button>
                </div>
              </div>

              {/* Statement Output View */}
              {!selectedParty ? (
                <div className="py-12 text-center text-muted-foreground text-xs">
                  Please select a {stmtPartyType.toLowerCase()} above to view their financial statement of account.
                </div>
              ) : currentStatement ? (
                <div className="space-y-4">
                  {/* Summary Metric Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 border rounded-lg bg-muted/20">
                      <span className="text-muted-foreground">Opening Balance</span>
                      <p className="text-base font-bold text-foreground mt-0.5">
                        {formatCurrency(currentStatement.openingBalance, currentStatement.currency)}
                      </p>
                      <span className="text-[10px] text-muted-foreground">as of {currentStatement.fromDate}</span>
                    </div>

                    <div className="p-3 border rounded-lg bg-blue-50/50">
                      <span className="text-muted-foreground">Total Incurred / Billed</span>
                      <p className="text-base font-bold text-blue-700 mt-0.5">
                        {formatCurrency(
                          stmtPartyType === 'Supplier' ? currentStatement.totalCredit : currentStatement.totalDebit,
                          currentStatement.currency,
                        )}
                      </p>
                    </div>

                    <div className="p-3 border rounded-lg bg-green-50/50">
                      <span className="text-muted-foreground">Total Paid / Settled</span>
                      <p className="text-base font-bold text-green-700 mt-0.5">
                        {formatCurrency(
                          stmtPartyType === 'Supplier' ? currentStatement.totalDebit : currentStatement.totalCredit,
                          currentStatement.currency,
                        )}
                      </p>
                    </div>

                    <div className="p-3 border rounded-lg bg-purple-50/60">
                      <span className="text-muted-foreground">Closing Balance</span>
                      <p className="text-base font-bold text-purple-800 mt-0.5">
                        {formatCurrency(currentStatement.closingBalance, currentStatement.currency)}
                      </p>
                      <span className="text-[10px] text-muted-foreground">as of {currentStatement.toDate}</span>
                    </div>
                  </div>

                  {/* Informational Notes */}
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground p-2 bg-muted/30 rounded-md">
                    <Info className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>
                      {stmtPartyType === 'Supplier'
                        ? 'Positive balance indicates Accounts Payable owed to supplier. Advances reduce payable balance upon payment.'
                        : 'Positive balance indicates Accounts Receivable collectible from customer.'}
                    </span>
                  </div>

                  {/* Historical Incomplete Caveat */}
                  {currentStatement.hasIncompleteHistory && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-2 text-amber-900 text-[11px]">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">Historical Provenance Notice: </span>
                        Some historical records prior to discrete payment voucher tracking reflect direct document settlements.
                        Running balance is reconciled accurately to historical totals.
                      </div>
                    </div>
                  )}

                  {/* Ledger Table */}
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/40 text-xs">
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Debit</TableHead>
                          <TableHead className="text-right">Credit</TableHead>
                          <TableHead className="text-right font-bold">Running Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="text-xs">
                        {/* Opening Balance Row */}
                        <TableRow className="bg-muted/20 font-semibold">
                          <TableCell>{currentStatement.fromDate}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">Opening</Badge></TableCell>
                          <TableCell>—</TableCell>
                          <TableCell>Opening Balance as of {currentStatement.fromDate}</TableCell>
                          <TableCell className="text-right">—</TableCell>
                          <TableCell className="text-right">—</TableCell>
                          <TableCell className="text-right font-bold">
                            {formatCurrency(currentStatement.openingBalance, currentStatement.currency)}
                          </TableCell>
                        </TableRow>

                        {currentStatement.lines.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                              No financial transactions recorded within this period.
                            </TableCell>
                          </TableRow>
                        ) : (
                          currentStatement.lines.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell>{l.date}</TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${
                                    l.type === 'Payment' || l.type === 'Receipt'
                                      ? 'text-green-700 bg-green-50 border-green-200'
                                      : l.type === 'Advance'
                                      ? 'text-purple-700 bg-purple-50 border-purple-200'
                                      : l.type === 'Allocation'
                                      ? 'text-muted-foreground bg-muted/40'
                                      : 'text-blue-700 bg-blue-50 border-blue-200'
                                  }`}
                                >
                                  {l.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono">{l.reference}</TableCell>
                              <TableCell className="max-w-[240px] truncate" title={l.description}>
                                {l.description}
                                {l.isHistoricalEstimated && (
                                  <span className="ml-1 text-[10px] text-amber-600 font-mono">[legacy]</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {l.debit > 0 ? formatCurrency(l.debit, currentStatement.currency) : '—'}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {l.credit > 0 ? formatCurrency(l.credit, currentStatement.currency) : '—'}
                              </TableCell>
                              <TableCell className="text-right font-bold">
                                {formatCurrency(l.runningBalance, currentStatement.currency)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}

                        {/* Closing Balance Row */}
                        <TableRow className="bg-muted/40 font-bold border-t-2">
                          <TableCell>{currentStatement.toDate}</TableCell>
                          <TableCell><Badge variant="secondary" className="text-[10px]">Closing</Badge></TableCell>
                          <TableCell>—</TableCell>
                          <TableCell>Closing Balance as of {currentStatement.toDate}</TableCell>
                          <TableCell className="text-right text-blue-700">
                            {formatCurrency(currentStatement.totalDebit, currentStatement.currency)}
                          </TableCell>
                          <TableCell className="text-right text-green-700">
                            {formatCurrency(currentStatement.totalCredit, currentStatement.currency)}
                          </TableCell>
                          <TableCell className="text-right text-purple-900 text-sm">
                            {formatCurrency(currentStatement.closingBalance, currentStatement.currency)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- TAB 6: Trial Balance ---- */}
        <TabsContent value="trialbalance" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3 flex-wrap gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-primary" />
                  Trial Balance &amp; General Ledger Summary
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Full multi-column trial balance showing Opening, Period Movements, and Closing balances for all GL accounts.
                  Reports unexplained differences honestly without balancing plugs.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5"
                  onClick={exportTrialBalanceCSV}
                  disabled={!trialBalance || trialBalance.rows.length === 0}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />Export CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5"
                  onClick={exportTrialBalancePDF}
                  disabled={!trialBalance || trialBalance.rows.length === 0}
                >
                  <FileText className="h-3.5 w-3.5" />Export PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Date Filters & Controls */}
              <div className="flex items-center justify-between flex-wrap gap-3 p-3 bg-muted/30 rounded-lg border">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">From:</span>
                    <Input
                      type="date"
                      value={tbFromDate}
                      onChange={(e) => setTbFromDate(e.target.value)}
                      className="h-8 text-xs w-36"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">To:</span>
                    <Input
                      type="date"
                      value={tbToDate}
                      onChange={(e) => setTbToDate(e.target.value)}
                      className="h-8 text-xs w-36"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant={tbFilterNonZero ? 'secondary' : 'outline'}
                    className="h-8 text-xs"
                    onClick={() => setTbFilterNonZero(!tbFilterNonZero)}
                  >
                    {tbFilterNonZero ? 'Showing Active Accounts' : 'Show All Accounts'}
                  </Button>
                </div>

                {trialBalance && (
                  <div className="flex items-center gap-2">
                    {trialBalance.isBalanced ? (
                      <Badge variant="default" className="bg-green-600 text-white gap-1 py-1 px-2.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Balanced (Dr = Cr)
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1 py-1 px-2.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Discrepancy: {formatCurrency(trialBalance.unexplainedDifference, country)}
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Unexplained Discrepancy Alert */}
              {trialBalance && !trialBalance.isBalanced && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-900 text-xs">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Unexplained Trial Balance Discrepancy Detected</p>
                    <p className="mt-0.5">
                      Total Closing Debits ({formatCurrency(trialBalance.totalClosingDebit, country)}) do not equal Total Closing Credits ({formatCurrency(trialBalance.totalClosingCredit, country)}).
                      Difference: <strong>{formatCurrency(trialBalance.unexplainedDifference, country)}</strong>.
                      This system does not insert balancing plugs or artificial balancing lines. Review posted vouchers in Manual Journals to audit unbalanced entries.
                    </p>
                  </div>
                </div>
              )}

              {/* Table */}
              {tbLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Calculating Trial Balance...</p>
              ) : !trialBalance || trialBalance.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No Chart of Accounts found to generate Trial Balance.</p>
              ) : (() => {
                const displayedRows = tbFilterNonZero
                  ? trialBalance.rows.filter(
                      (r) =>
                        r.openingDebit > 0 ||
                        r.openingCredit > 0 ||
                        r.periodDebit > 0 ||
                        r.periodCredit > 0 ||
                        r.closingDebit > 0 ||
                        r.closingCredit > 0,
                    )
                  : trialBalance.rows;

                return (
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/40 text-xs">
                        <TableRow>
                          <TableHead rowSpan={2} className="w-20">Code</TableHead>
                          <TableHead rowSpan={2}>Account Name</TableHead>
                          <TableHead rowSpan={2} className="w-24">Type</TableHead>
                          <TableHead colSpan={2} className="text-center border-l border-r bg-muted/60">Opening Balance</TableHead>
                          <TableHead colSpan={2} className="text-center border-r bg-muted/60">Period Movements</TableHead>
                          <TableHead colSpan={2} className="text-center bg-muted/60">Closing Balance</TableHead>
                        </TableRow>
                        <TableRow>
                          <TableHead className="text-right border-l text-xs">Dr</TableHead>
                          <TableHead className="text-right border-r text-xs">Cr</TableHead>
                          <TableHead className="text-right text-xs">Dr</TableHead>
                          <TableHead className="text-right border-r text-xs">Cr</TableHead>
                          <TableHead className="text-right text-xs">Dr</TableHead>
                          <TableHead className="text-right text-xs">Cr</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="text-xs">
                        {displayedRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center py-6 text-muted-foreground">
                              No active accounts with balances in this period.
                            </TableCell>
                          </TableRow>
                        ) : (
                          displayedRows.map((r) => (
                            <TableRow key={r.accountCode}>
                              <TableCell className="font-mono font-semibold">{r.accountCode}</TableCell>
                              <TableCell className="font-medium">{r.accountName}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px]">{r.accountType}</Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono border-l">
                                {r.openingDebit > 0 ? formatCurrency(r.openingDebit, country) : '—'}
                              </TableCell>
                              <TableCell className="text-right font-mono border-r">
                                {r.openingCredit > 0 ? formatCurrency(r.openingCredit, country) : '—'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-blue-700">
                                {r.periodDebit > 0 ? formatCurrency(r.periodDebit, country) : '—'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-green-700 border-r">
                                {r.periodCredit > 0 ? formatCurrency(r.periodCredit, country) : '—'}
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold text-blue-900">
                                {r.closingDebit > 0 ? formatCurrency(r.closingDebit, country) : '—'}
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold text-green-900">
                                {r.closingCredit > 0 ? formatCurrency(r.closingCredit, country) : '—'}
                              </TableCell>
                            </TableRow>
                          ))
                        )}

                        {/* Grand Total Row */}
                        <TableRow className="bg-muted/50 font-bold border-t-2 text-xs">
                          <TableCell colSpan={3} className="text-right font-semibold uppercase tracking-wide">
                            Total General Ledger Balance:
                          </TableCell>
                          <TableCell className="text-right font-mono border-l">
                            {formatCurrency(trialBalance.totalOpeningDebit, country)}
                          </TableCell>
                          <TableCell className="text-right font-mono border-r">
                            {formatCurrency(trialBalance.totalOpeningCredit, country)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-blue-800">
                            {formatCurrency(trialBalance.totalPeriodDebit, country)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-green-800 border-r">
                            {formatCurrency(trialBalance.totalPeriodCredit, country)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-blue-900 text-sm">
                            {formatCurrency(trialBalance.totalClosingDebit, country)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-green-900 text-sm">
                            {formatCurrency(trialBalance.totalClosingCredit, country)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* =================================================================== */}
        {/* TAB 7: INVENTORY VALUATION */}
        {/* =================================================================== */}
        <TabsContent value="valuation" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card className="border shadow-sm">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                  <Boxes className="h-3.5 w-3.5 text-blue-600" /> Raw Materials (RM)
                </p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {formatCurrency(inventoryValuation.rawMaterialsTotal, country)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">stores/raw inventory</p>
              </CardContent>
            </Card>

            <Card className="border shadow-sm">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                  <Factory className="h-3.5 w-3.5 text-purple-600" /> Work in Progress (WIP)
                </p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {formatCurrency(inventoryValuation.wipTotal, country)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">stores/wip active stages</p>
              </CardContent>
            </Card>

            <Card className="border shadow-sm">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Finished Goods (FG)
                </p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {formatCurrency(inventoryValuation.finishedGoodsTotal, country)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">stores/fg available stock</p>
              </CardContent>
            </Card>

            <Card className="border shadow-sm bg-gradient-to-br from-blue-50/50 to-transparent">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs font-semibold text-blue-900 flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5 text-blue-700" /> Total Inventory Valuation
                </p>
                <p className="text-2xl font-bold text-primary mt-1">
                  {formatCurrency(inventoryValuation.totalValuation, country)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Combined manufacturing assets</p>
              </CardContent>
            </Card>
          </div>

          {/* Ledger Account 1400 Reconciliation Banner */}
          <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            Math.abs(inventoryValuation.unreconciledVariance) < 0.01
              ? 'bg-green-50/70 border-green-200 text-green-950'
              : 'bg-amber-50/70 border-amber-200 text-amber-950'
          }`}>
            <div className="flex items-start gap-2.5">
              {Math.abs(inventoryValuation.unreconciledVariance) < 0.01 ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-bold text-xs uppercase tracking-wide">
                  GL Account 1400 (Inventory) Reconciliation
                </p>
                <p className="text-xs mt-0.5">
                  Physical Stock Valuation: <strong>{formatCurrency(inventoryValuation.totalValuation, country)}</strong> · General Ledger Balance: <strong>{formatCurrency(inventoryValuation.glInventoryBalance, country)}</strong>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs">Unreconciled Variance:</span>
              <span className={`font-mono font-bold text-sm px-2.5 py-1 rounded ${
                Math.abs(inventoryValuation.unreconciledVariance) < 0.01
                  ? 'bg-green-100 text-green-800'
                  : 'bg-amber-100 text-amber-900'
              }`}>
                {formatCurrency(inventoryValuation.unreconciledVariance, country)}
              </span>
            </div>
          </div>

          {/* Missing-Cost Exceptions Box */}
          {inventoryValuation.exceptions.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/30">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-bold flex items-center gap-1.5 text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Missing-Cost Exceptions ({inventoryValuation.exceptionsCount} items flagged)
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">
                  The following physical stock items have recorded inventory quantities but lack direct purchase bills or BOM cost records.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs bg-amber-100/40">
                      <TableHead>Code</TableHead>
                      <TableHead>Item Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Exception Advisory</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {inventoryValuation.exceptions.map((ex, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono font-semibold">{ex.itemCode}</TableCell>
                        <TableCell>{ex.itemName}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{ex.category}</Badge></TableCell>
                        <TableCell className="text-right font-mono">{ex.quantity} {ex.uom}</TableCell>
                        <TableCell className="text-amber-800 text-[11px]">{ex.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Items Table with Toolbar */}
          <Card className="border shadow-sm">
            <CardHeader className="p-4 pb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 max-w-sm">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search item code, name, batch..."
                  value={valSearch}
                  onChange={(e) => setValSearch(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={valCategoryFilter} onValueChange={setValCategoryFilter}>
                  <SelectTrigger className="h-8 text-xs w-[150px]">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="Raw Material">Raw Materials</SelectItem>
                    <SelectItem value="Work In Progress">Work In Progress</SelectItem>
                    <SelectItem value="Finished Goods">Finished Goods</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={exportValuationCSV} className="h-8 text-xs">
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> CSV
                </Button>
                <Button size="sm" variant="outline" onClick={exportValuationPDF} className="h-8 text-xs">
                  <FileText className="h-3.5 w-3.5 mr-1" /> PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 text-xs">
                    <TableHead>Category</TableHead>
                    <TableHead>Item Code &amp; Name</TableHead>
                    <TableHead>Batch / Stage / Loc</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right font-semibold">Total Value</TableHead>
                    <TableHead className="text-center">Cost Source</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {inventoryValuation.items
                    .filter((i) => {
                      if (valCategoryFilter !== 'all' && i.category !== valCategoryFilter) return false;
                      if (valSearch) {
                        const q = valSearch.toLowerCase();
                        return i.itemCode.toLowerCase().includes(q) || i.itemName.toLowerCase().includes(q);
                      }
                      return true;
                    })
                    .map((item) => (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              item.category === 'Raw Material'
                                ? 'bg-blue-100 text-blue-800 text-[10px]'
                                : item.category === 'Work In Progress'
                                ? 'bg-purple-100 text-purple-800 text-[10px]'
                                : 'bg-green-100 text-green-800 text-[10px]'
                            }
                          >
                            {item.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono font-bold text-foreground">{item.itemCode}</span>
                          <div className="text-[11px] text-muted-foreground">{item.itemName}</div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-[11px]">
                          {item.batchNumber || item.stage || item.location || '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {item.quantity} {item.uom}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {formatCurrency(item.unitCost, country)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-primary">
                          {formatCurrency(item.totalValue, country)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px]">
                            {item.costSource}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {item.hasCostException ? (
                            <Badge variant="destructive" className="text-[10px]">Exception</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-green-50 text-green-700 text-[10px]">Verified</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* =================================================================== */}
        {/* TAB 8: PRODUCTION / JOB COSTING */}
        {/* =================================================================== */}
        <TabsContent value="costing" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
            <Card className="border shadow-sm p-3">
              <p className="text-[11px] text-muted-foreground font-medium">Raw Material</p>
              <p className="text-lg font-bold text-foreground mt-0.5">{formatCurrency(productionCosting.totalMaterialCost, country)}</p>
            </Card>
            <Card className="border shadow-sm p-3">
              <p className="text-[11px] text-muted-foreground font-medium">Direct Labour</p>
              <p className="text-lg font-bold text-foreground mt-0.5">{formatCurrency(productionCosting.totalLabourCost, country)}</p>
            </Card>
            <Card className="border shadow-sm p-3">
              <p className="text-[11px] text-muted-foreground font-medium">Subcontracting</p>
              <p className="text-lg font-bold text-foreground mt-0.5">{formatCurrency(productionCosting.totalSubcontractingCost, country)}</p>
            </Card>
            <Card className="border shadow-sm p-3">
              <p className="text-[11px] text-muted-foreground font-medium">Factory Overhead</p>
              <p className="text-lg font-bold text-foreground mt-0.5">{formatCurrency(productionCosting.totalOverheadCost, country)}</p>
            </Card>
            <Card className="border shadow-sm p-3">
              <p className="text-[11px] text-muted-foreground font-medium text-green-700">Less: Scrap Credit</p>
              <p className="text-lg font-bold text-green-600 mt-0.5">-{formatCurrency(productionCosting.totalScrapCredit, country)}</p>
            </Card>
            <Card className="border shadow-sm p-3 bg-primary/5 border-primary/20">
              <p className="text-[11px] font-semibold text-primary">Grand Total Cost</p>
              <p className="text-lg font-bold text-primary mt-0.5">{formatCurrency(productionCosting.grandTotalCost, country)}</p>
            </Card>
          </div>

          <Card className="border shadow-sm">
            <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Production Jobs Cost Ledger</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Actual material, labour, subcontracting, and overhead costs with WIP tracking and zero-output handling.
                </p>
              </div>
              <Input
                placeholder="Search job no, product..."
                value={costingSearch}
                onChange={(e) => setCostingSearch(e.target.value)}
                className="h-8 text-xs max-w-xs"
              />
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 text-xs">
                    <TableHead>Job No &amp; SO</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Output Qty</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                    <TableHead className="text-right font-bold">Unit Cost</TableHead>
                    <TableHead className="text-right">Est. Cost</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {productionCosting.jobs
                    .filter((j) => {
                      if (costingSearch) {
                        const q = costingSearch.toLowerCase();
                        return j.jobNo.toLowerCase().includes(q) || j.productCode.toLowerCase().includes(q);
                      }
                      return true;
                    })
                    .map((job) => (
                      <TableRow key={job.jobId} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="font-mono font-bold text-primary">{job.jobNo}</div>
                          <div className="text-[11px] text-muted-foreground">{job.soNumber || 'Direct Run'}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{job.productName}</div>
                          <div className="text-[11px] text-muted-foreground">{job.productCode}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="secondary"
                            className={
                              job.status === 'Completed'
                                ? 'bg-green-100 text-green-800 text-[10px]'
                                : job.status === 'In Progress'
                                ? 'bg-amber-100 text-amber-800 text-[10px]'
                                : 'bg-gray-100 text-gray-700 text-[10px]'
                            }
                          >
                            {job.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{job.outputQty} Nos</TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {formatCurrency(job.totalCost, country)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-primary">
                          {job.status === 'Completed' ? formatCurrency(job.unitCost, country) : 'WIP / N/A'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {formatCurrency(job.estimatedCost, country)}
                        </TableCell>
                        <TableCell className={`text-right font-mono font-semibold ${
                          job.costVariance <= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {job.costVariance > 0 ? `+${formatCurrency(job.costVariance, country)}` : formatCurrency(job.costVariance, country)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs px-2"
                            onClick={() => setSelectedCostingJob(job)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* =================================================================== */}
        {/* TAB 9: PRODUCT PROFITABILITY */}
        {/* =================================================================== */}
        <TabsContent value="profitability" className="mt-4 space-y-4">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-purple-900 text-xs">
            <p className="font-semibold flex items-center gap-1.5">
              <PieChart className="h-4 w-4 text-purple-700" />
              Accounting Matching Principle: Profitability Based on Units Sold
            </p>
            <p className="text-[11px] text-purple-800 mt-0.5">
              Cost of Goods Sold (COGS) is matched strictly against <strong>units sold</strong> (<code>soldQty × unitManufacturingCost</code>).
              Unsold manufactured units are not treated as period losses; they remain capitalized as inventory assets on the Balance Sheet.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <Card className="border shadow-sm p-3">
              <p className="text-[11px] text-muted-foreground font-medium">Billed Revenue</p>
              <p className="text-xl font-bold text-foreground mt-0.5">{formatCurrency(productProfitability.totalRevenue, country)}</p>
            </Card>
            <Card className="border shadow-sm p-3">
              <p className="text-[11px] text-muted-foreground font-medium text-orange-700">Matched COGS</p>
              <p className="text-xl font-bold text-orange-600 mt-0.5">{formatCurrency(productProfitability.totalCogsSold, country)}</p>
            </Card>
            <Card className="border shadow-sm p-3">
              <p className="text-[11px] text-muted-foreground font-medium text-green-700">Gross Profit</p>
              <p className="text-xl font-bold text-green-600 mt-0.5">{formatCurrency(productProfitability.totalGrossProfit, country)}</p>
            </Card>
            <Card className="border shadow-sm p-3 bg-gradient-to-br from-green-50/50 to-transparent">
              <p className="text-[11px] font-semibold text-green-800">Gross Margin %</p>
              <p className="text-xl font-bold text-green-700 mt-0.5">{productProfitability.overallGrossMarginPercent}%</p>
            </Card>
            <Card className="border shadow-sm p-3 bg-blue-50/40">
              <p className="text-[11px] font-semibold text-blue-800">Retained Stock Value</p>
              <p className="text-xl font-bold text-blue-700 mt-0.5">{formatCurrency(productProfitability.totalRetainedStockValue, country)}</p>
            </Card>
          </div>

          <Card className="border shadow-sm">
            <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Product &amp; Job Profitability Breakdown</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Revenue vs matched manufacturing cost for sold quantities, margins, and retained inventory values.
                </p>
              </div>
              <Input
                placeholder="Search product code, name..."
                value={profitSearch}
                onChange={(e) => setProfitSearch(e.target.value)}
                className="h-8 text-xs max-w-xs"
              />
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 text-xs">
                    <TableHead>Product Code &amp; Name</TableHead>
                    <TableHead className="text-right">Produced Qty</TableHead>
                    <TableHead className="text-right text-green-700">Sold Qty</TableHead>
                    <TableHead className="text-right text-blue-700">Unsold Qty</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right text-orange-600">Matched COGS</TableHead>
                    <TableHead className="text-right font-bold text-green-700">Gross Profit</TableHead>
                    <TableHead className="text-right font-bold">Margin %</TableHead>
                    <TableHead className="text-right text-blue-800">Retained Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {productProfitability.items
                    .filter((p) => {
                      if (profitSearch) {
                        const q = profitSearch.toLowerCase();
                        return p.productCode.toLowerCase().includes(q) || p.productName.toLowerCase().includes(q);
                      }
                      return true;
                    })
                    .map((item) => (
                      <TableRow key={item.productId} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="font-mono font-bold text-foreground">{item.productCode}</div>
                          <div className="text-[11px] text-muted-foreground">{item.productName}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{item.producedQty}</TableCell>
                        <TableCell className="text-right font-mono text-green-700 font-semibold">{item.soldQty}</TableCell>
                        <TableCell className="text-right font-mono text-blue-700">{item.unsoldQty}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(item.unitCost, country)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{formatCurrency(item.salesRevenue, country)}</TableCell>
                        <TableCell className="text-right font-mono text-orange-600">{formatCurrency(item.cogsSold, country)}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-green-700">{formatCurrency(item.grossProfit, country)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          <span className={item.grossMarginPercent >= 20 ? 'text-green-600' : 'text-orange-600'}>
                            {item.grossMarginPercent}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-blue-800 font-medium">
                          {formatCurrency(item.retainedStockValue, country)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DIALOG: TALLY XML EXPORT */}
      <Dialog open={tallyDialogOpen} onOpenChange={setTallyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <FileCode className="h-4 w-4 text-primary" /> Export Financial Vouchers to Tally XML
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2 text-xs">
            <div className="bg-muted/40 p-3 rounded-lg border text-muted-foreground text-[11px] space-y-1">
              <p className="font-semibold text-foreground">Standard TallyPrime XML Envelope</p>
              <p>Generates an XML voucher batch with debit/credit sign conventions and automated ledger name resolution.</p>
              <p className="text-primary font-medium mt-1">Import in Tally: Gateway of Tally &gt; Import Data &gt; Vouchers</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">From Date</Label>
                <Input type="date" value={tallyFrom} onChange={(e) => setTallyFrom(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To Date</Label>
                <Input type="date" value={tallyTo} onChange={(e) => setTallyTo(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>

            <div className="p-2.5 rounded bg-blue-50 border border-blue-200 text-blue-900 text-[11px] flex justify-between items-center">
              <span>Vouchers available in selected range:</span>
              <span className="font-bold text-sm">
                {journals.filter((j) => j.date >= tallyFrom && j.date <= tallyTo).length} vouchers
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setTallyDialogOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleTallyExport} disabled={isExportingTally}>
                {isExportingTally ? 'Generating XML...' : 'Download Tally XML'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG: JOB COST BREAKDOWN */}
      {selectedCostingJob && (
        <Dialog open={Boolean(selectedCostingJob)} onOpenChange={() => setSelectedCostingJob(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold flex items-center gap-2">
                <Factory className="h-4 w-4 text-primary" /> Cost Breakdown: {selectedCostingJob.jobNo}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 pt-1 text-xs">
              <div className="p-2.5 bg-muted/40 rounded border space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Product:</span><span className="font-bold">{selectedCostingJob.productName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status:</span><Badge variant="outline" className="text-[10px]">{selectedCostingJob.status}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Completed Units:</span><span className="font-semibold">{selectedCostingJob.outputQty} Nos</span></div>
              </div>

              <div className="space-y-1.5 border rounded p-3">
                <div className="flex justify-between py-1 border-b">
                  <span>1. Raw Material Consumption:</span>
                  <span className="font-mono font-medium">{formatCurrency(selectedCostingJob.materialCost, country)}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span>2. Direct Labour Cost:</span>
                  <span className="font-mono font-medium">{formatCurrency(selectedCostingJob.labourCost, country)}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span>3. Subcontracting / Job-Work:</span>
                  <span className="font-mono font-medium">{formatCurrency(selectedCostingJob.subcontractingCost, country)}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span>4. Factory Overhead Allocation:</span>
                  <span className="font-mono font-medium">{formatCurrency(selectedCostingJob.overheadCost, country)}</span>
                </div>
                <div className="flex justify-between py-1 border-b text-green-700">
                  <span>5. Less Scrap Recovery Credit:</span>
                  <span className="font-mono font-medium">-{formatCurrency(selectedCostingJob.scrapCredit, country)}</span>
                </div>
                <div className="flex justify-between pt-2 font-bold text-sm border-t">
                  <span>Total Job Cost:</span>
                  <span className="text-primary">{formatCurrency(selectedCostingJob.totalCost, country)}</span>
                </div>
                <div className="flex justify-between pt-1 font-bold text-xs text-muted-foreground">
                  <span>Calculated Unit Cost:</span>
                  <span className="text-foreground">
                    {selectedCostingJob.status === 'Completed'
                      ? `${formatCurrency(selectedCostingJob.unitCost, country)} / unit`
                      : 'WIP Pending'}
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button size="sm" variant="outline" onClick={() => setSelectedCostingJob(null)}>
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

