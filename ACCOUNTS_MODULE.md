# Accounts & Finance Module Documentation

> **Master Architecture & Workflow Guide**: See [`docs/ACCOUNTS_ARCHITECTURE_AND_WORKFLOW.md`](docs/ACCOUNTS_ARCHITECTURE_AND_WORKFLOW.md) for full system architecture diagrams, end-to-end workflow sequence diagrams, data dictionary, and complete operational guide.

## 1. Overview & Architecture

The FCS ERP Accounts & Finance module provides enterprise-grade financial management, settlement workflows, procurement verification, and double-entry accounting for manufacturing operations.

### Clean Boundaries & Source of Truth

- **Sales Ownership**: Customer invoices, receivables, and collections originate in and are owned by the Sales module (`sales/invoices`). Finance provides high-level visibility, ageing analytics, and statement reporting linked directly to Sales source records.
- **Inventory & Stores Ownership**: Physical Goods Receipt Notes (`stores/grn`), purchase return inspections, and warehouse stock movements are owned by Stores and Quality. Finance performs advisory 3-way matching and debit adjustments without mutating physical stock quantities or creating synthetic inventory movements.
- **Finance Ownership**: Finance owns vendor bills, supplier payments, supplier advance disbursements, debit notes / supplier credits, the General Ledger voucher register (`accounts/journals`), Chart of Accounts, period locks, bank reconciliations, and financial statements.

---

## 2. Phase 1 Features: Supplier Settlements & Financial Visibility

### A. 5-Bucket Receivables & Payables Ageing
- **Engine**: Located in `src/services/financeCalculations.ts` (`calculateReceivablesAgeing` and `calculatePayablesAgeing`).
- **Buckets**:
  1. *Not yet due* (due date > as-of date)
  2. *1–30 days overdue*
  3. *31–60 days overdue*
  4. *61–90 days overdue*
  5. *More than 90 days overdue*
  6. *Unassigned due dates* (tracked and displayed separately so missing dates are not hidden).
- **As-Of Date Simulation**: Historical receivables and payables calculate balances effective as of the selected date.

### B. Concurrency-Safe Partial Bill Settlements
- **Service**: `src/services/settlementService.ts` (`recordBillPayment`).
- **Safety**: Atomic updates executed via Firebase `runTransaction` to prevent race conditions and concurrent over-settlements.
- **Traceability**: Generates discrete payment vouchers (`SPV-...`), updates bank account balances, posts balanced double-entry journals, and logs detailed audit trails.

### C. Supplier Advances & Non-Cash Allocations
- **Disbursement**: Records cash outflows to suppliers prior to bill receipt (`ADV-...`).
- **Allocation**: Directly allocates available advances to open vendor bills. Reduces bill liability without secondary cash movements, preventing duplicate cash deductions.
- **Traceable Reversals**: Allows reversing advance allocations with a mandatory audit reason, restoring advance remaining amounts and bill open balances.

### D. Party Statements (Customer & Supplier)
- Generates itemized statement of accounts showing opening balance, debit/credit transactions, and running balances over any date window.
- Exports to CSV and PDF.

---

## 3. Phase 2 Features: Procurement Integration & Accounting Foundation

### A. PO–GRN–Bill 3-Way Matching
- **Service**: `src/services/procurementMatchingService.ts` (`analyzeBillGrnMatching`, `confirmBillGrnMatching`).
- **Matching Engine**: Compares vendor bill item descriptions, quantities, and rates against accepted Goods Receipt Notes (`stores/grn`).
- **Cumulative Consumption Tracking**: Tracks cumulative quantities matched across all bills (`accounts/billGrnMatches`), ensuring the same warehouse receipt cannot be consumed repeatedly.
- **Discrepancy Detection**: Identifies shortages (billed qty > available received qty), excess billing, and partial deliveries.
- **Advisory Review**: Non-blocking advisory review by default. Verifies procurement integrity without modifying physical stock levels.

