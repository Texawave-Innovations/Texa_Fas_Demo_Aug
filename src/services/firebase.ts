// src/services/firebase.ts

import { initializeApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  push,
  set,
  get,
  update,
  remove,
  query,
  orderByChild,
  runTransaction,
} from 'firebase/database';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { AuditAction } from '@/types/auditTrail';

 const firebaseConfig = {
  apiKey: "AIzaSyBlYRmC04NUje53nm1Nt9t8Rg9945DlFnA",
  authDomain: "fluro-92c1c.firebaseapp.com",
  databaseURL: "https://fluro-92c1c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "fluro-92c1c",
  storageBucket: "fluro-92c1c.firebasestorage.app",
  messagingSenderId: "316975869540",
  appId: "1:316975869540:web:19247d407fa07b7968b971"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const storage = getStorage(app);

 // ---------------------------------------------------------------------------
// SANITIZE — strips undefined values (Firebase rejects them)
// ---------------------------------------------------------------------------
const sanitize = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(sanitize);
  if (typeof obj === 'object') {
    const clean: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined) {
        clean[key] = sanitize(val);
      }
    }
    return clean;
  }
  return obj;
};

// ---------------------------------------------------------------------------
// AUDIT TRAIL — append-only log, written directly (never via createRecord,
// to avoid recursively logging the audit log itself).
// ---------------------------------------------------------------------------
const AUDIT_PATH = 'auditTrail/entries';

const currentAuditUser = (): { username: string; name: string; role: string } => {
  try {
    const raw = localStorage.getItem('erp_user');
    if (raw) {
      const u = JSON.parse(raw);
      return { username: u.username || 'unknown', name: u.name || u.username || 'Unknown', role: u.role || 'unknown' };
    }
  } catch { /* ignore */ }
  return { username: 'system', name: 'System', role: 'system' };
};

export const logAudit = async (
  entityPath: string,
  recordId: string | null,
  action: AuditAction,
  details?: string,
  actingUser?: { username: string; name: string; role: string },
) => {
  try {
    const { username, name, role } = actingUser || currentAuditUser();
    const listRef = ref(database, AUDIT_PATH);
    const newRef = push(listRef);
    await set(newRef, sanitize({
      id: newRef.key,
      entityPath,
      recordId,
      action,
      byUser: username,
      byUserName: name,
      byUserRole: role,
      at: Date.now(),
      details: details ?? null,
    }));
  } catch (err) {
    // Never let audit logging break the calling operation
    console.error('Failed to write audit entry:', err);
  }
};

// ---------------------------------------------------------------------------
// CREATE RECORD
// ---------------------------------------------------------------------------
export const createRecord = async (path: string, data: any, options?: { skipAudit?: boolean }) => {
  const listRef = ref(database, path);
  const newRef = push(listRef);

  await set(newRef, sanitize({
    ...data,
    id: newRef.key,
    createdAt: Date.now(),
  }));

  if (!path.startsWith('auditTrail') && !options?.skipAudit) {
    logAudit(path, newRef.key, 'create');
  }

  return newRef.key;
};

// ---------------------------------------------------------------------------
// UPDATE SINGLE RECORD
// ---------------------------------------------------------------------------
export const updateRecord = async (path: string, id: string, data: any, options?: { skipAudit?: boolean }) => {
  const recordRef = ref(database, `${path}/${id}`);
  await update(recordRef, sanitize({
    ...data,
    updatedAt: Date.now(),
  }));

  // Callers that log a richer, more specific audit entry themselves (e.g.
  // 'payment_made', 'permission_change') pass skipAudit to avoid a generic
  // duplicate alongside it.
  if (!path.startsWith('auditTrail') && !options?.skipAudit) {
    logAudit(path, id, 'update');
  }
};

// ---------------------------------------------------------------------------
// BATCH UPDATE (Multiple fields across multiple records in one atomic write)
// ---------------------------------------------------------------------------
export const batchUpdate = async (path: string, updates: Array<{ id: string; updates: any }>) => {
  const updatesObj: Record<string, any> = {};

  updates.forEach(({ id, updates }) => {
    updatesObj[`${path}/${id}`] = sanitize({
      ...updates,
      updatedAt: Date.now(),
    });
  });

  await update(ref(database), updatesObj);

  if (!path.startsWith('auditTrail')) {
    logAudit(path, null, 'update', `Batch update of ${updates.length} record(s): ${updates.map(u => u.id).join(', ')}`);
  }
};
// ---------------------------------------------------------------------------
// DELETE RECORD
// ---------------------------------------------------------------------------
export const deleteRecord = async (path: string, id: string) => {
  const recordRef = ref(database, `${path}/${id}`);
  await remove(recordRef);

  if (!path.startsWith('auditTrail')) {
    logAudit(path, id, 'delete');
  }
};

// ---------------------------------------------------------------------------
// GET RECORD BY ID
// ---------------------------------------------------------------------------
export const getRecordById = async (path: string, id: string) => {
  const recordRef = ref(database, `${path}/${id}`);
  const snapshot = await get(recordRef);

  return snapshot.exists() ? { ...snapshot.val(), id } : null;
};

// Legacy alias (for backward compatibility)
export const getRecord = getRecordById;

// ---------------------------------------------------------------------------
// GET ALL RECORDS
// ---------------------------------------------------------------------------
export const getAllRecords = async (path: string) => {
  const listRef = ref(database, path);
  const snapshot = await get(listRef);

  if (!snapshot.exists()) return [];

  const data = snapshot.val();
  return Object.keys(data).map((key) => ({ ...data[key], id: key }));
};

// ---------------------------------------------------------------------------
// QUERY RECORDS BY CHILD
// ---------------------------------------------------------------------------
export const queryRecords = async (path: string, child: string) => {
  const listRef = ref(database, path);
  const q = query(listRef, orderByChild(child));
  const snapshot = await get(q);

  if (!snapshot.exists()) return [];

  const data = snapshot.val();
  return Object.keys(data).map((key) => ({ ...data[key], id: key }));
};

// ---------------------------------------------------------------------------
// RUN TRANSACTION (Used for safe stock deduction)
// ---------------------------------------------------------------------------
export { runTransaction };

// ---------------------------------------------------------------------------
// EXPORTS FOR DIRECT USE (commonly needed in components)
// ---------------------------------------------------------------------------
export { ref, database };
export { storage, storageRef, uploadBytes, getDownloadURL };
