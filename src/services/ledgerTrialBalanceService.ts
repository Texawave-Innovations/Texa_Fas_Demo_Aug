// src/services/ledgerTrialBalanceService.ts
// General ledger account registers and comprehensive Trial Balance engine.
// Provides running ledger statements and strictly reports true debit/credit differences without plugs.

import { getAllRecords } from '@/services/firebase';
import { safeSub, safeAdd, roundCurrency, compareAmounts } from './financeCalculations';
import type {
  ChartOfAccount,
  UnifiedVoucher,
  TrialBalanceRow,
  TrialBalanceSummary,
} from '@/types/accounts';

export interface AccountLedgerLine {
  voucherId: string;
  voucherNumber: string;
  voucherType: string;
  date: string;
  narration: string;
  sourceType?: string;
  sourceNumber?: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface AccountLedgerReport {
  account: ChartOfAccount;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  lines: AccountLedgerLine[];
}

/**
 * Generates an itemized General Ledger register for a single Chart of Account.
 */
export const getAccountLedger = async (params: {
  accountId: string;
  fromDate: string;
  toDate: string;
}): Promise<AccountLedgerReport> => {
  const { accountId, fromDate, toDate } = params;

  const [coaList, vouchers] = await Promise.all([
    getAllRecords('accounts/chartOfAccounts') as Promise<ChartOfAccount[]>,
    getAllRecords('accounts/journals') as Promise<UnifiedVoucher[]>,
  ]);

  const account = coaList.find((a) => a.id === accountId);
  if (!account) {
    throw new Error(`Account ${accountId} not found in Chart of Accounts.`);
  }

  // Determine whether normal balance is Debit (Asset, Expense) or Credit (Liability, Equity, Income)
  const isDebitNormal = account.type === 'Asset' || account.type === 'Expense';

  // Only consider posted, committed vouchers
  const postedVouchers = vouchers.filter((v) => v.status === 'Posted');

  // 1. Calculate Opening Balance prior to fromDate
  let openingBalance = Number(account.openingBalance || 0);

  const priorVouchers = postedVouchers.filter((v) => v.date < fromDate);
  for (const v of priorVouchers) {
    for (const l of v.lines || []) {
      if (l.accountId === account.id) {
        if (isDebitNormal) {
          openingBalance = safeSub(safeAdd(openingBalance, l.debit || 0), l.credit || 0);
        } else {
          openingBalance = safeSub(safeAdd(openingBalance, l.credit || 0), l.debit || 0);
        }
      }
    }
  }

  // 2. Period Lines
  const periodVouchers = postedVouchers
    .filter((v) => v.date >= fromDate && v.date <= toDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  let running = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;
  const lines: AccountLedgerLine[] = [];

  for (const v of periodVouchers) {
    for (const l of v.lines || []) {
      if (l.accountId === account.id) {
        const dr = Number(l.debit) || 0;
        const cr = Number(l.credit) || 0;

        if (isDebitNormal) {
          running = safeSub(safeAdd(running, dr), cr);
        } else {
          running = safeSub(safeAdd(running, cr), dr);
        }

        totalDebit = safeAdd(totalDebit, dr);
        totalCredit = safeAdd(totalCredit, cr);

        lines.push({
          voucherId: v.id,
          voucherNumber: v.voucherNumber,
          voucherType: v.voucherType || 'Journal',
          date: v.date,
          narration: v.narration || '',
          sourceType: v.sourceType,
          sourceNumber: v.sourceNumber,
          debit: dr,
          credit: cr,
          runningBalance: running,
        });
      }
    }
  }

  return {
    account,
    fromDate,
    toDate,
    openingBalance,
    totalDebit,
    totalCredit,
    closingBalance: running,
    lines,
  };
};

/**
 * Computes a formal Trial Balance showing Opening, Movements, and Closing balances per GL account.
 * Reports unexplained differences explicitly without balancing plugs.
 */
export const generateTrialBalance = async (params: {
  fromDate: string;
  toDate: string;
}): Promise<TrialBalanceSummary> => {
  const { fromDate, toDate } = params;

  const [coaList, vouchers] = await Promise.all([
    getAllRecords('accounts/chartOfAccounts') as Promise<ChartOfAccount[]>,
    getAllRecords('accounts/journals') as Promise<UnifiedVoucher[]>,
  ]);

  const postedVouchers = vouchers.filter((v) => v.status === 'Posted');
  const rows: TrialBalanceRow[] = [];

  let totalOpeningDebit = 0;
  let totalOpeningCredit = 0;
  let totalPeriodDebit = 0;
  let totalPeriodCredit = 0;
  let totalClosingDebit = 0;
  let totalClosingCredit = 0;

  for (const acc of coaList.sort((a, b) => a.code.localeCompare(b.code))) {
    const isDebitNormal = acc.type === 'Asset' || acc.type === 'Expense';
    const baseOpening = Number(acc.openingBalance || 0);

    // Initial Dr/Cr assignment
    let openingDr = isDebitNormal ? baseOpening : 0;
    let openingCr = !isDebitNormal ? baseOpening : 0;

    // Movement prior to fromDate
    for (const v of postedVouchers.filter((v) => v.date < fromDate)) {
      for (const l of v.lines || []) {
        if (l.accountId === acc.id) {
          openingDr = safeAdd(openingDr, l.debit || 0);
          openingCr = safeAdd(openingCr, l.credit || 0);
        }
      }
    }

    // Net opening
    const netOpening = safeSub(openingDr, openingCr);
    const finalOpeningDebit = netOpening > 0 ? netOpening : 0;
    const finalOpeningCredit = netOpening < 0 ? Math.abs(netOpening) : 0;

    // Period movements
    let periodDebit = 0;
    let periodCredit = 0;
    for (const v of postedVouchers.filter((v) => v.date >= fromDate && v.date <= toDate)) {
      for (const l of v.lines || []) {
        if (l.accountId === acc.id) {
          periodDebit = safeAdd(periodDebit, l.debit || 0);
          periodCredit = safeAdd(periodCredit, l.credit || 0);
        }
      }
    }

    // Closing balances
    const netClosing = safeSub(safeAdd(finalOpeningDebit, periodDebit), safeAdd(finalOpeningCredit, periodCredit));
    const closingDebit = netClosing > 0 ? netClosing : 0;
    const closingCredit = netClosing < 0 ? Math.abs(netClosing) : 0;

    // Accumulate summary totals
    totalOpeningDebit = safeAdd(totalOpeningDebit, finalOpeningDebit);
    totalOpeningCredit = safeAdd(totalOpeningCredit, finalOpeningCredit);
    totalPeriodDebit = safeAdd(totalPeriodDebit, periodDebit);
    totalPeriodCredit = safeAdd(totalPeriodCredit, periodCredit);
    totalClosingDebit = safeAdd(totalClosingDebit, closingDebit);
    totalClosingCredit = safeAdd(totalClosingCredit, closingCredit);

    rows.push({
      accountCode: acc.code,
      accountName: acc.name,
      accountType: acc.type,
      openingDebit: finalOpeningDebit,
      openingCredit: finalOpeningCredit,
      periodDebit,
      periodCredit,
      closingDebit,
      closingCredit,
    });
  }

  const unexplainedDifference = Math.abs(safeSub(totalClosingDebit, totalClosingCredit));
  const isBalanced = unexplainedDifference < 0.01;

  return {
    asOfDate: toDate,
    fromDate,
    toDate,
    totalOpeningDebit,
    totalOpeningCredit,
    totalPeriodDebit,
    totalPeriodCredit,
    totalClosingDebit,
    totalClosingCredit,
    isBalanced,
    unexplainedDifference,
    rows,
  };
};