### B. Purchase Returns & Supplier Credits (Debit Notes)
- **Service**: `src/services/settlementService.ts` (`recordSupplierCredit`, `allocateSupplierCredit`).
- **Integration**: Links debit adjustments (`DN-...`) to purchase return references and open vendor bills.
- **Three Settlement Modes**:
  1. `ReduceBillBalance`: Automatically applies the debit note against an open bill, decreasing outstanding liability.
  2. `RefundCash`: Records a cash refund deposit into the selected bank account and posts balanced double-entry entries.
  3. `KeepAsCreditNote`: Retains available credit for future bill allocations.
- **Non-Cash Allocation**: Allocates existing credit notes to any open bill of that supplier with zero duplicate cash movements.

### C. Unified Vouchers & Automated Double-Entry Postings
- **Service**: `src/services/voucherPostingService.ts` (`postUnifiedVoucher`).
- **Unified Store**: Both automated system vouchers and manual journal entries reside in a single backing store (`accounts/journals`), avoiding duplicated engines.
- **Strict Invariants**:
  - Balanced entries: `totalDebit === totalCredit`.
  - Negative line amounts strictly forbidden.
  - At least two valid ledger lines required.
- **Durable Deduplication**: Prevents duplicate postings for the same source document.

### D. Accounting Period Locks & Controlled Activation
- **Period Locks**: Configured under `accounts/periodLocks/current`. Entries on or prior to the locked date cannot be posted, edited, or reversed.
- **Controlled Activation**:
  - `validation` mode: System posts simulation preview vouchers without mutating live balances.
  - `active` mode: All vouchers post directly to the live General Ledger.
  - One-click cutover activation commits validation vouchers and switches system to live posting.

### E. Immutable Reciprocal Reversals
- **Convention**: Posted vouchers cannot be deleted or mutated.
- **Reciprocal Voucher**: Reversing a voucher posts a reciprocal voucher (`REV-...`) with swapped Debits and Credits and links both entries.
- **Net Zero**: Both the original and reversal vouchers remain in the General Ledger and net exactly to zero.

### F. General Ledger Drilldown & Multi-Column Trial Balance
- **Ledger Drilldown**: Drill down into any Chart of Account from the Chart of Accounts modal to inspect date-filtered running ledger entries.
- **Trial Balance Engine**: Located in `src/services/ledgerTrialBalanceService.ts` (`generateTrialBalance`).
- **Format**: Multi-column statement showing:
  - Account Code, Name, Type
  - Opening Balance (Dr & Cr)
  - Period Movements (Dr & Cr)
  - Closing Balance (Dr & Cr)
- **Honest Discrepancy Reporting**: If total Debits != total Credits, the difference is reported prominently. **Zero balancing plugs or synthetic suspense accounts are inserted.**
- **Exports**: Exportable to CSV and PDF.

### G. Bank Statement CSV Import & Reconciliation Matching
- **Service**: `src/services/bankImportMatchingService.ts` (`parseBankStatementCSV`, `findCandidateMatchesForStatementRow`, `confirmStatementMatch`).
- **Import**: Parses bank CSV statements with configurable column mapping (Date, Description, Withdrawal, Deposit, Balance, Reference).
- **Fingerprinting**: SHA-256 fingerprint hashing prevents duplicate statement uploads.
- **Intelligent Matching**: Suggests matches against recorded bank transactions, bills, and payments based on amount, date proximity, and reference matching.
- **Safe Confirmation**: Match confirmation marks records as reconciled without fabricating duplicate cash movements.

---

## 4. Firebase Schema & Storage Paths

