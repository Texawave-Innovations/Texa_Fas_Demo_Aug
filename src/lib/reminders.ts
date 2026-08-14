// src/lib/reminders.ts
// Shared "things that need attention today" logic — low stock, overdue money,
// and money due *today* — used by both the AI chat widget (App.tsx) and the
// NotificationBell in the Topbar so alerts aren't locked behind opening chat.
import { get } from 'firebase/database';
import { ref, database, getAllRecords } from '@/services/firebase';

export type TableConfig = {
  path: string;
  display: string;
  nameFields?: string[];
  dateField?: string;
  dueDateField?: string;
  amountField?: string;
  statusField?: string;
  paidStatuses?: string[];
};

export const BILLS_TABLE: TableConfig = {
  path: 'accounts/bills', display: 'vendor bills',
  nameFields: ['vendorName', 'billNumber'], dateField: 'billDate', dueDateField: 'dueDate',
  amountField: 'grandTotal', statusField: 'status', paidStatuses: ['Paid'],
};

export const INVOICES_TABLE: TableConfig = {
  path: 'sales/invoices', display: 'invoices',
  nameFields: ['customerName', 'invoiceNumber'], dateField: 'invoiceDate', dueDateField: 'dueDate',
  amountField: 'grandTotal', statusField: 'paymentStatus', paidStatuses: ['Paid'],
};

const money = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

export const isOverdue = (record: any, table: TableConfig) => {
  if (!table.statusField) return false;
  const status = record[table.statusField];
  if (status === 'Overdue') return true;
  if (table.dueDateField && table.paidStatuses && !table.paidStatuses.includes(status)) {
    const due = record[table.dueDateField];
    if (due) {
      try {
        return new Date(due) < new Date(new Date().toDateString());
      } catch {
        return false;
      }
    }
  }
  return false;
};

export const isDueToday = (record: any, table: TableConfig) => {
  if (!table.dueDateField || !table.statusField || !table.paidStatuses) return false;
  const status = record[table.statusField];
  if (table.paidStatuses.includes(status) || status === 'Overdue') return false;
  const due = record[table.dueDateField];
  if (!due) return false;
  try {
    return new Date(due).toDateString() === new Date().toDateString();
  } catch {
    return false;
  }
};

export const isUnpaid = (record: any, table: TableConfig) =>
  table.statusField ? !(table.paidStatuses || []).includes(record[table.statusField]) : false;
export const isPaid = (record: any, table: TableConfig) =>
  table.statusField ? (table.paidStatuses || []).includes(record[table.statusField]) : false;

export const labelFor = (r: any, table: TableConfig) => {
  const primary = (table.nameFields || []).map((f) => r[f]).find(Boolean) || r.id;
  const parts = [String(primary)];
  if (table.amountField && r[table.amountField] != null) parts.push(money(r[table.amountField]));
  if (table.statusField && r[table.statusField]) parts.push(r[table.statusField]);
  else if (table.dueDateField && r[table.dueDateField]) parts.push(`due ${r[table.dueDateField]}`);
  return parts.join(' — ');
};

// ---- Low stock ----
export type StockAlert = { label: string; qty: number; uom?: string; severity: 'Critical' | 'Low' };
const LOW_STOCK_THRESHOLDS = { fg: { critical: 3, low: 10 }, raw: { critical: 50, low: 200 } };

const getFinishedGoodsAlerts = async (): Promise<StockAlert[]> => {
  const snapshot = await get(ref(database, 'stores/fg'));
  if (!snapshot.exists()) return [];
  const data = snapshot.val();
  return Object.values<any>(data)
    .filter((it) => (it.qc || 'hold') === 'ok')
    .map((it) => ({ label: it.productName || it.productCode || 'Item', qty: Number(it.quantity) || 0, uom: it.uom || 'Nos' }))
    .filter((it) => it.qty <= LOW_STOCK_THRESHOLDS.fg.low)
    .map((it): StockAlert => ({ ...it, severity: it.qty <= LOW_STOCK_THRESHOLDS.fg.critical ? 'Critical' : 'Low' }));
};

