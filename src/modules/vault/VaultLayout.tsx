import { useEffect, useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { LiveClock } from '@/components/layout/LiveClock';
import { LayoutDashboard, FolderLock, ShieldCheck, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { database } from '@/services/firebase';
import { ref, onValue, off } from 'firebase/database';
import { useVaultAccessSettings, isApprover } from './vaultAccess';
import type { VaultAccessRequest } from '@/types/vault';

export default function VaultLayout() {
  const { user } = useAuth();
  const { settings } = useVaultAccessSettings();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const reqRef = ref(database, 'vault/accessRequests');
    const unsub = onValue(reqRef, (snap) => {
      const data = snap.val() || {};
      const requests: VaultAccessRequest[] = Object.keys(data).map((k) => ({ ...data[k], id: k }));
      setPendingCount(requests.filter((r) => r.status === 'pending').length);
    });
    return () => off(reqRef, 'value', unsub);
  }, []);

  if (!user) return null;

  const approver = isApprover(user, settings);
  const admin = user.role.toLowerCase() === 'admin';

  const tabs = [
    { path: '/vault', label: 'Dashboard', icon: LayoutDashboard, end: true, show: true, badge: 0 },
    { path: '/vault/documents', label: 'Documents', icon: FolderLock, end: false, show: true, badge: 0 },
    { path: '/vault/approvals', label: 'Approvals', icon: ShieldCheck, end: false, show: approver, badge: pendingCount },
    { path: '/vault/access', label: 'Access Control', icon: Settings2, end: false, show: admin, badge: 0 },
  ].filter((t) => t.show);

  return (
    <Layout>
      <div className="space-y-5 pb-10 animate-fade-in">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-10 rounded-full bg-gradient-to-b from-primary to-primary/20" />
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Document &amp; Drawing Vault</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Drawings, BOMs, certificates &amp; export-control paperwork — classified &amp; approval-gated</p>
            </div>
          </div>
          <LiveClock />
        </div>

        {/* Pill tabs */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar bg-muted/60 rounded-xl p-1 w-fit max-w-full">
          {tabs.map(({ path, label, icon: Icon, end, badge }) => (
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
              {badge > 0 && (
                <span className="ml-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                  {badge}
                </span>
              )}
            </NavLink>
          ))}
        </div>

        <Outlet />
      </div>
    </Layout>
  );
}
