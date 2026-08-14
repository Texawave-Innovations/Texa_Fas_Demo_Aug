'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  TrendingUp,
  Users,
  Package,
  FileText,
  Clock,
  CheckCircle,
  Truck,
  IndianRupee,
  Plus,
  Trash2,
  ListTodo,
} from 'lucide-react';
import { database } from '@/services/firebase';
import { ref, onValue } from 'firebase/database';
import { TodoManager } from '@/components/todo/TodoManager';

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  dueDate?: string;
}

export default function SalesDashboard() {
  const [stats, setStats] = useState({
    totalQuotations: 0,
    totalQuotationsThisMonth: 0,
    totalSalesOrders: 0,
    totalInvoices: 0,
    pendingQuotations: 0,
    pendingOrders: 0,
    ordersInQC: 0,
    ordersReadyForDispatch: 0,
    outstandingPayments: 0,
    topCustomers: [] as { name: string; amount: number }[],
    topProducts: [] as { name: string; qty: number }[],
    conversionRate: 0,
  });





  useEffect(() => {
    const qRef = ref(database, 'sales/quotations');
    const oaRef = ref(database, 'sales/orderAcknowledgements');
    const invRef = ref(database, 'sales/invoices');

    const unsubscribeQ = onValue(qRef, (snap) => {
      const data = snap.val() || {};
      const arr = Object.values(data);

      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();

      const qThisMonth = arr.filter((q: any) => {
        if (!q.quoteDate) return false;
        const d = new Date(q.quoteDate);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });

      const pending = arr.filter(
        (q: any) => q.status === 'Draft' || q.status === 'Sent'
      );

      const approved = arr.filter(
        (q: any) => q.status === 'Accepted' || q.status === 'Approved'
      ).length;

      setStats((prev) => ({
        ...prev,
        totalQuotations: arr.length,
        totalQuotationsThisMonth: qThisMonth.length,
        pendingQuotations: pending.length,
        conversionRate: arr.length > 0 ? (approved / arr.length) * 100 : 0,
      }));
    });

    const unsubscribeOA = onValue(oaRef, (snap) => {
      const data = snap.val() || {};
      const orders = Object.values(data);

      const pendingOrders = orders.filter(
        (o: any) => o.status === 'Draft' || o.status === 'In Production'
      );

      const qcOrders = orders.filter((o: any) => {
        // qc items are inside order.items
        if (!o.items) return false;
        return o.items.some((i: any) => i.okQty === 0 || i.notOkQty > 0);
      });

      const ready = orders.filter(
        (o: any) => o.status === 'Ready for Dispatch'
      );

      // Collect product qty for "Top Products"
      const productMap = new Map<string, number>();
      orders.forEach((o: any) => {
        (o.items || []).forEach((i: any) => {
          const current = productMap.get(i.productDescription || i.sku) || 0;
          productMap.set(
            i.productDescription || i.sku,
            current + (i.qty || i.okQty || 0)
          );
        });
      });

      const topProducts = Array.from(productMap.entries())
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      setStats((prev) => ({
        ...prev,
        totalSalesOrders: orders.length,
        pendingOrders: pendingOrders.length,
        ordersInQC: qcOrders.length,
        ordersReadyForDispatch: ready.length,
        topProducts,
      }));
    });

    const unsubscribeInv = onValue(invRef, (snap) => {
      const data = snap.val() || {};
      const invArr = Object.values(data);

      const unpaid = invArr.filter(
        (inv: any) =>
          inv.paymentStatus === 'Unpaid' || inv.paymentStatus === 'Partial'
      );

      const outstanding = unpaid.reduce((sum: number, inv: any) => {
        const paid = inv.paidAmount || 0;
        return sum + (inv.grandTotal - paid);
      }, 0);

      // Top customers
      const customerMap = new Map<string, number>();
      invArr.forEach((inv: any) => {
        const current = customerMap.get(inv.customerName) || 0;
        customerMap.set(inv.customerName, current + inv.grandTotal);
      });

      const topCustomers = Array.from(customerMap.entries())
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      setStats((prev) => ({
        ...prev,
        totalInvoices: invArr.length,
        outstandingPayments: outstanding as number,
        topCustomers,
      }));
    });

    return () => {
      unsubscribeQ();
      unsubscribeOA();
      unsubscribeInv();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Sales Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Real-time sales performance metrics
        </p>
      </div>

      {/* ---- Top KPIs ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

        <Card>
          <CardHeader className="flex flex-row justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Total Quotations
            </CardTitle>
            <FileText className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalQuotations}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalQuotationsThisMonth} this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Sales Orders
            </CardTitle>
            <Package className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSalesOrders}</div>
            <p className="text-xs text-muted-foreground">
              {stats.pendingOrders} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">Invoices</CardTitle>
            <TrendingUp className="h-5 w-5 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalInvoices}</div>
            <p className="text-xs text-muted-foreground">Total generated</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Outstanding
            </CardTitle>
            <IndianRupee className="h-5 w-5 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₹{stats.outstandingPayments.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">Pending payments</p>
          </CardContent>
        </Card>
      </div>

      {/* ---- Middle Cards ---- */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">

        <Card>
          <CardHeader className="flex flex-row justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Pending Quotations
            </CardTitle>
            <Clock className="h-5 w-5 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingQuotations}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">Orders in QC</CardTitle>
            <CheckCircle className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.ordersInQC}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Ready for Dispatch
            </CardTitle>
            <Truck className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.ordersReadyForDispatch}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Conversion Rate
            </CardTitle>
            <TrendingUp className="h-5 w-5 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.conversionRate.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* ---- TODO List ---- */}
      <TodoManager basePath="todos/sales" title="Sales TODO List" />
    </div>
  );
}
