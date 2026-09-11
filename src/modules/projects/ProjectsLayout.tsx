// src/modules/projects/ProjectsLayout.tsx
import { Outlet, NavLink } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { LiveClock } from '@/components/layout/LiveClock';
import {
  PlayCircle,
  Clock,
  Calculator,
  Layers,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { path: '/projects',             label: 'Live Operations',    icon: PlayCircle,  end: true },
  { path: '/projects/manual-log',  label: 'Manual Wage Log',    icon: Clock,       end: false },
  { path: '/projects/summary',     label: 'Wage Summary & Logs',icon: Calculator,  end: false },
  { path: '/projects/masters',     label: 'Machines & Workers', icon: Layers,      end: false },
];

export default function ProjectsLayout() {
  return (
    <Layout>
      <div className="space-y-5 pb-10 animate-fade-in">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-10 rounded-full bg-gradient-to-b from-blue-600 to-indigo-600" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-foreground tracking-tight">Projects & Machine Costing</h1>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60 dark:bg-blue-950/40 dark:text-blue-300">
                  <Sparkles className="w-2.5 h-2.5" /> Direct Labor & Machine Runtime
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Track live machine run hours, assign team operators, and calculate real-time employee wages
              </p>
            </div>
          </div>
          <LiveClock />
        </div>

        {/* Pill navigation tabs */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar bg-muted/60 p-1 rounded-xl w-fit max-w-full border border-border/40">
          {tabs.map(({ path, label, icon: Icon, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150',
                  isActive
                    ? 'bg-white text-blue-700 shadow-sm font-semibold dark:bg-slate-900 dark:text-blue-400'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/60 dark:hover:bg-slate-800/60',
                )
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </NavLink>
          ))}
        </div>

        {/* View Content */}
        <Outlet />
      </div>
    </Layout>
  );
}

