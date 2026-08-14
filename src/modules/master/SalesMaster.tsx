'use client';

import { Outlet, NavLink, useLocation, Navigate } from 'react-router-dom';
import { Users, Package, Layers, Settings } from 'lucide-react';

export default function SalesMaster() {
  const location = useLocation();

  // If path is exactly `/master/sales`, redirect to customer
  if (location.pathname === '/master/sales' || location.pathname === '/master/sales/') {
    return <Navigate to="/master/sales/customer" replace />;
  }

  const subTabs = [
    { path: '/master/sales/customer', label: 'Customer Master', icon: Users },
    { path: '/master/sales/item', label: 'Item Master', icon: Package },
    { path: '/master/sales/bom', label: 'BOM Master', icon: Layers },
    { path: '/master/sales/general', label: 'General Settings', icon: Settings },
  ];

  return (
    <div className="space-y-6 pb-10">
      <div className="border-b border-border">
        <nav className="flex gap-2 overflow-x-auto no-scrollbar -mb-px">
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            // Highlight tab even when viewing child routes (e.g. /master/sales/bom/:id)
            const isActive = location.pathname.startsWith(tab.path);
            
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-md whitespace-nowrap transition-all flex items-center gap-2 border-b-2 ${
                  isActive
                    ? 'bg-background text-primary border-primary shadow-sm font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/40'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="mt-4">
        <Outlet />
      </div>
    </div>
  );
}
