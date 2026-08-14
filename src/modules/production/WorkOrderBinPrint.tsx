import { useState, useEffect, useMemo } from 'react';
import { database } from '@/services/firebase';
import { ref, get, push, set } from 'firebase/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

// ── Types ──────────────────────────────────────────────────────────────────────

interface WorkOrderRecord {
  workOrderNo: string;
  poNo: string;
  soNo: string;          // Firebase key stored in DB
  soNoDisplay: string;   // resolved human-readable SO number
  customerName: string;
  fgItem: string;
  fgDescription: string;
  requiredQty: string | number;
  dueDate: string;
}

interface BinPrintRecord {
  poNo: string;
  soNo: string;
  workOrderNo: string;
  totalBin: string;
  totalPrint: string;
  printerName: string;
  createdAt: string;
}


// ── Component ──────────────────────────────────────────────────────────────────

export default function WorkOrderBinPrint() {
  const [workOrders,  setWorkOrders]  = useState<Record<string, WorkOrderRecord>>({});
  const [binRecords,  setBinRecords]  = useState<Record<string, BinPrintRecord>>({});
  const [saving,      setSaving]      = useState(false);

  // Form state
  const [selectedPO,  setSelectedPO]  = useState('ALL');
  const [selectedSO,  setSelectedSO]  = useState('ALL');
  const [selectedWO,  setSelectedWO]  = useState('ALL');
  const [totalBin,    setTotalBin]    = useState('');
  const [totalPrint,  setTotalPrint]  = useState('');
  const [editingKey,  setEditingKey]  = useState<string | null>(null);

  // Table state
  const [search,    setSearch]    = useState('');
  const [pageSize,  setPageSize]  = useState(10);
  const [page,      setPage]      = useState(1);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [woSnap, binSnap, soSnap] = await Promise.all([
      get(ref(database, 'production/workOrders')),
      get(ref(database, 'production/workOrderBinPrint')),
      get(ref(database, 'production/salesOrders')),
    ]);

    // Build SO key → readable number lookup
    const soLookup: Record<string, string> = {};
    if (soSnap.exists()) {
      const soRaw = soSnap.val() as Record<string, any>;
      Object.entries(soRaw).forEach(([k, so]) => {
        soLookup[k] = so.soNumber || so.poNumber || k;
      });
    }

    if (woSnap.exists()) {
      const raw = woSnap.val() as Record<string, any>;
      // Inject resolved soNoDisplay into each WO record
      const resolved: Record<string, WorkOrderRecord> = {};
      Object.entries(raw).forEach(([k, wo]) => {
        resolved[k] = {
          ...wo,
          soNoDisplay: soLookup[wo.soNo] || wo.soNo || '',
        } as WorkOrderRecord;
      });
      setWorkOrders(resolved);
    }
    if (binSnap.exists()) setBinRecords(binSnap.val());
  };

  // ── Cascade dropdown options ───────────────────────────────────────────────

  const woPOs = useMemo(() => {
    const vals = Array.from(new Set(Object.values(workOrders).map(w => w.poNo).filter(Boolean))).sort();
    return ['ALL', ...vals];
  }, [workOrders]);

  const woSOs = useMemo(() => {
    const base = selectedPO !== 'ALL'
      ? Object.values(workOrders).filter(w => w.poNo === selectedPO)
      : Object.values(workOrders);
    // Show resolved SO number in the dropdown
    const vals = Array.from(new Set(base.map(w => w.soNoDisplay || w.soNo).filter(Boolean))).sort();
    return ['ALL', ...vals];
  }, [workOrders, selectedPO]);

  const woNOs = useMemo(() => {
    let base = Object.values(workOrders);
    if (selectedPO !== 'ALL') base = base.filter(w => w.poNo === selectedPO);
    // Filter by display SO number
    if (selectedSO !== 'ALL') base = base.filter(w => (w.soNoDisplay || w.soNo) === selectedSO);
    const vals = Array.from(new Set(base.map(w => w.workOrderNo).filter(Boolean))).sort();
    return ['ALL', ...vals];
  }, [workOrders, selectedPO, selectedSO]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handlePOChange = (po: string) => {
    setSelectedPO(po);
    setSelectedSO('ALL');
    setSelectedWO('ALL');
  };

  const handleSOChange = (so: string) => {
    setSelectedSO(so);
    setSelectedWO('ALL');
  };

  const handleWOChange = (woNo: string) => {
    setSelectedWO(woNo);
    if (woNo !== 'ALL') {
      const wo = Object.values(workOrders).find(w => w.workOrderNo === woNo);
      if (wo) {
        setSelectedPO(wo.poNo || 'ALL');
        // Set the display SO value for the dropdown
        setSelectedSO(wo.soNoDisplay || wo.soNo || 'ALL');
      }
    }
  };

  // Edit button in form: loads existing bin print record for the selected WO
  const handleEditForm = () => {
    if (selectedWO === 'ALL') {
      toast({ title: 'Select a Work Order first', variant: 'destructive' });
      return;
    }
    const existing = Object.entries(binRecords).find(([, r]) => r.workOrderNo === selectedWO);
    if (!existing) {
      toast({ title: 'No existing bin print record for this Work Order', variant: 'destructive' });
      return;
    }
    const [key, rec] = existing;
    setEditingKey(key);
    setTotalBin(rec.totalBin);
    setTotalPrint(rec.totalPrint);
    toast({ title: 'Record loaded for editing' });
  };

  const resetForm = () => {
    setEditingKey(null);
    setSelectedPO('ALL');
    setSelectedSO('ALL');
    setSelectedWO('ALL');
    setTotalBin('');
    setTotalPrint('');
  };

  const handlePrint = async () => {
    if (selectedWO === 'ALL') {
      toast({ title: 'Please select a Work Order No', variant: 'destructive' });
      return;
    }
    if (!totalBin.trim()) {
      toast({ title: 'Total Bin is required', variant: 'destructive' });
      return;
    }
    if (!totalPrint.trim()) {
      toast({ title: 'Total Print is required', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const wo = Object.values(workOrders).find(w => w.workOrderNo === selectedWO);
      const record: BinPrintRecord = {
        poNo:        wo?.poNo || (selectedPO !== 'ALL' ? selectedPO : ''),
        soNo:        wo?.soNo || (selectedSO !== 'ALL' ? selectedSO : ''),
        workOrderNo: selectedWO,
        totalBin,
        totalPrint,
        printerName: '',
        createdAt: new Date().toISOString(),
      };

      if (editingKey) {
        await set(ref(database, `production/workOrderBinPrint/${editingKey}`), record);
        setBinRecords(prev => ({ ...prev, [editingKey]: record }));
        toast({ title: 'Bin print record updated' });
        setEditingKey(null);
      } else {
        const newRef = push(ref(database, 'production/workOrderBinPrint'));
        await set(newRef, record);
        setBinRecords(prev => ({ ...prev, [newRef.key!]: record }));
        toast({ title: `Bin print saved — ${selectedWO}` });
      }

      openPrintWindow(record, wo);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  // Opens a browser print window with the bin label
  const openPrintWindow = (rec: BinPrintRecord, wo?: WorkOrderRecord) => {
    const win = window.open('', '_blank', 'width=420,height=500');
    if (!win) { toast({ title: 'Please allow popups to print', variant: 'destructive' }); return; }

    const binCount   = parseInt(rec.totalBin)   || 1;
    const printCount = parseInt(rec.totalPrint) || 1;
    let labels = '';

    // Generate printCount copies of each bin label
    let labelIndex = 0;
    const totalLabels = binCount * printCount;
    for (let b = 1; b <= binCount; b++) {
      for (let cp = 1; cp <= printCount; cp++) {
        labelIndex++;
        labels += `
        <div class="label" ${labelIndex < totalLabels ? 'style="page-break-after:always"' : ''}>
          <div class="company">FCS FLUORO CARBON SEALS</div>
          <div class="subtitle">BIN LABEL</div>
          <table>
            <tr><td class="k">Work Order No</td><td class="v">${rec.workOrderNo}</td></tr>
            <tr><td class="k">PO No</td><td class="v">${rec.poNo}</td></tr>
            <tr><td class="k">SO No</td><td class="v">${wo?.soNoDisplay || rec.soNo}</td></tr>
            ${wo ? `<tr><td class="k">Item Code</td><td class="v">${wo.fgItem}</td></tr>` : ''}
            ${wo ? `<tr><td class="k">Description</td><td class="v">${wo.fgDescription}</td></tr>` : ''}
            ${wo ? `<tr><td class="k">Required Qty</td><td class="v">${wo.requiredQty}</td></tr>` : ''}
            <tr><td class="k">Bin No</td><td class="v">${b} / ${rec.totalBin}</td></tr>
            <tr><td class="k">Total Bins</td><td class="v">${rec.totalBin}</td></tr>
            <tr><td class="k">Copy</td><td class="v">${cp} / ${rec.totalPrint}</td></tr>
          </table>
        </div>`;
      }
    }

    win.document.write(`
      <html>
        <head>
          <title>Bin Label — ${rec.workOrderNo}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 10px; }
            .label { border: 2px solid #000; padding: 14px; width: 340px; margin: 0 auto 10px; }
            .company { font-size: 15px; font-weight: bold; text-align: center; border-bottom: 1px solid #000; padding-bottom: 6px; margin-bottom: 4px; }
            .subtitle { font-size: 13px; font-weight: bold; text-align: center; margin-bottom: 10px; letter-spacing: 1px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            td { padding: 3px 4px; }
            .k { font-weight: bold; width: 45%; }
            .v { text-align: right; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${labels}
        </body>
      </html>
    `);
    win.document.close();
  };

  // Enrich bin rows with resolved SO number from the linked WO
  const allBinRows = useMemo(() => {
    // Build workOrderNo → soNoDisplay lookup
    const woToSo: Record<string, string> = {};
    Object.values(workOrders).forEach(wo => {
      woToSo[wo.workOrderNo] = wo.soNoDisplay || wo.soNo || '';
    });
    return Object.entries(binRecords).map(([key, r]) => ({
      key,
      ...r,
      soNoDisplay: woToSo[r.workOrderNo] || r.soNo || '',
    })).sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [binRecords, workOrders]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allBinRows.filter(r =>
      !q || [r.poNo, r.soNoDisplay, r.soNo, r.workOrderNo, r.totalBin, r.totalPrint]
        .some(v => v?.toLowerCase().includes(q))
    );
  }, [allBinRows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize);

  const DivSel = ({ label, value, onChange, options, required }: {
    label: string; value: string; onChange: (v: string) => void; options: string[]; required?: boolean;
  }) => (
    <div className="space-y-1">
      <Label className="text-sm">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      <SearchableSelect
        value={value}
        onValueChange={onChange}
        options={options}
        className="h-9"
      />
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ── Form Card ─────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6 space-y-5">


          {/* PO / SO / WO dropdowns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
            <DivSel label="PO NO"        value={selectedPO} onChange={handlePOChange} options={woPOs} />
            <DivSel label="SO No"        value={selectedSO} onChange={handleSOChange} options={woSOs} />
            <DivSel label="WorkOrder NO" value={selectedWO} onChange={handleWOChange} options={woNOs} />
          </div>

          {/* Total Bin / Total Print / Buttons */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-sm">
                Total Bin <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number" min="1"
                className="w-44 h-9"
                value={totalBin}
                onChange={e => setTotalBin(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">
                Total Print <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number" min="1"
                className="w-44 h-9"
                value={totalPrint}
                onChange={e => setTotalPrint(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pb-0.5">
              <Button
                onClick={handlePrint}
                disabled={saving}
                className="bg-blue-700 hover:bg-blue-800 text-white h-9 px-7">
                {saving ? 'Saving…' : editingKey ? 'Update' : 'Print'}
              </Button>
              <Button
                onClick={editingKey ? resetForm : handleEditForm}
                className="bg-yellow-500 hover:bg-yellow-600 text-black h-9 px-6">
                {editingKey ? 'Cancel' : 'Edit'}
              </Button>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* ── Table Card ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">WorkOrder Bin Print Details</CardTitle>
        </CardHeader>
        <CardContent>

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
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Search:</span>
              <Input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="h-7 w-44 text-xs"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs w-12">S.No</TableHead>
                  <TableHead className="text-xs">PO No</TableHead>
                  <TableHead className="text-xs">SO No</TableHead>
                  <TableHead className="text-xs">WorkOrder No</TableHead>
                  <TableHead className="text-xs">Total bin</TableHead>
                  <TableHead className="text-xs">Total Print</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No records found
                    </TableCell>
                  </TableRow>
                ) : paginated.map((r, i) => (
                  <TableRow key={r.key}
                    className={`cursor-pointer hover:bg-muted/30 ${editingKey === r.key ? 'bg-amber-50' : ''}`}
                    onClick={() => {
                      setEditingKey(r.key);
                      setSelectedWO(r.workOrderNo);
                      setSelectedPO(r.poNo || 'ALL');
                      setSelectedSO(r.soNoDisplay || r.soNo || 'ALL');
                      setTotalBin(r.totalBin);
                      setTotalPrint(r.totalPrint);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}>
                    <TableCell className="text-xs">{(page - 1) * pageSize + i + 1}</TableCell>
                    <TableCell className="text-xs">{r.poNo}</TableCell>
                    <TableCell className="text-xs">{r.soNoDisplay || r.soNo}</TableCell>
                    <TableCell className="text-xs font-medium text-primary">{r.workOrderNo}</TableCell>
                    <TableCell className="text-xs">{r.totalBin}</TableCell>
                    <TableCell className="text-xs">{r.totalPrint}</TableCell>
                  </TableRow>
                ))}
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
          )}

        </CardContent>
      </Card>

    </div>
  );
}