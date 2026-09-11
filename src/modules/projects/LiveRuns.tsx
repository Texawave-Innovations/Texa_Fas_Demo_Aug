// src/modules/projects/LiveRuns.tsx
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Play,
  Square,
  Users,
  Timer,
  Clock,
  Plus,
  Activity,
  CheckCircle2,
  IndianRupee,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectService } from './projectService';
import { ProjectMachine, ProjectWorker, MachineRun, AssignedEmployee } from './types';

export default function LiveRuns() {
  const [machines, setMachines] = useState<ProjectMachine[]>([]);
  const [workers, setWorkers] = useState<ProjectWorker[]>([]);
  const [runs, setRuns] = useState<MachineRun[]>([]);
  const [loading, setLoading] = useState(true);

  // Real-time tick state (increments every second)
  const [ticker, setTicker] = useState(Date.now());

  // Start Run Dialog State
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [selectedMachineId, setSelectedMachineId] = useState<string>('');
  const [projectName, setProjectName] = useState('');
  const [assignedCrew, setAssignedCrew] = useState<
    { workerId: string; name: string; role: string; hourlyRate: number }[]
  >([]);

  // Quick Add Machine Dialog inside Start Run
  const [quickMachineOpen, setQuickMachineOpen] = useState(false);
  const [newMachineName, setNewMachineName] = useState('');
  const [newMachineCode, setNewMachineCode] = useState('');
  const [newMachineCost, setNewMachineCost] = useState('200');

  // Quick Add Worker Dialog inside Start Run
  const [quickWorkerOpen, setQuickWorkerOpen] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState('');
  const [newWorkerRole, setNewWorkerRole] = useState('Machine Operator');
  const [newWorkerRate, setNewWorkerRate] = useState('150');

  // Stop Run & Finalize Modal
  const [stopModalOpen, setStopModalOpen] = useState(false);
  const [activeRunToStop, setActiveRunToStop] = useState<MachineRun | null>(null);
  const [finalUnits, setFinalUnits] = useState('');
  const [finalNotes, setFinalNotes] = useState('');

  // Load all initial data
  const loadData = async () => {
    try {
      setLoading(true);
      const [m, w, r] = await Promise.all([
        projectService.getMachines(),
        projectService.getWorkers(),
        projectService.getRuns(),
      ]);
      setMachines(m);
      setWorkers(w);
      setRuns(r);
    } catch (err) {
      toast.error('Failed to load project operations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Set up 1-second interval for live runtime & wage counters
  useEffect(() => {
    const timer = setInterval(() => {
      setTicker(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Helper to format live duration
  const getDurationInfo = (startTimeStr: string) => {
    const startMs = new Date(startTimeStr).getTime();
    const elapsedSec = Math.max(0, Math.floor((ticker - startMs) / 1000));
    const hours = Math.floor(elapsedSec / 3600);
    const minutes = Math.floor((elapsedSec % 3600) / 60);
    const seconds = elapsedSec % 60;
    const decimalHours = elapsedSec / 3600;

    const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    return { elapsedSec, hours, minutes, seconds, decimalHours, formattedTime };
  };

  // Find running run for a machine
  const getRunningRunForMachine = (machineId: string) => {
    return runs.find((r) => r.machineId === machineId && r.status === 'Running');
  };

  // Open Start Run Dialog for a machine
  const handleOpenStartDialog = (machine: ProjectMachine) => {
    setSelectedMachineId(machine.id);
    setProjectName(`Project Order #${Math.floor(1000 + Math.random() * 9000)}`);
    // Pre-select 1 default worker if available
    if (workers.length > 0) {
      setAssignedCrew([
        {
          workerId: workers[0].id,
          name: workers[0].name,
          role: workers[0].role,
          hourlyRate: workers[0].hourlyRate || 150,
        },
      ]);
    } else {
      setAssignedCrew([]);
    }
    setStartDialogOpen(true);
  };

  // Toggle crew member assignment
  const toggleCrewMember = (worker: ProjectWorker) => {
    if (assignedCrew.some((c) => c.workerId === worker.id)) {
      setAssignedCrew(assignedCrew.filter((c) => c.workerId !== worker.id));
    } else {
      setAssignedCrew([
        ...assignedCrew,
        {
          workerId: worker.id,
          name: worker.name,
          role: worker.role,
          hourlyRate: worker.hourlyRate || 120,
        },
      ]);
    }
  };

  // Update specific crew member's rate
  const updateCrewRate = (workerId: string, newRate: number) => {
    setAssignedCrew(
      assignedCrew.map((c) => (c.workerId === workerId ? { ...c, hourlyRate: newRate } : c))
    );
  };

  // Handle Quick Add Machine
  const handleQuickAddMachine = async () => {
    if (!newMachineName.trim()) {
      toast.error('Enter machine name');
      return;
    }
    const machine = await projectService.saveMachine({
      id: '',
      name: newMachineName.trim(),
      code: newMachineCode.trim() || `M-${Date.now().toString().slice(-4)}`,
      status: 'Idle',
      hourlyCost: Number(newMachineCost) || 0,
      category: 'General',
    });
    setMachines((prev) => [machine, ...prev]);
    setSelectedMachineId(machine.id);
    setNewMachineName('');
    setNewMachineCode('');
    setQuickMachineOpen(false);
    toast.success(`Machine "${machine.name}" added successfully`);
  };

  // Handle Quick Add Worker
  const handleQuickAddWorker = async () => {
    if (!newWorkerName.trim()) {
      toast.error('Enter employee/worker name');
      return;
    }
    const worker = await projectService.saveWorker({
      id: '',
      name: newWorkerName.trim(),
      role: newWorkerRole.trim(),
      hourlyRate: Number(newWorkerRate) || 120,
      isContract: false,
    });
    setWorkers((prev) => [worker, ...prev]);
    // Automatically assign to current run
    setAssignedCrew((prev) => [
      ...prev,
      {
        workerId: worker.id,
        name: worker.name,
        role: worker.role,
        hourlyRate: worker.hourlyRate,
      },
    ]);
    setNewWorkerName('');
    setQuickWorkerOpen(false);
    toast.success(`Worker "${worker.name}" added & assigned`);
  };

  // Start Machine Run
  const handleStartRun = async () => {
    const machine = machines.find((m) => m.id === selectedMachineId);
    if (!machine) {
      toast.error('Please select a machine');
      return;
    }
    if (assignedCrew.length === 0) {
      toast.error('Please assign at least 1 employee/operator to this machine');
      return;
    }

    const newRun: MachineRun = {
      id: `run-${Date.now()}`,
      runNumber: `RUN-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      projectName: projectName.trim() || 'General Production',
      machineId: machine.id,
      machineName: machine.name,
      machineCode: machine.code,
      status: 'Running',
      startTime: new Date().toISOString(),
      durationHours: 0,
      assignedEmployees: assignedCrew.map((c) => ({
        employeeId: c.workerId,
        name: c.name,
        role: c.role,
        hourlyRate: c.hourlyRate,
        wageEarned: 0,
      })),
      totalLaborCost: 0,
      machineHourlyRate: machine.hourlyCost || 0,
      machineCost: 0,
      totalCost: 0,
      createdAt: Date.now(),
    };

    await projectService.saveRun(newRun);

    // Update local state
    setRuns((prev) => [newRun, ...prev]);
    setMachines((prev) =>
      prev.map((m) => (m.id === machine.id ? { ...m, status: 'Running' } : m))
    );

    setStartDialogOpen(false);
    toast.success(`Machine ${machine.name} started running with ${assignedCrew.length} employee(s)`);
  };

  // Open Stop Modal
  const handleOpenStopModal = (run: MachineRun) => {
    setActiveRunToStop(run);
    setFinalUnits('');
    setFinalNotes('');
    setStopModalOpen(true);
  };

  // Confirm Stop Run & Calculate Final Wages
  const handleConfirmStopRun = async () => {
    if (!activeRunToStop) return;

    const stopTime = new Date().toISOString();
    const duration = getDurationInfo(activeRunToStop.startTime);
    const finalHours = Math.max(0.01, parseFloat(duration.decimalHours.toFixed(2)));

    // Calculate wages for each employee
    let sumLaborWages = 0;
    const finalAssigned: AssignedEmployee[] = activeRunToStop.assignedEmployees.map((emp) => {
      const wage = Math.round(finalHours * emp.hourlyRate);
      sumLaborWages += wage;
      return {
        ...emp,
        wageEarned: wage,
      };
    });

    const machineRate = activeRunToStop.machineHourlyRate || 0;
    const finalMachineCost = Math.round(finalHours * machineRate);
    const grandTotalCost = sumLaborWages + finalMachineCost;

    const updatedRun: MachineRun = {
      ...activeRunToStop,
      status: 'Completed',
      endTime: stopTime,
      durationHours: finalHours,
      assignedEmployees: finalAssigned,
      totalLaborCost: sumLaborWages,
      machineCost: finalMachineCost,
      totalCost: grandTotalCost,
      unitsProduced: Number(finalUnits) || undefined,
      notes: finalNotes.trim() || undefined,
    };

    await projectService.saveRun(updatedRun);

    // Update state
    setRuns((prev) => prev.map((r) => (r.id === updatedRun.id ? updatedRun : r)));
    setMachines((prev) =>
      prev.map((m) => (m.id === updatedRun.machineId ? { ...m, status: 'Idle' } : m))
    );

    setStopModalOpen(false);
    setActiveRunToStop(null);
    toast.success(
      `Run completed! Duration: ${finalHours} hrs. Total Labor Wages: ₹${sumLaborWages.toLocaleString('en-IN')}`
    );
  };

  // Quick statistics
  const runningMachinesCount = machines.filter((m) => m.status === 'Running').length;
  const activeRuns = runs.filter((r) => r.status === 'Running');
  const activeWorkersCount = activeRuns.reduce(
    (acc, r) => acc + (r.assignedEmployees?.length || 0),
    0
  );
  const currentBurnRatePerHour = activeRuns.reduce((acc, r) => {
    const laborRate = r.assignedEmployees.reduce((sum, e) => sum + e.hourlyRate, 0);
    return acc + laborRate;
  }, 0);

  if (loading) {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground animate-pulse">
        Loading machine floor operations...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Top Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <Card className="border-border/60 bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-950/20 dark:to-slate-900 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                Machines Running
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-foreground">{runningMachinesCount}</span>
                <span className="text-xs text-muted-foreground">of {machines.length} active</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 flex items-center justify-center">
              <Activity className="h-5 w-5 animate-pulse" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-gradient-to-br from-blue-50/50 to-white dark:from-blue-950/20 dark:to-slate-900 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                Assigned Operators
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-foreground">{activeWorkersCount}</span>
                <span className="text-xs text-muted-foreground">employees active</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-gradient-to-br from-amber-50/50 to-white dark:from-amber-950/20 dark:to-slate-900 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                Live Labor Rate
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold text-foreground">
                  ₹{currentBurnRatePerHour.toLocaleString('en-IN')}
                </span>
                <span className="text-xs text-muted-foreground">/ hr</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 flex items-center justify-center">
              <IndianRupee className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-gradient-to-br from-purple-50/50 to-white dark:from-purple-950/20 dark:to-slate-900 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-purple-700 dark:text-purple-400 uppercase tracking-wider">
                Total Runs Logged
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-foreground">{runs.length}</span>
                <span className="text-xs text-muted-foreground">sessions</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 flex items-center justify-center">
              <Layers className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Machine Grid Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">Floor Machines & Real-Time Tracking</h2>
          <p className="text-xs text-muted-foreground">
            View live running time, assigned employees, and calculating wages per machine
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setQuickMachineOpen(true)}
            className="text-xs h-8 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Add Machine
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setQuickWorkerOpen(true)}
            className="text-xs h-8 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Add Employee / Worker
          </Button>
        </div>
      </div>

      {/* Machine Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {machines.map((machine) => {
          const runningRun = getRunningRunForMachine(machine.id);
          const isRunning = machine.status === 'Running' && runningRun;
          const duration = isRunning ? getDurationInfo(runningRun.startTime) : null;

          // Compute live wages accumulated so far
          let liveTotalLaborWage = 0;
          if (isRunning && duration) {
            liveTotalLaborWage = runningRun.assignedEmployees.reduce((acc, emp) => {
              return acc + Math.round(duration.decimalHours * emp.hourlyRate);
            }, 0);
          }

          return (
            <Card
              key={machine.id}
              className={`overflow-hidden transition-all duration-200 border ${
                isRunning
                  ? 'border-emerald-500/50 bg-gradient-to-b from-emerald-50/20 via-white to-white dark:from-emerald-950/20 dark:to-slate-900 shadow-md ring-1 ring-emerald-500/20'
                  : 'border-border/70 hover:border-border shadow-sm'
              }`}
            >
              <CardHeader className="p-4 pb-3 border-b border-border/40 bg-muted/20">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
                        {machine.code}
                      </span>
                      {isRunning ? (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1 text-[10px] px-2 py-0.5 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
                          RUNNING
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground text-[10px] px-2 py-0.5">
                          IDLE
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-sm font-bold text-foreground mt-1.5 truncate" title={machine.name}>
                      {machine.name}
                    </CardTitle>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-[11px] text-muted-foreground block">Overhead</span>
                    <span className="text-xs font-semibold text-foreground">
                      ₹{machine.hourlyCost || 0}/hr
                    </span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-4">
                {/* Status-specific body */}
                {isRunning ? (
                  <div className="space-y-3.5">
                    {/* Project & Run Info */}
                    <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-200/50 dark:border-emerald-900/50">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-emerald-900 dark:text-emerald-300 truncate">
                          {runningRun.projectName}
                        </span>
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono">
                          {runningRun.runNumber}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3 text-emerald-600" />
                        Started at: {new Date(runningRun.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    {/* Live Duration & Wage Display */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-900 text-white dark:bg-slate-950 p-3 rounded-xl shadow-inner">
                      <div>
                        <div className="text-[10px] uppercase text-slate-400 font-medium flex items-center gap-1">
                          <Timer className="w-3 h-3 text-emerald-400" /> Running Time
                        </div>
                        <div className="font-mono text-lg font-bold tracking-wider text-emerald-400 mt-0.5">
                          {duration?.formattedTime}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          ({duration?.decimalHours.toFixed(2)} hrs)
                        </div>
                      </div>

                      <div className="border-l border-slate-700/60 pl-3">
                        <div className="text-[10px] uppercase text-slate-400 font-medium flex items-center gap-1">
                          <IndianRupee className="w-3 h-3 text-blue-400" /> Total Wages
                        </div>
                        <div className="font-mono text-lg font-bold text-white mt-0.5">
                          ₹{liveTotalLaborWage.toLocaleString('en-IN')}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {runningRun.assignedEmployees.length} worker(s)
                        </div>
                      </div>
                    </div>

                    {/* Assigned Employees List */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> Assigned Operators ({runningRun.assignedEmployees.length})
                        </span>
                        <span>Wage Earned</span>
                      </div>
                      <div className="space-y-1 max-h-28 overflow-y-auto pr-0.5">
                        {runningRun.assignedEmployees.map((emp) => {
                          const empWage = duration
                            ? Math.round(duration.decimalHours * emp.hourlyRate)
                            : 0;
                          return (
                            <div
                              key={emp.employeeId}
                              className="flex items-center justify-between p-1.5 rounded bg-muted/40 text-xs border border-border/30"
                            >
                              <div>
                                <span className="font-medium text-foreground">{emp.name}</span>
                                <span className="text-[10px] text-muted-foreground ml-1.5">
                                  ({emp.role} • ₹{emp.hourlyRate}/hr)
                                </span>
                              </div>
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400 font-mono">
                                ₹{empWage}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Action Button: Stop */}
                    <Button
                      onClick={() => handleOpenStopModal(runningRun)}
                      variant="destructive"
                      className="w-full h-9 gap-1.5 text-xs font-semibold shadow-sm bg-rose-600 hover:bg-rose-700"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" /> Stop & Finalize Wage
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Machine Idle Info */}
                    <div className="p-3 rounded-lg bg-muted/40 border border-border/40 text-xs space-y-1.5">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Location:</span>
                        <span className="font-medium text-foreground">{machine.location || 'Shop Floor'}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Category:</span>
                        <span className="font-medium text-foreground">{machine.category || 'Machining'}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Status:</span>
                        <span className="font-medium text-slate-600 dark:text-slate-300">Ready to operate</span>
                      </div>
                    </div>

                    <div className="text-center py-1">
                      <p className="text-[11px] text-muted-foreground">
                        Assign team operators and start machine to begin live time & wage tracking
                      </p>
                    </div>

                    {/* Action Button: Start */}
                    <Button
                      onClick={() => handleOpenStartDialog(machine)}
                      className="w-full h-9 gap-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" /> Start Machine Operation
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* START RUN DIALOG */}
      <Dialog open={startDialogOpen} onOpenChange={setStartDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Play className="w-4 h-4 text-blue-600 fill-current" /> Start Machine & Assign Crew
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Project / Job Name */}
            <div className="space-y-1.5">
              <Label className="text-xs">Project / Work Order Reference *</Label>
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. PO-892 Engine Mount Stamping"
                className="h-8 text-xs"
              />
            </div>

            {/* Selected Machine info */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Selected Machine *</Label>
                <button
                  type="button"
                  onClick={() => setQuickMachineOpen(true)}
                  className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> Add New
                </button>
              </div>
              <select
                value={selectedMachineId}
                onChange={(e) => setSelectedMachineId(e.target.value)}
                className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs"
              >
                {machines.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.status === 'Running'}>
                    {m.name} ({m.code}) {m.status === 'Running' ? '— (Currently Running)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Assign Employees */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">
                  Assign Employees & Operators ({assignedCrew.length} selected) *
                </Label>
                <button
                  type="button"
                  onClick={() => setQuickWorkerOpen(true)}
                  className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> Add Worker
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1.5 border rounded-lg p-2 bg-muted/20">
                {workers.map((worker) => {
                  const isAssigned = assignedCrew.some((c) => c.workerId === worker.id);
                  const crewItem = assignedCrew.find((c) => c.workerId === worker.id);

                  return (
                    <div
                      key={worker.id}
                      className={`p-2 rounded-md border transition-colors ${
                        isAssigned
                          ? 'border-blue-500/60 bg-blue-50/50 dark:bg-blue-950/30'
                          : 'border-border/40 hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={isAssigned}
                            onChange={() => toggleCrewMember(worker)}
                            className="rounded border-input text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                          />
                          <div className="truncate text-xs">
                            <span className="font-medium text-foreground">{worker.name}</span>
                            <span className="text-[10px] text-muted-foreground ml-1.5">
                              ({worker.role})
                            </span>
                          </div>
                        </label>

                        {/* Editable rate when selected */}
                        {isAssigned && crewItem && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-[10px] text-muted-foreground">₹</span>
                            <input
                              type="number"
                              value={crewItem.hourlyRate}
                              onChange={(e) => updateCrewRate(worker.id, Number(e.target.value))}
                              className="w-16 h-6 px-1.5 text-xs text-right rounded border border-input bg-background font-mono"
                              title="Hourly wage rate"
                            />
                            <span className="text-[10px] text-muted-foreground">/hr</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Employee wages will calculate as: <span className="font-semibold text-foreground">Running Hours × Hourly Rate</span>
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setStartDialogOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={handleStartRun} className="text-xs bg-blue-600 hover:bg-blue-700 text-white">
              Start Machine Running
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* STOP RUN & CALCULATION MODAL */}
      <Dialog open={stopModalOpen} onOpenChange={setStopModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-rose-600">
              <Square className="w-4 h-4 fill-current" /> Stop Machine & Calculate Wages
            </DialogTitle>
          </DialogHeader>

          {activeRunToStop && (() => {
            const duration = getDurationInfo(activeRunToStop.startTime);
            const hoursDecimal = Math.max(0.01, parseFloat(duration.decimalHours.toFixed(2)));
            let totalWages = 0;

            return (
              <div className="space-y-4 py-2 text-xs">
                {/* Summary banner */}
                <div className="bg-slate-900 text-white p-3 rounded-xl flex items-center justify-between shadow-inner">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Total Run Time</span>
                    <span className="text-lg font-bold font-mono text-emerald-400">
                      {duration.formattedTime}
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      ({hoursDecimal} decimal hrs)
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block uppercase">Machine</span>
                    <span className="font-semibold text-slate-200">{activeRunToStop.machineName}</span>
                    <span className="text-[10px] text-slate-400 block">{activeRunToStop.projectName}</span>
                  </div>
                </div>

                {/* Individual Employee Wage Calculation Breakdown */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-foreground">
                    Employee Wage Breakdown ({activeRunToStop.assignedEmployees.length} workers)
                  </Label>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/60 text-muted-foreground border-b text-[10px] uppercase">
                        <tr>
                          <th className="p-2 text-left">Worker</th>
                          <th className="p-2 text-right">Rate</th>
                          <th className="p-2 text-right">Hours</th>
                          <th className="p-2 text-right">Wage Payable</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {activeRunToStop.assignedEmployees.map((emp) => {
                          const earned = Math.round(hoursDecimal * emp.hourlyRate);
                          totalWages += earned;
                          return (
                            <tr key={emp.employeeId} className="hover:bg-muted/20">
                              <td className="p-2">
                                <div className="font-medium text-foreground">{emp.name}</div>
                                <div className="text-[10px] text-muted-foreground">{emp.role}</div>
                              </td>
                              <td className="p-2 text-right font-mono text-muted-foreground">
                                ₹{emp.hourlyRate}/hr
                              </td>
                              <td className="p-2 text-right font-mono">{hoursDecimal}</td>
                              <td className="p-2 text-right font-mono font-bold text-emerald-600">
                                ₹{earned.toLocaleString('en-IN')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-muted/30 font-semibold border-t">
                        <tr>
                          <td colSpan={3} className="p-2 text-right">Total Employee Wages:</td>
                          <td className="p-2 text-right font-mono text-emerald-700 text-sm">
                            ₹{totalWages.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Optional Production Units & Notes */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Units Produced (Optional)</Label>
                    <Input
                      type="number"
                      value={finalUnits}
                      onChange={(e) => setFinalUnits(e.target.value)}
                      placeholder="e.g. 150"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Run Notes / Batch</Label>
                    <Input
                      value={finalNotes}
                      onChange={(e) => setFinalNotes(e.target.value)}
                      placeholder="e.g. Shift 1 finished ok"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            );
          })()}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setStopModalOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmStopRun}
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Save & Log Wage Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QUICK ADD MACHINE MODAL */}
      <Dialog open={quickMachineOpen} onOpenChange={setQuickMachineOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Quick Add Machine</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs">Machine Name *</Label>
              <Input
                value={newMachineName}
                onChange={(e) => setNewMachineName(e.target.value)}
                placeholder="e.g. Automatic Surface Grinder"
                className="h-8 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Machine Code</Label>
                <Input
                  value={newMachineCode}
                  onChange={(e) => setNewMachineCode(e.target.value)}
                  placeholder="e.g. GRIND-01"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hourly Overhead (₹)</Label>
                <Input
                  type="number"
                  value={newMachineCost}
                  onChange={(e) => setNewMachineCost(e.target.value)}
                  placeholder="200"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleQuickAddMachine} className="text-xs w-full">
              Save Machine
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QUICK ADD WORKER MODAL */}
      <Dialog open={quickWorkerOpen} onOpenChange={setQuickWorkerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Quick Add Employee / Worker</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs">Employee / Worker Name *</Label>
              <Input
                value={newWorkerName}
                onChange={(e) => setNewWorkerName(e.target.value)}
                placeholder="e.g. Suresh Patel"
                className="h-8 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Role / Designation</Label>
                <Input
                  value={newWorkerRole}
                  onChange={(e) => setNewWorkerRole(e.target.value)}
                  placeholder="e.g. Operator"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hourly Wage Rate (₹) *</Label>
                <Input
                  type="number"
                  value={newWorkerRate}
                  onChange={(e) => setNewWorkerRate(e.target.value)}
                  placeholder="150"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleQuickAddWorker} className="text-xs w-full">
              Save Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
