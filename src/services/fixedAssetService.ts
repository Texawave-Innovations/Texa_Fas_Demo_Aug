// src/services/fixedAssetService.ts
// Fixed Asset Register & Depreciation Management Engine:
// 1. Asset Register with acquisition costs, categories, useful lives, and GL mapping.
// 2. Straight-Line (SLM) and Written Down Value (WDV) depreciation calculation with salvage floor.
// 3. Duplicate-period execution prevention (rejects already executed runs for the same period).
// 4. Automated balanced double-entry GL journal posting (Dr 5500, Cr 1510) via voucherPostingService.

import { database, ref, createRecord, updateRecord, getAllRecords, logAudit } from '@/services/firebase';
import { safeSub, safeAdd, roundCurrency } from './financeCalculations';
import { postUnifiedVoucher } from './voucherPostingService';
import type {
  FixedAsset,
  FixedAssetCategory,
  DepreciationMethod,
  DepreciationRun,
  DepreciationRunAssetDetail,
  JournalLine,
} from '@/types/accounts';

/**
 * Retrieves all fixed assets from the register.
 */
export const getFixedAssets = async (): Promise<FixedAsset[]> => {
  const records = (await getAllRecords('accounts/fixedAssets')) as FixedAsset[];
  return records.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

/**
 * Creates a new fixed asset in the register.
 */
export const createFixedAsset = async (params: {
  assetNumber?: string;
  name: string;
  category: FixedAssetCategory;
  purchaseDate: string;
  purchaseCost: number;
  salvageValue?: number;
  usefulLifeYears: number;
  depreciationMethod: DepreciationMethod;
  depreciationRatePercent?: number;
  glAssetAccount?: string;
  glDepreciationAccount?: string;
  glAccumulatedDepAccount?: string;
  vendorBillRef?: string;
  location?: string;
  notes?: string;
  userName?: string;
}): Promise<FixedAsset> => {
  const {
    name,
    category,
    purchaseDate,
    purchaseCost,
    salvageValue = 0,
    usefulLifeYears,
    depreciationMethod,
    glAssetAccount = '1500',
    glDepreciationAccount = '5500',
    glAccumulatedDepAccount = '1510',
    vendorBillRef,
    location,
    notes,
    userName = 'Accounts User',
  } = params;

  if (!name.trim()) throw new Error('Asset name is required.');
  if (purchaseCost <= 0) throw new Error('Purchase cost must be greater than zero.');
  if (usefulLifeYears <= 0) throw new Error('Useful life must be at least 1 year.');

  // Default WDV rate percent if not supplied: (1 / usefulLife) * 1.5 * 100 or standard rate
  const depreciationRatePercent =
    params.depreciationRatePercent && params.depreciationRatePercent > 0
      ? params.depreciationRatePercent
      : roundCurrency((1 / usefulLifeYears) * 100 * (depreciationMethod === 'WDV' ? 1.5 : 1));

  const existingAssets = await getFixedAssets();
  const nextNum = existingAssets.length + 1;
  const assetNumber = params.assetNumber || `AST-${new Date().getFullYear()}-${String(nextNum).padStart(4, '0')}`;

  const asset: FixedAsset = {
    id: `fa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    assetNumber,
    name: name.trim(),
    category,
    purchaseDate,
    purchaseCost: roundCurrency(purchaseCost),
    salvageValue: roundCurrency(salvageValue),
    usefulLifeYears,
    depreciationMethod,
    depreciationRatePercent,
    accumulatedDepreciation: 0,
    netBookValue: roundCurrency(purchaseCost),
    status: 'Active',
    glAssetAccount,
    glDepreciationAccount,
    glAccumulatedDepAccount,
    vendorBillRef,
    location,
    notes,
    createdAt: Date.now(),
  };

  await createRecord('accounts/fixedAssets', asset);
  await logAudit('accounts/fixedAssets', asset.id, 'create', `Created fixed asset ${assetNumber} (${name}) for ₹${purchaseCost}`);

  return asset;
};

/**
 * Calculates depreciation for a single asset for one monthly period.
 * Enforces salvage value floor so net book value never drops below salvageValue.
 */
export const calculateAssetPeriodDepreciation = (
  asset: FixedAsset,
  periodType: 'monthly' | 'annual' = 'monthly',
): number => {
  if (asset.status !== 'Active') return 0;
  if (asset.netBookValue <= asset.salvageValue) return 0;

  const depreciableCapacity = roundCurrency(asset.netBookValue - asset.salvageValue);
  if (depreciableCapacity <= 0) return 0;

  let rawDepreciation = 0;

  if (asset.depreciationMethod === 'Straight-Line') {
    // Depreciable base = Cost - Salvage
    const base = safeSub(asset.purchaseCost, asset.salvageValue);
    const totalMonths = Math.max(1, asset.usefulLifeYears * 12);
    rawDepreciation = periodType === 'monthly' ? base / totalMonths : base / asset.usefulLifeYears;
  } else {
    // Written Down Value (WDV) = NBV * Rate%
    const rate = (asset.depreciationRatePercent || 15) / 100;
    rawDepreciation = periodType === 'monthly' ? (asset.netBookValue * rate) / 12 : asset.netBookValue * rate;
  }

  // Cap at remaining depreciable capacity
  const finalDepreciation = roundCurrency(Math.min(rawDepreciation, depreciableCapacity));
  return Math.max(0, finalDepreciation);
};

/**
 * Queries all depreciation runs recorded.
 */
export const getDepreciationRuns = async (): Promise<DepreciationRun[]> => {
  const records = (await getAllRecords('accounts/depreciationRuns')) as DepreciationRun[];
  return records.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

/**
 * Executes a depreciation run for a specified period (e.g. '2026-06').
 * Crucial Safeguards:
 * 1. Checks for duplicate period to prevent posting twice for the same period.
 * 2. Creates balanced double-entry voucher (Dr 5500 Depreciation Expense, Cr 1510 Accumulated Depreciation).
 * 3. Updates asset accumulatedDepreciation and netBookValue.
 */
export const runPeriodDepreciation = async (params: {
  period: string; // e.g. "2026-06"
  runDate: string; // e.g. "2026-06-30"
  assetIds?: string[];
  userName?: string;
}): Promise<DepreciationRun> => {
  const { period, runDate, assetIds, userName = 'Accounts User' } = params;

  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    throw new Error(`Invalid period format "${period}". Expected format: YYYY-MM (e.g. "2026-06").`);
  }

  // 1. DUPLICATE-PERIOD CHECK
  const existingRuns = await getDepreciationRuns();
  const duplicate = existingRuns.find((r) => r.period === period && r.status !== 'Reversed');
  if (duplicate) {
    throw new Error(
      `Depreciation for period "${period}" has already been executed on ${duplicate.runDate} (Run #${duplicate.runNumber}). Duplicate runs are strictly prevented.`,
    );
  }

  // 2. Fetch eligible assets
  const allAssets = await getFixedAssets();
  const eligibleAssets = allAssets.filter((a) => {
    if (a.status !== 'Active') return false;
    if (assetIds && assetIds.length > 0 && !assetIds.includes(a.id)) return false;
    return a.netBookValue > a.salvageValue;
  });

  if (eligibleAssets.length === 0) {
    throw new Error(`No eligible active assets found with depreciable value for period "${period}".`);
  }

  // 3. Compute depreciation per asset
  const details: DepreciationRunAssetDetail[] = [];
  let totalDepreciation = 0;

  for (const asset of eligibleAssets) {
    const depAmount = calculateAssetPeriodDepreciation(asset, 'monthly');
    if (depAmount > 0) {
      details.push({
        assetId: asset.id,
        assetNumber: asset.assetNumber,
        assetName: asset.name,
        openingBookValue: asset.netBookValue,
        depreciationAmount: depAmount,
        closingBookValue: roundCurrency(asset.netBookValue - depAmount),
      });
      totalDepreciation = safeAdd(totalDepreciation, depAmount);
    }
  }

  if (totalDepreciation <= 0 || details.length === 0) {
    throw new Error(`Calculated depreciation total is ₹0. No assets require depreciation for this period.`);
  }

  const runNumber = `DEP-${period.replace('-', '')}-${String(existingRuns.length + 1).padStart(3, '0')}`;

  // 4. GENERATE BALANCED DOUBLE-ENTRY JOURNAL VOUCHER
  const voucherLines: JournalLine[] = [
    {
      accountId: '5500',
      accountName: 'Depreciation Expense',
      debit: totalDepreciation,
      credit: 0,
    },
    {
      accountId: '1510',
      accountName: 'Accumulated Depreciation',
      debit: 0,
      credit: totalDepreciation,
    },
  ];

  const voucher = await postUnifiedVoucher({
    date: runDate,
    voucherType: 'Journal',
    sourceType: 'FixedAsset',
    sourceId: runNumber,
    sourceNumber: runNumber,
    narration: `Depreciation run for period ${period} across ${details.length} fixed assets`,
    lines: voucherLines,
  });

  // 5. UPDATE ASSETS IN DATABASE
  for (const detail of details) {
    const original = eligibleAssets.find((a) => a.id === detail.assetId);
    if (original) {
      const newAccumulated = safeAdd(original.accumulatedDepreciation || 0, detail.depreciationAmount);
      const newNetBookValue = roundCurrency(original.purchaseCost - newAccumulated);
      await updateRecord('accounts/fixedAssets', detail.assetId, {
        accumulatedDepreciation: newAccumulated,
        netBookValue: newNetBookValue,
        updatedAt: Date.now(),
      });
    }
  }

  // 6. SAVE DEPRECIATION RUN RECORD
  const runRecord: DepreciationRun = {
    id: `dep_run_${Date.now()}`,
    runNumber,
    period,
    runDate,
    method: 'Mixed',
    assetCount: details.length,
    totalDepreciation,
    voucherId: voucher.voucherId,
    voucherNumber: voucher.voucherNumber,
    details,
    status: 'Posted',
    createdAt: Date.now(),
  };

  await createRecord('accounts/depreciationRuns', runRecord);
  await logAudit('accounts/depreciationRuns', runRecord.id, 'create', `Executed depreciation run ${runNumber} for period ${period}: ₹${totalDepreciation} (${details.length} assets)`);

  return runRecord;
};

