import { Outlet, NavLink } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { LiveClock } from '@/components/layout/LiveClock';
import {
  LayoutDashboard, FileText, Receipt, BookOpen, Landmark, RefreshCw, BookText, BarChart3,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrgSettings } from '@/context/OrgSettingsContext';

const tabs = [
  { path: '/finance',                     label: 'Dashboard',          icon: LayoutDashboard, end: true },
  { path: '/finance/invoicing',           label: 'Invoicing',          icon: FileText,        end: false },
  { path: '/finance/expenses',            label: 'Expenses & Bills',   icon: Receipt,         end: false },
  { path: '/finance/chart-of-accounts',   label: 'Chart of Accounts',  icon: BookOpen,        end: false },
  { path: '/finance/fixed-assets',        label: 'Fixed Assets',       icon: Building2,       end: false },
  { path: '/finance/banking',             label: 'Banking',            icon: Landmark,        end: false },
  { path: '/finance/currency-adjustments',label: 'Currency Adjustments', icon: RefreshCw,     end: false },
  { path: '/finance/journals',            label: 'Manual Journals',    icon: BookText,        end: false },
  { path: '/finance/reports',             label: 'Reports',            icon: BarChart3,       end: false },
];

export default function AccountsLayout() {
  const { countryConfig } = useOrgSettings();

  return (
    <Layout>
      <div className="space-y-5 pb-10 animate-fade-in">

        {/* Page header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-10 rounded-full bg-gradient-to-b from-primary to-primary/20" />
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Accounts</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Invoicing, expenses, banking &amp; financial reports
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium">
                  {countryConfig.flag} {countryConfig.name} · {countryConfig.currencyCode} · {countryConfig.taxLabel}
                </span>
              </p>
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
