// src/modules/documents/documentTypes.ts

export type FasModuleId = 'sales' | 'hr' | 'inventory_dispatch' | 'quality_production';

export interface FasSubTabConfig {
  id: string;
  label: string;
  collectionKey: string;
}

export interface FasModuleConfig {
  id: FasModuleId;
  label: string;
  iconName: string;
  description: string;
  tabs: FasSubTabConfig[];
}

export interface FasDocumentItem {
  id: string;
  code: string;
  title: string;
  party: string;
  date: string;
  isoDate: string;
  amount?: number | string;
  status: 'Draft' | 'Approved' | 'Paid' | 'Sent' | 'Completed' | 'Pending' | 'Active';
  category: string;
  moduleId: FasModuleId;
  subTabId: string;
  fileUrl?: string;
  details?: Record<string, any>;
}

export interface SelectedItemMap {
  [documentId: string]: FasDocumentItem;
}

export interface ExportProgressState {
  isExporting: boolean;
  total: number;
  current: number;
  currentName: string;
}

