import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, ClipboardList, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getAllRecords, createRecord, updateRecord } from '@/services/firebase';
import type { Asset, WorkOrder, WorkOrderPriority, WorkOrderStatus, WorkOrderType } from '@/types/cmms';

const TYPES: WorkOrderType[] = ['Corrective', 'Preventive', 'Inspection', 'Emergency'];
const PRIORITIES: WorkOrderPriority[] = ['Low', 'Medium', 'High', 'Critical'];
const STATUSES: WorkOrderStatus[] = ['Open', 'Assigned', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];

const PRIORITY_TONE: Record<WorkOrderPriority, 'slate' | 'blue' | 'amber' | 'red'> = {
  Low: 'slate', Medium: 'blue', High: 'amber', Critical: 'red',
};

const emptyForm = () => ({
  assetId: '', title: '', description: '', type: 'Corrective' as WorkOrderType,
  priority: 'Medium' as WorkOrderPriority, assignedTo: '', requestedBy: '',
  scheduledDate: format(new Date(), 'yyyy-MM-dd'), notes: '',
});

export default function WorkOrders() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [w, a] = await Promise.all([getAllRecords('cmms/workOrders'), getAllRecords('cmms/assets')]);
      setWorkOrders((w as WorkOrder[]).sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0)));
      setAssets(a as Asset[]);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!form.assetId || !form.title.trim()) {
      toast.error('Asset and title are required');
      return;
    }
    const asset = assets.find((a) => a.id === form.assetId);
    const woNumber = `WO-${Date.now().toString().slice(-6)}`;
    try {
      await createRecord('cmms/workOrders', {
        woNumber,
        assetId: form.assetId,
        assetName: asset?.name || '',
        title: form.title.trim(),
        description: form.description || undefined,
        type: form.type,
        priority: form.priority,
        status: 'Open',
        assignedTo: form.assignedTo || undefined,
        requestedBy: form.requestedBy || undefined,
        scheduledDate: form.scheduledDate || undefined,
        partsUsed: [],
        notes: form.notes || undefined,
      });
      toast.success('Work order created');
      setDialogOpen(false);
      setForm(emptyForm());
      loadAll();
    } catch {
      toast.error('Failed to create work order');
    }
  };

  const updateStatus = async (wo: WorkOrder, status: WorkOrderStatus) => {
    const updates: Partial<WorkOrder> = { status };
    if (status === 'Completed') updates.completedDate = format(new Date(), 'yyyy-MM-dd');
    await updateRecord('cmms/workOrders', wo.id, updates);
    if (status === 'Completed' && wo.assetId) {
      // Reflect the completed repair back onto the asset's operational status.
      const asset = assets.find((a) => a.id === wo.assetId);
      if (asset && asset.status !== 'Operational') {
        await updateRecord('cmms/assets', asset.id, { status: 'Operational' });
      }
    }
    toast.success(`Work order marked ${status}`);
    loadAll();
  };

  const filtered = statusFilter === 'all' ? workOrders : workOrders.filter((w) => w.status === statusFilter);

  const openCount = workOrders.filter((w) => w.status === 'Open' || w.status === 'Assigned').length;
  const inProgressCount = workOrders.filter((w) => w.status === 'In Progress').length;
  const overdueCount = workOrders.filter((w) => w.status !== 'Completed' && w.status !== 'Cancelled' && w.scheduledDate && new Date(w.scheduledDate) < new Date()).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">Open / Assigned</p><p className="text-2xl font-bold">{openCount}</p></CardContent></Card>
        <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">In Progress</p><p className="text-2xl font-bold text-amber-600">{inProgressCount}</p></CardContent></Card>
        <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">Overdue</p><p className="text-2xl font-bold text-red-600">{overdueCount}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" />Work Orders</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setDialogOpen(true)} disabled={assets.length === 0}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />New Work Order
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {assets.length === 0 && !loading && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3">
              Add an asset first under the Assets tab before creating work orders.
            </p>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading work orders...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No work orders found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>WO No</TableHead>
                    <TableHead>Asset</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-mono font-semibold">{w.woNumber}</TableCell>
                      <TableCell>{w.assetName}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{w.title}</TableCell>
                      <TableCell>{w.type}</TableCell>
                      <TableCell><StatusBadge status={w.priority} tone={PRIORITY_TONE[w.priority]} /></TableCell>
                      <TableCell>{w.scheduledDate ? (() => { try { return format(new Date(w.scheduledDate), 'dd-MM-yyyy'); } catch { return w.scheduledDate; } })() : '—'}</TableCell>
                      <TableCell>
                        <Select value={w.status} onValueChange={(v: WorkOrderStatus) => updateStatus(w, v)}>
                          <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {w.status === 'Completed' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Work Order</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Asset</Label>
              <Select value={form.assetId} onValueChange={(v) => setForm((f) => ({ ...f, assetId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
                <SelectContent>
                  {assets.map((a) => <SelectItem key={a.id} value={a.id}>{a.assetCode} - {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Hydraulic leak repair" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v: WorkOrderType) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v: WorkOrderPriority) => setForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Assigned To</Label><Input value={form.assignedTo} onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))} /></div>
              <div><Label>Scheduled Date</Label><Input type="date" value={form.scheduledDate} onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))} /></div>
            </div>
            <div><Label>Requested By</Label><Input value={form.requestedBy} onChange={(e) => setForm((f) => ({ ...f, requestedBy: e.target.value }))} /></div>
            <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save}>Create Work Order</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
