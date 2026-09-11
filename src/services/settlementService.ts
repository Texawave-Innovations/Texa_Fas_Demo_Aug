// src/services/settlementService.ts
// Robust, concurrency-safe settlement service for Supplier Bills and Advances.
// Enforces atomic updates, zero-over-settlement guarantees, automatic balanced
// double-entry journal postings, and comprehensive audit logs.

import { database, ref, createRecord, updateRecord, logAudit, runTransaction } from '@/services/firebase';
import { get } from 'firebase/database';
import { format } from 'date-fns';
import { safeAdd, safeSub, roundCurrency } from './financeCalculations';
import type { Bill, BillPayment, SupplierAdvance, AdvanceAllocation, JournalEntry, SupplierCredit } from '@/types/accounts';

// ---------------------------------------------------------------------------
// HELPER: Claim or find default ledger account IDs
// ---------------------------------------------------------------------------
const getLedgerAccounts = async () => {
  try {
    const snap = await get(ref(database, 'accounts/chartOfAccounts'));
    if (!snap.exists()) return { apId: 'acc_2000', apName: '2000 - Accounts Payable', bankId: 'acc_1010', bankName: '1010 - Bank Accounts', advId: 'acc_1200', advName: '1200 - Accounts Receivable/Advances', cogsId: 'acc_5000', cogsName: '5000 - Cost of Goods Sold' };
    const data = snap.val();
    const list: any[] = Object.values(data);

    const ap = list.find((a) => a.code === '2000' || a.name?.toLowerCase().includes('accounts payable'));
    const bank = list.find((a) => a.code === '1010' || a.name?.toLowerCase().includes('bank'));
    const adv = list.find((a) => a.code === '1300' || a.name?.toLowerCase().includes('advance') || a.code === '1200');
    const cogs = list.find((a) => a.code === '5000' || a.name?.toLowerCase().includes('cost of goods sold') || a.code === '5100');

    return {
      apId: ap?.id || 'acc_2000',
      apName: ap ? `${ap.code} - ${ap.name}` : '2000 - Accounts Payable',
      bankId: bank?.id || 'acc_1010',
      bankName: bank ? `${bank.code} - ${bank.name}` : '1010 - Bank Accounts',
      advId: adv?.id || 'acc_1200',
      advName: adv ? `${adv.code} - ${adv.name}` : '1200 - Supplier Advances',
      cogsId: cogs?.id || 'acc_5000',
      cogsName: cogs ? `${cogs.code} - ${cogs.name}` : '5000 - Cost of Goods Sold / Purchase Returns',
    };
  } catch {
    return {
      apId: 'acc_2000', apName: '2000 - Accounts Payable',
      bankId: 'acc_1010', bankName: '1010 - Bank Accounts',
      advId: 'acc_1200', advName: '1200 - Supplier Advances',
      cogsId: 'acc_5000', cogsName: '5000 - Cost of Goods Sold / Purchase Returns',
    };
  }
};

// ---------------------------------------------------------------------------
// 1. RECORD VENDOR BILL PAYMENT
// ---------------------------------------------------------------------------
export interface RecordBillPaymentParams {
  billId: string;
  paymentDate: string;
  amount: number;
  bankAccountId: string;
  bankAccountName: string;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  attachmentUrl?: string;
}

