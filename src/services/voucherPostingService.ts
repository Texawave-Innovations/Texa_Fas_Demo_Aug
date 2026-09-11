// src/services/voucherPostingService.ts
// Unified voucher register and automated double-entry posting engine.
// Backed by accounts/journals with period lock protection, immutable postings,
// reciprocal reversals, durable deduplication, and controlled activation modes.

import { database, ref, createRecord, updateRecord, getAllRecords, logAudit } from '@/services/firebase';
import { get } from 'firebase/database';
import { format } from 'date-fns';
import { safeSub, safeAdd, roundCurrency, compareAmounts } from './financeCalculations';
import type {
  UnifiedVoucher,
  VoucherType,
  JournalLine,
  PeriodLock,
  PostingConfig,
  Bill,
  BillPayment,
  SupplierAdvance,
  SupplierCredit,
} from '@/types/accounts';

const JOURNALS_PATH = 'accounts/journals';
const PERIOD_LOCK_PATH = 'accounts/periodLocks/current';
const POSTING_CONFIG_PATH = 'accounts/postingConfig';

/**
 * Returns current period lock if configured.
 */
export const getPeriodLock = async (): Promise<PeriodLock | null> => {
  try {
    const snap = await get(ref(database, PERIOD_LOCK_PATH));
    return snap.exists() ? (snap.val() as PeriodLock) : null;
  } catch {
    return null;
  }
};

/**
 * Sets accounting period lock.
 */
export const setPeriodLock = async (lockDate: string, notes?: string) => {
  await updateRecord('accounts/periodLocks', 'current', {
    lockDate,
    lockedAt: Date.now(),
    notes: notes || undefined,
  });
  await logAudit('accounts/periodLocks', 'current', 'update', `Set financial period lock date to ${lockDate}`);
};

/**
 * Returns posting configuration (validation mode vs active mode).
 */
export const getPostingConfig = async (): Promise<PostingConfig> => {
  try {
    const snap = await get(ref(database, POSTING_CONFIG_PATH));
    if (snap.exists()) return snap.val() as PostingConfig;
  } catch { /* ignore */ }

  return {
    postingMode: 'validation', // Default to safe validation mode initially
    cutoverDate: '2026-04-01',
    autoPostBills: true,
    autoPostInvoices: true,
    autoPostPayments: true,
    autoPostExpenses: true,
  };
};

/**
 * Updates posting configuration.
 */
export const updatePostingConfig = async (config: Partial<PostingConfig>) => {
  await updateRecord('accounts', 'postingConfig', {
    ...config,
    updatedAt: Date.now(),
  });
  await logAudit('accounts/postingConfig', 'config', 'update', `Updated posting config to mode: ${config.postingMode || 'unchanged'}`);
};

/**
 * Validates double-entry invariants and period locks before posting.
 */
const validateVoucherInvariants = async (date: string, lines: JournalLine[]): Promise<void> => {
  // 1. Period Lock Check
  const lock = await getPeriodLock();
  if (lock && lock.lockDate && date <= lock.lockDate) {
    throw new Error(`Accounting period is locked up to ${lock.lockDate}. Financial entries cannot be posted on or prior to this date.`);
  }

  // 2. Minimum line count
  const validLines = lines.filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));
  if (validLines.length < 2) {
    throw new Error('A valid accounting voucher requires at least two lines with positive amounts.');
  }

  // 3. Positive amounts only
  for (const l of validLines) {
    if (l.debit < 0 || l.credit < 0) {
      throw new Error('Negative line amounts are forbidden in general ledger postings.');
    }
  }

  // 4. Equal debits and credits
  const totalDebit = roundCurrency(validLines.reduce((s, l) => s + (l.debit || 0), 0));
  const totalCredit = roundCurrency(validLines.reduce((s, l) => s + (l.credit || 0), 0));

  if (compareAmounts(totalDebit, totalCredit) !== 0) {
    throw new Error(`Unbalanced entry: Total Debits (${totalDebit}) must equal Total Credits (${totalCredit}). Difference: ${safeSub(totalDebit, totalCredit)}`);
  }
};

/**
 * Generates a unique sequential voucher number.
 */
const generateVoucherNumber = (type: VoucherType): string => {
  const prefix =
    type === 'Payment' ? 'PV' :
    type === 'Receipt' ? 'RV' :
    type === 'Contra' ? 'CV' :
    type === 'Purchase' ? 'PUR' :
    type === 'Sales' ? 'SLS' :
    type === 'CreditAdjustment' ? 'CA' :
    type === 'DebitAdjustment' ? 'DA' : 'JV';

  return `${prefix}-${format(new Date(), 'yyyyMM')}-${Date.now().toString().slice(-5)}`;
};

/**
 * Creates and posts a Unified Accounting Voucher with durable deduplication.
 */
