import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Search, FlaskConical, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { database, logAudit } from '@/services/firebase';
import { ref, onValue, off, push } from 'firebase/database';
import { RawMaterial } from '@/types';

/**
 * Normalises the storageLocations list from Firebase.
 * Handles both legacy plain strings and the new { value, status } shape.
 * Returns only active location names as a string[].
 */
const normaliseLocations = (raw: any): string[] => {
  if (!raw) return [];
  const arr: any[] = Array.isArray(raw)
    ? raw
    : Object.keys(raw)
        .filter((k) => !isNaN(Number(k)))
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => raw[k])
        .filter((item) => item !== null && item !== undefined);
  return arr
    .filter((item) => {
      if (typeof item === 'string') return true;
      if (item && typeof item === 'object') return item.status !== 'inactive';
      return false;
    })
    .map((item) => (typeof item === 'string' ? item : String(item.value ?? item)));
};

const SAMPLE_RM: RawMaterial[] = [
  { id: 's1', compoundCode: 'NR-GRADE-1',       qty: 1200, batchNumber: 'B-2026-0101', shelfLife: '12 Months', location: 'Rack A-1', createdAt: Date.now() - 86400000 },
  { id: 's2', compoundCode: 'SBR-1502',          qty: 850,  batchNumber: 'B-2026-0102', shelfLife: '18 Months', location: 'Rack A-2', createdAt: Date.now() - 172800000 },
  { id: 's3', compoundCode: 'CARBON-BLACK-N330', qty: 500,  batchNumber: 'B-2026-0103', shelfLife: '24 Months', location: 'Rack B-1', createdAt: Date.now() - 259200000 },
  { id: 's4', compoundCode: 'ZINC-OXIDE-99',     qty: 200,  batchNumber: 'B-2026-0104', shelfLife: '36 Months', location: 'Rack B-2', createdAt: Date.now() - 345600000 },
  { id: 's5', compoundCode: 'SULPHUR-POWDER',    qty: 150,  batchNumber: 'B-2026-0105', shelfLife: '12 Months', location: 'Rack C-1', createdAt: Date.now() - 432000000 },
  { id: 's6', compoundCode: 'STEARIC-ACID',      qty: 80,   batchNumber: 'B-2026-0106', shelfLife: '24 Months', location: 'Rack C-2', createdAt: Date.now() - 518400000 },
];

const stockLevel = (qty: number) => {
  if (qty <= 50)  return { label: 'Critical', tone: 'red' as const };
  if (qty <= 200) return { label: 'Low',      tone: 'orange' as const };
  return              { label: 'Adequate',  tone: 'green' as const };
};

interface AggregatedMaterial {
  compoundCode: string;
  totalQty: number;
  batches: RawMaterial[];
}

function aggregate(materials: RawMaterial[]): AggregatedMaterial[] {
  const map: Record<string, AggregatedMaterial> = {};
  for (const m of materials) {
    const key = m.compoundCode.trim().toUpperCase();
    if (!map[key]) {
      map[key] = { compoundCode: m.compoundCode, totalQty: 0, batches: [] };
    }
    map[key].totalQty += m.qty || 0;
    map[key].batches.push(m);
  }
  return Object.values(map).sort((a, b) => a.compoundCode.localeCompare(b.compoundCode));
}

const emptyForm = { compoundCode: '', qty: 0, batchNumber: '', shelfLife: '', location: '' };

