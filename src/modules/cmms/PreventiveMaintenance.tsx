import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, CalendarClock, Wrench, Gauge } from 'lucide-react';
import { toast } from 'sonner';
import { format, addDays, isPast } from 'date-fns';
import { getAllRecords, createRecord, updateRecord } from '@/services/firebase';
import type { Asset, PMSchedule, PMTriggerType } from '@/types/cmms';

const emptyForm = () => ({
  name: '', assetId: '', triggerType: 'Time' as PMTriggerType,
  frequencyDays: '30', meterInterval: '500', assignedTo: '', taskChecklist: '',
});

export default function PreventiveMaintenance() {
  const [schedules, setSchedules] = useState<PMSchedule[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [s, a] = await Promise.all([getAllRecords('cmms/pmSchedules'), getAllRecords('cmms/assets')]);
      setSchedules((s as PMSchedule[]).sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0)));
      setAssets(a as Asset[]);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!form.name.trim() || !form.assetId) {
      toast.error('Name and asset are required');
      return;
    }
    const asset = assets.find((a) => a.id === form.assetId);
    const today = new Date();
    const payload: Omit<PMSchedule, 'id' | 'createdAt'> = {
      name: form.name.trim(),
      assetId: form.assetId,
      assetName: asset?.name || '',
      triggerType: form.triggerType,
      frequencyDays: form.triggerType === 'Time' ? Number(form.frequencyDays) : undefined,
      meterInterval: form.triggerType === 'Meter' ? Number(form.meterInterval) : undefined,
      lastServiceDate: format(today, 'yyyy-MM-dd'),
      lastServiceMeter: asset?.meterReading,
      nextDueDate: form.triggerType === 'Time' ? format(addDays(today, Number(form.frequencyDays)), 'yyyy-MM-dd') : undefined,
      nextDueMeter: form.triggerType === 'Meter' ? (asset?.meterReading || 0) + Number(form.meterInterval) : undefined,
      taskChecklist: form.taskChecklist.split('\n').map((t) => t.trim()).filter(Boolean),
      assignedTo: form.assignedTo || undefined,
      status: 'Active',
    };
    try {
      await createRecord('cmms/pmSchedules', payload);
      toast.success('Preventive maintenance schedule created');
      setDialogOpen(false);
      setForm(emptyForm());
      loadAll();
    } catch {
      toast.error('Failed to create schedule');
    }
  };

  const generateWorkOrder = async (s: PMSchedule) => {
    const today = new Date();
    try {
      const woNumber = `WO-${Date.now().toString().slice(-6)}`;
      await createRecord('cmms/workOrders', {
        woNumber,
        assetId: s.assetId,
        assetName: s.assetName,
        title: `Preventive Maintenance — ${s.name}`,
        description: s.taskChecklist.length ? `Checklist:\n${s.taskChecklist.join('\n')}` : undefined,
        type: 'Preventive',
        priority: 'Medium',
        status: 'Open',
        assignedTo: s.assignedTo,
        scheduledDate: format(today, 'yyyy-MM-dd'),
        partsUsed: [],
        pmScheduleId: s.id,
      });

      const asset = assets.find((a) => a.id === s.assetId);
      const updates: Partial<PMSchedule> = {
        lastServiceDate: format(today, 'yyyy-MM-dd'),
        lastServiceMeter: asset?.meterReading,
      };
      if (s.triggerType === 'Time' && s.frequencyDays) {
        updates.nextDueDate = format(addDays(today, s.frequencyDays), 'yyyy-MM-dd');
      }
      if (s.triggerType === 'Meter' && s.meterInterval) {
        updates.nextDueMeter = (asset?.meterReading || 0) + s.meterInterval;
      }
      await updateRecord('cmms/pmSchedules', s.id, updates);
      toast.success('Work order generated from PM schedule');
      loadAll();
    } catch {
      toast.error('Failed to generate work order');
    }
  };

  const toggleStatus = async (s: PMSchedule) => {
    const next = s.status === 'Active' ? 'Paused' : 'Active';
    await updateRecord('cmms/pmSchedules', s.id, { status: next });
    loadAll();
  };

  const isDue = (s: PMSchedule) => {
    if (s.triggerType === 'Time' && s.nextDueDate) return isPast(new Date(s.nextDueDate));
    if (s.triggerType === 'Meter' && s.nextDueMeter !== undefined) {
      const asset = assets.find((a) => a.id === s.assetId);
      return (asset?.meterReading || 0) >= s.nextDueMeter;
    }
    return false;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{schedules.length} preventive maintenance schedules</p>
        <Button size="sm" onClick={() => setDialogOpen(true)} disabled={assets.length === 0}>
          <Plus className="h-4 w-4 mr-1.5" />New Schedule
        </Button>
      </div>

      {assets.length === 0 && !loading && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Add an asset first under the Assets tab before scheduling preventive maintenance.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading schedules...</p>
      ) : schedules.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No preventive maintenance schedules yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {schedules.map((s) => {
            const due = isDue(s);
            return (
              <Card key={s.id} className={due && s.status === 'Active' ? 'border-amber-300' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CalendarClock className="h-4 w-4 text-primary" />
                      {s.name}
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                      {due && s.status === 'Active' && <StatusBadge status="Due" className="text-[10px]" />}
                      <StatusBadge status={s.status} className="text-[10px]" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1"><Wrench className="h-3 w-3" />{s.assetName}</p>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {s.triggerType === 'Time' ? (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5" />
                      Every {s.frequencyDays} days · Next due: <span className="font-medium text-foreground">{s.nextDueDate}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Gauge className="h-3.5 w-3.5" />
                      Every {s.meterInterval} meter units · Next due at: <span className="font-medium text-foreground">{s.nextDueMeter}</span>
                    </div>
                  )}
                  {s.taskChecklist.length > 0 && (
                    <ul className="list-disc list-inside text-muted-foreground">
                      {s.taskChecklist.slice(0, 3).map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => toggleStatus(s)}>
                      {s.status === 'Active' ? 'Pause' : 'Resume'}
                    </Button>
                    <Button size="sm" className="h-7 text-xs" onClick={() => generateWorkOrder(s)} disabled={s.status !== 'Active'}>
                      Generate Work Order
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Preventive Maintenance Schedule</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Schedule Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Monthly Lubrication" /></div>
            <div>
              <Label>Asset</Label>
              <Select value={form.assetId} onValueChange={(v) => setForm((f) => ({ ...f, assetId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
                <SelectContent>
                  {assets.map((a) => <SelectItem key={a.id} value={a.id}>{a.assetCode} - {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Trigger Type</Label>
              <Select value={form.triggerType} onValueChange={(v: PMTriggerType) => setForm((f) => ({ ...f, triggerType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Time">Time-based (calendar days)</SelectItem>
                  <SelectItem value="Meter">Meter-based (usage reading)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.triggerType === 'Time' ? (
              <div><Label>Frequency (days)</Label><Input type="number" value={form.frequencyDays} onChange={(e) => setForm((f) => ({ ...f, frequencyDays: e.target.value }))} /></div>
            ) : (
              <div><Label>Meter Interval</Label><Input type="number" value={form.meterInterval} onChange={(e) => setForm((f) => ({ ...f, meterInterval: e.target.value }))} /></div>
            )}
            <div><Label>Assigned To</Label><Input value={form.assignedTo} onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))} /></div>
            <div><Label>Task Checklist (one per line)</Label><Textarea rows={3} value={form.taskChecklist} onChange={(e) => setForm((f) => ({ ...f, taskChecklist: e.target.value }))} placeholder={'Check oil level\nInspect belts\nClean filters'} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save Schedule</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
