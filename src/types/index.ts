export type UserRole = 'admin' | 'sales' | 'hr' | 'accountant' | 'manager' | 'quality' | 'production' | 'Production' | 'maintenance';

export interface User {
  username: string;
  role: UserRole;
  name: string;
}

export interface Address {
  id: string;
  type: 'billing' | 'shipping';
  label: string;
  street: string;
  area?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault?: boolean;
}

export interface Customer {
  id: string;
  customerCode: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  gst?: string;
  pan?: string;
  cin?: string;
  addresses: Address[];
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  bankBranch?: string;
  bankDetails?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface Product {
  id: string;
  productCode: string;
  name: string;
  description: string;
  sku: string;
  hsn: string;
  uom: string;
  unitPrice: number;
  taxPercent: number;
  stockQty: number;
  grossWeight?: number;
  netWeight?: number;
  packageQty?: number;
  linkedPartCode?: string;
  createdAt: number;
}

export interface Lead {
  id: string;
  customerId: string;
  customerName: string;
  source: string;
  status: 'New' | 'Contacted' | 'Qualified' | 'Lost' | 'Converted';
  expectedValue: number;
  expectedCloseDate: string;
  assignedTo: string;
  notes: string;
  createdAt: number;
}

export interface QuotationLineItem {
  sNo: number;
  productCode: string;
  productDescription: string;
  uom: string;
  unitRate: number;
  qty: number;
  requiredDate?: string;
  hsnCode: string;
  amount: number;
  discount: number;
  netAmount: number;
}

export interface Quotation {
  id: string;
  quoteNumber: string;
  quoteDate: string;
  versionNo?: string;
  versionDate?: string;
  customerId: string;
  customerName: string;
  customerAddress: string;
  customerGST: string;
  customerPAN: string;
  quoteValidity: string;
  modeOfDispatch: string;
  deliveryTerm: string;
  paymentTerms: string;
  ourRef?: string;
  yourRef?: string;
  lineItems: QuotationLineItem[];
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  taxTotal: number;
  grandTotal: number;
  remarks?: string;
  comments?: string;
  attachments: string[];
  status: 'Draft' | 'Approved' | 'Sent' | 'Accepted' | 'Rejected';
  createdAt: number;
}

export interface OrderAcknowledgement {
  id: string;
  soNumber: string;
  soDate: string;
  version?: string;
  site?: string;
  quotationId?: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  shipToAddress: string;
  billToAddress: string;
  customerPONo?: string;
  customerPODate?: string;
  gstNoBillTo: string;
  gstNoShipTo: string;
  deliveryTerms: string;
  paymentTerms: string;
  deliveryMode: string;
  lineItems: OrderLineItem[];
  total: number;
  grandTotal: number;
  comments?: string;
  creditTerms?: string;
  preparedBy?: string;
  approvedBy?: string;
  status: 'Draft' | 'Approved' | 'Confirmed' | 'In Production' | 'QC' | 'Ready' | 'Delivered' | 'Cancelled';
  qcStatus?: 'pending' | 'in-progress' | 'completed' | 'hold';
  productionStatus?: 'pending' | 'in-progress' | 'completed';
  invoiceStatus?: 'not_generated' | 'generated' | 'paid';
  createdAt: number;
}

export interface OrderLineItem {
  sNo: number;
  itemCode: string;
  itemDescription: string;
  requiredDate?: string;
  uom: string;
  salesQty: number;
  rate: number;
  amount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  orderAcknowledgementId: string;
  customerId: string;
  customerName: string;
  customerGST: string;
  customerPAN: string;
  billingAddress: string;
  shippingAddress: string;
  customerPONo?: string;
  customerPODate?: string;
  transportationMode: string;
  vehicleNo?: string;
  dateTimeOfSupply: string;
  placeOfSupply: string;
  transporterName?: string;
  paymentTerms: string;
  eWayBillNo?: string;
  eWayBillDate?: string;
  taxIsReverseCharge: boolean;
  lineItems: InvoiceLineItem[];
  basicAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  totalInWords: string;
  totalTaxInWords: string;
  remarks?: string;
  paymentStatus: 'Draft' | 'Final' | 'Unpaid' | 'Partial' | 'Paid';
  paidAmount: number;
  dueDate: string;
  createdAt: number;
}

export interface InvoiceLineItem {
  sNo: number;
  partCode: string;
  description: string;
  hsnCode: string;
  qty: number;
  uom: string;
  rate: number;
  amount: number;
  discount: number;
  taxableValue: number;
  cgstPercent: number;
  cgstAmount: number;
  sgstPercent: number;
  sgstAmount: number;
  igstPercent: number;
  igstAmount: number;
  total: number;
}

export interface DashboardStats {
  totalCustomers: number;
  totalProducts: number;
  totalSalesThisMonth: number;
  pendingQuotations: number;
  totalLeads: number;
  convertedLeads: number;
  totalEmployees: number;
  presentToday: number;
  pendingLeaves: number;
}

export interface SalaryStructure {
  basic: number;
  hra: number;
  da: number;
  conveyance: number;
  medical: number;
  specialAllowance: number;
  additionalSpecialAllowance: number;
  otherAllowance: number;
  grossMonthly: number;
  ctcLPA: number;
}

// Static Department Types
export type DepartmentType = 'Staff' | 'Workers' | 'Others';

export const DEPARTMENTS: DepartmentType[] = ['Staff', 'Workers', 'Others'];

export interface Employee {
  id: string;
  employeeId: string;
  name: string;
  phone: string;
  email: string;
  department: string;
  role: string;
  joiningDate: string;
  salary: SalaryStructure;
  status: 'active' | 'inactive' | 'resigned' | 'terminated';