export default function RawMaterialsStock() {
  const [materials,        setMaterials]        = useState<RawMaterial[]>(SAMPLE_RM);
  const [search,           setSearch]           = useState('');
  const [open,             setOpen]             = useState(false);
  const [form,             setForm]             = useState(emptyForm);
  const [expanded,         setExpanded]         = useState<Set<string>>(new Set());
  const [storageLocations, setStorageLocations] = useState<string[]>([]);

  // Subscribe to raw materials
  useEffect(() => {
    const rawRef = ref(database, 'stores/raw');
    const u = onValue(rawRef, (snap) => {
      const data = snap.val();
      if (data) {
        const list: RawMaterial[] = Object.keys(data)
          .map(key => ({ ...data[key], id: key }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (list.length > 0) setMaterials(list);
      }
    });
    return () => off(rawRef, 'value', u);
  }, []);

  // Subscribe to Storage Location master (active only)
  useEffect(() => {
    const locRef = ref(database, 'masters/stores/storageLocations');
    const unsub = onValue(locRef, (snap) => {
      setStorageLocations(normaliseLocations(snap.val()));
    });
    return () => off(locRef, 'value', unsub);
  }, []);

  const handleAdd = async () => {
    if (!form.compoundCode || !form.qty) {
      toast.error('Compound code and quantity are required');
      return;
    }
    const newRef = await push(ref(database, 'stores/raw'), { ...form, createdAt: Date.now() });
    logAudit(
      'stores/raw',
      newRef.key,
      'stock_added',
      `+${form.qty} of ${form.compoundCode} (batch ${form.batchNumber || 'N/A'}) at ${form.location || 'N/A'}`,
    );
    setOpen(false);
    setForm(emptyForm);
    toast.success('Raw material added');
  };

  const toggleExpand = (code: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const aggregated = aggregate(
    materials.filter(m =>
      m.compoundCode.toLowerCase().includes(search.toLowerCase()) ||
      m.batchNumber.toLowerCase().includes(search.toLowerCase()) ||
      m.location.toLowerCase().includes(search.toLowerCase())
    )
  );

  const totalQty = aggregated.reduce((s, a) => s + a.totalQty, 0);
  const critical  = aggregated.filter(a => a.totalQty <= 50).length;
  const low       = aggregated.filter(a => a.totalQty > 50 && a.totalQty <= 200).length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-blue-600">{aggregated.length}</div>
          <p className="text-xs text-muted-foreground mt-1">Unique Compounds</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-blue-600">{totalQty.toLocaleString('en-IN')} kg</div>
          <p className="text-xs text-muted-foreground mt-1">Total Stock</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-orange-600">{low}</div>
          <p className="text-xs text-muted-foreground mt-1">Low Stock</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-red-600">{critical}</div>
          <p className="text-xs text-muted-foreground mt-1">Critical</p>
        </CardContent></Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-blue-600" />
              Raw Materials Register
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" />Add Material</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Raw Material</DialogTitle></DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div>
                      <Label>Compound Code *</Label>
                      <Input value={form.compoundCode} onChange={e => setForm({...form, compoundCode: e.target.value})} placeholder="e.g. NR-GRADE-1" />
                    </div>
                    <div>
                      <Label>Quantity (kg) *</Label>
                      <Input type="number" value={form.qty || ''} onChange={e => setForm({...form, qty: Number(e.target.value)})} />
                    </div>
                    <div>
                      <Label>Batch Number</Label>
                      <Input value={form.batchNumber} onChange={e => setForm({...form, batchNumber: e.target.value})} placeholder="e.g. B-2026-0101" />
                    </div>
                    <div>
                      <Label>Shelf Life</Label>
                      <Input value={form.shelfLife} onChange={e => setForm({...form, shelfLife: e.target.value})} placeholder="e.g. 12 Months" />
                    </div>
                    <div>
                      <Label>Storage Location</Label>
                      <select
                        className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                        value={form.location}
                        onChange={e => setForm({...form, location: e.target.value})}
                      >
                        {storageLocations.length === 0 ? (
                          <option value="" disabled>
                            No locations configured — add in Stores Master
                          </option>
                        ) : (
                          <>
                            <option value="">Select location</option>
                            {storageLocations.map(l => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </>
                        )}
                      </select>
                    </div>
                    <Button onClick={handleAdd} className="w-full">Add Material</Button>
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
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Compound Code</TableHead>
                  <TableHead className="text-right">Total Qty (kg)</TableHead>
                  <TableHead>Batches</TableHead>
                  <TableHead>Locations</TableHead>
                  <TableHead className="text-center">Stock Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aggregated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">No records found</TableCell>
                  </TableRow>
                ) : aggregated.map((agg, idx) => {
                  const level      = stockLevel(agg.totalQty);
                  const isExpanded = expanded.has(agg.compoundCode);
                  const locations  = [...new Set(agg.batches.map(b => b.location).filter(Boolean))];

                  return (
                    <>
                      {/* Aggregated row */}
                      <TableRow
                        key={agg.compoundCode}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => agg.batches.length > 1 && toggleExpand(agg.compoundCode)}
                      >
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {agg.batches.length > 1 && (
                              isExpanded
                                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="font-mono font-bold text-blue-700">{agg.compoundCode}</span>
                          </div>
                        </TableCell>
                        <TableCell className={`text-right text-base font-bold ${agg.totalQty <= 50 ? 'text-red-600' : agg.totalQty <= 200 ? 'text-orange-600' : 'text-green-600'}`}>
                          {agg.totalQty.toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell>
                          {agg.batches.length === 1
                            ? <span className="text-sm text-muted-foreground">{agg.batches[0].batchNumber || '—'}</span>
                            : <Badge variant="secondary">{agg.batches.length} batches</Badge>
                          }
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {locations.map(l => <Badge key={l} variant="outline" className="text-xs">{l}</Badge>)}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={level.label} tone={level.tone} />
                        </TableCell>
                      </TableRow>

                      {/* Expanded batch rows */}
                      {isExpanded && agg.batches.map(b => (
                        <TableRow key={b.id} className="bg-muted/30">
                          <TableCell />
                          <TableCell className="pl-10 text-sm text-muted-foreground">↳ Batch</TableCell>
                          <TableCell className="text-right text-sm font-medium text-foreground">
                            {b.qty.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className="text-sm">{b.batchNumber || '—'}</TableCell>
                          <TableCell className="text-sm">
                            {b.location && <Badge variant="outline" className="text-xs">{b.location}</Badge>}
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">{b.shelfLife}</TableCell>
                        </TableRow>
                      ))}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}