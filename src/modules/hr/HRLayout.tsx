import { Outlet, NavLink } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { LiveClock } from '@/components/layout/LiveClock';
import { cn } from '@/lib/utils';
import {
  Users, CalendarCheck, HandCoins, FolderOpen, CalendarPlus,
  Timer, CalendarDays, CircleOff, UserCircle, FileStack,
  LayoutDashboard, CheckCircle, ShieldCheck, ShieldPlus,
  BadgePercent, IndianRupee,
} from 'lucide-react';

const hrTabs = [
  { path: '/hr/dashboard',           label: 'Dashboard',           icon: LayoutDashboard },
  { path: '/hr/employees',           label: 'Employees',           icon: Users },
  { path: '/hr/profile',             label: 'Profile',             icon: UserCircle },
  { path: '/hr/attendance',          label: 'Attendance',          icon: CalendarCheck },
  { path: '/hr/approval-attendance', label: 'Approval',            icon: CheckCircle },
  { path: '/hr/payroll',             label: 'Payroll',             icon: IndianRupee },
  { path: '/hr/pf',                  label: 'PF',                  icon: ShieldCheck },
  { path: '/hr/esi',                 label: 'ESI',                 icon: ShieldPlus },
  { path: '/hr/ot-rate',             label: 'OT Rate',             icon: BadgePercent },
  { path: '/hr/loans',               label: 'Loans',               icon: HandCoins },
  { path: '/hr/documents',           label: 'Documents',           icon: FolderOpen },
  { path: '/hr/other-documents',     label: 'Other Docs',          icon: FileStack },
  { path: '/hr/holidays',            label: 'Holidays',            icon: CalendarPlus },
  { path: '/hr/stot',                label: 'Staff OT',            icon: Timer },
  { path: '/hr/full-month-present',  label: 'Full Present',        icon: CalendarDays },
  { path: '/hr/full-month-absent',   label: 'Full Absent',         icon: CircleOff },
  { path: '/hr/bonus',               label: 'Bonus',               icon: IndianRupee },
];

export default function HRLayout() {
  return (
    <Layout>
      <div className="space-y-5 animate-fade-in">

        {/* Page header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-10 rounded-full bg-gradient-to-b from-primary to-primary/20" />
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">HR Module</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Human Resource Management System</p>
            </div>
          </div>
          <LiveClock />
        </div>

        {/* Pill tabs */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar bg-muted/60 rounded-xl p-1 w-fit max-w-full">
          {hrTabs.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200',
                  isActive
                    ? 'bg-white text-primary shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/60',
                )
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </NavLink>
          ))}
        </div>

        <div className="mt-2">
          <Outlet />
        </div>
      </div>
    </Layout>
  );
}