export const postUnifiedVoucher = async (params: {
  voucherType: VoucherType;
  date: string;
  narration: string;
  lines: JournalLine[];
  sourceType?: UnifiedVoucher['sourceType'];
  sourceId?: string;
  sourceNumber?: string;
  forceLive?: boolean;
}): Promise<{ voucherId: string; voucherNumber: string; isValidation: boolean }> => {
  const { voucherType, date, narration, lines, sourceType, sourceId, sourceNumber, forceLive } = params;

  // 1. Verify invariants
  await validateVoucherInvariants(date, lines);

  // 2. Durable Deduplication: check if already posted for this source
  if (sourceType && sourceId) {
    const existingJournals = (await getAllRecords(JOURNALS_PATH)) as UnifiedVoucher[];
    const duplicate = existingJournals.find(
      (j) => j.sourceType === sourceType && j.sourceId === sourceId && j.status !== 'Reversed',
    );
    if (duplicate) {
      return { voucherId: duplicate.id, voucherNumber: duplicate.voucherNumber, isValidation: !!duplicate.isValidation };
    }
  }

  const config = await getPostingConfig();
  const isValidation = !forceLive && config.postingMode === 'validation';

  const totalDebit = roundCurrency(lines.reduce((s, l) => s + (l.debit || 0), 0));
  const totalCredit = roundCurrency(lines.reduce((s, l) => s + (l.credit || 0), 0));
  const voucherNumber = generateVoucherNumber(voucherType);

  const payload: Omit<UnifiedVoucher, 'id'> = {
    voucherNumber,
    voucherType,
    date,
    effectiveAccountingDate: date,
    narration,
    sourceType,
    sourceId,
    sourceNumber,
    lines,
    totalDebit,
    totalCredit,
    status: isValidation ? 'Validation' : 'Posted',
    isValidation,
    createdAt: Date.now(),
  };

  const voucherId = await createRecord(JOURNALS_PATH, payload, { skipAudit: true });

  await logAudit(
    JOURNALS_PATH,
    voucherId,
    'create',
    `${isValidation ? '[Validation] ' : ''}Posted ${voucherType} voucher ${voucherNumber} — Total: ${totalDebit}. Narration: ${narration}`,
  );

  return { voucherId, voucherNumber, isValidation };
};

export const recordUnifiedVoucher = postUnifiedVoucher;

/**
 * Reverses a posted voucher immutably by posting an opposite reciprocal voucher.
 * Both vouchers remain in the ledger and net exactly to zero.
 */
export const reverseUnifiedVoucher = async (params: {
  voucherId: string;
  reason: string;
  effectiveDate: string;
}): Promise<{ reversalVoucherId: string; reversalVoucherNumber: string }> => {
  const { voucherId, reason, effectiveDate } = params;

  if (!reason || !reason.trim()) {
    throw new Error('A reversal reason is required.');
  }

  // 1. Check Period Lock
  const lock = await getPeriodLock();
  if (lock && lock.lockDate && effectiveDate <= lock.lockDate) {
    throw new Error(`Accounting period is locked up to ${lock.lockDate}. Cannot reverse into a closed period.`);
  }

  // 2. Fetch original voucher
  const originalSnap = await get(ref(database, `${JOURNALS_PATH}/${voucherId}`));
  if (!originalSnap.exists()) {
    throw new Error('Target voucher was not found.');
  }

  const original: UnifiedVoucher = { ...originalSnap.val(), id: voucherId };
  if (original.status === 'Reversed') {
    throw new Error('This voucher has already been reversed.');
  }

  // 3. Create reciprocal lines: swap Debit and Credit
  const reciprocalLines: JournalLine[] = original.lines.map((l) => ({
    accountId: l.accountId,
    accountName: l.accountName,
    debit: l.credit, // Invert
    credit: l.debit, // Invert
  }));

  const reversalVoucherNumber = `REV-${original.voucherNumber}`;
  const reversalPayload: Omit<UnifiedVoucher, 'id'> = {
    voucherNumber: reversalVoucherNumber,
    voucherType: original.voucherType,
    date: effectiveDate,
    effectiveAccountingDate: effectiveDate,
    narration: `Reversal of ${original.voucherNumber}. Reason: ${reason.trim()}`,
    sourceType: original.sourceType,
    sourceId: original.sourceId,
    sourceNumber: original.sourceNumber,
    lines: reciprocalLines,
    totalDebit: original.totalCredit,
    totalCredit: original.totalDebit,
    status: 'Posted',
    isValidation: false,
    reversedVoucherId: original.id,
    createdAt: Date.now(),
  };

  const reversalVoucherId = await createRecord(JOURNALS_PATH, reversalPayload, { skipAudit: true });

  // 4. Update original voucher to mark as Reversed with reciprocal link
  await updateRecord(
    JOURNALS_PATH,
    voucherId,
    {
      status: 'Reversed',
      reversalVoucherId,
      reversalReason: reason.trim(),
      updatedAt: Date.now(),
    },
    { skipAudit: true },
  );

  await logAudit(
    JOURNALS_PATH,
    voucherId,
    'update',
    `Reversed voucher ${original.voucherNumber} via ${reversalVoucherNumber}. Reason: ${reason}`,
  );

  return { reversalVoucherId, reversalVoucherNumber };
};

/**
 * Activates live posting: converts all existing 'Validation' vouchers to committed 'Posted' vouchers.
 */
export const activateLivePosting = async (): Promise<{ count: number }> => {
  const allJournals = (await getAllRecords(JOURNALS_PATH)) as UnifiedVoucher[];
  const validationVouchers = allJournals.filter((j) => j.status === 'Validation' || j.isValidation);

  for (const v of validationVouchers) {
    await updateRecord(JOURNALS_PATH, v.id, {
      status: 'Posted',
      isValidation: false,
      updatedAt: Date.now(),
    }, { skipAudit: true });
  }

  await updatePostingConfig({ postingMode: 'active' });

  await logAudit(
    JOURNALS_PATH,
    null,
    'update',
    `Activated Live Posting mode. Committed ${validationVouchers.length} validation vouchers to general ledger.`,
  );

  return { count: validationVouchers.length };
};