export const recordBillPayment = async (params: RecordBillPaymentParams) => {
  const { billId, paymentDate, amount, bankAccountId, bankAccountName, paymentMethod, reference, notes, attachmentUrl } = params;

  const payAmount = roundCurrency(Number(amount));
  if (payAmount <= 0) {
    throw new Error('Payment amount must be strictly greater than zero.');
  }

  // 1. Fetch current bill and check basic validity
  const billRef = ref(database, `accounts/bills/${billId}`);
  const snap = await get(billRef);
  if (!snap.exists()) {
    throw new Error('Target vendor bill does not exist.');
  }

  const bill: Bill = { ...snap.val(), id: billId };
  const currentPaid = Number(bill.paidAmount) || 0;
  const grandTotal = Number(bill.grandTotal) || 0;
  const currentRemaining = safeSub(grandTotal, currentPaid);

  if (payAmount > currentRemaining + 0.001) {
    throw new Error(`Payment amount (${payAmount}) exceeds remaining bill balance (${currentRemaining}).`);
  }

  // 2. Perform atomic transaction on bill to prevent concurrent over-settlement
  let updatedBill: any = null;
  const txnResult = await runTransaction(billRef, (currentData) => {
    if (!currentData) return currentData;
    const existingPaid = Number(currentData.paidAmount) || 0;
    const total = Number(currentData.grandTotal) || 0;
    const rem = safeSub(total, existingPaid);

    if (payAmount > rem + 0.001) {
      // Abort transaction if another user settled the bill in the meantime
      return; // returning undefined aborts
    }

    const nextPaid = safeAdd(existingPaid, payAmount);
    const nextStatus = nextPaid >= total - 0.001 ? 'Paid' : 'Partial';

    currentData.paidAmount = nextPaid;
    currentData.status = nextStatus;
    currentData.updatedAt = Date.now();
    return currentData;
  });

  if (!txnResult.committed || !txnResult.snapshot.exists()) {
    throw new Error('Settlement failed: Bill was concurrently modified or is already settled.');
  }

  updatedBill = txnResult.snapshot.val();

  // 3. Generate Supplier Payment Voucher
  const paymentNumber = `SPV-${format(new Date(paymentDate), 'yyyyMMdd')}-${Date.now().toString().slice(-4)}`;
  const paymentPayload: Omit<BillPayment, 'id'> = {
    paymentNumber,
    billId,
    billNumber: bill.billNumber || billId,
    vendorName: bill.vendorName || 'Unknown Vendor',
    paymentDate,
    amount: payAmount,
    currency: bill.currency || 'INR',
    bankAccountId,
    bankAccountName,
    paymentMethod,
    reference: reference || undefined,
    notes: notes || undefined,
    attachmentUrl: attachmentUrl || undefined,
    createdAt: Date.now(),
  };

  const paymentId = await createRecord('accounts/billPayments', paymentPayload, { skipAudit: true });

  // 4. Record Bank Transaction (Withdrawal)
  await createRecord(
    'accounts/bankTransactions',
    {
      bankAccountId,
      date: paymentDate,
      description: `Payment for Bill ${bill.billNumber} to ${bill.vendorName}`,
      type: 'Withdrawal',
      amount: payAmount,
      reference: reference || paymentNumber,
      matchedType: 'bill',
      matchedId: billId,
      reconciled: false,
    },
    { skipAudit: true },
  );

  // 5. Post Balanced Double-Entry Journal Entry
  // Dr: Accounts Payable (Liability decreases)
  // Cr: Bank/Cash Account (Asset decreases)
  const ledger = await getLedgerAccounts();
  const jvNumber = `JV-${Date.now().toString().slice(-6)}`;
  const journalPayload: Omit<JournalEntry, 'id'> = {
    journalNumber: jvNumber,
    date: paymentDate,
    narration: `Payment of Bill ${bill.billNumber} (${bill.vendorName}) via ${paymentMethod} (${paymentNumber})`,
    lines: [
      {
        accountId: ledger.apId,
        accountName: ledger.apName,
        debit: payAmount,
        credit: 0,
      },
      {
        accountId: ledger.bankId,
        accountName: ledger.bankName,
        debit: 0,
        credit: payAmount,
      },
    ],
    totalDebit: payAmount,
    totalCredit: payAmount,
    status: 'Posted',
    createdAt: Date.now(),
  };

  await createRecord('accounts/journals', journalPayload, { skipAudit: true });

  // 6. Append comprehensive audit log
  await logAudit(
    'accounts/bills',
    billId,
    'payment_made',
    `Recorded payment of ${bill.currency || 'INR'} ${payAmount} for Bill ${bill.billNumber} via ${paymentMethod} (${bankAccountName}). Remaining: ${safeSub(grandTotal, updatedBill.paidAmount)}`,
  );

  return { paymentId, paymentNumber, updatedBill };
};

