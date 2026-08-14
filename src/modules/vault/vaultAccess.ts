// src/modules/vault/vaultAccess.ts
// Access-control policy for the Vault, kept as pure functions rather than the
// usual role→menu-id permission matrix (Sidebar/Settings/AuthContext), because
// "who classifies/sees defence-unit drawings" and "who approves restricted
// access" are distinct authority questions from "who can open the Vault menu
// at all" — the latter still goes through the normal hasAccess('vault') gate.
import { useEffect, useState } from 'react';
import { getRecord } from '@/services/firebase';
import type { User } from '@/types';
import {
  DEFAULT_VAULT_ACCESS,
  type VaultAccessRequest,
  type VaultAccessSettings,
  type VaultDocument,
} from '@/types/vault';

export const useVaultAccessSettings = () => {
  const [settings, setSettings] = useState<VaultAccessSettings>(DEFAULT_VAULT_ACCESS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await getRecord('settings', 'vaultAccess') as VaultAccessSettings | null;
        if (data) setSettings({ ...DEFAULT_VAULT_ACCESS, ...data });
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  return { settings, setSettings, loaded };
};

const hasRole = (roles: string[], user: User) => roles.map((r) => r.toLowerCase()).includes(user.role.toLowerCase());

export const canSeeClassification = (doc: VaultDocument, user: User, settings: VaultAccessSettings): boolean =>
  doc.classification === 'commercial' || hasRole(settings.defenceRoles, user);

export const isApprover = (user: User, settings: VaultAccessSettings): boolean =>
  hasRole(settings.approverRoles, user);

export const isUploaderOrApprover = (doc: VaultDocument, user: User, settings: VaultAccessSettings): boolean =>
  doc.uploadedBy === user.username || isApprover(user, settings);

// Anyone can add a new version to an open commercial document; restricted or
// defence-unit-classified documents can only be re-versioned by the uploader or an approver.
export const canManage = (doc: VaultDocument, user: User, settings: VaultAccessSettings): boolean =>
  (doc.sensitivity === 'standard' && doc.classification === 'commercial') || isUploaderOrApprover(doc, user, settings);

export const activeApprovedRequest = (
  doc: VaultDocument,
  user: User,
  requests: VaultAccessRequest[],
): VaultAccessRequest | undefined =>
  requests.find(
    (r) =>
      r.documentId === doc.id &&
      r.requestedBy === user.username &&
      r.status === 'approved' &&
      (!r.expiresAt || r.expiresAt > Date.now()),
  );

export const pendingRequest = (doc: VaultDocument, user: User, requests: VaultAccessRequest[]): VaultAccessRequest | undefined =>
  requests.find((r) => r.documentId === doc.id && r.requestedBy === user.username && r.status === 'pending');

export const canOpen = (
  doc: VaultDocument,
  user: User,
  settings: VaultAccessSettings,
  requests: VaultAccessRequest[],
): boolean => {
  if (doc.sensitivity === 'standard') return true;
  if (isUploaderOrApprover(doc, user, settings)) return true;
  return !!activeApprovedRequest(doc, user, requests);
};
