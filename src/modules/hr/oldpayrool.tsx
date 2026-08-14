'use client';

import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
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
  salary: {
    basic: number;
    hra: number;
    conveyance: number;
    otherAllowance: number;
    specialAllowance: number;
    grossMonthly: number;
    monthlySalary?: number;
  };
  bankDetails?: {
    esiNumber?: string;
    pfNumber?: string;
  };
  bankAccountNo?: string;
  panNumber?: string;
  esiNumber?: string;
  pfNumber?: string;
  status?: string;
  dateJoined?: string;
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
  skipEmiRequests?: {
    [yyyyMm: string]: SkipEmiRequest;
  };
}

interface AttendanceRecord {
  date: string;
  status: string;
  otHrs?: number;
  employeeId?: string;
  shiftType?: 'day' | 'night' | 'sunday';
  workHrs?: number;
  totalHours?: number;
}

interface AttendanceApproval {
  status: 'pending' | 'accepted' | 'rejected';
  [key: string]: any;
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

  loanDeduction: number;
  additionalSpAllowance: number;

  basic: number;
  hra: number;
  conveyance: number;
  otherAllowance: number;
  specialAllowance: number;

  pf: number;
  esi: number;
  totalDeductions: number;

  totalEarnings: number;
  netPayable: number;
  status: 'Pending' | 'Credited';
  attendanceStatus: AttendanceStatusFlag;

  bonusName: string;
  bonusAmount: number;

  // NEW FIELDS
  totalWorkHrs: number;
  totalPendingHrs: number;
  sundaysInMonth: number;
  sundaysWorked: number;
  sundayOtMinutes?: number;
  sundayAllowance: number;
  sundayCount: number;
  sundayPay: number;
}

interface BonusRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  amount: number;
  bonusType: string;
  status: string;
  year: number;
  monthYear?: string;
  requestedAt: number;
  approvedAt?: number;
  approvedBy?: string;
}

type AttendanceApprovalMap = {
  [empId: string]: {
    [monthKey: string]: AttendanceApproval;
  };
};

// NEW: Timesheet Summary Interface
interface TimesheetSummary {
  totalWorkHrs?: number;
  totalPending?: number;
}

