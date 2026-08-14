import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { database } from '@/services/firebase';
import { ref, get, update } from 'firebase/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PackingRow {
  key: string;
  soNo: string;
  poNo: string;
  workOrderNo: string;
  dueDate: string;
  customerName: string;
  plannedQty: number;
  producedQty: number;
  totalAllocated: string;
  packingStatus: 'packing_pending' | 'packing_completed' | 'dispatched';
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function Packing() {
  const navigate = useNavigate();
  const [tab,       setTab]       = useState<'pending' | 'completed'>('pending');
  const [pending,   setPending]   = useState<PackingRow[]>([]);
  const [completed, setCompleted] = useState<PackingRow[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [soMap,     setSoMap]     = useState<Record<string, string>>({});  // key → soNumber
  const [allocated, setAllocated] = useState<Record<string, string>>({});
  const [saving,    setSaving]    = useState<string | null>(null);
  const [search,    setSearch]    = useState('');
  const [pageSize,  setPageSize]  = useState(10);
  const [page,      setPage]      = useState(1);
  // Packing validation warning dialog
  const [warnModal, setWarnModal] = useState<{ row: PackingRow; msg: string; excess?: number } | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [woSnap, soSnap, qSnap] = await Promise.all([
        get(ref(database, 'production/workOrders')),
        get(ref(database, 'production/salesOrders')),
        get(ref(database, 'dispatch/packingQueue')),
      ]);

      // Build SO key → soNumber lookup
      const soLookup: Record<string, string> = {};
      if (soSnap.exists()) {
        const soRaw = soSnap.val() as Record<string, any>;
        Object.entries(soRaw).forEach(([k, so]) => {
          soLookup[k] = so.soNumber || so.poNumber || k;
        });
      }
      setSoMap(soLookup);

      const pend: PackingRow[] = [];
      const comp: PackingRow[] = [];

      // ── Work-order based items ─────────────────────────────────────────────
      if (woSnap.exists()) {
        const raw = woSnap.val() as Record<string, any>;
        Object.entries(raw).forEach(([key, wo]) => {
          const qaStatus   = wo.qa?.status;
          const packStatus = wo.packing?.status;
          if (qaStatus !== 'dispatched' && packStatus !== 'packing_completed' && packStatus !== 'dispatched') return;

          const row: PackingRow = {
            key,
            soNo:           soLookup[wo.soNo] || wo.soNo || '',
            poNo:           wo.poNo           || '',
            workOrderNo:    wo.workOrderNo    || '',
            dueDate:        wo.dueDate        || '',
            customerName:   wo.customerName   || '',
            plannedQty:     parseFloat(wo.requiredQty)       || 0,
            producedQty:    parseFloat(wo.qa?.totalAccepted) || 0,
            totalAllocated: String(wo.packing?.totalAllocated || ''),
            packingStatus:
              packStatus === 'dispatched'        ? 'dispatched' :
              packStatus === 'packing_completed' ? 'packing_completed' :
                                                   'packing_pending',
          };
          if (row.packingStatus === 'packing_completed') comp.push(row);
          else if (row.packingStatus === 'packing_pending') pend.push(row);
        });
      }

      // ── Direct FG items (from Inventory → Move to Dispatch) ───────────────
      if (qSnap.exists()) {
        const qRaw = qSnap.val() as Record<string, any>;
        Object.entries(qRaw).forEach(([id, item]) => {
          if (item.status === 'dispatched') return; // already in dispatch tab
          const row: PackingRow = {
            key:            `fgq_${id}`,
            soNo:           item.soNumber    || '',
            poNo:           '',
            workOrderNo:    item.productCode || id,
            dueDate:        new Date(item.createdAt || Date.now()).toLocaleDateString('en-IN'),
            customerName:   item.productName || '',
            plannedQty:     Number(item.quantity) || 0,
            producedQty:    Number(item.quantity) || 0,
            totalAllocated: item.totalAllocated   || '',
            packingStatus:  item.status === 'packing_completed' ? 'packing_completed' : 'packing_pending',
          };
          if (row.packingStatus === 'packing_completed') comp.push(row);
          else pend.push(row);
        });
      }

      setPending(pend);
      setCompleted(comp);
    } finally {
      setLoading(false);
    }
  };

  // Complete packing → move to Packing Completed
  const handleComplete = async (row: PackingRow) => {
    const qty     = allocated[row.key] ?? row.totalAllocated;
    const allocQty = parseFloat(qty)   || 0;
    const prodQty  = row.producedQty;

    if (!qty || allocQty <= 0) {
      toast({ title: 'Enter Total Allocated Qty before completing', variant: 'destructive' });
      return;
    }

    // Validation A: Allocated < Produced
    if (allocQty < prodQty) {
      setWarnModal({
        row,
        msg: `Allocated quantity (${allocQty}) is less than Produced Qty (${prodQty}). Do you still want to proceed?`,
      });
      return;
    }

    // Validation B: Allocated > Produced
    if (allocQty > prodQty) {
      const excess = allocQty - prodQty;
      setWarnModal({
        row,
        msg: `Allocated quantity (${allocQty}) exceeds Produced Qty (${prodQty}). Excess: ${excess.toFixed(3)}. Do you still want to proceed?`,
        excess,
      });
      return;
    }

    await doComplete(row, qty);
  };

  const doComplete = async (row: PackingRow, qty: string) => {
    setSaving(row.key);
    try {
      if (row.key.startsWith('fgq_')) {
        const fgId = row.key.replace('fgq_', '');
        await update(ref(database, `dispatch/packingQueue/${fgId}`), {
          status: 'packing_completed',
          totalAllocated: qty,
          completedAt: new Date().toISOString(),
        });
      } else {
        await update(ref(database, `production/workOrders/${row.key}/packing`), {
          status: 'packing_completed',
          totalAllocated: qty,
          completedAt: new Date().toISOString(),
        });
      }
      toast({ title: `${row.workOrderNo} packing completed` });
      await loadData();
    } finally {
      setSaving(null);
    }
  };

  // Move to Dispatch
  const handleMoveToDispatch = async (row: PackingRow) => {
    setSaving(row.key);
    try {
      if (row.key.startsWith('fgq_')) {
        const fgId = row.key.replace('fgq_', '');
        await update(ref(database, `dispatch/packingQueue/${fgId}`), {
          status: 'dispatched',
          dispatchedAt: new Date().toISOString(),
        });
      } else {
        await update(ref(database, `production/workOrders/${row.key}/packing`), {
          status: 'dispatched',
          dispatchedAt: new Date().toISOString(),
        });
      }
      toast({ title: `${row.workOrderNo} moved to Dispatch` });
      navigate('/dispatch/dispatch');
    } finally {
      setSaving(null);
    }
  };

  const TAB = (active: boolean) =>
    `px-6 py-2 text-sm font-medium border-b-2 transition-colors ${
      active ? 'border-slate-700 text-slate-800'
             : 'border-transparent text-muted-foreground hover:text-slate-700 hover:border-slate-300'}`;

  const TH = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <TableHead className={`text-xs font-semibold text-slate-700 text-center ${className}`}>
      {children}
    </TableHead>
  );

  // ── Filter + paginate ──────────────────────────────────────────────────────

  const activeList = tab === 'pending' ? pending : completed;
  const filtered   = activeList.filter(r => {
    const q = search.toLowerCase();
    return !q || [r.soNo, r.poNo, r.workOrderNo, r.customerName, r.dueDate]
      .some(v => v.toLowerCase().includes(q));
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize);

  const colSpan = tab === 'pending' ? 10 : 10; // same — completed also has Action column now

  return (
    <div className="space-y-4">

      {/* ── Warning / Confirmation Modal ─────────────────────────────────────── */}
      {warnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 space-y-4">
            <h3 className="text-base font-semibold text-amber-700 flex items-center gap-2">
              <span>⚠️</span> Packing Quantity Warning
            </h3>
            <p className="text-sm text-slate-700">{warnModal.msg}</p>
            {warnModal.excess !== undefined && (
              <p className="text-xs font-medium text-red-600 bg-red-50 rounded px-3 py-2">
                Excess quantity: <strong>{warnModal.excess.toFixed(3)}</strong> units
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                className="px-4 py-1.5 rounded border border-slate-300 text-sm hover:bg-slate-50"
                onClick={() => setWarnModal(null)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium"
                onClick={async () => {
                  const row = warnModal.row;
                  const qty = allocated[row.key] ?? row.totalAllocated;
                  setWarnModal(null);
                  await doComplete(row, qty);
                }}
              >
                Proceed Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b">
        <button className={TAB(tab === 'pending')} onClick={() => { setTab('pending'); setPage(1); }}>
          Packing Pending
          {pending.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
              {pending.length}
            </span>
          )}
        </button>
        <button className={TAB(tab === 'completed')} onClick={() => { setTab('completed'); setPage(1); }}>
          Packing Completed
          {completed.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
              {completed.length}
            </span>
          )}
        </button>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold text-slate-700">
            {tab === 'pending' ? 'Packing Pending Details' : 'Packing Completed Details'}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">

          {/* Toolbar */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Show</span>
              <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <span>entries</span>
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={loadData} disabled={loading}>
                {loading ? 'Loading…' : 'Refresh'}
              </Button>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <span>Search:</span>
                <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                  className="h-7 w-44 text-xs" />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-blue-50">
                  <TH className="w-10">S.No</TH>
                  <TH>SO No</TH>
                  <TH>PO No</TH>
                  <TH>WorkOrder No</TH>
                  <TH>Due Date</TH>
                  <TH>Customer Name</TH>
                  <TH>Planned Qty</TH>
                  <TH>Produced Qty</TH>
                  <TH>Total Allocated</TH>
                  <TH className="w-32">Action</TH>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={colSpan}
                      className="text-center text-muted-foreground py-10 text-sm">
                      {loading ? 'Loading…' : 'No data available in table'}
                    </TableCell>
                  </TableRow>
                ) : paginated.map((row, i) => (
                  <TableRow key={row.key} className="hover:bg-muted/20">
                    <TableCell className="text-xs text-center">{(page - 1) * pageSize + i + 1}</TableCell>
                    <TableCell className="text-xs text-center">{row.soNo}</TableCell>
                    <TableCell className="text-xs text-center">{row.poNo}</TableCell>
                    <TableCell className="text-xs text-center font-medium text-primary">
                      {row.workOrderNo}
                    </TableCell>
                    <TableCell className="text-xs text-center">{row.dueDate}</TableCell>
                    <TableCell className="text-xs">{row.customerName}</TableCell>
                    <TableCell className="text-xs text-center">{row.plannedQty}</TableCell>
                    <TableCell className="text-xs text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                        {row.producedQty}
                      </span>
                    </TableCell>

                    {/* Total Allocated */}
                    <TableCell className="text-xs text-center">
                      {tab === 'pending' ? (
                        <Input
                          type="number" min="0"
                          className="h-7 w-24 text-xs mx-auto block"
                          placeholder="Enter qty"
                          value={allocated[row.key] ?? row.totalAllocated}
                          onChange={e =>
                            setAllocated(prev => ({ ...prev, [row.key]: e.target.value }))
                          }
                        />
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                          {row.totalAllocated || '—'}
                        </span>
                      )}
                    </TableCell>

                    {/* Action */}
                    <TableCell className="text-center">
                      {tab === 'pending' ? (
                        <Button size="sm" disabled={saving === row.key}
                          className="h-7 px-3 text-xs bg-green-700 hover:bg-green-800 text-white whitespace-nowrap"
                          onClick={() => handleComplete(row)}>
                          {saving === row.key ? '…' : 'Complete'}
                        </Button>
                      ) : (
                        <Button size="sm" disabled={saving === row.key}
                          className="h-7 px-3 text-xs bg-blue-700 hover:bg-blue-800 text-white whitespace-nowrap"
                          onClick={() => handleMoveToDispatch(row)}>
                          {saving === row.key ? '…' : 'Move to Dispatch'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
            <span>
              Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} entries
            </span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 px-3 text-xs"
                disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const pg = start + i;
                return pg <= totalPages ? (
                  <Button key={pg} size="sm"
                    variant={pg === page ? 'default' : 'outline'}
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setPage(pg)}>{pg}</Button>
                ) : null;
              })}
              <Button size="sm" variant="outline" className="h-7 px-3 text-xs"
                disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
