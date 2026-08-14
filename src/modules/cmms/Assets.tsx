import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Edit, MapPin, Gauge, Upload, FileText, Wrench, History } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getAllRecords, createRecord, updateRecord } from '@/services/firebase';
import { uploadFile } from '@/services/cloudinary';
import type { Asset, AssetStatus, AssetCriticality, WorkOrder } from '@/types/cmms';

const CATEGORIES = ['Production Machine', 'HVAC', 'Electrical', 'Vehicle', 'Tooling & Die', 'Utility', 'Other'];
const STATUS_TONE: Record<AssetStatus, 'green' | 'red' | 'amber' | 'slate'> = {
  Operational: 'green',
  Down: 'red',
  'Under Maintenance': 'amber',
  Retired: 'slate',
};
const CRITICALITY_TONE: Record<AssetCriticality, 'slate' | 'amber' | 'red'> = {
  Low: 'slate',
  Medium: 'amber',
  High: 'red',
};

const emptyForm = () => ({
  assetCode: '', name: '', category: CATEGORIES[0], location: '', manufacturer: '', model: '',
  serialNumber: '', purchaseDate: '', warrantyExpiry: '', status: 'Operational' as AssetStatus,
  criticality: 'Medium' as AssetCriticality, meterReading: '', meterUnit: 'hours', manualUrl: '', notes: '',
});