// ---------------------------------------------------------------------------
// 2. RECORD SUPPLIER ADVANCE
// ---------------------------------------------------------------------------
export interface RecordSupplierAdvanceParams {
  vendorName: string;
  supplierId?: string;
  date: string;
  amount: number;
  currency: string;
  bankAccountId: string;
  bankAccountName: string;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  attachmentUrl?: string;
}

export const recordSupplierAdvance = async (params: RecordSupplierAdvanceParams) => {
  const { vendorName, supplierId, date, amount, currency, bankAccountId, bankAccountName, paymentMethod, reference, notes, attachmentUrl } = params;

  const advAmount = roundCurrency(Number(amount));
  if (advAmount <= 0) {
    throw new Error('Advance amount must be greater than zero.');
  }
  if (!vendorName.trim()) {
    throw new Error('Supplier/Vendor name is required.');
  }

  const advanceNumber = `ADV-${format(new Date(date), 'yyyyMMdd')}-${Date.now().toString().slice(-4)}`;

  const advancePayload: Omit<SupplierAdvance, 'id'> = {
    advanceNumber,
    vendorName: vendorName.trim(),
    supplierId: supplierId || undefined,
    date,
    amount: advAmount,
    allocatedAmount: 0,
    remainingAmount: advAmount,
    currency: currency || 'INR',
    bankAccountId,
    bankAccountName,
    paymentMethod,
    reference: reference || undefined,
    notes: notes || undefined,
    attachmentUrl: attachmentUrl || undefined,
    status: 'Available',
    createdAt: Date.now(),
  };

  const advanceId = await createRecord('accounts/supplierAdvances', advancePayload, { skipAudit: true });

  // Record Bank Outflow
  await createRecord(
    'accounts/bankTransactions',
    {
      bankAccountId,
      date,
      description: `Advance to supplier ${vendorName} (${advanceNumber})`,
      type: 'Withdrawal',
      amount: advAmount,
      reference: reference || advanceNumber,
      matchedType: 'manual',
      matchedId: advanceId,
      reconciled: false,
    },
    { skipAudit: true },
  );

  // Post Double-Entry Journal Entry
  // Dr: Advance to Suppliers / Prepayment (Asset increases)
  // Cr: Bank / Cash (Asset decreases)
  const ledger = await getLedgerAccounts();
  const jvNumber = `JV-${Date.now().toString().slice(-6)}`;
  const journalPayload: Omit<JournalEntry, 'id'> = {
    journalNumber: jvNumber,
    date,
    narration: `Supplier advance paid to ${vendorName} via ${paymentMethod} (${advanceNumber})`,
    lines: [
      {
        accountId: ledger.advId,
        accountName: ledger.advName,
        debit: advAmount,
        credit: 0,
      },
      {
        accountId: ledger.bankId,
        accountName: ledger.bankName,
        debit: 0,
        credit: advAmount,
      },
    ],
    totalDebit: advAmount,
    totalCredit: advAmount,
    status: 'Posted',
    createdAt: Date.now(),
  };

  await createRecord('accounts/journals', journalPayload, { skipAudit: true });

  await logAudit(
    'accounts/supplierAdvances',
    advanceId,
    'payment_made',
    `Recorded advance payment of ${currency} ${advAmount} to ${vendorName} (${advanceNumber}) via ${paymentMethod}`,
  );

  return { advanceId, advanceNumber };
};

// ---------------------------------------------------------------------------
// 3. ALLOCATE SUPPLIER ADVANCE TO BILL (ZERO ADDITIONAL CASH OUTFLOW)
// ---------------------------------------------------------------------------
export interface AllocateAdvanceParams {
  advanceId: string;
  billId: string;
  amount: number;
  date: string;
  notes?: string;
}

