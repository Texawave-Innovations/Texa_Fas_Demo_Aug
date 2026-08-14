import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Activity, ClipboardList, AlertTriangle, CalendarClock, Cog } from 'lucide-react';
import { database } from '@/services/firebase';
import { ref, onValue, off } from 'firebase/database';
import { format, isPast } from 'date-fns';
import type { Asset, PMSchedule, WorkOrder } from '@/types/cmms';

export default function CMMSDashboard() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [pmSchedules, setPmSchedules] = useState<PMSchedule[]>([]);

  useEffect(() => {
    const aRef = ref(database, 'cmms/assets');
    const wRef = ref(database, 'cmms/workOrders');
    const pRef = ref(database, 'cmms/pmSchedules');

    const u1 = onValue(aRef, (snap) => {
      const data = snap.val() || {};
      setAssets(Object.keys(data).map((k) => ({ ...data[k], id: k })));
    });
    const u2 = onValue(wRef, (snap) => {
      const data = snap.val() || {};
      setWorkOrders(Object.keys(data).map((k) => ({ ...data[k], id: k })));
    });
    const u3 = onValue(pRef, (snap) => {
      const data = snap.val() || {};
      setPmSchedules(Object.keys(data).map((k) => ({ ...data[k], id: k })));
    });

    return () => {
      off(aRef, 'value', u1);
      off(wRef, 'value', u2);
      off(pRef, 'value', u3);
    };
  }, []);

  const operationalAssets = assets.filter((a) => a.status === 'Operational').length;
  const uptime = assets.length > 0 ? (operationalAssets / assets.length) * 100 : 100;
  const openWorkOrders = workOrders.filter((w) => w.status !== 'Completed' && w.status !== 'Cancelled').length;
  const overduePM = pmSchedules.filter((s) => {
    if (s.status !== 'Active') return false;
    if (s.triggerType === 'Time' && s.nextDueDate) return isPast(new Date(s.nextDueDate));
    return false;
  }).length;

  const now = new Date();
  const completedThisMonth = workOrders.filter((w) => {
    if (w.status !== 'Completed' || !w.completedDate) return false;
    const d = new Date(w.completedDate);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const laborHours = completedThisMonth.reduce((s, w) => s + (w.laborHours || 0), 0);
  const maintenanceCost = completedThisMonth.reduce((s, w) => s + (w.cost || 0), 0);

  const stats = [
    { label: 'Fleet Uptime', value: `${uptime.toFixed(0)}%`, icon: Activity, color: uptime >= 90 ? 'text-green-600' : 'text-amber-600', bg: uptime >= 90 ? 'bg-green-50' : 'bg-amber-50' },
    { label: 'Open Work Orders', value: openWorkOrders, icon: ClipboardList, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Overdue PM', value: overduePM, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Total Assets', value: assets.length, icon: Cog, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Labor Hours (This Month)', value: laborHours.toFixed(1), icon: CalendarClock, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: 'Maintenance Cost (This Month)', value: maintenanceCost.toLocaleString(), icon: Activity, color: 'text-orange-600', bg: 'bg-orange-50' },
  ];

  const recentWorkOrders = [...workOrders].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-lg ${s.bg}`}>
                    <Icon className={`h-5 w-5 ${s.color}`} />
                  </div>
                  <div>
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent Work Orders</CardTitle></CardHeader>
        <CardContent>
          {recentWorkOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No work orders yet.</p>
          ) : (
            <div className="space-y-0">
              {recentWorkOrders.map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusBadge status={w.status} className="shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{w.title}</span>
                      <span className="text-xs text-muted-foreground ml-2">{w.assetName}</span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {w.scheduledDate ? (() => { try { return format(new Date(w.scheduledDate), 'dd-MM-yyyy'); } catch { return w.scheduledDate; } })() : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
