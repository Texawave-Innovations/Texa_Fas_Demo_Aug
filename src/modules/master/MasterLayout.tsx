import { Outlet, NavLink } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { LiveClock } from '@/components/layout/LiveClock';
import { ShoppingCart, Users, ClipboardCheck, Package, Wallet, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { path: '/master/sales',       label: 'Sales Master',       icon: ShoppingCart },
  { path: '/master/hr',          label: 'HR Master',          icon: Users },
  { path: '/master/quality',     label: 'Quality Master',     icon: ClipboardCheck },
  { path: '/master/production',  label: 'Production Master',  icon: Layers },
  { path: '/master/stores',      label: 'Stores Master',      icon: Package },
  { path: '/master/finance',     label: 'Finance Master',     icon: Wallet },
];

export default function MasterLayout() {
  return (
    <Layout>
      <div className="space-y-5 animate-fade-in">

        {/* Page header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-10 rounded-full bg-gradient-to-b from-primary to-primary/20" />
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Master Lists</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Centralized master data for all modules</p>
            </div>
          </div>
          <LiveClock />
        </div>

        {/* Pill tabs */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar bg-muted/60 rounded-xl p-1 w-fit max-w-full">
          {tabs.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
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
