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
  capitalizedToInventory?: boolean;
  landedCostAllocationId?: string;
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
  billType?: 'standard' | 'subcontractor';
  jobWorkOrderNo?: string;
  serviceDescription?: string;
  fgReceivedQty?: number;
  scrapQty?: number;
  serviceRate?: number;
  tdsApplicable?: boolean;
  tdsRate?: number;
  tdsAmount?: number;
  capitalizedToInventory?: boolean;
  landedCostAllocationId?: string;
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

// ---------------------------------------------------------------------------
// PHASE 1 ENHANCEMENTS: SUPPLIER SETTLEMENTS, ADVANCES, AGEING & STATEMENTS
// ---------------------------------------------------------------------------

export interface BillPayment {
  id: string;
  paymentNumber: string; // e.g. "SPV-2026-001" (Supplier Payment Voucher)
  billId: string;
  billNumber: string;
  vendorName: string;
  paymentDate: string;
  amount: number;
  currency: string;
  bankAccountId: string;
  bankAccountName: string;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  attachmentUrl?: string;
  createdAt: number;
  createdBy?: string;
}

export interface SupplierAdvance {
  id: string;
  advanceNumber: string; // e.g. "ADV-2026-001"
  vendorName: string;
  supplierId?: string;
  date: string;
  amount: number; // original advance amount
  allocatedAmount: number; // sum of active allocations
  remainingAmount: number; // amount - allocatedAmount
  currency: string;
  bankAccountId: string;
  bankAccountName: string;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  attachmentUrl?: string;
  status: 'Available' | 'Partially Allocated' | 'Fully Allocated' | 'Cancelled';
  createdAt: number;
  updatedAt?: number;
}

export interface AdvanceAllocation {
  id: string;
  advanceId: string;
  advanceNumber: string;
  billId: string;
  billNumber: string;
  vendorName: string;
  date: string;
  amount: number;
  status: 'Active' | 'Reversed';
  reversedAt?: number;
  reversalReason?: string;
  notes?: string;
  createdAt: number;
}

export type AgeingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+' | 'no-due-date';

export interface AgeingItem {
  id: string;
  documentNumber: string;
  partyName: string;
  partyType: 'Customer' | 'Supplier';
  documentDate: string;
  dueDate?: string;
  currency: string;
  grandTotal: number;
  paidAmount: number;
  outstandingAmount: number;
  overdueDays: number;
  bucket: AgeingBucket;
  sourcePath: string;
  status: string;
  isHistoricalEstimated?: boolean;
}

export interface AgeingSummary {
  asOfDate: string;
  currency: string;
  totalOutstanding: number;
  current: number;       // Not yet due
  days1_30: number;      // 1–30 days overdue
  days31_60: number;     // 31–60 days overdue
  days61_90: number;     // 61–90 days overdue
  days90Plus: number;    // >90 days overdue
  noDueDate: number;     // Missing due date
  count: number;
}

export interface StatementLine {
  id: string;
  date: string;
  type: 'Invoice' | 'Bill' | 'Payment' | 'Receipt' | 'Advance' | 'Allocation' | 'Credit Note' | 'Adjustment';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  sourceUrl?: string;
  isHistoricalEstimated?: boolean;
}

export interface PartyStatement {
  partyName: string;
  partyType: 'Customer' | 'Supplier';
  fromDate: string;
  toDate: string;
  currency: string;
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  lines: StatementLine[];
  hasIncompleteHistory?: boolean;
}

// ---------------------------------------------------------------------------
// PHASE 2 ENHANCEMENTS: PROCUREMENT INTEGRATION & ACCOUNTING FOUNDATION
// ---------------------------------------------------------------------------

export interface BillGrnMatch {
  id: string;
  billId: string;
  billNumber: string;
  grnId: string;
  grnNo: string;
  poNumber?: string;
  material: string;
  billedQty: number;
  receivedQty: number;
  matchedQty: number;
  unit: string;
  billedRate: number;
  estimatedRate?: number;
  priceVariance: number; // (billedRate - estimatedRate) * matchedQty
  qtyVariance: number;   // billedQty - receivedQty
  status: 'Fully Matched' | 'Partial Match' | 'Shortage' | 'Excess Billed' | 'Price Variance';
  discrepancyNotes?: string;
  createdAt: number;
}

export interface SupplierCredit {
  id: string;
  creditNumber: string; // e.g. "DN-2026-001" (Debit Note)
  vendorName: string;
  supplierId?: string;
  date: string;
  originalBillId?: string;
  originalBillNumber?: string;
  purchaseReturnRef?: string; // Links to inventory purchase return or GRN
  material?: string;
  returnedQty?: number;
  amount: number;
  currency: string;
  reason: string;
  settlementEffect: 'ReduceBillBalance' | 'RefundCash' | 'KeepAsCreditNote';
  allocatedAmount: number;
  remainingAmount: number;
  status: 'Draft' | 'Approved' | 'Allocated' | 'Refunded' | 'Cancelled';
  createdAt: number;
  updatedAt?: number;
}

