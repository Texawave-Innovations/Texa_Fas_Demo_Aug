// src/modules/projects/types.ts

export type MachineStatus = 'Idle' | 'Running' | 'Under Maintenance';

export interface ProjectMachine {
  id: string;
  name: string;
  code: string;
  category?: string;
  status: MachineStatus;
  hourlyCost?: number; // Optional power/operating overhead per hour
  operatorCapacity?: number;
  location?: string;
  notes?: string;
  createdAt?: number;
}

export interface ProjectWorker {
  id: string;
  name: string;
  code?: string;
  role: string; // e.g. 'Lead Operator', 'Assistant Operator', 'Helper', 'Quality Tech'
  hourlyRate: number; // default wage rate per hour in INR (₹)
  contact?: string;
  department?: string;
  isContract?: boolean;
  createdAt?: number;
}

export interface AssignedEmployee {
  employeeId: string;
  name: string;
  role: string;
  hourlyRate: number; // rate for this specific run
  wageEarned: number; // (durationHours * hourlyRate)
}

export type RunStatus = 'Running' | 'Completed' | 'Cancelled';

export interface MachineRun {
  id: string;
  runNumber: string;
  projectName: string;
  machineId: string;
  machineName: string;
  machineCode?: string;
  status: RunStatus;
  startTime: string; // ISO string or datetime-local
  endTime?: string;  // ISO string or datetime-local
  durationHours: number; // Decimal hours e.g. 3.5 hrs
  assignedEmployees: AssignedEmployee[];
  totalLaborCost: number; // Sum of all employees' wageEarned
  machineHourlyRate?: number;
  machineCost?: number;   // durationHours * machineHourlyRate
  totalCost: number;      // totalLaborCost + (machineCost || 0)
  unitsProduced?: number;
  notes?: string;
  createdBy?: string;
  createdAt: number;
}

