// src/types/vault.ts — Firebase paths: vault/documents, vault/accessRequests, settings/vaultAccess
// The Document & Drawing Vault is the one place a file lives, instead of the
// ad-hoc *Url fields scattered across other modules (Asset.manualUrl,
// Employee.resumeUrl, Expense.receiptUrl, etc). Two access controls layer on
// top of storage: `classification` scopes visibility by entity (commercial
// vs. a restricted defence-facing division), `sensitivity` gates opening a
// file behind an approval workflow even for users who can see it in the list.

export type VaultCategory = 'Drawing' | 'BOM' | 'Certificate' | 'Export-Control' | 'Manual' | 'Other';
export const VAULT_CATEGORIES: VaultCategory[] = ['Drawing', 'BOM', 'Certificate', 'Export-Control', 'Manual', 'Other'];

// Entity scope. 'defence-unit' documents are filtered out of the list
// entirely for roles not in VaultAccessSettings.defenceRoles — structurally
// invisible, not just hidden by a collapsed section.
export type VaultClassification = 'commercial' | 'defence-unit';

// 'restricted' documents are always encrypted client-side and require an
// approved VaultAccessRequest before the UI will decrypt/open them.
export type VaultSensitivity = 'standard' | 'restricted';

export type VaultDocStatus = 'active' | 'archived';
export type AccessRequestStatus = 'pending' | 'approved' | 'denied';

export interface VaultDocumentVersion {
  version: number;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize?: number;
  encrypted: boolean;
  encryptedKey?: string; // base64 AES-256 key — only ever exported client-side, never sent anywhere but this record
  iv?: string; // base64 AES-GCM initialization vector
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: number;
}

export interface VaultDocument {
  id: string;
  title: string;
  category: VaultCategory;
  classification: VaultClassification;
  sensitivity: VaultSensitivity;
  tags?: string[];
  description?: string;
  currentVersion: number;
  versions: VaultDocumentVersion[];
  status: VaultDocStatus;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: number;
  updatedAt?: number;
}

export interface VaultAccessRequest {
  id: string;
  documentId: string;
  documentTitle: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: string;
  reason?: string;
  status: AccessRequestStatus;
  requestedAt: number;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: number;
  decisionNote?: string;
  expiresAt?: number; // optional time-boxed grant
}

export interface VaultAccessSettings {
  defenceRoles: string[]; // roles that can see classification: 'defence-unit' at all
  approverRoles: string[]; // roles that can approve/deny restricted-document access requests
  updatedAt?: number;
}

export const DEFAULT_VAULT_ACCESS: VaultAccessSettings = {
  defenceRoles: ['admin'],
  approverRoles: ['admin', 'maintenance'],
};
