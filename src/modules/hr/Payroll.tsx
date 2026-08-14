'use client'

import { useEffect, useState } from 'react';
import { Download, FileText, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { getAllRecords } from '@/services/firebase';
import { database } from '@/services/firebase';
import { ref, onValue, set } from 'firebase/database';
import * as XLSX from 'xlsx';
import { toast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import fas from './fas.png';

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  department: string;
  officeType?: string;
  includePF?: boolean;
  includeESI?: boolean;
  pfApplicable?: boolean;
  esiApplicable?: boolean;
  // NEW STRUCTURE from updated EmployeeForm

  // OLD STRUCTURE (legacy employees)
  salary?: {
    basic: number;
    hra: number;
    conveyance: number;
    otherAllowance: number;
    grossMonthly: number;

  };
  bankDetails?: {
    esiNumber?: string;
    pfNumber?: string;
    aadhaarNumber?: string;
    bankName?: string;
    bankAccountNo?: string;
    panNumber?: string;
  };
  bankAccountNo?: string;
  panNumber?: string;
  esiNumber?: string;
  pfNumber?: string;
  status?: string;
  dateJoined?: string;
  joiningDate?: string;
  aadharNumber?: string;
  aadhaarNumber?: string;
  bankName?: string;
}

type SkipStatus = 'Pending' | 'Approved' | 'Rejected';

interface SkipEmiRequest {
  status: SkipStatus;
  requestedBy: string;
  requestedAt: number;
  approvedBy?: string;
  approvedAt?: number;
  reason?: string;
}

interface LoanRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  emiAmount: number;
  emiMonths: number;
  status: 'Approved' | 'Pending' | 'Rejected' | 'Repaid';
  disbursedDate?: string;
  reason?: string;
  skipEmiRequests?: { [yyyyMm: string]: SkipEmiRequest };
}

interface AttendanceRecord {
  date: string;
  status: string;
  otHrs?: number;
  employeeId?: string;
  shiftType?: 'day' | 'night' | 'sunday';
  workHrs?: number;
  totalHours?: number;
  pendingHrs?: number;
  actualWorkHrs?: number;
}

interface AttendanceApproval {
  status: 'pending' | 'accepted' | 'rejected';
  [key: string]: any;
}

interface Holiday {
  id: string;
  date: string;
  name: string;
  departments: string[];
  isRecurring: boolean;
}

type AttendanceStatusFlag = 'accepted' | 'pending' | 'rejected' | 'none';

interface PayrollRow {
  employeeId: string;
  empKey: string;
  name: string;
  department: string;
  officeType: string;
  monthlySalary: number;
  bankAccount: string;
  panNumber: string;
  esiNumber: string;
  pfNumber: string;
  presentDays: number;
  halfDays: number;
  leaveDays: number;
  totalDays: number;
  payableDays: number;
  lopDays: number;
  perDayRate: number;
  pdPay: number;
  hdPay: number;
  ldPay: number;
  otAmount: number;
  otMinutes: number;
  haDays: number;
  holidayPay: number;
  sundaysInMonth: number;
  sundaysWorked: number;
  sundayOtMinutes?: number;
  sundayAllowance: number;
  sundayCount: number;
  loanDeduction: number;
  additionalSpAllowance: number;
  fullMonthBonus: number;
  basic: number;
  hra: number;
  conveyance: number;
  otherAllowance: number;
  pf: number;
  esi: number;
  totalDeductions: number;
  totalEarnings: number;
  netPayable: number;
  status: 'Pending' | 'Credited';
  attendanceStatus: AttendanceStatusFlag;
  totalPendingHours: number;
  actualPresentDays: number;
}

type AttendanceApprovalMap = {
  [empId: string]: {
    [monthKey: string]: AttendanceApproval;
  };
};

// Helper function to get monthly salary from employee (handles both old and new structures)
const getMonthlySalary = (emp: Employee): number => {
  // ONLY use salary.grossMonthly
  if (emp.salary?.grossMonthly && emp.salary.grossMonthly > 0) {
    return emp.salary.grossMonthly;
  }

  // Fallback: calculate from salary breakdown
  if (emp.salary) {
    const salary = emp.salary as any;
    const { basic = 0, hra = 0, conveyance = 0, otherAllowance = 0, additionalSpecialAllowance = 0 } = salary;
    const total = basic + hra + conveyance + otherAllowance + additionalSpecialAllowance;
    if (total > 0) return total;
  }

  return 0;
};

// Helper function to get salary breakdown (handles both structures)
const getSalaryBreakdown = (emp: Employee) => {
  // ONLY use salary object - ignore allowances completely
  if (emp.salary) {
    const salary = emp.salary as any;
    return {
      basic: salary.basic || 0,
      hra: salary.hra || 0,
      conveyance: salary.conveyance || 0,
      otherAllowance: salary.otherAllowance || 0,
      specialAllowance: salary.specialAllowance || 0,
      additionalSpecialAllowance: salary.additionalSpecialAllowance || 0,
    };
  }

  // Fallback: all zeros
  return {
    basic: 0,
    hra: 0,
    conveyance: 0,
    otherAllowance: 0,
    specialAllowance: 0,
    additionalSpecialAllowance: 0,
  };
};


// Helper to check PF applicability
const isPFApplicable = (emp: Employee): boolean => {
  return emp.pfApplicable === true || emp.includePF === true;
};

// Helper to check ESI applicability
const isESIApplicable = (emp: Employee): boolean => {
  return emp.esiApplicable === true || emp.includeESI === true;
};

