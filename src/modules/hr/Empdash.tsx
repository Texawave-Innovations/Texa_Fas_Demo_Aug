// src/modules/hr/Dashboard.tsx

import { useEffect, useMemo, useState } from 'react';
import {
  Users,
  IndianRupee,
  Clock3,
  Gift,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  CalendarRange,
  Download,
  Filter,
  Plus,
  Trash2,
  ListTodo,
} from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

import { Employee } from '@/types';
import { getAllRecords } from '@/services/firebase';
import { database } from '@/services/firebase';
import { ref, get, onValue } from 'firebase/database';
import { TodoManager } from '@/components/todo/TodoManager';

// Recharts for graphs
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

type Bonus = {
  id: string;
  amount: number;
  bonusType: string;
  department?: string;
  employeeId: string;
  employeeName: string;
  month: string;
  status: string;
};

type OtherDocument = {
  id: string;
  filename: string;
  url: string;
  uploadedAt?: string;
};

type AttendanceRecord = {
  date: string;
  employeeId: string;
  employeeName: string;
  status: string;
  workHrs?: number;
  otHrs?: number;
  pendingHrs?: number;
};

type PfEntry = {
  employeeId: string;
  pfIncluded: boolean;
  pfAmount: number;
  paymentStatus: 'Pending' | 'Paid';
};

type EsiEntry = {
  employeeId: string;
  esiIncluded: boolean;
  esiAmount: number;
  paymentStatus: 'Pending' | 'Paid';
};

type MonthSummary = {
  monthKey: string;
  label: string;
  monthlyPayroll: number;
  bonuses: number;
  overtimeHours: number;
  presentCount: number;
  leaveCount: number;
  absentCount: number;
  pfTotal: number;
  esiTotal: number;
  pfPaidCount: number;
  pfPendingCount: number;
  esiPaidCount: number;
  esiPendingCount: number;
};

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  dueDate?: string;
}

const currency = '₹';

// Helpers
const formatINR = (value: number) =>
  value >= 100000
    ? `${currency}${(value / 100000).toFixed(2)}L`
    : `${currency}${value.toLocaleString('en-IN')}`;

const formatNumber = (value: number) =>
  value.toLocaleString('en-IN', { maximumFractionDigits: 1 });

