import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Package, FlaskConical, Workflow, AlertTriangle, TrendingUp, ClipboardList } from 'lucide-react';
import { database } from '@/services/firebase';
import { ref, onValue, off } from 'firebase/database';

const SAMPLE_MOVEMENTS = [
  { type: 'GRN',    material: 'Natural Rubber (NR-GRADE-1)',  qty: 500, unit: 'kg',  date: '2026-06-05', status: 'Received'  },
  { type: 'Issue',  material: 'SBR-1502 Compound',             qty: 120, unit: 'kg',  date: '2026-06-04', status: 'Issued'    },
  { type: 'FG In',  material: 'Rubber Seal Type A',            qty: 250, unit: 'Nos', date: '2026-06-04', status: 'QC Passed' },
  { type: 'GRN',    material: 'Carbon Black N330',             qty: 200, unit: 'kg',  date: '2026-06-03', status: 'Received'  },
  { type: 'Issue',  material: 'Zinc Oxide 99%',                qty: 50,  unit: 'kg',  date: '2026-06-02', status: 'Issued'    },
  { type: 'FG In',  material: 'O-Ring Type B (50mm)',          qty: 180, unit: 'Nos', date: '2026-06-01', status: 'QC Passed' },
];

const movementTone = (type: string) => {
  if (type === 'GRN')   return 'blue' as const;
  if (type === 'FG In') return 'green' as const;
  return 'orange' as const;
};

const statusTone = (status: string) => {
  if (status === 'QC Passed') return 'green' as const;
  if (status === 'Received')  return 'blue' as const;
  return 'orange' as const;
};

export default function InventoryDashboard() {
  const [fgCount,      setFgCount]      = useState(5);
  const [rmQty,        setRmQty]        = useState(2980);
  const [wipCount,     setWipCount]     = useState(4);
  const [grnCount,     setGrnCount]     = useState(5);
  const [lowStock,     setLowStock]     = useState(2);

  useEffect(() => {
    const fgRef  = ref(database, 'stores/fg');
    const rawRef = ref(database, 'stores/raw');
    const wipRef = ref(database, 'stores/wip');
    const grnRef = ref(database, 'stores/grn');

    const u1 = onValue(fgRef, (snap) => {
      const data = snap.val();
      if (data) {
        const ok = Object.values(data as Record<string, any>).filter(i => i.qc === 'ok');
        setFgCount(ok.length || 5);
        setLowStock(ok.filter(i => (i.quantity || 0) <= 10).length || 2);
      }
    });
    const u2 = onValue(rawRef, (snap) => {
      const data = snap.val();
      if (data) {
        const total = Object.values(data as Record<string, any>).reduce(
          (sum: number, i: any) => sum + (i.qty || 0), 0
        );
        if (total > 0) setRmQty(total);
      }
    });
    const u3 = onValue(wipRef, (snap) => {
      const data = snap.val();
      if (data) setWipCount(Object.keys(data).length || 4);
    });
    const u4 = onValue(grnRef, (snap) => {
      const data = snap.val();
      if (data) setGrnCount(Object.keys(data).length || 5);
    });

    return () => {
      off(fgRef,  'value', u1);
      off(rawRef, 'value', u2);
      off(wipRef, 'value', u3);
      off(grnRef, 'value', u4);
    };
  }, []);

  const stats = [
    { label: 'Finished Goods (SKUs)',   value: fgCount,                        icon: Package,       color: 'text-green-600',  bg: 'bg-green-50'  },
    { label: 'Raw Material Stock (kg)', value: rmQty.toLocaleString('en-IN'),  icon: FlaskConical,  color: 'text-blue-600',   bg: 'bg-blue-50'   },
    { label: 'WIP Batches',             value: wipCount,                        icon: Workflow,      color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Low Stock Alerts',        value: lowStock,                        icon: AlertTriangle, color: 'text-red-600',    bg: 'bg-red-50'    },
    { label: 'GRN This Month',          value: grnCount,                        icon: ClipboardList, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Movements Today',         value: 6,                               icon: TrendingUp,    color: 'text-teal-600',   bg: 'bg-teal-50'   },
  ];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
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

      {/* Recent movements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Stock Movements</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-0">
            {SAMPLE_MOVEMENTS.map((m, i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <StatusBadge status={m.type} tone={movementTone(m.type)} />
                  <span className="text-sm font-medium">{m.material}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{m.qty} {m.unit}</span>
                  <span className="hidden sm:inline">{m.date}</span>
                  <StatusBadge status={m.status} tone={statusTone(m.status)} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