  // Personal Info
  gender?: 'Male' | 'Female' | 'Other';
  dateOfBirth?: string;
  bloodGroup?: string;
  maritalStatus?: string;
  religion?: string;
  nationality?: string;

  // Office
  officeType?: string;
  shift?: string;
  reportingTo?: string;

  // Experience
  experienceYears?: string;
  previousCompany?: string;
  previousRole?: string;

  // Family Details
  fatherName?: string;
  fatherPhone?: string;
  motherName?: string;
  motherPhone?: string;
  spouseName?: string;
  spousePhone?: string;
  emergencyContact?: string;
  emergencyContactName?: string;

  // Documents
  profilePhoto?: string;
  resumeUrl?: string;
  aadhaarUrl?: string;
  panUrl?: string;
  bankStatementUrl?: string;
  tenthCertificateUrl?: string;
  twelfthCertificateUrl?: string;
  graduationCertificateUrl?: string;
  postGraduationCertificateUrl?: string;

  // IDs
  aadhaarNumber?: string;
  panNumber?: string;
  esiNumber?: string;
  pfNumber?: string;

  // Bank
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  bankBranch?: string;
  bankDetails?: string;

  // Address
  presentAddress?: {
    street: string;
    area: string;
    city: string;
    state: string;
    pincode: string;
  };
  permanentAddress?: {
    street: string;
    area: string;
    city: string;
    state: string;
    pincode: string;
    sameAsPresent?: boolean;
  };

  // Bonus
  bonus?: {
    amount: number;
    type: string;
    month: string;
    status: 'Pending' | 'Approved' | 'Paid';
  }[];

