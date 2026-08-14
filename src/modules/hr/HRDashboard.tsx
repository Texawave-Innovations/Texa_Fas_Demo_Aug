import { useEffect, useState } from 'react';
import {
  Users,
  UserCheck,
  Clock,
  IndianRupee,
  AlertCircle,
  TrendingUp,
  Plus,
  Trash2,
  ListTodo,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { getAllRecords } from '@/services/firebase';
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

interface Employee {
  id: string;
  status?: string;
  department?: string;
}

interface AttendanceEntry {
  status?: string;      // "Present" / "Half Day" / "Leave" / ...
  otHrs?: number;       // overtime hours (otHrs in DB)
  workHrs?: number;
  pendingHrs?: number;
}

interface Loan {
  status?: string;      // "Approved" | "Pending" | "Rejected" | "Repaid"
}

interface Bonus {
  status?: string;      // "Approved" | "Pending" | "Rejected"
}

interface AttendanceApproval {
  status?: 'pending' | 'accepted' | 'rejected';
}

interface PayrollCreditedMonth {
  [empId: string]: boolean;
}

export default function HRDashboard() {
  const [stats, setStats] = useState({
    totalEmployees: 0,
    activeEmployees: 0,
    presentToday: 0,
    overtimeToday: 0,
    pendingApprovals: 0,
    pendingPayroll: 0,
    totalStaff: 0,
    totalWorkers: 0,
  });



  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // hr/employees is an object keyed by firebase employee id
      const employeesData = await getAllRecords('hr/employees');
      const employees: Employee[] = employeesData
        ? Object.values(employeesData)
        : [];

      const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"

      // Attendance for today: hr/attendance/<date> or {}
      const todayAttendanceData = await getAllRecords(
        `hr/attendance/${today}`,
      );
      const todayAttendance: AttendanceEntry[] = todayAttendanceData
        ? Object.values(todayAttendanceData)
        : [];

      // Optional: loans and bonuses for "pending approvals"
      const loansData = await getAllRecords('hr/loans');
      const loans: Loan[] = loansData
        ? Object.values(loansData)
        : [];

      const bonusesData = await getAllRecords('hr/bonuses');
      const bonuses: Bonus[] = bonusesData
        ? Object.values(bonusesData)
        : [];

      // Attendance approvals for "pending approvals"
      const attendanceApprovalsData =
        await getAllRecords('hr/attendanceApprovals');
      const attendanceApprovals: AttendanceApproval[] =
        attendanceApprovalsData
          ? Object.values(attendanceApprovalsData).flatMap(
              (empMap: any) => Object.values(empMap),
            )
          : [];

      // Payroll credited for current month to estimate "pending payroll"
      const currentMonth = today.slice(0, 7); // "YYYY-MM"
      const payrollCreditedData = await getAllRecords(
        `hr/payrollCredited/${currentMonth}`,
      );
      const payrollCredited: PayrollCreditedMonth =
        (payrollCreditedData || {}) as any;

      const totalEmployees = employees.length;
      const activeEmployees = employees.filter(
        (e) => (e.status || '').toLowerCase() === 'active',
      ).length;

      const totalStaff = employees.filter(
        (e) => e.department === 'Staff',
      ).length;
      const totalWorkers = employees.filter(
        (e) => e.department === 'Worker',
      ).length;

      const presentToday = todayAttendance.filter(
        (a) => a.status === 'Present' || a.status === 'Half Day',
      ).length;

      const overtimeToday = todayAttendance.filter(
        (a) => (a.otHrs || 0) > 0,
      ).length;

      // Pending approvals: pending loans + pending bonuses + pending attendance approvals
      const pendingLoanApprovals = loans.filter(
        (l) => l.status === 'Pending',
      ).length;
      const pendingBonusApprovals = bonuses.filter(
        (b) => b.status === 'Pending',
      ).length;
      const pendingAttendanceApprovals = attendanceApprovals.filter(
        (aa) => aa.status === 'pending',
      ).length;

      const pendingApprovals =
        pendingLoanApprovals +
        pendingBonusApprovals +
        pendingAttendanceApprovals;

      // Pending payroll: active employees that are not yet credited this month
      const creditedEmpIds = new Set(Object.keys(payrollCredited));
      const pendingPayroll = employees.filter(
        (e: any) =>
          (e.status || '').toLowerCase() === 'active' &&
          !creditedEmpIds.has(e.id),
      ).length;

      setStats({
        totalEmployees,
        activeEmployees,
        presentToday,
        overtimeToday,
        pendingApprovals,
        pendingPayroll,
        totalStaff,
        totalWorkers,
      });
    } catch (error) {
      console.error('Error fetching HR dashboard:', error);
    }
  };

  const statCards = [
    {
      title: 'Total Employees',
      value: stats.totalEmployees,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Active Employees',
      value: stats.activeEmployees,
      icon: UserCheck,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Present Today',
      value: stats.presentToday,
      icon: UserCheck,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      title: 'Overtime Today',
      value: stats.overtimeToday,
      icon: Clock,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Pending Approvals',
      value: stats.pendingApprovals,
      icon: AlertCircle,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
    },
    {
      title: 'Pending Payroll',
      value: stats.pendingPayroll,
      icon: IndianRupee,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">HR Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Real-time HR metrics and insights
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Department Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Department Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="font-medium">Staff</span>
              <span className="text-2xl font-bold text-primary">
                {stats.totalStaff}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-medium">Workers</span>
              <span className="text-2xl font-bold text-primary">
                {stats.totalWorkers}
              </span>
            </div>
          </CardContent>
        </Card>

        <TodoManager basePath="todos/hr" title="HR TODO List" />
      </div>
    </div>
  );
}