| Path | Description | Key Fields |
|------|-------------|------------|
| `accounts/bills` | Vendor Bills (AP) | `id`, `billNumber`, `vendorName`, `billDate`, `dueDate`, `grandTotal`, `paidAmount`, `status` |
| `accounts/billPayments` | Supplier Payment Vouchers | `id`, `paymentNumber`, `billId`, `amount`, `bankAccountId`, `paymentMethod`, `paymentDate` |
| `accounts/supplierAdvances` | Supplier Prepayments | `id`, `advanceNumber`, `vendorName`, `amount`, `allocatedAmount`, `remainingAmount`, `status` |
| `accounts/advanceAllocations` | Advance to Bill Allocations | `id`, `advanceId`, `billId`, `amount`, `date`, `status` (`Active` \| `Reversed`) |
| `accounts/supplierCredits` | Debit Notes / Supplier Credits | `id`, `creditNumber`, `vendorName`, `amount`, `allocatedAmount`, `remainingAmount`, `settlementEffect` |
| `accounts/billGrnMatches` | 3-Way Match Verification Records | `id`, `billId`, `grnId`, `matchedQty`, `billedQty`, `receivedQty`, `priceVariance`, `status` |
| `accounts/journals` | Unified General Ledger Vouchers | `id`, `voucherNumber`, `voucherType`, `date`, `lines`, `totalDebit`, `totalCredit`, `status` |
| `accounts/chartOfAccounts` | Chart of Accounts Register | `id`, `code`, `name`, `type`, `subType`, `openingBalance`, `status` |
| `accounts/bankAccounts` | Configured Bank Accounts | `id`, `accountName`, `accountNumber`, `bankName`, `accountType`, `currentBalance` |
| `accounts/bankTransactions` | Bank Outflows & Deposits | `id`, `bankAccountId`, `date`, `amount`, `type`, `reconciled` |
| `accounts/bankStatements` | Imported Bank Statements | `id`, `bankAccountId`, `statementHash`, `rowCount`, `matchedCount` |
| `accounts/periodLocks/current` | Accounting Period Lock | `lockDate`, `lockedAt`, `lockedBy`, `notes` |
| `accounts/postingConfig` | Posting Mode Configuration | `postingMode` (`validation` \| `active`), `cutoverDate` |

---

## 4. Phase 3 Features: Manufacturing Cost Accounting & Integrations

### A. Inventory Valuation (RM, WIP, FG) & Missing-Cost Exceptions
- **Service**: `src/services/manufacturingCostService.ts` (`calculateInventoryValuation`).
- **Scope**:
  - **Raw Materials (`stores/raw`)**: Derives unit purchase rates from approved vendor bills (`accounts/bills`) and warehouse Goods Receipts (`stores/grn`).
  - **Work In Progress (`stores/wip`)**: Applies stage conversion multipliers (Mixing: +20%, Moulding: +45%, Curing: +65%, Finishing: +85%, QC Pending: +95%) atop base raw material costs.
  - **Finished Goods (`stores/fg`)**: Evaluates finished stock against completed production job costs or standard manufacturing BOM benchmarks (1.95× compound base rate).
- **Ledger Reconciliation**: Reconciles total physical valuation against GL Account `1400 - Inventory` and reports any unreconciled variance truthfully.
- **Honest Exception Flagging**: Any item lacking a verifiable purchase bill or GRN rate is flagged prominently in a dedicated Missing-Cost Exceptions panel with item code, category, and quantity. Unknown costs are never plugged or concealed.

### B. Production / Job Costing & Loss Treatment
- **Service**: `src/services/manufacturingCostService.ts` (`calculateProductionCosting`).
- **Cost Accumulation**:
  $$\text{Total Cost} = \text{Direct Materials} + \text{Direct Labour} + \text{Subcontracting} + \text{Factory Overhead} - \text{Scrap Credit}$$
- **Handling Incomplete & Zero-Output Jobs**:
  - **In Progress (WIP)**: Unit cost is set to ₹0.00 and marked as `WIP Accumulated` to prevent premature cost distortion.
  - **Zero Output (Setup/Scrap Trial Runs)**: Unit cost is set to ₹0.00 without division-by-zero errors. Total incurred cost is tracked and treated as period manufacturing loss.
  - **Completed Jobs**: Unit cost is accurately calculated as `totalCost / outputQty`.

### C. Subcontractor / Job-Work Payables & Section 194C TDS
- **Module View**: `src/modules/accounts/Expenses.tsx` (Subcontractor Bill Mode).
- **Functionality**: Links supplier service bills directly to Job-Work Orders and production receipts.
- **Tax Deducted at Source (TDS)**: Automatically computes Section 194C withholding tax (e.g. 1% for individual/HUF, 2% for company contractors) and computes net payable:
  $$\text{Net Payable} = \text{Grand Total} - \text{TDS Withholding}$$
- **Zero Stock Movement**: Records service payables without creating fictitious or duplicate raw material movements.

