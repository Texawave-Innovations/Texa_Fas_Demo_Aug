// src/modules/projects/WageSummary.tsx
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Search,
  Download,
  Trash2,
  Eye,
  Clock,
  IndianRupee,
  Activity,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectService } from './projectService';
import { MachineRun, ProjectMachine, ProjectWorker } from './types';

export default function WageSummary() {
  const [runs, setRuns] = useState<MachineRun[]>([]);
  const [machines, setMachines] = useState<ProjectMachine[]>([]);
  const [workers, setWorkers] = useState<ProjectWorker[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedMachineFilter, setSelectedMachineFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'runs' | 'workers'>('runs');

  // Detail Modal
  const [selectedRun, setSelectedRun] = useState<MachineRun | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [r, m, w] = await Promise.all([
        projectService.getRuns(),
        projectService.getMachines(),
        projectService.getWorkers(),
      ]);
      setRuns(r);
      setMachines(m);
      setWorkers(w);
    } catch {
      toast.error('Failed to load summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDeleteRun = async (id: string) => {
    if (!confirm('Are you sure you want to delete this run record?')) return;
    try {
      await projectService.deleteRun(id);
      setRuns(runs.filter((r) => r.id !== id));
      toast.success('Run record deleted');
    } catch {
      toast.error('Failed to delete run');
    }
  };

  // Filtered runs
  const filteredRuns = runs.filter((r) => {
    const matchesSearch =
      r.projectName.toLowerCase().includes(search.toLowerCase()) ||
      r.machineName.toLowerCase().includes(search.toLowerCase()) ||
      r.runNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.assignedEmployees.some((e) => e.name.toLowerCase().includes(search.toLowerCase()));

    const matchesMachine =
      selectedMachineFilter === 'ALL' || r.machineId === selectedMachineFilter;

    return matchesSearch && matchesMachine;
  });

  // Calculate Metrics
  const totalHours = runs.reduce((acc, r) => acc + (r.durationHours || 0), 0);
  const totalLaborCost = runs.reduce((acc, r) => acc + (r.totalLaborCost || 0), 0);
  const completedRunsCount = runs.filter((r) => r.status === 'Completed').length;
  const avgHourlyLaborCost = totalHours > 0 ? Math.round(totalLaborCost / totalHours) : 0;

  // Aggregate by worker
  const workerAggregates: Record<
    string,
    { id: string; name: string; role: string; totalHours: number; totalWages: number; runCount: number }
  > = {};

  runs.forEach((run) => {
    run.assignedEmployees?.forEach((emp) => {
      if (!workerAggregates[emp.employeeId]) {
        workerAggregates[emp.employeeId] = {
          id: emp.employeeId,
          name: emp.name,
          role: emp.role,
          totalHours: 0,
          totalWages: 0,
          runCount: 0,
        };
      }
      workerAggregates[emp.employeeId].totalHours += run.durationHours || 0;
      workerAggregates[emp.employeeId].totalWages += emp.wageEarned || 0;
      workerAggregates[emp.employeeId].runCount += 1;
    });
  });

  const workerSummaryList = Object.values(workerAggregates).sort(
    (a, b) => b.totalWages - a.totalWages
  );

  // CSV Export
  const handleExportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';

    if (activeTab === 'runs') {
      csvContent += 'Run Number,Project,Machine,Status,Hours,Workers,Labor Wages,Machine Cost,Total Cost,Date\n';
      runs.forEach((r) => {
        const workerNames = r.assignedEmployees.map((e) => `${e.name} (₹${e.wageEarned})`).join('; ');
        csvContent += `"${r.runNumber}","${r.projectName}","${r.machineName}","${r.status}",${r.durationHours},"${workerNames}",${r.totalLaborCost},${r.machineCost || 0},${r.totalCost},"${new Date(r.startTime).toLocaleDateString()}"\n`;
      });
    } else {
      csvContent += 'Employee Name,Role,Operations Count,Total Machine Hours,Total Wages Earned (INR)\n';
      workerSummaryList.forEach((w) => {
        csvContent += `"${w.name}","${w.role}",${w.runCount},${w.totalHours.toFixed(2)},${w.totalWages}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      activeTab === 'runs' ? 'project_machine_runs.csv' : 'employee_wages_summary.csv'
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('CSV report exported successfully');
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground animate-pulse">
        Loading wage summary & analytics...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Top Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <Card className="border-border/60 bg-gradient-to-br from-blue-50/50 to-white dark:from-blue-950/20 dark:to-slate-900 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                Total Machine Runtime
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold text-foreground">
                  {totalHours.toFixed(1)}
                </span>
                <span className="text-xs text-muted-foreground">Hours</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-950/20 dark:to-slate-900 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                Total Wages Calculated
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold text-emerald-600">
                  ₹{totalLaborCost.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 flex items-center justify-center">
              <IndianRupee className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-gradient-to-br from-amber-50/50 to-white dark:from-amber-950/20 dark:to-slate-900 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                Avg. Labor Cost / Hr
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold text-foreground">
                  ₹{avgHourlyLaborCost}
                </span>
                <span className="text-xs text-muted-foreground">/ hr</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 flex items-center justify-center">
              <Activity className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-gradient-to-br from-purple-50/50 to-white dark:from-purple-950/20 dark:to-slate-900 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-purple-700 dark:text-purple-400 uppercase tracking-wider">
                Completed Runs
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold text-foreground">{completedRunsCount}</span>
                <span className="text-xs text-muted-foreground">of {runs.length} runs</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Switcher & Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <div className="flex bg-muted/60 p-1 rounded-lg border border-border/40 text-xs">
            <button
              onClick={() => setActiveTab('runs')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === 'runs'
                  ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-400'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All Machine Operations ({runs.length})
            </button>
            <button
              onClick={() => setActiveTab('workers')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === 'workers'
                  ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-400'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Employee Wage Payouts ({workerSummaryList.length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'runs' && (
            <select
              value={selectedMachineFilter}
              onChange={(e) => setSelectedMachineFilter(e.target.value)}
              className="h-8 px-2 text-xs rounded-md border border-input bg-background"
            >
              <option value="ALL">All Machines</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by project, worker..."
              className="h-8 pl-8 text-xs w-48 sm:w-60"
            />
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCSV}
            className="h-8 text-xs gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Tab 1: All Machine Operations Log */}
      {activeTab === 'runs' && (
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground border-b text-[10px] uppercase font-semibold">
                <tr>
                  <th className="p-3 text-left">Run / Ref</th>
                  <th className="p-3 text-left">Project</th>
                  <th className="p-3 text-left">Machine</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Runtime</th>
                  <th className="p-3 text-left">Assigned Operators</th>
                  <th className="p-3 text-right">Labor Wages</th>
                  <th className="p-3 text-right">Grand Total</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredRuns.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      No machine run records found.
                    </td>
                  </tr>
                ) : (
                  filteredRuns.map((run) => (
                    <tr key={run.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-mono font-medium text-foreground">
                        {run.runNumber}
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-foreground">{run.projectName}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5" />
                          {new Date(run.startTime).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-foreground">{run.machineName}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {run.machineCode}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        {run.status === 'Running' ? (
                          <Badge className="bg-emerald-600 text-white text-[10px] px-2 py-0.5 animate-pulse">
                            Running
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground text-[10px] px-2 py-0.5">
                            Completed
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono font-medium text-foreground">
                        {run.durationHours} hrs
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {run.assignedEmployees.map((emp) => (
                            <span
                              key={emp.employeeId}
                              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40"
                              title={`${emp.role} @ ₹${emp.hourlyRate}/hr`}
                            >
                              {emp.name} (₹{emp.wageEarned})
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-600">
                        ₹{run.totalLaborCost.toLocaleString('en-IN')}
                      </td>
                      <td className="p-3 text-right font-mono font-semibold text-foreground">
                        ₹{run.totalCost.toLocaleString('en-IN')}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedRun(run)}
                            className="h-7 w-7 text-muted-foreground hover:text-blue-600"
                            title="View Calculation Breakdown"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteRun(run.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                            title="Delete Run"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 2: Employee Wage Payout Aggregates */}
      {activeTab === 'workers' && (
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground border-b text-[10px] uppercase font-semibold">
                <tr>
                  <th className="p-3 text-left">Employee Name</th>
                  <th className="p-3 text-left">Designation / Role</th>
                  <th className="p-3 text-right">Machine Runs Participated</th>
                  <th className="p-3 text-right">Total Hours Worked</th>
                  <th className="p-3 text-right">Effective Average Rate</th>
                  <th className="p-3 text-right">Total Wages Earned (INR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {workerSummaryList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No employee wage records found.
                    </td>
                  </tr>
                ) : (
                  workerSummaryList.map((worker) => {
                    const avgRate =
                      worker.totalHours > 0
                        ? Math.round(worker.totalWages / worker.totalHours)
                        : 0;

                    return (
                      <tr key={worker.id} className="hover:bg-muted/20 transition-colors">
                        <td className="p-3 font-semibold text-foreground">
                          {worker.name}
                        </td>
                        <td className="p-3 text-muted-foreground">{worker.role}</td>
                        <td className="p-3 text-right font-mono">{worker.runCount}</td>
                        <td className="p-3 text-right font-mono font-medium text-foreground">
                          {worker.totalHours.toFixed(1)} hrs
                        </td>
                        <td className="p-3 text-right font-mono text-muted-foreground">
                          ₹{avgRate}/hr
                        </td>
                        <td className="p-3 text-right font-mono text-sm font-bold text-emerald-600">
                          ₹{worker.totalWages.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot className="bg-muted/30 font-semibold border-t">
                <tr>
                  <td colSpan={3} className="p-3 text-right">Total Aggregate Payout:</td>
                  <td className="p-3 text-right font-mono text-foreground">
                    {workerSummaryList.reduce((acc, w) => acc + w.totalHours, 0).toFixed(1)} hrs
                  </td>
                  <td></td>
                  <td className="p-3 text-right font-mono text-base font-bold text-emerald-700">
                    ₹
                    {workerSummaryList
                      .reduce((acc, w) => acc + w.totalWages, 0)
                      .toLocaleString('en-IN')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* DETAIL VIEW MODAL */}
      <Dialog open={!!selectedRun} onOpenChange={() => setSelectedRun(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center justify-between">
              <span>{selectedRun?.runNumber} Calculation Breakdown</span>
              <Badge variant="outline" className="text-[10px]">
                {selectedRun?.status}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {selectedRun && (
            <div className="space-y-4 py-2 text-xs">
              <div className="bg-muted/30 p-3 rounded-lg border space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Project:</span>
                  <span className="font-semibold text-foreground">{selectedRun.projectName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Machine:</span>
                  <span className="font-semibold text-foreground">{selectedRun.machineName} ({selectedRun.machineCode})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration:</span>
                  <span className="font-mono font-semibold text-blue-600">{selectedRun.durationHours} Hours</span>
                </div>
                {selectedRun.unitsProduced && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Units Produced:</span>
                    <span className="font-mono font-semibold text-foreground">{selectedRun.unitsProduced} pcs</span>
                  </div>
                )}
              </div>

              <div>
                <p className="font-semibold text-foreground mb-1.5">Employee Wages Breakdown:</p>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60 text-muted-foreground border-b text-[10px] uppercase">
                      <tr>
                        <th className="p-2 text-left">Worker</th>
                        <th className="p-2 text-right">Hourly Rate</th>
                        <th className="p-2 text-right">Runtime</th>
                        <th className="p-2 text-right">Wage Earned</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {selectedRun.assignedEmployees.map((emp) => (
                        <tr key={emp.employeeId}>
                          <td className="p-2">
                            <div className="font-medium text-foreground">{emp.name}</div>
                            <div className="text-[10px] text-muted-foreground">{emp.role}</div>
                          </td>
                          <td className="p-2 text-right font-mono">₹{emp.hourlyRate}/hr</td>
                          <td className="p-2 text-right font-mono">{selectedRun.durationHours} hrs</td>
                          <td className="p-2 text-right font-mono font-bold text-emerald-600">
                            ₹{emp.wageEarned.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/30 font-semibold border-t">
                      <tr>
                        <td colSpan={3} className="p-2 text-right">Total Labor Wages:</td>
                        <td className="p-2 text-right font-mono text-emerald-700">
                          ₹{selectedRun.totalLaborCost.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {selectedRun.machineCost ? (
                <div className="flex justify-between items-center p-2 rounded bg-muted/20 border text-muted-foreground text-xs">
                  <span>Machine Overhead Cost:</span>
                  <span className="font-mono font-semibold text-foreground">
                    ₹{selectedRun.machineCost.toLocaleString('en-IN')}
                  </span>
                </div>
              ) : null}

              <div className="bg-slate-900 text-white p-3 rounded-xl flex items-center justify-between">
                <span className="text-xs text-slate-300">Grand Total Operation Cost:</span>
                <span className="font-mono text-base font-bold text-emerald-400">
                  ₹{selectedRun.totalCost.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
