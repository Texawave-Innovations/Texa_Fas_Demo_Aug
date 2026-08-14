import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, ChevronRight, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import { toast } from '@/hooks/use-toast';
import { database, storage, storageRef, uploadBytes, getDownloadURL } from '@/services/firebase';
import { ref, set, get, push, update } from 'firebase/database';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

// ── Types ──────────────────────────────────────────────────────────────────────

interface CustomerRecord { customerCode: string; customerName: string; }
interface FGItemRecord { fgItemCode: string; fgDescription: string; uom: string; fgRmCode: string; }

interface LineItem {
  serialNo: string;
  fgItem: string; fgDescription: string; uom: string;
  poQty: string; unitPrice: string; dueDate: string;
  rmCode: string; referenceNo: string;
  lineStatus?: 'pending' | 'approved' | 'rejected';
  cancelRemark?: string;
}

interface SalesOrderRecord {
  soNumber: string; poNumber: string; poDate: string;
  customerId: string; customerName: string;
  poUploadUrl: string; poFileName: string;
  lineItems: LineItem[];
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  cancelRemark?: string;
}

const emptyLine: LineItem = {
  serialNo: '',
  fgItem: '', fgDescription: '', uom: '',
  poQty: '', unitPrice: '',
  dueDate: new Date().toISOString().split('T')[0],
  rmCode: '', referenceNo: '',
};

type Tab  = 'creation' | 'approval';
type View = 'summary' | 'form';