export const allocateSupplierAdvance = async (params: AllocateAdvanceParams) => {
  const { advanceId, billId, amount, date, notes } = params;

  const allocAmount = roundCurrency(Number(amount));
  if (allocAmount <= 0) {
    throw new Error('Allocation amount must be greater than zero.');
  }

  // 1. Fetch Advance
  const advRef = ref(database, `accounts/supplierAdvances/${advanceId}`);
  const advSnap = await get(advRef);
  if (!advSnap.exists()) {
    throw new Error('Supplier advance record not found.');
  }
  const advance: SupplierAdvance = { ...advSnap.val(), id: advanceId };

  if (advance.status === 'Cancelled' || advance.status === 'Fully Allocated') {
    throw new Error(`Cannot allocate from advance with status '${advance.status}'.`);
  }

  if (allocAmount > advance.remainingAmount + 0.001) {
    throw new Error(`Allocation amount (${allocAmount}) exceeds available advance balance (${advance.remainingAmount}).`);
  }

  // 2. Fetch Bill
  const billRef = ref(database, `accounts/bills/${billId}`);
  const billSnap = await get(billRef);
  if (!billSnap.exists()) {
    throw new Error('Vendor bill not found.');
  }
  const bill: Bill = { ...billSnap.val(), id: billId };

  if (advance.vendorName.trim().toLowerCase() !== bill.vendorName.trim().toLowerCase()) {
    throw new Error(`Advance vendor (${advance.vendorName}) does not match bill vendor (${bill.vendorName}).`);
  }

  const billRemaining = safeSub(bill.grandTotal, bill.paidAmount);
  if (allocAmount > billRemaining + 0.001) {
    throw new Error(`Allocation amount (${allocAmount}) exceeds bill remaining balance (${billRemaining}).`);
  }

  // 3. Atomically update Advance
  const newAdvanceAllocated = safeAdd(advance.allocatedAmount, allocAmount);
  const newAdvanceRemaining = safeSub(advance.amount, newAdvanceAllocated);
  const newAdvanceStatus: SupplierAdvance['status'] = newAdvanceRemaining <= 0.001 ? 'Fully Allocated' : 'Partially Allocated';

  await updateRecord('accounts/supplierAdvances', advanceId, {
    allocatedAmount: newAdvanceAllocated,
    remainingAmount: newAdvanceRemaining,
    status: newAdvanceStatus,
  }, { skipAudit: true });

  // 4. Atomically update Bill
  const newBillPaid = safeAdd(bill.paidAmount, allocAmount);
  const newBillStatus: Bill['status'] = newBillPaid >= bill.grandTotal - 0.001 ? 'Paid' : 'Partial';

  await updateRecord('accounts/bills', billId, {
    paidAmount: newBillPaid,
    status: newBillStatus,
  }, { skipAudit: true });

  // 5. Create Advance Allocation Record
  const allocationPayload: Omit<AdvanceAllocation, 'id'> = {
    advanceId,
    advanceNumber: advance.advanceNumber,
    billId,
    billNumber: bill.billNumber || billId,
    vendorName: bill.vendorName,
    date,
    amount: allocAmount,
    status: 'Active',
    notes: notes || undefined,
    createdAt: Date.now(),
  };

  const allocationId = await createRecord('accounts/advanceAllocations', allocationPayload, { skipAudit: true });

  // 6. Post Non-Cash Adjustment Journal
  // Dr: Accounts Payable (Liability decreases)
  // Cr: Supplier Advances (Asset decreases)
  // NO bank transaction is recorded because money moved during the advance payment.
  const ledger = await getLedgerAccounts();
  const jvNumber = `JV-${Date.now().toString().slice(-6)}`;
  const journalPayload: Omit<JournalEntry, 'id'> = {
    journalNumber: jvNumber,
    date,
    narration: `Allocation of Advance ${advance.advanceNumber} to Bill ${bill.billNumber} (Transfer between Advance & AP)`,
    lines: [
      {
        accountId: ledger.apId,
        accountName: ledger.apName,
        debit: allocAmount,
        credit: 0,
      },
      {
        accountId: ledger.advId,
        accountName: ledger.advName,
        debit: 0,
        credit: allocAmount,
      },
    ],
    totalDebit: allocAmount,
    totalCredit: allocAmount,
    status: 'Posted',
    createdAt: Date.now(),
  };

  await createRecord('accounts/journals', journalPayload, { skipAudit: true });

  await logAudit(
    'accounts/advanceAllocations',
    allocationId,
    'update',
    `Allocated ${allocAmount} from advance ${advance.advanceNumber} to bill ${bill.billNumber} for ${bill.vendorName}`,
  );

  return { allocationId };
};

