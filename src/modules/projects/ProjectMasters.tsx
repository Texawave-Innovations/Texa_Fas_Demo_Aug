// src/modules/projects/ProjectMasters.tsx
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Plus,
  Edit2,
  Trash2,
  Users,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectService } from './projectService';
import { ProjectMachine, ProjectWorker } from './types';

export default function ProjectMasters() {
  const [activeTab, setActiveTab] = useState<'machines' | 'workers'>('machines');
  const [machines, setMachines] = useState<ProjectMachine[]>([]);
  const [workers, setWorkers] = useState<ProjectWorker[]>([]);
  const [loading, setLoading] = useState(true);

  // Machine Dialog State
  const [machineDialogOpen, setMachineDialogOpen] = useState(false);
  const [editingMachineId, setEditingMachineId] = useState<string | null>(null);
  const [mName, setMName] = useState('');
  const [mCode, setMCode] = useState('');
  const [mCategory, setMCategory] = useState('Machining');
  const [mCost, setMCost] = useState('250');
  const [mLocation, setMLocation] = useState('Shop Floor Bay 1');
  const [mNotes, setMNotes] = useState('');

  // Worker Dialog State
  const [workerDialogOpen, setWorkerDialogOpen] = useState(false);
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [wName, setWName] = useState('');
  const [wCode, setWCode] = useState('');
  const [wRole, setWRole] = useState('Machine Operator');
  const [wRate, setWRate] = useState('150');
  const [wDept, setWDept] = useState('Production');
  const [wContact, setWContact] = useState('');
  const [wIsContract, setWIsContract] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [m, w] = await Promise.all([
        projectService.getMachines(),
        projectService.getWorkers(),
      ]);
      setMachines(m);
      setWorkers(w);
    } catch {
      toast.error('Failed to load masters');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // MACHINE ACTIONS
  const handleOpenMachineDialog = (machine?: ProjectMachine) => {
    if (machine) {
      setEditingMachineId(machine.id);
      setMName(machine.name);
      setMCode(machine.code);
      setMCategory(machine.category || 'Machining');
      setMCost(String(machine.hourlyCost || 0));
      setMLocation(machine.location || '');
      setMNotes(machine.notes || '');
    } else {
      setEditingMachineId(null);
      setMName('');
      setMCode(`MCH-${Math.floor(100 + Math.random() * 900)}`);
      setMCategory('Machining');
      setMCost('250');
      setMLocation('Shop Floor Bay 1');
      setMNotes('');
    }
    setMachineDialogOpen(true);
  };

  const handleSaveMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mName.trim()) {
      toast.error('Machine name is required');
      return;
    }

    const machineData: ProjectMachine = {
      id: editingMachineId || '',
      name: mName.trim(),
      code: mCode.trim() || `M-${Date.now().toString().slice(-4)}`,
      category: mCategory.trim(),
      status: 'Idle',
      hourlyCost: Number(mCost) || 0,
      location: mLocation.trim(),
      notes: mNotes.trim(),
    };

    try {
      const saved = await projectService.saveMachine(machineData);
      if (editingMachineId) {
        setMachines(machines.map((m) => (m.id === saved.id ? saved : m)));
        toast.success('Machine updated successfully');
      } else {
        setMachines([saved, ...machines]);
        toast.success('Machine added successfully');
      }
      setMachineDialogOpen(false);
    } catch {
      toast.error('Failed to save machine');
    }
  };

  const handleDeleteMachine = async (id: string) => {
    if (!confirm('Are you sure you want to delete this machine?')) return;
    try {
      await projectService.deleteMachine(id);
      setMachines(machines.filter((m) => m.id !== id));
      toast.success('Machine deleted');
    } catch {
      toast.error('Failed to delete machine');
    }
  };

  // WORKER ACTIONS
  const handleOpenWorkerDialog = (worker?: ProjectWorker) => {
    if (worker) {
      setEditingWorkerId(worker.id);
      setWName(worker.name);
      setWCode(worker.code || '');
      setWRole(worker.role);
      setWRate(String(worker.hourlyRate || 120));
      setWDept(worker.department || 'Production');
      setWContact(worker.contact || '');
      setWIsContract(Boolean(worker.isContract));
    } else {
      setEditingWorkerId(null);
      setWName('');
      setWCode(`EMP-${Math.floor(100 + Math.random() * 900)}`);
      setWRole('Machine Operator');
      setWRate('150');
      setWDept('Production');
      setWContact('');
      setWIsContract(false);
    }
    setWorkerDialogOpen(true);
  };

  const handleSaveWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wName.trim()) {
      toast.error('Employee / Worker name is required');
      return;
    }

    const workerData: ProjectWorker = {
      id: editingWorkerId || '',
      name: wName.trim(),
      code: wCode.trim() || `EMP-${Date.now().toString().slice(-4)}`,
      role: wRole.trim(),
      hourlyRate: Number(wRate) || 120,
      department: wDept.trim(),
      contact: wContact.trim(),
      isContract: wIsContract,
    };

    try {
      const saved = await projectService.saveWorker(workerData);
      if (editingWorkerId) {
        setWorkers(workers.map((w) => (w.id === saved.id ? saved : w)));
        toast.success('Worker details updated');
      } else {
        setWorkers([saved, ...workers]);
        toast.success('Worker added successfully');
      }
      setWorkerDialogOpen(false);
    } catch {
      toast.error('Failed to save worker');
    }
  };

  const handleDeleteWorker = async (id: string) => {
    if (!confirm('Are you sure you want to delete this worker?')) return;
    try {
      await projectService.deleteWorker(id);
      setWorkers(workers.filter((w) => w.id !== id));
      toast.success('Worker deleted');
    } catch {
      toast.error('Failed to delete worker');
    }
  };

  // SYNC FROM CMMS / HR
  const handleSyncCMMS = async () => {
    try {
      setSyncing(true);
      const count = await projectService.importCMMSAssets();
      if (count > 0) {
        const updated = await projectService.getMachines();
        setMachines(updated);
        toast.success(`Imported ${count} new machines from CMMS Assets!`);
      } else {
        toast.info('All CMMS assets are already synced.');
      }
    } catch {
      toast.error('Failed to sync from CMMS');
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncHR = async () => {
    try {
      setSyncing(true);
      const count = await projectService.importHREmployees();
      if (count > 0) {
        const updated = await projectService.getWorkers();
        setWorkers(updated);
        toast.success(`Imported ${count} new employees from HR with calculated hourly rates!`);
      } else {
        toast.info('All HR employees are already synced.');
      }
    } catch {
      toast.error('Failed to sync from HR');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground animate-pulse">
        Loading machine and worker masters...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab Switcher & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex bg-muted/60 p-1 rounded-lg border border-border/40 text-xs w-fit">
          <button
            onClick={() => setActiveTab('machines')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'machines'
                ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-400'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" /> Machines ({machines.length})
          </button>
          <button
            onClick={() => setActiveTab('workers')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'workers'
                ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-400'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Operators & Crew ({workers.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'machines' ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncCMMS}
                disabled={syncing}
                className="text-xs h-8 gap-1.5"
                title="Pull equipment from CMMS Assets"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                Sync CMMS Assets
              </Button>
              <Button
                size="sm"
                onClick={() => handleOpenMachineDialog()}
                className="text-xs h-8 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="w-3.5 h-3.5" /> Add Machine Manually
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncHR}
                disabled={syncing}
                className="text-xs h-8 gap-1.5"
                title="Pull employees from HR Staff list"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                Sync HR Employees
              </Button>
              <Button
                size="sm"
                onClick={() => handleOpenWorkerDialog()}
                className="text-xs h-8 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="w-3.5 h-3.5" /> Add Worker Manually
              </Button>
            </>
          )}
        </div>
      </div>

      {/* MACHINES TABLE */}
      {activeTab === 'machines' && (
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground border-b text-[10px] uppercase font-semibold">
                <tr>
                  <th className="p-3 text-left">Code</th>
                  <th className="p-3 text-left">Machine Name</th>
                  <th className="p-3 text-left">Category</th>
                  <th className="p-3 text-left">Location</th>
                  <th className="p-3 text-right">Hourly Overhead</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {machines.map((machine) => (
                  <tr key={machine.id} className="hover:bg-muted/20">
                    <td className="p-3 font-mono font-medium text-foreground">{machine.code}</td>
                    <td className="p-3 font-semibold text-foreground">{machine.name}</td>
                    <td className="p-3 text-muted-foreground">{machine.category || '—'}</td>
                    <td className="p-3 text-muted-foreground">{machine.location || 'Shop Floor'}</td>
                    <td className="p-3 text-right font-mono font-medium">
                      ₹{machine.hourlyCost || 0}/hr
                    </td>
                    <td className="p-3 text-center">
                      {machine.status === 'Running' ? (
                        <Badge className="bg-emerald-600 text-white text-[10px] px-2 py-0.5 animate-pulse">
                          Running
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground text-[10px] px-2 py-0.5">
                          Idle
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenMachineDialog(machine)}
                          className="h-7 w-7 text-muted-foreground hover:text-blue-600"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteMachine(machine.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* WORKERS TABLE */}
      {activeTab === 'workers' && (
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground border-b text-[10px] uppercase font-semibold">
                <tr>
                  <th className="p-3 text-left">Code</th>
                  <th className="p-3 text-left">Worker / Employee Name</th>
                  <th className="p-3 text-left">Role / Designation</th>
                  <th className="p-3 text-left">Department</th>
                  <th className="p-3 text-left">Contact</th>
                  <th className="p-3 text-right">Default Hourly Rate</th>
                  <th className="p-3 text-center">Type</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {workers.map((worker) => (
                  <tr key={worker.id} className="hover:bg-muted/20">
                    <td className="p-3 font-mono font-medium text-foreground">
                      {worker.code || '—'}
                    </td>
                    <td className="p-3 font-semibold text-foreground">{worker.name}</td>
                    <td className="p-3 text-muted-foreground">{worker.role}</td>
                    <td className="p-3 text-muted-foreground">{worker.department || 'Production'}</td>
                    <td className="p-3 text-muted-foreground">{worker.contact || '—'}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-600">
                      ₹{worker.hourlyRate}/hr
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          worker.isContract
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                        }`}
                      >
                        {worker.isContract ? 'Contract' : 'Permanent'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenWorkerDialog(worker)}
                          className="h-7 w-7 text-muted-foreground hover:text-blue-600"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteWorker(worker.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* MACHINE MODAL */}
      <Dialog open={machineDialogOpen} onOpenChange={setMachineDialogOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleSaveMachine}>
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold">
                {editingMachineId ? 'Edit Machine Details' : 'Add New Machine Manually'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3.5 py-3 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Machine Name *</Label>
                <Input
                  required
                  value={mName}
                  onChange={(e) => setMName(e.target.value)}
                  placeholder="e.g. 5-Axis CNC Milling Center"
                  className="h-8 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Machine Code</Label>
                  <Input
                    value={mCode}
                    onChange={(e) => setMCode(e.target.value)}
                    placeholder="e.g. CNC-05"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <Input
                    value={mCategory}
                    onChange={(e) => setMCategory(e.target.value)}
                    placeholder="e.g. Milling"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Hourly Overhead Rate (₹)</Label>
                  <Input
                    type="number"
                    value={mCost}
                    onChange={(e) => setMCost(e.target.value)}
                    placeholder="250"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Floor Location</Label>
                  <Input
                    value={mLocation}
                    onChange={(e) => setMLocation(e.target.value)}
                    placeholder="e.g. Bay 2"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Notes / Specifications</Label>
                <Input
                  value={mNotes}
                  onChange={(e) => setMNotes(e.target.value)}
                  placeholder="e.g. Spindle 12,000 RPM, BT40"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMachineDialogOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" className="text-xs bg-blue-600 hover:bg-blue-700 text-white">
                Save Machine
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* WORKER MODAL */}
      <Dialog open={workerDialogOpen} onOpenChange={setWorkerDialogOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleSaveWorker}>
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold">
                {editingWorkerId ? 'Edit Worker Details' : 'Add Employee / Worker Manually'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3.5 py-3 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Worker / Employee Full Name *</Label>
                <Input
                  required
                  value={wName}
                  onChange={(e) => setWName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="h-8 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Employee ID / Code</Label>
                  <Input
                    value={wCode}
                    onChange={(e) => setWCode(e.target.value)}
                    placeholder="e.g. EMP-105"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Role / Designation *</Label>
                  <Input
                    required
                    value={wRole}
                    onChange={(e) => setWRole(e.target.value)}
                    placeholder="e.g. Lead CNC Operator"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Default Hourly Wage Rate (₹) *</Label>
                  <Input
                    required
                    type="number"
                    value={wRate}
                    onChange={(e) => setWRate(e.target.value)}
                    placeholder="150"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Department</Label>
                  <Input
                    value={wDept}
                    onChange={(e) => setWDept(e.target.value)}
                    placeholder="Production / Machining"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Phone / Mobile</Label>
                  <Input
                    value={wContact}
                    onChange={(e) => setWContact(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Employment Type</Label>
                  <select
                    value={wIsContract ? 'contract' : 'permanent'}
                    onChange={(e) => setWIsContract(e.target.value === 'contract')}
                    className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs"
                  >
                    <option value="permanent">Permanent Company Staff</option>
                    <option value="contract">Contract / Daily Wage Worker</option>
                  </select>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setWorkerDialogOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" className="text-xs bg-blue-600 hover:bg-blue-700 text-white">
                Save Worker
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
