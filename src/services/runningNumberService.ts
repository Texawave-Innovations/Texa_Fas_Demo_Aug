// src/services/runningNumberService.ts
// Central service for managing running numbers across all sales documents.
// Firebase path: masters/runningNumbers/<docType>
//   { prefix: "SQFY26-27", nextSeq: 5, updatedAt: "2026/04/04" }

import { database } from '@/services/firebase';
import { ref, get, set, runTransaction } from 'firebase/database';

export type DocType =
  | 'quoteNo'
  | 'soNumber'
  | 'invoiceNo'
  | 'shipmentId'
  | 'dcNo'
  | 'nrgpNo'
  | 'rgpNo';

export interface RunningNumberConfig {
  prefix: string;       // e.g. "SQFY26-27"
  nextSeq: number;      // next number to use, e.g. 1
  updatedAt: string;    // date admin last saved, e.g. "2026/04/04"
}

const BASE_PATH = 'masters/runningNumbers';
const BASE_SEQ = 90; // Starting sequence base (so the next sequence becomes 0091)

// Helper to extract prefix from a fallback string (e.g. "FAS/25-26/12345" -> "FAS/25-26")
function extractPrefix(fallback: string): string {
  if (!fallback) return 'DOC';
  const lastDash = fallback.lastIndexOf('-');
  const lastSlash = fallback.lastIndexOf('/');
  const maxIdx = Math.max(lastDash, lastSlash);
  if (maxIdx > 0) return fallback.substring(0, maxIdx);
  const str = fallback.replace(/\d+$/, '');
  return str || fallback;
}

// ── READ all configs ────────────────────────────────────────────────────────
export async function getAllRunningNumbers(): Promise<Record<DocType, RunningNumberConfig>> {
  const snapshot = await get(ref(database, BASE_PATH));
  return snapshot.exists() ? snapshot.val() : {};
}

// ── READ one config ─────────────────────────────────────────────────────────
export async function getRunningNumberConfig(
  docType: DocType
): Promise<RunningNumberConfig | null> {
  const snapshot = await get(ref(database, `${BASE_PATH}/${docType}`));
  return snapshot.exists() ? snapshot.val() : null;
}

// ── SAVE config (admin master list) ─────────────────────────────────────────
// Saves the prefix + resets nextSeq to BASE_SEQ + 1. Called when admin clicks ✅.
export async function saveRunningNumberConfig(
  docType: DocType,
  prefix: string,
  updatedAt: string
): Promise<void> {
  await set(ref(database, `${BASE_PATH}/${docType}`), {
    prefix,
    nextSeq: BASE_SEQ + 1,
    updatedAt,
  } satisfies RunningNumberConfig);
}

// Preview the number without incrementing
export async function peekNextNumber(docType: DocType, fallback: string): Promise<string> {
  const configRef = ref(database, `${BASE_PATH}/${docType}`);
  const snapshot = await get(configRef);
  if (!snapshot.exists()) {
    const prefix = extractPrefix(fallback);
    return `${prefix}-${String(BASE_SEQ + 1).padStart(4, '0')}`;
  }
  
  const current = snapshot.val() as RunningNumberConfig;
  const seq = current.nextSeq ?? (BASE_SEQ + 1);
  return `${current.prefix}-${String(seq).padStart(4, '0')}`;
}

// ── GENERATE next number (called by sales pages) ────────────────────────────
// Uses a Firebase transaction to atomically increment nextSeq.
// Returns a formatted number like "SQFY26-27-0091"
// Automatically initializes the config with BASE_SEQ + 1 if no master config is set.
export async function generateNextNumber(
  docType: DocType,
  fallback: string
): Promise<string> {
  const configRef = ref(database, `${BASE_PATH}/${docType}`);

  let generatedNumber = '';

  await runTransaction(configRef, (current: RunningNumberConfig | null) => {
    if (!current) {
      // Auto-initialize if it doesn't exist
      const prefix = extractPrefix(fallback);
      generatedNumber = `${prefix}-${String(BASE_SEQ + 1).padStart(4, '0')}`;
      return {
        prefix,
        nextSeq: BASE_SEQ + 2,
        updatedAt: new Date().toISOString()
      };
    }

    const seq = current.nextSeq ?? (BASE_SEQ + 1);
    generatedNumber = `${current.prefix}-${String(seq).padStart(4, '0')}`;
    return { ...current, nextSeq: seq + 1 };
  });

  return generatedNumber;
}