// ---------------------------------------------------------------------------
// 4. REVERSE ADVANCE ALLOCATION (TRACEABLE REVERSAL)
// ---------------------------------------------------------------------------
export const reverseAdvanceAllocation = async (allocationId: string, reason: string) => {
  if (!reason || !reason.trim()) {
    throw new Error('A reversal reason must be provided.');
  }

  const allocRef = ref(database, `accounts/advanceAllocations/${allocationId}`);
  const allocSnap = await get(allocRef);
  if (!allocSnap.exists()) {
    throw new Error('Advance allocation record not found.');
  }

  const alloc: AdvanceAllocation = { ...allocSnap.val(), id: allocationId };
  if (alloc.status === 'Reversed') {
    throw new Error('This allocation has already been reversed.');
  }

  // 1. Fetch Advance & Bill
  const advSnap = await get(ref(database, `accounts/supplierAdvances/${alloc.advanceId}`));
  const billSnap = await get(ref(database, `accounts/bills/${alloc.billId}`));

  if (!advSnap.exists() || !billSnap.exists()) {
    throw new Error('Linked advance or bill was deleted or could not be found.');
  }

  const advance: SupplierAdvance = { ...advSnap.val(), id: alloc.advanceId };
  const bill: Bill = { ...billSnap.val(), id: alloc.billId };

  // 2. Restore Advance
  const restoredAdvanceAllocated = Math.max(0, safeSub(advance.allocatedAmount, alloc.amount));
  const restoredAdvanceRemaining = safeAdd(advance.remainingAmount, alloc.amount);
  const restoredAdvanceStatus: SupplierAdvance['status'] = restoredAdvanceAllocated <= 0 ? 'Available' : 'Partially Allocated';

  await updateRecord('accounts/supplierAdvances', advance.id, {
    allocatedAmount: restoredAdvanceAllocated,
    remainingAmount: restoredAdvanceRemaining,
    status: restoredAdvanceStatus,
  }, { skipAudit: true });

  // 3. Restore Bill
  const restoredBillPaid = Math.max(0, safeSub(bill.paidAmount, alloc.amount));
  const restoredBillStatus: Bill['status'] = restoredBillPaid <= 0 ? 'Open' : 'Partial';

  await updateRecord('accounts/bills', bill.id, {
    paidAmount: restoredBillPaid,
    status: restoredBillStatus,
  }, { skipAudit: true });

  // 4. Mark Allocation as Reversed
  await updateRecord('accounts/advanceAllocations', allocationId, {
    status: 'Reversed',
    reversedAt: Date.now(),
    reversalReason: reason.trim(),
  }, { skipAudit: true });

  // 5. Post Reversal Journal
  // Dr: Supplier Advances (restores asset)
  // Cr: Accounts Payable (restores liability)
  const ledger = await getLedgerAccounts();
  const jvNumber = `JV-${Date.now().toString().slice(-6)}`;
  const journalPayload: Omit<JournalEntry, 'id'> = {
    journalNumber: jvNumber,
    date: format(new Date(), 'yyyy-MM-dd'),
    narration: `Reversal of Allocation ${alloc.advanceNumber}→${alloc.billNumber}. Reason: ${reason.trim()}`,
    lines: [
      {
        accountId: ledger.advId,
        accountName: ledger.advName,
        debit: alloc.amount,
        credit: 0,
      },
      {
        accountId: ledger.apId,
        accountName: ledger.apName,
        debit: 0,
        credit: alloc.amount,
      },
    ],
    totalDebit: alloc.amount,
    totalCredit: alloc.amount,
    status: 'Posted',
    createdAt: Date.now(),
  };

  await createRecord('accounts/journals', journalPayload, { skipAudit: true });

  await logAudit(
    'accounts/advanceAllocations',
    allocationId,
    'update',
    `Reversed allocation of ${alloc.amount} from advance ${alloc.advanceNumber} to bill ${alloc.billNumber}. Reason: ${reason}`,
  );

  return { success: true };
};

