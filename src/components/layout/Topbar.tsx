import { useAuth } from '@/context/AuthContext';
import { useLocation } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';

const routeLabels: Record<string, string> = {
  '/dashboard':   'Dashboard',
  '/sales':       'Sales Management',
  '/hr':          'HR Module',
  '/production':  'Production',
  '/quality':     'Quality',
  '/inventory':   'Inventory',
  '/dispatch':    'Dispatch',
  '/master':      'Master Lists',
  '/settings':    'Settings',
};

function getPageLabel(pathname: string): string {
  for (const [prefix, label] of Object.entries(routeLabels)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return label;
  }
  return 'FAS ERP';
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const Topbar = () => {
  const { user } = useAuth();
  const location = useLocation();
  const pageLabel = getPageLabel(location.pathname);
  const initials  = user
    ? user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <header className="h-14 bg-white border-b border-border px-6 flex items-center justify-between sticky top-0 z-20 shadow-sm">
      {/* Page breadcrumb */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{pageLabel}</span>
      </div>

      {/* Right section */}
      {user && (
        <div className="flex items-center gap-3">
          <NotificationBell />
          <div className="h-6 w-px bg-border hidden sm:block" />
          <div className="text-right hidden sm:block">
            <p className="text-[11px] text-muted-foreground leading-tight">{getGreeting()},</p>
            <p className="text-[13px] font-semibold text-foreground leading-tight">{user.name}</p>
          </div>
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <span className="text-white font-semibold text-[11px]">{initials}</span>
          </div>
        </div>
      )}
    </header>
  );
};
