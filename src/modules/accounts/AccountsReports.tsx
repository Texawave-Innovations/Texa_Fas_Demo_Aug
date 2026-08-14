import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, Wallet, Scale } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { getAllRecords } from '@/services/firebase';
import { useOrgSettings } from '@/context/OrgSettingsContext';
import { formatCurrency } from '@/lib/countryConfig';
import { format, subMonths, startOfMonth } from 'date-fns';
import type { ChartOfAccount } from '@/types/accounts';

function lastNMonths(n: number) {
  const months: { key: string; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = startOfMonth(subMonths(new Date(), i));
    months.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMM yy') });
  }
  return months;
}

export default function AccountsReports() {
  const { country } = useOrgSettings();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [bankTxns, setBankTxns] = useState<any[]>([]);
  const [coa, setCoa] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [inv, exp, bl, ba, bt, ca] = await Promise.all([
          getAllRecords('sales/invoices'),
          getAllRecords('accounts/expenses'),
          getAllRecords('accounts/bills'),
          getAllRecords('accounts/bankAccounts'),
          getAllRecords('accounts/bankTransactions'),
          getAllRecords('accounts/chartOfAccounts'),
        ]);
        setInvoices(inv); setExpenses(exp); setBills(bl);
        setBankAccounts(ba); setBankTxns(bt); setCoa(ca as ChartOfAccount[]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const months = lastNMonths(6);

  // ---- P&L ----
  const totalIncome = invoices.filter((i) => i.status !== 'cancelled').reduce((s, i) => s + (i.grandTotal || 0), 0);
  const totalExpense = expenses.reduce((s, e) => s + (e.totalAmount || 0), 0);
  const netProfit = totalIncome - totalExpense;

  const plByMonth = months.map(({ key, label }) => {
    const income = invoices
      .filter((i) => i.status !== 'cancelled' && (i.invoiceDate || '').startsWith(key))
      .reduce((s, i) => s + (i.grandTotal || 0), 0);
    const expense = expenses
      .filter((e) => (e.date || '').startsWith(key))
      .reduce((s, e) => s + (e.totalAmount || 0), 0);
    return { month: label, Income: Math.round(income), Expense: Math.round(expense) };
  });

  // ---- Cash Flow ----
  const cashIn = bankTxns.filter((t) => t.type === 'Deposit').reduce((s, t) => s + (t.amount || 0), 0);
  const cashOut = bankTxns.filter((t) => t.type === 'Withdrawal').reduce((s, t) => s + (t.amount || 0), 0);
  const netCashFlow = cashIn - cashOut;

  const cashFlowByMonth = months.map(({ key, label }) => {
    const inflow = bankTxns.filter((t) => t.type === 'Deposit' && (t.date || '').startsWith(key)).reduce((s, t) => s + (t.amount || 0), 0);
    const outflow = bankTxns.filter((t) => t.type === 'Withdrawal' && (t.date || '').startsWith(key)).reduce((s, t) => s + (t.amount || 0), 0);
    return { month: label, 'Cash In': Math.round(inflow), 'Cash Out': Math.round(outflow) };
  });

  // ---- Balance Sheet (summary — opening balances + live AR/AP/cash) ----
  const cashAndBank = bankAccounts.reduce((s, b) => {
    const txns = bankTxns.filter((t) => t.bankAccountId === b.id);
    const bal = txns.reduce((acc, t) => acc + (t.type === 'Deposit' ? t.amount : -t.amount), b.openingBalance || 0);
    return s + bal;
  }, 0);
  const receivables = invoices
    .filter((i) => i.status !== 'cancelled' && i.paymentStatus !== 'Paid')
    .reduce((s, i) => s + ((i.grandTotal || 0) - (i.paidAmount || 0)), 0);
  const payables = bills
    .filter((b) => b.status !== 'Paid')
    .reduce((s, b) => s + ((b.grandTotal || 0) - (b.paidAmount || 0)), 0);
  const otherAssets = coa.filter((a) => a.type === 'Asset' && a.subType !== 'Bank').reduce((s, a) => s + (a.openingBalance || 0), 0);
  const otherLiabilities = coa.filter((a) => a.type === 'Liability').reduce((s, a) => s + (a.openingBalance || 0), 0);

  const totalAssets = cashAndBank + receivables + otherAssets;
  const totalLiabilities = payables + otherLiabilities;
  const totalEquity = totalAssets - totalLiabilities;

  return (
    <div className="space-y-5">
      <Tabs defaultValue="pl">
        <TabsList>
          <TabsTrigger value="pl"><TrendingUp className="h-3.5 w-3.5 mr-1.5" />Profit &amp; Loss</TabsTrigger>
          <TabsTrigger value="cashflow"><Wallet className="h-3.5 w-3.5 mr-1.5" />Cash Flow</TabsTrigger>
          <TabsTrigger value="balance"><Scale className="h-3.5 w-3.5 mr-1.5" />Balance Sheet</TabsTrigger>
        </TabsList>

        {/* ---- P&L ---- */}
        <TabsContent value="pl" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-green-600" />Total Income</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalIncome, country)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3.5 w-3.5 text-red-600" />Total Expenses</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(totalExpense, country)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground">Net Profit</p>
              <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(netProfit, country)}</p>
            </CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm">Income vs Expenses (Last 6 Months)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={plByMonth}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: number) => formatCurrency(v, country)} />
                  <Legend />
                  <Bar dataKey="Income" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Expense" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Cash Flow ---- */}
        <TabsContent value="cashflow" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground">Cash In</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(cashIn, country)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground">Cash Out</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(cashOut, country)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground">Net Cash Flow</p>
              <p className={`text-2xl font-bold ${netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(netCashFlow, country)}</p>
            </CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm">Cash In vs Cash Out (Last 6 Months)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={cashFlowByMonth}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: number) => formatCurrency(v, country)} />
                  <Legend />
                  <Bar dataKey="Cash In" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Cash Out" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Balance Sheet ---- */}
        <TabsContent value="balance" className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            Summary view combining live cash/AR/AP with Chart of Accounts opening balances. Equity is shown as the balancing figure (Assets − Liabilities).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-700">Assets</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Cash &amp; Bank</span><span>{formatCurrency(cashAndBank, country)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Accounts Receivable</span><span>{formatCurrency(receivables, country)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Other Assets</span><span>{formatCurrency(otherAssets, country)}</span></div>
                <div className="flex justify-between font-bold border-t pt-1.5 mt-1.5"><span>Total Assets</span><span>{formatCurrency(totalAssets, country)}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-red-700">Liabilities</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Accounts Payable</span><span>{formatCurrency(payables, country)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Other Liabilities</span><span>{formatCurrency(otherLiabilities, country)}</span></div>
                <div className="flex justify-between font-bold border-t pt-1.5 mt-1.5"><span>Total Liabilities</span><span>{formatCurrency(totalLiabilities, country)}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-purple-700">Equity</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Net Equity (plug)</span><span>{formatCurrency(totalEquity, country)}</span></div>
                <div className="flex justify-between font-bold border-t pt-1.5 mt-1.5"><span>Total Equity</span><span>{formatCurrency(totalEquity, country)}</span></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