export type VoucherType =
  | 'Payment'
  | 'Receipt'
  | 'Journal'
  | 'Contra'
  | 'Purchase'
  | 'Sales'
  | 'CreditAdjustment'
  | 'DebitAdjustment';

export interface UnifiedVoucher {
  id: string;
  voucherNumber: string; // e.g. "VCH-2026-001" or "JV-123456"
  journalNumber?: string;
  referenceNumber?: string;
  voucherType: VoucherType;
  date: string;
  effectiveAccountingDate?: string;
  narration: string;
  sourceType?: 'Bill' | 'Invoice' | 'Payment' | 'Receipt' | 'Expense' | 'SupplierCredit' | 'Manual' | 'Bank' | 'FixedAsset';
  sourceId?: string;
  sourceNumber?: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  status: 'Draft' | 'Posted' | 'Reversed' | 'Validation';
  isValidation?: boolean;
  validationWarnings?: string[];
  reversalReason?: string;
  reversedVoucherId?: string;
  reversalVoucherId?: string;
  createdAt: number;
  createdBy?: string;
  updatedAt?: number;
}

export interface PeriodLock {
  id?: string;
  lockDate: string; // YYYY-MM-DD
  lockedBy?: string;
  lockedAt: number;
  notes?: string;
}

export interface PostingConfig {
  postingMode: 'validation' | 'active'; // 'validation' runs dry-runs/audit mode without affecting live reports
  cutoverDate: string; // YYYY-MM-DD
  autoPostBills: boolean;
  autoPostInvoices: boolean;
  autoPostPayments: boolean;
  autoPostExpenses: boolean;
  updatedAt?: number;
}

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export interface TrialBalanceSummary {
  asOfDate: string;
  fromDate: string;
  toDate: string;
  totalOpeningDebit: number;
  totalOpeningCredit: number;
  totalPeriodDebit: number;
  totalPeriodCredit: number;
  totalClosingDebit: number;
  totalClosingCredit: number;
  isBalanced: boolean;
  unexplainedDifference: number; // Must be reported honestly, never hidden by plugs
  rows: TrialBalanceRow[];
}

export interface ImportedBankStatement {
  id: string;
  fileName: string;
  fileHash: string;
  bankAccountId: string;
  bankAccountName: string;
  importedAt: number;
  rowCount: number;
  totalDeposits: number;
  totalWithdrawals: number;
  status: 'Active' | 'Archived';
}

export interface ImportedBankStatementRow {
  id: string;
  statementId: string;
  bankAccountId: string;
  rowNumber: number;
  date: string;
  description: string;
  reference?: string;
  withdrawalAmount: number;
  depositAmount: number;
  balance?: number;
  matchedStatus: 'Unmatched' | 'Suggested' | 'Matched' | 'Ignored';
  matchedTransactionId?: string;
  matchedTransactionRef?: string;
  confidence?: 'Exact' | 'Probable' | 'Manual';
}

// -------------------------------------------------------------------------
// PHASE 3 TYPES: Manufacturing Cost Accounting, Fixed Assets & Forecasting
// -------------------------------------------------------------------------

export type InventoryCategory = 'Raw Material' | 'Work In Progress' | 'Finished Goods';

export interface InventoryValuationItem {
  id: string;
  category: InventoryCategory;
  itemCode: string;
  itemName: string;
  batchNumber?: string;
  location?: string;
  stage?: string;
  quantity: number;
  uom: string;
  unitCost: number;
  totalValue: number;
  costSource: 'GRN' | 'Purchase Bill' | 'Production Job' | 'BOM Standard' | 'Missing';
  asOfDate: string;
  hasCostException: boolean;
  exceptionReason?: string;
}

export interface MissingCostException {
  itemCode: string;
  itemName: string;
  category: InventoryCategory;
  quantity: number;
  uom: string;
  reason: string;
}

export interface InventoryValuationReport {
  asOfDate: string;
  items: InventoryValuationItem[];
  rawMaterialsTotal: number;
  wipTotal: number;
  finishedGoodsTotal: number;
  totalValuation: number;
  glInventoryBalance: number;
  unreconciledVariance: number;
  exceptionsCount: number;
  exceptions: MissingCostException[];
}

