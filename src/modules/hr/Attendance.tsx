// src/modules/hr/Attendance.tsx
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, Check, X, Search, Edit2, Save, XCircle, Download, Eye, Sun, Moon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { RowActions } from '@/components/ui/row-actions';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { ref, onValue, get, set } from 'firebase/database';
import { database } from '@/services/firebase';
import { createRecord, updateRecord, getAllRecords } from '@/services/firebase';

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

// Shift Configurations
const SHIFT_CONFIGS = {
  day: {
    name: 'Day Shift',
    start: 10.0,
    end: 18.5,
    lunchStart: 13.0,
    lunchEnd: 13.5,
    targetHours: 8.5,
    hasLunch: true,
  },
  night: {
    name: 'Night Shift',
    start: 16.0,
    end: 24.5,
    lunchStart: 20.0,
    lunchEnd: 20.5,
    targetHours: 8.5,
    hasLunch: true,
  },
  sunday: {
    name: 'Sunday Shift',
    start: 9.0,
    end: 13.0,
    lunchStart: 0,
    lunchEnd: 0,
    targetHours: 4.0,
    hasLunch: false,
  },
};

// Helper: Convert decimal hours → "HH:MM" string
const formatHoursToHMM = (hours: number): string => {
  if (hours === 0) return '0:00';
  const h = Math.floor(Math.abs(hours));
  const m = Math.round(Math.abs(hours) % 1 * 60);
  return `${hours < 0 ? '-' : ''}${h}:${m.toString().padStart(2, '0')}`;
};

import {
  calculateAttendanceDetails,
  parseTimeString,
  STANDARD_FULL_DAY_HOURS,
  calculateOTFromExtraMinutes,
  type AttendanceCalculationResult
} from '@/utils/attendanceHelper';

// Convert decimal hours to 12-hour format time components
const decimalToTime12 = (decimalHour: number) => {
  const hour24 = Math.floor(decimalHour);
  const minute = Math.round((decimalHour % 1) * 60);
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return {
    hour: String(hour12).padStart(2, '0'),
    minute: String(minute).padStart(2, '0'),
    period
  };
};

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  department: string;
  status: string;
}

interface AttendanceRecord {
  id?: string;
  employeeId: string;
  employeeName: string;
  status: string;
  shiftType: 'day' | 'night' | 'sunday';
  checkIn?: string;
  lunchIn?: string;
  lunchOut?: string;
  checkOut?: string;
  workHrs: number;
  otHrs: number;
  pendingHrs: number;
  totalHours: number;
  actualWorkHrs?: number;
  notes?: string;
  editing?: boolean;
  checkInHour?: string;
  checkInMinute?: string;
  checkInPeriod?: string;
  lunchInHour?: string;
  lunchInMinute?: string;
  lunchInPeriod?: string;
  lunchOutHour?: string;
  lunchOutMinute?: string;
  lunchOutPeriod?: string;
  checkOutHour?: string;
  checkOutMinute?: string;
  checkOutPeriod?: string;
  createdAt?: number;
  updatedAt?: number;
}

