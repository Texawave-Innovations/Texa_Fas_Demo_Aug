// src/services/cashFlowForecastService.ts
// Manufacturing Cash-Flow Forecast Engine:
// 1. Prospective rolling weekly / monthly projections from as-of date.
// 2. Prospective inflows from open sales invoices scheduled by due dates.
// 3. Prospective outflows from open vendor bills scheduled by due dates.
// 4. Unbilled PO commitments with strict exclusion of already-billed POs to prevent double-counting.
// 5. Operational overheads, payroll, and capex provisions.
// 6. Cumulative projected cash curve with liquidity deficit warnings.

import { safeSub, safeAdd, roundCurrency } from './financeCalculations';
import { format, addDays, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import type {
  CashFlowForecastBucket,
  CashFlowForecastReport,
  Bill,
  BankAccount,
} from '@/types/accounts';

export interface POCommitment {
  id: string;
  poNumber: string;
  supplier: string;
  orderDate?: string;
  expectedDate?: string;
  totalAmount: number;
  status: string;
}

/**
 * Generates rolling weekly cash flow forecast buckets.
 */
export const generateCashFlowForecast = (params: {
  asOfDate: string; // "yyyy-MM-dd"
  horizonWeeks?: number; // default 8 weeks
  invoices: any[];
  bills: Bill[];
  bankAccounts: BankAccount[];
  bankTxns?: any[];
  purchaseOrders?: POCommitment[];
  monthlyOverheadEstimate?: number;
  safetyCushionThreshold?: number;
}): CashFlowForecastReport => {
  const {
    asOfDate,
    horizonWeeks = 8,
    invoices,
    bills,
    bankAccounts,
    bankTxns = [],
    purchaseOrders = [],
    monthlyOverheadEstimate = 120000, // standard factory operating overhead per month
    safetyCushionThreshold = 50000,
  } = params;

  const baseDate = parseISO(asOfDate);

  // 1. Compute current actual cash & bank balance
  const activeAccounts = bankAccounts.filter((b) => b.status !== 'inactive');
  let currentCashBalance = 0;
  for (const b of activeAccounts) {
    const txns = bankTxns.filter((t) => t.bankAccountId === b.id);
    const bal = txns.reduce(
      (acc, t) => acc + (t.type === 'Deposit' ? (t.amount || 0) : -(t.amount || 0)),
      b.openingBalance || 0,
    );
    currentCashBalance = safeAdd(currentCashBalance, bal);
  }
  currentCashBalance = roundCurrency(currentCashBalance);

  // 2. Identify billed PO numbers to strictly exclude them from PO commitments (prevent double counting)
  const billedPoNumbers = new Set<string>();
  for (const b of bills) {
    if (b.status !== 'Paid') {
      const vendorRef = (b.vendorRef || '').trim().toLowerCase();
      if (vendorRef) billedPoNumbers.add(vendorRef);
      const notes = (b.notes || '').toLowerCase();
      // Extract PO mentions if any
      const poMatch = notes.match(/po-[0-9a-zA-Z-]+/i);
      if (poMatch) billedPoNumbers.add(poMatch[0].toLowerCase());
    }
  }

  // Filter unbilled PO commitments only
  const unbilledPOs = purchaseOrders.filter((po) => {
    if (!po.poNumber) return false;
    const cleanNo = po.poNumber.trim().toLowerCase();
    if (billedPoNumbers.has(cleanNo)) return false; // Already billed! Skip to avoid double counting!
    return po.status !== 'Cancelled' && po.status !== 'Received';
  });

  // 3. Construct rolling weekly buckets
  const buckets: CashFlowForecastBucket[] = [];
  let runningCash = currentCashBalance;
  let totalProjectedInflow = 0;
  let totalProjectedOutflow = 0;
  let minimumProjectedBalance = currentCashBalance;

  const weeklyOverhead = roundCurrency((monthlyOverheadEstimate * 12) / 52);

  for (let w = 0; w < horizonWeeks; w++) {
    const bucketStart = addDays(baseDate, w * 7);
    const bucketEnd = addDays(baseDate, (w + 1) * 7 - 1);
    const startStr = format(bucketStart, 'yyyy-MM-dd');
    const endStr = format(bucketEnd, 'yyyy-MM-dd');
    const label = `W${w + 1} (${format(bucketStart, 'dd MMM')} - ${format(bucketEnd, 'dd MMM')})`;

    const interval = { start: startOfDay(bucketStart), end: endOfDay(bucketEnd) };

    // Inflows from Open Sales Invoices due in this interval
    let receivablesInflow = 0;
    for (const inv of invoices) {
      if (inv.status === 'cancelled' || inv.paymentStatus === 'Paid') continue;
      const dueStr = inv.dueDate || inv.invoiceDate;
      if (!dueStr) continue;
      try {
        const dueDate = parseISO(dueStr);
        if (isWithinInterval(dueDate, interval) || (w === 0 && dueDate < bucketStart)) {
          const unpaid = safeSub(inv.grandTotal || 0, inv.paidAmount || 0);
          if (unpaid > 0) {
            receivablesInflow = safeAdd(receivablesInflow, unpaid);
          }
        }
      } catch {
        // invalid date
      }
    }
    receivablesInflow = roundCurrency(receivablesInflow);

    // Outflows from Open Vendor Bills due in this interval
    let payablesOutflow = 0;
    for (const bill of bills) {
      if (bill.status === 'Paid') continue;
      const dueStr = bill.dueDate || bill.billDate;
      if (!dueStr) continue;
      try {
        const dueDate = parseISO(dueStr);
        if (isWithinInterval(dueDate, interval) || (w === 0 && dueDate < bucketStart)) {
          const unpaid = safeSub(bill.grandTotal || 0, bill.paidAmount || 0);
          if (unpaid > 0) {
            payablesOutflow = safeAdd(payablesOutflow, unpaid);
          }
        }
      } catch {
        // invalid date
      }
    }
    payablesOutflow = roundCurrency(payablesOutflow);

    // Outflows from Unbilled PO commitments expected in this interval
    let unbilledPoCommitments = 0;
    for (const po of unbilledPOs) {
      const expStr = po.expectedDate || po.orderDate;
      if (!expStr) continue;
      try {
        const expDate = parseISO(expStr);
        if (isWithinInterval(expDate, interval) || (w === 0 && expDate < bucketStart)) {
          unbilledPoCommitments = safeAdd(unbilledPoCommitments, po.totalAmount || 0);
        }
      } catch {
        // invalid date
      }
    }
    unbilledPoCommitments = roundCurrency(unbilledPoCommitments);

    const overheadsOutflow = weeklyOverhead;
    const capexOutflow = 0; // standard weekly Capex provision
    const otherInflows = 0;

    const totalInflow = safeAdd(receivablesInflow, otherInflows);
    const totalOutflow = safeAdd(payablesOutflow, safeAdd(unbilledPoCommitments, safeAdd(overheadsOutflow, capexOutflow)));
    const netCashFlow = safeSub(totalInflow, totalOutflow);
    const closingCash = roundCurrency(runningCash + netCashFlow);
    const isDeficit = closingCash < safetyCushionThreshold;

    if (closingCash < minimumProjectedBalance) {
      minimumProjectedBalance = closingCash;
    }

    buckets.push({
      bucketKey: `w_${w + 1}`,
      label,
      startDate: startStr,
      endDate: endStr,
      openingCash: runningCash,
      receivablesInflow,
      otherInflows,
      totalInflow,
      payablesOutflow,
      unbilledPoCommitments,
      overheadsOutflow,
      capexOutflow,
      totalOutflow,
      netCashFlow,
      closingCash,
      isDeficit,
    });

    totalProjectedInflow = safeAdd(totalProjectedInflow, totalInflow);
    totalProjectedOutflow = safeAdd(totalProjectedOutflow, totalOutflow);
    runningCash = closingCash;
  }

  const netProjectedChange = safeSub(runningCash, currentCashBalance);

  return {
    asOfDate,
    horizonWeeks,
    currentCashBalance,
    buckets,
    totalProjectedInflow: roundCurrency(totalProjectedInflow),
    totalProjectedOutflow: roundCurrency(totalProjectedOutflow),
    netProjectedChange: roundCurrency(netProjectedChange),
    minimumProjectedBalance: roundCurrency(minimumProjectedBalance),
  };
};

