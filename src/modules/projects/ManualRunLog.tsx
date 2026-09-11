// src/modules/projects/ManualRunLog.tsx
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Clock,
  Trash2,
  CheckCircle2,
  Calculator,
  IndianRupee,
  Users,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectService } from './projectService';
import { ProjectMachine, ProjectWorker, MachineRun, AssignedEmployee } from './types';

export default function ManualRunLog() {
  const [machines, setMachines] = useState<ProjectMachine[]>([]);
  const [workers, setWorkers] = useState<ProjectWorker[]>([]);
  const [loading, setLoading] = useState(true);

  // Form Fields
  const [projectName, setProjectName] = useState('');
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [manualHours, setManualHours] = useState('8.0');
  const [useDirectHours, setUseDirectHours] = useState(false);
  const [unitsProduced, setUnitsProduced] = useState('');
  const [notes, setNotes] = useState('');

  // Assigned crew
  const [assignedCrew, setAssignedCrew] = useState<
    { workerId: string; name: string; role: string; hourlyRate: number }[]
  >([]);

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const [m, w] = await Promise.all([
          projectService.getMachines(),
          projectService.getWorkers(),
        ]);
        setMachines(m);
        setWorkers(w);
        if (m.length > 0) setSelectedMachineId(m[0].id);
        if (w.length > 0) {
          setAssignedCrew([
            {
              workerId: w[0].id,
              name: w[0].name,
              role: w[0].role,
              hourlyRate: w[0].hourlyRate || 150,
            },
          ]);
        }
      } catch {
        toast.error('Failed to load masters');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Compute duration in hours
  const calculateDurationHours = (): number => {
    if (useDirectHours) {
      return Math.max(0, parseFloat(manualHours) || 0);
    }
    if (!startTime || !endTime) return 0;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    let startTotalMins = startH * 60 + startM;
    let endTotalMins = endH * 60 + endM;

    if (endTotalMins < startTotalMins) {
      // Crosses midnight
      endTotalMins += 24 * 60;
    }

    const diffHours = (endTotalMins - startTotalMins) / 60;
    return parseFloat(diffHours.toFixed(2));
  };

  const calculatedHours = calculateDurationHours();

  // Add an employee to crew
  const handleAddCrewMember = (workerId: string) => {
    const worker = workers.find((w) => w.id === workerId);
    if (!worker) return;
    if (assignedCrew.some((c) => c.workerId === worker.id)) {
      toast.info('Worker is already assigned to this run');
      return;
    }
    setAssignedCrew([
      ...assignedCrew,
      {
        workerId: worker.id,
        name: worker.name,
        role: worker.role,
        hourlyRate: worker.hourlyRate || 140,
      },
    ]);
  };

  // Remove crew member
  const handleRemoveCrewMember = (workerId: string) => {
    setAssignedCrew(assignedCrew.filter((c) => c.workerId !== workerId));
  };

  // Update hourly rate
  const handleUpdateCrewRate = (workerId: string, rate: number) => {
    setAssignedCrew(
      assignedCrew.map((c) => (c.workerId === workerId ? { ...c, hourlyRate: rate } : c))
    );
  };

  // Submit Run
  const handleSubmitRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
      toast.error('Please specify project name or work order reference');
      return;
    }
    if (!selectedMachineId) {
      toast.error('Please select a machine');
      return;
    }
    if (assignedCrew.length === 0) {
      toast.error('Please assign at least 1 employee to this machine run');
      return;
    }
    if (calculatedHours <= 0) {
      toast.error('Duration hours must be greater than 0');
      return;
    }

    const machine = machines.find((m) => m.id === selectedMachineId);
    const machineName = machine ? machine.name : 'Unknown Machine';
    const machineCode = machine ? machine.code : '';
    const machineRate = machine?.hourlyCost || 0;

    let sumWages = 0;
    const finalEmployees: AssignedEmployee[] = assignedCrew.map((c) => {
      const earned = Math.round(calculatedHours * c.hourlyRate);
      sumWages += earned;
      return {
        employeeId: c.workerId,
        name: c.name,
        role: c.role,
        hourlyRate: c.hourlyRate,
        wageEarned: earned,
      };
    });

    const machineCost = Math.round(calculatedHours * machineRate);
    const grandTotal = sumWages + machineCost;

    const startDateTime = `${date}T${startTime}:00`;
    const endDateTime = `${date}T${endTime}:00`;

    const newRun: MachineRun = {
      id: `run-${Date.now()}`,
      runNumber: `RUN-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      projectName: projectName.trim(),
      machineId: selectedMachineId,
      machineName,
      machineCode,
      status: 'Completed',
      startTime: startDateTime,
      endTime: endDateTime,
      durationHours: calculatedHours,
      assignedEmployees: finalEmployees,
      totalLaborCost: sumWages,
      machineHourlyRate: machineRate,
      machineCost,
      totalCost: grandTotal,
      unitsProduced: unitsProduced ? Number(unitsProduced) : undefined,
      notes: notes.trim() || undefined,
      createdAt: Date.now(),
    };

    try {
      await projectService.saveRun(newRun);
      toast.success(
        `Logged shift successfully! Total Labor Wages: ₹${sumWages.toLocaleString('en-IN')}`
      );
      // Reset form
      setProjectName('');
      setUnitsProduced('');
      setNotes('');
    } catch {
      toast.error('Failed to save project run');
    }
  };

  // Preview totals
  const totalLaborCostPreview = assignedCrew.reduce(
    (acc, c) => acc + Math.round(calculatedHours * c.hourlyRate),
    0
  );
  const selectedMachine = machines.find((m) => m.id === selectedMachineId);
  const machineCostPreview = Math.round(calculatedHours * (selectedMachine?.hourlyCost || 0));

  if (loading) {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground animate-pulse">
        Loading manual log form...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Manual Machine Shift & Wage Log</h2>
          <p className="text-xs text-muted-foreground">
            Record completed machine operations, assign workers, and calculate wages based on runtime
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmitRun} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left 2 Cols: Form Inputs */}
          <div className="md:col-span-2 space-y-5">
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="p-4 pb-2 border-b border-border/40">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600" /> 1. Project & Machine Details
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs">
                <div className="space-y-1.5">
                  <Label className="text-xs">Project / Work Order *</Label>
                  <Input
                    required
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. PO-773 Automotive Stamping Batch 2"
                    className="h-9 text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Select Machine *</Label>
                    <select
                      value={selectedMachineId}
                      onChange={(e) => setSelectedMachineId(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-xs"
                    >
                      {machines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Operation Date</Label>
                    <Input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Runtime Duration Card */}
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="p-4 pb-2 border-b border-border/40 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" /> 2. Machine Running Time
                </CardTitle>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setUseDirectHours(!useDirectHours)}
                    className="text-[11px] text-blue-600 hover:underline"
                  >
                    {useDirectHours ? 'Switch to Start/End Time' : 'Switch to Direct Hours'}
                  </button>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-3 text-xs">
                {useDirectHours ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Direct Machine Run Hours *</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={manualHours}
                        onChange={(e) => setManualHours(e.target.value)}
                        placeholder="e.g. 6.5"
                        className="h-9 text-xs font-mono w-40"
                      />
                      <span className="text-muted-foreground">Hours</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Start Time</Label>
                      <Input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">End Time</Label>
                      <Input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                  </div>
                )}

                <div className="p-2.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-900/50 flex items-center justify-between">
                  <span className="text-blue-900 dark:text-blue-300 font-medium">Computed Running Duration:</span>
                  <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-400">
                    {calculatedHours} Hours
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Assigned Employees & Wages Card */}
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="p-4 pb-2 border-b border-border/40 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-600" /> 3. Assigned Operators & Wages
                </CardTitle>

                {/* Add more workers dropdown */}
                <div className="flex items-center gap-1.5">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddCrewMember(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="h-7 px-2 rounded text-[11px] border border-input bg-background"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      + Assign Worker...
                    </option>
                    {workers
                      .filter((w) => !assignedCrew.some((c) => c.workerId === w.id))
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.role} - ₹{w.hourlyRate}/hr)
                        </option>
                      ))}
                  </select>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-3">
                {assignedCrew.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
                    No employees assigned yet. Select from the dropdown above to add operators.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {assignedCrew.map((crew) => {
                      const empWage = Math.round(calculatedHours * crew.hourlyRate);
                      return (
                        <div
                          key={crew.workerId}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border/60 bg-muted/20 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-foreground truncate">{crew.name}</p>
                            <p className="text-[10px] text-muted-foreground">{crew.role}</p>
                          </div>

                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground">₹</span>
                              <input
                                type="number"
                                value={crew.hourlyRate}
                                onChange={(e) =>
                                  handleUpdateCrewRate(crew.workerId, Number(e.target.value))
                                }
                                className="w-16 h-7 px-1.5 text-xs text-right rounded border border-input bg-background font-mono"
                                title="Hourly wage rate"
                              />
                              <span className="text-[10px] text-muted-foreground">/hr</span>
                            </div>

                            <div className="text-right min-w-[70px]">
                              <span className="text-[10px] text-muted-foreground block">Wage:</span>
                              <span className="font-mono font-bold text-emerald-600">
                                ₹{empWage.toLocaleString('en-IN')}
                              </span>
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveCrewMember(crew.workerId)}
                              className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Units Produced (Optional)</Label>
                    <Input
                      type="number"
                      value={unitsProduced}
                      onChange={(e) => setUnitsProduced(e.target.value)}
                      placeholder="e.g. 250"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Shift Notes</Label>
                    <Input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Regular shift, no downtime"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Col: Instant Calculation Preview Card */}
          <div className="space-y-5">
            <Card className="border-border/60 bg-gradient-to-b from-muted/30 to-background shadow-md sticky top-20">
              <CardHeader className="p-4 pb-3 border-b border-border/40">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5 text-emerald-600" /> Instant Wage Calculation
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs">
                {/* Math breakdown */}
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Machine Running Time:</span>
                    <span className="font-mono font-semibold text-foreground">
                      {calculatedHours} hrs
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Assigned Workers:</span>
                    <span className="font-semibold text-foreground">{assignedCrew.length}</span>
                  </div>

                  <div className="border-t border-border/50 pt-2 space-y-1.5">
                    {assignedCrew.map((c) => (
                      <div key={c.workerId} className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground truncate max-w-[120px]">
                          {c.name}:
                        </span>
                        <span className="font-mono">
                          {calculatedHours}h × ₹{c.hourlyRate} ={' '}
                          <span className="font-semibold text-emerald-600">
                            ₹{Math.round(calculatedHours * c.hourlyRate)}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-border/60 pt-2 flex justify-between items-center">
                    <span className="font-medium text-foreground">Total Employee Wages:</span>
                    <span className="font-mono text-base font-bold text-emerald-600">
                      ₹{totalLaborCostPreview.toLocaleString('en-IN')}
                    </span>
                  </div>

                  {selectedMachine && selectedMachine.hourlyCost ? (
                    <div className="flex justify-between items-center text-muted-foreground text-[11px]">
                      <span>Machine Overhead ({selectedMachine.code}):</span>
                      <span className="font-mono">
                        {calculatedHours}h × ₹{selectedMachine.hourlyCost} = ₹{machineCostPreview}
                      </span>
                    </div>
                  ) : null}

                  <div className="bg-slate-900 text-white dark:bg-slate-950 p-3 rounded-xl space-y-1 mt-3">
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                      Grand Total Job Cost
                    </div>
                    <div className="font-mono text-xl font-bold text-emerald-400">
                      ₹{(totalLaborCostPreview + machineCostPreview).toLocaleString('en-IN')}
                    </div>
                    {unitsProduced && Number(unitsProduced) > 0 && (
                      <div className="text-[10px] text-slate-400 border-t border-slate-800 pt-1 mt-1">
                        Cost per unit:{' '}
                        <span className="text-white font-mono font-semibold">
                          ₹
                          {(
                            (totalLaborCostPreview + machineCostPreview) /
                            Number(unitsProduced)
                          ).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm mt-2"
                >
                  <CheckCircle2 className="w-4 h-4" /> Save Shift & Wage Record
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