// ---------------------------------------------------------------------------
// 5. RECORD SUPPLIER CREDIT / DEBIT NOTE (PURCHASE RETURNS & ADJUSTMENTS)
// ---------------------------------------------------------------------------
export interface RecordSupplierCreditParams {
  vendorName: string;
  supplierId?: string;
  date: string;
  amount: number;
  currency: string;
  reason: string;
  originalBillId?: string;
  originalBillNumber?: string;
  purchaseReturnRef?: string;
  material?: string;
  returnedQty?: number;
  settlementEffect: 'ReduceBillBalance' | 'RefundCash' | 'KeepAsCreditNote';
  bankAccountId?: string;
  bankAccountName?: string;
  notes?: string;
}

export const recordSupplierCredit = async (params: RecordSupplierCreditParams) => {
  const {
    vendorName,
    supplierId,
    date,
    amount,
    currency,
    reason,
    originalBillId,
    originalBillNumber,
    purchaseReturnRef,
    material,
    returnedQty,
    settlementEffect,
    bankAccountId,
    bankAccountName,
    notes,
  } = params;

  const creditAmount = roundCurrency(Number(amount));
  if (creditAmount <= 0) {
    throw new Error('Credit/Debit Note amount must be greater than zero.');
  }
  if (!vendorName.trim()) {
    throw new Error('Supplier name is required.');
  }

  const creditNumber = `DN-${format(new Date(date), 'yyyyMMdd')}-${Date.now().toString().slice(-4)}`;
  const ledger = await getLedgerAccounts();

  let allocatedAmount = 0;
  let remainingAmount = creditAmount;
  let status: SupplierCredit['status'] = 'Approved';
  let linkedBill: Bill | null = null;

  if (settlementEffect === 'ReduceBillBalance' && originalBillId) {
    const billRef = ref(database, `accounts/bills/${originalBillId}`);
    const billSnap = await get(billRef);
    if (!billSnap.exists()) {
      throw new Error('Linked vendor bill was not found.');
    }
    linkedBill = { ...billSnap.val(), id: originalBillId };
    const billRemaining = safeSub(linkedBill.grandTotal, linkedBill.paidAmount);
    if (billRemaining <= 0) {
      throw new Error(`Bill ${linkedBill.billNumber} is already fully settled.`);
    }

    const allocAmt = Math.min(creditAmount, billRemaining);
    allocatedAmount = allocAmt;
    remainingAmount = safeSub(creditAmount, allocAmt);
    status = remainingAmount <= 0.001 ? 'Allocated' : 'Approved';

    // Safely update bill paidAmount
    const newBillPaid = safeAdd(linkedBill.paidAmount, allocAmt);
    const newBillStatus: Bill['status'] = newBillPaid >= linkedBill.grandTotal - 0.001 ? 'Paid' : 'Partial';

    await updateRecord('accounts/bills', linkedBill.id, {
      paidAmount: newBillPaid,
      status: newBillStatus,
      updatedAt: Date.now(),
    }, { skipAudit: true });

    // Balanced Journal:
    // Dr: Accounts Payable (Liability decreases by allocAmt)
    // Cr: COGS / Purchase Returns (Expense/Inventory decreases by allocAmt)
    const jvNumber = `JV-${Date.now().toString().slice(-6)}`;
    await createRecord('accounts/journals', {
      journalNumber: jvNumber,
      voucherNumber: `DA-${format(new Date(), 'yyyyMM')}-${Date.now().toString().slice(-5)}`,
      voucherType: 'DebitAdjustment',
      date,
      narration: `Debit Note ${creditNumber} (${reason}) applied to Bill ${linkedBill.billNumber} (${vendorName})`,
      lines: [
        { accountId: ledger.apId, accountName: ledger.apName, debit: allocAmt, credit: 0 },
        { accountId: ledger.cogsId, accountName: ledger.cogsName, debit: 0, credit: allocAmt },
      ],
      totalDebit: allocAmt,
      totalCredit: allocAmt,
      status: 'Posted',
      sourceType: 'SupplierCredit',
      createdAt: Date.now(),
    }, { skipAudit: true });

  } else if (settlementEffect === 'RefundCash') {
    if (!bankAccountId) {
      throw new Error('Bank account is required when settlement effect is Cash Refund.');
    }
    allocatedAmount = creditAmount;
    remainingAmount = 0;
    status = 'Refunded';

    // Create Bank Deposit
    await createRecord('accounts/bankTransactions', {
      bankAccountId,
      date,
      description: `Supplier Refund: ${vendorName} (${creditNumber} - ${reason})`,
      type: 'Deposit',
      amount: creditAmount,
      reference: creditNumber,
      matchedType: 'debit_note',
      reconciled: false,
    }, { skipAudit: true });

    // Balanced Journal:
    // Dr: Bank Account (Asset increases)
    // Cr: COGS / Purchase Returns (Expense/Purchase decreases)
    const jvNumber = `JV-${Date.now().toString().slice(-6)}`;
    await createRecord('accounts/journals', {
      journalNumber: jvNumber,
      voucherNumber: `RV-${format(new Date(), 'yyyyMM')}-${Date.now().toString().slice(-5)}`,
      voucherType: 'Receipt',
      date,
      narration: `Cash refund received from supplier ${vendorName} for ${creditNumber} (${reason})`,
      lines: [
        { accountId: ledger.bankId, accountName: ledger.bankName, debit: creditAmount, credit: 0 },
        { accountId: ledger.cogsId, accountName: ledger.cogsName, debit: 0, credit: creditAmount },
      ],
      totalDebit: creditAmount,
      totalCredit: creditAmount,
      status: 'Posted',
      sourceType: 'SupplierCredit',
      createdAt: Date.now(),
    }, { skipAudit: true });

  } else {
    // KeepAsCreditNote
    allocatedAmount = 0;
    remainingAmount = creditAmount;
    status = 'Approved';

    // Balanced Journal:
    // Dr: Accounts Payable
    // Cr: COGS / Purchase Returns
    const jvNumber = `JV-${Date.now().toString().slice(-6)}`;
    await createRecord('accounts/journals', {
      journalNumber: jvNumber,
      voucherNumber: `DA-${format(new Date(), 'yyyyMM')}-${Date.now().toString().slice(-5)}`,
      voucherType: 'DebitAdjustment',
      date,
      narration: `Supplier Debit Note ${creditNumber} on ${vendorName} for ${reason}`,
      lines: [
        { accountId: ledger.apId, accountName: ledger.apName, debit: creditAmount, credit: 0 },
        { accountId: ledger.cogsId, accountName: ledger.cogsName, debit: 0, credit: creditAmount },
      ],
      totalDebit: creditAmount,
      totalCredit: creditAmount,
      status: 'Posted',
      sourceType: 'SupplierCredit',
      createdAt: Date.now(),
    }, { skipAudit: true });
  }

  const payload: Omit<SupplierCredit, 'id'> = {
    creditNumber,
    vendorName: vendorName.trim(),
    supplierId: supplierId || undefined,
    date,
    originalBillId: originalBillId || undefined,
    originalBillNumber: (linkedBill ? linkedBill.billNumber : originalBillNumber) || undefined,
    purchaseReturnRef: purchaseReturnRef || undefined,
    material: material || undefined,
    returnedQty: returnedQty || undefined,
    amount: creditAmount,
    currency: currency || 'INR',
    reason: reason.trim(),
    settlementEffect,
    allocatedAmount,
    remainingAmount,
    status,
    createdAt: Date.now(),
  };

  const creditId = await createRecord('accounts/supplierCredits', payload, { skipAudit: true });

  await logAudit(
    'accounts/supplierCredits',
    creditId,
    'create',
    `Created Supplier Credit / Debit Note ${creditNumber} for ${vendorName}: ${currency} ${creditAmount}. Settlement effect: ${settlementEffect}`,
  );

  return { creditId, creditNumber };
};

