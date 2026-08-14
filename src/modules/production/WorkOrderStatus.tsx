import { useState, useEffect, useMemo, Fragment } from 'react';
import { database } from '@/services/firebase';
import { ref, get, set } from 'firebase/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronRight, CheckCircle2, Clock, Circle } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { toast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SeqRow {
  processType: string;
  processName: string;
  productionMethod: string;
  location: string;
  processDueDate: string;
}

interface TrackingProcess {
  processName: string;
  processType: string;
  assignee: string;
  status: 'pending' | 'in_progress' | 'completed';
  startedAt: string;
  completedAt: string;
  remarks: string;
}

interface WOTracking {
  status: 'in_progress' | 'completed';
  startedAt: string;
  completedAt: string;
  processes: Record<string, TrackingProcess> | TrackingProcess[];
}

interface FullWO {
  workOrderNo: string;
  poNo: string;
  soNo: string;
  customerName: string;
  fgItem: string;
  fgDescription: string;
  requiredQty: string | number;
  dueDate: string;
  workOrderType: string;
  createdAt?: string;
  detail?: {
    rmGrade?: string;
    rmCode?: string;
    materialCode?: string;
  };
  routeSequence?: {
    header?: { routeId?: string; routeName?: string; routeType?: string };
    rows?: Record<string, SeqRow> | SeqRow[];
  };
  tracking?: WOTracking;
}

