import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, Landmark, AlertTriangle, Receipt,
} from 'lucide-react';
import { database } from '@/services/firebase';
import { ref, onValue, off } from 'firebase/database';
import { useOrgSettings } from '@/context/OrgSettingsContext';
import { formatCurrency } from '@/lib/countryConfig';
import { format } from 'date-fns';

export default function AccountsDashboard() {
  const { country } = useOrgSettings();
  const [receivables, setReceivables] = useState(0);
  const [payables, setPayables] = useState(0);
  const [cashPosition, setCashPosition] = useState(0);
  const [overdueInvoices, setOverdueInvoices] = useState(0);
  const [overdueBills, setOverdueBills] = useState(0);
  const [expensesThisMonth, setExpensesThisMonth] = useState(0);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    const invRef = ref(database, 'sales/invoices');
    const billsRef = ref(database, 'accounts/bills');
    const bankRef = ref(database, 'accounts/bankAccounts');
    const expRef = ref(database, 'accounts/expenses');

    const u1 = onValue(invRef, (snap) => {
      const data = snap.val() || {};
      const arr: any[] = Object.values(data);
      const unpaid = arr.filter((i) => i.status !== 'cancelled' && i.paymentStatus !== 'Paid');
      const outstanding = unpaid.reduce((s, i) => s + ((i.grandTotal || 0) - (i.paidAmount || 0)), 0);
      const today = new Date();
      const overdue = unpaid.filter((i) => i.dueDate && new Date(i.dueDate) < today).length;
      setReceivables(outstanding);
      setOverdueInvoices(overdue);

      const activity = arr
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 5)
        .map((i) => ({
          type: 'Invoice',
          label: i.invoiceNumber,
          sub: i.customerName,
          amount: i.grandTotal || 0,
          date: i.invoiceDate,
          createdAt: i.createdAt || 0,
        }));
      setRecentActivity((prev) => mergeActivity(prev, activity, 'Invoice'));
    });

    const u2 = onValue(billsRef, (snap) => {
      const data = snap.val() || {};
      const arr: any[] = Object.values(data);
      const unpaid = arr.filter((b) => b.status !== 'Paid');
      const outstanding = unpaid.reduce((s, b) => s + ((b.grandTotal || 0) - (b.paidAmount || 0)), 0);
      const today = new Date();
      const overdue = unpaid.filter((b) => b.dueDate && new Date(b.dueDate) < today).length;
      setPayables(outstanding);
      setOverdueBills(overdue);
    });

    const u3 = onValue(bankRef, (snap) => {
      const data = snap.val() || {};
      const arr: any[] = Object.values(data);
      const total = arr.reduce((s, b: any) => s + (b.openingBalance || 0), 0);
      setCashPosition(total);
    });

    const u4 = onValue(expRef, (snap) => {
      const data = snap.val() || {};
      const arr: any[] = Object.values(data);
      const now = new Date();
      const thisMonth = arr.filter((e: any) => {
        if (!e.date) return false;
        const d = new Date(e.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      setExpensesThisMonth(thisMonth.reduce((s, e: any) => s + (e.totalAmount || 0), 0));

      const activity = arr
        .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 5)
        .map((e: any) => ({
          type: 'Expense',
          label: e.expenseNumber,
          sub: e.expenseType,
          amount: e.totalAmount || 0,
          date: e.date,
          createdAt: e.createdAt || 0,
        }));
      setRecentActivity((prev) => mergeActivity(prev, activity, 'Expense'));
    });

    return () => {
      off(invRef, 'value', u1);
      off(billsRef, 'value', u2);
      off(bankRef, 'value', u3);
      off(expRef, 'value', u4);
    };
  }, []);

  const mergeActivity = (prev: any[], next: any[], type: string) => {
    const rest = prev.filter((a) => a.type !== type);
    return [...rest, ...next].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 8);
  };

  const stats = [
    { label: 'Receivables (AR)', value: formatCurrency(receivables, country), icon: ArrowDownCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Payables (AP)', value: formatCurrency(payables, country), icon: ArrowUpCircle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Cash & Bank', value: formatCurrency(cashPosition, country), icon: Landmark, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Expenses (This Month)', value: formatCurrency(expensesThisMonth, country), icon: Receipt, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Overdue Invoices', value: overdueInvoices, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Overdue Bills', value: overdueBills, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-lg ${s.bg}`}>
                    <Icon className={`h-5 w-5 ${s.color}`} />
                  </div>
                  <div className="min-w-0">
                    <div className={`text-xl font-bold ${s.color} truncate`}>{s.value}</div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No financial activity yet.</p>
          ) : (
            <div className="space-y-0">
              {recentActivity.map((a, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={a.type} tone={a.type === 'Invoice' ? 'green' : 'orange'} className="min-w-[80px]" />
                    <div>
                      <span className="text-sm font-medium">{a.label}</span>
                      {a.sub && <span className="text-xs text-muted-foreground ml-2">{a.sub}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{formatCurrency(a.amount, country)}</span>
                    <span className="hidden sm:inline">
                      {a.date ? (() => { try { return format(new Date(a.date), 'dd-MM-yyyy'); } catch { return a.date; } })() : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
