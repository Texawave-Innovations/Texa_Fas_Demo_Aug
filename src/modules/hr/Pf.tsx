'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Save,
  CheckCircle2,
  Calendar,
  Eye,
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
import { toast } from '@/hooks/use-toast';
import {
  getAllRecords,
  updateRecord,
} from '@/services/firebase';
import { database } from '@/services/firebase';
import { ref, onValue } from 'firebase/database';
import * as XLSX from 'xlsx';

type PaymentStatus = 'Pending' | 'Paid';

interface PfEntry {
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  month: string;
  pfIncluded: boolean;
  pfAmount: number;
  paymentStatus: PaymentStatus;
  salaryCredited: boolean;
  updatedAt: number;
}

interface AttendanceRecord {
  date: string;
  status: string;
  employeeId?: string;
  shiftType?: 'day' | 'night' | 'sunday';
  workHrs?: number;
  totalHours?: number;
  otHrs?: number;
  pendingHrs?: number;
}

interface Holiday {
  id: string;
  date: string;
  name: string;
  departments: string[];
  isRecurring: boolean;
}

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  department: string;
  status?: string;
  pfApplicable?: boolean;
  includePF?: boolean;
  salary?: {
    basic: number;
    hra: number;
    conveyance: number;
    otherAllowance: number;
    grossMonthly: number;
  };
}

const yearOptions = (() => {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 10 }, (_, i) => currentYear - 5 + i).sort((a, b) => b - a);
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
  if (emp.salary?.grossMonthly) {
    return emp.salary.grossMonthly;
  }
  if (emp.salary) {
    const { basic = 0, hra = 0, conveyance = 0, otherAllowance = 0 } = emp.salary;
    const total = basic + hra + conveyance + otherAllowance;
    if (total > 0) return total;
  }
  return 0;
};

const getSalaryBreakdown = (emp: Employee) => {
  if (emp.salary) {
    return {
      basic: emp.salary.basic ?? 0,
      hra: emp.salary.hra ?? 0,
      conveyance: emp.salary.conveyance ?? 0,
      otherAllowance: emp.salary.otherAllowance ?? 0,
    };
  }
  return {
    basic: 0,
    hra: 0,
    conveyance: 0,
    otherAllowance: 0,
  };
};

