// src/types/hr.ts

export interface FamilyMember {
  id: string;
  name: string;
  relationship: string;
  age: number;
  occupation?: string;
  contactNo?: string;
}

export interface EmployeeDocuments {
  profilePhoto?: string;
  aadhaarCard?: string;
  panCard?: string;
  tenthCertificate?: string;
  twelfthCertificate?: string;
  transferCertificate?: string;
  degreeCertificate?: string;
  experienceLetter?: string;
  relievingLetter?: string;
  others?: string[];
}

export interface EmployeeAddress {
  street: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface EmployeeBankDetails {
  bankName: string;
  bankAccountNo: string;
  bankIfsc: string;
  bankBranch: string;
  panNumber: string;
  aadhaarNumber: string;
  esiNumber?: string;
  pfNumber?: string;
}

export interface SalaryAllowances {
  basic: number;
  hra: number;
  conveyance: number;
  otherAllowances: number;
}

export interface SalaryDeductions {
  pf: number;
  esi: number;
  loan: number;
  tds: number;
  advance: number;
  others: number;
}

// Salary Revision History Types
export interface SalaryChange {
  field: string;
  fieldLabel: string;
  oldValue: number | boolean;
  newValue: number | boolean;
  changeType: 'increase' | 'decrease' | 'toggle';
  changeAmount?: number;
  changePercentage?: number;
}

export interface SalaryRevision {
  id: string;
  employeeId: string;
  employeeName: string;
  revisionDate: string;
  effectiveFrom: string;
  changedBy: string;
  changedByName: string;
  changes: SalaryChange[];
  reason: string;
  timestamp: number;
  previousSalary: number;
  newSalary: number;
  incrementPercentage: number;
}

export interface EmployeeSalary {
  employeeId: string;
  employeeName: string;
  monthYear: string; // Format: "2025-01"
  
  // Attendance
  presentDays: number;
  overtimeHours: number;
  holidays: number;
  
  // Allowances
  allowances: SalaryAllowances;
  grossPay: number;
  
  // Add-ons
  otAmount: number;
  holidayAmount: number;
  additionalAllowance: number;
  pfAddOn: number;
  totalAddOns: number;
  
  // Deductions
  deductions: SalaryDeductions;
  totalDeductions: number;
  
  // Final
  netPay: number;
  balanceAdvance: number;
  
  // Status
  status: 'Draft' | 'Approved' | 'Paid';
  approvedBy?: string;
  approvedAt?: number;
  paidAt?: number;
  
  // Flags
  pfApplicable: boolean;
  esiApplicable: boolean;
  incrementApproved: boolean;
  
  createdAt: number;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  status: 'Present' | 'Absent' | 'Half Day' | 'Leave' | 'Holiday' | 'Week Off';
  checkIn?: string; // HH:MM
  checkOut?: string; // HH:MM
  overtimeHours?: number;
  lateArrival?: boolean;
  earlyExit?: boolean;
  penalty?: number;
  notes?: string;
  createdAt: number;
}

export interface AdvancePayment {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  requestDate: string;
  approvalStatus: 'Pending' | 'Approved' | 'Rejected';
  approvedBy?: string;
  approvedAt?: number;
  reason: string;
  recoveryStartMonth?: string;
  recoveryAmount?: number;
  balanceAmount: number;
  createdAt: number;
}

export interface Penalty {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  reason: string;
  amount: number;
  appliedBy: string;
  createdAt: number;
}

export interface BonusRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  bonusType: string;
  amount: number;
  monthYear: string;
  status: 'Pending' | 'Approved' | 'Paid';
  createdAt: number;
}

export interface IncrementRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  previousSalary: number;
  newSalary: number;
  incrementPercentage: number;
  effectiveDate: string;
  reason: string;
  approvedBy?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: number;
}

export interface HolidayCalendar {
  id: string;
  date: string;
  holidayName: string;
  type: 'National' | 'Festival' | 'Company';
  year: number;
}

export interface EmployeeProfile {
  id: string;
  employeeId: string;
  
  // Personal
  name: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female' | 'Other';
  maritalStatus: 'Single' | 'Married' | 'Divorced' | 'Widowed';
  bloodGroup?: string;
  
  // Contact
  phone: string;
  email: string;
  emergencyContact: string;
  emergencyContactName: string;
  
  // Address
  address: EmployeeAddress;
  
  // Family
  familyMembers: FamilyMember[];
  
  // Employment
  department: 'Staff' | 'Worker' | 'Visitors' | 'Others';
  designation: string;
  joiningDate: string;
  employmentType: 'Permanent' | 'Contract' | 'Temporary' | 'Intern';
  shift?: string;
  reportingTo?: string;
  
  // Salary
  monthlySalary: number;
  allowances: SalaryAllowances;
  
  // Bank & Compliance
  bankDetails: EmployeeBankDetails;
  
  // Documents
  documents: EmployeeDocuments;
  
  // Salary Revision History
  salaryRevisions: SalaryRevision[];
  
  // Flags
  pfApplicable: boolean;
  esiApplicable: boolean;
  
  // Status
  status: 'Active' | 'Inactive' | 'Resigned' | 'Terminated';
  
  createdAt: number;
  updatedAt: number;
}

export interface PayrollSettings {
  pfPercentage: number; // Default 12%
  esiPercentage: number; // Default 0.75%
  pfThreshold: number; // Default 21500
  esiThreshold: number; // Default 21000
  otRatePerHour: number;
  holidayRate: number;
  lateArrivalPenalty: number;
  earlyExitPenalty: number;
}
