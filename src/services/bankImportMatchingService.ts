// src/services/bankImportMatchingService.ts
// Bank statement CSV import, duplicate detection, and intelligent matching engine.
// Treats imported statements as external evidence and matches against book transactions
// without creating redundant cash movements.

import { database, ref, createRecord, updateRecord, getAllRecords, logAudit } from '@/services/firebase';
import { safeSub, safeAdd, roundCurrency } from './financeCalculations';
import type {
  BankTransaction,
  ImportedBankStatement,
  ImportedBankStatementRow,
} from '@/types/accounts';

export interface ColumnMapping {
  dateCol: number;
  descCol: number;
  refCol?: number;
  withdrawalCol?: number;
  depositCol?: number;
  amountCol?: number; // For single amount columns with +/- or Dr/Cr flag
  balanceCol?: number;
}

export interface ParsedStatementRow {
  rowNumber: number;
  date: string;
  description: string;
  reference?: string;
  withdrawalAmount: number;
  depositAmount: number;
  balance?: number;
}

/**
 * Simple hash generator for duplicate detection.
 */
export const hashString = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

/**
 * Parses raw CSV text into structured rows using user-defined column mapping.
 */
export const parseBankStatementCSV = (
  csvText: string,
  mapping: ColumnMapping,
): { rows: ParsedStatementRow[]; totalDeposits: number; totalWithdrawals: number } => {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV file is empty or missing data rows.');
  }

  const rows: ParsedStatementRow[] = [];
  let totalDeposits = 0;
  let totalWithdrawals = 0;

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Simple CSV parser handling quotes
    const cells: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    cells.push(cur.trim());

    const rawDate = cells[mapping.dateCol] || '';
    const desc = cells[mapping.descCol] || '';
    const refVal = mapping.refCol !== undefined ? cells[mapping.refCol] : undefined;

    let withdrawal = 0;
    let deposit = 0;

    if (mapping.withdrawalCol !== undefined && cells[mapping.withdrawalCol]) {
      withdrawal = Math.abs(Number(cells[mapping.withdrawalCol].replace(/[^0-9.-]/g, '')) || 0);
    }
    if (mapping.depositCol !== undefined && cells[mapping.depositCol]) {
      deposit = Math.abs(Number(cells[mapping.depositCol].replace(/[^0-9.-]/g, '')) || 0);
    }

    if (withdrawal > 0 || deposit > 0) {
      totalWithdrawals = safeAdd(totalWithdrawals, withdrawal);
      totalDeposits = safeAdd(totalDeposits, deposit);

      rows.push({
        rowNumber: i,
        date: rawDate,
        description: desc,
        reference: refVal,
        withdrawalAmount: withdrawal,
        depositAmount: deposit,
      });
    }
  }

  return { rows, totalDeposits, totalWithdrawals };
};

/**
 * Saves imported bank statement batch with duplicate protection.
 */
export const saveImportedStatement = async (params: {
  fileName: string;
  fileHash: string;
  bankAccountId: string;
  bankAccountName: string;
  rows: ParsedStatementRow[];
  totalDeposits: number;
  totalWithdrawals: number;
}): Promise<{ statementId: string }> => {
  const { fileName, fileHash, bankAccountId, bankAccountName, rows, totalDeposits, totalWithdrawals } = params;

  // Check for duplicate import
  const existingStatements = (await getAllRecords('accounts/importedBankStatements')) as ImportedBankStatement[];
  const isDuplicate = existingStatements.some((s) => s.fileHash === fileHash && s.status !== 'Archived');
  if (isDuplicate) {
    throw new Error(`Duplicate import detected: A statement with identical content (${fileName}) has already been imported.`);
  }

  const statementPayload: Omit<ImportedBankStatement, 'id'> = {
    fileName,
    fileHash,
    bankAccountId,
    bankAccountName,
    importedAt: Date.now(),
    rowCount: rows.length,
    totalDeposits,
    totalWithdrawals,
    status: 'Active',
  };

  const statementId = await createRecord('accounts/importedBankStatements', statementPayload, { skipAudit: true });

  // Save statement rows
  for (const r of rows) {
    const rowPayload: Omit<ImportedBankStatementRow, 'id'> = {
      statementId,
      bankAccountId,
      rowNumber: r.rowNumber,
      date: r.date,
      description: r.description,
      reference: r.reference,
      withdrawalAmount: r.withdrawalAmount,
      depositAmount: r.depositAmount,
      matchedStatus: 'Unmatched',
    };
    await createRecord('accounts/importedBankStatementRows', rowPayload, { skipAudit: true });
  }

  await logAudit(
    'accounts/importedBankStatements',
    statementId,
    'create',
    `Imported bank statement ${fileName} with ${rows.length} rows for account ${bankAccountName}`,
  );

  return { statementId };
};

/**
 * Finds suggested matches between imported rows and book transactions.
 */
export const findSuggestedMatches = (
  importedRows: ImportedBankStatementRow[],
  bookTransactions: BankTransaction[],
): Array<{
  importedRow: ImportedBankStatementRow;
  suggestedTransaction?: BankTransaction;
  matchScore: number;
  matchReason?: string;
}> => {
  const results = [];

  for (const row of importedRows) {
    const isDeposit = row.depositAmount > 0;
    const amount = isDeposit ? row.depositAmount : row.withdrawalAmount;
    const txnType = isDeposit ? 'Deposit' : 'Withdrawal';

    // Find candidate book transactions matching account and type
    const candidates = bookTransactions.filter(
      (bt) => bt.bankAccountId === row.bankAccountId && bt.type === txnType && !bt.reconciled,
    );

    let bestMatch: BankTransaction | undefined;
    let highestScore = 0;
    let reason = '';

    for (const c of candidates) {
      let score = 0;

      // 1. Amount matching (crucial)
      if (Math.abs(safeSub(c.amount, amount)) < 0.01) {
        score += 60;
      } else {
        continue; // Different amount is not a candidate
      }

      // 2. Date proximity
      if (c.date && row.date && c.date === row.date) {
        score += 30;
      } else {
        score += 10;
      }

      // 3. Reference matching
      if (row.reference && c.reference && row.reference.toLowerCase().includes(c.reference.toLowerCase())) {
        score += 20;
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = c;
        reason = score >= 80 ? 'Exact Amount & Date' : 'Exact Amount';
      }
    }

    results.push({
      importedRow: row,
      suggestedTransaction: bestMatch,
      matchScore: highestScore,
      matchReason: reason,
    });
  }

  return results;
};

/**
 * Confirms match between imported bank statement row and book transaction.
 * Does NOT create a redundant cash movement.
 */
export const confirmBankStatementMatch = async (params: {
  importedRowId: string;
  bookTransactionId: string;
}) => {
  const { importedRowId, bookTransactionId } = params;

  // 1. Update imported row status
  await updateRecord('accounts/importedBankStatementRows', importedRowId, {
    matchedStatus: 'Matched',
    matchedTransactionId: bookTransactionId,
    confidence: 'Exact',
  }, { skipAudit: true });

  // 2. Reconcile book transaction
  await updateRecord('accounts/bankTransactions', bookTransactionId, {
    reconciled: true,
  }, { skipAudit: true });

  await logAudit(
    'accounts/bankTransactions',
    bookTransactionId,
    'update',
    `Reconciled bank transaction ${bookTransactionId} via imported statement row ${importedRowId}`,
  );

  return { success: true };
};