const isPFApplicable = (emp: Employee): boolean => {
  return emp.pfApplicable === true || emp.includePF === true;
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

const Pf: React.FC = () => {
  const navigate = useNavigate();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pfData, setPfData] = useState<Record<string, Record<string, PfEntry>>>({});
  const [payrollCreditedStatus, setPayrollCreditedStatus] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [holidays, setHolidays] = useState<Record<string, Record<string, Holiday>>>({});
  const [attendanceBasedPf, setAttendanceBasedPf] = useState<
    Record<string, Record<string, number>>
  >({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'view'>('edit');

  const [year, setYear] = useState<string>(() => new Date().getFullYear().toString());
  const [month, setMonth] = useState<string>(() =>
    (new Date().getMonth() + 1).toString().padStart(2, '0')
  );

  const [viewYear, setViewYear] = useState<string>(() => new Date().getFullYear().toString());
  const [viewMonth, setViewMonth] = useState<string>(() =>
    (new Date().getMonth() + 1).toString().padStart(2, '0')
  );

  const monthKey = useMemo(() => `${year}-${month}`, [year, month]);
  const viewMonthKey = useMemo(() => `${viewYear}-${viewMonth}`, [viewYear, viewMonth]);

  // ────────────────────────────────────────────────
  // Load employees
  // ────────────────────────────────────────────────
  useEffect(() => {
    getAllRecords('hr/employees')
      .then((list: any) => {
        const active = (Array.isArray(list) ? list : Object.values(list || {}))
          .filter((e: Employee) => e.status !== 'inactive');
        setEmployees(active);
      })
      .catch((err) => {
        console.error(err);
        toast({ title: 'Error', description: 'Failed to load employees', variant: 'destructive' });
      });
  }, []);

  // ────────────────────────────────────────────────
  // Load payroll credited status
  // ────────────────────────────────────────────────
  useEffect(() => {
    const targetKey = activeTab === 'edit' ? monthKey : viewMonthKey;
    const payrollRef = ref(database, `hr/payrollCredited/${targetKey}`);

    const unsub = onValue(payrollRef, (snap) => {
      const val = snap.val() || {};
      setPayrollCreditedStatus((prev) => ({
        ...prev,
        [targetKey]: val,
      }));
    });

    return unsub;
  }, [monthKey, viewMonthKey, activeTab]);

  // ────────────────────────────────────────────────
  // Load holidays
  // ────────────────────────────────────────────────
  useEffect(() => {
    onValue(ref(database, 'hr/holidays'), (snap) => {
      setHolidays(snap.val() || {});
    });
  }, []);

  // ────────────────────────────────────────────────
  // Load existing PF data
  // ────────────────────────────────────────────────
  useEffect(() => {
    const targetKey = activeTab === 'edit' ? monthKey : viewMonthKey;
    const pfRef = ref(database, `hr/pf/${targetKey}`);

    const unsub = onValue(pfRef, (snap) => {
      const val = snap.val() || {};
      setPfData((prev) => ({
        ...prev,
        [targetKey]: val,
      }));
    });

    return unsub;
  }, [monthKey, viewMonthKey, activeTab]);

  // ────────────────────────────────────────────────
  // Calculate PF amount (EXACT SAME LOGIC AS PAYROLL.TSX)
  // ────────────────────────────────────────────────
  useEffect(() => {
    if (employees.length === 0) return;

    const targetKey = activeTab === 'edit' ? monthKey : viewMonthKey;
    const [y, m] = targetKey.split('-').map(Number);
    const totalDays = new Date(y, m, 0).getDate();
    const sundaysInMonth = countSundaysInMonth(y, m);
    const prefix = `${targetKey}-`;

    onValue(
      ref(database, 'hr/attendance'),
      (snap) => {
        const allAtt = snap.val() || {};
        const monthAtt: AttendanceRecord[] = [];

        Object.keys(allAtt).forEach((date) => {
          if (date.startsWith(prefix)) {
            Object.values(allAtt[date] || {}).forEach((r) => monthAtt.push(r as AttendanceRecord));
          }
        });

        const pfAmounts: Record<string, number> = {};

        employees.forEach((emp) => {
          const empAtt = monthAtt.filter((r) => r.employeeId === emp.id);

          let present = 0;
          let half = 0;
          let sundayWorkedCount = 0;
          let sundayAbsentCount = 0;

          empAtt.forEach((rec) => {
            const recDate = new Date(rec.date);
            const isSundayDate = recDate.getDay() === 0;

            if (isSundayDate) {
              if (rec.status === 'Absent' || rec.status === 'Leave') {
                sundayAbsentCount++;
              } else if (rec.status === 'Present') {
                sundayWorkedCount++;
                if (emp.department === 'Staff') {
                  present++;
                }
              }
            } else if (!isSundayDate) {
              if (rec.status === 'Present') {
                present++;
              } else if (rec.status === 'Half Day') {
                half++;
              }
            }
          });

          // Get applicable holidays
          const monthHolidays = holidays[targetKey] || {};
          let applicableHolidaysCount = 0;
          Object.values(monthHolidays).forEach((holiday: Holiday) => {
            const appliesTo =
              holiday.departments.includes('All') || holiday.departments.includes(emp.department || '');
            if (appliesTo) applicableHolidaysCount++;
          });

          // Calculate full working days
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

          // NEW LOGIC: Basic = P.D Pay / 2
          const basic = Math.round(pdPay / 2);
          
          // PF calculation (12% of Basic + Conveyance)
          // Since CA is manual, we use the master value as a fallback for PF calculation
          const masterConveyance = Math.round(emp.salary?.conveyance || 0);
          const pfBase = basic + masterConveyance;
          const pfAmt = isPFApplicable(emp) ? Math.round(pfBase * 0.12) : 0;

          pfAmounts[emp.id!] = pfAmt;
        });

        setAttendanceBasedPf((prev) => ({ ...prev, [targetKey]: pfAmounts }));
        setLoading(false);
      },
      { onlyOnce: true }
    );
  }, [employees, monthKey, viewMonthKey, activeTab, holidays]);

  // ────────────────────────────────────────────────
  // Get PF entry
  // ────────────────────────────────────────────────
  const getPfEntry = (empId: string, forView = false): PfEntry => {
    const key = forView ? viewMonthKey : monthKey;
    const entries = forView ? pfData[viewMonthKey] || {} : pfData[monthKey] || {};
    const saved = entries[empId];

    const emp = employees.find((e) => e.id === empId);
    if (!emp) return {} as PfEntry;

    const pfAmount = attendanceBasedPf[key]?.[empId] ?? 0;
    const credited = !!payrollCreditedStatus[key]?.[empId];

    if (saved) {
      return {
        ...saved,
        pfAmount: saved.pfIncluded ? pfAmount : 0,
        salaryCredited: credited,
      };
    }

    return {
      employeeId: empId,
      employeeName: emp.name || '',
      employeeCode: emp.employeeId,
      month: key,
      pfIncluded: isPFApplicable(emp),
      pfAmount: isPFApplicable(emp) ? pfAmount : 0,
      paymentStatus: 'Pending',
      salaryCredited: credited,
      updatedAt: Date.now(),
    };
  };

  const handleIncludeChange = (empId: string, checked: boolean) => {
    const entry = getPfEntry(empId);
    const pfAmount = attendanceBasedPf[monthKey]?.[empId] ?? 0;
    setPfData((prev) => ({
      ...prev,
      [monthKey]: {
        ...prev[monthKey],
        [empId]: {
          ...entry,
          pfIncluded: checked,
          pfAmount: checked ? pfAmount : 0,
          updatedAt: Date.now(),
        },
      },
    }));
    setHasUnsavedChanges(true);
  };

  const handleStatusChange = (empId: string, status: PaymentStatus) => {
    const entry = getPfEntry(empId);
    setPfData((prev) => ({
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
      const toSave: Record<string, PfEntry> = {};
      employees.forEach((emp) => {
        const e = getPfEntry(emp.id!);
        if (e.pfIncluded) toSave[emp.id!] = e;
      });
      await updateRecord('hr/pf', monthKey, toSave);
      setHasUnsavedChanges(false);
      toast({ title: 'Success', description: 'PF data saved.' });
    } catch (err) {
      toast({ title: 'Error', description: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const exportXlsx = (forView = false) => {
    const key = forView ? viewMonthKey : monthKey;
    const rows = employees
      .map((emp) => {
        const e = getPfEntry(emp.id!, forView);
        if (!e.pfIncluded) return null;
        return {
          'Emp Code': e.employeeCode || '-',
          'Employee Name': e.employeeName,
          Department: emp.department || '-',
          'PF Amount': e.pfAmount,
          'PF Included': e.pfIncluded ? 'Yes' : 'No',
          'PF Payment': e.paymentStatus,
          'Salary Credited': e.salaryCredited ? 'Yes' : 'No',
          Month: key,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const total = rows.reduce((s, r) => s + r['PF Amount'], 0);

    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.sheet_add_aoa(ws, [['Total PF Amount', total]], { origin: -1 });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PF');
    XLSX.writeFile(wb, `PF_${key}.xlsx`);
  };

  // Calculate totals for summary
  const totals = useMemo(() => {
    const key = activeTab === 'edit' ? monthKey : viewMonthKey;
    return employees.reduce(
      (acc, emp) => {
        const entry = getPfEntry(emp.id!, activeTab === 'view');
        if (entry.pfIncluded) {
          acc.totalPf += entry.pfAmount;
          acc.count += 1;
          if (entry.paymentStatus === 'Paid') acc.paid += 1;
        }
        return acc;
      },
      { totalPf: 0, count: 0, paid: 0 }
    );
  }, [employees, pfData, attendanceBasedPf, monthKey, viewMonthKey, activeTab]);

  // ────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">PF Register</h1>
            <p className="text-sm text-muted-foreground">
              PF calculated as 12% of (Attendance-adjusted Basic + Conveyance)
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => exportXlsx(activeTab === 'view')}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          {activeTab === 'edit' && (
            <Button onClick={handleSaveAll} disabled={saving || !hasUnsavedChanges}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Employees</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.count}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-blue-700">Total PF Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900">
              ₹{totals.totalPf.toLocaleString('en-IN')}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-green-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-green-700">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900">{totals.paid}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-50 to-orange-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-orange-700">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-900">{totals.count - totals.paid}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'edit' | 'view')}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="edit">Edit Mode</TabsTrigger>
          <TabsTrigger value="view">View History</TabsTrigger>
        </TabsList>

        <TabsContent value="edit">
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Select Month</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-6 max-w-xl">
              <div>
                <Label>Year</Label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={y.toString()}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>PF Register – {monthKey}</CardTitle>
              <CardDescription>
                PF amounts are synchronized with payroll attendance calculations
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {loading ? (
                <div className="text-center py-20">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
                  <p className="mt-4 text-gray-600">Loading PF data...</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Code</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>PF Amount</TableHead>
                      <TableHead className="text-center">Master PF</TableHead>
                      <TableHead className="text-center">Include</TableHead>
                      <TableHead className="text-center">Salary Credited</TableHead>
                      <TableHead className="text-center">PF Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((emp) => {
                      const entry = getPfEntry(emp.id!);
                      const master = isPFApplicable(emp);

                      return (
                        <TableRow key={emp.id}>
                          <TableCell className="font-mono">{entry.employeeCode || '-'}</TableCell>
                          <TableCell className="font-medium">{entry.employeeName}</TableCell>
                          <TableCell>{emp.department || '-'}</TableCell>
                          <TableCell className="font-semibold text-blue-700">
                            ₹{entry.pfAmount.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={master ? 'default' : 'secondary'}>
                              {master ? 'Yes' : 'No'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={entry.pfIncluded}
                              onCheckedChange={(c) => handleIncludeChange(emp.id!, !!c)}
                              disabled={!master}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            {entry.salaryCredited ? (
                              <Badge className="bg-green-600">Yes</Badge>
                            ) : (
                              <Badge variant="secondary">No</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {entry.pfIncluded ? (
                              <Select
                                value={entry.paymentStatus}
                                onValueChange={(v) =>
                                  handleStatusChange(emp.id!, v as PaymentStatus)
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
                              '-'
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* View mode */}
        <TabsContent value="view">
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Select Month to View</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-6 max-w-xl">
              <div>
                <Label>Year</Label>
                <Select value={viewYear} onValueChange={setViewYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={y.toString()}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>PF Register – {viewMonthKey}</CardTitle>
              <CardDescription>Historical PF data (read-only)</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {loading ? (
                <div className="text-center py-20">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
                  <p className="mt-4 text-gray-600">Loading PF data...</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Code</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>PF Amount</TableHead>
                      <TableHead className="text-center">PF Included</TableHead>
                      <TableHead className="text-center">Salary Credited</TableHead>
                      <TableHead className="text-center">PF Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((emp) => {
                      const entry = getPfEntry(emp.id!, true);
                      return (
                        <TableRow key={emp.id}>
                          <TableCell className="font-mono">{entry.employeeCode || '-'}</TableCell>
                          <TableCell>{entry.employeeName}</TableCell>
                          <TableCell>{emp.department || '-'}</TableCell>
                          <TableCell className="font-semibold text-blue-700">
                            ₹{entry.pfAmount.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className="text-center">
                            {entry.pfIncluded ? (
                              <Check className="text-green-600 mx-auto h-5 w-5" />
                            ) : (
                              <X className="text-gray-400 mx-auto h-5 w-5" />
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {entry.salaryCredited ? (
                              <Badge className="bg-green-600">Yes</Badge>
                            ) : (
                              <Badge variant="secondary">No</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={entry.paymentStatus === 'Paid' ? 'default' : 'secondary'}>
                              {entry.paymentStatus}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Pf;
