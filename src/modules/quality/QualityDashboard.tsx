'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ClipboardCheck, CheckCircle, XCircle } from 'lucide-react';
import { database } from '@/services/firebase';
import { ref, onValue, off } from 'firebase/database';

interface QualityStats {
  pending: number;
  completed: number;
  todayOk: number;
  todayNotOk: number;
}

export default function QualityDashboard() {
  const [stats, setStats] = useState<QualityStats>({
    pending: 0,
    completed: 0,
    todayOk: 0,
    todayNotOk: 0,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const inspectionsRef = ref(database, 'quality/inspections');
    const today = new Date().toISOString().split('T')[0];

    const unsubscribe = onValue(inspectionsRef, (snapshot) => {
      const data = snapshot.val();

      if (!data) {
        setStats({
          pending: 0,
          completed: 0,
          todayOk: 0,
          todayNotOk: 0,
        });
        setLoading(false);
        return;
      }

      const inspections = Object.values(data) as any[];

      const pending = inspections.filter(i => i.qcStatus === 'pending').length;
      const completed = inspections.filter(i => i.qcStatus === 'completed').length;

      const todayInspections = inspections.filter(
        i => i.inspectionDate === today && i.qcStatus === 'completed'
      );

      const todayOk = todayInspections.reduce((sum, i) => sum + (i.okQty || 0), 0);
      const todayNotOk = todayInspections.reduce((sum, i) => sum + (i.notOkQty || 0), 0);

      setStats({
        pending,
        completed,
        todayOk,
        todayNotOk,
      });

      setLoading(false);
    });

    return () => off(inspectionsRef, 'value', unsubscribe);
  }, []);

  const cards = [
    {
      title: 'Pending QC',
      value: stats.pending,
      icon: ClipboardCheck,
      color: 'text-orange-600',
      bg: 'bg-orange-100',
    },
    {
      title: 'Completed QC',
      value: stats.completed,
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-100',
    },
    {
      title: "Today's OK Qty",
      value: stats.todayOk,
      icon: CheckCircle,
      color: 'text-emerald-600',
      bg: 'bg-emerald-100',
    },
    {
      title: "Today's NOT OK Qty",
      value: stats.todayNotOk,
      icon: XCircle,
      color: 'text-red-600',
      bg: 'bg-red-100',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Quality Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Real-time quality control metrics
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-20" />
                </CardContent>
              </Card>
            ))
          : cards.map((c, i) => {
              const Icon = c.icon;
              return (
                <Card key={i} className="hover:shadow-md transition">
                  <CardHeader className="flex items-center justify-between">
                    <CardTitle className="text-sm text-muted-foreground">
                      {c.title}
                    </CardTitle>
                    <div className={`p-2 rounded-lg ${c.bg}`}>
                      <Icon className={`w-6 h-6 ${c.color}`} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{c.value}</div>
                  </CardContent>
                </Card>
              );
            })}
      </div>
    </div>
  );
}