interface StatusRow {
  woKey: string;
  soNo: string;
  poNo: string;
  workOrderNo: string;
  rmCode: string;
  itemCode: string;
  itemName: string;
  routeId: string;
  requiredQty: string;
  producedQty: string;
  currentProcess: string;
  nextProcess: string;
  dueDate: string;
  status: string;
  customerName: string;
  tracking?: WOTracking;
  createdAt?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseRows(raw: Record<string, SeqRow> | SeqRow[] | undefined): SeqRow[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : Object.values(raw);
}

function normaliseTracking(raw: Record<string, TrackingProcess> | TrackingProcess[] | undefined): TrackingProcess[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : Object.values(raw);
}

function deriveStatus(wo: FullWO, seqRows: SeqRow[]): string {
  if (wo.tracking) {
    if (wo.tracking.status === 'completed') return 'Completed';
    return 'In Progress';
  }
  if (seqRows.length === 0) return 'Pending';
  return 'Pending';
}

function deriveCurrentProcess(wo: FullWO, seqRows: SeqRow[]): string {
  if (wo.tracking) {
    const procs = normaliseTracking(wo.tracking.processes);
    const cur = procs.find(p => p.status === 'in_progress');
    return cur?.processName || procs.find(p => p.status === 'pending')?.processName || '—';
  }
  return seqRows[0]?.processName || '—';
}

function deriveNextProcess(wo: FullWO, seqRows: SeqRow[]): string {
  if (wo.tracking) {
    const procs = normaliseTracking(wo.tracking.processes);
    const curIdx = procs.findIndex(p => p.status === 'in_progress');
    if (curIdx !== -1) {
      return procs.slice(curIdx + 1).find(p => p.status === 'pending')?.processName || '—';
    }
    const firstPending = procs.findIndex(p => p.status === 'pending');
    return firstPending >= 1 ? procs[firstPending].processName : '—';
  }
  return seqRows[1]?.processName || '—';
}

const STATUS_TONE: Record<string, 'slate' | 'blue' | 'green'> = {
  pending:     'slate',
  in_progress: 'blue',
  completed:   'green',
};

// ── Component ─────────────────────────────────────────────────────────────────

interface ProcessTrackingPanelProps {
  row: StatusRow;
  trackingEdit: Record<string, TrackingProcess[]>;
  savingTracking: boolean;
  saveTracking: (woKey: string) => void;
  updateAssignee: (woKey: string, idx: number, val: string) => void;
  updateRemarks: (woKey: string, idx: number, val: string) => void;
  completeProcess: (woKey: string, idx: number) => void;
  startProcess: (woKey: string, idx: number) => void;
}

const ProcessTrackingPanel = ({
  row,
  trackingEdit,
  savingTracking,
  saveTracking,
  updateAssignee,
  updateRemarks,
  completeProcess,
  startProcess,
}: ProcessTrackingPanelProps) => {
  const procs = trackingEdit[row.woKey]?.length
    ? trackingEdit[row.woKey]
    : normaliseTracking(row.tracking?.processes);
  if (!row.tracking) {
    return (
      <div className="p-4 text-sm text-muted-foreground bg-muted/20">
        This work order has not been started yet. Click <strong>Start</strong> on the Work Order page to begin tracking.
      </div>
    );
  }

  const allDone = procs.every(p => p.status === 'completed');

  return (
    <div className="bg-slate-50 border-t p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">
          Process Tracking — {row.workOrderNo}
          <StatusBadge
            status={allDone ? 'All Complete' : 'In Progress'}
            tone={allDone ? 'green' : 'blue'}
            className="ml-3"
          />
        </p>
        <Button size="sm" disabled={savingTracking}
          className="bg-slate-700 hover:bg-slate-800 text-white h-7 text-xs px-4"
          onClick={() => saveTracking(row.woKey)}>
          {savingTracking ? 'Saving…' : 'Save'}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-200 text-slate-600 text-left">
              <th className="px-3 py-2 w-10 font-medium">Step</th>
              <th className="px-3 py-2 font-medium">Process Type</th>
              <th className="px-3 py-2 font-medium">Process Name</th>
              <th className="px-3 py-2 font-medium">Assignee</th>
              <th className="px-3 py-2 font-medium">Remarks</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Started</th>
              <th className="px-3 py-2 font-medium">Completed</th>
              <th className="px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {procs.map((p, idx) => (
              <tr key={idx} className={`border-b ${
                p.status === 'in_progress' ? 'bg-blue-50' :
                p.status === 'completed'   ? 'bg-green-50' : 'bg-white'
              }`}>
                <td className="px-3 py-2 font-medium text-center">
                  {p.status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                  ) : p.status === 'in_progress' ? (
                    <Clock className="h-4 w-4 text-blue-600 mx-auto" />
                  ) : (
                    <Circle className="h-4 w-4 text-gray-400 mx-auto" />
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{p.processType}</td>
                <td className="px-3 py-2 font-medium">{p.processName}</td>

                {/* Assignee — use uncontrolled defaultValue to prevent focus loss */}
                <td className="px-3 py-2">
                  <input
                    key={`${row.woKey}-assignee-${idx}`}
                    className="h-7 text-xs w-32 border border-input rounded-md px-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Enter name"
                    defaultValue={trackingEdit[row.woKey]?.[idx]?.assignee ?? p.assignee}
                    onBlur={e => updateAssignee(row.woKey, idx, e.target.value)}
                    onChange={e => updateAssignee(row.woKey, idx, e.target.value)}
                    disabled={p.status === 'completed'}
                  />
                </td>

                {/* Remarks */}
                <td className="px-3 py-2">
                  <Input
                    className="h-7 text-xs w-36"
                    placeholder="Notes"
                    value={trackingEdit[row.woKey]?.[idx]?.remarks ?? p.remarks}
                    onChange={e => updateRemarks(row.woKey, idx, e.target.value)}
                    disabled={p.status === 'completed'}
                  />
                </td>

                {/* Status badge */}
                <td className="px-3 py-2">
                  <StatusBadge
                    status={p.status === 'in_progress' ? 'In Progress' :
                            p.status === 'completed'   ? 'Completed'   : 'Pending'}
                    tone={STATUS_TONE[p.status]}
                  />
                </td>

                {/* Timestamps */}
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {p.startedAt ? new Date(p.startedAt).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                  }) : '—'}
                </td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {p.completedAt ? new Date(p.completedAt).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                  }) : '—'}
                </td>

                {/* Action */}
                <td className="px-3 py-2">
                  {p.status === 'pending' && (
                    <Button size="sm"
                      className="h-6 text-xs px-2 bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => startProcess(row.woKey, idx)}>
                      Start
                    </Button>
                  )}
                  {p.status === 'in_progress' && (
                    <Button size="sm"
                      className="h-6 text-xs px-2 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => completeProcess(row.woKey, idx)}>
                      Complete
                    </Button>
                  )}
                  {p.status === 'completed' && (
                    <span className="text-green-600 font-medium">✓ Done</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function WorkOrderStatus() {
  const [allRows,  setAllRows]  = useState<StatusRow[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [loaded,   setLoaded]   = useState(false);
  const [search,   setSearch]   = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [page,     setPage]     = useState(1);

  // Expanded row tracking
  const [expandedKey,    setExpandedKey]    = useState<string | null>(null);
  const [trackingEdit,   setTrackingEdit]   = useState<Record<string, TrackingProcess[]>>({});
  const [savingTracking, setSavingTracking] = useState(false);

  // Filters
  const [fPO,       setFPO]       = useState('ALL');
  const [fSO,       setFSO]       = useState('ALL');
  const [fWO,       setFWO]       = useState('ALL');
  const [fItem,     setFItem]     = useState('ALL');
  const [fRoute,    setFRoute]    = useState('ALL');
  const [fStatus,   setFStatus]   = useState('ALL');
  const [fCustomer, setFCustomer] = useState('ALL');

  // Auto-load on mount so status is visible immediately
  useEffect(() => { loadData(); }, []);

  // ── Load ───────────────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    try {
      const [woSnap, soSnap] = await Promise.all([
        get(ref(database, 'production/workOrders')),
        get(ref(database, 'production/salesOrders')),
      ]);
      if (!woSnap.exists()) { setAllRows([]); setLoaded(true); return; }

      // Build SO key → readable number lookup
      const soLookup: Record<string, string> = {};
      if (soSnap.exists()) {
        const soRaw = soSnap.val() as Record<string, any>;
        Object.entries(soRaw).forEach(([k, so]) => {
          soLookup[k] = so.soNumber || so.poNumber || k;
        });
      }

      const raw = woSnap.val() as Record<string, FullWO>;
      // Only show WOs that have been started (tracking exists)
      const rows: StatusRow[] = Object.entries(raw)
        .filter(([, wo]) => !!wo.tracking)
        .map(([key, wo]) => {
          const seqRows = normaliseRows(wo.routeSequence?.rows);
          return {
            woKey:          key,
            soNo:           soLookup[wo.soNo] || wo.soNo || '',
            poNo:           wo.poNo || '',
            workOrderNo:    wo.workOrderNo || '',
            rmCode:         wo.detail?.rmCode || wo.detail?.materialCode || wo.detail?.rmGrade || '',
            itemCode:       wo.fgItem || '',
            itemName:       wo.fgDescription || '',
            routeId:        wo.routeSequence?.header?.routeId || '',
            requiredQty:    String(wo.requiredQty || ''),
            producedQty:    '0',
            currentProcess: deriveCurrentProcess(wo, seqRows),
            nextProcess:    deriveNextProcess(wo, seqRows),
            dueDate:        wo.dueDate || '',
            status:         deriveStatus(wo, seqRows),
            customerName:   wo.customerName || '',
            tracking:       wo.tracking,
            createdAt:      wo.createdAt || '',
          };
        });

      rows.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (dateA !== dateB) return dateB - dateA;
        return b.workOrderNo.localeCompare(a.workOrderNo);
      });

      setAllRows(rows);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  // ── Expand row → load tracking into editable state ────────────────────────

  const toggleExpand = (row: StatusRow) => {
    if (expandedKey === row.woKey) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(row.woKey);
    // Always re-initialise from latest tracking data when expanding
    if (row.tracking) {
      const procs = normaliseTracking(row.tracking.processes);
      setTrackingEdit(prev => ({ ...prev, [row.woKey]: procs.map(p => ({ ...p })) }));
    }
  };

  // ── Process tracking actions ───────────────────────────────────────────────

  const updateAssignee = (woKey: string, idx: number, val: string) => {
    setTrackingEdit(prev => {
      const copy = [...(prev[woKey] || [])];
      copy[idx] = { ...copy[idx], assignee: val };
      return { ...prev, [woKey]: copy };
    });
  };

  const updateRemarks = (woKey: string, idx: number, val: string) => {
    setTrackingEdit(prev => {
      const copy = [...(prev[woKey] || [])];
      copy[idx] = { ...copy[idx], remarks: val };
      return { ...prev, [woKey]: copy };
    });
  };

  const completeProcess = (woKey: string, idx: number) => {
    setTrackingEdit(prev => {
      const copy = [...(prev[woKey] || [])];
      copy[idx] = { ...copy[idx], status: 'completed', completedAt: new Date().toISOString() };
      // Start next pending process
      const nextIdx = copy.findIndex((p, i) => i > idx && p.status === 'pending');
      if (nextIdx !== -1) {
        copy[nextIdx] = { ...copy[nextIdx], status: 'in_progress', startedAt: new Date().toISOString() };
      }
      return { ...prev, [woKey]: copy };
    });
  };

  const startProcess = (woKey: string, idx: number) => {
    setTrackingEdit(prev => {
      const copy = [...(prev[woKey] || [])];
      copy[idx] = { ...copy[idx], status: 'in_progress', startedAt: new Date().toISOString() };
      return { ...prev, [woKey]: copy };
    });
  };

  const saveTracking = async (woKey: string) => {
    const procs = trackingEdit[woKey];
    if (!procs) return;
    setSavingTracking(true);
    try {
      const allCompleted = procs.every(p => p.status === 'completed');
      const tracking: WOTracking = {
        status: allCompleted ? 'completed' : 'in_progress',
        startedAt: procs[0]?.startedAt || new Date().toISOString(),
        completedAt: allCompleted ? new Date().toISOString() : '',
        processes: procs,
      };
      await set(ref(database, `production/workOrders/${woKey}/tracking`), tracking);
      // Update allRows to reflect new tracking
      setAllRows(prev => prev.map(r => {
        if (r.woKey !== woKey) return r;
        const fakeWO: FullWO = {
          workOrderNo: r.workOrderNo, poNo: r.poNo, soNo: r.soNo,
          customerName: r.customerName, fgItem: r.itemCode,
          fgDescription: r.itemName, requiredQty: r.requiredQty,
          dueDate: r.dueDate, workOrderType: '',
          tracking,
        };
        return {
          ...r,
          tracking,
          status:         deriveStatus(fakeWO, []),
          currentProcess: deriveCurrentProcess(fakeWO, []),
          nextProcess:    deriveNextProcess(fakeWO, []),
        };
      }));
      toast({ title: 'Process tracking saved' });
    } finally {
      setSavingTracking(false);
    }
  };

  // ── Dropdown opts ──────────────────────────────────────────────────────────

  const opts = useMemo(() => {
    const u = <T,>(arr: T[]) => ['ALL', ...Array.from(new Set(arr)).filter(Boolean).sort()];
    return {
      po:       u(allRows.map(r => r.poNo)),
      so:       u(allRows.map(r => r.soNo)),
      wo:       u(allRows.map(r => r.workOrderNo)),
      item:     u(allRows.map(r => r.itemCode)),
      route:    u(allRows.map(r => r.routeId)),
      status:   u(allRows.map(r => r.status)),
      customer: u(allRows.map(r => r.customerName)),
    };
  }, [allRows]);

  // ── Filter + search ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allRows.filter(r =>
      (fPO       === 'ALL' || r.poNo         === fPO)       &&
      (fSO       === 'ALL' || r.soNo         === fSO)       &&
      (fWO       === 'ALL' || r.workOrderNo  === fWO)       &&
      (fItem     === 'ALL' || r.itemCode     === fItem)     &&
      (fRoute    === 'ALL' || r.routeId      === fRoute)    &&
      (fStatus   === 'ALL' || r.status       === fStatus)   &&
      (fCustomer === 'ALL' || r.customerName === fCustomer) &&
      (!q || Object.values(r).some(v => typeof v === 'string' && v.toLowerCase().includes(q)))
    );
  }, [allRows, fPO, fSO, fWO, fItem, fRoute, fStatus, fCustomer, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [fPO, fSO, fWO, fItem, fRoute, fStatus, fCustomer, search]);

  // ── Excel export ───────────────────────────────────────────────────────────

  const exportExcel = () => {
    const headers = ['S.No', 'SO No', 'PO No', 'Work Order No', 'RM Code',
      'Item Code', 'Item Name', 'Route Id', 'Required Qty',
      'Produced Qty', 'Current Process', 'Next Process', 'Due Date', 'Status'];
    const data = filtered.map((r, i) => [
      i + 1, r.soNo, r.poNo, r.workOrderNo, r.rmCode,
      r.itemCode, r.itemName, r.routeId, r.requiredQty,
      r.producedQty, r.currentProcess, r.nextProcess, r.dueDate, r.status,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Work Order Status');
    XLSX.writeFile(wb, 'WorkOrderStatus.xlsx');
  };

  // ── Sub-components ─────────────────────────────────────────────────────────

  const FilterSelect = ({ label, value, onChange, options }: {
    label: string; value: string; onChange: (v: string) => void; options: string[];
  }) => (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <SearchableSelect
        value={value}
        onValueChange={onChange}
        options={options}
        className="h-8 text-sm"
      />
    </div>
  );



  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Filter card ─────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <FilterSelect label="PO NO"        value={fPO}       onChange={setFPO}       options={opts.po} />
            <FilterSelect label="SO No"        value={fSO}       onChange={setFSO}       options={opts.so} />
            <FilterSelect label="Work Order NO" value={fWO}      onChange={setFWO}       options={opts.wo} />
            <FilterSelect label="Item Code"    value={fItem}     onChange={setFItem}     options={opts.item} />
            <FilterSelect label="Route Id"     value={fRoute}    onChange={setFRoute}    options={opts.route} />
            <FilterSelect label="Status"       value={fStatus}   onChange={setFStatus}   options={opts.status} />
            <FilterSelect label="Customer Name" value={fCustomer} onChange={setFCustomer} options={opts.customer} />
            <div className="flex items-end gap-2">
              <Button onClick={loadData} disabled={loading}
                className="bg-slate-700 hover:bg-slate-800 text-white flex-1 h-8">
                {loading ? 'Loading…' : 'Filter'}
              </Button>
              <Button
                variant="outline"
                className="h-8 px-3 text-xs border-slate-400 text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                onClick={() => {
                  setFPO('ALL'); setFSO('ALL'); setFWO('ALL');
                  setFItem('ALL'); setFRoute('ALL'); setFStatus('ALL');
                  setFCustomer('ALL'); setSearch('');
                  loadData();
                }}
              >
                Clear All Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Results table ─────────────────────────────────────────────────────── */}
      {loading && !loaded && (
        <div className="text-center text-muted-foreground py-8 text-sm">Loading work orders…</div>
      )}
      {loaded && (
        <Card>
          <CardContent className="pt-4">

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
                <button onClick={exportExcel} title="Export to Excel"
                  className="flex items-center gap-1 px-2 py-1 border border-green-600 text-green-700 rounded text-xs hover:bg-green-50">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-green-700">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8.5 18l-2-3h1.3l1.2 1.9 1.2-1.9H11.5l-2 3 2.1 3H10.3L9 18.9 7.7 21H6.4l2.1-3zm5 0-2-3h1.3l1.2 1.9 1.2-1.9H16.5l-2 3 2.1 3H15.3L14 18.9 12.7 21H11.4l2.1-3z"/>
                  </svg>
                  Excel
                </button>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <span>Search:</span>
                  <Input value={search} onChange={e => setSearch(e.target.value)}
                    className="h-7 w-44 text-xs" />
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-8 text-xs"></TableHead>
                    <TableHead className="w-10 text-xs">S.No</TableHead>
                    <TableHead className="text-xs">SO No</TableHead>
                    <TableHead className="text-xs">PO No</TableHead>
                    <TableHead className="text-xs">Work Order No</TableHead>
                    <TableHead className="text-xs">RM Code</TableHead>
                    <TableHead className="text-xs">Item Code</TableHead>
                    <TableHead className="text-xs">Item Name</TableHead>
                    <TableHead className="text-xs">Route Id</TableHead>
                    <TableHead className="text-xs">Req Qty</TableHead>
                    <TableHead className="text-xs">Produced Qty</TableHead>
                    <TableHead className="text-xs">Current Process</TableHead>
                    <TableHead className="text-xs">Next Process</TableHead>
                    <TableHead className="text-xs">Due Date</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center text-muted-foreground py-8">
                        {allRows.length === 0 ? 'Click Load to fetch data' : 'No records match the filters'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map((r, i) => (
                      <Fragment key={r.woKey}>
                        <TableRow
                          className="text-sm cursor-pointer hover:bg-muted/30"
                          onClick={() => toggleExpand(r)}>
                          {/* Expand chevron */}
                          <TableCell className="text-xs text-muted-foreground">
                            {expandedKey === r.woKey
                              ? <ChevronDown className="h-4 w-4" />
                              : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="text-xs">{(page - 1) * pageSize + i + 1}</TableCell>
                          <TableCell className="text-xs font-medium text-primary">{r.soNo}</TableCell>
                          <TableCell className="text-xs">{r.poNo}</TableCell>
                          <TableCell className="text-xs font-medium">{r.workOrderNo}</TableCell>
                          <TableCell className="text-xs">{r.rmCode || '—'}</TableCell>
                          <TableCell className="text-xs font-medium text-primary">{r.itemCode}</TableCell>
                          <TableCell className="text-xs max-w-[140px] truncate">{r.itemName}</TableCell>
                          <TableCell className="text-xs">{r.routeId || '—'}</TableCell>
                          <TableCell className="text-xs text-right">{r.requiredQty}</TableCell>
                          <TableCell className="text-xs text-right">{r.producedQty}</TableCell>
                          <TableCell className="text-xs">
                            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                              {r.currentProcess}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                              {r.nextProcess}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">{r.dueDate}</TableCell>
                          <TableCell className="text-xs">
                            <StatusBadge
                              status={r.status}
                              tone={
                                r.status === 'Completed'   ? 'green' :
                                r.status === 'In Progress' ? 'blue'  :
                                                              'slate'
                              }
                            />
                          </TableCell>
                        </TableRow>

                        {/* Expandable process tracking panel */}
                        {expandedKey === r.woKey && (
                          <TableRow>
                            <TableCell colSpan={15} className="p-0">
                              <ProcessTrackingPanel
                                row={r}
                                trackingEdit={trackingEdit}
                                savingTracking={savingTracking}
                                saveTracking={saveTracking}
                                updateAssignee={updateAssignee}
                                updateRemarks={updateRemarks}
                                completeProcess={completeProcess}
                                startProcess={startProcess}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {filtered.length > 0 && (
              <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                <span>
                  Showing {Math.min((page - 1) * pageSize + 1, filtered.length)}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} entries
                </span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                    disabled={page === 1} onClick={() => setPage(1)}>«</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                    disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</Button>
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
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                    disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                    disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</Button>
                </div>
              </div>
            )}

          </CardContent>
        </Card>
      )}
    </div>
  );
}
