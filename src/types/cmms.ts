// src/types/cmms.ts
// Types for the CMMS (Computerized Maintenance Management System) module.
// Standalone from Production's Item Master — equipment/assets here are
// maintainable machines, not stock items. Everything lives under `cmms/`.

export type AssetStatus = 'Operational' | 'Down' | 'Under Maintenance' | 'Retired';
export type AssetCriticality = 'Low' | 'Medium' | 'High';

export interface Asset {
  id: string;
  assetCode: string;
  name: string;
  category: string;
  location: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  purchaseDate?: string;
  warrantyExpiry?: string;
  status: AssetStatus;
  criticality: AssetCriticality;
  meterReading?: number;
  meterUnit?: string; // e.g. "hours", "cycles", "km"
  manualUrl?: string;
  imageUrl?: string;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
}

export type WorkOrderType = 'Corrective' | 'Preventive' | 'Inspection' | 'Emergency';
export type WorkOrderPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type WorkOrderStatus = 'Open' | 'Assigned' | 'In Progress' | 'On Hold' | 'Completed' | 'Cancelled';

export interface WorkOrderPart {
  partId: string;
  partName: string;
  qty: number;
}

export interface WorkOrder {
  id: string;
  woNumber: string;
  assetId: string;
  assetName: string;
  title: string;
  description?: string;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  assignedTo?: string;
  requestedBy?: string;
  scheduledDate?: string;
  completedDate?: string;
  laborHours?: number;
  partsUsed: WorkOrderPart[];
  cost?: number;
  notes?: string;
  pmScheduleId?: string; // set when auto-generated from a PM schedule
  createdAt: number;
  updatedAt?: number;
}

export type PMTriggerType = 'Time' | 'Meter';

export interface PMSchedule {
  id: string;
  name: string;
  assetId: string;
  assetName: string;
  triggerType: PMTriggerType;
  frequencyDays?: number; // for Time trigger
  meterInterval?: number; // for Meter trigger
  lastServiceDate?: string;
  lastServiceMeter?: number;
  nextDueDate?: string;
  nextDueMeter?: number;
  taskChecklist: string[];
  assignedTo?: string;
  status: 'Active' | 'Paused';
  createdAt: number;
  updatedAt?: number;
}

export interface SparePart {
  id: string;
  partCode: string;
  partName: string;
  category: string;
  uom: string;
  stockQty: number;
  reorderPoint: number;
  unitCost?: number;
  location?: string;
  createdAt: number;
  updatedAt?: number;
}