const getRawMaterialAlerts = async (): Promise<StockAlert[]> => {
  const snapshot = await get(ref(database, 'stores/raw'));
  if (!snapshot.exists()) return [];
  const data = snapshot.val();
  return Object.values<any>(data)
    .map((it) => ({ label: it.compoundCode || 'Material', qty: Number(it.qty) || 0 }))
    .filter((it) => it.qty <= LOW_STOCK_THRESHOLDS.raw.low)
    .map((it): StockAlert => ({ ...it, severity: it.qty <= LOW_STOCK_THRESHOLDS.raw.critical ? 'Critical' : 'Low' }));
};

export type RemindersBundle = {
  fgAlerts: StockAlert[];
  rawAlerts: StockAlert[];
  overdueBills: any[];
  overdueInvoices: any[];
  dueTodayBills: any[];
  dueTodayInvoices: any[];
};

export const gatherReminders = async (): Promise<RemindersBundle> => {
  const [fgAlerts, rawAlerts, bills, invoices] = await Promise.all([
    getFinishedGoodsAlerts(),
    getRawMaterialAlerts(),
    getAllRecords(BILLS_TABLE.path),
    getAllRecords(INVOICES_TABLE.path),
  ]);
  return {
    fgAlerts,
    rawAlerts,
    overdueBills: bills.filter((r: any) => isOverdue(r, BILLS_TABLE)),
    overdueInvoices: invoices.filter((r: any) => isOverdue(r, INVOICES_TABLE)),
    dueTodayBills: bills.filter((r: any) => isDueToday(r, BILLS_TABLE)),
    dueTodayInvoices: invoices.filter((r: any) => isDueToday(r, INVOICES_TABLE)),
  };
};

export const reminderCount = (b: RemindersBundle) =>
  b.fgAlerts.length + b.rawAlerts.length + b.overdueBills.length + b.overdueInvoices.length +
  b.dueTodayBills.length + b.dueTodayInvoices.length;

// Markdown-flavoured summary for the chat widget.
export const formatRemindersText = (b: RemindersBundle): string => {
  const sections: string[] = [];
  const dueToday = [...b.dueTodayInvoices, ...b.dueTodayBills];
  if (dueToday.length) {
    const lines = [
      ...b.dueTodayInvoices.map((r) => `🟡 Invoice — ${labelFor(r, INVOICES_TABLE)}`),
      ...b.dueTodayBills.map((r) => `🟡 Bill — ${labelFor(r, BILLS_TABLE)}`),
    ];
    sections.push(`**Due Today** (${dueToday.length})\n${lines.join('\n')}`);
  }
  const stockItems = [...b.fgAlerts, ...b.rawAlerts].sort((a, c) => (a.severity === 'Critical' ? 0 : 1) - (c.severity === 'Critical' ? 0 : 1));
  if (stockItems.length) {
    const lines = stockItems.slice(0, 10).map((a) => `${a.severity === 'Critical' ? '🔴' : '🟠'} ${a.label} — ${a.qty}${a.uom ? ` ${a.uom}` : ''} left`);
    sections.push(`**Low Stock** (${stockItems.length})\n${lines.join('\n')}`);
  }
  if (b.overdueBills.length) {
    sections.push(`**Overdue Vendor Bills** (${b.overdueBills.length})\n${b.overdueBills.slice(0, 5).map((r) => `🔴 ${labelFor(r, BILLS_TABLE)}`).join('\n')}`);
  }
  if (b.overdueInvoices.length) {
    sections.push(`**Overdue Invoices** (${b.overdueInvoices.length})\n${b.overdueInvoices.slice(0, 5).map((r) => `🔴 ${labelFor(r, INVOICES_TABLE)}`).join('\n')}`);
  }
  if (!sections.length) return "✅ No active alerts right now — stock levels and payments all look healthy.";
  return `Here's what needs attention:\n\n${sections.join('\n\n')}`;
};

export const ALERT_INTENT = /\balerts?\b|\blow stock\b|\bstock (level|count)s?\b|\bstock alert|\bdue today\b|\breminders?\b/;