export default function Attendance() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [approvedLeaves, setApprovedLeaves] = useState<any[]>([]);
  const [customHolidays, setCustomHolidays] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const navigate = useNavigate();

  const dateObj = new Date(selectedDate);
  const isSunday = dateObj.getDay() === 0;
  const currentShift = isSunday ? 'sunday' : 'day';

  // Fetch employees
  useEffect(() => {
    getAllRecords('hr/employees').then((data: any[]) => {
      const active = data.filter(e => e.status !== 'inactive');
      setEmployees(active.map(e => ({ ...e, id: e.id })));
    });
  }, []);

  // Fetch approved leaves
  useEffect(() => {
    const leavesRef = ref(database, 'hr/leaves');
    const unsub = onValue(leavesRef, (snap) => {
      const data = snap.val() || {};
      const leaves: any[] = [];
      Object.values(data).forEach((l: any) => {
        if (l.status === 'Approved') {
          leaves.push({
            employeeId: l.employeeId,
            startDate: l.startDate,
            endDate: l.endDate,
            employeeName: l.employeeName
          });
        }
      });
      setApprovedLeaves(leaves);
    });
    return () => unsub();
  }, []);

  // Fetch custom holidays
  useEffect(() => {
    const monthKey = selectedDate.slice(0, 7);
    const holidaysRef = ref(database, `hr/holidays/${monthKey}`);
    const unsub = onValue(holidaysRef, (snap) => {
      const data = snap.val() || {};
      const list = Object.values(data);
      setCustomHolidays(list);
    });
    return () => unsub();
  }, [selectedDate]);

  // Auto-mark custom holidays
  useEffect(() => {
    if (employees.length === 0) return;

    const applyCustomHolidays = async () => {
      const holiday = customHolidays.find(h => h.date === selectedDate);
      if (!holiday) return;

      const attRef = ref(database, `hr/attendance/${selectedDate}`);
      const snapshot = await get(attRef);
      const existing = snapshot.val() || {};

      const applicableDepts = holiday.departments.includes('All')
        ? ['Staff', 'Worker', 'Other Workers']
        : holiday.departments;

      for (const emp of employees) {
        if (!applicableDepts.includes(emp.department)) continue;
        if (existing[emp.id]) continue;

        const payload = {
          employeeId: emp.id,
          employeeName: emp.name,
          date: selectedDate,
          status: 'Holiday',
          shiftType: currentShift,
          checkIn: '', lunchIn: '', lunchOut: '', checkOut: '',
          workHrs: 0, otHrs: 0, pendingHrs: 0, totalHours: 0,
          actualWorkHrs: 0,
          notes: holiday.name,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await set(ref(database, `hr/attendance/${selectedDate}/${emp.id}`), payload);
      }
    };

    applyCustomHolidays();
  }, [selectedDate, customHolidays, employees, currentShift]);

  // Fetch attendance
  useEffect(() => {
    const attRef = ref(database, `hr/attendance/${selectedDate}`);
    const unsub = onValue(attRef, (snap) => {
      const data = snap.val();
      if (!data) {
        setAttendance([]);
        return;
      }
      const list: AttendanceRecord[] = Object.entries(data).map(([id, val]: any) => {
        const rec: AttendanceRecord = {
          ...val,
          id,
          editing: false,
          shiftType: val.shiftType || (isSunday ? 'sunday' : 'day')
        };
        const parseTime = (t?: string) => {
          if (!t) return null;
          const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
          if (!m) return null;
          return { hour: m[1].padStart(2, '0'), minute: m[2], period: m[3].toUpperCase() };
        };
        ['checkIn', 'lunchIn', 'lunchOut', 'checkOut'].forEach(time => {
          const parsed = parseTime(rec[time]);
          if (parsed) {
            (rec as any)[`${time}Hour`] = parsed.hour;
            (rec as any)[`${time}Minute`] = parsed.minute;
            (rec as any)[`${time}Period`] = parsed.period;
          }
        });
        return rec;
      });
      setAttendance(list);
    });
    return () => unsub();
  }, [selectedDate, isSunday]);

  const isOnLeaveToday = (empId: string) => {
    return approvedLeaves.some(leave =>
      leave.employeeId === empId &&
      selectedDate >= leave.startDate &&
      selectedDate <= leave.endDate
    );
  };

  const getHolidayDisplay = (empDepartment: string) => {
    const holiday = customHolidays.find(h => h.date === selectedDate);
    if (!holiday) return null;
    const applicable = holiday.departments.includes('All') || holiday.departments.includes(empDepartment);
    return applicable ? holiday.name : null;
  };

  const getCurrentTime12 = () => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return { hour: hour12.toString().padStart(2, '0'), minute: m.toString().padStart(2, '0'), period };
  };

  const markAttendance = async (
    empId: string,
    name: string,
    status: 'Select' | 'Present' | 'Absent' | 'Half Day' | 'Holiday',
    shiftType: 'day' | 'night' | 'sunday',
    inH?: string, inM?: string, inP?: string,
    liH?: string, liM?: string, liP?: string,
    loH?: string, loM?: string, loP?: string,
    outH?: string, outM?: string, outP?: string
  ) => {
    try {
      const existing = attendance.find(a => a.employeeId === empId);
      const now = getCurrentTime12();
      const config = SHIFT_CONFIGS[shiftType];

      let finalCheckIn = '';
      let finalLunchIn = '';
      let finalLunchOut = '';
      let finalCheckOut = '';

      // Allow check-in/check-out for Present, Half Day, AND Absent
      if (status === 'Present' || status === 'Half Day' || status === 'Absent') {
        // Use provided times OR existing times OR current time as fallback
        finalCheckIn = inH && inM && inP 
          ? `${parseInt(inH)}:${inM} ${inP}` 
          : (existing?.checkIn || `${now.hour}:${now.minute} ${now.period}`);
        
        if (config.hasLunch) {
          const lunchInTime = decimalToTime12(config.lunchStart);
          const lunchOutTime = decimalToTime12(config.lunchEnd);
          finalLunchIn = liH && liM && liP 
            ? `${parseInt(liH)}:${liM} ${liP}` 
            : (existing?.lunchIn || `${parseInt(lunchInTime.hour)}:${lunchInTime.minute} ${lunchInTime.period}`);
          finalLunchOut = loH && loM && loP 
            ? `${parseInt(loH)}:${loM} ${loP}` 
            : (existing?.lunchOut || `${parseInt(lunchOutTime.hour)}:${lunchOutTime.minute} ${lunchOutTime.period}`);
        }
        
        finalCheckOut = outH && outM && outP 
          ? `${parseInt(outH)}:${outM} ${outP}` 
          : (existing?.checkOut || '');
      }

      const calculationResult = calculateAttendanceDetails(
        finalCheckIn,
        finalLunchIn,
        finalLunchOut,
        finalCheckOut,
        shiftType,
        status
      );

      // Use auto-detected status if working hours ≤ 4
      let finalStatus = status;
      let finalNotes = '';
      
      if (calculationResult.autoStatus === 'Absent' && (status === 'Present' || status === 'Half Day')) {
        finalStatus = 'Absent';
        finalNotes = 'Auto-marked Absent (≤4hrs)';
      } else if (calculationResult.autoStatus === 'Half Day' && status === 'Present') {
        finalStatus = 'Half Day';
        finalNotes = 'Auto-marked Half Day (4-8.5hrs)';
      } else if (status === 'Absent' && finalCheckIn && finalCheckOut) {
        finalNotes = 'Absent with check-in/out times';
      } else if (status === 'Holiday') {
        finalNotes = getHolidayDisplay(name.split(' ')[0]) || 'Holiday';
      }

      const payload = {
        employeeId: empId,
        employeeName: name,
        date: selectedDate,
        status: finalStatus,
        shiftType,
        checkIn: finalCheckIn,
        lunchIn: finalLunchIn,
        lunchOut: finalLunchOut,
        checkOut: finalCheckOut,
        workHrs: calculationResult.workHrs,
        otHrs: calculationResult.otHrs,
        pendingHrs: calculationResult.pendingHrs,
        totalHours: calculationResult.workHrs + calculationResult.otHrs,
        actualWorkHrs: calculationResult.actualWorkHrs,
        notes: finalNotes,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      if (existing?.id) {
        await updateRecord(`hr/attendance/${selectedDate}`, existing.id, payload);
        toast({ 
          title: calculationResult.autoStatus === 'Absent' ? 
            'Marked as Absent (worked ≤4 hours, counted as OT)' : 
            calculationResult.autoStatus === 'Half Day' ?
            'Marked as Half Day (worked 4-8.5 hours)' :
            'Attendance updated successfully' 
        });
      } else {
        await createRecord(`hr/attendance/${selectedDate}`, payload);
        toast({ 
          title: calculationResult.autoStatus === 'Absent' ? 
            'Marked as Absent (worked ≤4 hours, counted as OT)' : 
            calculationResult.autoStatus === 'Half Day' ?
            'Marked as Half Day (worked 4-8.5 hours)' :
            'Attendance marked successfully' 
        });
      }
    } catch (err) {
      console.error(err);
      toast({ title: 'Failed to save attendance', variant: 'destructive' });
    }
  };

  const startEditing = (id: string) => {
    setAttendance(prev => prev.map(a => ({ ...a, editing: a.id === id })));
  };

  const cancelEditing = () => {
    setAttendance(prev => prev.map(a => ({ ...a, editing: false })));
  };

  const saveEdit = async (record: AttendanceRecord) => {
    await markAttendance(
      record.employeeId!,
      record.employeeName!,
      record.status as any,
      record.shiftType || currentShift,
      record.checkInHour, record.checkInMinute, record.checkInPeriod,
      record.lunchInHour, record.lunchInMinute, record.lunchInPeriod,
      record.lunchOutHour, record.lunchOutMinute, record.lunchOutPeriod,
      record.checkOutHour, record.checkOutMinute, record.checkOutPeriod
    );
    cancelEditing();
  };

  const getRecord = (empId: string) => attendance.find(a => a.employeeId === empId);

  const attendanceStatusTone = (status?: string): 'green' | 'red' | 'amber' | 'purple' | 'slate' => {
    switch (status) {
      case 'Present': return 'green';
      case 'Absent': return 'red';
      case 'Half Day': return 'amber';
      case 'Holiday': return 'purple';
      default: return 'slate';
    }
  };

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const search = searchTerm.toLowerCase();
      const matchesSearch = emp.name.toLowerCase().includes(search) ||
        emp.employeeId.toLowerCase().includes(search) ||
        emp.department.toLowerCase().includes(search);
      const matchesDept = departmentFilter === 'all' || emp.department === departmentFilter;
      return matchesSearch && matchesDept;
    });
  }, [employees, searchTerm, departmentFilter]);

  const presentCount = attendance.filter(a => a.status === 'Present').length;
  const absentCount = attendance.filter(a => a.status === 'Absent').length;
  const halfDayCount = attendance.filter(a => a.status === 'Half Day').length;
  const totalHours = attendance.reduce((sum, a) => sum + (a.totalHours || 0), 0);
  const avgHours = presentCount > 0 ? totalHours / presentCount : 0;

  const openTimesheet = (empId: string) => {
    const [y, m] = selectedDate.split('-');
    navigate(`/hr/attendance/${empId}/${y}-${m}`);
  };

  const exportCSV = () => {
    const headers = ['ID', 'Name', 'Shift', 'Status', 'Check In', 'Lunch In', 'Lunch Out', 'Check Out', 'Actual Hrs', 'Work Hrs', 'OT Hrs', 'Pending Hrs'];
    const rows = filteredEmployees.map(emp => {
      const record = getRecord(emp.id);
      const shiftType = record?.shiftType || currentShift;
      const onLeave = isOnLeaveToday(emp.id);
      const holidayName = getHolidayDisplay(emp.department);
      const status = holidayName ? holidayName : onLeave ? 'Leave' : (record?.status || 'Not Marked');
      const hrs = record?.checkIn && record?.checkOut
        ? calculateAttendanceDetails(record.checkIn, record.lunchIn || '', record.lunchOut || '', record.checkOut, shiftType)
        : { workHrs: 0, otHrs: 0, pendingHrs: (shiftType === 'sunday' ? SHIFT_CONFIGS[shiftType].targetHours : STANDARD_FULL_DAY_HOURS), actualWorkHrs: 0 };
      return [
        emp.employeeId,
        emp.name,
        SHIFT_CONFIGS[shiftType].name,
        status,
        record?.checkIn || '',
        record?.lunchIn || '',
        record?.lunchOut || '',
        record?.checkOut || '',
        formatHoursToHMM(hrs.actualWorkHrs),
        formatHoursToHMM(hrs.workHrs),
        formatHoursToHMM(hrs.otHrs),
        formatHoursToHMM(hrs.pendingHrs)
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Attendance_${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Daily Attendance</h2>
          <p className="text-muted-foreground">
            {isSunday
              ? 'Sunday Shift: 9:00 AM - 1:00 PM (4 hours, no lunch)'
              : 'Day: 10:00 AM - 6:30 PM | Night: 4:00 PM - 12:30 AM (8.5 hrs target)'}
          </p>
          <p className="text-sm text-orange-600 font-medium mt-1">
            ⚠️ Working ≤4 hours = Auto-marked Absent (hours counted as OT)
          </p>
        </div>
        <Button onClick={exportCSV} variant="outline">
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      {/* Holiday Alert */}
      {!isSunday && getHolidayDisplay('Staff') && (
        <Card className="bg-gradient-to-r from-orange-50 to-red-50 border-orange-300">
          <CardContent className="flex items-center gap-4 py-5">
            <Calendar className="h-12 w-12 text-orange-600" />
            <div>
              <h3 className="text-xl font-bold text-orange-900">Today is {getHolidayDisplay('Staff')}</h3>
              <p className="text-orange-700">Holiday applied to selected departments</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sunday Alert */}
      {isSunday && (
        <Card className="bg-gradient-to-r from-purple-50 to-purple-100 border-purple-300">
          <CardContent className="flex items-center gap-4 py-5">
            <Sun className="h-12 w-12 text-purple-600" />
            <div>
              <h3 className="text-xl font-bold text-purple-900">Today is Sunday</h3>
              <p className="text-purple-700">Working hours: 9:00 AM - 1:00 PM (4 hours)</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold">{employees.length}</p><p className="text-sm text-muted-foreground">Total</p></CardContent></Card>
        <Card className="bg-emerald-50"><CardContent className="pt-6 text-center text-emerald-700"><p className="text-3xl font-bold">{presentCount}</p><p>Present</p></CardContent></Card>
        <Card className="bg-red-50"><CardContent className="pt-6 text-center text-red-700"><p className="text-3xl font-bold">{absentCount}</p><p>Absent</p></CardContent></Card>
        <Card className="bg-amber-50"><CardContent className="pt-6 text-center text-amber-700"><p className="text-3xl font-bold">{halfDayCount}</p><p>Half Day</p></CardContent></Card>
        <Card className="bg-indigo-50"><CardContent className="pt-6 text-center text-indigo-700"><p className="text-3xl font-bold">{avgHours.toFixed(1)}h</p><p>Avg Hrs</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row gap-4 items-end">
            <div className="flex gap-4">
              <div>
                <Label>Date</Label>
                <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
              </div>
              <div>
                <Label>Department</Label>
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {Array.from(new Set(employees.map(e => e.department))).map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex-1">
              <Label>Search Employee</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Name, ID, Dept..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Check In</TableHead>
                  {!SHIFT_CONFIGS[currentShift].hasLunch ? null : <TableHead className="text-center">Lunch In</TableHead>}
                  {!SHIFT_CONFIGS[currentShift].hasLunch ? null : <TableHead className="text-center">Lunch Out</TableHead>}
                  <TableHead className="text-center">Check Out</TableHead>
                  <TableHead className="text-center">Actual</TableHead>
                  <TableHead className="text-center">Work</TableHead>
                  <TableHead className="text-center">OT</TableHead>
                  <TableHead className="text-center">Pending</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map(emp => {
                  const record = getRecord(emp.id);
                  const shiftType = record?.shiftType || currentShift;
                  const config = SHIFT_CONFIGS[shiftType];
                  const editing = record?.editing;
                  const onLeave = isOnLeaveToday(emp.id);
                  const holidayName = getHolidayDisplay(emp.department);
                  const isHoliday = !!holidayName;

                  let checkInVal = record?.checkIn || '';
                  let lunchInVal = record?.lunchIn || '';
                  let lunchOutVal = record?.lunchOut || '';
                  let checkOutVal = record?.checkOut || '';

                  if (editing && record) {
                    checkInVal = record.checkInHour && record.checkInMinute && record.checkInPeriod
                      ? `${parseInt(record.checkInHour)}:${record.checkInMinute} ${record.checkInPeriod}`
                      : '';
                    if (config.hasLunch) {
                      lunchInVal = record.lunchInHour && record.lunchInMinute && record.lunchInPeriod
                        ? `${parseInt(record.lunchInHour)}:${record.lunchInMinute} ${record.lunchInPeriod}`
                        : '';
                      lunchOutVal = record.lunchOutHour && record.lunchOutMinute && record.lunchOutPeriod
                        ? `${parseInt(record.lunchOutHour)}:${record.lunchOutMinute} ${record.lunchOutPeriod}`
                        : '';
                    }
                    checkOutVal = record.checkOutHour && record.checkOutMinute && record.checkOutPeriod
                      ? `${parseInt(record.checkOutHour)}:${record.checkOutMinute} ${record.checkOutPeriod}`
                      : '';
                  }

                  const statusVal = editing && record ? record.status : (record?.status || 'Select');
                  const hrs = checkInVal && checkOutVal
                    ? calculateAttendanceDetails(checkInVal, lunchInVal, lunchOutVal, checkOutVal, shiftType, statusVal)
                    : {
                        workHrs: 0,
                        otHrs: 0,
                        pendingHrs: (statusVal === 'Present' ? (shiftType === 'sunday' ? config.targetHours : STANDARD_FULL_DAY_HOURS) : 0),
                        actualWorkHrs: 0,
                        autoStatus: undefined as AttendanceCalculationResult['autoStatus'] | undefined,
                      };

                  const defaultLunchIn = decimalToTime12(config.lunchStart);
                  const defaultLunchOut = decimalToTime12(config.lunchEnd);

                  // Highlight auto-absent rows
                  const isAutoAbsent = hrs.autoStatus === 'Absent' || (statusVal === 'Absent' && record?.checkIn && record?.checkOut);

                  const isTimeRequired = statusVal === 'Present' || statusVal === 'Half Day';
                  const hasCheckInTime = !!(record?.checkInHour && record?.checkInMinute && record?.checkInPeriod);
                  const hasCheckOutTime = !!(record?.checkOutHour && record?.checkOutMinute && record?.checkOutPeriod);
                  const isCheckInIncomplete = editing && isTimeRequired && !hasCheckInTime;
                  const isCheckOutIncomplete = editing && isTimeRequired && !hasCheckOutTime;
                  const isRowInvalid = isCheckInIncomplete || isCheckOutIncomplete;

                  const checkInHourTriggerClass = `${isCheckInIncomplete ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : ''}`;
                  const checkInMinuteTriggerClass = `${isCheckInIncomplete ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : ''}`;
                  const checkInPeriodTriggerClass = `${isCheckInIncomplete ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : ''}`;

                  const checkOutHourTriggerClass = `${isCheckOutIncomplete ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : ''}`;
                  const checkOutMinuteTriggerClass = `${isCheckOutIncomplete ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : ''}`;
                  const checkOutPeriodTriggerClass = `${isCheckOutIncomplete ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : ''}`;

                  return (
                    <TableRow key={emp.id} className={onLeave ? 'bg-blue-50' : isHoliday ? 'bg-purple-50' : isAutoAbsent ? 'bg-orange-50' : ''}>
                      <TableCell className="font-medium">{emp.employeeId}</TableCell>
                      <TableCell>
                        <button onClick={() => openTimesheet(emp.employeeId)} className="text-blue-600 hover:underline font-medium">
                          {emp.name}
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{config.name}</Badge>
                      </TableCell>
                      <TableCell>
                        {isHoliday ? (
                          <StatusBadge status={holidayName!} tone="purple" />
                        ) : onLeave ? (
                          <StatusBadge status="Leave" tone="blue" />
                        ) : editing ? (
                          <Select value={record?.status || ''} onValueChange={v => setAttendance(p => p.map(a => a.id === record.id ? { ...a, status: v } : a))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {['Select', 'Present', 'Absent', 'Half Day', 'Holiday'].map(s => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <StatusBadge status={record?.status || 'Not Marked'} tone={attendanceStatusTone(record?.status)} />
                        )}
                      </TableCell>

                      {/* Check In */}
                      <TableCell className="text-center">
                        {editing && (record?.status === 'Present' || record?.status === 'Half Day' || record?.status === 'Absent') ? (
                          <div className="flex flex-col items-center">
                            <div className="flex justify-center gap-1">
                              <Select value={record.checkInHour || ''} onValueChange={v => setAttendance(p => p.map(a => a.id === record.id ? { ...a, checkInHour: v } : a))}>
                                <SelectTrigger className={`w-16 ${checkInHourTriggerClass}`}><SelectValue /></SelectTrigger>
                                <SelectContent>{HOURS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                              </Select>
                              <Select value={record.checkInMinute || ''} onValueChange={v => setAttendance(p => p.map(a => a.id === record.id ? { ...a, checkInMinute: v } : a))}>
                                <SelectTrigger className={`w-16 ${checkInMinuteTriggerClass}`}><SelectValue /></SelectTrigger>
                                <SelectContent>{MINUTES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                              </Select>
                              <Select value={record.checkInPeriod || 'AM'} onValueChange={v => setAttendance(p => p.map(a => a.id === record.id ? { ...a, checkInPeriod: v } : a))}>
                                <SelectTrigger className={`w-16 ${checkInPeriodTriggerClass}`}><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="AM">AM</SelectItem><SelectItem value="PM">PM</SelectItem></SelectContent>
                              </Select>
                            </div>
                            {isCheckInIncomplete && (
                              <span className="text-[9px] text-red-600 font-semibold mt-0.5 block text-center">In required</span>
                            )}
                          </div>
                        ) : (
                          <span className={record?.checkIn ? 'text-green-600 font-medium' : 'text-muted-foreground'}>
                            {record?.checkIn || '--:--'}
                          </span>
                        )}
                      </TableCell>

                      {/* Lunch In/Out */}
                      {config.hasLunch && (
                        <>
                          <TableCell className="text-center">
                            {editing && (record?.status === 'Present' || record?.status === 'Half Day' || record?.status === 'Absent') ? (
                              <div className="flex justify-center gap-1">
                                <Select value={record.lunchInHour || defaultLunchIn.hour} onValueChange={v => setAttendance(p => p.map(a => a.id === record.id ? { ...a, lunchInHour: v } : a))}>
                                  <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                                  <SelectContent>{HOURS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                                </Select>
                                <Select value={record.lunchInMinute || defaultLunchIn.minute} onValueChange={v => setAttendance(p => p.map(a => a.id === record.id ? { ...a, lunchInMinute: v } : a))}>
                                  <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                                  <SelectContent>{MINUTES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                                </Select>
                                <Select value={record.lunchInPeriod || defaultLunchIn.period} onValueChange={v => setAttendance(p => p.map(a => a.id === record.id ? { ...a, lunchInPeriod: v } : a))}>
                                  <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                                  <SelectContent><SelectItem value="AM">AM</SelectItem><SelectItem value="PM">PM</SelectItem></SelectContent>
                                </Select>
                              </div>
                            ) : (
                              <span className={record?.lunchIn ? 'text-orange-600 font-medium' : 'text-muted-foreground'}>
                                {record?.lunchIn || `${parseInt(defaultLunchIn.hour)}:${defaultLunchIn.minute} ${defaultLunchIn.period}`}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {editing && (record?.status === 'Present' || record?.status === 'Half Day' || record?.status === 'Absent') ? (
                              <div className="flex justify-center gap-1">
                                <Select value={record.lunchOutHour || defaultLunchOut.hour} onValueChange={v => setAttendance(p => p.map(a => a.id === record.id ? { ...a, lunchOutHour: v } : a))}>
                                  <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                                  <SelectContent>{HOURS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                                </Select>
                                <Select value={record.lunchOutMinute || defaultLunchOut.minute} onValueChange={v => setAttendance(p => p.map(a => a.id === record.id ? { ...a, lunchOutMinute: v } : a))}>
                                  <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                                  <SelectContent>{MINUTES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                                </Select>
                                <Select value={record.lunchOutPeriod || defaultLunchOut.period} onValueChange={v => setAttendance(p => p.map(a => a.id === record.id ? { ...a, lunchOutPeriod: v } : a))}>
                                  <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                                  <SelectContent><SelectItem value="AM">AM</SelectItem><SelectItem value="PM">PM</SelectItem></SelectContent>
                                </Select>
                              </div>
                            ) : (
                              <span className={record?.lunchOut ? 'text-orange-600 font-medium' : 'text-muted-foreground'}>
                                {record?.lunchOut || `${parseInt(defaultLunchOut.hour)}:${defaultLunchOut.minute} ${defaultLunchOut.period}`}
                              </span>
                            )}
                          </TableCell>
                        </>
                      )}

                      {/* Check Out */}
                      <TableCell className="text-center">
                        {editing && (record?.status === 'Present' || record?.status === 'Half Day' || record?.status === 'Absent') ? (
                          <div className="flex flex-col items-center">
                            <div className="flex justify-center gap-1">
                              <Select value={record.checkOutHour || ''} onValueChange={v => setAttendance(p => p.map(a => a.id === record.id ? { ...a, checkOutHour: v } : a))}>
                                <SelectTrigger className={`w-16 ${checkOutHourTriggerClass}`}><SelectValue /></SelectTrigger>
                                <SelectContent>{HOURS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                              </Select>
                              <Select value={record.checkOutMinute || ''} onValueChange={v => setAttendance(p => p.map(a => a.id === record.id ? { ...a, checkOutMinute: v } : a))}>
                                <SelectTrigger className={`w-16 ${checkOutMinuteTriggerClass}`}><SelectValue /></SelectTrigger>
                                <SelectContent>{MINUTES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                              </Select>
                              <Select value={record.checkOutPeriod || ''} onValueChange={v => setAttendance(p => p.map(a => a.id === record.id ? { ...a, checkOutPeriod: v } : a))}>
                                <SelectTrigger className={`w-16 ${checkOutPeriodTriggerClass}`}><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="AM">AM</SelectItem><SelectItem value="PM">PM</SelectItem></SelectContent>
                              </Select>
                            </div>
                            {isCheckOutIncomplete && (
                              <span className="text-[9px] text-red-600 font-semibold mt-0.5 block text-center">Out required</span>
                            )}
                          </div>
                        ) : (
                          <span className={record?.checkOut ? 'text-blue-600 font-medium' : 'text-muted-foreground'}>
                            {record?.checkOut || '--:--'}
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="text-center font-medium text-gray-700">{formatHoursToHMM(hrs.actualWorkHrs)}</TableCell>
                      <TableCell className="text-center font-semibold text-emerald-700">{formatHoursToHMM(hrs.workHrs)}</TableCell>
                      <TableCell className="text-center font-bold text-green-600">{formatHoursToHMM(hrs.otHrs)}</TableCell>
                      <TableCell className="text-center font-bold text-red-600">{formatHoursToHMM(hrs.pendingHrs)}</TableCell>

                      <TableCell>
                        <div className="flex justify-center items-center gap-2">
                          <RowActions
                            actions={[
                              { label: 'View Timesheet', icon: Eye, onClick: () => openTimesheet(emp.employeeId) },
                              { label: 'Edit', icon: Edit2, onClick: () => startEditing(record!.id!), hidden: !record || editing || isHoliday || onLeave },
                            ]}
                          />

                          {isHoliday || onLeave ? (
                            <StatusBadge status={isHoliday ? holidayName! : 'On Leave'} tone={isHoliday ? 'purple' : 'blue'} />
                          ) : editing ? (
                            <>
                              <Button 
                                size="sm" 
                                onClick={() => saveEdit(record!)}
                                disabled={isRowInvalid}
                                title={isRowInvalid ? "In & Out times are required for Present/Half Day" : "Save"}
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={cancelEditing}><XCircle className="h-4 w-4" /></Button>
                            </>
                          ) : (
                            <>
                              {!isSunday && (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => {
                                    const now = getCurrentTime12();
                                    markAttendance(emp.id, emp.name, 'Present', 'day', now.hour, now.minute, now.period);
                                  }}>
                                    Day Present
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => {
                                    const now = getCurrentTime12();
                                    markAttendance(emp.id, emp.name, 'Present', 'night', now.hour, now.minute, now.period);
                                  }}>
                                    <Moon className="h-4 w-4 mr-1" /> Night
                                  </Button>
                                </>
                              )}
                              {isSunday && (
                                <Button size="sm" onClick={() => markAttendance(emp.id, emp.name, 'Present', 'sunday')} className="bg-emerald-600 text-white">
                                  <Check className="h-4 w-4" />
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="text-red-600" onClick={() => markAttendance(emp.id, emp.name, 'Absent', currentShift)}>
                                <X className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => markAttendance(emp.id, emp.name, 'Half Day', currentShift)}>
                                HD
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
