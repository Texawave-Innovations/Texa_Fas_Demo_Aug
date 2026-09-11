// src/services/financeCalculations.ts
// Centralized financial calculations for the Accounts module.
// Provides decimal-safe arithmetic, ageing analysis (5 standard buckets + unassigned),
// and party statement generation without duplicate advance counting.

import { format, parseISO, startOfDay, differenceInCalendarDays } from 'date-fns';
import type {
  AgeingBucket,
  AgeingItem,
  AgeingSummary,
  PartyStatement,
  StatementLine,
  Bill,
  BillPayment,
  SupplierAdvance,
  AdvanceAllocation,
} from '@/types/accounts';

// ---------------------------------------------------------------------------
// 1. DECIMAL-SAFE ARITHMETIC UTILITIES
// ---------------------------------------------------------------------------

/**
 * Rounds a number to the specified number of decimal places (default 2)
 * using half-up arithmetic to avoid binary floating-point drift.
 */
export const roundCurrency = (value: number, decimals: number = 2): number => {
  if (isNaN(value) || !isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

/**
 * Decimal-safe addition of multiple values.
 */
export const safeAdd = (...values: (number | undefined | null)[]): number => {
  const sum = values.reduce<number>((acc, v) => acc + (Number(v) || 0), 0);
  return roundCurrency(sum);
};

/**
 * Decimal-safe subtraction (a - b).
 */
export const safeSub = (a: number | undefined | null, b: number | undefined | null): number => {
  return roundCurrency((Number(a) || 0) - (Number(b) || 0));
};

/**
 * Decimal-safe multiplication.
 */
export const safeMul = (a: number | undefined | null, b: number | undefined | null, decimals: number = 2): number => {
  return roundCurrency((Number(a) || 0) * (Number(b) || 0), decimals);
};

/**
 * Compares two amounts within an epsilon tolerance.
 * Returns: 0 if equal, 1 if a > b, -1 if a < b.
 */
export const compareAmounts = (a: number, b: number, epsilon: number = 0.001): number => {
  const diff = a - b;
  if (Math.abs(diff) < epsilon) return 0;
  return diff > 0 ? 1 : -1;
};

// ---------------------------------------------------------------------------
// 2. AGEING ANALYSIS ENGINE
// ---------------------------------------------------------------------------

/**
 * Calculates overdue days and classifies into one of the 5 standard buckets
 * or 'no-due-date'.
 */
export const calculateOverdueDays = (
  dueDateStr: string | undefined | null,
  asOfDateStr: string,
): { overdueDays: number; bucket: AgeingBucket } => {
  if (!dueDateStr || dueDateStr.trim() === '') {
    return { overdueDays: 0, bucket: 'no-due-date' };
  }

  try {
    const due = startOfDay(parseISO(dueDateStr));
    const asOf = startOfDay(parseISO(asOfDateStr));

    if (isNaN(due.getTime()) || isNaN(asOf.getTime())) {
      return { overdueDays: 0, bucket: 'no-due-date' };
    }

    const diffDays = differenceInCalendarDays(asOf, due);

    if (diffDays <= 0) {
      return { overdueDays: 0, bucket: 'current' };
    } else if (diffDays <= 30) {
      return { overdueDays: diffDays, bucket: '1-30' };
    } else if (diffDays <= 60) {
      return { overdueDays: diffDays, bucket: '31-60' };
    } else if (diffDays <= 90) {
      return { overdueDays: diffDays, bucket: '61-90' };
    } else {
      return { overdueDays: diffDays, bucket: '90+' };
    }
  } catch {
    return { overdueDays: 0, bucket: 'no-due-date' };
  }
};

/**
 * Builds an empty AgeingSummary accumulator.
 */
export const createEmptyAgeingSummary = (asOfDate: string, currency: string = 'INR'): AgeingSummary => ({
  asOfDate,
  currency,
  totalOutstanding: 0,
  current: 0,
  days1_30: 0,
  days31_60: 0,
  days61_90: 0,
  days90Plus: 0,
  noDueDate: 0,
  count: 0,
});

/**
 * Calculates Receivables (AR) Ageing from Sales invoices.
 * Excludes cancelled invoices, drafts, and settled items.
 */
export const calculateReceivablesAgeing = (
  invoices: any[],
  asOfDate: string = format(new Date(), 'yyyy-MM-dd'),
  filterCurrency?: string,
): { items: AgeingItem[]; summary: AgeingSummary } => {
  const summary = createEmptyAgeingSummary(asOfDate, filterCurrency || 'INR');
  const items: AgeingItem[] = [];

  for (const inv of invoices) {
    // 1. Exclude drafts and cancelled records
    if (inv.status === 'cancelled' || inv.paymentStatus === 'Draft' || inv.status === 'Draft') {
      continue;
    }

    // 2. Date filtering: do not include invoices created after as-of date
    const invDate = inv.invoiceDate || (inv.createdAt ? format(new Date(inv.createdAt), 'yyyy-MM-dd') : null);
    if (invDate && invDate > asOfDate) {
      continue;
    }

    // 3. Currency filter if specified
    const cur = inv.currency || 'INR';
    if (filterCurrency && cur !== filterCurrency) {
      continue;
    }

    const grandTotal = Number(inv.grandTotal) || 0;
    const paidAmount = Number(inv.paidAmount) || 0;
    const outstanding = safeSub(grandTotal, paidAmount);

    // 4. Exclude fully settled items
    if (outstanding <= 0.001 || inv.paymentStatus === 'Paid') {
      continue;
    }

    const { overdueDays, bucket } = calculateOverdueDays(inv.dueDate, asOfDate);

    const item: AgeingItem = {
      id: inv.id,
      documentNumber: inv.invoiceNumber || inv.id,
      partyName: inv.customerName || 'Unknown Customer',
      partyType: 'Customer',
      documentDate: invDate || '—',
      dueDate: inv.dueDate || undefined,
      currency: cur,
      grandTotal,
      paidAmount,
      outstandingAmount: outstanding,
      overdueDays,
      bucket,
      sourcePath: `/sales/invoices`,
      status: inv.paymentStatus || 'Unpaid',
    };

    items.push(item);

    // Accumulate summary
    summary.totalOutstanding = safeAdd(summary.totalOutstanding, outstanding);
    summary.count += 1;
    if (bucket === 'current') summary.current = safeAdd(summary.current, outstanding);
    else if (bucket === '1-30') summary.days1_30 = safeAdd(summary.days1_30, outstanding);
    else if (bucket === '31-60') summary.days31_60 = safeAdd(summary.days31_60, outstanding);
    else if (bucket === '61-90') summary.days61_90 = safeAdd(summary.days61_90, outstanding);
    else if (bucket === '90+') summary.days90Plus = safeAdd(summary.days90Plus, outstanding);
    else if (bucket === 'no-due-date') summary.noDueDate = safeAdd(summary.noDueDate, outstanding);
  }

  return { items, summary };
};

/**
 * Calculates Payables (AP) Ageing from Vendor Bills, payment records, and advance allocations.
 * Excludes drafts and fully settled bills. Correctly computes historical as-of balances.
 */
export const calculatePayablesAgeing = (
  bills: Bill[],
  payments: BillPayment[] = [],
  allocations: AdvanceAllocation[] = [],
  asOfDate: string = format(new Date(), 'yyyy-MM-dd'),
  filterCurrency?: string,
): { items: AgeingItem[]; summary: AgeingSummary } => {
  const summary = createEmptyAgeingSummary(asOfDate, filterCurrency || 'INR');
  const items: AgeingItem[] = [];

  for (const bill of bills) {
    // 1. Exclude drafts
    if (bill.status === 'Draft') {
      continue;
    }

    // 2. Date filtering: do not include bills dated after as-of date
    const bDate = bill.billDate || (bill.createdAt ? format(new Date(bill.createdAt), 'yyyy-MM-dd') : null);
    if (bDate && bDate > asOfDate) {
      continue;
    }

    // 3. Currency filter if specified
    const cur = bill.currency || 'INR';
    if (filterCurrency && cur !== filterCurrency) {
      continue;
    }

    const grandTotal = Number(bill.grandTotal) || 0;

    // 4. Calculate paid amount as of the specified asOfDate
    const billPayments = payments.filter((p) => p.billId === bill.id && p.paymentDate <= asOfDate);
    const billAllocations = allocations.filter((a) => a.billId === bill.id && a.status === 'Active' && a.date <= asOfDate);

    let paidUpToAsOf = 0;
    let isHistoricalEstimated = false;

    if (billPayments.length > 0 || billAllocations.length > 0) {
      const directPaid = billPayments.reduce((s, p) => safeAdd(s, p.amount), 0);
      const allocPaid = billAllocations.reduce((s, a) => safeAdd(s, a.amount), 0);
      paidUpToAsOf = safeAdd(directPaid, allocPaid);
    } else {
      // Legacy bill without discrete payment vouchers: use bill.paidAmount
      paidUpToAsOf = Number(bill.paidAmount) || 0;
      if (paidUpToAsOf > 0) {
        isHistoricalEstimated = true;
      }
    }

    const outstanding = safeSub(grandTotal, paidUpToAsOf);

    // 5. Exclude fully settled items as of this date
    if (outstanding <= 0.001) {
      continue;
    }

    const { overdueDays, bucket } = calculateOverdueDays(bill.dueDate, asOfDate);

    const item: AgeingItem = {
      id: bill.id,
      documentNumber: bill.billNumber || bill.id,
      partyName: bill.vendorName || 'Unknown Vendor',
      partyType: 'Supplier',
      documentDate: bDate || '—',
      dueDate: bill.dueDate || undefined,
      currency: cur,
      grandTotal,
      paidAmount: paidUpToAsOf,
      outstandingAmount: outstanding,
      overdueDays,
      bucket,
      sourcePath: `/finance/expenses`,
      status: bill.status || 'Open',
      isHistoricalEstimated,
    };

    items.push(item);

    // Accumulate summary
    summary.totalOutstanding = safeAdd(summary.totalOutstanding, outstanding);
    summary.count += 1;
    if (bucket === 'current') summary.current = safeAdd(summary.current, outstanding);
    else if (bucket === '1-30') summary.days1_30 = safeAdd(summary.days1_30, outstanding);
    else if (bucket === '31-60') summary.days31_60 = safeAdd(summary.days31_60, outstanding);
    else if (bucket === '61-90') summary.days61_90 = safeAdd(summary.days61_90, outstanding);
    else if (bucket === '90+') summary.days90Plus = safeAdd(summary.days90Plus, outstanding);
    else if (bucket === 'no-due-date') summary.noDueDate = safeAdd(summary.noDueDate, outstanding);
  }

  return { items, summary };
};

// ---------------------------------------------------------------------------
// 3. PARTY STATEMENTS (SUPPLIER & CUSTOMER LEDGERS)
// ---------------------------------------------------------------------------

/**
 * Generates a Supplier Statement (Vendor Ledger) for a specific vendor and date range.
 * Double-entry convention:
 * - Bill: Credit to Supplier (increases Accounts Payable balance).
 * - Payment: Debit to Supplier (reduces Accounts Payable balance).
 * - Advance: Debit to Supplier (prepayment reduces balance).
 * - Allocation: Non-cash transfer from Advance to Bill. Shows as informational transfer without double-reducing cash.
 */
export const generateSupplierStatement = (params: {
  vendorName: string;
  fromDate: string;
  toDate: string;
  currency: string;
  bills: Bill[];
  payments: BillPayment[];
  advances: SupplierAdvance[];
  allocations: AdvanceAllocation[];
}): PartyStatement => {
  const { vendorName, fromDate, toDate, currency, bills, payments, advances, allocations } = params;

  const targetVendor = vendorName.trim().toLowerCase();

  const vBills = bills.filter((b) => (b.vendorName || '').trim().toLowerCase() === targetVendor && b.status !== 'Draft');
  const vPayments = payments.filter((p) => (p.vendorName || '').trim().toLowerCase() === targetVendor);
  const vAdvances = advances.filter((a) => (a.vendorName || '').trim().toLowerCase() === targetVendor && a.status !== 'Cancelled');
  const vAllocations = allocations.filter((a) => (a.vendorName || '').trim().toLowerCase() === targetVendor && a.status === 'Active');

  let hasIncompleteHistory = false;

  // 1. Compute Opening Balance (as of before fromDate)
  let openingBalance = 0;

  // Bills prior to fromDate increase AP (+)
  vBills
    .filter((b) => (b.billDate || '9999-99-99') < fromDate)
    .forEach((b) => {
      openingBalance = safeAdd(openingBalance, b.grandTotal || 0);
    });

  // Direct payments prior to fromDate decrease AP (-)
  vPayments
    .filter((p) => p.paymentDate < fromDate)
    .forEach((p) => {
      openingBalance = safeSub(openingBalance, p.amount || 0);
    });

  // Advances prior to fromDate decrease AP / credit balance (-)
  vAdvances
    .filter((a) => a.date < fromDate)
    .forEach((a) => {
      openingBalance = safeSub(openingBalance, a.amount || 0);
    });

  // Check for legacy bills prior to fromDate with paidAmount but no vouchers
  vBills
    .filter((b) => (b.billDate || '9999-99-99') < fromDate)
    .forEach((b) => {
      const directPaidOnBill = vPayments.filter((p) => p.billId === b.id).reduce((s, p) => safeAdd(s, p.amount), 0);
      const allocPaidOnBill = vAllocations.filter((a) => a.billId === b.id).reduce((s, a) => safeAdd(s, a.amount), 0);
      const accountedFor = safeAdd(directPaidOnBill, allocPaidOnBill);
      const diff = safeSub(b.paidAmount || 0, accountedFor);
      if (diff > 0.01) {
        // Legacy payment was recorded directly on the bill
        openingBalance = safeSub(openingBalance, diff);
        hasIncompleteHistory = true;
      }
    });

  // 2. Build period transactions
  interface RawEntry {
    date: string;
    type: StatementLine['type'];
    reference: string;
    description: string;
    debit: number;
    credit: number;
    sourceUrl?: string;
    isHistoricalEstimated?: boolean;
  }

  const rawEntries: RawEntry[] = [];

  // Period Bills
  vBills
    .filter((b) => {
      const d = b.billDate || '9999-99-99';
      return d >= fromDate && d <= toDate;
    })
    .forEach((b) => {
      rawEntries.push({
        date: b.billDate || fromDate,
        type: 'Bill',
        reference: b.billNumber || b.id,
        description: `Vendor Bill - ${b.lineItems?.map((l) => l.description).filter(Boolean).join(', ') || 'General supplies'}`,
        debit: 0,
        credit: b.grandTotal || 0,
        sourceUrl: `/finance/expenses`,
      });

      // Check for legacy payments on period bills
      const directPaidOnBill = vPayments.filter((p) => p.billId === b.id).reduce((s, p) => safeAdd(s, p.amount), 0);
      const allocPaidOnBill = vAllocations.filter((a) => a.billId === b.id).reduce((s, a) => safeAdd(s, a.amount), 0);
      const diff = safeSub(b.paidAmount || 0, safeAdd(directPaidOnBill, allocPaidOnBill));
      if (diff > 0.01) {
        rawEntries.push({
          date: b.billDate || fromDate,
          type: 'Payment',
          reference: `LEGACY-SETTLE-${b.billNumber || b.id}`,
          description: `Legacy recorded settlement on bill (voucher unlinked)`,
          debit: diff,
          credit: 0,
          isHistoricalEstimated: true,
        });
        hasIncompleteHistory = true;
      }
    });

  // Period Direct Payments
  vPayments
    .filter((p) => p.paymentDate >= fromDate && p.paymentDate <= toDate)
    .forEach((p) => {
      rawEntries.push({
        date: p.paymentDate,
        type: 'Payment',
        reference: p.paymentNumber || p.reference || 'SPV',
        description: `Payment for bill ${p.billNumber} via ${p.paymentMethod}${p.reference ? ` (Ref: ${p.reference})` : ''}`,
        debit: p.amount || 0,
        credit: 0,
        sourceUrl: `/finance/expenses`,
      });
    });

  // Period Supplier Advances
  vAdvances
    .filter((a) => a.date >= fromDate && a.date <= toDate)
    .forEach((a) => {
      rawEntries.push({
        date: a.date,
        type: 'Advance',
        reference: a.advanceNumber,
        description: `Supplier Advance Payment via ${a.paymentMethod}${a.reference ? ` (Ref: ${a.reference})` : ''}`,
        debit: a.amount || 0,
        credit: 0,
        sourceUrl: `/finance/expenses`,
      });
    });

  // Period Advance Allocations: Informational line to show settlement link without double-counting cash
  vAllocations
    .filter((a) => a.date >= fromDate && a.date <= toDate)
    .forEach((a) => {
      rawEntries.push({
        date: a.date,
        type: 'Allocation',
        reference: `ALLOC-${a.advanceNumber}→${a.billNumber}`,
        description: `Advance ${a.advanceNumber} allocated to Bill ${a.billNumber} (Advance balance transferred)`,
        debit: 0, // Debit 0 because advance cash was already debited upon payment
        credit: 0,
        sourceUrl: `/finance/expenses`,
      });
    });

  // Sort chronological
  rawEntries.sort((a, b) => a.date.localeCompare(b.date));

  // 3. Compute running balance
  let running = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;

  const lines: StatementLine[] = rawEntries.map((entry, idx) => {
    // For AP: Balance = Previous + Credit (new bill) - Debit (payment/advance)
    running = safeSub(safeAdd(running, entry.credit), entry.debit);
    totalDebit = safeAdd(totalDebit, entry.debit);
    totalCredit = safeAdd(totalCredit, entry.credit);

    return {
      id: `stmt-${idx}-${entry.reference}`,
      date: entry.date,
      type: entry.type,
      reference: entry.reference,
      description: entry.description,
      debit: entry.debit,
      credit: entry.credit,
      runningBalance: running,
      sourceUrl: entry.sourceUrl,
      isHistoricalEstimated: entry.isHistoricalEstimated,
    };
  });

  return {
    partyName: vendorName,
    partyType: 'Supplier',
    fromDate,
    toDate,
    currency,
    openingBalance,
    closingBalance: running,
    totalDebit,
    totalCredit,
    lines,
    hasIncompleteHistory,
  };
};

/**
 * Generates a Customer Statement (Accounts Receivable Ledger).
 * Double-entry convention:
 * - Invoice: Debit to Customer (increases Accounts Receivable balance).
 * - Receipt / Payment: Credit to Customer (reduces Accounts Receivable balance).
 */
export const generateCustomerStatement = (params: {
  customerName: string;
  fromDate: string;
  toDate: string;
  currency: string;
  invoices: any[];
}): PartyStatement => {
  const { customerName, fromDate, toDate, currency, invoices } = params;

  const targetCustomer = customerName.trim().toLowerCase();
  const cInvoices = invoices.filter(
    (i) => (i.customerName || '').trim().toLowerCase() === targetCustomer && i.status !== 'cancelled',
  );

  let openingBalance = 0;
  let hasIncompleteHistory = false;

  // Opening Balance prior to fromDate
  cInvoices
    .filter((inv) => {
      const d = inv.invoiceDate || '9999-99-99';
      return d < fromDate;
    })
    .forEach((inv) => {
      const outstanding = safeSub(inv.grandTotal || 0, inv.paidAmount || 0);
      openingBalance = safeAdd(openingBalance, outstanding);
      if (inv.paidAmount > 0) {
        hasIncompleteHistory = true;
      }
    });

  interface RawEntry {
    date: string;
    type: StatementLine['type'];
    reference: string;
    description: string;
    debit: number;
    credit: number;
    sourceUrl?: string;
    isHistoricalEstimated?: boolean;
  }

  const rawEntries: RawEntry[] = [];

  cInvoices
    .filter((inv) => {
      const d = inv.invoiceDate || '9999-99-99';
      return d >= fromDate && d <= toDate;
    })
    .forEach((inv) => {
      rawEntries.push({
        date: inv.invoiceDate || fromDate,
        type: 'Invoice',
        reference: inv.invoiceNumber || inv.id,
        description: `Tax Invoice - ${inv.lineItems?.map((l: any) => l.description || l.partCode).filter(Boolean).join(', ') || 'Goods'}`,
        debit: inv.grandTotal || 0,
        credit: 0,
        sourceUrl: `/sales/invoices`,
      });

      if (inv.paidAmount > 0) {
        rawEntries.push({
          date: inv.invoiceDate || fromDate,
          type: 'Receipt',
          reference: `REC-${inv.invoiceNumber || inv.id}`,
          description: `Customer payment received (recorded on invoice)`,
          debit: 0,
          credit: inv.paidAmount,
          isHistoricalEstimated: true,
        });
        hasIncompleteHistory = true;
      }
    });

  rawEntries.sort((a, b) => a.date.localeCompare(b.date));

  let running = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;

  const lines: StatementLine[] = rawEntries.map((entry, idx) => {
    // For AR: Balance = Previous + Debit (new invoice) - Credit (collection)
    running = safeSub(safeAdd(running, entry.debit), entry.credit);
    totalDebit = safeAdd(totalDebit, entry.debit);
    totalCredit = safeAdd(totalCredit, entry.credit);

    return {
      id: `stmt-cust-${idx}-${entry.reference}`,
      date: entry.date,
      type: entry.type,
      reference: entry.reference,
      description: entry.description,
      debit: entry.debit,
      credit: entry.credit,
      runningBalance: running,
      sourceUrl: entry.sourceUrl,
      isHistoricalEstimated: entry.isHistoricalEstimated,
    };
  });

  return {
    partyName: customerName,
    partyType: 'Customer',
    fromDate,
    toDate,
    currency,
    openingBalance,
    closingBalance: running,
    totalDebit,
    totalCredit,
    lines,
    hasIncompleteHistory,
  };
};