### D. Landed Cost Allocation & Non-Duplication
- **Service**: `src/services/manufacturingCostService.ts` (`allocateLandedCost`).
- **UI**: `src/modules/accounts/Expenses.tsx` (Tab 5 "Landed Costs").
- **Allocation Bases**: Allocates freight, customs, handling, and insurance across bill lines or GRN lines by:
  - Line Quantity
  - Line Value
  - Line Weight
- **Deterministic Penny Rounding**: Proportional fractional rounding discrepancies are reconciled by adding the remainder to the largest allocated line, guaranteeing:
  $$\sum \text{Allocated Lines} \equiv \text{Total Landed Expense}$$
- **P&L Double-Counting Prevention**: Capitalized expenses are marked `capitalizedToInventory: true`. The Profit & Loss report filters out capitalized expenses (`!expense.capitalizedToInventory`), ensuring shipping costs are absorbed into inventory assets rather than expensed twice.

### E. Product / Job Profitability (Units Sold Matching)
- **Service**: `src/services/manufacturingCostService.ts` (`calculateProductProfitability`).
- **UI**: `src/modules/accounts/AccountsReports.tsx` (Tab "Profitability").
- **Core Principle**: Sales revenue is matched strictly against manufacturing cost for **units sold**:
  $$\text{COGS Sold} = \text{Sold Qty} \times \text{Unit Manufacturing Cost}$$
  $$\text{Gross Profit} = \text{Sales Revenue} - \text{COGS Sold}$$
- **Inventory Capitalization**: Unsold units remain capitalized as assets on the Balance Sheet (`unsoldQty * unitCost`) rather than distorting current period margins.

### F. Fixed Assets Register & Depreciation Engine
- **Service**: `src/services/fixedAssetService.ts` (`createFixedAsset`, `calculateAssetPeriodDepreciation`, `runPeriodDepreciation`).
- **UI Route**: `/finance/fixed-assets` (`src/modules/accounts/FixedAssets.tsx`).
- **Depreciation Methods**:
  - **Straight-Line Method (SLM)**: $\frac{\text{Cost} - \text{Salvage}}{\text{Useful Life} \times 12}$
  - **Written Down Value (WDV)**: $\frac{\text{Net Book Value} \times \text{Rate}\%}{12}$
- **Salvage Value Floor**: Depreciation automatically caps so Net Book Value never drops below the asset's salvage value.
- **Duplicate-Period Prevention**: Checks `accounts/depreciationRuns` to block duplicate execution for the same accounting period (e.g., `2026-06`).
- **Balanced GL Posting**: Automatically generates and posts a balanced journal voucher:
  - **Debit 5500** (Depreciation Expense)
  - **Credit 1510** (Accumulated Depreciation)

### G. Manufacturing Cash-Flow Forecast (Rolling 8-Week)
- **Service**: `src/services/cashFlowForecastService.ts` (`generateCashFlowForecast`).
- **UI**: `src/modules/accounts/AccountsReports.tsx` (Cash Flow sub-view).
- **Prospective Liquidity**:
  - **Cash Inflows**: Open sales invoices grouped by due dates.
  - **Cash Outflows**: Open vendor bills grouped by due dates + weekly factory overheads.
  - **Unbilled PO Commitments**: Unbilled purchase orders due within the period. **Already-billed POs are strictly excluded** to prevent double-counting obligations.
- **Safety Cushion Alert**: Highlights when projected closing balance falls below configured liquidity safety threshold (e.g. ₹50,000).

### H. Tally XML Voucher Exporter
- **Service**: `src/services/tallyExportService.ts` (`generateTallyXmlString`, `exportVouchersToTallyXml`).
- **Export Standard**: Generates standard TallyPrime / Tally ERP 9 XML envelope (`<ENVELOPE>`, `<HEADER>`, `<BODY>`, `<TALLYMESSAGE>`).
- **Debit Sign Convention**: Complies with Tally's internal convention where debit entries carry a negative amount (`-amount`) and credit entries carry a positive amount (`+amount`).
- **Ledger Mapping**: Maps FCS account codes (`1000` -> `Cash`, `1400` -> `Stock-in-Hand`, `1510` -> `Accumulated Depreciation`, `5500` -> `Depreciation`, etc.) with user-configurable overrides.
- **Batch History**: Saves export batch records in `accounts/tallyExports` with timestamp, voucher count, and user attribution.

