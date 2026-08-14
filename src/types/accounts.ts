// src/types/accounts.ts
// Types for the Accounts (Finance) module. Extends — never duplicates — the
// customers/invoices already owned by the Sales module (sales/customers,
// sales/invoices). Everything here lives under the `accounts/` Firebase path.

export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subType: string; // e.g. "Current Asset", "Bank", "Fixed Asset", "Cost of Goods Sold"
  description?: string;
  isSystem?: boolean; // seeded default account — cannot be deleted, only deactivated
  status: 'active' | 'inactive';
  openingBalance?: number;
  createdAt: number;
  updatedAt?: number;
}

export interface Expense {
  id: string;
  expenseNumber: string;
  date: string;
  expenseType: string;
  accountId?: string;
  vendorName?: string;
  paymentMode: string;
  currency: string;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  receiptUrl?: string;
  notes?: string;
  status: 'Recorded' | 'Reimbursed';
  createdAt: number;
  updatedAt?: number;
}

export interface BillLineItem {
  sNo: number;
  description: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface Bill {
  id: string;
  billNumber: string;
  vendorName: string;
  vendorRef?: string;
  billDate: string;
  dueDate: string;
  currency: string;
  lineItems: BillLineItem[];
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  paidAmount: number;
  status: 'Draft' | 'Open' | 'Partial' | 'Paid' | 'Overdue';
  notes?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface BankAccount {
  id: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  ifscOrSwift?: string;
  accountType: 'Bank' | 'Credit Card' | 'Cash';
  currency: string;
  openingBalance: number;
  status: 'active' | 'inactive';
  createdAt: number;
  updatedAt?: number;
}

export interface BankTransaction {
  id: string;
  bankAccountId: string;
  date: string;
  description: string;
  type: 'Deposit' | 'Withdrawal';
  amount: number;
  reference?: string;
  matchedType?: 'invoice' | 'expense' | 'bill' | 'manual';
  matchedId?: string;
  reconciled: boolean;
  createdAt: number;
}

export interface CurrencyAdjustment {
  id: string;
  date: string;
  currency: string;
  exchangeRate: number;
  gainOrLoss: number;
  notes?: string;
  createdAt: number;
}

export interface JournalLine {
  accountId: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  journalNumber: string;
  date: string;
  narration: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  status: 'Draft' | 'Posted';
  createdAt: number;
  updatedAt?: number;
}

export interface OrganizationSettings {
  country: string; // country code, key into COUNTRY_CONFIG
  fiscalYearStart: string; // e.g. "04-01"
  updatedAt: number;
}