export default function PayrollPreparation() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allLoans, setAllLoans] = useState<LoanRecord[]>([]);
  const [attendanceApprovals, setAttendanceApprovals] = useState<AttendanceApprovalMap>({});
  const [holidays, setHolidays] = useState<Record<string, Record<string, Holiday>>>({});
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const getCurrentMonth = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const [selectedMonth, setSelectedMonth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('selectedPayrollMonth');
      if (saved) return saved;
    }
    return getCurrentMonth();
  });
  const [loading, setLoading] = useState(false);

  const erpUser =
    typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('erpuser') as any) : null;
  const allowedRoles = ['admin', 'hr'];
  const canCredit = allowedRoles.includes(erpUser?.role);

  const getMonthKey = (month: string) => month;

  useEffect(() => {
    getAllRecords('hr/employees').then((data: any) => {
      const list = !Array.isArray(data) ? (Object.values(data) as Employee[]) : (data as Employee[]);
      const active = list.filter((e) => e.status !== 'inactive');
      setEmployees(active);
    });
  }, []);

  useEffect(() => {
    const loansRef = ref(database, 'hr/loans');
    const unsub = onValue(loansRef, (snap) => {
      const data = snap.val();
      const loanList: LoanRecord[] = Object.keys(data).map((key) => ({ id: key, ...data[key] }));
      setAllLoans(loanList);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const approvalsRef = ref(database, 'hr/attendanceApprovals');
    const unsub = onValue(approvalsRef, (snap) => {
      const data = snap.val() as AttendanceApprovalMap;
      setAttendanceApprovals(data || {});
    });
    return unsub;
  }, []);

  useEffect(() => {
    const holidaysRef = ref(database, 'hr/holidays');
    const unsub = onValue(holidaysRef, (snap) => {
      setHolidays(snap.val() || {});
    });
    return unsub;
  }, []);



  const getApplicableHolidaysForEmployee = (monthKey: string, department: string): number => {
    const monthHolidays = holidays[monthKey];
    let count = 0;
    Object.values(monthHolidays || {}).forEach((holiday: Holiday) => {
      const appliesTo =
        holiday.departments.includes('All') || holiday.departments.includes(department);
      if (appliesTo) count++;
    });
    return count;
  };

  const countSundaysInMonth = (year: number, month: number): number => {
    const totalDays = new Date(year, month, 0).getDate();
    let sundayCount = 0;
    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month - 1, day);
      if (date.getDay() === 0) sundayCount++;
    }
    return sundayCount;
  };

  useEffect(() => {
    if (!selectedMonth || employees.length === 0) return;

    setLoading(true);
    const [year, month] = selectedMonth.split('-').map(Number);
    const totalDaysInMonth = new Date(year, month, 0).getDate();
    const sundaysInMonth = countSundaysInMonth(year, month);

    const monthPrefix = `${selectedMonth}-`;

    const attendanceRef = ref(database, 'hr/attendance');
    onValue(
      attendanceRef,
      (snap) => {
        const allAttendance = snap.val() || {};
        const monthAttendance: AttendanceRecord[] = [];

        Object.keys(allAttendance).forEach((date) => {
          if (date.startsWith(monthPrefix)) {
            const dayRecords = allAttendance[date];
            Object.values(dayRecords).forEach((rec: any) => {
              monthAttendance.push(rec as AttendanceRecord);
            });
          }
        });

        const statusRef = ref(database, `hr/payrollCredited/${selectedMonth}`);
        onValue(
          statusRef,
          (statusSnap) => {
            const credited = statusSnap.val() || {};
            const currentMonthKey = getMonthKey(selectedMonth);

            const rows = employees.map((emp) => {
              const empAttendance = monthAttendance.filter((r) => r.employeeId === emp.id);

              let present = 0;
              let half = 0;
              let leave = 0;
              let totalOtHours = 0;
              let totalPendingHours = 0;
              let sundayWorkedCount = 0; // **NEW: Track Sundays worked**
              let sundayAbsentCount = 0; // **NEW: Track absent Sundays**

              empAttendance.forEach((rec) => {
                // Check if it's actually a Sunday
                const recDate = new Date(rec.date);
                const isSundayDate = recDate.getDay() === 0;

                // **Auto-detect status based on hours for payroll consistency**
                let effectiveStatus = rec.status;
                const net = rec.actualWorkHrs || ((rec.workHrs || 0) + (rec.otHrs || 0));
                
                if (rec.status === 'Present' || rec.status === 'Half Day') {
                  if (net <= 4) {
                    effectiveStatus = 'Absent';
                  } else if (net < 8.5) {
                    effectiveStatus = 'Half Day';
                  } else {
                    effectiveStatus = 'Present';
                  }
                }

                if (isSundayDate) {
                  if (effectiveStatus === 'Absent' || effectiveStatus === 'Leave') {
                    sundayAbsentCount++;
                  } else if (effectiveStatus === 'Present') {
                    // **Employee worked on Sunday**
                    sundayWorkedCount++;

                    // **For all employees: Count as present day**
                    present++;
                  }
                } else {
                  // **Regular weekday attendance**
                  if (effectiveStatus === 'Present') {
                    present++;
                  } else if (effectiveStatus === 'Half Day') {
                    half++;
                  } else if (effectiveStatus === 'Leave' || effectiveStatus === 'Absent') {
                    leave++;
                  }
                }

                // **Match exact Timesheet OT calculation**
                let dayOt = typeof rec.otHrs === 'number' ? rec.otHrs : 0;
                if (isSundayDate && rec.status === 'Present') {
                  if (emp.department !== 'Staff') {
                    // Workers: count full actual hours as OT on Sundays
                    dayOt = typeof rec.actualWorkHrs === 'number'
                      ? rec.actualWorkHrs
                      : ((rec.workHrs || 0) + (rec.otHrs || 0));
                  } else {
                    // Staff: Sunday is compensated via sundayAllowance (₹500), NOT OT
                    dayOt = 0;
                  }
                }
                totalOtHours += dayOt;

                // **Pending Hours**
                if (typeof rec.pendingHrs === 'number' && rec.pendingHrs > 0) {
                  totalPendingHours += rec.pendingHrs;
                }
              });

              const netOtHours = Math.max(0, totalOtHours - totalPendingHours);
              const totalOtMinutes = Math.round(netOtHours * 60);

              const applicableHolidaysCount = getApplicableHolidaysForEmployee(
                selectedMonth,
                emp.department
              );

              const requiredDaysForFull = totalDaysInMonth - sundaysInMonth;
              const adjustedRequiredDays = requiredDaysForFull - applicableHolidaysCount;

              const fullWorkingDays = present >= adjustedRequiredDays ? totalDaysInMonth : present;
              const fullMonthBonus = present >= adjustedRequiredDays ? 400 : 0;

              const empApprovals = attendanceApprovals[emp.id] || {};
              const monthApproval = empApprovals[currentMonthKey];

              let attendanceStatus: AttendanceStatusFlag = 'none';
              if (monthApproval) {
                if (monthApproval.status === 'accepted') attendanceStatus = 'accepted';
                else if (monthApproval.status === 'pending') attendanceStatus = 'pending';
                else if (monthApproval.status === 'rejected') attendanceStatus = 'rejected';
              }

              const approvedLoans = allLoans.filter(
                (loan) => loan.employeeId === emp.id && loan.status === 'Approved'
              );

              const loanDeduction = approvedLoans.reduce((sum, loan) => {
                const baseEmi = loan.emiAmount || 0;
                const monthReq = loan.skipEmiRequests && loan.skipEmiRequests[currentMonthKey];
                const shouldSkip =
                  monthReq && (monthReq.status === 'Approved' || monthReq.status === 'Pending');
                return sum + (shouldSkip ? 0 : baseEmi);
              }, 0);

              // FIX: Use helper function to safely get monthly salary
              const monthlySalary = getMonthlySalary(emp);

              // FIX: Use helper function to safely get salary breakdown
              const salaryBreakdown = getSalaryBreakdown(emp);

              // Only paid rest Sundays are shown in the "Sundays" column now
              const paidRestSundays = sundaysInMonth - sundayAbsentCount - sundayWorkedCount;
              const isStaffDept = emp.department === 'Staff' || emp.department?.toLowerCase() === 'staff';

              // payableDays:
              // Staff: present (includes worked Sundays) + HD*0.5 + holidays + paid rest Sundays
              // Worker: present (includes worked Sundays) + HD*0.5 + paid rest Sundays
              const payableDays = isStaffDept
                ? present + (half * 0.5) + applicableHolidaysCount + paidRestSundays
                : present + (half * 0.5) + paidRestSundays;

              const row: PayrollRow = {
                employeeId: emp.employeeId,
                empKey: emp.id,
                name: emp.name?.trim() || '-',
                department: emp.department || '-',
                officeType: emp.officeType || 'OMR',
                monthlySalary,
                bankAccount: emp.bankDetails?.bankAccountNo || emp.bankAccountNo || '-',
                panNumber: emp.bankDetails?.panNumber || emp.panNumber || '-',
                esiNumber: emp.bankDetails?.esiNumber || emp.esiNumber || '-',
                pfNumber: emp.bankDetails?.pfNumber || emp.pfNumber || '-',
                presentDays: present, // Strict physical present days matching timesheet
                actualPresentDays: present,
                halfDays: half,
                leaveDays: leave,
                totalDays: totalDaysInMonth,
                payableDays,
                lopDays: totalDaysInMonth - (present + half * 0.5),
                perDayRate: Number((monthlySalary / totalDaysInMonth).toFixed(2)),
                pdPay: 0,
                hdPay: 0,
                ldPay: 0,
                otAmount: 0,
                otMinutes: totalOtMinutes,
                haDays: applicableHolidaysCount,
                holidayPay: 0,
                sundaysInMonth: sundaysInMonth,
                sundaysWorked: sundayWorkedCount,
                sundayOtMinutes: 0,
                sundayAllowance: 0, // Recalculated in recalculateRow
                sundayCount: paidRestSundays,
                loanDeduction,
                additionalSpAllowance: salaryBreakdown.additionalSpecialAllowance || 0,
                fullMonthBonus,
                // FIX: Use breakdown from helper
                basic: salaryBreakdown.basic,
                hra: salaryBreakdown.hra,
                conveyance: salaryBreakdown.conveyance,
                otherAllowance: salaryBreakdown.otherAllowance,
                pf: 0,
                esi: 0,
                totalDeductions: 0,
                totalEarnings: 0,
                netPayable: 0,
                status: credited[emp.id] ? 'Credited' : 'Pending',
                attendanceStatus,
                totalPendingHours,
              };

              return recalculateRow(row, emp, totalDaysInMonth);
            });

            setPayroll(rows.sort((a, b) => a.employeeId.localeCompare(b.employeeId)));
          },
          { onlyOnce: true }
        );

        setLoading(false);
      },
      { onlyOnce: true }
    );
  }, [selectedMonth, employees, allLoans, attendanceApprovals, holidays]);

  // CORRECTED recalculateRow FUNCTION - Shows Special Allowance from DB
  // Replace the ENTIRE recalculateRow function with this:
  const recalculateRow = (row: PayrollRow, emp: Employee, totalDays: number): PayrollRow => {
    const monthlySalary = getMonthlySalary(emp);

    const perDayRate = Number((monthlySalary / totalDays).toFixed(2));

    // P.D Pay derives cleanly from payableDays (which includes present, sundays, holidays, and 0.5 * halfDays)
    const pdPay = Math.round(row.payableDays * perDayRate);
    const hdPay = Math.round(row.halfDays * (perDayRate / 2)); // Displayed in UI, mathematically embedded in P.D Pay
    const ldPay = Math.round(row.leaveDays * perDayRate);

    const multiplier = (emp.department === 'Staff' || emp.department?.toLowerCase() === 'staff') ? 1 : 1.5;
    const dynamicOtRate = (perDayRate / 8) * multiplier;
    const otAmount = Math.round((row.otMinutes / 60) * dynamicOtRate);
    
    let sundayAllowance = 0;
    if (emp.department === 'Staff' || emp.department?.toLowerCase() === 'staff') {
      sundayAllowance = row.sundaysWorked * 500;
    } else {
      sundayAllowance = 0; // Worker Sunday hours are now included in normal OT
    }

    // 1) Basic = 50% of P.D Pay
    const basic = Math.round(pdPay * 0.50);
    
    // 2) HRA = 25% of P.D Pay (Direct calculation prevents cascading round-up errors)
    const hra = Math.round(pdPay * 0.25);
    
    // 3) CA = manual input (already in row.conveyance)
    const conveyance = Math.round(row.conveyance || 0);
    
    // 4) Other All. = P.D Pay - Basic - HRA - CA
    // Calculated by subtraction to guarantee Basic + HRA + CA + Other == P.D Pay perfectly
    const otherAllowance = pdPay - basic - hra - conveyance;

    // 5) Total Gross = Basic + HRA + CA + Other All. + Special Allowance + OT Amt + Sunday Allowance
    // Special Allowance is manual input (already in row.additionalSpAllowance)
    const additionalSpAllowance = Math.round(row.additionalSpAllowance || 0);
    const fullMonthBonus = Math.round(row.fullMonthBonus || 0);

    const totalGrossEarnings = pdPay + additionalSpAllowance + fullMonthBonus + otAmount + sundayAllowance;

    // PF calculation based on Basic + Conveyance
    const pfBase = basic + conveyance;
    const pf = isPFApplicable(emp) ? Math.round(pfBase * 0.12) : 0;

    // ESI calculation based on Total Gross
    const esi =
      isESIApplicable(emp) && monthlySalary <= 21000
        ? Math.round(totalGrossEarnings * 0.0075)
        : 0;

    const loanDeduction = Math.round(row.loanDeduction || 0);
    const totalDeductions = pf + esi + loanDeduction;
    const totalEarnings = totalGrossEarnings;
    const netPayable = totalEarnings - totalDeductions;

    return {
      ...row,
      monthlySalary,
      perDayRate,
      pdPay,
      hdPay,
      ldPay,
      otAmount,
      holidayPay: 0, // Holiday pay is mathematically embedded into P.D Pay (via payableDays)
      sundayAllowance,
      fullMonthBonus: row.fullMonthBonus,
      basic,
      hra,
      conveyance,
      otherAllowance,
      pf,
      esi,
      totalDeductions,
      totalEarnings,
      netPayable,
    };
  };



  const handleLoanDeductionChange = (employeeId: string, newValue: string) => {
    const numericValue = parseFloat(newValue) || 0;
    setPayroll((prev) =>
      prev.map((row) => {
        if (row.employeeId === employeeId) {
          const emp = employees.find((e) => e.employeeId === employeeId);
          if (!emp) return row;
          const updatedRow = { ...row, loanDeduction: numericValue };
          return recalculateRow(updatedRow, emp, row.totalDays);
        }
        return row;
      })
    );
  };

  const handleConveyanceChange = (employeeId: string, newValue: string) => {
    const numericValue = parseFloat(newValue) || 0;
    setPayroll((prev) =>
      prev.map((row) => {
        if (row.employeeId === employeeId) {
          const emp = employees.find((e) => e.employeeId === employeeId);
          if (!emp) return row;
          const updatedRow = { ...row, conveyance: numericValue };
          return recalculateRow(updatedRow, emp, row.totalDays);
        }
        return row;
      })
    );
  };

  const handleSpecialAllowanceChange = (employeeId: string, newValue: string) => {
    const numericValue = parseFloat(newValue) || 0;
    setPayroll((prev) =>
      prev.map((row) => {
        if (row.employeeId === employeeId) {
          const emp = employees.find((e) => e.employeeId === employeeId);
          if (!emp) return row;
          const updatedRow = { ...row, additionalSpAllowance: numericValue };
          return recalculateRow(updatedRow, emp, row.totalDays);
        }
        return row;
      })
    );
  };

  const generatePayslipPDF = async (row: PayrollRow, action: 'download' | 'preview' = 'download') => {
    const emp = employees.find((e) => e.employeeId === row.employeeId);
    if (!emp) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    try {
      const img = new Image();
      img.src = fas;
      await new Promise((resolve) => (img.onload = resolve));
      const logoWidth = 40;
      const logoHeight = 20;
      const logoX = (pageWidth - logoWidth) / 2;
      doc.addImage(img, 'JPEG', logoX, 10, logoWidth, logoHeight);
    } catch (error) {
      console.error('Logo loading failed:', error);
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    const companyName = 'FLUORO AUTOMATION SEALS PRIVATE LIMITED';
    const companyAddress1 = '3/24, Survey No. 160/1, Pillaiyar Koil St,';
    const companyAddress2 = 'Mettukuppam, Chennai - 600 097.';

    doc.text(companyName, pageWidth / 2, 35, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(companyAddress1, pageWidth / 2, 40, { align: 'center' });
    doc.text(companyAddress2, pageWidth / 2, 45, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Salary Slip', pageWidth / 2, 55, { align: 'center' });

    const [yearStr, monthStr] = selectedMonth.split('-');
    const monthName = new Date(
      parseInt(yearStr),
      parseInt(monthStr) - 1,
      1
    ).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    doc.setFontSize(10);
    doc.text(`Month: ${monthName.split(' ')[0].toUpperCase()} - ${yearStr}`, pageWidth - 14, 62, {
      align: 'right',
    });

    const startY = 68;
    const leftColX = 14;
    const rightColX = 105;
    const rowHeight = 6;
    let yPosition = startY;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setLineWidth(0.3);
    doc.setDrawColor(0, 0, 0);

    const employeeDetails = [
      { label: 'Employee Name', value: row.name },
      { label: 'Department', value: row.department },
      {
        label: 'Aadhar Card No.',
        value: emp.bankDetails?.aadhaarNumber || emp.aadhaarNumber || emp.aadharNumber || '-',
      },
      { label: 'PAN', value: row.panNumber },
      { label: 'Bank Account Number', value: row.bankAccount },
      { label: 'Bank Name', value: emp.bankDetails?.bankName || emp.bankName || '-' },
      { label: 'UAN No.', value: row.pfNumber || '-' },
      { label: 'ESI No.', value: row.esiNumber || '-' },
    ];

    const otHrs = Math.floor(row.otMinutes / 60);
    const otMins = row.otMinutes % 60;
    const otDisplay = `${otHrs}:${otMins.toString().padStart(2, '0')} hrs`;

    // Format date to DD/MM/YYYY
    const formatJoiningDate = (dateStr: string | undefined) => {
      if (!dateStr) return '-';
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };

    // Format amount with Indian comma separation
    const formatAmount = (num: number) => num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Full Working Days uses payableDays + pdPay to match table exactly
    const halfDaysSalary = Math.round(row.halfDays * row.perDayRate * 0.5);

    const rightDetails = [
      { label: 'Date of Joining', value: formatJoiningDate(emp.joiningDate || emp.dateJoined) },
      { label: 'Monthly Salary', value: `Rs. ${formatAmount(row.monthlySalary)}` },
      { label: 'Total Working Days', value: row.totalDays.toString() },
      { label: 'Full Working Days', value: `${row.payableDays} (${formatAmount(row.pdPay)})` },
      { label: 'Half Working Days', value: `${row.halfDays} (${formatAmount(halfDaysSalary)})` },
      { label: 'Leave Days', value: row.leaveDays.toString() },
      { label: 'Sunday Worked', value: row.sundaysWorked.toString() },
      { label: 'OT Hours', value: row.otMinutes > 0 ? otDisplay : '0:00 hrs' },
    ];

    employeeDetails.forEach((item, index) => {
      const y = yPosition + index * rowHeight;
      doc.rect(leftColX, y, 45, rowHeight);
      doc.rect(leftColX + 45, y, 46, rowHeight);
      doc.setFont('helvetica', 'normal');
      doc.text(item.label, leftColX + 2, y + 4);
      doc.text(item.value, leftColX + 47, y + 4);
    });

    rightDetails.forEach((item, index) => {
      const y = yPosition + index * rowHeight;
      doc.rect(rightColX, y, 45, rowHeight);
      doc.rect(rightColX + 45, y, 46, rowHeight);
      doc.setFont('helvetica', 'normal');
      doc.text(item.label, rightColX + 2, y + 4);
      doc.text(item.value, rightColX + 47, y + 4);
    });

    yPosition = startY + employeeDetails.length * rowHeight + 5;

    // CALCULATION BREAKDOWN SECTION
    doc.setFillColor(240, 240, 240);
    doc.rect(leftColX, yPosition, 182, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    // doc.text('CALCULATION BREAKDOWN', pageWidth / 2, yPosition + 4, { align: 'center' });
    yPosition += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);

    // Calculate the breakdown components
    const grossPayable = row.pdPay + row.hdPay; // Present + Half day pay
    const totalEarningsBeforeDeductions =
      grossPayable + row.holidayPay + row.otAmount + row.sundayAllowance + row.additionalSpAllowance + row.fullMonthBonus;

    const calculations = [
      // `Present Pay: ${row.actualPresentDays} days × ₹${row.perDayRate.toFixed(2)} = ₹${row.pdPay.toFixed(2)}`,
      // `Half Day Pay: ${row.halfDays} days × ₹${(row.perDayRate / 2).toFixed(2)} = ₹${row.hdPay.toFixed(2)}`,
      // `Sunday Pay (Included in Basic): ${row.sundayCount} days × ₹${row.perDayRate.toFixed(2)} = ₹${row.sundayPay.toFixed(2)}`,
      // `Overtime: ${(row.otMinutes / 60).toFixed(2)} hrs × ₹${((row.perDayRate / 8) * ((row.department === 'Staff' || row.department?.toLowerCase() === 'staff') ? 1 : 1.5)).toFixed(2)}/hr = ₹${row.otAmount.toFixed(2)}`,
      // `Total Payable Amount: ₹${totalEarningsBeforeDeductions.toFixed(2)}`,
      // '',
      // `Salary Distribution (from ₹${totalEarningsBeforeDeductions.toFixed(2)}):`,
      // `  - Basic (50%): ₹${row.basic.toFixed(2)}`,
      // `  - HRA (25%): ₹${row.hra.toFixed(2)}`,
      // `  - Conveyance: ₹${row.conveyance.toFixed(2)}`,
      // `  - Other Allowance: ₹${row.otherAllowance.toFixed(2)}`,
      // `  - Special Allowance: ₹${(row.specialAllowance + row.additionalSpAllowance).toFixed(2)}`,
    ];


    calculations.forEach((line, idx) => {
      const y = yPosition + idx * 3.5;
      if (y > pageHeight - 20) return; // Prevent overflow
      doc.text(line, leftColX + 2, y + 3);
    });

    yPosition += calculations.length * 3.5 + 3;

    // INCOME AND DEDUCTIONS TABLE
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(255, 255, 255);
    doc.setFontSize(9);

    doc.rect(leftColX, yPosition, 91, 7);
    doc.text('Income', leftColX + 35, yPosition + 5);

    doc.rect(rightColX, yPosition, 91, 7);
    doc.text('Deductions', rightColX + 30, yPosition + 5);

    yPosition += 7;

    doc.setFontSize(9);

    doc.rect(leftColX, yPosition, 60, 6);
    doc.text('Particulars', leftColX + 20, yPosition + 4);

    doc.rect(leftColX + 60, yPosition, 31, 6);
    doc.text('Amount', leftColX + 70, yPosition + 4);

    doc.rect(rightColX, yPosition, 60, 6);
    doc.text('Particulars', rightColX + 20, yPosition + 4);

    doc.rect(rightColX + 60, yPosition, 31, 6);
    doc.text('Amount', rightColX + 70, yPosition + 4);

    yPosition += 6;

    doc.setFont('helvetica', 'normal');

    // FIXED INCOME ITEMS - Shows breakdown of Total Gross
    const incomeItems = [
      { label: 'BASIC SALARY', amount: row.basic },
      { label: 'HRA', amount: row.hra },
      { label: 'CONVEYANCE', amount: row.conveyance },
      { label: 'OTHER ALLOWANCE', amount: row.otherAllowance },
      { label: 'SPECIAL ALLOWANCE', amount: row.additionalSpAllowance },
      { label: 'FULL MONTH PRESENT', amount: row.fullMonthBonus },
      { label: 'OT AMOUNT', amount: row.otAmount },
      { label: 'SUNDAY ALLOWANCE', amount: row.sundayAllowance },
      // Holiday Pay removed
    ];

    const deductionItems = [
      { label: 'PF', amount: row.pf },
      { label: 'ESI', amount: row.esi },
      { label: 'TDS', amount: 0 },
      { label: 'LOAN RECOVERY', amount: row.loanDeduction },
    ];

    const maxRows = Math.max(incomeItems.length, deductionItems.length);

    for (let i = 0; i < maxRows; i++) {
      const y = yPosition + i * 6;

      if (i < incomeItems.length) {
        doc.rect(leftColX, y, 60, 6);
        doc.rect(leftColX + 60, y, 31, 6);
        doc.text(incomeItems[i].label, leftColX + 2, y + 4);
        doc.text(formatAmount(incomeItems[i].amount), leftColX + 88, y + 4, { align: 'right' });
      } else {
        doc.rect(leftColX, y, 60, 6);
        doc.rect(leftColX + 60, y, 31, 6);
      }

      if (i < deductionItems.length) {
        doc.rect(rightColX, y, 60, 6);
        doc.rect(rightColX + 60, y, 31, 6);
        doc.text(deductionItems[i].label, rightColX + 2, y + 4);
        doc.text(formatAmount(deductionItems[i].amount), rightColX + 88, y + 4, { align: 'right' });
      } else {
        doc.rect(rightColX, y, 60, 6);
        doc.rect(rightColX + 60, y, 31, 6);
      }
    }

    yPosition += maxRows * 6;

    // Loan Balance
    doc.rect(rightColX, yPosition, 60, 6);
    doc.rect(rightColX + 60, yPosition, 31, 6);
    doc.setFont('helvetica', 'bold');
    // doc.text('BALANCE LOAN', rightColX + 2, yPosition + 4);

    const empLoans = allLoans.filter((loan) => loan.employeeId === emp.id && loan.status === 'Approved');
    const totalLoanBalance = empLoans.reduce((sum, loan) => {
      const totalLoan = loan.amount;
      const monthlyEmi = loan.emiAmount;
      const monthsPaid = Math.floor(
        (Date.now() - new Date(loan.disbursedDate || Date.now()).getTime()) /
        (30 * 24 * 60 * 60 * 1000)
      );
      const paidAmount = monthlyEmi * monthsPaid;
      return sum + Math.max(0, totalLoan - paidAmount);
    }, 0);

    doc.text(formatAmount(totalLoanBalance), rightColX + 88, yPosition + 4, { align: 'right' });
    yPosition += 6;

    // Totals
    doc.setFont('helvetica', 'bold');

    doc.rect(leftColX, yPosition, 60, 6);
    doc.rect(leftColX + 60, yPosition, 31, 6);
    doc.text('Total', leftColX + 2, yPosition + 4);
    doc.text(formatAmount(row.totalEarnings), leftColX + 88, yPosition + 4, { align: 'right' });

    doc.rect(rightColX, yPosition, 60, 6);
    doc.rect(rightColX + 60, yPosition, 31, 6);
    doc.text('Total', rightColX + 2, yPosition + 4);
    doc.text(formatAmount(row.totalDeductions), rightColX + 88, yPosition + 4, { align: 'right' });

    yPosition += 8;

    // Net Salary
    doc.setFontSize(10);

    doc.rect(rightColX, yPosition, 60, 7);
    doc.rect(rightColX + 60, yPosition, 31, 7);
    doc.text('Net Salary', rightColX + 2, yPosition + 5);
    doc.text(formatAmount(row.netPayable), rightColX + 88, yPosition + 5, { align: 'right' });

    yPosition += 10;

    // Amount in words
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Amount in Words:', leftColX, yPosition);
    yPosition += 6;

    doc.setFont('helvetica', 'normal');
    const amountInWords = numberToWords(row.netPayable);
    doc.text(amountInWords, leftColX, yPosition);

    yPosition += 35;

    // Signatures
    doc.setLineWidth(0.5);
    doc.line(leftColX, yPosition, leftColX + 60, yPosition);
    doc.line(rightColX + 20, yPosition, rightColX + 80, yPosition);

    yPosition += 5;

    doc.setFont('helvetica', 'bold');
    doc.text('Employee Signatory', leftColX + 15, yPosition);
    doc.text('Authorised Signatory', rightColX + 35, yPosition);

    if (action === 'download') {
      const fileName = `Payslip_${row.name.replace(/\s+/g, '_')}_${selectedMonth}.pdf`;
      doc.save(fileName);

      toast({
        title: 'Payslip Generated',
        description: `Payslip for ${row.name} has been downloaded.`,
      });
    } else {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  };

  const numberToWords = (num: number): string => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = [
      'Ten',
      'Eleven',
      'Twelve',
      'Thirteen',
      'Fourteen',
      'Fifteen',
      'Sixteen',
      'Seventeen',
      'Eighteen',
      'Nineteen',
    ];

    if (num === 0) return 'Zero Rupees Only';

    const convertLessThanThousand = (n: number): string => {
      if (n === 0) return '';
      if (n < 10) return ones[n];
      if (n < 20) return teens[n - 10];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
      return (
        ones[Math.floor(n / 100)] +
        ' Hundred' +
        (n % 100 !== 0 ? ' ' + convertLessThanThousand(n % 100) : '')
      );
    };

    let integerPart = Math.floor(num);
    const decimalPart = Math.round((num - integerPart) * 100);

    let result = '';

    if (integerPart >= 10000000) {
      const crores = Math.floor(integerPart / 10000000);
      result += convertLessThanThousand(crores) + ' Crore ';
      integerPart = integerPart % 10000000;
    }

    if (integerPart >= 100000) {
      const lakhs = Math.floor(integerPart / 100000);
      result += convertLessThanThousand(lakhs) + ' Lakh ';
      integerPart = integerPart % 100000;
    }

    if (integerPart >= 1000) {
      const thousands = Math.floor(integerPart / 1000);
      result += convertLessThanThousand(thousands) + ' Thousand ';
      integerPart = integerPart % 1000;
    }

    if (integerPart > 0) {
      result += convertLessThanThousand(integerPart);
    }

    result = result.trim() + ' Rupees';

    if (decimalPart > 0) {
      result += ' and ' + convertLessThanThousand(decimalPart) + ' Paise';
    }

    return result + ' Only';
  };

  const exportToSalaryXLSX = () => {
    const wb = XLSX.utils.book_new();

    const headers = [
      'Sl.No',
      'Employee Name',
      'Month',
      'Month Salary',
      'Attendance Status',
      'Pending Hrs',
      'Month Days',
      'Pay Days',
      'Present Days',
      'P.D Pay',
      'H.D',
      'H.D Pay',
      'OT Hrs',
      'OT Amt',
      'Sundays',
      'Sunday Allowance',
      'Full Month Bonus',
      'Basic',
      'HRA',
      'C.A',
      'Other Allowance',
      'SP Allowance',
      'Total Gross',
      'PF',
      'ESI',
      'Loan',
      'Net Pay',
      'Bank Ac No',
      'PAN No',
      'ESI No',
      'PF No',
      'Status',
    ];

    const monthStr = new Date(`${selectedMonth}-01`).toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });

    const data = payroll.map((row, idx) => {
      const otHrs = Math.floor(row.otMinutes / 60);
      const otMins = row.otMinutes % 60;
      const otDisplay = `${otHrs}:${otMins.toString().padStart(2, '0')}`;

      const pendingHrs = Math.floor(row.totalPendingHours);
      const pendingMins = Math.round((row.totalPendingHours % 1) * 60);
      const pendingDisplay = `${pendingHrs}:${pendingMins.toString().padStart(2, '0')}`;

      return [
        idx + 1,
        row.name,
        monthStr,
        row.monthlySalary,
        row.attendanceStatus,
        pendingDisplay,
        row.totalDays,
        row.payableDays.toFixed(1),
        row.presentDays,
        row.pdPay,
        row.halfDays,
        row.hdPay,
        otDisplay,
        row.otAmount,
        row.sundayCount,
        row.sundayAllowance,
        row.fullMonthBonus,
        row.basic,
        row.hra,
        row.conveyance,
        row.otherAllowance,
        row.additionalSpAllowance,
        row.totalEarnings,
        row.pf,
        row.esi,
        row.loanDeduction,
        row.netPayable,
        row.bankAccount,
        row.panNumber,
        row.esiNumber,
        row.pfNumber,
        row.status,
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    ws['!cols'] = headers.map(() => ({ wch: 15 }));

    XLSX.utils.book_append_sheet(wb, ws, 'Payroll');
    XLSX.writeFile(wb, `Payroll_${selectedMonth}.xlsx`);
  };

  const creditSingleEmployee = async (row: PayrollRow) => {
    if (!canCredit) {
      toast({
        title: 'Only Admin/HR can credit salary',
        variant: 'destructive',
      });
      return;
    }

    if (row.attendanceStatus !== 'accepted') {
      toast({
        title: 'Attendance not accepted',
        description: 'Salary can be credited only after attendance approval.',
        variant: 'destructive',
      });
      return;
    }

    if (row.status === 'Credited') {
      toast({
        title: 'Already credited',
        description: 'This employee salary has already been credited for this month.',
      });
      return;
    }

    const emp = employees.find((e) => e.employeeId === row.employeeId);
    if (!emp) {
      toast({
        title: 'Employee not found',
        variant: 'destructive',
      });
      return;
    }

    try {
      await set(ref(database, `hr/payrollCredited/${selectedMonth}/${emp.id}`), true);

      setPayroll((prev) =>
        prev.map((r) => (r.employeeId === row.employeeId ? { ...r, status: 'Credited' } : r))
      );

      toast({
        title: 'Salary credited',
        description: `${row.name} - ₹${row.netPayable.toLocaleString()}`,
      });
    } catch {
      toast({
        title: 'Failed to credit salary',
        variant: 'destructive',
      });
    }
  };

  const totals = payroll.reduce(
    (a, r) => ({
      earnings: a.earnings + r.totalEarnings,
      deductions: a.deductions + r.totalDeductions,
      net: a.net + r.netPayable,
    }),
    { earnings: 0, deductions: 0, net: 0 }
  );

  const filteredPayroll = selectedEmployeeId
    ? payroll.filter((row) => row.employeeId === selectedEmployeeId)
    : payroll;

  return (
    <div className="w-full min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="bg-white border-b">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold text-gray-900">
                Payroll -{' '}
                {new Date(`${selectedMonth}-01`).toLocaleDateString('en-IN', {
                  month: 'long',
                  year: 'numeric',
                })}
              </h1>
              <p className="text-gray-600 mt-1 text-sm lg:text-base">
                Sunday pay based on daily salary rate<br/>
                Pay Days = Present Days + H.D * 0.5 + Sundays<br/>
                P.D Pay = Pay Days * Daily Salary Rate<br/>            
              </p>
            </div>

            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium">Select Month</Label>
                <Input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    localStorage.setItem('selectedPayrollMonth', e.target.value);
                  }}
                  className="w-44 h-10"
                />
              </div>

              <Button onClick={exportToSalaryXLSX} size="lg" variant="outline" className="h-10">
                <Download className="w-4 h-4 mr-2" />
                Export Payroll
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs lg:text-sm font-medium text-gray-600">
                Employees (All)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl lg:text-3xl font-bold text-gray-900">{payroll.length}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs lg:text-sm font-medium text-emerald-700">
                Total Gross
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl lg:text-3xl font-bold text-emerald-900">
                ₹{totals.earnings.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </div>
            </CardContent>
          </Card>



          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs lg:text-sm font-medium text-blue-700">
                Credited
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl lg:text-3xl font-bold text-blue-900">
                {payroll.filter((r) => r.status === 'Credited').length}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-700 to-blue-600 text-white shadow-sm hover:shadow-md transition-shadow col-span-2 sm:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs lg:text-sm font-medium">Net Payable</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl lg:text-3xl font-bold">
                ₹{totals.net.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Main Payroll Table */}
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <Card className="shadow-lg">
          <CardHeader className="border-b bg-gray-50">
            <div className="flex justify-between items-center">
              <CardTitle className="text-xl lg:text-2xl font-bold text-gray-900">
                Payroll Details
              </CardTitle>
              {selectedEmployeeId && (
                <Button
                  onClick={() => setSelectedEmployeeId(null)}
                  variant="default"
                  size="sm"
                >
                  Show All Employees
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-20">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
                <p className="mt-4 text-gray-600">Loading payroll data...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-slate-100 hover:bg-slate-100">
                      <TableHead className="font-bold sticky left-0 bg-slate-100 z-10 min-w-[50px]">
                        No
                      </TableHead>
                      <TableHead className="font-bold sticky left-[50px] bg-slate-100 z-10 min-w-[180px]">
                        Employee
                      </TableHead>
                      <TableHead className="font-bold min-w-[90px]">Month</TableHead>
                      <TableHead className="font-bold min-w-[90px]">Attendance</TableHead>
                      <TableHead className="font-bold min-w-[90px]">Pending Hrs</TableHead>
                      <TableHead className="font-bold text-center min-w-[80px]">Days</TableHead>
                      <TableHead className="font-bold text-center min-w-[80px]">Pay Days</TableHead>
                      <TableHead className="font-bold text-center min-w-[80px]">Present Days</TableHead>
                      <TableHead className="font-bold min-w-[100px]">P.D Pay</TableHead>
                      <TableHead className="font-bold text-center min-w-[60px]">H.D</TableHead>
                      <TableHead className="font-bold min-w-[90px]">H.D Pay</TableHead>
                      <TableHead className="font-bold text-center min-w-[80px]">OT Hrs</TableHead>
                      <TableHead className="font-bold min-w-[100px]">OT Amt</TableHead>
                      <TableHead className="font-bold text-center min-w-[70px]">Holidays</TableHead>
                      <TableHead className="font-bold text-center min-w-[70px]">Sundays</TableHead>
                      <TableHead className="font-bold min-w-[100px]">Special Allowance</TableHead>
                      <TableHead className="font-bold min-w-[100px]">Basic</TableHead>
                      <TableHead className="font-bold min-w-[100px]">HRA</TableHead>
                      <TableHead className="font-bold min-w-[100px]">C.A</TableHead>
                      <TableHead className="font-bold min-w-[100px]">Other All.</TableHead>
                      <TableHead className="font-bold min-w-[120px] bg-emerald-50">
                        Total Gross
                      </TableHead>
                      <TableHead className="font-bold min-w-[90px]">PF</TableHead>
                      <TableHead className="font-bold min-w-[90px]">ESI</TableHead>
                      <TableHead className="font-bold min-w-[100px]">Loan</TableHead>

                      <TableHead className="font-bold min-w-[140px] bg-green-50">
                        Net Pay
                      </TableHead>
                      <TableHead className="font-bold min-w-[140px]">Bank Ac</TableHead>
                      <TableHead className="font-bold min-w-[120px]">PAN</TableHead>
                      <TableHead className="font-bold min-w-[120px]">ESI No</TableHead>
                      <TableHead className="font-bold min-w-[120px]">PF No</TableHead>
                      <TableHead className="font-bold sticky right-0 bg-slate-100 z-10 min-w-[160px]">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayroll.map((row, idx) => {
                      const otHrs = Math.floor(row.otMinutes / 60);
                      const otMins = row.otMinutes % 60;
                      const otDisplay = `${otHrs.toString().padStart(2, '0')}:${otMins.toString().padStart(2, '0')}`;

                      const pendingHrs = Math.floor(row.totalPendingHours);
                      const pendingMins = Math.round((row.totalPendingHours % 1) * 60);
                      const pendingDisplay = `${pendingHrs}:${pendingMins.toString().padStart(2, '0')}`;

                      const attBadgeVariant =
                        row.attendanceStatus === 'accepted'
                          ? 'default'
                          : row.attendanceStatus === 'rejected'
                            ? 'destructive'
                            : 'secondary';

                      const multiplier = (row.department === 'Staff' || row.department?.toLowerCase() === 'staff') ? 1 : 1.5;
                      const empOtRate = Math.round((row.perDayRate / 8) * multiplier);

                      return (
                        <TableRow
                          key={row.employeeId}
                          className={
                            row.status === 'Credited'
                              ? 'bg-green-50 hover:bg-green-100'
                              : 'hover:bg-gray-50 cursor-pointer'
                          }
                          onClick={() => setSelectedEmployeeId(row.employeeId)}
                        >
                          <TableCell className="font-medium sticky left-0 bg-white z-10">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="sticky left-[50px] bg-white z-10">
                            <div className="font-semibold text-gray-900">{row.name}</div>
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              Daily Rate: ₹{Math.round(row.perDayRate).toLocaleString('en-IN')} | OT: ₹{empOtRate.toLocaleString('en-IN')}/hr
                            </div>
                          </TableCell>
                          <TableCell>
                            {new Date(`${selectedMonth}-01`).toLocaleDateString('en-IN', {
                              month: 'short',
                              year: 'numeric',
                            })}
                          </TableCell>
                          <TableCell>
                            <Badge variant={attBadgeVariant} className="text-[10px] px-2 py-0.5">
                              {row.attendanceStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-medium text-orange-600">
                            {pendingDisplay}
                          </TableCell>
                          <TableCell className="text-center">{row.totalDays}</TableCell>
                          <TableCell className="text-center font-medium">{row.payableDays.toFixed(1)}</TableCell>
                          <TableCell className="text-center">{row.presentDays}</TableCell>
                          <TableCell>₹{row.pdPay.toLocaleString('en-IN')}</TableCell>
                          <TableCell className="text-center">{row.halfDays}</TableCell>
                          <TableCell>₹{row.hdPay.toLocaleString('en-IN')}</TableCell>
                          <TableCell className="text-center font-medium text-blue-600">
                            {otDisplay}
                          </TableCell>
                          <TableCell className="font-bold text-blue-700">
                            ₹{row.otAmount.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className="text-center font-medium text-green-600">
                            {row.haDays}
                          </TableCell>
                          <TableCell className="text-center font-medium text-purple-600">
                            {row.sundayCount}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Input
                              type="number"
                              value={row.additionalSpAllowance === 0 ? '' : row.additionalSpAllowance}
                              onChange={(e) =>
                                handleSpecialAllowanceChange(row.employeeId, e.target.value)
                              }
                              className="w-20 h-7 text-right font-semibold text-xs"
                              min={0}
                            />
                          </TableCell>
                          <TableCell>₹{row.basic.toLocaleString('en-IN')}</TableCell>
                          <TableCell>₹{row.hra.toLocaleString('en-IN')}</TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Input
                              type="number"
                              value={row.conveyance === 0 ? '' : row.conveyance}
                              onChange={(e) =>
                                handleConveyanceChange(row.employeeId, e.target.value)
                              }
                              className="w-20 h-7 text-right font-semibold text-xs"
                              min={0}
                            />
                          </TableCell>
                          <TableCell>₹{row.otherAllowance.toLocaleString('en-IN')}</TableCell>
                          <TableCell className="font-bold text-emerald-700 bg-emerald-50">
                            ₹{row.totalEarnings.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className="text-red-600">
                            -₹{row.pf.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className="text-red-600">
                            -₹{row.esi.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Input
                              type="number"
                              value={row.loanDeduction === 0 ? '' : row.loanDeduction}
                              onChange={(e) =>
                                handleLoanDeductionChange(row.employeeId, e.target.value)
                              }
                              className="w-20 h-7 text-right text-red-600 font-semibold text-xs"
                              min={0}
                            />
                          </TableCell>

                          <TableCell className="text-lg font-bold text-green-700 bg-green-50">
                            ₹{row.netPayable.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className="font-mono text-[10px]">{row.bankAccount}</TableCell>
                          <TableCell className="font-mono text-[10px]">{row.panNumber}</TableCell>
                          <TableCell className="font-mono text-[10px]">{row.esiNumber}</TableCell>
                          <TableCell className="font-mono text-[10px]">{row.pfNumber}</TableCell>
                          <TableCell
                            className="sticky right-0 bg-white z-10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex flex-col gap-1.5">
                              <Badge
                                variant={row.status === 'Credited' ? 'default' : 'secondary'}
                                className="text-[10px] justify-center"
                              >
                                {row.status}
                              </Badge>

                              <Button
                                size="sm"
                                className="h-7 text-[11px]"
                                disabled={
                                  row.status === 'Credited' ||
                                  row.attendanceStatus !== 'accepted' ||
                                  !canCredit
                                }
                                onClick={() => creditSingleEmployee(row)}
                              >
                                {row.status === 'Credited' ? 'Credited' : 'Credit'}
                              </Button>

                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 flex-1 text-[11px] px-2"
                                  onClick={() => generatePayslipPDF(row, 'download')}
                                  title="Download Payslip"
                                >
                                  <Download className="w-3 h-3 mr-1" />
                                  Payslip
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-7 p-0"
                                  onClick={() => generatePayslipPDF(row, 'preview')}
                                  title="Preview Payslip"
                                >
                                  <Eye className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}