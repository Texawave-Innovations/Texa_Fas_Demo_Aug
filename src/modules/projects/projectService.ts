// src/modules/projects/projectService.ts
import { getAllRecords, createRecord, updateRecord, deleteRecord } from '@/services/firebase';
import { ProjectMachine, ProjectWorker, MachineRun } from './types';
import { INITIAL_MACHINES, INITIAL_WORKERS, INITIAL_RUNS } from './seedData';

const LOCAL_KEY_MACHINES = 'erp_project_machines';
const LOCAL_KEY_WORKERS = 'erp_project_workers';
const LOCAL_KEY_RUNS = 'erp_project_runs';

export const projectService = {
  // MACHINES
  async getMachines(): Promise<ProjectMachine[]> {
    try {
      const records = await getAllRecords('projects/machines');
      if (Array.isArray(records) && records.length > 0) {
        return records as ProjectMachine[];
      }
    } catch {
      // fallback to localStorage
    }

    const local = localStorage.getItem(LOCAL_KEY_MACHINES);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }

    // Seed defaults
    localStorage.setItem(LOCAL_KEY_MACHINES, JSON.stringify(INITIAL_MACHINES));
    return INITIAL_MACHINES;
  },

  async saveMachine(machine: ProjectMachine): Promise<ProjectMachine> {
    const isNew = !machine.id;
    const finalMachine: ProjectMachine = {
      ...machine,
      id: machine.id || `m-${Date.now()}`,
      createdAt: machine.createdAt || Date.now(),
    };

    // Attempt Firebase
    try {
      if (isNew) {
        await createRecord('projects/machines', finalMachine);
      } else {
        await updateRecord('projects/machines', finalMachine.id, finalMachine);
      }
    } catch {}

    // Update localStorage cache
    const current = await this.getMachines();
    const index = current.findIndex((m) => m.id === finalMachine.id);
    let updated: ProjectMachine[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = finalMachine;
    } else {
      updated = [finalMachine, ...current];
    }
    localStorage.setItem(LOCAL_KEY_MACHINES, JSON.stringify(updated));
    return finalMachine;
  },

  async deleteMachine(id: string): Promise<void> {
    try {
      await deleteRecord('projects/machines', id);
    } catch {}
    const current = await this.getMachines();
    const updated = current.filter((m) => m.id !== id);
    localStorage.setItem(LOCAL_KEY_MACHINES, JSON.stringify(updated));
  },

  // WORKERS
  async getWorkers(): Promise<ProjectWorker[]> {
    try {
      const records = await getAllRecords('projects/workers');
      if (Array.isArray(records) && records.length > 0) {
        return records as ProjectWorker[];
      }
    } catch {}

    const local = localStorage.getItem(LOCAL_KEY_WORKERS);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }

    // Seed defaults
    localStorage.setItem(LOCAL_KEY_WORKERS, JSON.stringify(INITIAL_WORKERS));
    return INITIAL_WORKERS;
  },

  async saveWorker(worker: ProjectWorker): Promise<ProjectWorker> {
    const isNew = !worker.id;
    const finalWorker: ProjectWorker = {
      ...worker,
      id: worker.id || `w-${Date.now()}`,
      createdAt: worker.createdAt || Date.now(),
    };

    try {
      if (isNew) {
        await createRecord('projects/workers', finalWorker);
      } else {
        await updateRecord('projects/workers', finalWorker.id, finalWorker);
      }
    } catch {}

    const current = await this.getWorkers();
    const index = current.findIndex((w) => w.id === finalWorker.id);
    let updated: ProjectWorker[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = finalWorker;
    } else {
      updated = [finalWorker, ...current];
    }
    localStorage.setItem(LOCAL_KEY_WORKERS, JSON.stringify(updated));
    return finalWorker;
  },

  async deleteWorker(id: string): Promise<void> {
    try {
      await deleteRecord('projects/workers', id);
    } catch {}
    const current = await this.getWorkers();
    const updated = current.filter((w) => w.id !== id);
    localStorage.setItem(LOCAL_KEY_WORKERS, JSON.stringify(updated));
  },

  // RUNS / OPERATIONS
  async getRuns(): Promise<MachineRun[]> {
    try {
      const records = await getAllRecords('projects/runs');
      if (Array.isArray(records) && records.length > 0) {
        return (records as MachineRun[]).sort((a, b) => b.createdAt - a.createdAt);
      }
    } catch {}

    const local = localStorage.getItem(LOCAL_KEY_RUNS);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return (parsed as MachineRun[]).sort((a, b) => b.createdAt - a.createdAt);
        }
      } catch {}
    }

    // Seed defaults
    localStorage.setItem(LOCAL_KEY_RUNS, JSON.stringify(INITIAL_RUNS));
    return INITIAL_RUNS;
  },

  async saveRun(run: MachineRun): Promise<MachineRun> {
    const isNew = !run.id;
    const finalRun: MachineRun = {
      ...run,
      id: run.id || `run-${Date.now()}`,
      createdAt: run.createdAt || Date.now(),
    };

    try {
      if (isNew) {
        await createRecord('projects/runs', finalRun);
      } else {
        await updateRecord('projects/runs', finalRun.id, finalRun);
      }
    } catch {}

    const current = await this.getRuns();
    const index = current.findIndex((r) => r.id === finalRun.id);
    let updated: MachineRun[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = finalRun;
    } else {
      updated = [finalRun, ...current];
    }
    localStorage.setItem(LOCAL_KEY_RUNS, JSON.stringify(updated));

    // Also update machine status in machines list
    const machines = await this.getMachines();
    const mIdx = machines.findIndex((m) => m.id === finalRun.machineId);
    if (mIdx >= 0) {
      const targetStatus = finalRun.status === 'Running' ? 'Running' : 'Idle';
      if (machines[mIdx].status !== targetStatus) {
        machines[mIdx].status = targetStatus;
        await this.saveMachine(machines[mIdx]);
      }
    }

    return finalRun;
  },

  async deleteRun(id: string): Promise<void> {
    try {
      await deleteRecord('projects/runs', id);
    } catch {}
    const current = await this.getRuns();
    const updated = current.filter((r) => r.id !== id);
    localStorage.setItem(LOCAL_KEY_RUNS, JSON.stringify(updated));
  },

  // Pull existing CMMS Assets
  async importCMMSAssets(): Promise<number> {
    try {
      const assets = await getAllRecords('cmms/assets');
      if (Array.isArray(assets) && assets.length > 0) {
        const currentMachines = await this.getMachines();
        let addedCount = 0;
        for (const asset of assets as any[]) {
          if (!currentMachines.some((m) => m.name.toLowerCase() === asset.name?.toLowerCase())) {
            await this.saveMachine({
              id: `m-cmms-${asset.id || Date.now()}`,
              name: asset.name,
              code: asset.assetCode || 'MCH-' + Math.floor(Math.random() * 1000),
              category: asset.category || 'Production',
              status: asset.status === 'Operational' ? 'Idle' : 'Under Maintenance',
              location: asset.location || 'Plant Floor',
              hourlyCost: 200,
            });
            addedCount++;
          }
        }
        return addedCount;
      }
    } catch {}
    return 0;
  },

  // Pull existing HR Employees
  async importHREmployees(): Promise<number> {
    try {
      const emps = await getAllRecords('hr/employees');
      if (Array.isArray(emps) && emps.length > 0) {
        const currentWorkers = await this.getWorkers();
        let addedCount = 0;
        for (const emp of emps as any[]) {
          const empName = emp.name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
          if (empName && !currentWorkers.some((w) => w.name.toLowerCase() === empName.toLowerCase())) {
            // Estimate hourly rate from salary or default ₹120
            const salary = emp.monthlySalary || emp.salary?.grossMonthly || 25000;
            const computedRate = Math.max(75, Math.round(salary / (26 * 8)));

            await this.saveWorker({
              id: `w-hr-${emp.id || Date.now()}`,
              name: empName,
              code: emp.employeeId || emp.code || 'EMP-' + Math.floor(Math.random() * 1000),
              role: emp.designation || emp.role || 'Operator',
              hourlyRate: computedRate,
              department: emp.department || 'Production',
              contact: emp.phone || emp.mobile || '',
              isContract: false,
            });
            addedCount++;
          }
        }
        return addedCount;
      }
    } catch {}
    return 0;
  },
};