const STATUS_TONE: Record<string, 'amber' | 'green' | 'red'> = {
  pending:  'amber',
  approved: 'green',
  rejected: 'red',
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function SalesOrder() {
  const [activeTab, setActiveTab] = useState<Tab>('creation');
  const [view, setView]           = useState<View>('summary');

  // Master data
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [fgItems,   setFgItems]   = useState<FGItemRecord[]>([]);
  const [rmCodes,   setRmCodes]   = useState<string[]>([]);

  // Saved SOs
  const [salesOrders, setSalesOrders] = useState<Record<string, SalesOrderRecord>>({});

  // ── Creation header state ──
  const [poNumber,    setPoNumber]    = useState('');
  const [customerId,  setCustomerId]  = useState('');
  const [customerName,setCustomerName]= useState('');
  const [soNumber,    setSoNumber]    = useState('');
  const [poFileName,  setPoFileName]  = useState('');
  const [poUploadUrl, setPoUploadUrl] = useState('');
  const [uploading,   setUploading]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Creation line-item state ──
  const [line,      setLine]      = useState<LineItem>(emptyLine);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // ── Approval state ──
  const [appSOKey,     setAppSOKey]   = useState('');
  const [appDueDate,   setAppDueDate] = useState('');
  const [approvalRows, setApprovalRows] = useState<(LineItem & { soNo: string; poNo: string; customerName: string; orderDate: string; soKey: string; lineIdx: number; selected: boolean })[]>([]);

  // ── Reject modal state ──
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [cancelRemark,    setCancelRemark]    = useState('');

  // ── Line item edit state ──
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);

  // ── Header: PO Date ──
  const [poDate, setPoDate] = useState(new Date().toISOString().split('T')[0]);

  const sortedSalesOrders = useMemo(() => {
    return Object.entries(salesOrders).sort((a, b) => {
      const dateA = a[1].createdAt ? new Date(a[1].createdAt).getTime() : 0;
      const dateB = b[1].createdAt ? new Date(b[1].createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [salesOrders]);

  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [matSnap, customersSnap, soSnap] = await Promise.all([
      get(ref(database, 'masters/material')),
      get(ref(database, 'sales/customers')),
      get(ref(database, 'production/salesOrders')),
    ]);
    if (matSnap.exists()) {
      const items = Object.values((matSnap.val().items || {}) as Record<string, any>);
      setFgItems(items.filter((i: any) => i.itemType === 'FG').map((i: any) => ({
        fgItemCode: i.fgItemCode, fgDescription: i.fgDescription,
        uom: i.uom, fgRmCode: i.fgRmCode,
      })));
      setRmCodes(items.filter((i: any) => i.itemType === 'RM').map((i: any) => i.rmCode));
    }
    if (customersSnap.exists()) {
      setCustomers(Object.values(customersSnap.val() as Record<string, any>)
        .filter((c) => c.status !== 'inactive')
        .map((c) => ({
          customerCode: c.customerCode || '',
          customerName: c.companyName || c.customerName || '',
        }))
      );
    }
    if (soSnap.exists()) setSalesOrders(soSnap.val());
  };

  // ── Creation helpers ──────────────────────────────────────────────────────────
  const handleCustomerChange = (code: string) => {
    const c = customers.find((x) => x.customerCode === code);
    setCustomerId(code);
    setCustomerName(c?.customerName ?? '');
  };

  const handleCustomerNameChange = (name: string) => {
    const c = customers.find((x) => x.customerName === name);
    setCustomerName(name);
    setCustomerId(c?.customerCode ?? '');
  };

  const handleFGItemChange = (code: string) => {
    const item = fgItems.find((i) => i.fgItemCode === code);
    setLine((l) => ({
      ...l, fgItem: code,
      fgDescription: item?.fgDescription ?? '',
      uom: item?.uom ?? '',
      rmCode: item?.fgRmCode ?? '',
    }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = storageRef(storage, `so-documents/${Date.now()}_${file.name}`);
      await uploadBytes(path, file);
      const url = await getDownloadURL(path);
      setPoFileName(file.name);
      setPoUploadUrl(url);
      toast({ title: `${file.name} uploaded` });
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const addLineItem = () => {
    if (!line.fgItem || !line.poQty) {
      toast({ title: 'FG Item and PO Qty are required', variant: 'destructive' });
      return;
    }
    if (editingLineIndex !== null) {
      setLineItems((prev) => prev.map((li, i) => i === editingLineIndex ? line : li));
      setEditingLineIndex(null);
    } else {
      setLineItems((prev) => [...prev, line]);
    }
    setLine(emptyLine);
  };

  const startEditLine = (idx: number) => {
    setLine({ ...lineItems[idx] });
    setEditingLineIndex(idx);
  };

  const saveSO = async () => {
    if (!poNumber.trim() || !customerId) {
      toast({ title: 'PO Number and Customer are required', variant: 'destructive' });
      return;
    }
    if (lineItems.length === 0) {
      toast({ title: 'Add at least one line item', variant: 'destructive' });
      return;
    }
    const record: SalesOrderRecord = {
      soNumber, poNumber, poDate, customerId, customerName,
      poUploadUrl, poFileName, lineItems,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    const newRef = push(ref(database, 'production/salesOrders'));
    await set(newRef, record);
    setSalesOrders((prev) => ({ ...prev, [newRef.key!]: record }));
    toast({ title: `SO ${soNumber || poNumber} saved` });
    setPoNumber(''); setPoDate(new Date().toISOString().split('T')[0]);
    setCustomerId(''); setCustomerName('');
    setSoNumber(''); setPoFileName(''); setPoUploadUrl('');
    setLineItems([]);
    setEditingLineIndex(null);
    setView('summary');
  };

  // ── Approval helpers ──────────────────────────────────────────────────────────
  const selectedSO = appSOKey ? salesOrders[appSOKey] : null;

  // Flatten pending SO line items into rows (with per-line lineStatus filtering)
  const buildRows = (orders: Record<string, SalesOrderRecord>, soKey = '', dueDate = '') => {
    const pending = Object.entries(orders).filter(([, so]) => {
      const isPending = !so.status || so.status === 'pending';
      if (!isPending) return false;
      return customers.some((c) => c.customerCode === so.customerId || c.customerName === so.customerName);
    });
    const filtered = soKey ? pending.filter(([k]) => k === soKey) : pending;
    return filtered.flatMap(([key, so]) =>
      (Array.isArray(so.lineItems) ? so.lineItems : Object.values(so.lineItems || {})).map((li: LineItem, lineIdx: number) => ({
        ...li,
        soNo: so.soNumber || so.poNumber,
        poNo: so.poNumber,
        customerName: so.customerName,
        orderDate: new Date(so.createdAt).toLocaleDateString(),
        soKey: key,
        lineIdx,
        selected: false,
        createdAt: so.createdAt || '',
      }))
      .filter((r) => !r.lineStatus || r.lineStatus === 'pending') // show only pending items
    ).filter((r) => !dueDate || r.dueDate === dueDate)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  const handleSOSelect = (key: string) => {
    setAppSOKey(key);
    setApprovalRows(buildRows(salesOrders, key, appDueDate));
  };

  const handleLoad = () => {
    setApprovalRows(buildRows(salesOrders, appSOKey, appDueDate));
  };

  const handleClearAllFilters = () => {
    setAppSOKey('');
    setAppDueDate('');
    setApprovalRows(buildRows(salesOrders));
  };

  const toggleRow = (idx: number) =>
    setApprovalRows((rows) => rows.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));

  const toggleAll = (checked: boolean) =>
    setApprovalRows((rows) => rows.map((r) => ({ ...r, selected: checked })));

  // ── Approval decision helpers ─────────────────────────────────────────────────
  const applyDecision = (decision: 'approved' | 'rejected') => {
    const hasSelection = approvalRows.some((r) => r.selected);
    if (!hasSelection) {
      toast({ title: 'Select at least one row', variant: 'destructive' });
      return;
    }
    if (decision === 'rejected') {
      setShowRejectModal(true);
      return;
    }
    performDecision('approved', '');
  };

  const confirmReject = () => {
    if (!cancelRemark.trim()) {
      toast({ title: 'Please enter a cancel remark before rejecting', variant: 'destructive' });
      return;
    }
    performDecision('rejected', cancelRemark.trim());
    setShowRejectModal(false);
    setCancelRemark('');
  };

  const performDecision = async (decision: 'approved' | 'rejected', remark: string) => {
    // Group selected rows by SO key with their line indices
    const byKey: Record<string, Set<number>> = {};
    approvalRows.filter((r) => r.selected).forEach((row) => {
      if (!byKey[row.soKey]) byKey[row.soKey] = new Set();
      byKey[row.soKey].add(row.lineIdx);
    });

    const updatedOrders = { ...salesOrders };

    await Promise.all(Object.entries(byKey).map(async ([soKey, lineIndices]) => {
      const so = updatedOrders[soKey];
      const lineItems = Array.isArray(so.lineItems) ? [...so.lineItems] : Object.values(so.lineItems || {}) as LineItem[];
      const updatedItems = lineItems.map((li, idx) =>
        lineIndices.has(idx)
          ? { ...li, lineStatus: decision, cancelRemark: remark }
          : li
      ) as LineItem[];

      // Recompute SO-level status from all line items after this update
      const allApproved = updatedItems.every((li) => li.lineStatus === 'approved');
      const allRejected = updatedItems.every((li) => li.lineStatus === 'rejected');
      const soStatus: SalesOrderRecord['status'] = allApproved ? 'approved' : allRejected ? 'rejected' : 'pending';

      await update(ref(database, `production/salesOrders/${soKey}`), {
        lineItems: updatedItems,
        status: soStatus,
        ...(decision === 'rejected' ? { cancelRemark: remark } : {}),
      });

      updatedOrders[soKey] = { ...so, lineItems: updatedItems, status: soStatus };
    }));

    setSalesOrders(updatedOrders);
    const count = Object.values(byKey).reduce((s, set) => s + set.size, 0);
    toast({ title: `${count} line item(s) ${decision}` });
    setApprovalRows(buildRows(updatedOrders, appSOKey, appDueDate));
  };

  // ── Tabs ──────────────────────────────────────────────────────────────────────
  const tabs: { key: Tab; label: string }[] = [
    { key: 'creation', label: 'Sales Order Creation' },
    { key: 'approval', label: 'Sales Order Approval' },
  ];

  const pendingSOs = Object.entries(salesOrders).filter(([, so]) => !so.status || so.status === 'pending');

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Sub-nav */}
      <div className="flex gap-2 border-b border-border">
        {tabs.map((tab) => (
          <button key={tab.key}
            onClick={async () => {
              setActiveTab(tab.key);
              setView('summary');
              const soSnap = await get(ref(database, 'production/salesOrders'));
              const orders = soSnap.exists() ? soSnap.val() : {};
              setSalesOrders(orders);
              if (tab.key === 'approval') {
                setAppSOKey(''); setAppDueDate('');
                setApprovalRows(buildRows(orders));
              }
            }}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >{tab.label}</button>
        ))}
      </div>

      {/* ══ CREATION TAB ══════════════════════════════════════════════════════════ */}
      {activeTab === 'creation' && (
        <div className="space-y-4">
          {/* breadcrumb — only in form view */}
          {view === 'form' && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span className="hover:text-foreground cursor-pointer" onClick={() => setView('summary')}>SO Summary</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-primary font-medium">SO Creation</span>
            </div>
          )}

          {/* Summary list */}
          {view === 'summary' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">SO Summary</h2>
                <Button onClick={() => setView('form')} className="bg-primary">
                  <Plus className="h-4 w-4 mr-1" /> New SO
                </Button>
              </div>
              <Card>
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SO Number</TableHead>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedSalesOrders.map(([id, so]) => (
                        <TableRow key={id}>
                          <TableCell className="font-medium text-primary">{so.soNumber}</TableCell>
                          <TableCell>{so.poNumber}</TableCell>
                          <TableCell>{so.customerName}</TableCell>
                          <TableCell>{so.lineItems?.length ?? 0}</TableCell>
                          <TableCell>{new Date(so.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <StatusBadge status={so.status ?? 'pending'} tone={STATUS_TONE[so.status ?? 'pending']} className="capitalize" />
                          </TableCell>
                        </TableRow>
                      ))}
                      {Object.keys(salesOrders).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No sales orders yet
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Creation form */}
          {view === 'form' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">SO Creation</h2>

              {/* Header card */}
              <Card>
                <CardContent className="pt-5">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                    {/* Customer Name — first field (highest priority) */}
                    <div className="space-y-1">
                      <Label>Customer Name <span className="text-red-500">*</span></Label>
                      <SearchableSelect
                        value={customerName}
                        onValueChange={handleCustomerNameChange}
                        options={customers.map((c) => c.customerName)}
                        placeholder="-- SELECT --"
                      />
                    </div>
                    {/* Customer ID — auto-filled from name */}
                    <div className="space-y-1">
                      <Label>Customer Id</Label>
                      <Input readOnly value={customerId} className="bg-muted" placeholder="Auto-filled" />
                    </div>
                    <div className="space-y-1">
                      <Label>PO Number <span className="text-red-500">*</span></Label>
                      <Input placeholder="Enter PO number" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>PO Date</Label>
                      <Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>SO Number</Label>
                      <Input placeholder="Enter SO number" value={soNumber} onChange={(e) => setSoNumber(e.target.value)} />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label>PO Upload</Label>
                      <div className="flex gap-2">
                        <Input readOnly value={poFileName} placeholder="No file chosen"
                          className="flex-1 cursor-pointer" onClick={() => fileRef.current?.click()} />
                        <Button variant="outline" className="border-primary text-primary"
                          disabled={uploading} onClick={() => fileRef.current?.click()}>
                          {uploading ? 'Uploading…' : 'Browse'}
                        </Button>
                        <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
                      </div>
                      {poUploadUrl && (
                        <a href={poUploadUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                          View uploaded file
                        </a>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Line item card */}
              <Card>
                <CardContent className="pt-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                    {/* Serial Number — first field */}
                    <div className="space-y-1">
                      <Label>Serial Number</Label>
                      <Input placeholder="Enter serial number" value={line.serialNo}
                        onChange={(e) => setLine({ ...line, serialNo: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>FG Item <span className="text-red-500">*</span></Label>
                      <SearchableSelect
                        value={line.fgItem}
                        onValueChange={handleFGItemChange}
                        options={fgItems.map((i) => i.fgItemCode)}
                        placeholder="-- SELECT --"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>FG Item Description</Label>
                      <Input readOnly value={line.fgDescription} className="bg-muted" placeholder="Auto-filled" />
                    </div>
                    <div className="space-y-1">
                      <Label>UOM</Label>
                      <Input readOnly value={line.uom} className="bg-muted" placeholder="Auto-filled" />
                    </div>
                    <div className="space-y-1">
                      <Label>PO Qty <span className="text-red-500">*</span></Label>
                      <Input type="number" value={line.poQty} placeholder="0.000"
                        onChange={(e) => setLine({ ...line, poQty: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Unit Price</Label>
                      <Input type="number" value={line.unitPrice} placeholder="0.000"
                        onChange={(e) => setLine({ ...line, unitPrice: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Due Date</Label>
                      <Input type="date" value={line.dueDate}
                        onChange={(e) => setLine({ ...line, dueDate: e.target.value })} />
                    </div>
                    {/* RM Code — read-only, auto-filled from FG Item */}
                    <div className="space-y-1">
                      <Label>RM Code</Label>
                      <Input readOnly value={line.rmCode} className="bg-muted" placeholder="Auto-filled from FG Item" />
                    </div>
                    <div className="space-y-1">
                      <Label>Comment</Label>
                      <Input placeholder="Enter comment" value={line.referenceNo}
                        onChange={(e) => setLine({ ...line, referenceNo: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button onClick={addLineItem} className="bg-green-600 hover:bg-green-700 text-white">
                      <Plus className="h-4 w-4 mr-1" /> {editingLineIndex !== null ? 'UPDATE' : 'ADD'}
                    </Button>
                    <Button onClick={() => { setLine(emptyLine); setEditingLineIndex(null); }} className="bg-yellow-500 hover:bg-yellow-600 text-white">
                      CLEAR
                    </Button>
                  </div>

                  {lineItems.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Serial No</TableHead>
                          <TableHead>FG Item</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>UOM</TableHead>
                          <TableHead>PO Qty</TableHead>
                          <TableHead>Unit Price</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>RM Code</TableHead>
                          <TableHead>Comment</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lineItems.map((item, idx) => (
                          <TableRow key={idx} className={editingLineIndex === idx ? 'bg-blue-50' : ''}>
                            <TableCell>{idx + 1}</TableCell>
                            <TableCell>{item.serialNo}</TableCell>
                            <TableCell className="font-medium">{item.fgItem}</TableCell>
                            <TableCell>{item.fgDescription}</TableCell>
                            <TableCell>{item.uom}</TableCell>
                            <TableCell>{item.poQty}</TableCell>
                            <TableCell>{item.unitPrice}</TableCell>
                            <TableCell>{item.dueDate}</TableCell>
                            <TableCell>{item.rmCode}</TableCell>
                            <TableCell>{item.referenceNo}</TableCell>
                            <TableCell>
                              <button onClick={() => startEditLine(idx)}
                                className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <div className="flex gap-3">
                <Button onClick={saveSO} className="bg-primary px-8">Save SO</Button>
                <Button variant="outline" onClick={() => setView('summary')}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ APPROVAL TAB ══════════════════════════════════════════════════════════ */}
      {activeTab === 'approval' && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">SO Approval</h2>

          {/* Filter card */}
          <Card>
            <CardContent className="pt-5">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-4 items-end">
                <div className="space-y-1">
                  <Label>SO No</Label>
                  <SearchableSelect
                    value={appSOKey}
                    onValueChange={handleSOSelect}
                    options={pendingSOs.map(([key, so]) => ({
                      value: key,
                      label: so.soNumber || so.poNumber,
                    }))}
                    placeholder="-- SELECT --"
                  />
                </div>
                <div className="space-y-1">
                  <Label>PO No</Label>
                  <Input readOnly value={selectedSO?.poNumber ?? ''} className="bg-muted" placeholder="Auto-filled" />
                </div>
                <div className="space-y-1">
                  <Label>Customer Name</Label>
                  <Input readOnly value={selectedSO?.customerName ?? ''} className="bg-muted" placeholder="Auto-filled" />
                </div>
                <div className="space-y-1">
                  <Label>Due Date</Label>
                  <Input type="date" value={appDueDate} onChange={(e) => setAppDueDate(e.target.value)} />
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <Button onClick={handleLoad} className="bg-primary px-8">
                  Filter
                </Button>
                <Button onClick={handleClearAllFilters} variant="outline" className="px-6 border-slate-400 text-slate-700 hover:bg-slate-50">
                  Clear All Filters
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* SO Pending Details */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                SO Pending Details
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={approvalRows.length > 0 && approvalRows.every((r) => r.selected)}
                        onCheckedChange={(v) => toggleAll(!!v)}
                      />
                    </TableHead>
                    <TableHead>S.No</TableHead>
                    <TableHead>SO No</TableHead>
                    <TableHead>PO No</TableHead>
                    <TableHead>Cus Name</TableHead>
                    <TableHead>FG Item Code</TableHead>
                    <TableHead>FG Item Name</TableHead>
                    <TableHead>PO Qty</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Due Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvalRows.map((row, idx) => (
                    <TableRow key={idx} className={row.selected ? 'bg-blue-50' : ''}>
                      <TableCell>
                        <Checkbox checked={row.selected} onCheckedChange={() => toggleRow(idx)} />
                      </TableCell>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell className="font-medium text-primary">{row.soNo}</TableCell>
                      <TableCell>{row.poNo}</TableCell>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell>{row.fgItem}</TableCell>
                      <TableCell>{row.fgDescription}</TableCell>
                      <TableCell>{row.poQty}</TableCell>
                      <TableCell>{row.unitPrice}</TableCell>
                      <TableCell>{row.orderDate}</TableCell>
                      <TableCell>{row.dueDate}</TableCell>
                    </TableRow>
                  ))}
                  {approvalRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                        No pending SO line items found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Approve / Reject */}
          {approvalRows.length > 0 && (
            <div className="flex gap-3">
              <Button onClick={() => applyDecision('rejected')}
                className="bg-red-500 hover:bg-red-600 text-white px-6">
                Reject
              </Button>
              <Button onClick={() => applyDecision('approved')}
                className="bg-green-600 hover:bg-green-700 text-white px-6">
                Approve
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Cancel Remark Modal ───────────────────────────────────────────────── */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 w-full max-w-md shadow-xl space-y-4">
            <h3 className="text-lg font-semibold">Rejection Remark Required</h3>
            <p className="text-sm text-muted-foreground">
              Please provide a mandatory reason for rejecting the selected line item(s).
            </p>
            <textarea
              className="w-full h-24 border border-border rounded-md p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter cancel remark..."
              value={cancelRemark}
              onChange={(e) => setCancelRemark(e.target.value)}
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => { setShowRejectModal(false); setCancelRemark(''); }}>Cancel</Button>
              <Button onClick={confirmReject} className="bg-red-500 hover:bg-red-600 text-white">Confirm Reject</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
