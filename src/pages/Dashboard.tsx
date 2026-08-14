'use client';

import { useEffect, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { LiveClock } from '@/components/layout/LiveClock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users,
  IndianRupee,
  FileText,
  Package,
  TrendingUp,
  UserCheck,
  Boxes,
  Factory,
  ShieldCheck,
  Truck,
  Activity,
} from 'lucide-react';
import { database } from '@/services/firebase';
import { ref, onValue } from 'firebase/database';
import { DashboardStats } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { LocationCurrencyBanner } from '@/components/dashboard/LocationCurrencyBanner';

// If your DashboardStats in '@/types' does not yet include these fields,
// you can extend it there. For now we keep base stats and store extra
// analytics in separate state objects.

interface SalesFlowStats {
  totalOrders: number;
  oaPendingProd: number;
  oaInProduction: number;
  oaQcCompleted: number;
  oaReadyDispatch: number;
  oaInvoiceGenerated: number;
  oaDelivered: number;
}

interface ProductionStats {
  totalJobs: number;
  jobsPending: number;
  jobsRunning: number;
  jobsCompleted: number;
}

interface QCStats {
  totalInspections: number;
  qcPending: number;
  qcCompleted: number;
}

interface LogisticsStats {
  packingLists: number;
  shipmentsPending: number;
  shipmentsInTransit: number;
  shipmentsDelivered: number;
  fgBatches: number;
  fgTotalQty: number;
}

