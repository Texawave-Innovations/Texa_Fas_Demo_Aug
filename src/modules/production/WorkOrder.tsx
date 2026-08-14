import { useState, useEffect, useMemo } from 'react';
import { CheckSquare, Pencil, FileText, Play } from 'lucide-react';
import { generateWorkOrderPDF } from './generateWorkOrderPDF';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { database } from '@/services/firebase';
import { ref, get, push, set, update } from 'firebase/database';
import { useAuth } from '@/context/AuthContext';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SORecord {
  soNumber: string;
  poNumber: string;
  customerId: string;
  customerName: string;
  status: string;
  lineItems: {
    fgItem: string;
    fgDescription: string;
    uom: string;
    poQty: string;
    dueDate: string;
  }[];
}

interface FGItemRecord {
  fgItemCode: string;
  fgDescription: string;
  finishSizeL: string;
  finishSizeW: string;
  finishSizeH: string;
  customerGroup: string;
}

interface RMItemRecord {
  rmCode: string;
  rmDescription: string;
  gradeCode: string;
}

interface RouteRecord {
  routeId: string;
  routeName: string;
  processes?: { processCode: string; processName: string }[];
}

interface ProcessTypeRecord {
  processTypeName: string;
}

interface ProcessMasterRecord {
  processId: string;
  processName: string;
  processType: string;
}

interface ItemRouteRecord {
  itemCode: string;
  routeCode: string;
  routeType: string;
}

interface RouteSeqRow {
  processType: string;
  processName: string;
  productionMethod: string;
  location: string;
  processDueDate: string;
}

export interface TrackingProcess {
  processName: string;
  processType: string;
  assignee: string;
  status: 'pending' | 'in_progress' | 'completed';
  startedAt: string;
  completedAt: string;
  remarks: string;
}

export interface WOTracking {
  status: 'in_progress' | 'completed';
  startedAt: string;
  completedAt: string;
  processes: Record<string, TrackingProcess> | TrackingProcess[];
}

const PRODUCTION_METHODS = ['In-House Within Location', 'In-House Different Location', 'Outsourced'];
const emptyRouteSeqHeader = { routeId: '', routeName: '', routeType: '' };

interface WorkOrderRecord {
  workOrderType: string;
  poNo: string;
  soNo: string;
  workOrderNo: string;
  createDate: string;
  dueDate: string;
  customerId: string;
  customerName: string;
  customerGroup: string;
  fgItem: string;
  fgDescription: string;
  finishingSize: string;
  poQty: string;
  requiredQty: string;
  createdAt: string;
  createdBy?: string;
}

const emptyForm = {
  workOrderType: '',
  poNo: '',
  soNo: '',
  workOrderNo: '',
  createDate: new Date().toISOString().split('T')[0],
  dueDate: '',
  customerId: '',
  customerName: '',
  customerGroup: '',
  fgItem: '',
  fgDescription: '',
  finishingSize: '',
  poQty: '0.00',
  requiredQty: '',
};

const emptyDetail = {
  warehouse: '',
  rmGrade: '',
  materialCode: '',
  sizeL: '',
  sizeW: '',
  sizeH: '',
  rmCode: '',
  stockInHand: '0.000',
  dieNoL: '',
  dieNoW: '',
  dieNoH: '',
  requiredQty: '',
  tubeQty: '',
  totalWeight: '',
  toolSize: '',
};

const WORK_ORDER_TYPES = ['Production', 'ReProcess', 'Scheduling'];

// ── Component ──────────────────────────────────────────────────────────────────