### I. Advisory OCR Notice
- In `src/modules/accounts/Expenses.tsx`, an advisory banner informs the user whether an OCR extraction service (e.g., Tesseract or Document AI) is active or in fallback mode.
- Manual review and editing of bill drafts remain seamless and fully supported.

---

## 5. Firebase Schema & Storage Paths

| Path | Description | Key Fields |
|------|-------------|------------|
| `accounts/bills` | Vendor Bills (AP) | `id`, `billNumber`, `vendorName`, `billDate`, `dueDate`, `grandTotal`, `paidAmount`, `status`, `capitalizedToInventory`, `billType`, `jobWorkOrderNo`, `tdsAmount` |
| `accounts/billPayments` | Supplier Payment Vouchers | `id`, `paymentNumber`, `billId`, `amount`, `bankAccountId`, `paymentMethod`, `paymentDate` |
| `accounts/supplierAdvances` | Supplier Prepayments | `id`, `advanceNumber`, `vendorName`, `amount`, `allocatedAmount`, `remainingAmount`, `status` |
| `accounts/advanceAllocations` | Advance to Bill Allocations | `id`, `advanceId`, `billId`, `amount`, `date`, `status` (`Active` \| `Reversed`) |
| `accounts/supplierCredits` | Debit Notes / Supplier Credits | `id`, `creditNumber`, `vendorName`, `amount`, `allocatedAmount`, `remainingAmount`, `settlementEffect` |
| `accounts/billGrnMatches` | 3-Way Match Verification Records | `id`, `billId`, `grnId`, `matchedQty`, `billedQty`, `receivedQty`, `priceVariance`, `status` |
| `accounts/journals` | Unified General Ledger Vouchers | `id`, `voucherNumber`, `voucherType`, `date`, `lines`, `totalDebit`, `totalCredit`, `status` |
| `accounts/chartOfAccounts` | Chart of Accounts Register | `id`, `code`, `name`, `type`, `subType`, `openingBalance`, `status` |
| `accounts/bankAccounts` | Configured Bank Accounts | `id`, `accountName`, `accountNumber`, `bankName`, `accountType`, `currentBalance` |
| `accounts/bankTransactions` | Bank Outflows & Deposits | `id`, `bankAccountId`, `date`, `amount`, `type`, `reconciled` |
| `accounts/bankStatements` | Imported Bank Statements | `id`, `bankAccountId`, `statementHash`, `rowCount`, `matchedCount` |
| `accounts/fixedAssets` | Fixed Asset Master Register | `id`, `assetNumber`, `name`, `category`, `purchaseCost`, `salvageValue`, `usefulLifeYears`, `depreciationMethod`, `netBookValue` |
| `accounts/depreciationRuns` | Periodic Depreciation Runs | `id`, `runNumber`, `period`, `runDate`, `totalDepreciation`, `voucherNumber`, `status` |
| `accounts/landedCostAllocations`| Capitalized Landed Cost Allocations | `id`, `allocationNumber`, `date`, `totalLandedCost`, `allocationBasis`, `lines` |
| `accounts/tallyExports` | Tally XML Export Batch Logs | `id`, `exportNumber`, `voucherCount`, `periodStart`, `periodEnd`, `exportedAt` |
| `accounts/periodLocks/current` | Accounting Period Lock | `lockDate`, `lockedAt`, `lockedBy`, `notes` |
| `accounts/postingConfig` | Posting Mode Configuration | `postingMode` (`validation` \| `active`), `cutoverDate` |

---

## 6. Verification & Testing

Automated test suites verify all financial calculations and accounting invariants standalone without requiring live database connections:

```bash
# Run Phase 1 verification tests (Ageing buckets, settlements, advances, statements)
node scripts/testPhase1Finance.mjs

# Run Phase 2 verification tests (3-way matching, double-entry invariants, period locks, reversals, trial balance)
node scripts/testPhase2Finance.mjs

# Run Phase 3 verification tests (Inventory valuation, job costing, landed costs, profitability, fixed assets, cash forecast, Tally XML)
node scripts/testPhase3Finance.mjs
```