export default function Dashboard() {
  const { hasAccess } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalCustomers: 0,
    totalProducts: 0,
    totalSalesThisMonth: 0,
    pendingQuotations: 0,
    totalLeads: 0,
    convertedLeads: 0,
    totalEmployees: 0,
    presentToday: 0,
    pendingLeaves: 0,
  });

  const [salesFlow, setSalesFlow] = useState<SalesFlowStats>({
    totalOrders: 0,
    oaPendingProd: 0,
    oaInProduction: 0,
    oaQcCompleted: 0,
    oaReadyDispatch: 0,
    oaInvoiceGenerated: 0,
    oaDelivered: 0,
  });

  const [prodStats, setProdStats] = useState<ProductionStats>({
    totalJobs: 0,
    jobsPending: 0,
    jobsRunning: 0,
    jobsCompleted: 0,
  });

  const [qcStats, setQcStats] = useState<QCStats>({
    totalInspections: 0,
    qcPending: 0,
    qcCompleted: 0,
  });

  const [logisticsStats, setLogisticsStats] = useState<LogisticsStats>({
    packingLists: 0,
    shipmentsPending: 0,
    shipmentsInTransit: 0,
    shipmentsDelivered: 0,
    fgBatches: 0,
    fgTotalQty: 0,
  });

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const customersRef = ref(database, 'sales/customers');
    const productsRef = ref(database, 'sales/products');
    const invoicesRef = ref(database, 'sales/invoices');
    const quotationsRef = ref(database, 'sales/quotations');
    const leadsRef = ref(database, 'sales/leads');
    const employeesRef = ref(database, 'hr/employees');
    const leavesRef = ref(database, 'hr/leaves');
    const ordersRef = ref(database, 'sales/orderAcknowledgements');
    const jobsRef = ref(database, 'production/jobs');
    const inspectionsRef = ref(database, 'quality/inspections');
    const packingRef = ref(database, 'sales/packingLists');
    const shipmentsRef = ref(database, 'sales/shipments');
    const fgRef = ref(database, 'stores/fg');

    const today = new Date().toISOString().split('T')[0];
    const attendanceRef = ref(database, `hr/attendance/${today}`);

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    // Customers
    const unsubCustomers = onValue(customersRef, (snapshot) => {
      const data = snapshot.val();
      const count = data ? Object.keys(data).length : 0;
      setStats((prev) => ({ ...prev, totalCustomers: count }));
    });

    // Products
    const unsubProducts = onValue(productsRef, (snapshot) => {
      const data = snapshot.val();
      const count = data ? Object.keys(data).length : 0;
      setStats((prev) => ({ ...prev, totalProducts: count }));
    });

    // Invoices (sales this month)
    const unsubInvoices = onValue(invoicesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const invoices = Object.values(data) as any[];
        const monthlySales = invoices
          .filter((inv) => {
            if (!inv.invoiceDate) return false;
            const invDate = new Date(inv.invoiceDate);
            return (
              !isNaN(invDate.getTime()) &&
              invDate.getMonth() === currentMonth &&
              invDate.getFullYear() === currentYear
            );
          })
          .reduce(
            (sum, inv: any) =>
              sum + (inv.grandTotal ?? inv.invoiceAmount ?? 0),
            0
          );
        setStats((prev) => ({
          ...prev,
          totalSalesThisMonth: monthlySales,
        }));
      } else {
        setStats((prev) => ({ ...prev, totalSalesThisMonth: 0 }));
      }
    });

    // Quotations (pending)
    const unsubQuotations = onValue(quotationsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const quotations = Object.values(data) as any[];
        const pending = quotations.filter((q) =>
          ['Draft', 'Sent'].includes(q.status)
        ).length;
        setStats((prev) => ({ ...prev, pendingQuotations: pending }));
      } else {
        setStats((prev) => ({ ...prev, pendingQuotations: 0 }));
      }
    });

    // Leads
    const unsubLeads = onValue(leadsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const leads = Object.values(data) as any[];
        const total = leads.length;
        const converted = leads.filter(
          (l) => l.status === 'Converted'
        ).length;
        setStats((prev) => ({
          ...prev,
          totalLeads: total,
          convertedLeads: converted,
        }));
      } else {
        setStats((prev) => ({
          ...prev,
          totalLeads: 0,
          convertedLeads: 0,
        }));
      }
    });

    // Employees
    const unsubEmployees = onValue(employeesRef, (snapshot) => {
      const data = snapshot.val();
      const count = data ? Object.keys(data).length : 0;
      setStats((prev) => ({ ...prev, totalEmployees: count }));
    });

    // Attendance today
    const unsubAttendance = onValue(attendanceRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const attendance = Object.values(data) as any[];
        const present = attendance.filter(
          (a) => a.status === 'Present'
        ).length;
        setStats((prev) => ({ ...prev, presentToday: present }));
      } else {
        setStats((prev) => ({ ...prev, presentToday: 0 }));
      }
    });

    // Leaves
    const unsubLeaves = onValue(leavesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const leaves = Object.values(data) as any[];
        const pending = leaves.filter(
          (l) => l.status === 'Pending'
        ).length;
        setStats((prev) => ({ ...prev, pendingLeaves: pending }));
      } else {
        setStats((prev) => ({ ...prev, pendingLeaves: 0 }));
      }
      setIsLoading(false);
    });

    // Order flow: OA → Production → QC → Dispatch → Invoice → Delivered
    const unsubOrders = onValue(ordersRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setSalesFlow({
          totalOrders: 0,
          oaPendingProd: 0,
          oaInProduction: 0,
          oaQcCompleted: 0,
          oaReadyDispatch: 0,
          oaInvoiceGenerated: 0,
          oaDelivered: 0,
        });
        return;
      }

      const orders = Object.values(data) as any[];

      const totalOrders = orders.length;
      const oaPendingProd = orders.filter(
        (o) =>
          !o.productionStatus ||
          o.productionStatus === 'pending' ||
          o.status === 'Confirmed'
      ).length;
      const oaInProduction = orders.filter(
        (o) =>
          o.productionStatus === 'in_progress' ||
          o.status === 'In Production'
      ).length;
      const oaQcCompleted = orders.filter(
        (o) =>
          o.qcStatus === 'completed' || o.status === 'QC Completed'
      ).length;
      const oaReadyDispatch = orders.filter(
        (o) => o.status === 'Ready for Dispatch'
      ).length;
      const oaInvoiceGenerated = orders.filter(
        (o) =>
          o.invoiceStatus === 'generated' ||
          o.status === 'Invoice Generated'
      ).length;
      const oaDelivered = orders.filter(
        (o) => o.deliveryStatus === 'delivered' || o.status === 'Delivered'
      ).length;

      setSalesFlow({
        totalOrders,
        oaPendingProd,
        oaInProduction,
        oaQcCompleted,
        oaReadyDispatch,
        oaInvoiceGenerated,
        oaDelivered,
      });
    });

    // Production jobs
    const unsubJobs = onValue(jobsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setProdStats({
          totalJobs: 0,
          jobsPending: 0,
          jobsRunning: 0,
          jobsCompleted: 0,
        });
        return;
      }

      const jobs = Object.values(data) as any[];
      const totalJobs = jobs.length;
      const jobsPending = jobs.filter(
        (j) =>
          !j.status ||
          j.status === 'pending' ||
          j.status === 'scheduled'
      ).length;
      const jobsRunning = jobs.filter(
        (j) => j.status === 'running' || j.status === 'in_progress'
      ).length;
      const jobsCompleted = jobs.filter(
        (j) => j.status === 'completed'
      ).length;

      setProdStats({
        totalJobs,
        jobsPending,
        jobsRunning,
        jobsCompleted,
      });
    });

    // QC inspections
    const unsubInspections = onValue(inspectionsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setQcStats({
          totalInspections: 0,
          qcPending: 0,
          qcCompleted: 0,
        });
        return;
      }

      const inspections = Object.values(data) as any[];
      const totalInspections = inspections.length;
      const qcCompleted = inspections.filter(
        (i) => i.qcStatus === 'completed'
      ).length;
      const qcPending = totalInspections - qcCompleted;

      setQcStats({
        totalInspections,
        qcPending,
        qcCompleted,
      });
    });

    // Packing lists
    const unsubPacking = onValue(packingRef, (snapshot) => {
      const data = snapshot.val();
      const packingLists = data
        ? (Object.values(data) as any[])
        : [];
      setLogisticsStats((prev) => ({
        ...prev,
        packingLists: packingLists.length,
      }));
    });

    // Shipments
    const unsubShipments = onValue(shipmentsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setLogisticsStats((prev) => ({
          ...prev,
          shipmentsPending: 0,
          shipmentsInTransit: 0,
          shipmentsDelivered: 0,
        }));
        return;
      }

      const shipments = Object.values(data) as any[];

      const shipmentsPending = shipments.filter(
        (s) => s.deliveryStatus === 'Pending'
      ).length;
      const shipmentsInTransit = shipments.filter(
        (s) => s.deliveryStatus === 'In Transit'
      ).length;
      const shipmentsDelivered = shipments.filter(
        (s) => s.deliveryStatus === 'Delivered'
      ).length;

      setLogisticsStats((prev) => ({
        ...prev,
        shipmentsPending,
        shipmentsInTransit,
        shipmentsDelivered,
      }));
    });

    // FG stock
    const unsubFg = onValue(fgRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setLogisticsStats((prev) => ({
          ...prev,
          fgBatches: 0,
          fgTotalQty: 0,
        }));
        return;
      }

      const fg = Object.values(data) as any[];
      const fgBatches = fg.length;
      const fgTotalQty = fg.reduce(
        (sum, item: any) => sum + (item.quantity || 0),
        0
      );

      setLogisticsStats((prev) => ({
        ...prev,
        fgBatches,
        fgTotalQty,
      }));
    });

    return () => {
      unsubCustomers();
      unsubProducts();
      unsubInvoices();
      unsubQuotations();
      unsubLeads();
      unsubEmployees();
      unsubAttendance();
      unsubLeaves();
      unsubOrders();
      unsubJobs();
      unsubInspections();
      unsubPacking();
      unsubShipments();
      unsubFg();
    };
  }, []);

  const statCards = [
    {
      title: 'Total Customers',
      value: stats.totalCustomers,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Total Products',
      value: stats.totalProducts,
      icon: Package,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    // {
    //   title: 'Total Sales (This Month)',
    //   value: `₹${stats.totalSalesThisMonth.toLocaleString('en-IN')}`,
    //   icon: IndianRupee,
    //   color: 'text-primary',
    //   bgColor: 'bg-primary/10',
    // },
    {
      title: 'Pending Quotations',
      value: stats.pendingQuotations,
      icon: FileText,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
    {
      title: 'Total Leads',
      value: stats.totalLeads,
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      title: 'Converted Leads',
      value: stats.convertedLeads,
      icon: UserCheck,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100',
    },
    {
      title: 'Total Employees',
      value: stats.totalEmployees,
      icon: Users,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-100',
    },
    {
      title: 'Present Today',
      value: stats.presentToday,
      icon: UserCheck,
      color: 'text-teal-600',
      bgColor: 'bg-teal-100',
    },
    {
      title: 'Pending Leaves',
      value: stats.pendingLeaves,
      icon: FileText,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100',
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold text-foreground">
              Control Center
            </h1>
            <p className="text-muted-foreground">
              Live overview of Fluoro ERP – sales, production, QC, stores and HR in one screen.
            </p>
          </div>
          <LiveClock />
        </div>

        {hasAccess('finance') && <LocationCurrencyBanner />}

        {/* Top KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading
            ? Array.from({ length: 9 }).map((_, index) => (
                <Card key={index}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-10 w-10 rounded-lg" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-9 w-24" />
                  </CardContent>
                </Card>
              ))
            : statCards.map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <Card
                    key={index}
                    className="hover:shadow-lg transition-all duration-300 hover:scale-105 border-l-4"
                    style={{
                      animationDelay: `${index * 80}ms`,
                    }}
                  >
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {stat.title}
                      </CardTitle>
                      <div
                        className={`p-2 rounded-lg ${stat.bgColor} transition-transform hover:scale-110`}
                      >
                        <Icon className={`h-5 w-5 ${stat.color}`} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-foreground">
                        {stat.value}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
        </div>

        {/* Flow pipeline: OA → Production → QC → Packing → Shipment → Invoice */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Live Order Flow
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Full journey from order to invoice – counts show how many orders are stuck in each stage.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col lg:flex-row items-stretch justify-between gap-4">
              {[
                {
                  label: 'Order Acknowledged',
                  value: salesFlow.totalOrders,
                  sub: `${salesFlow.oaPendingProd} waiting for production`,
                  icon: FileText,
                },
                {
                  label: 'In Production',
                  value: salesFlow.oaInProduction,
                  sub: `${salesFlow.oaPendingProd} yet to start`,
                  icon: Factory,
                },
                {
                  label: 'QC Completed',
                  value: salesFlow.oaQcCompleted,
                  sub: `${salesFlow.oaQcCompleted} ready for packing`,
                  icon: ShieldCheck,
                },
                {
                  label: 'Packed',
                  value: logisticsStats.packingLists,
                  sub: `${salesFlow.oaReadyDispatch} ready to dispatch`,
                  icon: Package,
                },
                {
                  label: 'Shipment',
                  value:
                    logisticsStats.shipmentsPending +
                    logisticsStats.shipmentsInTransit +
                    logisticsStats.shipmentsDelivered,
                  sub: `${logisticsStats.shipmentsPending} pending, ${logisticsStats.shipmentsInTransit} in transit`,
                  icon: Truck,
                },
                {
                  label: 'Invoice Generated',
                  value: salesFlow.oaInvoiceGenerated,
                  sub: `${salesFlow.oaDelivered} delivered`,
                  icon: IndianRupee,
                },
              ].map((stage, idx, arr) => {
                const Icon = stage.icon;
                return (
                  <div
                    key={stage.label}
                    className="flex-1 relative flex flex-col items-center"
                  >
                    <div className="w-full rounded-xl border bg-card p-3 flex flex-col items-center text-center">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="text-xs font-medium text-muted-foreground">
                          {stage.label}
                        </span>
                      </div>
                      <div className="text-2xl font-bold">
                        {stage.value}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {stage.sub}
                      </div>
                    </div>
                    {idx < arr.length - 1 && (
                      <div className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-[2px] bg-primary" />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Lower sections: Production / QC / Logistics / HR snapshot */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Production + QC */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Factory className="h-5 w-5 text-blue-600" />
                  Production Snapshot
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 rounded-lg bg-blue-50 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Total Jobs
                  </span>
                  <span className="text-xl font-bold">
                    {prodStats.totalJobs}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Pending
                  </span>
                  <span className="text-xl font-bold">
                    {prodStats.jobsPending}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-sky-50 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Running
                  </span>
                  <span className="text-xl font-bold">
                    {prodStats.jobsRunning}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Completed
                  </span>
                  <span className="text-xl font-bold">
                    {prodStats.jobsCompleted}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  Quality Control
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 rounded-lg bg-emerald-50 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Total Inspections
                  </span>
                  <span className="text-xl font-bold">
                    {qcStats.totalInspections}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Pending QC
                  </span>
                  <span className="text-xl font-bold">
                    {qcStats.qcPending}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-green-50 flex flex-col gap-1 col-span-2">
                  <span className="text-xs text-muted-foreground">
                    QC Completed
                  </span>
                  <span className="text-xl font-bold">
                    {qcStats.qcCompleted}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Logistics + HR */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Boxes className="h-5 w-5 text-indigo-600" />
                  Logistics & Stores
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 rounded-lg bg-indigo-50 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Packing Lists
                  </span>
                  <span className="text-xl font-bold">
                    {logisticsStats.packingLists}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-yellow-50 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Pending Shipments
                  </span>
                  <span className="text-xl font-bold">
                    {logisticsStats.shipmentsPending}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-sky-50 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    In Transit
                  </span>
                  <span className="text-xl font-bold">
                    {logisticsStats.shipmentsInTransit}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Delivered
                  </span>
                  <span className="text-xl font-bold">
                    {logisticsStats.shipmentsDelivered}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 flex flex-col gap-1 col-span-2">
                  <span className="text-xs text-muted-foreground">
                    FG Stock (OK) – Batches / Qty
                  </span>
                  <span className="text-xl font-bold">
                    {logisticsStats.fgBatches} batches ·{' '}
                    {logisticsStats.fgTotalQty} pcs
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-rose-600" />
                  HR Snapshot (Today)
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 rounded-lg bg-rose-50 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Employees
                  </span>
                  <span className="text-xl font-bold">
                    {stats.totalEmployees}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-green-50 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Present Today
                  </span>
                  <span className="text-xl font-bold">
                    {stats.presentToday}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 flex flex-col gap-1 col-span-2">
                  <span className="text-xs text-muted-foreground">
                    Pending Leave Requests
                  </span>
                  <span className="text-xl font-bold">
                    {stats.pendingLeaves}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
