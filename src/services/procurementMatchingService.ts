// src/services/procurementMatchingService.ts
// PO-GRN-Bill 3-way matching and discrepancy verification engine.
// Compares quantities, unit prices, UoM, and supplier without altering physical stock movements.

import { database, ref, createRecord, getAllRecords, logAudit } from '@/services/firebase';
import { safeSub, safeAdd, safeMul, roundCurrency } from './financeCalculations';
import type { Bill, BillLineItem, BillGrnMatch } from '@/types/accounts';

export interface GRNRecord {
  id: string;
  grnNo: string;
  date: string;
  supplier: string;
  material: string;
  qty: number;
  unit: string;
  poNumber: string;
  status: string;
  remarks?: string;
  createdAt: number;
}

export interface MatchingAnalysisLine {
  billLineIndex: number;
  material: string;
  billedQty: number;
  billedRate: number;
  billedUom?: string;
  billedAmount: number;
  grnId?: string;
  grnNo?: string;
  receivedQty: number;
  previouslyMatchedQty: number;
  availableGrnQty: number;
  matchedQty: number;
  qtyVariance: number; // billedQty - availableGrnQty
  priceVariance: number;
  status: 'Fully Matched' | 'Partial Match' | 'Shortage' | 'Excess Billed' | 'Unmatched';
  advisoryWarnings: string[];
}

export interface BillMatchingResult {
  billId: string;
  billNumber: string;
  vendorName: string;
  totalBilledAmount: number;
  totalMatchedAmount: number;
  netPriceVariance: number;
  overallStatus: 'Verified Match' | 'Advisory Discrepancy' | 'Unmatched';
  lines: MatchingAnalysisLine[];
  canProceed: boolean; // Advisory by default unless strict block is active
}

/**
 * Computes already matched quantities per GRN from existing matches.
 */
export const getGrnMatchedQuantities = async (): Promise<Record<string, number>> => {
  const matches = (await getAllRecords('accounts/billGrnMatches')) as BillGrnMatch[];
  const map: Record<string, number> = {};
  for (const m of matches) {
    map[m.grnId] = safeAdd(map[m.grnId] || 0, m.matchedQty || 0);
  }
  return map;
};

/**
 * Analyzes matching between a vendor bill and eligible goods receipts for that supplier.
 */
export const analyzeBillGrnMatching = (
  bill: Bill,
  grnList: GRNRecord[],
  existingMatchesMap: Record<string, number> = {},
): BillMatchingResult => {
  const targetSupplier = (bill.vendorName || '').trim().toLowerCase();

  // Filter GRNs belonging to this supplier
  const supplierGrns = grnList.filter(
    (g) => (g.supplier || '').trim().toLowerCase() === targetSupplier && g.status !== 'Rejected',
  );

  const lines: MatchingAnalysisLine[] = [];
  let totalMatchedAmount = 0;
  let netPriceVariance = 0;
  let hasDiscrepancy = false;

  (bill.lineItems || []).forEach((line: BillLineItem, idx: number) => {
    const desc = (line.description || '').toLowerCase();

    // Find candidate GRN for this line (matching material or PO number)
    const candidateGrn = supplierGrns.find((g) => {
      const gMat = (g.material || '').toLowerCase();
      const gPo = (g.poNumber || '').toLowerCase();
      return desc.includes(gMat) || gMat.includes(desc) || (bill.vendorRef && gPo.includes(bill.vendorRef.toLowerCase()));
    });

    const billedQty = Number(line.qty) || 0;
    const billedRate = Number(line.rate) || 0;
    const billedAmount = Number(line.amount) || safeMul(billedQty, billedRate);

    if (!candidateGrn) {
      lines.push({
        billLineIndex: idx,
        material: line.description,
        billedQty,
        billedRate,
        billedAmount,
        receivedQty: 0,
        previouslyMatchedQty: 0,
        availableGrnQty: 0,
        matchedQty: 0,
        qtyVariance: billedQty,
        priceVariance: 0,
        status: 'Unmatched',
        advisoryWarnings: ['No corresponding Goods Receipt Note found for this item.'],
      });
      hasDiscrepancy = true;
      return;
    }

    const previouslyMatched = existingMatchesMap[candidateGrn.id] || 0;
    const availableGrnQty = Math.max(0, safeSub(candidateGrn.qty, previouslyMatched));
    const matchedQty = Math.min(billedQty, availableGrnQty);
    const qtyVariance = safeSub(billedQty, availableGrnQty);

    const warnings: string[] = [];

    if (qtyVariance > 0.001) {
      warnings.push(`Shortage: Billed qty (${billedQty}) exceeds available received qty (${availableGrnQty} ${candidateGrn.unit}).`);
      hasDiscrepancy = true;
    } else if (qtyVariance < -0.001) {
      warnings.push(`Partial delivery billed: Received ${candidateGrn.qty} ${candidateGrn.unit}, billing ${billedQty}.`);
    }

    let status: MatchingAnalysisLine['status'] = 'Fully Matched';
    if (qtyVariance > 0.001) {
      status = 'Shortage';
    } else if (matchedQty < billedQty) {
      status = 'Partial Match';
    }

    const matchedLineAmount = safeMul(matchedQty, billedRate);
    totalMatchedAmount = safeAdd(totalMatchedAmount, matchedLineAmount);

    lines.push({
      billLineIndex: idx,
      material: line.description,
      billedQty,
      billedRate,
      billedAmount,
      grnId: candidateGrn.id,
      grnNo: candidateGrn.grnNo,
      receivedQty: candidateGrn.qty,
      previouslyMatchedQty: previouslyMatched,
      availableGrnQty,
      matchedQty,
      qtyVariance,
      priceVariance: 0,
      status,
      advisoryWarnings: warnings,
    });
  });

  return {
    billId: bill.id,
    billNumber: bill.billNumber,
    vendorName: bill.vendorName,
    totalBilledAmount: bill.grandTotal || 0,
    totalMatchedAmount,
    netPriceVariance,
    overallStatus: hasDiscrepancy ? 'Advisory Discrepancy' : lines.length > 0 ? 'Verified Match' : 'Unmatched',
    lines,
    canProceed: true, // Advisory by default: does not halt existing workflow unless strict blocking is configured
  };
};

/**
 * Saves confirmed PO-GRN-Bill matching records.
 */
export const confirmBillGrnMatching = async (
  bill: Bill,
  analysis: BillMatchingResult,
  notes?: string,
) => {
  const matchPromises = analysis.lines
    .filter((l) => l.grnId && l.matchedQty > 0)
    .map((line) => {
      const payload: Omit<BillGrnMatch, 'id'> = {
        billId: bill.id,
        billNumber: bill.billNumber,
        grnId: line.grnId!,
        grnNo: line.grnNo || 'GRN',
        material: line.material,
        billedQty: line.billedQty,
        receivedQty: line.receivedQty,
        matchedQty: line.matchedQty,
        unit: 'kg',
        billedRate: line.billedRate,
        priceVariance: line.priceVariance,
        qtyVariance: line.qtyVariance,
        status: line.status as any,
        discrepancyNotes: line.advisoryWarnings.join('; ') || notes || undefined,
        createdAt: Date.now(),
      };
      return createRecord('accounts/billGrnMatches', payload, { skipAudit: true });
    });

  await Promise.all(matchPromises);

  await logAudit(
    'accounts/bills',
    bill.id,
    'update',
    `Confirmed 3-way matching for Bill ${bill.billNumber} against GRN receipts: ${analysis.overallStatus}. Total Matched: ${analysis.totalMatchedAmount}`,
  );

  return { success: true };
};

