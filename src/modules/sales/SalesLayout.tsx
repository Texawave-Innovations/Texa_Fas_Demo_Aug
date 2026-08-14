'use client';

import { NavLink, Outlet } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { cn } from '@/lib/utils';
import { LiveClock } from '@/components/layout/LiveClock';
import {
  Home, FileText, ShoppingCart, Receipt,
  ClipboardList, Truck, BadgeMinus, BadgeCheck,
} from 'lucide-react';

const salesTabs = [
  { id: 'dashboard',  label: 'Dashboard',              icon: Home,          path: '/sales',       end: true  },
  { id: 'quotations', label: 'Quotations',             icon: FileText,      path: '/sales/quotations' },
  { id: 'orders',     label: 'Orders',                 icon: ShoppingCart,  path: '/sales/orders' },
  { id: 'invoices',   label: 'Invoices',               icon: Receipt,       path: '/sales/invoices' },
  { id: 'challan',    label: 'Delivery Challan',       icon: ClipboardList, path: '/sales/challan' },
  { id: 'shipments',  label: 'Shipments',              icon: Truck,         path: '/sales/shipments' },
  { id: 'nr-gatepass',label: 'Non-returnable Gate Pass',icon: BadgeMinus,  path: '/sales/ngp' },
  { id: 'r-gatepass', label: 'Returnable Gate Pass',   icon: BadgeCheck,   path: '/sales/gp' },
];

export default function SalesLayout() {
  return (
    <Layout>
      <div className="space-y-5 pb-10 animate-fade-in">

        {/* Page header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-10 rounded-full bg-gradient-to-b from-primary to-primary/20" />
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Sales Management</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Complete end-to-end sales lifecycle control</p>
            </div>
          </div>
          <LiveClock />
        </div>

        {/* Pill tabs */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar bg-muted/60 rounded-xl p-1 w-fit max-w-full">
          {salesTabs.map(({ id, label, icon: Icon, path, end }) => (
            <NavLink
              key={id}
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
