import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Search, PackageSearch, AlertTriangle, Minus, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getAllRecords, createRecord, updateRecord } from '@/services/firebase';
import type { SparePart } from '@/types/cmms';

const emptyForm = () => ({ partCode: '', partName: '', category: '', uom: 'Nos', stockQty: '', reorderPoint: '', unitCost: '', location: '' });

export default function SpareParts() {
  const [parts, setParts] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const data = await getAllRecords('cmms/spareParts');
      setParts((data as SparePart[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!form.partCode.trim() || !form.partName.trim()) {
      toast.error('Part code and name are required');
      return;
    }
    try {
      await createRecord('cmms/spareParts', {
        partCode: form.partCode.trim(),
        partName: form.partName.trim(),
        category: form.category || 'General',
        uom: form.uom,
        stockQty: Number(form.stockQty || 0),
        reorderPoint: Number(form.reorderPoint || 0),
        unitCost: form.unitCost ? Number(form.unitCost) : undefined,
        location: form.location || undefined,
      });
      toast.success('Spare part added');
      setDialogOpen(false);
      setForm(emptyForm());
      load();
    } catch {
      toast.error('Failed to add spare part');
    }
  };

  const adjustStock = async (part: SparePart, delta: number) => {
    const next = Math.max(0, part.stockQty + delta);
    await updateRecord('cmms/spareParts', part.id, { stockQty: next });
    load();
  };

  const filtered = parts.filter((p) => {
    const q = search.toLowerCase();
    return p.partCode.toLowerCase().includes(q) || p.partName.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
  });

  const lowStockCount = parts.filter((p) => p.stockQty <= p.reorderPoint).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">Total Spare Parts</p><p className="text-2xl font-bold">{parts.length}</p></CardContent></Card>
        <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-red-600" />Below Reorder Point</p><p className="text-2xl font-bold text-red-600">{lowStockCount}</p></CardContent></Card>
        <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">Total Stock Value</p><p className="text-2xl font-bold">{parts.reduce((s, p) => s + p.stockQty * (p.unitCost || 0), 0).toLocaleString()}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base flex items-center gap-2"><PackageSearch className="h-4 w-4 text-primary" />Spare Parts Inventory</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search parts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs w-48" />
            </div>
            <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-3.5 w-3.5 mr-1.5" />Add Part</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading spare parts...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No spare parts found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Reorder Point</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Adjust</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const low = p.stockQty <= p.reorderPoint;
                    return (
                      <TableRow key={p.id} className={low ? 'bg-red-50/50' : ''}>
                        <TableCell className="font-mono font-semibold">{p.partCode}</TableCell>
                        <TableCell>{p.partName}</TableCell>
                        <TableCell>{p.category}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className={`font-medium ${low ? 'text-red-600' : ''}`}>{p.stockQty} {p.uom}</span>
                            {low && <StatusBadge status="Low" tone="red" className="text-[10px]" />}
                          </div>
                        </TableCell>
                        <TableCell>{p.reorderPoint} {p.uom}</TableCell>
                        <TableCell>{p.location || '—'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => adjustStock(p, -1)}><Minus className="h-3 w-3" /></Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => adjustStock(p, 1)}><PlusCircle className="h-3 w-3" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Spare Part</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Part Code</Label><Input value={form.partCode} onChange={(e) => setForm((f) => ({ ...f, partCode: e.target.value }))} /></div>
              <div><Label>Part Name</Label><Input value={form.partName} onChange={(e) => setForm((f) => ({ ...f, partName: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. Bearings" /></div>
              <div><Label>UOM</Label><Input value={form.uom} onChange={(e) => setForm((f) => ({ ...f, uom: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Stock Qty</Label><Input type="number" value={form.stockQty} onChange={(e) => setForm((f) => ({ ...f, stockQty: e.target.value }))} /></div>
              <div><Label>Reorder Point</Label><Input type="number" value={form.reorderPoint} onChange={(e) => setForm((f) => ({ ...f, reorderPoint: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Unit Cost</Label><Input type="number" value={form.unitCost} onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))} /></div>
              <div><Label>Storage Location</Label><Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} /></div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save Part</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
