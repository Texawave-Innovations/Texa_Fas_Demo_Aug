import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard, ShoppingCart, Users, ClipboardCheck,
  Archive, Server, Settings, ChevronLeft, ChevronRight,
  LogOut, Package, Truck, Landmark, Wrench, History, FolderLock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
}

const menuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard',   icon: LayoutDashboard, path: '/dashboard' },
  { id: 'sales',     label: 'Sales',        icon: ShoppingCart,    path: '/sales' },
  { id: 'hr',        label: 'HR',           icon: Users,           path: '/hr/dashboard' },
  { id: 'production',label: 'Production',   icon: Archive,         path: '/production' },
  { id: 'quality',   label: 'Quality',      icon: ClipboardCheck,  path: '/quality' },
  { id: 'inventory', label: 'Inventory',    icon: Package,         path: '/inventory' },
  { id: 'dispatch',  label: 'Dispatch',     icon: Truck,           path: '/dispatch' },
  { id: 'finance',   label: 'Accounts',     icon: Landmark,        path: '/finance' },
  { id: 'cmms',      label: 'Maintenance',  icon: Wrench,          path: '/cmms' },
  { id: 'vault',     label: 'Document Vault', icon: FolderLock,    path: '/vault' },
  { id: 'master',    label: 'Master Lists', icon: Server,          path: '/master' },
  { id: 'audit',     label: 'Audit Trail',  icon: History,         path: '/audit' },
  { id: 'settings',  label: 'Settings',     icon: Settings,        path: '/settings' },
];

export const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout, hasAccess } = useAuth();
  const filteredMenuItems = menuItems.filter(item => hasAccess(item.id));

  const initials = user
    ? user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <aside
      className={cn(
        'h-screen flex flex-col transition-all duration-300 ease-in-out sticky top-0 z-30',
        'bg-[hsl(var(--sidebar-background))]',
        collapsed ? 'w-[68px]' : 'w-64',
      )}
    >
      {/* ── Logo / header ── */}
      <div className={cn(
        'flex items-center border-b border-[hsl(var(--sidebar-border))]',
        collapsed ? 'h-16 justify-center px-2' : 'h-16 justify-between px-4',
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg overflow-hidden ring-2 ring-white/10 flex-shrink-0">
              <img
                src="https://i.postimg.cc/HxQtB69t/fas.jpg"
                alt="Logo"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-white leading-tight">FAS ERP</p>
              <p className="text-[10px] text-[hsl(var(--sidebar-foreground))] leading-tight">
                Pvt Ltd
              </p>
            </div>
          </div>
        )}

        {collapsed && (
          <div className="h-8 w-8 rounded-lg overflow-hidden ring-2 ring-white/10">
            <img
              src="https://i.postimg.cc/HxQtB69t/fas.jpg"
              alt="Logo"
              className="h-full w-full object-cover"
            />
          </div>
        )}

        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-lg text-[hsl(var(--sidebar-foreground))] hover:bg-white/10 hover:text-white transition-colors flex-shrink-0"
            title="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── User card ── */}
      {!collapsed && user && (
        <div className="px-3 py-3 border-b border-[hsl(var(--sidebar-border))]">
          <div className="flex items-center gap-3 px-1">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-900/40">
              <span className="text-white font-semibold text-xs">{initials}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-white truncate">{user.name}</p>
              <p className="text-[11px] text-[hsl(var(--sidebar-foreground))] capitalize">{user.role}</p>
            </div>
          </div>
        </div>
      )}

      {collapsed && user && (
        <div className="flex justify-center py-3 border-b border-[hsl(var(--sidebar-border))]">
          <div
            className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md"
            title={user.name}
          >
            <span className="text-white font-semibold text-[10px]">{initials}</span>
          </div>
        </div>
      )}

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto py-3 no-scrollbar">
        <ul className={cn('space-y-0.5', collapsed ? 'px-1.5' : 'px-2')}>
          {filteredMenuItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <NavLink
                  to={item.path}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150',
                      collapsed ? 'justify-center px-2' : 'px-3',
                      isActive
                        ? 'bg-[hsl(var(--sidebar-primary))] text-white shadow-md shadow-blue-900/30'
                        : 'text-[hsl(var(--sidebar-foreground))] hover:bg-white/[0.08] hover:text-white',
                    )
                  }
                >
                  <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Expand button (collapsed only) ── */}
      {collapsed && (
        <div className="flex justify-center px-1.5 pb-2 border-t border-[hsl(var(--sidebar-border))] pt-2">
          <button
            onClick={() => setCollapsed(false)}
            className="p-2 rounded-lg text-[hsl(var(--sidebar-foreground))] hover:bg-white/10 hover:text-white transition-colors"
            title="Expand sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Logout ── */}
      <div className={cn(
        'border-t border-[hsl(var(--sidebar-border))]',
        collapsed ? 'px-1.5 py-2' : 'px-2 py-2',
      )}>
        <button
          onClick={logout}
          title={collapsed ? 'Logout' : undefined}
          className={cn(
            'w-full flex items-center gap-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150',
            collapsed ? 'justify-center px-2' : 'px-3',
            'text-[hsl(var(--sidebar-foreground))] hover:bg-red-500/15 hover:text-red-400',
          )}
        >
          <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
};
