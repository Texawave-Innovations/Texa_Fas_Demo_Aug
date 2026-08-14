import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { getAllRecords } from '@/services/firebase';
import { format, subMonths, startOfMonth } from 'date-fns';
import type { Asset, WorkOrder } from '@/types/cmms';

const STATUS_COLORS: Record<string, string> = {
  Operational: '#16a34a', Down: '#dc2626', 'Under Maintenance': '#f59e0b', Retired: '#94a3b8',
};

function lastNMonths(n: number) {
  const months: { key: string; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = startOfMonth(subMonths(new Date(), i));
    months.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMM yy') });
  }
  return months;
}

export default function CMMSReports() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [a, w] = await Promise.all([getAllRecords('cmms/assets'), getAllRecords('cmms/workOrders')]);
        setAssets(a as Asset[]); setWorkOrders(w as WorkOrder[]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const months = lastNMonths(6);
  const completed = workOrders.filter((w) => w.status === 'Completed' && w.completedDate);

  const byMonth = months.map(({ key, label }) => {
    const inMonth = completed.filter((w) => (w.completedDate || '').startsWith(key));
    return {
      month: label,
      'Labor Hours': Math.round(inMonth.reduce((s, w) => s + (w.laborHours || 0), 0) * 10) / 10,
      'Maintenance Cost': Math.round(inMonth.reduce((s, w) => s + (w.cost || 0), 0)),
      'Work Orders': inMonth.length,
    };
  });

  const statusBreakdown = ['Operational', 'Down', 'Under Maintenance', 'Retired'].map((status) => ({
    name: status,
    value: assets.filter((a) => a.status === status).length,
  })).filter((s) => s.value > 0);

  const avgResolutionDays = (() => {
    const withDates = completed.filter((w) => w.scheduledDate && w.completedDate);
    if (withDates.length === 0) return 0;
    const totalDays = withDates.reduce((s, w) => {
      const d = (new Date(w.completedDate!).getTime() - new Date(w.scheduledDate!).getTime()) / (1000 * 60 * 60 * 24);
      return s + Math.max(0, d);
    }, 0);
    return totalDays / withDates.length;
  })();

  if (loading) return <p className="text-sm text-muted-foreground text-center py-10">Loading reports...</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">Completed Work Orders</p><p className="text-2xl font-bold">{completed.length}</p></CardContent></Card>
        <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">Avg Resolution Time</p><p className="text-2xl font-bold">{avgResolutionDays.toFixed(1)} days</p></CardContent></Card>
        <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">Total Assets Tracked</p><p className="text-2xl font-bold">{assets.length}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Labor Hours &amp; Maintenance Cost (Last 6 Months)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byMonth}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Labor Hours" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Maintenance Cost" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Asset Status Breakdown</CardTitle></CardHeader>
          <CardContent>
            {statusBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No assets yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={statusBreakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {statusBreakdown.map((entry, i) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.name] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