export default function PayrollPreparation() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allLoans, setAllLoans] = useState<LoanRecord[]>([]);
  const [attendanceApprovals, setAttendanceApprovals] = useState<AttendanceApprovalMap>({});
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);

  const getCurrentMonth = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [loading, setLoading] = useState(false);
  const [bonuses, setBonuses] = useState<BonusRecord[]>([]);

  // NEW: Store timesheet summaries
  const [timesheetSummaries, setTimesheetSummaries] = useState<{
    [empId: string]: TimesheetSummary;
  }>({});

  const erpUser =
    typeof window !== 'undefined'
      ? JSON.parse(localStorage.getItem('erp_user') || '{}')
      : {};
  const allowedRoles = ['admin', 'hr'];
  const canCredit = allowedRoles.includes(erpUser.role);

  const getMonthKey = (month: string) => month;

  useEffect(() => {
    getAllRecords('hr/employees').then((data: any) => {
      const list =
        data && !Array.isArray(data)
          ? (Object.values(data) as Employee[])
          : ((data as Employee[]) || []);
      const active = list.filter((e) => e.status !== 'inactive');
      setEmployees(active);
    });
  }, []);

  useEffect(() => {
    const loansRef = ref(database, 'hr/loans');
    const unsub = onValue(loansRef, (snap) => {
      const data = snap.val() || {};
      const loanList: LoanRecord[] = Object.keys(data).map((key) => ({
        id: key,
        ...data[key],
      }));
      setAllLoans(loanList);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const approvalsRef = ref(database, 'hr/attendanceApprovals');
    const unsub = onValue(approvalsRef, (snap) => {
      const data = (snap.val() || {}) as AttendanceApprovalMap;
      setAttendanceApprovals(data);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const bonusesRef = ref(database, 'hr/bonuses');
    const unsub = onValue(bonusesRef, (snap) => {
      const data = snap.val() || {};
      const list: BonusRecord[] = Object.keys(data).map((key) => ({
        id: key,
        ...data[key],
      }));
      setBonuses(list);
    });
    return () => unsub();
  }, []);



  // NEW: Fetch Timesheet Summaries for all employees
  useEffect(() => {
    if (!selectedMonth || employees.length === 0) return;

    const summariesRef = ref(database, 'hr/supersave');
    const unsub = onValue(summariesRef, (snap) => {
      const allData = snap.val() || {};
      const summaries: { [empId: string]: TimesheetSummary } = {};

      employees.forEach((emp) => {
        const empData = allData[emp.id];
        if (empData && empData[selectedMonth]) {
          summaries[emp.id] = {
            totalWorkHrs: empData[selectedMonth].totalWorkHrs || 0,
            totalPending: empData[selectedMonth].totalPending || 0,
          };
        } else {
          summaries[emp.id] = {
            totalWorkHrs: 0,
            totalPending: 0,
          };
        }
      });

      setTimesheetSummaries(summaries);
    });

    return () => unsub();
  }, [selectedMonth, employees]);

  useEffect(() => {
    if (!selectedMonth || employees.length === 0) return;

    setLoading(true);

    const [year, month] = selectedMonth.split('-').map(Number);
    const totalDaysInMonth = new Date(year, month, 0).getDate();
    const monthPrefix = selectedMonth + '-';

    const attendanceRef = ref(database, 'hr/attendance');
    onValue(
      attendanceRef,
      (snap) => {
        const allAttendance = snap.val() || {};

        const monthAttendance: AttendanceRecord[] = [];
        Object.keys(allAttendance).forEach((date) => {
          if (date.startsWith(monthPrefix)) {
            const dayRecords = allAttendance[date];
            Object.values(dayRecords).forEach((rec: any) =>
              monthAttendance.push(rec as AttendanceRecord),
            );
          }
        });

        const statusRef = ref(database, `hr/payrollCredited/${selectedMonth}`);
        onValue(
          statusRef,
          (statusSnap) => {
            const credited = statusSnap.val() || {};
            const currentMonthKey = getMonthKey(selectedMonth);

            const currentMonthName = new Date(
              selectedMonth + '-01',
            ).toLocaleDateString('en-IN', {
              month: 'short',
              year: 'numeric',
            });

            const [year, monthNum] = selectedMonth.split('-').map(Number);
            const totalDaysInMonth = new Date(year, monthNum, 0).getDate();
            const sundaysInMonth = Array.from({ length: totalDaysInMonth }, (_, i) => new Date(year, monthNum - 1, i + 1).getDay() === 0).filter(Boolean).length;

            const rows = employees.map((emp) => {
              const empAttendance = monthAttendance.filter(
                (r) => r.employeeId === emp.id,
              );

              let present = 0;
              let half = 0;
              let leave = 0;
              let otMinutes = 0;
              let sundayWorkedCount = 0;
              let sundayOtMinutesForWorkers = 0;

              empAttendance.forEach((rec) => {
                const isSunday =
                  rec.shiftType === 'sunday' && rec.status === 'Present';

                if (!isSunday) {
                  if (rec.status === 'Present') present++;
                  else if (rec.status === 'Half Day') half++;
                  else if (rec.status === 'Leave') leave++;
                }

                if (typeof rec.otHrs === 'number' && rec.otHrs > 0) {
                  otMinutes += Math.round(rec.otHrs * 60);
                }

                if (isSunday) {
                  sundayWorkedCount++;
                  if (emp.department === 'Staff') {
                    // Staff present count handling
                    present++;
                  } else if (
                    emp.department === 'Worker' ||
                    emp.department === 'Other Workers'
                  ) {
                    const hrs =
                      typeof rec.workHrs === 'number'
                        ? rec.workHrs
                        : typeof rec.totalHours === 'number'
                          ? rec.totalHours
                          : 0;
                    sundayOtMinutesForWorkers += Math.round(hrs * 60);
                  }
                }
              });

              const empApprovals = attendanceApprovals[emp.id];
              const monthApproval =
                empApprovals && empApprovals[currentMonthKey];
              let attendanceStatus: AttendanceStatusFlag = 'none';
              if (monthApproval) {
                if (monthApproval.status === 'accepted')
                  attendanceStatus = 'accepted';
                else if (monthApproval.status === 'pending')
                  attendanceStatus = 'pending';
                else if (monthApproval.status === 'rejected')
                  attendanceStatus = 'rejected';
              }

              const approvedLoans = allLoans.filter(
                (loan) =>
                  loan.employeeId === emp.id &&
                  loan.status === 'Approved',
              );

              const loanDeduction = approvedLoans.reduce((sum, loan) => {
                const baseEmi = loan.emiAmount || 0;
                const monthReq =
                  loan.skipEmiRequests &&
                  loan.skipEmiRequests[currentMonthKey];
                const shouldSkip =
                  monthReq &&
                  (monthReq.status === 'Approved' ||
                    monthReq.status === 'Pending');
                return sum + (shouldSkip ? 0 : baseEmi);
              }, 0);

              const empBonus = bonuses.find(
                (b) =>
                  b.employeeId === emp.id &&
                  b.status === 'Approved' &&
                  b.monthYear === currentMonthName,
              );
              const bonusName = empBonus ? empBonus.bonusType : '-';
              const bonusAmount = empBonus?.amount || 0;

              const monthlySalary = emp.salary.monthlySalary ?? emp.salary.grossMonthly;

              // NEW: Get timesheet summary for this employee
              const empSummary = timesheetSummaries[emp.id] || {
                totalWorkHrs: 0,
                totalPending: 0,
              };

              const row: PayrollRow = {
                employeeId: emp.employeeId,
                empKey: emp.id,
                name: emp.name?.trim() || '-',
                department: emp.department || '-',
                officeType: emp.officeType || 'OMR',
                monthlySalary,
                bankAccount: emp.bankAccountNo || '-',
                panNumber: emp.panNumber || '-',
                esiNumber: emp.bankDetails?.esiNumber || emp.esiNumber || '-',
                pfNumber: emp.bankDetails?.pfNumber || emp.pfNumber || '-',

                presentDays: present,
                halfDays: half,
                leaveDays: leave,
                totalDays: totalDaysInMonth,
                payableDays: present + leave + half * 0.5,
                lopDays:
                  totalDaysInMonth - (present + leave + half * 0.5),
                perDayRate: Number((monthlySalary / totalDaysInMonth).toFixed(2)),
                pdPay: 0,
                hdPay: 0,
                ldPay: 0,
                otAmount: 0,
                otMinutes: otMinutes,
                sundaysInMonth: sundaysInMonth,
                sundaysWorked: sundayWorkedCount,
                sundayOtMinutes: sundayOtMinutesForWorkers,
                sundayAllowance: 0,
                sundayCount: sundaysInMonth,
                sundayPay: 0,
                haDays: 0, 
                holidayPay: 0,

                loanDeduction,
                additionalSpAllowance: 0,
                specialAllowance: 0,

                basic: emp.salary.basic || 0,
                hra: emp.salary.hra || 0,
                conveyance: emp.salary.conveyance || 0,
                otherAllowance: emp.salary.otherAllowance || 0,

                pf: 0,
                esi: 0,
                totalDeductions: 0,

                totalEarnings: 0,
                netPayable: 0,
                status: credited[emp.id]
                  ? 'Credited'
                  : 'Pending',
                attendanceStatus,

                bonusName,
                bonusAmount,

                // NEW: Add timesheet summary data
                totalWorkHrs: empSummary.totalWorkHrs,
                totalPendingHrs: empSummary.totalPending,
              };

              return recalculateRow(row, emp, totalDaysInMonth);
            });

            setPayroll(
              rows.sort((a, b) =>
                a.employeeId.localeCompare(b.employeeId),
              ),
            );
            setLoading(false);
          },
          { onlyOnce: true },
        );
      },
      { onlyOnce: true },
    );
  }, [selectedMonth, employees, allLoans, attendanceApprovals, bonuses, timesheetSummaries]);

  const recalculateRow = (
    row: PayrollRow,
    emp: Employee,
    totalDays: number,
  ): PayrollRow => {
    const perDayRate = row.perDayRate;
    const pdPay = Number((row.presentDays * perDayRate).toFixed(2));
    const hdPay = Number((row.halfDays * (perDayRate / 2)).toFixed(2));
    const ldPay = Number((row.leaveDays * perDayRate).toFixed(2));
    const grossPayable = Number((pdPay + hdPay + ldPay).toFixed(2));

    const multiplier = (emp.department === 'Staff' || emp.department?.toLowerCase() === 'staff') ? 1 : 1.5;
    const dynamicOtRate = (perDayRate / 8) * multiplier;
    const otAmount = Number(((row.otMinutes / 60) * dynamicOtRate).toFixed(2));

    const sundayPay = Number((row.sundayCount * perDayRate).toFixed(2));
    
    let sundayAllowance = 0;
    if (emp.department === 'Staff' || emp.department?.toLowerCase() === 'staff') {
      sundayAllowance = row.sundaysWorked * 500;
    } else {
      const hourlyRate = (perDayRate / 8) * 1.5; 
      sundayAllowance = Number((((row.sundayOtMinutes || 0) / 60) * hourlyRate).toFixed(2));
    }

    let basic = 0;
    let hra = 0;
    let conveyance = 0;
    let otherAllowance = 0;
    let specialAllowance = 0;
    let pf = 0;
    let esi = 0;

    if (grossPayable > 0) {
      const ratio = grossPayable / row.monthlySalary || 1;
      basic = Number(((emp.salary.basic || 0) * ratio).toFixed(2));
      hra = Number(((emp.salary.hra || 0) * ratio).toFixed(2));
      conveyance = Number(((emp.salary.conveyance || 0) * ratio).toFixed(2));
      otherAllowance = Number(((emp.salary.otherAllowance || 0) * ratio).toFixed(2));
      const newSpecialAllowance = row.additionalSpAllowance;

      const pfBase = basic + conveyance;
      pf = emp.includePF === true ? Number((pfBase * 0.12).toFixed(2)) : 0;

      esi =
        emp.includeESI === true && row.monthlySalary <= 21000
          ? Number((grossPayable * 0.0075).toFixed(2))
          : 0;
    } else {
      const newSpecialAllowance = row.additionalSpAllowance;
    }

    const totalDeductions = Number((pf + esi + row.loanDeduction).toFixed(2));

    const totalEarnings = Number((
      grossPayable +
      otAmount +
      row.additionalSpAllowance +
      row.bonusAmount +
      sundayPay +
      sundayAllowance
    ).toFixed(2));

    const netPayable = Number((totalEarnings - totalDeductions).toFixed(2));

    return {
      ...row,
      pdPay,
      hdPay,
      ldPay,
      otAmount,
      holidayPay: 0,
      sundayPay,
      sundayAllowance,
      basic,
      hra,
      conveyance,
      otherAllowance,
      specialAllowance: row.additionalSpAllowance,
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

  // Helper function to format hours to HH:MM
  const formatHoursToHMM = (hours: number): string => {
    if (hours === 0) return '0:00';
    const h = Math.floor(Math.abs(hours));
    const m = Math.round((Math.abs(hours) % 1) * 60);
    return `${hours < 0 ? '-' : ''}${h}:${m.toString().padStart(2, '0')}`;
  };

  const generatePayslipPDF = async (row: PayrollRow) => {
    const emp = employees.find((e) => e.employeeId === row.employeeId);
    if (!emp) return;

    const doc = new jsPDF();

    const img = new Image();
    img.src = fas;

    await new Promise((resolve) => {
      img.onload = resolve;
    });

    doc.addImage(img, 'JPEG', 85, 10, 40, 20);

    const [year, month] = selectedMonth.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });
    const daysWorked = row.payableDays;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Employee Information', 14, 45);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`EMP IDE: ${row.employeeId}`, 14, 52);
    doc.text(`Name: ${row.name}`, 14, 57);
    doc.text(`Designation: ${row.department}`, 14, 62);
    doc.text(`Department: ${row.department}`, 14, 67);

    doc.text(`Pay Periods: ${monthName}`, 120, 52);
    doc.text(`Days Worked: ${daysWorked} Days`, 120, 57);
    doc.text(`LOP Days: ${row.lopDays.toFixed(1)} Days`, 120, 62);
    doc.text(`Date Joined: ${emp.dateJoined || '2022-09-06'}`, 120, 67);

    doc.setFillColor(255, 200, 100);
    doc.rect(14, 75, 182, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('Income', 16, 80);
    doc.text('Amount ($)', 170, 80);

    let yPos = 88;
    doc.setFont('helvetica', 'normal');

    const incomeItems = [
      { label: 'Basic', amount: row.basic },
      { label: 'House', amount: row.hra },
      { label: 'Medical', amount: row.otherAllowance },
      { label: 'Overtime', amount: row.otAmount },
      { label: 'Sunday Pay', amount: row.sundayPay },
      { label: 'Sunday Allowance', amount: row.sundayAllowance },
      // holidayPay removed
    ];

    incomeItems.forEach((item) => {
      doc.text(item.label, 16, yPos);
      doc.text(item.amount.toFixed(2), 175, yPos, { align: 'right' });
      yPos += 5;
    });

    doc.setFillColor(255, 200, 100);
    doc.rect(14, yPos + 2, 182, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('Deductions', 16, yPos + 7);

    yPos += 12;
    doc.setFont('helvetica', 'normal');

    const deductionItems = [
      { label: 'Taxes', amount: 500 },
      { label: 'Cash Advance', amount: row.loanDeduction },
      { label: 'Other Deductions', amount: row.pf },
      { label: 'Other Deductions', amount: row.esi },
    ];

    deductionItems.forEach((item) => {
      doc.text(item.label, 16, yPos);
      doc.text(item.amount.toFixed(2), 175, yPos, { align: 'right' });
      yPos += 5;
    });

    doc.setFillColor(255, 200, 100);
    doc.rect(14, yPos + 2, 182, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('NET PAY', 16, yPos + 7);
    doc.text(row.netPayable.toFixed(2), 175, yPos + 7, { align: 'right' });

    yPos += 15;
    doc.setFillColor(255, 200, 100);
    doc.rect(14, yPos, 182, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('Additional Information', 16, yPos + 5);

    yPos += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Status: ${row.status === 'Credited' ? 'Credited - Done' : 'Pending'}`, 16, yPos);
    doc.text(`Payment Status: ${row.status}`, 120, yPos);

    const fileName = `Payslip_${row.name.replace(/\s+/g, '_')}_${selectedMonth}.pdf`;
    doc.save(fileName);

    toast({
      title: 'Payslip Generated',
      description: `Payslip for ${row.name} has been downloaded.`,
    });
  };

  const exportToSalaryXLSX = () => {
    const wb = XLSX.utils.book_new();

    const headers = [
      'Sl.No',
      'Employee Name',
      'Month',
      'Month Salary',
      'Attendance Status',
      'Total Work Hrs',
      'Total Pending Hrs',
      'Month Days',
      'Pay Days',
      'Present Days',
      'P.D Pay',
      'H.D',
      'H.D Pay',
      'L.D',
      'L.D Pay',
      'OT Hrs',
      'OT Amt',
      'Sunday Pay',
      'Sunday Allowance',
      'Special Allowance',
      'Basic',
      'HRA',
      'C.A',
      'Other Allowance',
      'SP Allowance',
      'Total Gross',
      'PF',
      'ESI',
      'Loan',
      'Total Deductions',
      'Net Pay',
      'Bank A/c No',
      'PAN No',
      'ESI No',
      'PF No',
      'Status',
    ];

    const monthStr = new Date(
      selectedMonth + '-01',
    ).toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });

    const data = payroll.map((row, idx) => {
      const otHrs = Math.floor(row.otMinutes / 60);
      const otMins = row.otMinutes % 60;
      const otDisplay = `${otHrs
        .toString()
        .padStart(2, '0')}:${otMins
          .toString()
          .padStart(2, '0')}`;

      return [
        idx + 1,
        row.name,
        monthStr,
        row.monthlySalary,
        row.attendanceStatus,
        formatHoursToHMM(row.totalWorkHrs),
        formatHoursToHMM(row.totalPendingHrs),
        row.totalDays,
        row.payableDays.toFixed(1),
        row.presentDays,
        row.pdPay,
        row.halfDays,
        row.hdPay,
        row.leaveDays,
        row.ldPay,
        otDisplay,
        row.otAmount,
        row.sundayPay,
        row.sundayAllowance,
        row.additionalSpAllowance,
        row.basic,
        row.hra,
        row.conveyance,
        row.otherAllowance,
        row.additionalSpAllowance,
        row.totalEarnings,
        row.pf,
        row.esi,
        row.loanDeduction,
        row.totalDeductions,
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
        title: 'Only Admin / HR can credit salary',
        variant: 'destructive',
      });
      return;
    }

    if (row.attendanceStatus !== 'accepted') {
      toast({
        title: 'Attendance not accepted',
        description:
          'Salary can be credited only after attendance approval.',
        variant: 'destructive',
      });
      return;
    }

    if (row.status === 'Credited') {
      toast({
        title: 'Already credited',
        description:
          'This employee salary has already been credited for this month.',
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
      await set(
        ref(
          database,
          `hr/payrollCredited/${selectedMonth}/${emp.id}`,
        ),
        true,
      );

      setPayroll((prev) =>
        prev.map((r) =>
          r.employeeId === row.employeeId
            ? { ...r, status: 'Credited' }
            : r,
        ),
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
    { earnings: 0, deductions: 0, net: 0 },
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-bold">
            Payroll{' '}
            {new Date(
              selectedMonth + '-01',
            ).toLocaleDateString('en-IN', {
              month: 'long',
              year: 'numeric',
            })}
          </h1>
          <p className="text-muted-foreground">
            All employees with attendance, bonus, loan EMI skip and final net pay details.
          </p>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <Label>Month</Label>
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-48"
            />
          </div>

          <Button
            onClick={exportToSalaryXLSX}
            size="lg"
            variant="outline"
          >
            <Download className="w-5 h-5 mr-2" /> Export Payroll
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Employees (All)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {payroll.length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Total Gross
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-900">
              ₹{totals.earnings.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-orange-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Deductions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-700">
              ₹{totals.deductions.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Credited
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-700">
              {
                payroll.filter((r) => r.status === 'Credited')
                  .length
              }
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Net Payable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ₹{totals.net.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            Payroll Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-16">
              Loading payroll data...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-slate-100">
                    <TableHead>Sl.No</TableHead>
                    <TableHead>Employee Name</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead>Bonus</TableHead>
                    <TableHead>Attendance</TableHead>
                    <TableHead className="text-center">Total Work Hrs</TableHead>
                    <TableHead className="text-center">Total Pending Hrs</TableHead>
                    <TableHead>Month Days</TableHead>
                    <TableHead>Pay Days</TableHead>
                    <TableHead>Present Days</TableHead>
                    <TableHead>P.D Pay</TableHead>
                    <TableHead>H.D</TableHead>
                    <TableHead>H.D Pay</TableHead>
                    <TableHead>L.D</TableHead>
                    <TableHead>L.D Pay</TableHead>
                    <TableHead>OT Hrs</TableHead>
                    <TableHead>OT Amt</TableHead>
                    <TableHead>Special Allowance</TableHead>
                    <TableHead>Basic</TableHead>
                    <TableHead>HRA</TableHead>
                    <TableHead>C.A</TableHead>
                    <TableHead>Other Allowance</TableHead>
                    <TableHead>SP Allowance</TableHead>
                    <TableHead>Total Gross</TableHead>
                    <TableHead>PF</TableHead>
                    <TableHead>ESI</TableHead>
                    <TableHead>Loan</TableHead>
                    <TableHead>Total Deductions</TableHead>
                    <TableHead className="font-bold text-green-600">
                      Net Pay
                    </TableHead>
                    <TableHead>Bank A/c No</TableHead>
                    <TableHead>PAN No</TableHead>
                    <TableHead>ESI No</TableHead>
                    <TableHead>PF No</TableHead>
                    <TableHead>Status / Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payroll.map((row, idx) => {
                    const otHrs = Math.floor(row.otMinutes / 60);
                    const otMins = row.otMinutes % 60;
                    const otDisplay = `${otHrs
                      .toString()
                      .padStart(2, '0')}:${otMins
                        .toString()
                        .padStart(2, '0')}`;

                    const attBadgeVariant =
                      row.attendanceStatus === 'accepted'
                        ? 'default'
                        : row.attendanceStatus === 'rejected'
                          ? 'destructive'
                          : 'secondary';

                    const multiplier = (row.department === 'Staff' || row.department?.toLowerCase() === 'staff') ? 1 : 1.5;
                    const empOtRate = Number((row.perDayRate / 8) * multiplier).toFixed(2);

                    return (
                      <TableRow
                        key={row.employeeId}
                        className={
                          row.status === 'Credited'
                            ? 'bg-green-50'
                            : ''
                        }
                      >
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell className="font-semibold">
                          {row.name}
                          <div className="text-xs text-gray-500">
                            OT Rate: ₹{empOtRate}/hr
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(
                            selectedMonth + '-01',
                          ).toLocaleDateString('en-IN', {
                            month: 'short',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell>
                          {row.bonusName === '-'
                            ? '-'
                            : `${row.bonusName} (₹${row.bonusAmount})`}
                        </TableCell>
                        <TableCell>
                          <Badge variant={attBadgeVariant}>
                            {row.attendanceStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-semibold text-blue-700">
                          {formatHoursToHMM(row.totalWorkHrs)}
                        </TableCell>
                        <TableCell className="text-center font-semibold text-red-600">
                          {formatHoursToHMM(row.totalPendingHrs)}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.totalDays}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.payableDays.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.presentDays}
                        </TableCell>
                        <TableCell>
                          ₹{row.pdPay.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.halfDays}
                        </TableCell>
                        <TableCell>
                          ₹{row.hdPay.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.leaveDays}
                        </TableCell>
                        <TableCell>
                          ₹{row.ldPay.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          {otDisplay}
                        </TableCell>
                        <TableCell className="font-bold text-blue-700">
                          ₹{row.otAmount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          ₹{row.additionalSpAllowance.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          ₹{row.basic.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          ₹{row.hra.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          ₹{row.conveyance.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          ₹{row.otherAllowance.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          ₹{row.additionalSpAllowance.toFixed(2)}
                        </TableCell>
                        <TableCell className="font-bold">
                          ₹{row.totalEarnings.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-red-600">
                          -₹{row.pf.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-red-600">
                          -₹{row.esi.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={row.loanDeduction}
                            onChange={(e) =>
                              handleLoanDeductionChange(
                                row.employeeId,
                                e.target.value
                              )
                            }
                            className="w-24 h-8 text-right text-red-600 font-semibold"
                            min="0"
                          />
                        </TableCell>
                        <TableCell className="text-red-600">
                          -₹{row.totalDeductions.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-2xl font-bold text-green-600">
                          ₹{row.netPayable.toFixed(2)}
                        </TableCell>
                        <TableCell>{row.bankAccount}</TableCell>
                        <TableCell>{row.panNumber}</TableCell>
                        <TableCell>{row.esiNumber}</TableCell>
                        <TableCell>{row.pfNumber}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant={
                                row.status === 'Credited'
                                  ? 'default'
                                  : 'secondary'
                              }
                            >
                              {row.status}
                            </Badge>
                            <Button
                              size="sm"
                              className="mt-1"
                              disabled={
                                row.status === 'Credited' ||
                                row.attendanceStatus !== 'accepted' ||
                                !canCredit
                              }
                              onClick={() => creditSingleEmployee(row)}
                            >
                              {row.status === 'Credited'
                                ? 'Credited'
                                : 'Credit'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-1"
                              onClick={() => generatePayslipPDF(row)}
                            >
                              <FileText className="w-4 h-4 mr-1" />
                              Payslip
                            </Button>
                            <span className="text-[11px] text-muted-foreground text-left">
                              Net Pay: ₹{row.netPayable.toFixed(2)}
                              {row.bonusName !== '-' &&
                                ` · Bonus: ${row.bonusName} (₹${row.bonusAmount})`}
                              {row.loanDeduction === 0 &&
                                ' · Loan EMI skipped'}
                            </span>
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
  );
}
