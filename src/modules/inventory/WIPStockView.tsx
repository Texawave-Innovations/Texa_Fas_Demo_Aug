import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Input } from '@/components/ui/input';
import { Search, Workflow } from 'lucide-react';
import { database } from '@/services/firebase';
import { ref, onValue, off } from 'firebase/database';
import { WIPStock } from '@/types';

const SAMPLE_WIP: WIPStock[] = [
  { id: 's1', batchId: 'WIP-2026-001', partName: 'Rubber Seal Type A',    partNo: 'RSA-001', quantity: 100, stage: 'Moulding',   createdAt: Date.now() - 86400000 },
  { id: 's2', batchId: 'WIP-2026-002', partName: 'O-Ring Type B (50mm)',   partNo: 'ORB-002', quantity: 200, stage: 'Curing',     createdAt: Date.now() - 172800000 },
  { id: 's3', batchId: 'WIP-2026-003', partName: 'Gasket Type C (Flat)',   partNo: 'GKC-003', quantity: 50,  stage: 'Finishing',  createdAt: Date.now() - 259200000 },
  { id: 's4', batchId: 'WIP-2026-004', partName: 'Rubber Sheet D (2mm)',   partNo: 'RSD-004', quantity: 80,  stage: 'QC Pending', createdAt: Date.now() - 345600000 },
  { id: 's5', batchId: 'WIP-2026-005', partName: 'Sealing Strip E (EPDM)', partNo: 'SSE-005', quantity: 60,  stage: 'Mixing',     createdAt: Date.now() - 432000000 },
];

const STAGE_TONE: Record<string, 'purple' | 'blue' | 'orange' | 'teal' | 'amber'> = {
  Mixing:       'purple',
  Moulding:     'blue',
  Curing:       'orange',
  Finishing:    'teal',
  'QC Pending': 'amber',
};

export default function WIPStockView() {
  const [wipStock, setWipStock] = useState<WIPStock[]>(SAMPLE_WIP);
  const [search,   setSearch]   = useState('');

  useEffect(() => {
    const wipRef = ref(database, 'stores/wip');
    const u = onValue(wipRef, (snap) => {
      const data = snap.val();
      if (data) {
        const list: WIPStock[] = Object.keys(data)
          .map(key => ({ ...data[key], id: key }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (list.length > 0) setWipStock(list);
      }
    });
    return () => off(wipRef, 'value', u);
  }, []);

  const filtered = wipStock.filter(w =>
    w.batchId.toLowerCase().includes(search.toLowerCase()) ||
    w.partName.toLowerCase().includes(search.toLowerCase()) ||
    w.partNo.toLowerCase().includes(search.toLowerCase()) ||
    w.stage.toLowerCase().includes(search.toLowerCase())
  );

  const stageCounts = wipStock.reduce((acc, w) => {
    acc[w.stage] = (acc[w.stage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalQty = wipStock.reduce((s, w) => s + (w.quantity || 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-orange-600">{wipStock.length}</div>
          <p className="text-xs text-muted-foreground mt-1">Active WIP Batches</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-orange-600">{totalQty.toLocaleString('en-IN')}</div>
          <p className="text-xs text-muted-foreground mt-1">Total WIP Units</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-yellow-600">{stageCounts['QC Pending'] || 0}</div>
          <p className="text-xs text-muted-foreground mt-1">Awaiting QC</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-purple-600">{Object.keys(stageCounts).length}</div>
          <p className="text-xs text-muted-foreground mt-1">Active Stages</p>
        </CardContent></Card>
      </div>

      {/* Stage breakdown */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(stageCounts).map(([stage, count]) => (
          <StatusBadge
            key={stage}
            status={`${stage}: ${count} batch${count > 1 ? 'es' : ''}`}
            tone={STAGE_TONE[stage]}
            className="text-sm px-3 py-1"
          />
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5 text-orange-600" />
              WIP Stock Register
            </CardTitle>
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search batch / part..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Batch ID</TableHead>
                  <TableHead>Part Name</TableHead>
                  <TableHead>Part No.</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-center">Stage</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">No WIP records found</TableCell>
                  </TableRow>
                ) : filtered.map((w, idx) => (
                  <TableRow key={w.id}>
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-mono font-bold text-orange-700">{w.batchId}</TableCell>
                    <TableCell className="font-medium">{w.partName}</TableCell>
                    <TableCell className="font-mono text-sm">{w.partNo}</TableCell>
                    <TableCell className="text-right font-bold text-orange-600">{w.quantity.toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={w.stage} tone={STAGE_TONE[w.stage]} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(w.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
