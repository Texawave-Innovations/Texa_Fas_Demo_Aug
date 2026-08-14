'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Download,
  CheckCircle2,
  Calendar,
  Eye,
  Save,
  AlertCircle,
  Check,
  X,
  Users,
  IndianRupee,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { toast } from '@/hooks/use-toast';
import {
  getAllRecords,
  updateRecord,
  getRecordById,
} from '@/services/firebase';
import { database } from '@/services/firebase';
import { ref, onValue } from 'firebase/database';
import type { Employee } from '@/types';
import * as XLSX from 'xlsx';

type PaymentStatus = 'Pending' | 'Paid';

type EsiEntry = {
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  month: string;
  esiIncluded: boolean;
  esiAmount: number;
  totalGrossEarnings: number;
  paymentStatus: PaymentStatus;
  salaryCredited: boolean;
  updatedAt: number;
};

interface AttendanceRecord {
  date: string;
  status: string;
  otHrs?: number;
  employeeId?: string;
  shiftType?: 'day' | 'night' | 'sunday';
  workHrs?: number;
  totalHours?: number;
  pendingHrs?: number;
}

interface Holiday {
  id: string;
  date: string;
  name: string;
  departments: string[];
  isRecurring: boolean;
}

const ESI_THRESHOLD = 21000;

const yearOptions = (() => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear - 5; y <= currentYear + 1; y++) {
    years.push(y);
  }
  return years.sort((a, b) => b - a);
})();

const monthOptions = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

// ────────────────────────────────────────────────
// Helper functions (SAME AS PAYROLL.TSX)
// ────────────────────────────────────────────────

const getMonthlySalary = (emp: Employee): number => {
  const salary = (emp as any).salary;
  if (salary?.grossMonthly) return salary.grossMonthly;
  if (salary) {
    const { basic = 0, hra = 0, conveyance = 0, otherAllowance = 0, specialAllowance = 0 } = salary;
    const total = basic + hra + conveyance + otherAllowance + specialAllowance;
    if (total > 0) return total;
  }
  return 0;
};

