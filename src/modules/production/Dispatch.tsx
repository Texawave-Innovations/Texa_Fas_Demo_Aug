import { useState, useEffect, useMemo } from 'react';
import { database } from '@/services/firebase';
import { ref, get, update } from 'firebase/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Printer } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DispatchRow {
  key: string;
  itemCode: string;
  itemName: string;
  packingId: string;
  workOrderNo: string;
  customerName: string;
  customerAddress: string;
  packetQty: number;
  dispatchQty: string;
  barcode: string;
  dispatched: boolean;
  dispatchedAt: string;
  poNo: string;
  soNo: string;
  dueDate: string;
  createdAt?: number;
}

// ── Print Challan ──────────────────────────────────────────────────────────────

function printDispatchChallan(row: DispatchRow) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Dispatch Details - ${row.packingId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #000; padding: 24px; }
    .title { text-align: center; font-size: 16px; font-weight: bold; border: 1px solid #000;
             padding: 6px; margin-bottom: 0; letter-spacing: 1px; }
    .header { display: flex; border: 1px solid #000; border-top: none; }
    .company { flex: 1; padding: 10px 12px; border-right: 1px solid #000; }
    .company .name { font-size: 13px; font-weight: bold; }
    .company .sub  { font-size: 10px; color: #444; margin-bottom: 6px; }
    .company p { font-size: 11px; line-height: 1.6; }
    .customer { width: 240px; padding: 10px 12px; }
    .customer .row { display: flex; gap: 6px; margin-bottom: 4px; font-size: 11px; }
    .customer .label { font-weight: bold; white-space: nowrap; }
    .po-row { display: flex; justify-content: space-between; border: 1px solid #000;
              border-top: none; padding: 6px 12px; font-size: 11px; }
    .po-row span { font-weight: bold; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #000; border-top: none; }
    th { border: 1px solid #000; padding: 6px 8px; text-align: center;
         font-size: 11px; font-weight: bold; background: #f5f5f5; }
    td { border: 1px solid #000; padding: 6px 8px; font-size: 11px; }
    td.center { text-align: center; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="title">DISPATCH DETAILS</div>
  <div class="header">
    <div class="company">
      <div class="name">FCS FLUORO CARBON SEALS PVT LTD.,</div>
      <div class="sub">Mfrs : PTFE, PFA &amp; PEEK Components</div>
      <p>3/7, Old mahabalipuram Road, Thuraipakkam, Chennai - 600 097.</p>
      <p>E-mail :- info@flurocarbonseals.net / fcs@flurocarbonseals.net</p>
      <p>www.flurocarbonseals.com</p>
      <p>Contact No : 2458 0666 / 2458 0888 / 4957 4880.</p>
      <p>GSTIN : 33AABCF4744Q1ZB</p>
    </div>
    <div class="customer">
      <div class="row"><span class="label">Customer :</span> ${row.customerName || '—'}</div>
      <div class="row"><span class="label">Address &nbsp;:</span> ${row.customerAddress || '—'}</div>
    </div>
  </div>
  <div class="po-row">
    <div>PO No : &nbsp;<span>${row.poNo || '—'}</span></div>
    <div>Invoice No : &nbsp;<span>${row.packingId}</span></div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:50px">SNo</th>
        <th style="width:120px">Item Code</th>
        <th>Item Name</th>
        <th style="width:100px">Dispatch Qty</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="center">1</td>
        <td class="center">${row.itemCode || '—'}</td>
        <td>${row.itemName || '—'}</td>
        <td class="center">${row.dispatchQty || row.packetQty}</td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=780,height=600');
  if (!win) { toast({ title: 'Pop-up blocked — allow pop-ups and try again', variant: 'destructive' }); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function Dispatch() {
  const [tab,        setTab]        = useState<'pending' | 'completed'>('pending');
  const [pending,    setPending]    = useState<DispatchRow[]>([]);
  const [completed,  setCompleted]  = useState<DispatchRow[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [saving,     setSaving]     = useState(false);
  const [search,     setSearch]     = useState('');
  const [pageSize,   setPageSize]   = useState(10);
  const [page,       setPage]       = useState(1);
  const [viewRow,    setViewRow]    = useState<DispatchRow | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [woSnap, soSnap, qSnap] = await Promise.all([
        get(ref(database, 'production/workOrders')),
        get(ref(database, 'production/salesOrders')),
        get(ref(database, 'dispatch/packingQueue')),
      ]);

      const soLookup: Record<string, string> = {};
      if (soSnap.exists()) {
        const soRaw = soSnap.val() as Record<string, any>;
        Object.entries(soRaw).forEach(([k, so]) => {
          soLookup[k] = so.soNumber || so.poNumber || k;
        });
      }

      const pend: DispatchRow[] = [];
      const comp: DispatchRow[] = [];
      let   packIdx = 1;

      // ── Work-order based dispatch items ─────────────────────────────────────
      if (woSnap.exists()) {
        const raw = woSnap.val() as Record<string, any>;
        Object.entries(raw).forEach(([key, wo]) => {
          if (wo.packing?.status !== 'dispatched') return;

          const packingId    = wo.dispatch?.packingId  || `PK-${String(packIdx).padStart(6, '0')}`;
          const barcode      = wo.dispatch?.barcode    || `PKBA-${String(packIdx).padStart(6, '0')}`;
          const packetQty    = parseInt(wo.dispatch?.packetQty ?? '1') || 1;
          const dispatched   = !!wo.dispatch?.dispatched;
          const dispatchedAt = wo.dispatch?.dispatchedAt || '';

          const row: DispatchRow = {
            key,
            itemCode:        wo.fgItem        || '',
            itemName:        wo.fgDescription || '',
            packingId,
            workOrderNo:     wo.workOrderNo   || '',
            customerName:    wo.customerName  || '',
            customerAddress: wo.customerAddress || wo.shipToAddress || wo.address || '',
            packetQty,
            dispatchQty:     String(wo.packing?.totalAllocated || ''),
            barcode,
            dispatched,
            dispatchedAt,
            poNo:    wo.poNo               || '',
            soNo:    soLookup[wo.soNo]     || wo.soNo || '',
            dueDate: wo.dueDate            || '',
            createdAt: wo.createdAt        || 0,
          };

          if (dispatched) comp.push(row);
          else            pend.push(row);
          packIdx++;
        });

        // Save generated IDs back to Firebase if not already set
        for (const row of [...pend, ...comp]) {
          const wo = woSnap.val()[row.key];
          if (wo && !wo.dispatch?.packingId) {
            await update(ref(database, `production/workOrders/${row.key}/dispatch`), {
              packingId: row.packingId,
              barcode:   row.barcode,
              packetQty: row.packetQty,
            });
          }
        }
      }

      // ── Direct FG items from Inventory ───────────────────────────────────────
      if (qSnap.exists()) {
        const qRaw = qSnap.val() as Record<string, any>;
        Object.entries(qRaw).forEach(([id, item]) => {
          if (item.status !== 'dispatched') return; // only fully dispatched items
          const packingId = `PK-FG-${String(packIdx).padStart(4, '0')}`;
          const barcode   = `PKBA-FG-${String(packIdx).padStart(4, '0')}`;
          const row: DispatchRow = {
            key:             `fgq_${id}`,
            itemCode:        item.productCode || '',
            itemName:        item.productName || '',
            packingId,
            workOrderNo:     item.productCode || '',
            customerName:    '',
            customerAddress: '',
            packetQty:       1,
            dispatchQty:     String(item.totalAllocated || item.quantity || ''),
            barcode,
            dispatched:      !!item.dispatched,
            dispatchedAt:    item.dispatchedAt || '',
            poNo:            '',
            soNo:            item.soNumber || '',
            dueDate:         '',
            createdAt:       item.createdAt || 0,
          };
          if (row.dispatched) comp.push(row);
          else                pend.push(row);
          packIdx++;
        });
      }

      pend.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      comp.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setPending(pend);
      setCompleted(comp);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const allChecked = (rows: DispatchRow[]) => rows.length > 0 && rows.every(r => selected.has(r.key));
  const toggleAll  = (rows: DispatchRow[]) => {
    if (allChecked(rows)) {
      setSelected(prev => { const n = new Set(prev); rows.forEach(r => n.delete(r.key)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); rows.forEach(r => n.add(r.key)); return n; });
    }
  };

  const handleDispatch = async () => {
    if (selected.size === 0) {
      toast({ title: 'Select at least one item to dispatch', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      await Promise.all([...selected].map(key => {
        if (key.startsWith('fgq_')) {
          const fgId = key.replace('fgq_', '');
          return update(ref(database, `dispatch/packingQueue/${fgId}`), {
            dispatched:   true,
            dispatchedAt: new Date().toISOString(),
          });
        }
        return update(ref(database, `production/workOrders/${key}/dispatch`), {
          dispatched:   true,
          dispatchedAt: new Date().toISOString(),
        });
      }));
      toast({ title: `${selected.size} item(s) dispatched successfully` });
      setSelected(new Set());
      await loadData();
    } finally {
      setSaving(false);
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

  const activeList = tab === 'pending' ? pending : completed;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return activeList.filter(r =>
      !q || [r.itemCode, r.itemName, r.workOrderNo, r.customerName, r.packingId, r.barcode]
        .some(v => v.toLowerCase().includes(q))
    );
  }, [activeList, search]);

  const totalPages    = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return iso; }
  };

  return (
    <div className="space-y-4">

      {/* Tabs */}
      <div className="flex border-b">
        <button className={TAB(tab === 'pending')} onClick={() => { setTab('pending'); setPage(1); setSelected(new Set()); }}>
          Dispatch Pending
          {pending.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
              {pending.length}
            </span>
          )}
        </button>
        <button className={TAB(tab === 'completed')} onClick={() => { setTab('completed'); setPage(1); setSelected(new Set()); }}>
          Dispatch Completed
          {completed.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
              {completed.length}
            </span>
          )}
        </button>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-700">
              {tab === 'pending' ? 'Dispatch Pending Details' : 'Dispatch Completed Details'}
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={loadData} disabled={loading}>
                {loading ? 'Loading…' : 'Refresh'}
              </Button>
              {tab === 'pending' && (
                <Button size="sm" disabled={saving || selected.size === 0}
                  className="h-7 px-4 text-xs bg-blue-700 hover:bg-blue-800 text-white"
                  onClick={handleDispatch}>
                  {saving ? 'Dispatching…' : `Dispatch Selected (${selected.size})`}
                </Button>
              )}
            </div>
          </div>
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
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span>Search:</span>
              <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="h-7 w-44 text-xs" />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-blue-50">
                  <TH className="w-10">S.No</TH>
                  <TH>Item Code</TH>
                  <TH>Item Name</TH>
                  <TH>Packing Id</TH>
                  <TH>WorkOrder No</TH>
                  <TH>SO No</TH>
                  <TH>Customer Name</TH>
                  <TH>Packet Qty</TH>
                  <TH>Dispatch Qty</TH>
                  <TH>Barcode</TH>
                  {tab === 'completed' && <TH>Dispatched On</TH>}
                  <TH className="w-20">Actions</TH>
                  {tab === 'pending' && (
                    <TableHead className="text-xs font-semibold text-slate-700 text-center w-16">
                      <div className="flex flex-col items-center gap-1">
                        <span>Dispatch</span>
                        <input type="checkbox"
                          className="h-3.5 w-3.5 cursor-pointer"
                          checked={allChecked(paginatedRows)}
                          onChange={() => toggleAll(paginatedRows)} />
                      </div>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={tab === 'pending' ? 12 : 12}
                      className="text-center text-muted-foreground py-10 text-sm">
                      {loading ? 'Loading…' : 'No data available in table'}
                    </TableCell>
                  </TableRow>
                ) : paginatedRows.map((row, i) => (
                  <TableRow key={row.key} className="hover:bg-muted/20">
                    <TableCell className="text-xs text-center">{(page - 1) * pageSize + i + 1}</TableCell>
                    <TableCell className="text-xs text-center font-medium text-primary">{row.itemCode}</TableCell>
                    <TableCell className="text-xs max-w-[160px] truncate" title={row.itemName}>
                      {row.itemName}
                    </TableCell>
                    <TableCell className="text-xs text-center">{row.packingId}</TableCell>
                    <TableCell className="text-xs text-center font-medium">{row.workOrderNo}</TableCell>
                    <TableCell className="text-xs text-center font-medium text-primary">{row.soNo || '—'}</TableCell>
                    <TableCell className="text-xs">{row.customerName}</TableCell>
                    <TableCell className="text-xs text-center">{row.packetQty}</TableCell>
                    <TableCell className="text-xs text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                        {row.dispatchQty || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-center font-mono">{row.barcode}</TableCell>

                    {tab === 'completed' && (
                      <TableCell className="text-xs text-center">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                          {formatDate(row.dispatchedAt)}
                        </span>
                      </TableCell>
                    )}

                    {/* View + Print */}
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button size="sm" variant="ghost"
                          className="h-7 w-7 p-0 bg-cyan-500 hover:bg-cyan-600 text-white rounded"
                          onClick={() => setViewRow(row)}
                          title="View details">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost"
                          className="h-7 w-7 p-0 bg-violet-500 hover:bg-violet-600 text-white rounded"
                          onClick={() => printDispatchChallan(row)}
                          title="Print dispatch challan">
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>

                    {/* Dispatch checkbox — pending tab only */}
                    {tab === 'pending' && (
                      <TableCell className="text-center">
                        <input type="checkbox"
                          className="h-4 w-4 cursor-pointer"
                          checked={selected.has(row.key)}
                          onChange={() => toggleSelect(row.key)} />
                      </TableCell>
                    )}
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

      {/* View Detail Modal */}
      {viewRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setViewRow(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-[440px] space-y-3"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-800 border-b pb-2">Dispatch Details</h3>
            {[
              ['Work Order No',  viewRow.workOrderNo],
              ['Packing Id',    viewRow.packingId],
              ['Barcode',       viewRow.barcode],
              ['Item Code',     viewRow.itemCode],
              ['Item Name',     viewRow.itemName],
              ['Customer',      viewRow.customerName],
              ['SO No',         viewRow.soNo],
              ['PO No',         viewRow.poNo],
              ['Due Date',      viewRow.dueDate],
              ['Dispatch Qty',  viewRow.dispatchQty],
              ['Packet Qty',    String(viewRow.packetQty)],
              ['Status',        viewRow.dispatched ? 'Dispatched ✓' : 'Pending'],
              ['Dispatched On', viewRow.dispatched ? formatDate(viewRow.dispatchedAt) : '—'],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-muted-foreground font-medium">{label}</span>
                <span className="font-medium text-slate-800">{val || '—'}</span>
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="outline"
                className="h-8 px-3 text-xs gap-1.5"
                onClick={() => printDispatchChallan(viewRow)}>
                <Printer className="h-3.5 w-3.5" /> Print Challan
              </Button>
              <Button size="sm" variant="outline" onClick={() => setViewRow(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