  createdAt?: number;
  updatedAt?: number;
}

export interface Attendance {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  status: 'Present' | 'Absent' | 'Half Day' | 'Leave' | 'Holiday' | 'Week Off';
  checkIn?: string;
  checkOut?: string;
  totalHours?: number;
  overtimeHours?: number;
  lateArrival?: boolean;
  earlyExit?: boolean;
  notes: string;
  createdAt: number;
}

export interface Leave {
  id: string;
  employeeId: string;
  employeeName: string;
  department?: string;
  startDate: string;
  endDate: string;
  totalDays?: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  appliedAt: number;
  processedBy?: string;
  processedAt?: number;
}

export interface Shift {
  id: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  assignedEmployees: string[];
  createdAt: number;
}

export interface ProductionBatch {
  id: string;
  batchId: string;
  partName: string;
  partNo: string;
  machineNo: string;
  dieNo: string;
  productionQty: number;
  productionDate: string;
  operatorName: string;
  qcStatus: 'pending' | 'in-progress' | 'completed';
  createdAt: number;
}

export interface QualityInspection {
  id: string;
  batchId: string;
  partName: string;
  partNo: string;
  machineNo: string;
  dieNo: string;
  productionQty: number;
  productionDate: string;
  operatorName: string;
  inspectorName: string;
  inspectionDate: string;
  okQty: number;
  notOkQty: number;
  rejectionReason: string;
  remarks: string;
  images: string[];
  status: 'pending' | 'in-progress' | 'completed';
  tagStatus: 'Before Inspection' | 'After Inspection';
  salesOrderNo?: string;
  salesOrderDate?: string;
  createdAt: number;
}

export interface QualityTag {
  id: string;
  tagId: string;
  batchId: string;
  inspectionId: string;
  tagStatus: 'Before Inspection' | 'After Inspection';
  timestamp: number;
}

export interface FGStock {
  id: string;
  batchId: string;
  partName: string;
  partNo: string;
  quantity: number;
  qc: 'ok' | 'hold';
  createdAt: number;
}

export interface ScrapStock {
  id: string;
  batchId: string;
  partName: string;
  partNo: string;
  quantity: number;
  reason: string;
  createdAt: number;
}

export interface MasterData {
  sales: SalesMaster;
  hr: HRMaster;
  quality: QualityMaster;
  production: ProductionMaster;
  stores: StoresMaster;
  finance: FinanceMaster;
}

export interface SalesMaster {
  paymentTerms: string[];
  deliveryTerms: string[];
  dispatchModes: string[];
  gstList: string[];
}

export interface HRMaster {
  departments: string[];
  designations: string[];
  leaveTypes: string[];
  shifts: string[];
  holidayList: string[];
  employeeStatus: string[];
}

export interface QualityMaster {
  rejectionReasons: string[];
  inspectionTypes: string[];
  tagStatus: string[];
}

export interface ProductionMaster {
  machines: Record<string, { name: string }>;
  dies: Record<string, { name: string }>;
  compoundCodes: string[];
  rejectionCategories: string[];
  productionStages: string[];
  parts: Record<string, Part>;
}

export interface StoresMaster {
  rawMaterialCategories: string[];
  uomList: string[];
  stockLocations: string[];
  suppliers: Record<string, Supplier>;
}

export interface FinanceMaster {
  expenseTypes: string[];
  paymentModes: string[];
}

export interface Part {
  name: string;
  partNumber: string;
  inputWeight: number;
  cycleTime: number;
  cavity: number;
}

export interface Supplier {
  name: string;
  phone: string;
  email?: string;
  address?: string;
}

export interface ProductionJob {
  id: string;
  orderId: string;
  partId: string;
  machineId: string;
  operator: string;
  status: 'not_started' | 'running' | 'completed';
  startTime?: string;
  endTime?: string;
  createdAt: number;
}

export interface RawMaterial {
  id: string;
  compoundCode: string;
  qty: number;
  shelfLife: string;
  batchNumber: string;
  location: string;
  createdAt: number;
}

export interface WIPStock {
  id: string;
  batchId: string;
  partName: string;
  partNo: string;
  quantity: number;
  stage: string;
  createdAt: number;
}

// Bonus Record
export interface BonusRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  monthlySalary: number;
  bonusType: 'Performance' | 'Festival' | 'Annual' | 'Special';
  bonusAmount: number;
  bonusMonth: string;
  status: 'Pending' | 'Approved' | 'Paid';
  remarks?: string;
  createdAt: number;
  approvedBy?: string;
  approvedAt?: number;
  paidAt?: number;
}