// ---------------------------------------------------------------------------
// 6. ALLOCATE EXISTING SUPPLIER CREDIT NOTE TO A BILL
// ---------------------------------------------------------------------------
export const allocateSupplierCredit = async (params: {
  creditId: string;
  billId: string;
  amount: number;
  date: string;
  notes?: string;
}) => {
  const { creditId, billId, amount, date, notes } = params;
  const allocAmount = roundCurrency(Number(amount));
  if (allocAmount <= 0) {
    throw new Error('Allocation amount must be greater than zero.');
  }

  const creditSnap = await get(ref(database, `accounts/supplierCredits/${creditId}`));
  if (!creditSnap.exists()) {
    throw new Error('Supplier credit note record not found.');
  }
  const credit: SupplierCredit = { ...creditSnap.val(), id: creditId };

  if (allocAmount > credit.remainingAmount + 0.001) {
    throw new Error(`Allocation amount (${allocAmount}) exceeds credit note available balance (${credit.remainingAmount}).`);
  }

  const billSnap = await get(ref(database, `accounts/bills/${billId}`));
  if (!billSnap.exists()) {
    throw new Error('Target bill not found.');
  }
  const bill: Bill = { ...billSnap.val(), id: billId };
  const billRemaining = safeSub(bill.grandTotal, bill.paidAmount);

  if (allocAmount > billRemaining + 0.001) {
    throw new Error(`Allocation amount (${allocAmount}) exceeds bill remaining balance (${billRemaining}).`);
  }

  // Update Credit Note
  const newCreditAllocated = safeAdd(credit.allocatedAmount, allocAmount);
  const newCreditRemaining = safeSub(credit.remainingAmount, allocAmount);
  const newCreditStatus: SupplierCredit['status'] = newCreditRemaining <= 0.001 ? 'Allocated' : 'Approved';

  await updateRecord('accounts/supplierCredits', creditId, {
    allocatedAmount: newCreditAllocated,
    remainingAmount: newCreditRemaining,
    status: newCreditStatus,
    updatedAt: Date.now(),
  }, { skipAudit: true });

  // Update Bill paidAmount
  const newBillPaid = safeAdd(bill.paidAmount, allocAmount);
  const newBillStatus: Bill['status'] = newBillPaid >= bill.grandTotal - 0.001 ? 'Paid' : 'Partial';

  await updateRecord('accounts/bills', billId, {
    paidAmount: newBillPaid,
    status: newBillStatus,
    updatedAt: Date.now(),
  }, { skipAudit: true });

  // Balanced clearing entry:
  const ledger = await getLedgerAccounts();
  const jvNumber = `JV-${Date.now().toString().slice(-6)}`;
  await createRecord('accounts/journals', {
    journalNumber: jvNumber,
    voucherNumber: `CA-${format(new Date(), 'yyyyMM')}-${Date.now().toString().slice(-5)}`,
    voucherType: 'CreditAdjustment',
    date,
    narration: `Allocated Credit Note ${credit.creditNumber} to Bill ${bill.billNumber} (${bill.vendorName}). ${notes || ''}`,
    lines: [
      { accountId: ledger.apId, accountName: `${ledger.apName} (Bill Settlement)`, debit: allocAmount, credit: 0 },
      { accountId: ledger.apId, accountName: `${ledger.apName} (Credit Note Clearing)`, debit: 0, credit: allocAmount },
    ],
    totalDebit: allocAmount,
    totalCredit: allocAmount,
    status: 'Posted',
    sourceType: 'SupplierCredit',
    sourceId: creditId,
    sourceNumber: credit.creditNumber,
    createdAt: Date.now(),
  }, { skipAudit: true });

  await logAudit(
    'accounts/supplierCredits',
    creditId,
    'update',
    `Allocated ${allocAmount} from Credit Note ${credit.creditNumber} to Bill ${bill.billNumber}. Remaining credit: ${newCreditRemaining}`,
  );

  return { success: true };
};