export default function WorkOrder() {
  const [approvedSOs,    setApprovedSOs]    = useState<Record<string, SORecord>>({});
  const [fgItemMap,      setFgItemMap]      = useState<Record<string, FGItemRecord>>({});
  const [workOrders,     setWorkOrders]     = useState<Record<string, WorkOrderRecord>>({});
  const [rmItems,        setRmItems]        = useState<RMItemRecord[]>([]);
  const [warehouses,     setWarehouses]     = useState<string[]>([]);
  const [form,           setForm]           = useState(emptyForm);
  const [showDetailForm, setShowDetailForm] = useState(false);
  const [detailForm,     setDetailForm]     = useState(emptyDetail);
  const [lastWoKey,      setLastWoKey]      = useState('');
  const [editingKey,     setEditingKey]     = useState<string | null>(null);
  const [soLookup,       setSoLookup]       = useState<Record<string, string>>({});

  // Route Sequence state
  const [routes,          setRoutes]          = useState<RouteRecord[]>([]);
  const [processTypes,    setProcessTypes]    = useState<ProcessTypeRecord[]>([]);
  const [processMasters,  setProcessMasters]  = useState<ProcessMasterRecord[]>([]);
  const [itemRoutes,      setItemRoutes]      = useState<ItemRouteRecord[]>([]);
  const [showRouteSeq,    setShowRouteSeq]    = useState(false);
  const [routeSeqHeader,  setRouteSeqHeader]  = useState(emptyRouteSeqHeader);
  const [routeSeqRows,    setRouteSeqRows]    = useState<RouteSeqRow[]>([]);
  // Stores the FG item of the work order being processed — survives form reset
  const [woFgItem,        setWoFgItem]        = useState('');
  const [trackingMap,     setTrackingMap]     = useState<Record<string, WOTracking>>({});

  const { user } = useAuth();

  // Filter Active Input States
  const [fWO, setFWO] = useState('ALL');
  const [fPO, setFPO] = useState('ALL');
  const [fItem, setFItem] = useState('ALL');
  const [fStatus, setFStatus] = useState('ALL');
  const [fSO, setFSO] = useState('ALL');
  const [fCustomer, setFCustomer] = useState('ALL');
  const [fDueDate, setFDueDate] = useState('');

  const handleClearAllFilters = () => {
    setFWO('ALL');
    setFPO('ALL');
    setFItem('ALL');
    setFStatus('ALL');
    setFSO('ALL');
    setFCustomer('ALL');
    setFDueDate('');
  };

  const filterOptions = useMemo(() => {
    const wos = Object.values(workOrders);
    return {
      wo: ['ALL', ...Array.from(new Set(wos.map(w => w.workOrderNo).filter(Boolean))).sort()],
      po: ['ALL', ...Array.from(new Set(wos.map(w => w.poNo).filter(Boolean))).sort()],
      item: ['ALL', ...Array.from(new Set(wos.map(w => w.fgItem).filter(Boolean))).sort()],
      status: ['ALL', 'Pending', 'In Progress', 'Completed'],
      so: [
        'ALL',
        ...Array.from(new Set(wos.map(w => w.soNo).filter(Boolean)))
          .map(soKey => ({
            value: soKey,
            label: soLookup[soKey] || soKey,
          }))
          .sort((a, b) => a.label.localeCompare(b.label))
      ],
      customer: ['ALL', ...Array.from(new Set(wos.map(w => w.customerName).filter(Boolean))).sort()],
    };
  }, [workOrders, soLookup]);

  const sortedAndFilteredWorkOrders = useMemo(() => {
    const getStatus = (id: string) => {
      const trk = trackingMap[id];
      if (!trk) return 'Pending';
      return trk.status === 'completed' ? 'Completed' : 'In Progress';
    };

    return Object.entries(workOrders)
      .filter(([id, wo]) => {
        const matchWO = fWO === 'ALL' || wo.workOrderNo === fWO;
        const matchPO = fPO === 'ALL' || wo.poNo === fPO;
        const matchItem = fItem === 'ALL' || wo.fgItem === fItem;
        const matchStatus = fStatus === 'ALL' || getStatus(id) === fStatus;
        const matchSO = fSO === 'ALL' || wo.soNo === fSO;
        const matchCustomer = fCustomer === 'ALL' || wo.customerName === fCustomer;

        let matchDueDate = true;
        if (fDueDate) {
          matchDueDate = wo.dueDate === fDueDate;
        }

        return matchWO && matchPO && matchItem && matchStatus && matchSO && matchCustomer && matchDueDate;
      })
      .sort((a, b) => {
        const dateA = a[1].createdAt ? new Date(a[1].createdAt).getTime() : 0;
        const dateB = b[1].createdAt ? new Date(b[1].createdAt).getTime() : 0;
        if (dateA !== dateB) return dateB - dateA;
        return b[1].workOrderNo.localeCompare(a[1].workOrderNo);
      });
  }, [workOrders, trackingMap, fWO, fPO, fItem, fStatus, fSO, fCustomer, fDueDate]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [soSnap, matSnap, woSnap, salesSnap, customersSnap] = await Promise.all([
      get(ref(database, 'production/salesOrders')),
      get(ref(database, 'masters/material')),
      get(ref(database, 'production/workOrders')),
      get(ref(database, 'masters/sales/warehouses')),
      get(ref(database, 'sales/customers')),
    ]);
    // Load route/process masters separately
    const [routeSnap, ptSnap, pmSnap, irSnap] = await Promise.all([
      get(ref(database, 'masters/material/routes')),
      get(ref(database, 'masters/material/processTypes')),
      get(ref(database, 'masters/material/processes')),
      get(ref(database, 'masters/material/itemRoutes')),
    ]);
    if (routeSnap.exists())
      setRoutes(Object.values(routeSnap.val() as Record<string, RouteRecord>));
    if (ptSnap.exists())
      setProcessTypes(Object.values(ptSnap.val() as Record<string, ProcessTypeRecord>));
    if (pmSnap.exists())
      setProcessMasters(Object.values(pmSnap.val() as Record<string, ProcessMasterRecord>));
    if (irSnap.exists())
      setItemRoutes(Object.values(irSnap.val() as Record<string, ItemRouteRecord>));

    if (soSnap.exists() && customersSnap.exists()) {
      const all = soSnap.val() as Record<string, SORecord>;
      const lookup: Record<string, string> = {};
      Object.entries(all).forEach(([k, v]) => {
        lookup[k] = v.soNumber || v.poNumber || k;
      });
      setSoLookup(lookup);

      const activeCustomers = Object.values(customersSnap.val() as Record<string, any>).filter(c => c.status !== 'inactive');
      const approved: Record<string, SORecord> = {};
      Object.entries(all).forEach(([k, v]) => {
        if (v.status === 'approved') {
          const isCustomerActive = activeCustomers.some(c => c.customerCode === v.customerId || c.companyName === v.customerName);
          if (isCustomerActive) {
            approved[k] = v;
          }
        }
      });
      setApprovedSOs(approved);
    }

    if (matSnap.exists()) {
      const itemsRaw = Object.values((matSnap.val().items || {}) as Record<string, any>);

      const fgMap: Record<string, FGItemRecord> = {};
      itemsRaw.filter((i: any) => i.itemType === 'FG').forEach((i: any) => {
        fgMap[i.fgItemCode] = {
          fgItemCode: i.fgItemCode,
          fgDescription: i.fgDescription,
          finishSizeL: i.finishSizeL || '',
          finishSizeW: i.finishSizeW || '',
          finishSizeH: i.finishSizeH || '',
          customerGroup: i.customerGroup || '',
        };
      });
      setFgItemMap(fgMap);

      const rms: RMItemRecord[] = itemsRaw
        .filter((i: any) => i.itemType === 'RM' && i.rmCode)
        .map((i: any) => ({
          rmCode: i.rmCode || '',
          rmDescription: i.rmDescription || '',
          gradeCode: i.gradeCode || '',
        }));
      setRmItems(rms);
    }

    if (woSnap.exists()) {
      const raw = woSnap.val() as Record<string, any>;
      const wos: Record<string, WorkOrderRecord> = {};
      const trk: Record<string, WOTracking> = {};
      Object.entries(raw).forEach(([k, v]) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { tracking, routeSequence, detail, ...rest } = v;
        wos[k] = rest as WorkOrderRecord;
        if (tracking) trk[k] = tracking;
      });
      setWorkOrders(wos);
      setTrackingMap(trk);
    }

    if (salesSnap.exists()) {
      const val = salesSnap.val();
      const raw: any[] = Array.isArray(val)
        ? val
        : Object.values(val as Record<string, any>);
      // Master items may be stored as { status, value } objects — extract the string value
      const list: string[] = raw
        .filter((item) => item && (typeof item === 'string' || item?.status !== 'inactive'))
        .map((item) => (typeof item === 'string' ? item : (item?.value ?? String(item))))
        .filter(Boolean);
      setWarehouses(list);
    }
  };

  // Unique RM grades for dropdown
  const rmGrades = useMemo(() => {
    const seen = new Set<string>();
    return rmItems.filter(i => i.gradeCode && !seen.has(i.gradeCode) && !!seen.add(i.gradeCode));
  }, [rmItems]);

  // Auto-calculate Qty/Tube
  const qtyPerTube = useMemo(() => {
    const rq = parseFloat(detailForm.requiredQty) || 0;
    const tq = parseFloat(detailForm.tubeQty) || 0;
    if (tq === 0) return '0.00';
    return (rq / tq).toFixed(2);
  }, [detailForm.requiredQty, detailForm.tubeQty]);

  // When SO is selected, auto-fill from first line item
  const handleSOChange = (soKey: string) => {
    const so = approvedSOs[soKey];
    if (!so) return;

    const li = Array.isArray(so.lineItems)
      ? so.lineItems[0]
      : Object.values(so.lineItems || {})[0] as any;

    const fg = li ? fgItemMap[li.fgItem] : undefined;
    const finishingSize = fg
      ? [fg.finishSizeL, fg.finishSizeW, fg.finishSizeH].filter(Boolean).join(' x ')
      : '';

    setForm((f) => ({
      ...f,
      soNo: soKey,
      poNo: so.poNumber,
      customerId: so.customerId,
      customerName: so.customerName,
      customerGroup: fg?.customerGroup || '',
      fgItem: li?.fgItem || '',
      fgDescription: li?.fgDescription || '',
      finishingSize,
      dueDate: li?.dueDate || '',
      poQty: li?.poQty || '0.00',
    }));

    // Auto-fill RM Grade in Production Detail from the FG item's mapped RM
    const fgRmCode = (li as any)?.rmCode || '';
    const rmItem = rmItems.find((r) => r.rmCode === fgRmCode);
    const autoGrade = rmItem?.gradeCode || '';
    if (autoGrade) {
      setDetailForm((d) => ({ ...d, rmGrade: autoGrade, rmCode: fgRmCode }));
    }
  };

  const handleRmGradeChange = (grade: string) => {
    const found = rmItems.find(i => i.gradeCode === grade);
    setDetailForm(d => ({ ...d, rmGrade: grade, rmCode: found?.rmCode || '' }));
  };

  const handleWorkOrderInput = async () => {
    if (!form.workOrderType || !form.soNo) {
      toast({ title: 'Work Order Type and SO No are required', variant: 'destructive' });
      return;
    }

    // Validate Required Qty vs PO Qty
    const reqQty = parseFloat(form.requiredQty) || 0;
    const poQty  = parseFloat(form.poQty)       || 0;
    if (reqQty > poQty) {
      toast({ title: 'Required Qty cannot be greater than PO Qty', variant: 'destructive' });
      return;
    }

    if (editingKey) {
      // Update existing record
      const record: WorkOrderRecord = {
        ...form,
        createdAt: workOrders[editingKey]?.createdAt ?? new Date().toISOString(),
        createdBy: workOrders[editingKey]?.createdBy ?? user?.name ?? 'System',
      };
      await set(ref(database, `production/workOrders/${editingKey}`), record);
      setWorkOrders((prev) => ({ ...prev, [editingKey]: record }));
      toast({ title: `Work Order ${form.workOrderNo} updated` });
      // Keep editingKey and detail form visible so user can also edit Warehouse / RM Grade / Route Sequence
      setLastWoKey(editingKey);
      setWoFgItem(form.fgItem);
      setShowDetailForm(true);
      return;
    }

    // Create new record
    const count = Object.keys(workOrders).length + 1;
    const now = new Date();
    const woNo = `WO${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(count).padStart(4, '0')}`;

    const record: WorkOrderRecord = {
      ...form,
      workOrderNo: woNo,
      createdAt: new Date().toISOString(),
      createdBy: user?.name || 'System',
    };
    const newRef = push(ref(database, 'production/workOrders'));
    await set(newRef, record);
    setWorkOrders((prev) => ({ ...prev, [newRef.key!]: record }));
    toast({ title: `Work Order ${woNo} created` });
    setLastWoKey(newRef.key!);
    setWoFgItem(form.fgItem);   // capture before form is cleared
    setDetailForm(emptyDetail);
    setShowDetailForm(true);
    setForm(emptyForm);
  };

  // Shared helper — builds process rows for a route and updates header + rows state
  const applyRouteToSeq = (routeId: string, routeType: string) => {
    const route = routes.find(r => r.routeId === routeId);
    const rawProcesses = route?.processes;
    const routeProcesses: { processCode: string; processName: string }[] = rawProcesses
      ? (Array.isArray(rawProcesses) ? rawProcesses : Object.values(rawProcesses))
      : [];

    const rows: RouteSeqRow[] = routeProcesses.map(rp => {
      const pm = processMasters.find(p => p.processId === rp.processCode);
      return {
        processType: pm?.processType || rp.processName,
        processName: rp.processName,
        productionMethod: '',
        location: '',
        processDueDate: '',
      };
    });

    setRouteSeqHeader({ routeId, routeName: route?.routeName || '', routeType });
    setRouteSeqRows(rows);
  };

  const handleRouteSequence = async () => {
    if (!lastWoKey) return;
    await update(ref(database, `production/workOrders/${lastWoKey}`), {
      detail: { ...detailForm, qtyPerTube },
    });

    // Auto-select the Primary route mapped to this FG item
    const primaryIR = itemRoutes.find(ir => ir.itemCode === woFgItem && ir.routeType === 'Primary');

    setShowRouteSeq(true);

    if (primaryIR) {
      applyRouteToSeq(primaryIR.routeCode, primaryIR.routeType);
    } else {
      setRouteSeqHeader(emptyRouteSeqHeader);
      setRouteSeqRows([]);
    }
  };

  const handleRouteIdChange = (routeId: string) => {
    const ir = itemRoutes.find(r => r.routeCode === routeId && r.itemCode === woFgItem);
    applyRouteToSeq(routeId, ir?.routeType || '');
  };

  const updateRouteSeqRow = (idx: number, field: keyof RouteSeqRow, value: string) => {
    setRouteSeqRows(rows => rows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const handleSaveRouteSeq = async () => {
    if (!routeSeqHeader.routeId) {
      toast({ title: 'Please select a Route ID', variant: 'destructive' });
      return;
    }
    await update(ref(database, `production/workOrders/${lastWoKey}`), {
      routeSequence: { header: routeSeqHeader, rows: routeSeqRows },
    });
    toast({ title: 'Route Sequence saved' });
    setShowRouteSeq(false);
  };

  const handlePrintPDF = async (key: string, wo: WorkOrderRecord) => {
    // Load full work order data (detail + routeSequence) from Firebase
    const snap = await get(ref(database, `production/workOrders/${key}`));
    const full = snap.exists() ? snap.val() : {};
    generateWorkOrderPDF({
      ...wo,
      soNo: soLookup[wo.soNo] || wo.soNo || '',
      customerId: wo.customerId || '',
      detail: full.detail,
      routeSequence: full.routeSequence,
    });
  };

  const handleStart = async (key: string, wo: WorkOrderRecord) => {
    const snap = await get(ref(database, `production/workOrders/${key}/routeSequence`));
    if (!snap.exists()) {
      toast({ title: 'No Route Sequence found — add one first', variant: 'destructive' });
      return;
    }
    const rs = snap.val();
    const rawRows = rs?.rows;
    const rows: RouteSeqRow[] = rawRows
      ? (Array.isArray(rawRows) ? rawRows : Object.values(rawRows))
      : [];

    if (rows.length === 0) {
      toast({ title: 'Route Sequence is empty — add processes first', variant: 'destructive' });
      return;
    }

    const processes: TrackingProcess[] = rows.map((r, i) => ({
      processName: r.processName,
      processType: r.processType,
      assignee: '',
      status: i === 0 ? 'in_progress' : 'pending',
      startedAt: i === 0 ? new Date().toISOString() : '',
      completedAt: '',
      remarks: '',
    }));

    const tracking: WOTracking = {
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      completedAt: '',
      processes,
    };

    await set(ref(database, `production/workOrders/${key}/tracking`), tracking);
    setTrackingMap(prev => ({ ...prev, [key]: tracking }));
    toast({ title: `${wo.workOrderNo} started — tracking ${processes.length} processes` });
  };

  const handleEdit = async (key: string, wo: WorkOrderRecord) => {
    setForm({
      workOrderType: wo.workOrderType,
      poNo:          wo.poNo,
      soNo:          wo.soNo,
      workOrderNo:   wo.workOrderNo,
      createDate:    wo.createDate,
      dueDate:       wo.dueDate,
      customerId:    wo.customerId,
      customerName:  wo.customerName,
      customerGroup: wo.customerGroup,
      fgItem:        wo.fgItem,
      fgDescription: wo.fgDescription,
      finishingSize: wo.finishingSize,
      poQty:         wo.poQty,
      requiredQty:   wo.requiredQty,
    });
    setEditingKey(key);
    setLastWoKey(key);
    setWoFgItem(wo.fgItem);
    // Load the saved detail so Warehouse / RM Grade etc. are pre-filled
    const snap = await get(ref(database, `production/workOrders/${key}/detail`));
    if (snap.exists()) {
      setDetailForm({ ...emptyDetail, ...snap.val() });
    } else {
      setDetailForm(emptyDetail);
    }
    setShowDetailForm(true);
    setShowRouteSeq(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCheckStocks = () => {
    if (!form.fgItem) {
      toast({ title: 'Select an SO first', variant: 'destructive' });
      return;
    }
    toast({ title: `Stock check for ${form.fgItem} — coming soon` });
  };

  const readOnly = 'bg-muted text-muted-foreground';

  return (
    <div className="space-y-6">
      {/* ── Main Form Card ──────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6 space-y-5">

          {/* Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
            <div className="space-y-1">
              <Label>Work Order Type <span className="text-red-500">*</span></Label>
              <Select value={form.workOrderType} onValueChange={(v) => setForm({ ...form, workOrderType: v })}>
                <SelectTrigger><SelectValue placeholder="-- SELECT --" /></SelectTrigger>
                <SelectContent>
                  {WORK_ORDER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>SO No <span className="text-red-500">*</span></Label>
              <SearchableSelect
                value={form.soNo}
                onValueChange={handleSOChange}
                options={Object.entries(approvedSOs).map(([key, so]) => ({
                  value: key,
                  label: so.soNumber || so.poNumber,
                }))}
                placeholder="-- SELECT --"
              />
            </div>
            <div className="space-y-1">
              <Label>Work Order No</Label>
              <Input readOnly value={form.workOrderNo} className={readOnly} placeholder="Auto-generated on save" />
            </div>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
            <div className="space-y-1">
              <Label>PO No <span className="text-red-500">*</span></Label>
              <Input readOnly value={form.poNo} className={readOnly} placeholder="Auto-filled from SO" />
            </div>
            <div className="space-y-1">
              <Label>Create Date <span className="text-red-500">*</span></Label>
              <Input type="date" value={form.createDate}
                onChange={(e) => setForm({ ...form, createDate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Due Date</Label>
              <Input readOnly value={form.dueDate} className={readOnly} placeholder="Auto-filled from SO" />
            </div>
          </div>

          {/* Row 3 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
            <div className="space-y-1">
              <Label>Customer ID</Label>
              <Input readOnly value={form.customerId} className={readOnly} placeholder="Auto-filled" />
            </div>
            <div className="space-y-1">
              <Label>Customer Name</Label>
              <Input readOnly value={form.customerName} className={readOnly} placeholder="Auto-filled" />
            </div>
            <div className="space-y-1">
              <Label>Customer Group</Label>
              <Input readOnly value={form.customerGroup} className={readOnly} placeholder="Auto-filled" />
            </div>
          </div>

          {/* Row 4 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
            <div className="space-y-1">
              <Label>FG Item</Label>
              <Input readOnly value={form.fgItem} className={readOnly} placeholder="Auto-filled" />
            </div>
            <div className="space-y-1">
              <Label>FG Item Description</Label>
              <Input readOnly value={form.fgDescription} className={readOnly} placeholder="Auto-filled" />
            </div>
            <div className="space-y-1">
              <Label>Finishing Size</Label>
              <Input readOnly value={form.finishingSize} className={readOnly} placeholder="Auto-filled" />
            </div>
          </div>

          {/* Row 5 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
            <div className="space-y-1">
              <Label>PO Qty</Label>
              <Input readOnly value={form.poQty} className={readOnly} />
            </div>
            <div className="space-y-1">
              <Label>Required Qty</Label>
              <Input type="number" placeholder="0.000" value={form.requiredQty}
                onChange={(e) => setForm({ ...form, requiredQty: e.target.value })} />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 justify-end pt-2">
            {editingKey && (
              <Button variant="outline" onClick={() => { setEditingKey(null); setForm(emptyForm); setShowDetailForm(false); setShowRouteSeq(false); }}
                className="px-6">
                Cancel Edit
              </Button>
            )}
            <Button onClick={handleWorkOrderInput} className="bg-slate-700 hover:bg-slate-800 text-white px-6">
              {editingKey ? 'Update Work Order' : 'Work Order Input'}
            </Button>
            <Button onClick={handleCheckStocks}
              className="bg-teal-600 hover:bg-teal-700 text-white px-6 flex items-center gap-2">
              <CheckSquare className="h-4 w-4" /> Check Stocks
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Production Detail Card (appears after WO is created) ────────────── */}
      {showDetailForm && (
        <Card>
          <CardContent className="pt-6 space-y-5">

            {/* Row 1: Warehouse */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
              <div className="space-y-1">
                <Label>Warehouse <span className="text-red-500">*</span></Label>
                <SearchableSelect
                  value={detailForm.warehouse}
                  onValueChange={(v) => setDetailForm(d => ({ ...d, warehouse: v }))}
                  options={warehouses}
                  placeholder="-- SELECT --"
                />
              </div>
            </div>

            {/* Row 2: RM Grade | Material Code | Size */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
              <div className="space-y-1">
                <Label>RM Grade <span className="text-red-500">*</span></Label>
                <SearchableSelect
                  value={detailForm.rmGrade}
                  onValueChange={handleRmGradeChange}
                  options={rmGrades.map(g => g.gradeCode)}
                  placeholder="-- SELECT --"
                />
              </div>
              <div className="space-y-1">
                <Label>Material Code <span className="text-red-500">*</span></Label>
                <SearchableSelect
                  value={detailForm.materialCode}
                  onValueChange={(v) => setDetailForm(d => ({ ...d, materialCode: v }))}
                  options={rmItems.map(i => i.rmCode)}
                  placeholder="---SELECT---"
                />
              </div>
              <div className="space-y-1">
                <Label>Size</Label>
                <div className="flex gap-2">
                  <Input type="number" placeholder="0.00" value={detailForm.sizeL}
                    onChange={(e) => setDetailForm(d => ({ ...d, sizeL: e.target.value }))} />
                  <Input type="number" placeholder="0.00" value={detailForm.sizeW}
                    onChange={(e) => setDetailForm(d => ({ ...d, sizeW: e.target.value }))} />
                  <Input type="number" placeholder="0.00" value={detailForm.sizeH}
                    onChange={(e) => setDetailForm(d => ({ ...d, sizeH: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Row 3: RM Code | Stock In Hand | Die No */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
              <div className="space-y-1">
                <Label>RM Code <span className="text-red-500">*</span></Label>
                <Input readOnly value={detailForm.rmCode} className={readOnly}
                  placeholder="Auto-filled from RM Grade" />
              </div>
              <div className="space-y-1">
                <Label>Stock In Hand</Label>
                <Input readOnly value={detailForm.stockInHand} className={readOnly} />
              </div>
              <div className="space-y-1">
                <Label>Die No</Label>
                <div className="flex gap-2">
                  <Input type="number" placeholder="0.00" value={detailForm.dieNoL}
                    onChange={(e) => setDetailForm(d => ({ ...d, dieNoL: e.target.value }))} />
                  <Input type="number" placeholder="0.00" value={detailForm.dieNoW}
                    onChange={(e) => setDetailForm(d => ({ ...d, dieNoW: e.target.value }))} />
                  <Input type="number" placeholder="0.00" value={detailForm.dieNoH}
                    onChange={(e) => setDetailForm(d => ({ ...d, dieNoH: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Row 4: Required Qty | Tube Qty | Qty/Tube */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
              <div className="space-y-1">
                <Label>Required Qty <span className="text-red-500">*</span></Label>
                <Input type="number" placeholder="0.000" value={detailForm.requiredQty}
                  onChange={(e) => {
                    const val = e.target.value;
                    const maxByPO  = parseFloat(form.poQty)       || Infinity;
                    const maxByWO  = parseFloat(form.requiredQty) || Infinity;
                    const maxAllowed = Math.min(maxByPO, maxByWO);
                    if (parseFloat(val) > maxAllowed) {
                      toast({ title: `Required Qty cannot exceed ${maxAllowed} (WO / PO Qty)`, variant: 'destructive' });
                      return;
                    }
                    setDetailForm(d => ({ ...d, requiredQty: val }));
                  }} />
              </div>
              <div className="space-y-1">
                <Label>Tube Qty <span className="text-red-500">*</span></Label>
                <Input type="number" placeholder="0.000" value={detailForm.tubeQty}
                  onChange={(e) => setDetailForm(d => ({ ...d, tubeQty: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Qty/Tube</Label>
                <Input readOnly value={qtyPerTube} className={readOnly} />
              </div>
            </div>

            {/* Row 5: Total Weight | Tool Size */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
              <div className="space-y-1">
                <Label>Total Weight <span className="text-red-500">*</span></Label>
                <Input type="number" placeholder="0.00" value={detailForm.totalWeight}
                  onChange={(e) => setDetailForm(d => ({ ...d, totalWeight: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Tool Size</Label>
                <Input type="number" placeholder="0.000" value={detailForm.toolSize}
                  onChange={(e) => setDetailForm(d => ({ ...d, toolSize: e.target.value }))} />
              </div>
            </div>

            {/* Route Sequence button */}
            <div className="flex justify-end pt-2">
              <Button onClick={handleRouteSequence}
                className="bg-slate-700 hover:bg-slate-800 text-white px-6">
                Route Sequence
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Route Sequence Section ──────────────────────────────────────────── */}
      {showRouteSeq && (
        <Card>
          <CardContent className="pt-6 space-y-5">

            {/* Header row: Route ID | Route Name | Route Type */}
            {(() => {
              const mappedRouteIds = new Set(
                itemRoutes.filter(ir => ir.itemCode === woFgItem).map(ir => ir.routeCode)
              );
              const filteredRoutes = mappedRouteIds.size > 0
                ? routes.filter(r => mappedRouteIds.has(r.routeId))
                : routes;
              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                  <div className="space-y-1">
                    <Label>Route ID <span className="text-red-500">*</span></Label>
                    <Select value={routeSeqHeader.routeId} onValueChange={handleRouteIdChange}>
                      <SelectTrigger><SelectValue placeholder="-- SELECT --" /></SelectTrigger>
                      <SelectContent>
                        {filteredRoutes.length === 0 && (
                          <SelectItem value="_none" disabled>No routes mapped for this item</SelectItem>
                        )}
                        {filteredRoutes.map(r => (
                          <SelectItem key={r.routeId} value={r.routeId}>{r.routeId}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Route Name</Label>
                    <Input readOnly value={routeSeqHeader.routeName}
                      className="bg-muted text-muted-foreground" placeholder="Auto-filled from Route ID" />
                  </div>
                  <div className="space-y-1">
                    <Label>Route Type</Label>
                    <Input readOnly value={routeSeqHeader.routeType}
                      className="bg-muted text-muted-foreground" placeholder="Auto-filled from Item-Route" />
                  </div>
                </div>
              );
            })()}

            {/* Process table — shown once a Route ID is selected */}
            {routeSeqHeader.routeId && (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/60">
                      <TableHead className="w-12">S.No</TableHead>
                      <TableHead>Process Type</TableHead>
                      <TableHead>Process Name</TableHead>
                      <TableHead>Production Method</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Process Due Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {routeSeqRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                          Select a Route ID to load its processes
                        </TableCell>
                      </TableRow>
                    )}
                    {routeSeqRows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell className="font-medium">{row.processType}</TableCell>

                        {/* Process Name — filtered by process type */}
                        <TableCell>
                          <Select value={row.processName}
                            onValueChange={(v) => updateRouteSeqRow(idx, 'processName', v)}>
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {processMasters.filter(p => p.processType === row.processType).map(p => (
                                <SelectItem key={p.processId} value={p.processName}>{p.processName}</SelectItem>
                              ))}
                              {processMasters.filter(p => p.processType === row.processType).length === 0 && (
                                <SelectItem value="_none" disabled>No processes for this type</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </TableCell>

                        {/* Production Method */}
                        <TableCell>
                          <Select value={row.productionMethod}
                            onValueChange={(v) => updateRouteSeqRow(idx, 'productionMethod', v)}>
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {PRODUCTION_METHODS.map(m => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>

                        {/* Location */}
                        <TableCell>
                          <Input className="h-8 text-sm" placeholder="Enter location"
                            value={row.location}
                            onChange={(e) => updateRouteSeqRow(idx, 'location', e.target.value)} />
                        </TableCell>

                        {/* Process Due Date */}
                        <TableCell>
                          <Input type="date" className="h-8 text-sm"
                            value={row.processDueDate}
                            onChange={(e) => updateRouteSeqRow(idx, 'processDueDate', e.target.value)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Save / Clear / Cancel */}
            <div className="flex gap-3 justify-end pt-2">
              <Button onClick={handleSaveRouteSeq}
                className="bg-green-600 hover:bg-green-700 text-white px-6">Save</Button>
              <Button onClick={() => {
                  setRouteSeqHeader(emptyRouteSeqHeader);
                  setRouteSeqRows([]);
                }}
                className="bg-yellow-500 hover:bg-yellow-600 text-white px-6">Clear</Button>
              <Button onClick={() => { setShowRouteSeq(false); setRouteSeqHeader(emptyRouteSeqHeader); setRouteSeqRows([]); }}
                className="bg-red-500 hover:bg-red-600 text-white px-6">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Filter Card ─────────────────────────────────────────────────────── */}
      {Object.keys(workOrders).length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Work Order NO</Label>
                <SearchableSelect value={fWO} onValueChange={setFWO} options={filterOptions.wo} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">PO NO</Label>
                <SearchableSelect value={fPO} onValueChange={setFPO} options={filterOptions.po} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">FG Item</Label>
                <SearchableSelect value={fItem} onValueChange={setFItem} options={filterOptions.item} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Status</Label>
                <SearchableSelect value={fStatus} onValueChange={setFStatus} options={filterOptions.status} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">SO No</Label>
                <SearchableSelect value={fSO} onValueChange={setFSO} options={filterOptions.so} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Customer</Label>
                <SearchableSelect value={fCustomer} onValueChange={setFCustomer} options={filterOptions.customer} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Due Date</Label>
                <Input type="date" value={fDueDate} onChange={(e) => setFDueDate(e.target.value)} className="h-9" />
              </div>
              <div className="flex items-end">
                <Button variant="outline" className="h-9 w-full px-3 text-xs border-slate-400 text-slate-700 hover:bg-slate-50 whitespace-nowrap" onClick={handleClearAllFilters}>
                  Clear All Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Work Orders Table ────────────────────────────────────────────────── */}
      {sortedAndFilteredWorkOrders.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Work Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>WO No</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>SO No</TableHead>
                  <TableHead>PO No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>FG Item</TableHead>
                  <TableHead>PO Qty</TableHead>
                  <TableHead>Req Qty</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>PDF</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAndFilteredWorkOrders.map(([id, wo]) => (
                  <TableRow key={id} className={editingKey === id ? 'bg-amber-50' : ''}>
                    <TableCell className="font-medium text-primary">{wo.workOrderNo}</TableCell>
                    <TableCell>{wo.workOrderType}</TableCell>
                    <TableCell>{soLookup[wo.soNo] || wo.soNo}</TableCell>
                    <TableCell>{wo.poNo}</TableCell>
                    <TableCell>{wo.customerName}</TableCell>
                    <TableCell>{wo.fgItem}</TableCell>
                    <TableCell>{wo.poQty}</TableCell>
                    <TableCell>{wo.requiredQty}</TableCell>
                    <TableCell>{wo.dueDate}</TableCell>
                    <TableCell>
                      {(() => {
                        const trk = trackingMap[id];
                        if (!trk) {
                          return (
                            <Button size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs px-3 gap-1"
                              onClick={() => handleStart(id, wo)}>
                              <Play className="h-3 w-3 fill-white" /> Start
                            </Button>
                          );
                        }
                        if (trk.status === 'completed') {
                          return (
                            <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                              Completed
                            </span>
                          );
                        }
                        return (
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                            In Progress
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost"
                        className="text-red-600 hover:text-red-800 hover:bg-red-50 h-8 w-8 p-0"
                        onClick={() => handlePrintPDF(id, wo)}
                        title="Download Process Card PDF">
                        <FileText className="h-4 w-4" />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost"
                        className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 h-8 w-8 p-0"
                        onClick={() => handleEdit(id, wo)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : Object.keys(workOrders).length > 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No work orders match the filters
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
