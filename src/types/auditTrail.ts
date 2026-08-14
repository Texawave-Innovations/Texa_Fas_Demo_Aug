// Firebase path: auditTrail/entries
// Append-only log written by logAudit() in services/firebase.ts.
// Every createRecord/updateRecord/deleteRecord call auto-logs here, plus
// AuthContext logs login/login_failed/logout directly.

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'payment_made'
  | 'payment_received'
  | 'stock_added'
  | 'permission_change';

export interface AuditEntry {
  id: string;
  entityPath: string;       // e.g. 'cmms/assets', 'settings', 'auth'
  recordId: string | null;  // record key, or null for auth events
  action: AuditAction;
  byUser: string;           // username
  byUserName: string;
  byUserRole: string;
  at: number;                // Date.now()
  details?: string;
}