const isESIApplicable = (emp: Employee): boolean => {
  return (emp as any).esiApplicable === true || (emp as any).includeESI === true;
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

const Esi: React.FC = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [esiData, setEsiData] = useState<Record<string, Record<string, EsiEntry>>>({});
  const [attendanceBasedEsi, setAttendanceBasedEsi] = useState<
    Record<string, Record<string, { totalGrossEarnings: number; esiAmount: number }>>
  >({});
  const [payrollCreditedStatus, setPayrollCreditedStatus] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [holidays, setHolidays] = useState<Record<string, Record<string, Holiday>>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'view'>('edit');

  const [year, setYear] = useState<string>(() => `${new Date().getFullYear()}`);
  const [month, setMonth] = useState<string>(() => {
    const m = new Date().getMonth() + 1;
    return `${m}`.padStart(2, '0');
  });

  const [viewYear, setViewYear] = useState<string>(() => `${new Date().getFullYear()}`);
  const [viewMonth, setViewMonth] = useState<string>(() => {
    const m = new Date().getMonth() + 1;
    return `${m}`.padStart(2, '0');
  });

  const monthKey = useMemo(() => `${year}-${month}`, [year, month]);
  const viewMonthKey = useMemo(() => `${viewYear}-${viewMonth}`, [viewYear, viewMonth]);
  const currentEntries = useMemo(() => esiData[monthKey] || {}, [esiData, monthKey]);
  const viewEntries = useMemo(() => esiData[viewMonthKey] || {}, [esiData, viewMonthKey]);

  // ────────────────────────────────────────────────
  // Load employees
  // ────────────────────────────────────────────────
  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const empList = await getAllRecords('hr/employees');
        const active = (Array.isArray(empList) ? empList : Object.values(empList || {}))
          .filter((e: any) => e.status !== 'inactive');
        setEmployees(active as Employee[]);
      } catch (err) {
        console.error(err);
        toast({
          title: 'Error',
          description: 'Failed to load employees',
          variant: 'destructive',
        });
      }
    };
    loadEmployees();
  }, []);

  // ────────────────────────────────────────────────
  // Load payrollCredited status
  // ────────────────────────────────────────────────
  useEffect(() => {
    const targetMonth = activeTab === 'edit' ? monthKey : viewMonthKey;
    const payrollCreditedRef = ref(database, `hr/payrollCredited/${targetMonth}`);

    const unsubscribe = onValue(payrollCreditedRef, (snap) => {
      const data = snap.val() || {};
      setPayrollCreditedStatus((prev) => ({
        ...prev,
        [targetMonth]: data,
      }));
    });

    return () => unsubscribe();
  }, [monthKey, viewMonthKey, activeTab]);

  // ────────────────────────────────────────────────
  // Load holidays
  // ────────────────────────────────────────────────
  useEffect(() => {
    const holidaysRef = ref(database, 'hr/holidays');
    const unsubscribe = onValue(holidaysRef, (snap) => {
      setHolidays(snap.val() || {});
    });
    return () => unsubscribe();
  }, []);



  // ────────────────────────────────────────────────
  // Load existing ESI data
  // ────────────────────────────────────────────────
  useEffect(() => {
    if (employees.length === 0) return;
    const loadEsiData = async () => {
      setLoading(true);
      try {
        const data = (await getRecordById('hr/esi', monthKey)) || {};
        setEsiData((prev) => ({
          ...prev,
          [monthKey]: data as Record<string, EsiEntry>,
        }));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadEsiData();
  }, [monthKey, employees]);

  useEffect(() => {
    if (employees.length === 0 || activeTab !== 'view') return;
    const loadViewData = async () => {
      setLoading(true);
      try {
        const data = (await getRecordById('hr/esi', viewMonthKey)) || {};
        setEsiData((prev) => ({
          ...prev,
          [viewMonthKey]: data as Record<string, EsiEntry>,
        }));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadViewData();
  }, [viewMonthKey, employees, activeTab]);

  // ────────────────────────────────────────────────
  // Calculate ESI (EXACT SAME LOGIC AS PAYROLL.TSX)
  // ────────────────────────────────────────────────
  useEffect(() => {
    if (employees.length === 0) return;

    const targetMonth = activeTab === 'edit' ? monthKey : viewMonthKey;
    const [y, m] = targetMonth.split('-').map(Number);
    const totalDays = new Date(y, m, 0).getDate();
    const sundaysInMonth = countSundaysInMonth(y, m);
    const monthPrefix = `${targetMonth}-`;

    const attendanceRef = ref(database, 'hr/attendance');
    const unsubscribe = onValue(
      attendanceRef,
      (snap) => {
        const allAttendance = snap.val() || {};
        const monthAttendance: AttendanceRecord[] = [];

        Object.keys(allAttendance).forEach((date) => {
          if (date.startsWith(monthPrefix)) {
            const dayRecords = allAttendance[date];
            Object.values(dayRecords).forEach((rec: any) =>
              monthAttendance.push(rec as AttendanceRecord)
            );
          }
        });

        const calculatedEsi: Record<string, { totalGrossEarnings: number; esiAmount: number }> = {};

        employees.forEach((emp) => {
          const empAttendance = monthAttendance.filter((r) => r.employeeId === emp.id);

          let present = 0;
          let half = 0;
          let totalOtMinutes = 0;
          let sundayWorkedCount = 0;
          let sundayAbsentCount = 0;

          empAttendance.forEach((rec) => {
            const recDate = new Date(rec.date);
            const isSundayDate = recDate.getDay() === 0;

            if (isSundayDate) {
              if (rec.status === 'Absent' || rec.status === 'Leave') {
                sundayAbsentCount++;
              } else if (rec.status === 'Present') {
                sundayWorkedCount++;
                if ((emp as any).department === 'Staff') {
                  present++;
                } else if ((emp as any).department === 'Worker' || (emp as any).department === 'Other Workers') {
                  const hrs = typeof rec.workHrs === 'number' ? rec.workHrs : typeof rec.totalHours === 'number' ? rec.totalHours : 0;
                  totalOtMinutes += Math.round(hrs * 60);
                }
              }
            } else if (!isSundayDate) {
              if (rec.status === 'Present') {
                present++;
              } else if (rec.status === 'Half Day') {
                half++;
              }
            }

            // OT Hours (excluding Sunday OT for workers, which is added separately)
            if (typeof rec.otHrs === 'number' && rec.otHrs > 0 && !isSundayDate) {
              totalOtMinutes += Math.round(rec.otHrs * 60);
            }
          });

          // Add Sunday hours as OT for Workers
          if ((emp as any).department === 'Worker' || (emp as any).department === 'Other Workers') {
            empAttendance.forEach((rec) => {
              const recDate = new Date(rec.date);
              const isSundayDate = recDate.getDay() === 0;
              if (isSundayDate && rec.status === 'Present') {
                const wHrs = typeof rec.workHrs === 'number' ? rec.workHrs : 0;
                const oHrs = typeof rec.otHrs === 'number' ? rec.otHrs : 0;
                const totalSunHrs = typeof rec.totalHours === 'number' ? rec.totalHours : (wHrs + oHrs);
                totalOtMinutes += Math.round(totalSunHrs * 60);
              }
            });
          }

          // Get applicable holidays
          const monthHolidays = holidays[targetMonth] || {};
          let applicableHolidaysCount = 0;
          Object.values(monthHolidays).forEach((holiday: Holiday) => {
            const appliesTo =
              holiday.departments.includes('All') ||
              holiday.departments.includes((emp as any).department || '');
            if (appliesTo) applicableHolidaysCount++;
          });

          // Calculate full working days (same logic as payroll)
          const requiredDaysForFull = totalDays === 31 ? 27 : 26;
          const adjustedRequiredDays = requiredDaysForFull - applicableHolidaysCount;
          const fullWorkingDays = present >= adjustedRequiredDays ? totalDays : present;

          // Calculate components
          const monthlySalary = getMonthlySalary(emp);
          const perDayRate = monthlySalary / totalDays;

          const effectiveSundayCount = sundaysInMonth - sundayAbsentCount;
          
          const payableDays = fullWorkingDays + effectiveSundayCount + applicableHolidaysCount + (half * 0.5);
          const pdPay = Math.round(payableDays * perDayRate);
          const hdPay = 0; // Merged into pdPay

          // OT calculation
          const multiplier = ((emp as any).department === 'Staff' || (emp as any).department?.toLowerCase() === 'staff') ? 1 : 1.5;
          const dynamicOtRate = (perDayRate / 8) * multiplier;
          const otAmount = Math.round((totalOtMinutes / 60) * dynamicOtRate);

          // Sunday Allowance logic
          let sundayAllowance = 0;
          if ((emp as any).department === 'Staff' || (emp as any).department?.toLowerCase() === 'staff') {
            sundayAllowance = sundayWorkedCount * 500;
          } else {
            sundayAllowance = 0; // Worker Sunday hours are now included in normal OT
          }

          // Full Month Bonus
          const fullMonthBonus = present >= adjustedRequiredDays ? Math.round(400) : 0;

          // Master Special Allowance
          const salary = (emp as any).salary || {};
          const masterSpecialAllowance = Math.round(salary.additionalSpecialAllowance || 0);

          // Total Gross earnings (SAME AS PAYROLL.TSX)
          // Total Gross = pdPay + Special Allowance + fullMonthBonus + OT + Sunday Allowance
          const totalGrossEarnings = pdPay + hdPay + otAmount + sundayAllowance + masterSpecialAllowance + fullMonthBonus;

          // ESI calculation
          const isEligible = isESIApplicable(emp) && monthlySalary <= ESI_THRESHOLD;
          const esiAmount = isEligible && totalGrossEarnings > 0
            ? Math.round(totalGrossEarnings * 0.0075)
            : 0;

          calculatedEsi[emp.id!] = { totalGrossEarnings, esiAmount };
        });

        setAttendanceBasedEsi((prev) => ({
          ...prev,
          [targetMonth]: calculatedEsi,
        }));
        setLoading(false);
      },
      { onlyOnce: true }
    );

    return () => unsubscribe();
  }, [monthKey, viewMonthKey, employees, activeTab, holidays]);

  // ────────────────────────────────────────────────
  // Get ESI entry
  // ────────────────────────────────────────────────
  const isSalaryCredited = (empId: string, targetMonth: string): boolean => {
    const monthStatus = payrollCreditedStatus[targetMonth];
    return monthStatus?.[empId] === true;
  };

  const getEntry = (empId: string, forView = false): EsiEntry => {
    const entries = forView ? viewEntries : currentEntries;
    const saved = entries[empId];

    const emp = employees.find((e) => e.id === empId);
    if (!emp) return {} as EsiEntry;

    const targetMonth = forView ? viewMonthKey : monthKey;
    const masterInclude = isESIApplicable(emp);
    const monthlySalary = getMonthlySalary(emp);
    const isEligible = masterInclude && monthlySalary <= ESI_THRESHOLD;

    const calculated = attendanceBasedEsi[targetMonth]?.[empId] || { totalGrossEarnings: 0, esiAmount: 0 };
    const salaryCredited = isSalaryCredited(empId, targetMonth);

    if (saved) {
      return {
        ...saved,
        totalGrossEarnings: calculated.totalGrossEarnings,
        esiAmount: saved.esiIncluded ? calculated.esiAmount : 0,
        salaryCredited,
      };
    }

    return {
      employeeId: empId,
      employeeName: emp.name || '',
      employeeCode: (emp as any).employeeId,
      month: targetMonth,
      esiIncluded: isEligible,
      totalGrossEarnings: calculated.totalGrossEarnings,
      esiAmount: isEligible ? calculated.esiAmount : 0,
      paymentStatus: 'Pending',
      salaryCredited,
      updatedAt: Date.now(),
    };
  };

  const handleIncludedChange = (empId: string, checked: boolean) => {
    const entry = getEntry(empId);
    const calculated = attendanceBasedEsi[monthKey]?.[empId] || { totalGrossEarnings: 0, esiAmount: 0 };

    setEsiData((prev) => ({
      ...prev,
      [monthKey]: {
        ...prev[monthKey],
        [empId]: {
          ...entry,
          esiIncluded: checked,
          esiAmount: checked ? calculated.esiAmount : 0,
          updatedAt: Date.now(),
        },
      },
    }));
    setHasUnsavedChanges(true);
  };

  const handlePaymentStatusChange = (empId: string, status: PaymentStatus) => {
    const entry = getEntry(empId);
    setEsiData((prev) => ({
      ...prev,
      [monthKey]: {
        ...prev[monthKey],
        [empId]: { ...entry, paymentStatus: status, updatedAt: Date.now() },
      },
    }));
    setHasUnsavedChanges(true);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const cleaned: Record<string, EsiEntry> = {};
      employees.forEach((emp) => {
        const entry = getEntry(emp.id!);
        if (entry.esiIncluded) {
          cleaned[emp.id!] = entry;
        }
      });

      await updateRecord('hr/esi', monthKey, cleaned || {});
      setHasUnsavedChanges(false);
      toast({
        title: 'Success',
        description: `ESI data for ${monthKey} saved successfully!`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: 'Error',
        description: 'Failed to save ESI data',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExportXlsx = (forView = false) => {
    const targetMonthKey = forView ? viewMonthKey : monthKey;
    const rows = employees
      .map((emp) => {
        const entry = getEntry(emp.id!, forView);
        const monthlySalary = getMonthlySalary(emp);
        const masterIncludeESI = isESIApplicable(emp);
        const isEligible = monthlySalary <= ESI_THRESHOLD;

        if (!entry.esiIncluded) return null;

        return {
          'Emp Code': (emp as any).employeeId || '-',
          'Employee Name': emp.name,
          Department: (emp as any).department || '-',
          'Master Monthly Salary': monthlySalary,
          'Total Gross Earnings': entry.totalGrossEarnings,
          'ESI Rate': '0.75%',
          'Master ESI': masterIncludeESI ? 'Yes' : 'No',
          'Eligible (≤21k)': isEligible ? 'Yes' : 'No',
          'ESI Amount': entry.esiAmount,
          'Payment Status': entry.paymentStatus,
          'Salary Credited': entry.salaryCredited ? 'Yes' : 'No',
          Month: targetMonthKey,
        };
      })
      .filter(Boolean);

    const totalEsi = rows.reduce((sum, r) => sum + ((r as any)['ESI Amount'] as number), 0);

    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.sheet_add_aoa(
      ws,
      [
        [],
        ['SUMMARY'],
        ['Total Employees with ESI', rows.length],
        ['Total ESI Amount', totalEsi],
        ['Month', targetMonthKey],
        ['Note', 'ESI calculated on Total Gross Earnings (PD+HD+Holiday+Sunday+OT) × 0.75%'],
      ],
      { origin: -1 }
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ESI Register');
    XLSX.writeFile(wb, `ESI_Register_${targetMonthKey}.xlsx`);
  };

  // Calculate totals
  const totals = useMemo(() => {
    const entries = activeTab === 'edit' ? currentEntries : viewEntries;
    return employees.reduce(
      (acc, emp) => {
        const entry = getEntry(emp.id!, activeTab === 'view');
        if (entry.esiIncluded) {
          acc.totalEsi += entry.esiAmount;
          acc.count += 1;
          if (entry.paymentStatus === 'Paid') acc.paid += 1;
          if (entry.salaryCredited) acc.credited += 1;
        }
        return acc;
      },
      { totalEsi: 0, count: 0, paid: 0, credited: 0 }
    );
  }, [currentEntries, viewEntries, employees, attendanceBasedEsi, activeTab]);

  const allPaid = totals.count > 0 && totals.paid === totals.count;

  if (loading && employees.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading employees...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">ESI Register</h1>
            <p className="text-sm text-muted-foreground">
              ESI = Total Gross Earnings × 0.75% (PD + HD + Holiday + Sunday + OT)
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => handleExportXlsx(activeTab === 'view')}>
            <Download className="mr-2 h-4 w-4" />
            Export Excel
          </Button>
          {activeTab === 'edit' && (
            <Button onClick={handleSaveAll} disabled={saving || !hasUnsavedChanges}>
              {saving ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">ESI Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.count}</div>
            <p className="text-xs text-muted-foreground">out of {employees.length} total</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-700">Total ESI Amount</CardTitle>
            <IndianRupee className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900">
              ₹{totals.totalEsi.toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-blue-700">
              For {activeTab === 'edit' ? monthKey : viewMonthKey}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-green-700">Salary Credited</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900">{totals.credited}</div>
            <p className="text-xs text-green-700">Employees with salary credited</p>
          </CardContent>
        </Card>

        {activeTab === 'edit' && (
          <Card className={allPaid ? 'bg-green-50' : 'bg-orange-50'}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">ESI Payment Status</CardTitle>
              {allPaid ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-orange-600" />
              )}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totals.paid} / {totals.count}
              </div>
              <p className="text-xs text-muted-foreground">
                {allPaid ? 'All ESI payments completed' : `${totals.count - totals.paid} pending`}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'edit' | 'view')}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="edit">
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Edit Mode
          </TabsTrigger>
          <TabsTrigger value="view">
            <Eye className="mr-2 h-4 w-4" />
            View Only
          </TabsTrigger>
        </TabsList>

        {/* Edit Mode */}
        <TabsContent value="edit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Select Month to Edit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((y) => (
                        <SelectItem key={y} value={`${y}`}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Month</Label>
                  <Select value={month} onValueChange={setMonth}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>ESI Contributions - {monthKey}</CardTitle>
                  <CardDescription>
                    Synced with payroll: Includes Present, Half Day, Holiday, Sunday & OT Pay
                  </CardDescription>
                </div>
                {!allPaid && totals.count > 0 && (
                  <Badge variant="destructive">{totals.count - totals.paid} Pending ESI Payments</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
                  <p className="ml-4">Loading ESI data...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Code</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Master Salary</TableHead>
                        <TableHead>Total Gross Earnings</TableHead>
                        <TableHead className="text-center">Master ESI</TableHead>
                        <TableHead className="text-center">Eligible (≤21k)</TableHead>
                        <TableHead className="text-center">Include</TableHead>
                        <TableHead>ESI Amount (0.75%)</TableHead>
                        <TableHead className="text-center">Salary Status</TableHead>
                        <TableHead className="text-center">ESI Payment</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.map((emp) => {
                        const entry = getEntry(emp.id!);
                        const masterIncludeESI = isESIApplicable(emp);
                        const monthlySalary = getMonthlySalary(emp);
                        const isEligible = monthlySalary <= ESI_THRESHOLD;

                        return (
                          <TableRow
                            key={emp.id}
                            className={
                              entry.paymentStatus === 'Paid' && entry.esiIncluded ? 'bg-green-50' : ''
                            }
                          >
                            <TableCell className="font-mono text-sm">
                              {(emp as any).employeeId || '-'}
                            </TableCell>
                            <TableCell className="font-medium">{emp.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {(emp as any).department || '-'}
                            </TableCell>
                            <TableCell className="text-gray-600">
                              ₹{monthlySalary.toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell className="font-medium text-blue-700">
                              ₹{entry.totalGrossEarnings.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={masterIncludeESI ? 'default' : 'secondary'}>
                                {masterIncludeESI ? 'Yes' : 'No'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={isEligible ? 'default' : 'destructive'}>
                                {isEligible ? 'Yes' : 'No'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={entry.esiIncluded}
                                onCheckedChange={(c) => handleIncludedChange(emp.id!, !!c)}
                                disabled={!masterIncludeESI || !isEligible}
                              />
                            </TableCell>
                            <TableCell>
                              {entry.esiIncluded ? (
                                <span className="font-semibold text-green-700">
                                  ₹{entry.esiAmount.toLocaleString('en-IN')}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-500">
                                  {!isEligible ? 'Salary >21k' : 'ESI not needed'}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <StatusBadge status={entry.salaryCredited ? 'Credited' : 'Pending'} tone={entry.salaryCredited ? 'green' : undefined} />
                            </TableCell>
                            <TableCell className="text-center">
                              {entry.esiIncluded ? (
                                <Select
                                  value={entry.paymentStatus}
                                  onValueChange={(v) =>
                                    handlePaymentStatusChange(emp.id!, v as PaymentStatus)
                                  }
                                >
                                  <SelectTrigger className="h-8 w-28">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="Paid">Paid</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
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
        </TabsContent>

        {/* View Mode */}
        <TabsContent value="view" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Eye className="h-5 w-5" />
                View Historical Data
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Select value={viewYear} onValueChange={setViewYear}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((y) => (
                        <SelectItem key={y} value={`${y}`}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Month</Label>
                  <Select value={viewMonth} onValueChange={setViewMonth}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ESI Records - {viewMonthKey}</CardTitle>
              <CardDescription>Read-only view of historical data</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
                  <p className="ml-4">Loading ESI data...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Code</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Master Salary</TableHead>
                        <TableHead>Total Gross Earnings</TableHead>
                        <TableHead className="text-center">Eligible (≤21k)</TableHead>
                        <TableHead className="text-center">ESI Included</TableHead>
                        <TableHead>ESI Amount (0.75%)</TableHead>
                        <TableHead className="text-center">Salary Status</TableHead>
                        <TableHead className="text-center">ESI Payment</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.map((emp) => {
                        const entry = getEntry(emp.id!, true);
                        const monthlySalary = getMonthlySalary(emp);
                        const isEligible = monthlySalary <= ESI_THRESHOLD;

                        return (
                          <TableRow
                            key={emp.id}
                            className={
                              entry.paymentStatus === 'Paid' && entry.esiIncluded ? 'bg-green-50' : ''
                            }
                          >
                            <TableCell className="font-mono text-sm">
                              {(emp as any).employeeId || '-'}
                            </TableCell>
                            <TableCell className="font-medium">{emp.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {(emp as any).department || '-'}
                            </TableCell>
                            <TableCell className="text-gray-600">
                              ₹{monthlySalary.toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell className="font-medium text-blue-700">
                              ₹{entry.totalGrossEarnings.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={isEligible ? 'default' : 'destructive'}>
                                {isEligible ? 'Yes' : 'No'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              {entry.esiIncluded ? (
                                <Check className="mx-auto h-4 w-4 text-green-600" />
                              ) : (
                                <X className="mx-auto h-4 w-4 text-gray-400" />
                              )}
                            </TableCell>
                            <TableCell>
                              {entry.esiIncluded ? (
                                <span className="font-semibold text-green-700">
                                  ₹{entry.esiAmount.toLocaleString('en-IN')}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-500">
                                  {!isEligible ? 'Salary >21k' : 'ESI not needed'}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <StatusBadge status={entry.salaryCredited ? 'Credited' : 'Pending'} tone={entry.salaryCredited ? 'green' : undefined} />
                            </TableCell>
                            <TableCell className="text-center">
                              {entry.esiIncluded ? (
                                <StatusBadge status={entry.paymentStatus} />
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
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
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Esi;
