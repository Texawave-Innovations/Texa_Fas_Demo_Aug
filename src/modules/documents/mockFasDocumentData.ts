// src/modules/documents/mockFasDocumentData.ts
import { FasDocumentItem, FasModuleConfig } from './documentTypes';

export const FAS_MODULES_CONFIG: FasModuleConfig[] = [
  {
    id: 'sales',
    label: 'Sales',
    iconName: 'ShoppingCart',
    description: 'Quotations, invoices, orders & delivery passes',
    tabs: [
      { id: 'quotations', label: 'Quotations', collectionKey: 'sales/quotations' },
      { id: 'orders', label: 'Orders', collectionKey: 'sales/orders' },
      { id: 'invoices', label: 'Invoices', collectionKey: 'sales/invoices' },
      { id: 'challan', label: 'DC (Delivery Challan)', collectionKey: 'sales/deliveryChallans' },
      { id: 'gatepass', label: 'Gate Passes (GP/NGP)', collectionKey: 'sales/gatePasses' },
    ],
  },
  {
    id: 'hr',
    label: 'HR & Payroll',
    iconName: 'Users',
    description: 'Employee KYC, attendance, payslips & records',
    tabs: [
      { id: 'payslips', label: 'Payslips', collectionKey: 'hr/payroll' },
      { id: 'attendance', label: 'Monthly Attendance', collectionKey: 'hr/attendance' },
      { id: 'documents', label: 'Employee KYC & Docs', collectionKey: 'hr/employees' },
      { id: 'leaves', label: 'Leave Requests', collectionKey: 'hr/leaves' },
      { id: 'bonus', label: 'Bonus & Holiday Sheets', collectionKey: 'hr/bonus' },
    ],
  },
  {
    id: 'inventory_dispatch',
    label: 'Inventory & Dispatch',
    iconName: 'Package',
    description: 'Stock statements, packing lists & dispatch advice',
    tabs: [
      { id: 'packing', label: 'Packing Lists', collectionKey: 'dispatch/packing' },
      { id: 'dispatch_notes', label: 'Dispatch Notes', collectionKey: 'dispatch/notes' },
      { id: 'finished_goods', label: 'Finished Goods Stock', collectionKey: 'inventory/fg' },
      { id: 'raw_materials', label: 'Raw Materials Registry', collectionKey: 'inventory/rm' },
    ],
  },
  {
    id: 'quality_production',
    label: 'Quality & Production',
    iconName: 'ClipboardCheck',
    description: 'Work orders, inspection reports & test certificates',
    tabs: [
      { id: 'work_orders', label: 'Work Orders (WO)', collectionKey: 'production/workOrders' },
      { id: 'inspections', label: 'Incoming Inspections', collectionKey: 'quality/inspections' },
      { id: 'quality_reports', label: 'Quality Test Reports', collectionKey: 'quality/reports' },
    ],
  },
];

export const INITIAL_DEMO_DOCUMENTS: FasDocumentItem[] = [];
