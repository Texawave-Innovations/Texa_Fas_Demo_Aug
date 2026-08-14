import { Outlet, NavLink } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { LiveClock } from '@/components/layout/LiveClock';
import {
  LayoutDashboard, Cog, ClipboardList, CalendarClock, PackageSearch, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { path: '/cmms',                          label: 'Dashboard',              icon: LayoutDashboard, end: true },
  { path: '/cmms/assets',                   label: 'Assets',                 icon: Cog,             end: false },
  { path: '/cmms/work-orders',              label: 'Work Orders',            icon: ClipboardList,   end: false },
  { path: '/cmms/preventive-maintenance',   label: 'Preventive Maintenance', icon: CalendarClock,   end: false },
  { path: '/cmms/spare-parts',              label: 'Spare Parts',            icon: PackageSearch,   end: false },
  { path: '/cmms/reports',                  label: 'Reports',                icon: BarChart3,       end: false },
];

export default function CMMSLayout() {
  return (
    <Layout>
      <div className="space-y-5 pb-10 animate-fade-in">

        {/* Page header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-10 rounded-full bg-gradient-to-b from-primary to-primary/20" />
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Maintenance</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Assets, work orders &amp; preventive maintenance</p>
            </div>
          </div>
          <LiveClock />
        </div>

        {/* Pill tabs */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar bg-muted/60 rounded-xl p-1 w-fit max-w-full">
          {tabs.map(({ path, label, icon: Icon, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
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

        <Outlet />
      </div>
    </Layout>
  );
}