export default function Assets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [uploading, setUploading] = useState(false);
  const [historyAsset, setHistoryAsset] = useState<Asset | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [a, w] = await Promise.all([getAllRecords('cmms/assets'), getAllRecords('cmms/workOrders')]);
      setAssets((a as Asset[]).sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0)));
      setWorkOrders(w as WorkOrder[]);
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => { setEditingId(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (a: Asset) => {
    setEditingId(a.id);
    setForm({
      assetCode: a.assetCode, name: a.name, category: a.category, location: a.location,
      manufacturer: a.manufacturer || '', model: a.model || '', serialNumber: a.serialNumber || '',
      purchaseDate: a.purchaseDate || '', warrantyExpiry: a.warrantyExpiry || '', status: a.status,
      criticality: a.criticality, meterReading: String(a.meterReading ?? ''), meterUnit: a.meterUnit || 'hours',
      manualUrl: a.manualUrl || '', notes: a.notes || '',
    });
    setDialogOpen(true);
  };

  const handleManualUpload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadFile(file);
      setForm((f) => ({ ...f, manualUrl: url }));
      toast.success('Manual uploaded');
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.assetCode.trim() || !form.name.trim()) {
      toast.error('Asset code and name are required');
      return;
    }
    const payload = {
      assetCode: form.assetCode.trim(),
      name: form.name.trim(),
      category: form.category,
      location: form.location,
      manufacturer: form.manufacturer || undefined,
      model: form.model || undefined,
      serialNumber: form.serialNumber || undefined,
      purchaseDate: form.purchaseDate || undefined,
      warrantyExpiry: form.warrantyExpiry || undefined,
      status: form.status,
      criticality: form.criticality,
      meterReading: form.meterReading ? Number(form.meterReading) : undefined,
      meterUnit: form.meterUnit,
      manualUrl: form.manualUrl || undefined,
      notes: form.notes || undefined,
    };
    try {
      if (editingId) {
        await updateRecord('cmms/assets', editingId, payload);
        toast.success('Asset updated');
      } else {
        await createRecord('cmms/assets', payload);
        toast.success('Asset created');
      }
      setDialogOpen(false);
      loadAll();
    } catch {
      toast.error('Failed to save asset');
    }
  };

  const filtered = assets.filter((a) => {
    const q = search.toLowerCase();
    return (
      a.assetCode.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.location.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q)
    );
  });

  const assetHistory = historyAsset
    ? workOrders.filter((w) => w.assetId === historyAsset.id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-muted/20 p-4 rounded-xl border border-border">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by code, name, location..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="flex items-center gap-3 justify-between w-full sm:w-auto">
          <span className="text-sm text-muted-foreground whitespace-nowrap">{filtered.length} of {assets.length} assets</span>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Asset</Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Loading assets...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {search ? `No assets found matching "${search}"` : 'No assets registered yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((a) => (
            <Card key={a.id} className="flex flex-col h-[250px] justify-between hover:-translate-y-1 hover:shadow-md transition-all duration-200 border-2 hover:border-blue-100">
              <CardHeader className="p-4 pb-2 shrink-0">
                <div className="flex items-start justify-between gap-1">
                  <Badge variant="secondary" className="font-mono text-[11px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100">{a.assetCode}</Badge>
                  <StatusBadge status={a.criticality} tone={CRITICALITY_TONE[a.criticality]} className="text-[10px]" />
                </div>
                <CardTitle className="text-sm font-bold text-slate-800 leading-tight mt-1.5 line-clamp-2 min-h-[36px]">{a.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1 pb-2 text-xs space-y-1.5 flex-grow overflow-y-auto">
                <div className="flex items-center gap-1.5 text-slate-600"><MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" /><span className="truncate">{a.location || '—'}</span></div>
                <div className="flex items-center gap-1.5 text-slate-500"><Wrench className="h-3.5 w-3.5 text-slate-400 shrink-0" /><span className="truncate">{a.category}</span></div>
                {a.meterReading !== undefined && (
                  <div className="flex items-center gap-1.5 text-slate-500"><Gauge className="h-3.5 w-3.5 text-slate-400 shrink-0" /><span>{a.meterReading} {a.meterUnit}</span></div>
                )}
                <StatusBadge status={a.status} tone={STATUS_TONE[a.status]} className="text-[10px]" />
              </CardContent>
              <CardFooter className="p-3 bg-slate-50 rounded-b-lg flex justify-end gap-1 border-t border-slate-100/60 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-blue-50" onClick={() => setHistoryAsset(a)} title="Maintenance History">
                  <History className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-blue-50" onClick={() => openEdit(a)} title="Edit Asset">
                  <Edit className="h-3.5 w-3.5" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Edit Asset' : 'Add Asset'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Asset Code</Label><Input value={form.assetCode} onChange={(e) => setForm((f) => ({ ...f, assetCode: e.target.value }))} placeholder="e.g. MC-001" /></div>
              <div><Label>Asset Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Injection Molding Machine 1" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v: AssetStatus) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Operational">Operational</SelectItem>
                    <SelectItem value="Down">Down</SelectItem>
                    <SelectItem value="Under Maintenance">Under Maintenance</SelectItem>
                    <SelectItem value="Retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Criticality</Label>
                <Select value={form.criticality} onValueChange={(v: AssetCriticality) => setForm((f) => ({ ...f, criticality: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Shop Floor A" /></div>
              <div><Label>Manufacturer</Label><Input value={form.manufacturer} onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Model</Label><Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} /></div>
              <div><Label>Serial Number</Label><Input value={form.serialNumber} onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Purchase Date</Label><Input type="date" value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} /></div>
              <div><Label>Warranty Expiry</Label><Input type="date" value={form.warrantyExpiry} onChange={(e) => setForm((f) => ({ ...f, warrantyExpiry: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Meter Reading</Label><Input type="number" value={form.meterReading} onChange={(e) => setForm((f) => ({ ...f, meterReading: e.target.value }))} placeholder="e.g. 1250" /></div>
              <div>
                <Label>Meter Unit</Label>
                <Select value={form.meterUnit} onValueChange={(v) => setForm((f) => ({ ...f, meterUnit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="cycles">Cycles</SelectItem>
                    <SelectItem value="km">Kilometers</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Manual / Documentation</Label>
              {form.manualUrl ? (
                <a href={form.manualUrl} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-2 text-xs text-primary p-2 border rounded-md bg-muted/40">
                  <FileText className="h-3.5 w-3.5" />Document attached — view
                </a>
              ) : (
                <label className="mt-1 flex items-center justify-center gap-2 border border-dashed rounded-md py-3 text-xs text-muted-foreground cursor-pointer hover:bg-muted/40">
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? 'Uploading...' : 'Upload manual (image/PDF)'}
                  <input type="file" accept="image/*,.pdf" className="hidden" disabled={uploading} onChange={(e) => e.target.files?.[0] && handleManualUpload(e.target.files[0])} />
                </label>
              )}
            </div>
            <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editingId ? 'Update Asset' : 'Create Asset'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Maintenance history dialog */}
      <Dialog open={!!historyAsset} onOpenChange={(open) => !open && setHistoryAsset(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Maintenance History — {historyAsset?.name}</DialogTitle></DialogHeader>
          {assetHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No work orders recorded for this asset yet.</p>
          ) : (
            <div className="space-y-2">
              {assetHistory.map((w) => (
                <div key={w.id} className="border rounded-md p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold">{w.woNumber}</span>
                    <StatusBadge status={w.status} className="text-[10px]" />
                  </div>
                  <p className="mt-1">{w.title}</p>
                  <p className="text-muted-foreground mt-0.5">
                    {w.type} · {w.scheduledDate ? (() => { try { return format(new Date(w.scheduledDate), 'dd-MM-yyyy'); } catch { return w.scheduledDate; } })() : '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
