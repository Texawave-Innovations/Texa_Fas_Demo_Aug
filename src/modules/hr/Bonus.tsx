// src/modules/hr/Bonus.tsx
import { useEffect, useMemo, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '@/services/firebase';
import { format } from 'date-fns';
import {
  Search,
  Download,
  Users,
  TrendingUp,
  IndianRupee,
  Calendar,
  Info,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';


interface Employee {
  id: string;
  employeeId: string;
  name: string;
  department: string;
  joiningDate?: string;
  salary: { grossMonthly: number; ctcLPA: number };
}


interface MonthlyLeaves {
  JAN: number;
  FEB: number;
  MAR: number;
  APR: number;
  MAY: number;
  JUN: number;
  JUL: number;
  AUG: number;
  SEP: number;
  OCT: number;
  NOV: number;
  DEC: number;
}


interface BonusCalculation extends MonthlyLeaves {
  employeeId: string;
  name: string;
  department: string;
  totalLeaves: number;
  totalDays: number;
  twDays: number;
  perMonthWages: number;
  ctc: number;
  leaveDifference: number;
  calculatedBonus: number;
  actualBonus: number;
}


const TOTAL_DAYS = 355;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];


function getMonthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { start, end, totalDays: end.getDate() };
}


export default function Bonus() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Record<string, any>>({});
  const [bonusCalculations, setBonusCalculations] = useState<BonusCalculation[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load employees using Firebase realtime listener (same as Approved.tsx)
  useEffect(() => {
    const empRef = ref(database, 'hr/employees');
    const unsub = onValue(empRef, (snap) => {
      const val = snap.val() || {};
      const list: Employee[] = Object.keys(val)
        .map((k) => ({
          id: k,
          employeeId: val[k].employeeId,
          name: val[k].name,
          department: val[k].department,
          salary: val[k].salary,
          joiningDate: val[k].joiningDate,
        }))
        .filter((e) => val[e.id].status === 'active' || val[e.id].status === 'Active');
      setEmployees(list);
      console.log('✅ Employees loaded:', list.length);
    });
    return () => unsub();
  }, []);

  // Load attendance using Firebase realtime listener (same as Approved.tsx)
  useEffect(() => {
    const attRef = ref(database, 'hr/attendance');
    const unsub = onValue(attRef, (snap) => {
      setAttendance(snap.val() || {});
      setLoading(false);
      console.log('📊 Attendance loaded');
    });
    return () => unsub();
  }, []);

  // Refresh manually
  const handleRefresh = () => {
    setRefreshing(true);
    toast({ title: 'Data refreshed from Firebase!' });
    setTimeout(() => setRefreshing(false), 500);
  };

  // ✅ EXACT SAME LOGIC AS APPROVED.TSX - Count leaves for a specific month
  const countLeavesForMonth = (empId: string, year: number, month: number): number => {
    const { start, end } = getMonthRange(year, month);
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

    let absentDays = 0;
    let halfDays = 0;

    Object.keys(attendance).forEach((dateStr) => {
      if (dateStr < startStr || dateStr > endStr) return;

      const dayRecords = attendance[dateStr] || {};
      const rec = Object.values<any>(dayRecords).find(
        (r: any) => r.employeeId === empId
      );

      const date = new Date(dateStr);
      const isSunday = date.getDay() === 0;

      if (!rec) {
        if (!isSunday) {
          absentDays++;
        }
        return;
      }

      if (rec.status === 'Present') {
        // Do nothing
      } else if (rec.status === 'Absent') {
        absentDays++;
      } else if (rec.status === 'Leave') {
        absentDays++; // Count leave as absent too (same as Approved.tsx)
      } else if (rec.status === 'Half Day') {
        halfDays++;
      }
      // Holiday and Week Off are not counted
    });

    // Total leaves = absentDays (includes Absent + Leave) + halfDays * 0.5
    return absentDays + (halfDays * 0.5);
  };

  // Calculate bonus for all employees
  useEffect(() => {
    if (employees.length === 0 || Object.keys(attendance).length === 0 || loading) {
      return;
    }

    console.log('✅ Calculating bonus for', employees.length, 'employees');

    const calculations: BonusCalculation[] = employees.map((emp) => {
      const monthlyLeaves: MonthlyLeaves = {
        JAN: 0,
        FEB: 0,
        MAR: 0,
        APR: 0,
        MAY: 0,
        JUN: 0,
        JUL: 0,
        AUG: 0,
        SEP: 0,
        OCT: 0,
        NOV: 0,
        DEC: 0,
      };

      let totalLeaves = 0;

      // Calculate leaves for each month using EXACT Approved.tsx logic
      MONTHS.forEach((month, index) => {
        const leaves = countLeavesForMonth(emp.id, selectedYear, index + 1);
        monthlyLeaves[month as keyof MonthlyLeaves] = Number(leaves.toFixed(1));
        totalLeaves += leaves;
      });

      const twDays = TOTAL_DAYS - totalLeaves;
      const leaveDifference = twDays / TOTAL_DAYS;
      const perMonthWages = emp.salary?.grossMonthly || 0;
      const ctc = emp.salary?.ctcLPA ? emp.salary.ctcLPA * 100000 : perMonthWages * 12;
      
      const calculatedBonus = (ctc * leaveDifference) / 12;
      const actualBonus = totalLeaves < 30 ? perMonthWages : calculatedBonus;

      return {
        employeeId: emp.employeeId,
        name: emp.name,
        department: emp.department,
        ...monthlyLeaves,
        totalLeaves: Number(totalLeaves.toFixed(1)),
        totalDays: TOTAL_DAYS,
        twDays: Number(twDays.toFixed(1)),
        perMonthWages,
        ctc,
        leaveDifference: Number(leaveDifference.toFixed(10)),
        calculatedBonus: Math.round(calculatedBonus),
        actualBonus: Math.round(actualBonus),
      };
    });

    console.log('✅ Bonus calculations complete!');
    setBonusCalculations(calculations);
  }, [employees, attendance, selectedYear, loading]);

  // Filter calculations
  const filteredCalculations = useMemo(
    () =>
      bonusCalculations.filter((calc) => {
        const q = searchTerm.toLowerCase();
        const matchesSearch =
          calc.name.toLowerCase().includes(q) ||
          calc.employeeId.toLowerCase().includes(q);
        const matchesDept = deptFilter === 'all' || calc.department === deptFilter;
        return matchesSearch && matchesDept;
      }),
    [bonusCalculations, searchTerm, deptFilter]
  );

  // Summary stats
  const totalEmployees = filteredCalculations.length;
  const totalBonusAmount = filteredCalculations.reduce((sum, calc) => sum + calc.actualBonus, 0);
  const totalLeavesCount = filteredCalculations.reduce((sum, calc) => sum + calc.totalLeaves, 0);
  const avgLeaveDifference =
    filteredCalculations.length > 0
      ? filteredCalculations.reduce((sum, calc) => sum + calc.leaveDifference, 0) / filteredCalculations.length
      : 0;

  // Export to Excel
  const exportToExcel = () => {
    const exportData = filteredCalculations.map((calc, index) => ({
      'SL.NO': index + 1,
      'NAME': calc.name,
      'JAN': calc.JAN,
      'FEB': calc.FEB,
      'MAR': calc.MAR,
      'APR': calc.APR,
      'MAY': calc.MAY,
      'JUN': calc.JUN,
      'JUL': calc.JUL,
      'AUG': calc.AUG,
      'SEP': calc.SEP,
      'OCT': calc.OCT,
      'NOV': calc.NOV,
      'DEC': calc.DEC,
      'No of Leaves': calc.totalLeaves,
      'TOTAL DAYS': calc.totalDays,
      'T.W.DAYS': calc.twDays,
      'PER MONTH WAGES': calc.perMonthWages,
      'CTC': calc.ctc,
      'Leave Difference': calc.leaveDifference,
      'Calculated Bonus': Math.round(calc.calculatedBonus),
      'Actual Bonus': Math.round(calc.actualBonus),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bonus');

    const fileName = `Bonus_Calculation_${selectedYear}_Yearly.xlsx`;
    XLSX.writeFile(wb, fileName);

    toast({
      title: 'Excel exported successfully!',
      description: fileName,
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Bonus Calculation - {selectedYear}</h1>
          <p className="text-muted-foreground">
            Yearly bonus calculation based on attendance (355 working days standard)
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Employees: {employees.length} | Attendance Dates: {Object.keys(attendance).length}
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleRefresh} 
            variant="outline"
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </Button>
          <Button onClick={exportToExcel} className="bg-green-600 hover:bg-green-700">
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700">Total Employees</p>
                <p className="text-3xl font-bold text-blue-900">{totalEmployees}</p>
              </div>
              <Users className="h-10 w-10 text-blue-600 opacity-70" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-emerald-700">Total Bonus Amount</p>
                <p className="text-2xl font-bold text-emerald-900">
                  ₹{Math.round(totalBonusAmount).toLocaleString()}
                </p>
              </div>
              <IndianRupee className="h-10 w-10 text-emerald-600 opacity-70" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-amber-700">Total Leaves</p>
                <p className="text-3xl font-bold text-amber-900">{totalLeavesCount.toFixed(1)}</p>
              </div>
              <Calendar className="h-10 w-10 text-amber-600 opacity-70" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-700">Avg Attendance %</p>
                <p className="text-3xl font-bold text-purple-900">
                  {(avgLeaveDifference * 100).toFixed(1)}%
                </p>
              </div>
              <TrendingUp className="h-10 w-10 text-purple-600 opacity-70" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Search Employee</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Name / ID"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label>Department</Label>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  <SelectItem value="Staff">Staff</SelectItem>
                  <SelectItem value="Worker">Worker</SelectItem>
                  <SelectItem value="Other Workers">Other Workers</SelectItem>
                  <SelectItem value="AR">AR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Year</Label>
              <Input
                type="number"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value || new Date().getFullYear()))}
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Info Alert */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-2">Bonus Calculation Logic (Same as Timesheet Approval):</p>
              <div className="space-y-1 mb-3">
                <p>✓ <strong>Calculated Bonus</strong> = (CTC × Leave Difference) ÷ 12</p>
                <p>✓ <strong>If leaves &lt; 30</strong> → Actual Bonus = Monthly Salary</p>
                <p>✓ <strong>If leaves ≥ 30</strong> → Actual Bonus = Calculated Bonus</p>
              </div>
              <p className="font-semibold mb-1">Leave Counting (Matching Approved.tsx):</p>
              <div className="space-y-1">
                <p>✅ <strong>Present</strong> = 0 leave</p>
                <p>✅ <strong>Holiday</strong> = 0 leave</p>
                <p>✅ <strong>Week Off</strong> = 0 leave</p>
                <p>⏰ <strong>Half Day</strong> = 0.5 leave</p>
                <p className="text-red-700 font-bold">🔴 <strong>Absent</strong> = 1 leave</p>
                <p className="text-red-700 font-bold">🔴 <strong>Leave</strong> = 1 leave (counted in absent total)</p>
                <p className="text-orange-700 font-bold">⚠️ <strong>No record (except Sunday)</strong> = 1 leave</p>
                <p className="text-blue-700">🌞 <strong>Sunday with no record</strong> = NOT counted</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Yearly Bonus Calculation - {selectedYear}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">SL</TableHead>
                <TableHead className="min-w-[150px]">Name</TableHead>
                <TableHead className="min-w-[100px]">Department</TableHead>
                {MONTHS.map((month) => (
                  <TableHead key={month} className="text-center w-[60px]">
                    {month}
                  </TableHead>
                ))}
                <TableHead>Leaves</TableHead>
                <TableHead>Total Days</TableHead>
                <TableHead>T.W.Days</TableHead>
                <TableHead>Monthly Wages</TableHead>
                <TableHead>Annual CTC</TableHead>
                <TableHead>Leave %</TableHead>
                <TableHead>Calculated</TableHead>
                <TableHead className="font-bold">Actual Bonus</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={18} className="text-center py-8 text-muted-foreground">
                    Loading attendance data...
                  </TableCell>
                </TableRow>
              ) : filteredCalculations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={18} className="text-center py-8 text-muted-foreground">
                    No employees found
                  </TableCell>
                </TableRow>
              ) : (
                filteredCalculations.map((calc, index) => (
                  <TableRow key={calc.employeeId}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="font-semibold">{calc.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{calc.department}</Badge>
                    </TableCell>
                    {MONTHS.map((month) => {
                      const leaveCount = calc[month as keyof MonthlyLeaves];
                      return (
                        <TableCell
                          key={month}
                          className={`text-center font-semibold ${
                            leaveCount > 0 
                              ? leaveCount >= 1 
                                ? 'text-red-600' 
                                : 'text-orange-600'
                              : 'text-green-600'
                          }`}
                        >
                          {leaveCount}
                        </TableCell>
                      );
                    })}
                    <TableCell className="font-bold text-red-600">
                      {calc.totalLeaves}
                    </TableCell>
                    <TableCell>{calc.totalDays}</TableCell>
                    <TableCell className="font-bold text-blue-600">
                      {calc.twDays}
                    </TableCell>
                    <TableCell>₹{calc.perMonthWages.toLocaleString()}</TableCell>
                    <TableCell className="font-bold">₹{calc.ctc.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          calc.totalLeaves < 30
                            ? 'bg-green-100 text-green-800'
                            : 'bg-amber-100 text-amber-800'
                        }
                      >
                        {(calc.leaveDifference * 100).toFixed(2)}%
                      </Badge>
                    </TableCell>
                    <TableCell>₹{Math.round(calc.calculatedBonus).toLocaleString()}</TableCell>
                    <TableCell className="font-bold text-emerald-700 text-lg">
                      ₹{Math.round(calc.actualBonus).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Formula */}
      <Card className="bg-slate-50">
        <CardHeader>
          <CardTitle className="text-lg">Calculation Formulas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <Badge variant="secondary">1</Badge>
            <p><strong>T.W.DAYS:</strong> 355 - Total Leaves</p>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="secondary">2</Badge>
            <p><strong>Leave %:</strong> T.W.DAYS ÷ 355</p>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="secondary">3</Badge>
            <p><strong>Calculated Bonus:</strong> (CTC × Leave %) ÷ 12</p>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="secondary">4</Badge>
            <p><strong>Actual Bonus:</strong> Monthly Salary if leaves &lt; 30, else Calculated Bonus</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}