const getMonthLabel = (monthKey: string) => {
  const d = new Date(`${monthKey}-01T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'long' });
};

// Generate last 12 months
const generateLast12Months = () => {
  const months: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
  }
  return months;
};

export default function HRDashboard() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [otherDocs, setOtherDocs] = useState<OtherDocument[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [pfData, setPfData] = useState<Record<string, Record<string, PfEntry>>>({});
  const [esiData, setEsiData] = useState<Record<string, Record<string, EsiEntry>>>({});
  const [loading, setLoading] = useState(true);



  // Month filter state
  const todayISO = new Date().toISOString().split('T')[0];
  const defaultMonthKey = todayISO.slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonthKey);

  const availableMonths = useMemo(() => generateLast12Months(), []);



  // Fetch all HR data
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const [empData, bonusData, docsData] = await Promise.all([
          getAllRecords('hr/employees'),
          getAllRecords('hr/bonuses'),
          getAllRecords('hr/otherDocuments'),
        ]);

        setEmployees((empData || []) as Employee[]);
        setBonuses((bonusData || []) as Bonus[]);
        setOtherDocs((docsData || []) as OtherDocument[]);

        const attSnap = await get(ref(database, 'hr/attendance'));
        const attVal = (attSnap.exists() ? attSnap.val() : {}) as Record<
          string,
          Record<string, any>
        >;

        const flat: AttendanceRecord[] = [];
        Object.values(attVal).forEach((perDate) => {
          Object.values(perDate).forEach((rec: any) => {
            flat.push({
              date: rec.date,
              employeeId: rec.employeeId,
              employeeName: rec.employeeName,
              status: rec.status,
              workHrs: typeof rec.workHrs === 'number' ? rec.workHrs : 0,
              otHrs: typeof rec.otHrs === 'number' ? rec.otHrs : 0,
              pendingHrs: typeof rec.pendingHrs === 'number' ? rec.pendingHrs : 0,
            });
          });
        });

        setAttendanceRecords(flat);

        const pfSnap = await get(ref(database, 'hr/pf'));
        const pfVal = (pfSnap.exists() ? pfSnap.val() : {}) as Record<string, Record<string, PfEntry>>;
        setPfData(pfVal);

        const esiSnap = await get(ref(database, 'hr/esi'));
        const esiVal = (esiSnap.exists() ? esiSnap.val() : {}) as Record<string, Record<string, EsiEntry>>;
        setEsiData(esiVal);

      } catch (err) {
        console.error('Failed to load HR dashboard data', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // Derived stats
  const totalEmployees = employees.length;
  const activeEmployees = employees.filter(
    (e) => (e.status || 'active').toLowerCase() === 'active'
  ).length;

  const staffCount = employees.filter((e) => e.department === 'Staff').length;
  const workerCount = employees.filter((e) => e.department === 'Worker').length;
  const otherWorkersCount = employees.filter(
    (e) => e.department === 'Other Workers'
  ).length;

  const totalMonthlyGross = employees.reduce(
    (sum, e) => sum + (e.salary?.grossMonthly || 0),
    0
  );

  const avgCTC =
    employees.length > 0
      ? employees.reduce((sum, e) => sum + (e.salary?.ctcLPA || 0), 0) /
        employees.length
      : 0;

  const totalPayslips = otherDocs.length;
  const totalBonusRecords = bonuses.length;

  const bonusByMonth = useMemo(() => {
    const map: Record<string, number> = {};
    bonuses.forEach((b) => {
      if (!b.month) return;
      if (!map[b.month]) map[b.month] = 0;
      if (b.status === 'Approved') {
        map[b.month] += b.amount || 0;
      }
    });
    return map;
  }, [bonuses]);

  const totalBonusAllTime = Object.values(bonusByMonth).reduce(
    (s, v) => s + v,
    0
  );

  const pfEsiByMonth = useMemo(() => {
    const map: Record<string, {
      pfTotal: number;
      esiTotal: number;
      pfPaidCount: number;
      pfPendingCount: number;
      esiPaidCount: number;
      esiPendingCount: number;
    }> = {};

    Object.entries(pfData).forEach(([monthKey, entries]) => {
      if (!map[monthKey]) {
        map[monthKey] = {
          pfTotal: 0,
          esiTotal: 0,
          pfPaidCount: 0,
          pfPendingCount: 0,
          esiPaidCount: 0,
          esiPendingCount: 0,
        };
      }
      Object.values(entries).forEach((entry) => {
        if (entry.pfIncluded) {
          map[monthKey].pfTotal += entry.pfAmount || 0;
          if (entry.paymentStatus === 'Paid') {
            map[monthKey].pfPaidCount += 1;
          } else {
            map[monthKey].pfPendingCount += 1;
          }
        }
      });
    });

    Object.entries(esiData).forEach(([monthKey, entries]) => {
      if (!map[monthKey]) {
        map[monthKey] = {
          pfTotal: 0,
          esiTotal: 0,
          pfPaidCount: 0,
          pfPendingCount: 0,
          esiPaidCount: 0,
          esiPendingCount: 0,
        };
      }
      Object.values(entries).forEach((entry) => {
        if (entry.esiIncluded) {
          map[monthKey].esiTotal += entry.esiAmount || 0;
          if (entry.paymentStatus === 'Paid') {
            map[monthKey].esiPaidCount += 1;
          } else {
            map[monthKey].esiPendingCount += 1;
          }
        }
      });
    });

    return map;
  }, [pfData, esiData]);

  const monthSummaries: MonthSummary[] = useMemo(() => {
    const byMonth: Record<
      string,
      {
        present: number;
        absent: number;
        leave: number;
        holiday: number;
        otHours: number;
      }
    > = {};

    attendanceRecords.forEach((rec) => {
      const monthKey = rec.date.slice(0, 7);
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = {
          present: 0,
          absent: 0,
          leave: 0,
          holiday: 0,
          otHours: 0,
        };
      }
      const bucket = byMonth[monthKey];
      if (rec.status === 'Present' || rec.status === 'Half Day') bucket.present += 1;
      else if (rec.status === 'Absent') bucket.absent += 1;
      else if (rec.status === 'Leave') bucket.leave += 1;
      else if (rec.status === 'Holiday' || rec.status === 'Week Off')
        bucket.holiday += 1;

      bucket.otHours += rec.otHrs || 0;
    });

    const monthKeys = availableMonths;

    return monthKeys.map((mKey) => {
      const b = byMonth[mKey] || {
        present: 0,
        absent: 0,
        leave: 0,
        holiday: 0,
        otHours: 0,
      };
      const monthlyPayroll = totalMonthlyGross;
      const bonus = bonusByMonth[mKey] || 0;
      const pfEsiStats = pfEsiByMonth[mKey] || {
        pfTotal: 0,
        esiTotal: 0,
        pfPaidCount: 0,
        pfPendingCount: 0,
        esiPaidCount: 0,
        esiPendingCount: 0,
      };

      return {
        monthKey: mKey,
        label: getMonthLabel(mKey),
        monthlyPayroll: monthlyPayroll + bonus,
        bonuses: bonus,
        overtimeHours: b.otHours,
        presentCount: b.present,
        leaveCount: b.leave,
        absentCount: b.absent,
        pfTotal: pfEsiStats.pfTotal,
        esiTotal: pfEsiStats.esiTotal,
        pfPaidCount: pfEsiStats.pfPaidCount,
        pfPendingCount: pfEsiStats.pfPendingCount,
        esiPaidCount: pfEsiStats.esiPaidCount,
        esiPendingCount: pfEsiStats.esiPendingCount,
      };
    });
  }, [attendanceRecords, totalMonthlyGross, bonusByMonth, pfEsiByMonth, availableMonths]);

  const currentMonthSummary = useMemo(() => {
    return monthSummaries.find((m) => m.monthKey === selectedMonth) || {
      monthKey: selectedMonth,
      label: getMonthLabel(selectedMonth),
      monthlyPayroll: totalMonthlyGross,
      bonuses: 0,
      overtimeHours: 0,
      presentCount: 0,
      leaveCount: 0,
      absentCount: 0,
      pfTotal: 0,
      esiTotal: 0,
      pfPaidCount: 0,
      pfPendingCount: 0,
      esiPaidCount: 0,
      esiPendingCount: 0,
    };
  }, [monthSummaries, selectedMonth, totalMonthlyGross]);

  const previousMonthSummary = useMemo(() => {
    const idx = monthSummaries.findIndex((m) => m.monthKey === selectedMonth);
    if (idx > 0) return monthSummaries[idx - 1];
    return undefined;
  }, [monthSummaries, selectedMonth]);

  const monthlyPayrollNow = currentMonthSummary.monthlyPayroll;
  const overtimeHoursNow = currentMonthSummary.overtimeHours;
  const totalBonusCurrentMonth = currentMonthSummary.bonuses;

  const payrollDeltaPercent =
    previousMonthSummary && previousMonthSummary.monthlyPayroll > 0
      ? ((monthlyPayrollNow - previousMonthSummary.monthlyPayroll) /
          previousMonthSummary.monthlyPayroll) *
        100
      : 0;

  const otDeltaPercent =
    previousMonthSummary && previousMonthSummary.overtimeHours > 0
      ? ((overtimeHoursNow - previousMonthSummary.overtimeHours) /
          previousMonthSummary.overtimeHours) *
        100
      : 0;

  const bonusDeltaPercent =
    previousMonthSummary && previousMonthSummary.bonuses > 0
      ? ((totalBonusCurrentMonth - previousMonthSummary.bonuses) /
          previousMonthSummary.bonuses) *
        100
      : 0;

  const payrollDeltaUp = payrollDeltaPercent >= 0;
  const otDeltaUp = otDeltaPercent >= 0;
  const bonusDeltaUp = bonusDeltaPercent >= 0;

  const topEarners = useMemo(() => {
    const sorted = [...employees].sort(
      (a, b) =>
        (b.salary?.grossMonthly || 0) - (a.salary?.grossMonthly || 0)
    );
    return sorted.slice(0, 5);
  }, [employees]);

  const exportPayrollCSV = () => {
    const headers = [
      'EmployeeID',
      'Name',
      'Department',
      'Role',
      'GrossMonthly',
      'CTC_LPA',
      'PF_Amount',
      'PF_Status',
      'ESI_Amount',
      'ESI_Status',
    ];

    const monthData = pfData[selectedMonth] || {};
    const esiMonthData = esiData[selectedMonth] || {};

    const rows = employees.map((e) => {
      const pfEntry = monthData[e.id!];
      const esiEntry = esiMonthData[e.id!];
      return [
        e.employeeId,
        e.name,
        e.department,
        e.role,
        e.salary?.grossMonthly ?? 0,
        e.salary?.ctcLPA ?? 0,
        pfEntry?.pfAmount ?? 0,
        pfEntry?.paymentStatus ?? '-',
        esiEntry?.esiAmount ?? 0,
        esiEntry?.paymentStatus ?? '-',
      ];
    });

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hr-payroll-dashboard-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header with Month Filter */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">HR & Payroll Dashboard</h1>
          <p className="text-muted-foreground flex items-center gap-2">
            <CalendarRange className="h-4 w-4" />
            Overview of employees, payroll, overtime and bonuses
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm">Month:</Label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableMonths.map((m) => (
                  <SelectItem key={m} value={m}>
                    {new Date(`${m}-01`).toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={exportPayrollCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Top layout: left summary cards + right bar chart */}
      <div className="grid gap-6 lg:grid-cols-[260px,minmax(0,1fr)]">
        {/* Left stack of cards */}
        <div className="space-y-4">
          {/* Monthly Payroll */}
          <Card className="border-primary/30 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Monthly Payroll
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {formatINR(monthlyPayrollNow)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Base salary + approved bonuses
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <IndianRupee className="h-5 w-5 text-primary" />
                </div>
              </div>
              {previousMonthSummary && (
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 ${
                      payrollDeltaUp
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {payrollDeltaUp ? (
                      <ArrowUpRight className="h-3 w-3 mr-1" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 mr-1" />
                    )}
                    {Math.abs(payrollDeltaPercent).toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground">vs last month</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Overtime */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Overtime Hours
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {formatNumber(overtimeHoursNow)} hrs
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Total OT logged in attendance
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                  <Clock3 className="h-5 w-5 text-blue-600" />
                </div>
              </div>

              {previousMonthSummary && (
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 ${
                      otDeltaUp
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {otDeltaUp ? (
                      <ArrowUpRight className="h-3 w-3 mr-1" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 mr-1" />
                    )}
                    {Math.abs(otDeltaPercent).toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground">vs last month</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bonuses */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Bonuses & Incentives
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {formatINR(totalBonusCurrentMonth)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Approved bonuses for {selectedMonth}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-rose-50 flex items-center justify-center">
                  <Gift className="h-5 w-5 text-rose-600" />
                </div>
              </div>

              {previousMonthSummary && (
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 ${
                      bonusDeltaUp
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {bonusDeltaUp ? (
                      <ArrowUpRight className="h-3 w-3 mr-1" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 mr-1" />
                    )}
                    {Math.abs(bonusDeltaPercent).toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground">vs last month</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right side: overview bar chart */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
            <div>
              <p className="text-sm font-semibold">Payroll Overview (Last 12 Months)</p>
              <p className="text-xs text-muted-foreground">
                Monthly payroll with bonuses and overtime
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                Payroll
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                OT Hrs
              </span>
            </div>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthSummaries} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#666', textAnchor: 'middle' }}
                  interval={0}
                  tickMargin={10}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip
                  formatter={(value: any, name: any) => {
                    if (name === 'monthlyPayroll') return [formatINR(value as number), 'Payroll'];
                    if (name === 'overtimeHours')
                      return [`${(value as number).toFixed(2)} hrs`, 'OT Hours'];
                    return [value, name];
                  }}
                  labelFormatter={(l) => `Month: ${l}`}
                />
                <Bar
                  dataKey="monthlyPayroll"
                  name="Payroll"
                  radius={[6, 6, 0, 0]}
                  fill="#3b82f6"
                  maxBarSize={40}
                />
                <Bar
                  dataKey="overtimeHours"
                  name="OT Hours"
                  radius={[6, 6, 0, 0]}
                  fill="#10b981"
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <TodoManager basePath="todos/hr" title="HR TODO List" />

      {/* PF and ESI Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-purple-200 bg-purple-50/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-purple-900">Provident Fund (PF)</p>
              <Badge variant="outline" className="border-purple-300 text-purple-700">
                {selectedMonth}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Total PF Amount</p>
              <p className="text-2xl font-bold text-purple-700">
                {formatINR(currentMonthSummary.pfTotal)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-green-50 p-3 border border-green-200">
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="text-xl font-bold text-green-700">
                  {currentMonthSummary.pfPaidCount}
                </p>
              </div>
              <div className="rounded-lg bg-orange-50 p-3 border border-orange-200">
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-xl font-bold text-orange-700">
                  {currentMonthSummary.pfPendingCount}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-teal-200 bg-teal-50/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-teal-900">Employee State Insurance (ESI)</p>
              <Badge variant="outline" className="border-teal-300 text-teal-700">
                {selectedMonth}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Total ESI Amount</p>
              <p className="text-2xl font-bold text-teal-700">
                {formatINR(currentMonthSummary.esiTotal)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-green-50 p-3 border border-green-200">
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="text-xl font-bold text-green-700">
                  {currentMonthSummary.esiPaidCount}
                </p>
              </div>
              <div className="rounded-lg bg-orange-50 p-3 border border-orange-200">
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-xl font-bold text-orange-700">
                  {currentMonthSummary.esiPendingCount}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle: quick stats cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total Employees</p>
              <p className="text-2xl font-bold">{totalEmployees}</p>
            </div>
            <Users className="h-6 w-6 text-blue-600" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4 space-y-1">
            <p className="text-xs text-muted-foreground">Active / Inactive</p>
            <div className="flex items-center gap-4">
              <Badge className="bg-emerald-100 text-emerald-800">
                Active {activeEmployees}
              </Badge>
              <Badge variant="outline">
                Inactive {totalEmployees - activeEmployees}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Avg CTC</p>
            <p className="text-2xl font-bold">
              {avgCTC.toFixed(1)} LPA
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Payslips / Other Docs</p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-2xl font-bold">{totalPayslips}</p>
              <FileText className="h-6 w-6 text-indigo-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Staff</p>
            <p className="text-xl font-semibold">{staffCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Workers</p>
            <p className="text-xl font-semibold">{workerCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Other Workers</p>
            <p className="text-xl font-semibold">{otherWorkersCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Bonus Records</p>
            <p className="text-xl font-semibold">{totalBonusRecords}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Total bonus paid: {formatINR(totalBonusAllTime)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bottom: Top earners list */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Top Payroll Employees</p>
              <p className="text-xs text-muted-foreground">
                Highest gross salary employees in the organisation
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Gross Monthly</TableHead>
                  <TableHead>CTC (LPA)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topEarners.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-semibold">{e.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{e.department}</Badge>
                    </TableCell>
                    <TableCell>{e.role}</TableCell>
                    <TableCell className="font-medium text-emerald-700">
                      {formatINR(e.salary?.grossMonthly || 0)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-blue-200 text-blue-700">
                        {e.salary?.ctcLPA || 0} LPA
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {topEarners.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No employees found in payroll data.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
