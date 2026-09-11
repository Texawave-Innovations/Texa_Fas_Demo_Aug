import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, Landmark, AlertTriangle, Receipt,
  Clock, ArrowRight, ShieldAlert,
} from 'lucide-react';
import { database } from '@/services/firebase';
import { ref, onValue, off } from 'firebase/database';
import { useOrgSettings } from '@/context/OrgSettingsContext';
import { formatCurrency } from '@/lib/countryConfig';
import { format } from 'date-fns';
import {
  calculateReceivablesAgeing,
  calculatePayablesAgeing,
  createEmptyAgeingSummary,
  safeAdd,
} from '@/services/financeCalculations';
import type { Bill, BillPayment, AdvanceAllocation, AgeingSummary } from '@/types/accounts';

export default function AccountsDashboard() {
  const { country } = useOrgSettings();
  const [receivables, setReceivables] = useState(0);
  const [payables, setPayables] = useState(0);
  const [cashPosition, setCashPosition] = useState(0);
  const [overdueInvoices, setOverdueInvoices] = useState(0);
  const [overdueBills, setOverdueBills] = useState(0);
  const [expensesThisMonth, setExpensesThisMonth] = useState(0);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  // ---- Ageing summaries ----
  const [ageingType, setAgeingType] = useState<'ar' | 'ap'>('ar');
  const [arSummary, setArSummary] = useState<AgeingSummary>(createEmptyAgeingSummary(format(new Date(), 'yyyy-MM-dd')));
  const [apSummary, setApSummary] = useState<AgeingSummary>(createEmptyAgeingSummary(format(new Date(), 'yyyy-MM-dd')));

  useEffect(() => {
    const invRef = ref(database, 'sales/invoices');
    const billsRef = ref(database, 'accounts/bills');
    const bankRef = ref(database, 'accounts/bankAccounts');
    const expRef = ref(database, 'accounts/expenses');
    const payRef = ref(database, 'accounts/billPayments');
    const allocRef = ref(database, 'accounts/advanceAllocations');

    let currentInvoices: any[] = [];
    let currentBills: Bill[] = [];
    let currentPayments: BillPayment[] = [];
    let currentAllocations: AdvanceAllocation[] = [];

    const todayStr = format(new Date(), 'yyyy-MM-dd');

    const recomputeAgeing = (invs: any[], bls: Bill[], pays: BillPayment[], allocs: AdvanceAllocation[]) => {
      const { summary: arSum } = calculateReceivablesAgeing(invs, todayStr);
      const { summary: apSum } = calculatePayablesAgeing(bls, pays, allocs, todayStr);
      setArSummary(arSum);
      setApSummary(apSum);
    };

    const u1 = onValue(invRef, (snap) => {
      const data = snap.val() || {};
      const arr: any[] = Object.values(data);
      currentInvoices = arr;

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
      recomputeAgeing(currentInvoices, currentBills, currentPayments, currentAllocations);
    });

    const u2 = onValue(billsRef, (snap) => {
      const data = snap.val() || {};
      const arr: Bill[] = Object.keys(data).map((k) => ({ ...data[k], id: k }));
      currentBills = arr;

      const unpaid = arr.filter((b) => b.status !== 'Paid');
      const outstanding = unpaid.reduce((s, b) => s + ((b.grandTotal || 0) - (b.paidAmount || 0)), 0);
      const today = new Date();
      const overdue = unpaid.filter((b) => b.dueDate && new Date(b.dueDate) < today).length;
      setPayables(outstanding);
      setOverdueBills(overdue);

      recomputeAgeing(currentInvoices, currentBills, currentPayments, currentAllocations);
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

    const u5 = onValue(payRef, (snap) => {
      const data = snap.val() || {};
      currentPayments = Object.keys(data).map((k) => ({ ...data[k], id: k }));
      recomputeAgeing(currentInvoices, currentBills, currentPayments, currentAllocations);
    });

    const u6 = onValue(allocRef, (snap) => {
      const data = snap.val() || {};
      currentAllocations = Object.keys(data).map((k) => ({ ...data[k], id: k }));
      recomputeAgeing(currentInvoices, currentBills, currentPayments, currentAllocations);
    });

    return () => {
      off(invRef, 'value', u1);
      off(billsRef, 'value', u2);
      off(bankRef, 'value', u3);
      off(expRef, 'value', u4);
      off(payRef, 'value', u5);
      off(allocRef, 'value', u6);
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

  const activeAgeing = ageingType === 'ar' ? arSummary : apSummary;

  const ageingBuckets = [
    { label: 'Not Yet Due', amount: activeAgeing.current, color: 'text-green-700', bg: 'bg-green-50' },
    { label: '1–30 Days Overdue', amount: activeAgeing.days1_30, color: 'text-amber-700', bg: 'bg-amber-50' },
    { label: '31–60 Days Overdue', amount: activeAgeing.days31_60, color: 'text-orange-700', bg: 'bg-orange-50' },
    { label: '61–90 Days Overdue', amount: activeAgeing.days61_90, color: 'text-red-600', bg: 'bg-red-50' },
    { label: '>90 Days Overdue', amount: activeAgeing.days90Plus, color: 'text-red-800', bg: 'bg-red-100' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
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

      {/* Ageing Summary Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 flex-wrap gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Ageing Summary Breakdown
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Outstanding distribution calculated from invoice and bill due dates as of today.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg text-xs">
              <button
                onClick={() => setAgeingType('ar')}
                className={`px-3 py-1 rounded-md transition-colors ${ageingType === 'ar' ? 'bg-white font-semibold text-primary shadow-xs' : 'text-muted-foreground'}`}
              >
                Receivables (AR)
              </button>
              <button
                onClick={() => setAgeingType('ap')}
                className={`px-3 py-1 rounded-md transition-colors ${ageingType === 'ap' ? 'bg-white font-semibold text-primary shadow-xs' : 'text-muted-foreground'}`}
              >
                Payables (AP)
              </button>
            </div>

            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
              <Link to="/finance/reports">
                Detailed Reports <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {ageingBuckets.map((b) => (
              <div key={b.label} className={`p-3 rounded-lg border ${b.bg} space-y-1`}>
                <span className="text-[11px] text-muted-foreground block truncate">{b.label}</span>
                <p className={`text-base font-bold ${b.color}`}>
                  {formatCurrency(b.amount, country)}
                </p>
                <div className="text-[10px] text-muted-foreground">
                  {activeAgeing.totalOutstanding > 0
                    ? `${Math.round((b.amount / activeAgeing.totalOutstanding) * 100)}% of total`
                    : '0%'}
                </div>
              </div>
            ))}
          </div>

          {activeAgeing.noDueDate > 0 && (
            <div className="mt-3 p-2 bg-muted/40 border border-border rounded-md flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Items without assigned due date:
              </span>
              <span className="font-semibold text-foreground">
                {formatCurrency(activeAgeing.noDueDate, country)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity Card */}
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
