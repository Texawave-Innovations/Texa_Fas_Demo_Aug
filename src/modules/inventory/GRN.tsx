import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Search, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { database, logAudit } from '@/services/firebase';
import { ref, onValue, off, push } from 'firebase/database';

interface GRNRecord {
  id: string;
  grnNo: string;
  date: string;
  supplier: string;
  material: string;
  qty: number;
  unit: string;
  poNumber: string;
  status: 'Accepted' | 'Under Inspection' | 'Rejected';
  remarks?: string;
  createdAt: number;
}

const SAMPLE_GRN: GRNRecord[] = [
  { id: 's1', grnNo: 'GRN-2026-001', date: '2026-05-15', supplier: 'Alpha Chemicals Pvt Ltd', material: 'NR-GRADE-1',       qty: 500, unit: 'kg',  poNumber: 'PO-2026-001', status: 'Accepted',         remarks: 'All OK',            createdAt: new Date('2026-05-15').getTime() },
  { id: 's2', grnNo: 'GRN-2026-002', date: '2026-05-22', supplier: 'Beta Supplies',            material: 'SBR-1502',          qty: 300, unit: 'kg',  poNumber: 'PO-2026-002', status: 'Accepted',         remarks: '',                  createdAt: new Date('2026-05-22').getTime() },
  { id: 's3', grnNo: 'GRN-2026-003', date: '2026-06-01', supplier: 'Gamma Materials Ltd',      material: 'CARBON-BLACK-N330', qty: 200, unit: 'kg',  poNumber: 'PO-2026-003', status: 'Accepted',         remarks: 'Verified by QC',    createdAt: new Date('2026-06-01').getTime() },
  { id: 's4', grnNo: 'GRN-2026-004', date: '2026-06-03', supplier: 'Alpha Chemicals Pvt Ltd',  material: 'ZINC-OXIDE-99',     qty: 100, unit: 'kg',  poNumber: 'PO-2026-004', status: 'Under Inspection', remarks: 'QC in progress',    createdAt: new Date('2026-06-03').getTime() },
  { id: 's5', grnNo: 'GRN-2026-005', date: '2026-06-05', supplier: 'Delta Corp',               material: 'SULPHUR-POWDER',    qty: 150, unit: 'kg',  poNumber: 'PO-2026-005', status: 'Accepted',         remarks: '',                  createdAt: new Date('2026-06-05').getTime() },
];

const UNITS = ['kg', 'Nos', 'Ltrs', 'mtr', 'Pcs', 'Set'];
const STATUSES: GRNRecord['status'][] = ['Accepted', 'Under Inspection', 'Rejected'];

const emptyForm = { supplier: '', material: '', qty: 0, unit: 'kg', poNumber: '', date: new Date().toISOString().split('T')[0], status: 'Accepted' as GRNRecord['status'], remarks: '' };

let grnCounter = 6; // continues from sample

export default function GRN() {
  const [records, setRecords] = useState<GRNRecord[]>(SAMPLE_GRN);
  const [search,  setSearch]  = useState('');
  const [open,    setOpen]    = useState(false);
  const [form,    setForm]    = useState(emptyForm);

  useEffect(() => {
    const grnRef = ref(database, 'stores/grn');
    const u = onValue(grnRef, (snap) => {
      const data = snap.val();
      if (data) {
        const list: GRNRecord[] = Object.keys(data)
          .map(key => ({ ...data[key], id: key }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (list.length > 0) setRecords([...SAMPLE_GRN, ...list]);
      }
    });
    return () => off(grnRef, 'value', u);
  }, []);

  const handleAdd = async () => {
    if (!form.supplier || !form.material || !form.qty) {
      toast.error('Supplier, material and quantity are required');
      return;
    }
    const newGRN: Omit<GRNRecord, 'id'> = {
      ...form,
      grnNo: `GRN-2026-${String(grnCounter++).padStart(3, '0')}`,
      createdAt: Date.now(),
    };
    const grnRef = ref(database, 'stores/grn');
    const newRef = await push(grnRef, newGRN);
    logAudit(
      'stores/grn',
      newRef.key,
      'stock_added',
      `${newGRN.grnNo}: +${newGRN.qty} of ${newGRN.material} received from ${newGRN.supplier}`,
    );
    setOpen(false);
    setForm(emptyForm);
    toast.success(`${newGRN.grnNo} created successfully`);
  };

  const filtered = records.filter(r =>
    r.grnNo.toLowerCase().includes(search.toLowerCase()) ||
    r.supplier.toLowerCase().includes(search.toLowerCase()) ||
    r.material.toLowerCase().includes(search.toLowerCase()) ||
    r.poNumber.toLowerCase().includes(search.toLowerCase())
  );

  const accepted   = records.filter(r => r.status === 'Accepted').length;
  const pending    = records.filter(r => r.status === 'Under Inspection').length;
  const rejected   = records.filter(r => r.status === 'Rejected').length;
  const totalQty   = records.reduce((s, r) => s + (r.qty || 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-purple-600">{records.length}</div>
          <p className="text-xs text-muted-foreground mt-1">Total GRNs</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-green-600">{accepted}</div>
          <p className="text-xs text-muted-foreground mt-1">Accepted</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-yellow-600">{pending}</div>
          <p className="text-xs text-muted-foreground mt-1">Under Inspection</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-blue-600">{totalQty.toLocaleString('en-IN')} kg</div>
          <p className="text-xs text-muted-foreground mt-1">Total Qty Received</p>
        </CardContent></Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-purple-600" />
              Goods Receipt Notes
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search GRN / supplier..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" />New GRN</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>Create New GRN</DialogTitle></DialogHeader>
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Date *</Label>
                        <Input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
                      </div>
                      <div>
                        <Label>PO Number</Label>
                        <Input value={form.poNumber} onChange={e => setForm({...form, poNumber: e.target.value})} placeholder="PO-2026-XXX" />
                      </div>
                    </div>
                    <div>
                      <Label>Supplier *</Label>
                      <Input value={form.supplier} onChange={e => setForm({...form, supplier: e.target.value})} placeholder="Supplier name" />
                    </div>
                    <div>
                      <Label>Material (Compound Code) *</Label>
                      <Input value={form.material} onChange={e => setForm({...form, material: e.target.value})} placeholder="e.g. NR-GRADE-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Quantity *</Label>
                        <Input type="number" value={form.qty || ''} onChange={e => setForm({...form, qty: Number(e.target.value)})} />
                      </div>
                      <div>
                        <Label>Unit</Label>
                        <select className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background" value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}>
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <Label>Status</Label>
                      <select className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background" value={form.status} onChange={e => setForm({...form, status: e.target.value as GRNRecord['status']})}>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>Remarks</Label>
                      <Input value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})} placeholder="Optional" />
                    </div>
                    <Button onClick={handleAdd} className="w-full mt-2">Create GRN</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>GRN No.</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>PO No.</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-10">No GRN records found</TableCell>
                  </TableRow>
                ) : filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono font-bold text-purple-700">{r.grnNo}</TableCell>
                    <TableCell className="text-sm">{r.date}</TableCell>
                    <TableCell className="font-medium max-w-36 truncate">{r.supplier}</TableCell>
                    <TableCell className="font-mono text-sm">{r.material}</TableCell>
                    <TableCell className="text-right font-bold text-purple-600">{r.qty.toLocaleString('en-IN')}</TableCell>
                    <TableCell>{r.unit}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{r.poNumber}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-28 truncate">{r.remarks || '—'}</TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={r.status} tone={r.status === 'Under Inspection' ? 'amber' : undefined} />
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