export interface ProductionJobCost {
  jobId: string;
  jobNo: string;
  soNumber?: string;
  customerName?: string;
  productCode: string;
  productName: string;
  status: 'In Progress' | 'Completed' | 'Zero Output (Setup/Scrap)';
  startDate?: string;
  endDate?: string;
  materialCost: number;
  labourCost: number;
  subcontractingCost: number;
  overheadCost: number;
  scrapCredit: number;
  totalCost: number;
  outputQty: number;
  unitCost: number;
  estimatedCost: number;
  costVariance: number;
  costStatus: 'Estimated' | 'Actual' | 'WIP Accumulated';
}

export interface ProductionCostingReport {
  asOfDate: string;
  jobs: ProductionJobCost[];
  totalMaterialCost: number;
  totalLabourCost: number;
  totalSubcontractingCost: number;
  totalOverheadCost: number;
  totalScrapCredit: number;
  grandTotalCost: number;
  completedJobsCount: number;
  inProgressJobsCount: number;
}

export type LandedCostAllocationBasis = 'quantity' | 'value' | 'weight';

export interface LandedCostAllocationLine {
  targetType: 'BillLine' | 'GRNLine';
  targetId: string;
  itemDescription: string;
  quantity: number;
  baseAmount: number;
  weight?: number;
  allocatedLandedCost: number;
  adjustedTotalAmount: number;
  effectiveUnitCost: number;
}

export interface LandedCostAllocation {
  id: string;
  allocationNumber: string;
  date: string;
  sourceType: 'Expense' | 'Bill';
  sourceId: string;
  sourceReference: string;
  totalLandedCost: number;
  allocationBasis: LandedCostAllocationBasis;
  lines: LandedCostAllocationLine[];
  notes?: string;
  createdAt: number;
}

export interface ProductProfitabilityItem {
  productId: string;
  productCode: string;
  productName: string;
  producedQty: number;
  soldQty: number;
  unsoldQty: number;
  unitCost: number;
  salesRevenue: number;
  cogsSold: number;
  grossProfit: number;
  grossMarginPercent: number;
  retainedStockValue: number;
}

export interface ProductProfitabilityReport {
  asOfDate: string;
  items: ProductProfitabilityItem[];
  totalRevenue: number;
  totalCogsSold: number;
  totalGrossProfit: number;
  overallGrossMarginPercent: number;
  totalRetainedStockValue: number;
}

export type DepreciationMethod = 'Straight-Line' | 'WDV';
export type FixedAssetCategory =
  | 'Plant & Machinery'
  | 'Office Equipment'
  | 'Vehicles'
  | 'Furniture & Fixtures'
  | 'Building'
  | 'Other';

export interface FixedAsset {
  id: string;
  assetNumber: string;
  name: string;
  category: FixedAssetCategory;
  purchaseDate: string;
  purchaseCost: number;
  salvageValue: number;
  usefulLifeYears: number;
  depreciationMethod: DepreciationMethod;
  depreciationRatePercent: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  status: 'Active' | 'Disposed' | 'Written Off';
  glAssetAccount: string; // e.g. '1500'
  glDepreciationAccount: string; // e.g. '5500'
  glAccumulatedDepAccount: string; // e.g. '1510'
  vendorBillRef?: string;
  location?: string;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface DepreciationRunAssetDetail {
  assetId: string;
  assetNumber: string;
  assetName: string;
  openingBookValue: number;
  depreciationAmount: number;
  closingBookValue: number;
}

export interface DepreciationRun {
  id: string;
  runNumber: string;
  period: string; // e.g. '2026-06'
  runDate: string;
  method: DepreciationMethod | 'Mixed';
  assetCount: number;
  totalDepreciation: number;
  voucherId?: string;
  voucherNumber?: string;
  details: DepreciationRunAssetDetail[];
  status: 'Posted' | 'Reversed';
  createdAt: number;
}

export interface CashFlowForecastBucket {
  bucketKey: string;
  label: string;
  startDate: string;
  endDate: string;
  openingCash: number;
  receivablesInflow: number;
  otherInflows: number;
  totalInflow: number;
  payablesOutflow: number;
  unbilledPoCommitments: number;
  overheadsOutflow: number;
  capexOutflow: number;
  totalOutflow: number;
  netCashFlow: number;
  closingCash: number;
  isDeficit: boolean;
}

export interface CashFlowForecastReport {
  asOfDate: string;
  horizonWeeks: number;
  currentCashBalance: number;
  buckets: CashFlowForecastBucket[];
  totalProjectedInflow: number;
  totalProjectedOutflow: number;
  netProjectedChange: number;
  minimumProjectedBalance: number;
}

export interface TallyExportBatch {
  id: string;
  batchNumber: string;
  exportDate: string;
  fromDate: string;
  toDate: string;
  voucherTypes: string[];
  voucherCount: number;
  xmlPayloadLength: number;
  fileName: string;
  status: 'Exported';
  createdAt: number;
}

