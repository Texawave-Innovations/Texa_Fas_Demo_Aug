// src/modules/hr/EmployeeTimesheet.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Sun,
  Download,
  Edit2,
  Save,
  XCircle,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ref, onValue, set, get, remove } from 'firebase/database';
import { database } from '@/services/firebase';
import { getAllRecords } from '@/services/firebase';
import * as XLSX from 'xlsx';
import { toast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// --- Constants ---
const FULL_WORKING_DAY_AMOUNT = 400;
const SUNDAY_ALLOWANCE_STAFF = 500;

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
    targetHours: 4.0,
    hasLunch: false,
  },
};

// Helper: Convert decimal hours → "HH:MM" string
const formatHoursToHMM = (hours: number): string => {
  if (hours === 0) return '0:00';
  const h = Math.floor(Math.abs(hours));
  const m = Math.round((Math.abs(hours) % 1) * 60);
  return `${hours < 0 ? '-' : ''}${h}:${m.toString().padStart(2, '0')}`;
};

import {
  calculateAttendanceDetails,
  parseTimeString,
  STANDARD_FULL_DAY_HOURS,
  calculateOTFromExtraMinutes
} from '@/utils/attendanceHelper';

const toTimeString = (hour?: string, minute?: string, period?: string) => {
  if (!hour || !minute || !period) return '';
  return `${parseInt(hour, 10)}:${minute} ${period}`;
};

const convertTimeToDecimal = (t?: string): number => {
  const p = parseTimeString(t);
  return p ? Number(p.toFixed(2)) : 0;
};

const formatMonthYear = (ym: string) => {
  const [y, m] = ym.split('-');
  const date = new Date(Number(y), Number(m) - 1);
  return date.toLocaleDateString('en-US', { month: 'short' }) + '-' + y.slice(2);
};

interface TimesheetRecord {
  date: string;
  status: string;
  checkIn?: string;
  lunchIn?: string;
  lunchOut?: string;
  checkOut?: string;
  workHrs: number;
  otHrs: number;
  pendingHrs: number;
  actualWorkHrs?: number;
  department?: string;
  shiftType?: 'day' | 'night' | 'sunday';
  isMarked?: boolean;
}

interface MonthlySummary {
  fullWorkingDays: number;
  sundayAllowance: number;
  sundayOtHours: number;
  sundayPresentCount: number;
  sundayWorkHours: number;
}

export default function EmployeeTimesheet() {
  const { employeeId, month } = useParams();
  const navigate = useNavigate();

  const [currentMonth, setCurrentMonth] = useState(month || new Date().toISOString().slice(0, 7));
  const [employeeName, setEmployeeName] = useState('Loading...');
  const [employeeFirebaseId, setEmployeeFirebaseId] = useState<string | null>(null);
  const [department, setDepartment] = useState<string>('');
  const [officeLocation, setOfficeLocation] = useState<string>('');
  const [records, setRecords] = useState<TimesheetRecord[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary>({
    fullWorkingDays: 0,
    sundayAllowance: 0,
    sundayOtHours: 0,
    sundayPresentCount: 0,
    sundayWorkHours: 0,
  });
  const [loading, setLoading] = useState(true);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<Record<string, any>>({});
  
  const [monthlySalary, setMonthlySalary] = useState<number>(0);

  const [year, mon] = currentMonth.split('-');
  const daysInMonth = new Date(+year, +mon, 0).getDate();

  // Fetch employee details
  useEffect(() => {
    getAllRecords('hr/employees').then((emps: any[]) => {
      const emp = emps.find(e => e.employeeId === employeeId);
      if (emp) {
        setEmployeeName(emp.name);
        setEmployeeFirebaseId(emp.id);
        setDepartment(emp.department || 'Staff');
        setOfficeLocation(emp.officeType || 'OMR');
        
        const salaryInfo = emp.salary || {};
        const ms = salaryInfo.grossMonthly || salaryInfo.monthlySalary || 
          ((salaryInfo.basic || 0) + (salaryInfo.hra || 0) + (salaryInfo.conveyance || 0) + 
           (salaryInfo.otherAllowance || 0) + (salaryInfo.specialAllowance || 0)) || 0;
        setMonthlySalary(ms);
      } else {
        setEmployeeName('Employee Not Found');
      }
    });
  }, [employeeId]);


  // Fetch attendance + monthly summary - UPDATED WITH ≤4hrs LOGIC
  useEffect(() => {
    if (!employeeFirebaseId) return;

    const attendanceRef = ref(database, 'hr/attendance');
    const summaryRef = ref(database, `hr/timesheetSummary/${employeeFirebaseId}/${currentMonth}`);

    const unsub = onValue(attendanceRef, async snap => {
      const allData = snap.val() || {};
      const list: TimesheetRecord[] = [];

      let fullDays = 0;
      let sundayOtHours = 0;
      let sundayPresentCount = 0;
      let sundayWorkHours = 0;

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayData = allData[dateStr] || {};

        let latestRecord: any = null;
        let latestTimestamp = 0;

        Object.entries(dayData).forEach(([, rec]: any) => {
          if (rec.employeeId === employeeFirebaseId) {
            const timestamp = rec.updatedAt || rec.createdAt || 0;
            if (timestamp > latestTimestamp) {
              latestTimestamp = timestamp;
              latestRecord = rec;
            }
          }
        });

        const dt = new Date(dateStr);
        const isSunday = dt.getDay() === 0;

        if (latestRecord) {
          const rec = latestRecord;
          const shiftType: 'day' | 'night' | 'sunday' =
            rec.shiftType || (isSunday ? 'sunday' : 'day');

          const hrs = calculateAttendanceDetails(
            rec.checkIn || '',
            rec.lunchIn || '',
            rec.lunchOut || '',
            rec.checkOut || '',
            shiftType,
            rec.status
          );

          // Keep saved status directly for backward compatibility
          let finalStatus = rec.status || hrs.autoStatus;

          list.push({
            date: dateStr,
            status: finalStatus,
            checkIn: rec.checkIn || '',
            lunchIn: rec.lunchIn || '',
            lunchOut: rec.lunchOut || '',
            checkOut: rec.checkOut || '',
            workHrs: hrs.workHrs,
            otHrs: hrs.otHrs,
            pendingHrs: hrs.pendingHrs,
            actualWorkHrs: hrs.actualWorkHrs,
            department,
            shiftType,
            isMarked: true,
          });

          // Count full working days (only if Present and no pending hours)
          if (finalStatus === 'Present' && hrs.pendingHrs === 0) {
            fullDays++;
          }

          // Sunday calculations
          if (isSunday && finalStatus === 'Present') {
            if (department === 'Staff') {
              sundayPresentCount++;
            } else {
              sundayWorkHours += hrs.workHrs;
              sundayOtHours += hrs.otHrs;
              sundayOtHours = sundayWorkHours + (hrs.otHrs || 0);
            }
          }
        } else {
          list.push({
            date: dateStr,
            status: isSunday ? 'Holiday' : 'Select',
            checkIn: '',
            lunchIn: '',
            lunchOut: '',
            checkOut: '',
            workHrs: 0,
            otHrs: 0,
            pendingHrs: isSunday ? 0 : STANDARD_FULL_DAY_HOURS,
            actualWorkHrs: 0,
            department,
            shiftType: isSunday ? 'sunday' : 'day',
            isMarked: false,
          });
        }
      }

      setRecords(list);

      const sundayAllowance = department === 'Staff' ? sundayPresentCount * SUNDAY_ALLOWANCE_STAFF : 0;

      const summaryPayload = {
        fullWorkingDays: fullDays,
        sundayAllowance,
        sundayOtHours: department === 'Staff' ? 0 : sundayOtHours,
        sundayPresentCount,
        sundayWorkHours,
      };

      await set(summaryRef, summaryPayload);

      setMonthlySummary(summaryPayload);
      setLoading(false);
    });

    return () => unsub();
  }, [employeeFirebaseId, currentMonth, department, daysInMonth, year, mon]);

  const changeMonth = (dir: number) => {
    const d = new Date(+year, +mon - 1 + dir, 1);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setCurrentMonth(newMonth);
    navigate(`/hr/attendance/${employeeId}/${newMonth}`);
  };

  const startEdit = (rec: TimesheetRecord) => {
    setEditingDate(rec.date);
    const isSunday = new Date(rec.date).getDay() === 0;

    const parseTime = (timeStr?: string) => {
      if (!timeStr) return { hour: '', minute: '', period: '' };
      const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!match) return { hour: '', minute: '', period: '' };
      return {
        hour: match[1].padStart(2, '0'),
        minute: match[2],
        period: match[3].toUpperCase(),
      };
    };

    const checkInParsed = parseTime(rec.checkIn);
    const lunchInParsed = parseTime(rec.lunchIn);
    const lunchOutParsed = parseTime(rec.lunchOut);
    const checkOutParsed = parseTime(rec.checkOut);

    setEditBuffer(prev => ({
      ...prev,
      [rec.date]: {
        status: rec.status,
        shiftType: rec.shiftType || (isSunday ? 'sunday' : 'day'),
        checkInHour: checkInParsed.hour,
        checkInMinute: checkInParsed.minute,
        checkInPeriod: checkInParsed.period || 'AM',
        lunchInHour: lunchInParsed.hour || '01',
        lunchInMinute: lunchInParsed.minute || '00',
        lunchInPeriod: lunchInParsed.period || 'PM',
        lunchOutHour: lunchOutParsed.hour || '01',
        lunchOutMinute: lunchOutParsed.minute || '30',
        lunchOutPeriod: lunchOutParsed.period || 'PM',
        checkOutHour: checkOutParsed.hour,
        checkOutMinute: checkOutParsed.minute,
        checkOutPeriod: checkOutParsed.period || 'PM',
        workHrs: rec.workHrs,
        otHrs: rec.otHrs,
        pendingHrs: rec.pendingHrs,
        actualWorkHrs: rec.actualWorkHrs,
      },
    }));
  };

  const cancelEdit = () => setEditingDate(null);

  const updateEditBufferTimeField = (date: string, updates: Record<string, string>) => {
    setEditBuffer(prev => {
      const currentBuf = prev[date] || {};
      const newBuf = { ...currentBuf, ...updates };

      const existingRec = records.find(r => r.date === date);
      const isSunday = new Date(date).getDay() === 0;
      const shiftType: 'day' | 'night' | 'sunday' =
        newBuf.shiftType || existingRec?.shiftType || (isSunday ? 'sunday' : 'day');
      const config = SHIFT_CONFIGS[shiftType];

      // Build time strings from the new buffer state
      const checkIn =
        newBuf.checkInHour && newBuf.checkInMinute && newBuf.checkInPeriod
          ? toTimeString(newBuf.checkInHour, newBuf.checkInMinute, newBuf.checkInPeriod)
          : '';

      let lunchIn = '';
      let lunchOut = '';

      if (config.hasLunch) {
        lunchIn =
          newBuf.lunchInHour && newBuf.lunchInMinute && newBuf.lunchInPeriod
            ? toTimeString(newBuf.lunchInHour, newBuf.lunchInMinute, newBuf.lunchInPeriod)
            : '';
        lunchOut =
          newBuf.lunchOutHour && newBuf.lunchOutMinute && newBuf.lunchOutPeriod
            ? toTimeString(newBuf.lunchOutHour, newBuf.lunchOutMinute, newBuf.lunchOutPeriod)
            : '';
      }

      const checkOut =
        newBuf.checkOutHour && newBuf.checkOutMinute && newBuf.checkOutPeriod
          ? toTimeString(newBuf.checkOutHour, newBuf.checkOutMinute, newBuf.checkOutPeriod)
          : '';

      // Check if any time fields actually changed compared to the previous buffer state
      const checkInOld =
        currentBuf.checkInHour && currentBuf.checkInMinute && currentBuf.checkInPeriod
          ? toTimeString(currentBuf.checkInHour, currentBuf.checkInMinute, currentBuf.checkInPeriod)
          : '';
      let lunchInOld = '';
      let lunchOutOld = '';
      if (config.hasLunch) {
        lunchInOld =
          currentBuf.lunchInHour && currentBuf.lunchInMinute && currentBuf.lunchInPeriod
            ? toTimeString(currentBuf.lunchInHour, currentBuf.lunchInMinute, currentBuf.lunchInPeriod)
            : '';
        lunchOutOld =
          currentBuf.lunchOutHour && currentBuf.lunchOutMinute && currentBuf.lunchOutPeriod
            ? toTimeString(currentBuf.lunchOutHour, currentBuf.lunchOutMinute, currentBuf.lunchOutPeriod)
            : '';
      }
      const checkOutOld =
        currentBuf.checkOutHour && currentBuf.checkOutMinute && currentBuf.checkOutPeriod
          ? toTimeString(currentBuf.checkOutHour, currentBuf.checkOutMinute, currentBuf.checkOutPeriod)
          : '';

      const timeFieldsChanged =
        checkIn !== checkInOld ||
        lunchIn !== lunchInOld ||
        lunchOut !== lunchOutOld ||
        checkOut !== checkOutOld;

      if (timeFieldsChanged) {
        const hrs = calculateAttendanceDetails(
          checkIn,
          lunchIn,
          lunchOut,
          checkOut,
          shiftType,
          newBuf.status
        );

        if (newBuf.status !== 'Holiday') {
          newBuf.status = hrs.autoStatus;
        }

        newBuf.workHrs = hrs.workHrs;
        newBuf.otHrs = hrs.otHrs;
        newBuf.pendingHrs = hrs.pendingHrs;
        newBuf.actualWorkHrs = hrs.actualWorkHrs;
      }

      return {
        ...prev,
        [date]: newBuf,
      };
    });
  };

  const updateEditBufferStatusField = (date: string, status: string) => {
    setEditBuffer(prev => {
      const currentBuf = prev[date] || {};
      const newBuf = { ...currentBuf, status };

      const existingRec = records.find(r => r.date === date);
      const isSunday = new Date(date).getDay() === 0;
      const shiftType: 'day' | 'night' | 'sunday' =
        newBuf.shiftType || existingRec?.shiftType || (isSunday ? 'sunday' : 'day');
      const config = SHIFT_CONFIGS[shiftType];

      const checkIn =
        newBuf.checkInHour && newBuf.checkInMinute && newBuf.checkInPeriod
          ? toTimeString(newBuf.checkInHour, newBuf.checkInMinute, newBuf.checkInPeriod)
          : '';

      let lunchIn = '';
      let lunchOut = '';

      if (config.hasLunch) {
        lunchIn =
          newBuf.lunchInHour && newBuf.lunchInMinute && newBuf.lunchInPeriod
            ? toTimeString(newBuf.lunchInHour, newBuf.lunchInMinute, newBuf.lunchInPeriod)
            : '';
        lunchOut =
          newBuf.lunchOutHour && newBuf.lunchOutMinute && newBuf.lunchOutPeriod
            ? toTimeString(newBuf.lunchOutHour, newBuf.lunchOutMinute, newBuf.lunchOutPeriod)
            : '';
      }

      const checkOut =
        newBuf.checkOutHour && newBuf.checkOutMinute && newBuf.checkOutPeriod
          ? toTimeString(newBuf.checkOutHour, newBuf.checkOutMinute, newBuf.checkOutPeriod)
          : '';

      const hrs = calculateAttendanceDetails(
        checkIn,
        lunchIn,
        lunchOut,
        checkOut,
        shiftType,
        status
      );

      newBuf.workHrs = hrs.workHrs;
      newBuf.otHrs = hrs.otHrs;
      newBuf.pendingHrs = hrs.pendingHrs;
      newBuf.actualWorkHrs = hrs.actualWorkHrs;

      return {
        ...prev,
        [date]: newBuf,
      };
    });
  };

  const saveEdit = async (date: string) => {
    const buf = editBuffer[date];
    if (!buf || !employeeFirebaseId) return;

    try {
      const isSunday = new Date(date).getDay() === 0;
      const existingRec = records.find(r => r.date === date);
      const shiftType: 'day' | 'night' | 'sunday' =
        buf.shiftType || existingRec?.shiftType || (isSunday ? 'sunday' : 'day');

      const config = SHIFT_CONFIGS[shiftType];

      // Build time strings
      const checkIn =
        buf.checkInHour && buf.checkInMinute && buf.checkInPeriod
          ? toTimeString(buf.checkInHour, buf.checkInMinute, buf.checkInPeriod)
          : '';

      let lunchIn = '';
      let lunchOut = '';

      if (config.hasLunch) {
        lunchIn =
          buf.lunchInHour && buf.lunchInMinute && buf.lunchInPeriod
            ? toTimeString(buf.lunchInHour, buf.lunchInMinute, buf.lunchInPeriod)
            : '';
        lunchOut =
          buf.lunchOutHour && buf.lunchOutMinute && buf.lunchOutPeriod
            ? toTimeString(buf.lunchOutHour, buf.lunchOutMinute, buf.lunchOutPeriod)
            : '';
      }

      const checkOut =
        buf.checkOutHour && buf.checkOutMinute && buf.checkOutPeriod
          ? toTimeString(buf.checkOutHour, buf.checkOutMinute, buf.checkOutPeriod)
          : '';

      const finalStatus = buf.status;
      if (finalStatus === 'Present' || finalStatus === 'Half Day') {
        if (!checkIn || !checkOut) {
          toast({
            title: 'Validation Error',
            description: 'In & Out times are required for Present/Half Day status.',
            variant: 'destructive',
          });
          return;
        }
      }

      // Calculate work hours using centralized utility
      const hrs = calculateAttendanceDetails(
        checkIn,
        lunchIn,
        lunchOut,
        checkOut,
        shiftType,
        finalStatus
      );

      // Build the complete payload
      const payload: any = {
        employeeId: employeeFirebaseId,
        employeeName,
        date,
        status: finalStatus,
        shiftType,
        checkIn,
        lunchIn: config.hasLunch ? (lunchIn || '1:00 PM') : '',
        lunchOut: config.hasLunch ? (lunchOut || '1:30 PM') : '',
        checkOut,
        workHrs: hrs.workHrs,
        otHrs: hrs.otHrs,
        pendingHrs: hrs.pendingHrs,
        totalHours: Number((hrs.workHrs + hrs.otHrs).toFixed(4)),
        actualWorkHrs: hrs.actualWorkHrs,
        notes: hrs.autoStatus === 'Absent' ? 'Auto-marked Absent (≤4hrs)' : '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

    // CRITICAL FIX: First, check and remove old records
    const dateRef = ref(database, `hr/attendance/${date}`);
    const dateSnap = await get(dateRef);
    const dateData = dateSnap.val() || {};
    
    // Find and delete all records for this employee on this date
    const deletePromises = [];
    for (const recordKey in dateData) {
      if (dateData[recordKey]?.employeeId === employeeFirebaseId) {
        deletePromises.push(remove(ref(database, `hr/attendance/${date}/${recordKey}`)));
      }
    }
    
    // Wait for all deletions to complete
    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }

    // Now save the new record with the employeeFirebaseId as the key
    await set(ref(database, `hr/attendance/${date}/${employeeFirebaseId}`), payload);
    
    toast({ title: 'Timesheet updated successfully' });
    setEditingDate(null);
  } catch (err) {
    console.error('Save error:', err);
    toast({ title: 'Failed to save', variant: 'destructive' });
  }
};


  const handleSuperSave = async () => {
    if (!employeeFirebaseId) return;

    // Validate that all Present/Half Day records have both In and Out times
    const invalidRecords = records.filter(r => {
      if (r.status === 'Present' || r.status === 'Half Day') {
        return !r.checkIn || !r.checkOut;
      }
      return false;
    });

    if (invalidRecords.length > 0) {
      const invalidDates = invalidRecords
        .map(r => new Date(r.date).getDate())
        .sort((a, b) => a - b)
        .join(', ');

      toast({
        title: 'Validation Error',
        description: `In & Out times are required for Present/Half Day status on days: ${invalidDates}`,
        variant: 'destructive',
      });
      return;
    }

    const markedDaysCount = records.filter(r => r.isMarked === true).length;

    if (markedDaysCount < 26) {
      toast({
        title: 'Marking Incomplete',
        description: `You need to mark at least 26 days. Currently marked: ${markedDaysCount} days.`,
        variant: 'destructive',
      });
      return;
    }

    const sundays = records.filter(r => new Date(r.date).getDay() === 0);
    const unmarkedSundays = sundays.filter(r => !r.isMarked);

    if (unmarkedSundays.length > 0) {
      const sundayDates = unmarkedSundays.map(r => new Date(r.date).getDate()).join(', ');
      toast({
        title: 'Warning: Unmarked Sundays',
        description: `Sundays not marked: ${sundayDates}. Proceeding with save anyway.`,
        variant: 'default',
      });
    }

    try {
      // UPDATED: Include absent-day OT in total OT calculation and worker Sunday OT
      // Staff Sunday OT excluded — compensated via sundayAllowance
      const totalOTIncludingAbsent = records.reduce((s, r) => {
        const isSunday = new Date(r.date).getDay() === 0;
        let ot = r.otHrs;
        if (isSunday && r.status === 'Present') {
          if (department !== 'Staff') {
            ot = (r.actualWorkHrs || (r.workHrs + r.otHrs));
          } else {
            ot = 0;
          }
        }
        return s + ot;
      }, 0);
      
      const superSavePayload = {
        employeeId: employeeFirebaseId,
        employeeName,
        department,
        month: currentMonth,
        markedDays: markedDaysCount,
        totalDays: daysInMonth,
        fullWorkingDays: monthlySummary.fullWorkingDays,
        sundayAllowance: monthlySummary.sundayAllowance,
        sundayPresentCount: monthlySummary.sundayPresentCount,
        sundayOtHours: monthlySummary.sundayOtHours,
        sundayWorkHours: monthlySummary.sundayWorkHours,
        totalOT: totalOTIncludingAbsent, // Includes OT from ≤4hr days
        totalPending: records.filter(r => r.status === 'Present').reduce((s, r) => s + (r.pendingHrs || 0), 0),
        totalWorkHrs: records.reduce((s, r) => s + r.workHrs, 0),
        savedAt: Date.now(),
      };

      await set(
        ref(database, `hr/supersave/${employeeFirebaseId}/${currentMonth}`),
        superSavePayload
      );

      toast({
        title: 'Super Save Successful!',
        description: `Timesheet saved for ${employeeName} - ${currentMonth}`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: 'Super Save Failed',
        description: 'Error saving to database',
        variant: 'destructive',
      });
    }
  };

  const exportXLSX = () => {
    const monthYear = formatMonthYear(currentMonth);
    const rows = records.map(r => {
      const d = new Date(r.date);
      const dateNum = d.getDate();
      const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });

      const timeIn = convertTimeToDecimal(r.checkIn);
      const timeOut = convertTimeToDecimal(r.checkOut);
      const lIn = convertTimeToDecimal(r.lunchIn);
      const lOut = convertTimeToDecimal(r.lunchOut);

      const bHrs = lOut - lIn > 0 ? Number((lOut - lIn).toFixed(2)) : 0;
      const aHrs = Number((r.actualWorkHrs || r.workHrs).toFixed(2));
      const abHrs = Number((aHrs - bHrs).toFixed(2));

      return {
        Name: employeeName,
        MonthYear: monthYear,
        Date: dateNum,
        WeekDay: weekday,
        AttType: r.status,
        Shift: r.shiftType || 'day',
        TimeIN: timeIn || 0,
        TimeOut: timeOut || 0,
        ActualHrs: aHrs,
        LTimein: lIn || 0,
        LTimeout: lOut || 0,
        BHrs: bHrs,
        ABHrs: abHrs,
        WorkHrs: abHrs,  // WorkHrs = ABHrs (actual hours minus lunch break)
        OTHrs: Number(r.otHrs.toFixed(2)),
        Pending: r.status === 'Absent' ? 0 : Number(r.pendingHrs.toFixed(2)),
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Timesheet');
    XLSX.writeFile(wb, `${employeeName}_Timesheet_${currentMonth}.xlsx`);
  };

  const present = records.filter(r => r.status === 'Present').length;
  const holiday = records.filter(r => r.status === 'Holiday').length;
  const halfDay = records.filter(r => r.status === 'Half Day').length;
  const absent = records.filter(r => r.status === 'Absent').length;
  
  // UPDATED: Total OT now includes OT from ≤4hr days (marked as Absent) and worker Sunday OT
  // Staff Sunday OT is excluded — compensated via sundayAllowance instead
  const totalOT = records.reduce((s, r) => {
    const isSunday = new Date(r.date).getDay() === 0;
    let ot = r.otHrs;
    if (isSunday && r.status === 'Present') {
      if (department !== 'Staff') {
        // Workers: count full actual hours as OT on Sundays
        ot = (r.actualWorkHrs || (r.workHrs + r.otHrs));
      } else {
        // Staff: Sunday compensated via sundayAllowance, not OT
        ot = 0;
      }
    }
    return s + ot;
  }, 0);
  const totalPending = records.filter(r => r.status === 'Present').reduce((s, r) => s + (r.pendingHrs || 0), 0);
  const netOT = totalOT - totalPending;
  const totalWorkHrs = records.reduce((s, r) => s + r.workHrs, 0);
  
  const sundayAllowanceAmount = monthlySummary.sundayAllowance;
  
  const perDayRate = daysInMonth > 0 ? (monthlySalary / daysInMonth) : 0;
  const multiplier = (department === 'Staff' || department.toLowerCase() === 'staff') ? 1 : 1.5;
  const dynamicOtRate = perDayRate > 0 ? (perDayRate / 8) * multiplier : 0;
  
  const sundayOtAmount = department !== 'Staff' 
    ? Math.round(monthlySummary.sundayOtHours * dynamicOtRate)
    : 0;

  const markedDaysCount = records.filter(r => r.isMarked === true).length;
  const canSuperSave = markedDaysCount >= 26;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-[100vw] overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <Button variant="ghost" onClick={() => navigate('/hr/attendance')} className="w-fit">
          <ArrowLeft className="mr-2 h-5 w-5" /> Back
        </Button>
        <div>
          <h1 className="text-xl md:text-3xl font-bold">{employeeName} - Monthly Timesheet</h1>
          <div className="flex flex-wrap gap-2 mt-2 mb-1">
            <Badge variant="secondary" className="bg-blue-50 text-blue-800 border-blue-200 text-xs rounded-full">
              ID: {employeeId}
            </Badge>
            <Badge variant="secondary" className="bg-purple-50 text-purple-800 border-purple-200 text-xs rounded-full">
              Category: {department || 'Staff'}
            </Badge>
            <Badge variant="secondary" className="bg-emerald-50 text-emerald-800 border-emerald-200 text-xs rounded-full">
              Location: {officeLocation || 'OMR'}
            </Badge>
          </div>
          <p className="text-sm text-orange-600 font-medium mt-1">⚠️ Working ≤4 hrs = Absent (counted as OT)</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <Button onClick={exportXLSX} className="flex-1 md:flex-none text-sm">
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button
            onClick={handleSuperSave}
            disabled={!canSuperSave}
            className={`flex-1 md:flex-none text-sm ${canSuperSave ? 'bg-green-600 hover:bg-green-700' : ''}`}
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Save {!canSuperSave && `(${markedDaysCount}/26)`}
          </Button>
        </div>
      </div>

      {/* Month Navigation */}
      <div className="flex justify-center items-center gap-4">
        <Button size="icon" variant="outline" onClick={() => changeMonth(-1)}>
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <div className="px-4 md:px-8 py-3 md:py-4 bg-primary/10 rounded-xl flex items-center gap-3">
          <Calendar className="h-5 md:h-7 w-5 md:w-7 text-primary" />
          <span className="text-lg md:text-2xl font-bold">
            {new Date(`${currentMonth}-01`).toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric',
            })}
          </span>
        </div>

        <Button size="icon" variant="outline" onClick={() => changeMonth(1)}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 md:gap-4">
        <Card className="text-center">
          <CardContent className="pt-4 md:pt-6 p-2 md:p-6">
            <div className="text-xl md:text-3xl font-bold">{daysInMonth}</div>
            <div className="text-xs md:text-sm">Total Days</div>
          </CardContent>
        </Card>
        <Card className="text-center bg-green-50">
          <CardContent className="pt-4 md:pt-6 p-2 md:p-6">
            <div className="text-xl md:text-3xl font-bold text-green-700">{present}</div>
            <div className="text-xs md:text-sm">Present</div>
          </CardContent>
        </Card>
        <Card className="text-center bg-amber-50">
          <CardContent className="pt-4 md:pt-6 p-2 md:p-6">
            <div className="text-xl md:text-3xl font-bold text-amber-700">{halfDay}</div>
            <div className="text-xs md:text-sm">Half Day</div>
          </CardContent>
        </Card>
        <Card className="text-center bg-purple-50">
          <CardContent className="pt-4 md:pt-6 p-2 md:p-6">
            <div className="text-xl md:text-3xl font-bold text-purple-700">{holiday}</div>
            <div className="text-xs md:text-sm">Holiday</div>
          </CardContent>
        </Card>
        <Card className="text-center bg-red-50">
          <CardContent className="pt-4 md:pt-6 p-2 md:p-6">
            <div className="text-xl md:text-3xl font-bold text-red-700">{absent}</div>
            <div className="text-xs md:text-sm">Absent</div>
          </CardContent>
        </Card>
        <Card className="text-center bg-emerald-50">
          <CardContent className="pt-4 md:pt-6 p-2 md:p-6">
            <div className="text-xl md:text-3xl font-bold text-emerald-700">
              {formatHoursToHMM(totalOT)}
            </div>
            <div className="text-xs md:text-sm">Total OT</div>
          </CardContent>
        </Card>
        <Card className="text-center bg-slate-50">
          <CardContent className="pt-4 md:pt-6 p-2 md:p-6">
            <div className="text-xl md:text-3xl font-bold text-slate-700">
              {formatHoursToHMM(totalWorkHrs)}
            </div>
            <div className="text-xs md:text-sm">Work Hrs</div>
          </CardContent>
        </Card>
      </div>

      {/* Pending & Net OT */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4">
        <Card className="text-center bg-rose-50">
          <CardContent className="pt-4 md:pt-6 p-2 md:p-6">
            <div className="text-xl md:text-3xl font-bold text-rose-700">
              {totalPending > 0 ? formatHoursToHMM(totalPending) : '0:00'}
            </div>
            <div className="text-xs md:text-sm">Pending Hrs</div>
          </CardContent>
        </Card>
        <Card className="text-center bg-emerald-50">
          <CardContent className="pt-4 md:pt-6 p-2 md:p-6">
            <div className={`text-xl md:text-3xl font-bold ${netOT >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {formatHoursToHMM(netOT)}
            </div>
            <div className="text-xs md:text-sm">Net OT (OT - Pending)</div>
          </CardContent>
        </Card>
        <Card className="text-center bg-indigo-50">
          <CardContent className="pt-4 md:pt-6 p-2 md:p-6">
            <div className="text-xl md:text-3xl font-bold text-indigo-700">{markedDaysCount}</div>
            <div className="text-xs md:text-sm">Marked Days</div>
          </CardContent>
        </Card>
      </div>

      {/* Allowances */}
      <Card>
        <CardContent className="pt-4 md:pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {department === 'Staff' && (
              <div className="flex flex-col items-center">
                <label className="text-xs md:text-sm font-medium text-gray-600 mb-2">Sunday Allowance</label>
                <div className="text-2xl md:text-3xl font-bold text-purple-700">₹{sundayAllowanceAmount}</div>
                <div className="text-xs md:text-sm text-gray-500">
                  {monthlySummary.sundayPresentCount} × ₹{SUNDAY_ALLOWANCE_STAFF}
                </div>
              </div>
            )}

            {department !== 'Staff' && (
              <div className="flex flex-col items-center">
                <label className="text-xs md:text-sm font-medium text-gray-600 mb-2">
                  Sunday OT Included in Regular OT
                </label>
                <div className="text-sm md:text-base font-semibold text-green-700">
                  Worker Sunday hours added to main OT pool at ₹{dynamicOtRate.toFixed(2)}/hr
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Timesheet Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-4">
              {Array(10)
                .fill(0)
                .map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap text-xs md:text-sm px-2 md:px-4">Date</TableHead>
                    <TableHead className="whitespace-nowrap text-xs md:text-sm px-2 md:px-4">Day</TableHead>
                    <TableHead className="whitespace-nowrap text-xs md:text-sm px-2 md:px-4">Week</TableHead>
                    <TableHead className="whitespace-nowrap text-xs md:text-sm px-2 md:px-4">Shift</TableHead>
                    <TableHead className="whitespace-nowrap text-xs md:text-sm px-2 md:px-4">Status</TableHead>
                    <TableHead className="whitespace-nowrap text-center text-xs md:text-sm px-2 md:px-4">In</TableHead>
                    <TableHead className="whitespace-nowrap text-center text-xs md:text-sm px-2 md:px-4">Lin</TableHead>
                    <TableHead className="whitespace-nowrap text-center text-xs md:text-sm px-2 md:px-4">Lout</TableHead>
                    <TableHead className="whitespace-nowrap text-center text-xs md:text-sm px-2 md:px-4">Out</TableHead>
                    <TableHead className="whitespace-nowrap text-center text-xs md:text-sm px-2 md:px-4">Actual</TableHead>
                    <TableHead className="whitespace-nowrap text-center text-xs md:text-sm px-2 md:px-4">Work</TableHead>
                    <TableHead className="whitespace-nowrap text-center text-xs md:text-sm px-2 md:px-4">OT</TableHead>
                    <TableHead className="whitespace-nowrap text-center text-xs md:text-sm px-2 md:px-4">Pend</TableHead>
                    <TableHead className="whitespace-nowrap text-xs md:text-sm px-2 md:px-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map(r => {
                    const d = new Date(r.date);
                    const isSunday = d.getDay() === 0;
                    const editing = editingDate === r.date;
                    const buf = editBuffer[r.date] || {};
                    const config = SHIFT_CONFIGS[r.shiftType || 'day'];

                    const statusVal = editing ? (buf.status || r.status) : r.status;
                    const statusTone =
                      statusVal === 'Present'
                        ? 'green'
                        : statusVal === 'Half Day'
                        ? 'amber'
                        : statusVal === 'Absent' || statusVal === 'Select'
                        ? 'red'
                        : 'purple';

                    // Highlight rows with auto-absent (≤4hrs worked)
                    const isAutoAbsent = statusVal === 'Absent' && r.checkIn && r.checkOut && (r.actualWorkHrs || 0) <= 4;

                    const isTimeRequired = statusVal === 'Present' || statusVal === 'Half Day';
                    const hasCheckInTime = !!(buf.checkInHour && buf.checkInMinute && buf.checkInPeriod);
                    const hasCheckOutTime = !!(buf.checkOutHour && buf.checkOutMinute && buf.checkOutPeriod);
                    const isCheckInIncomplete = editing && isTimeRequired && !hasCheckInTime;
                    const isCheckOutIncomplete = editing && isTimeRequired && !hasCheckOutTime;
                    const isRowInvalid = isCheckInIncomplete || isCheckOutIncomplete;

                    const checkInSelectClass = `w-10 md:w-12 px-0.5 md:px-1 py-0.5 md:py-1 border rounded text-[10px] md:text-xs ${
                      isCheckInIncomplete ? 'border-red-500 ring-1 ring-red-500 focus:border-red-500 bg-red-50' : 'border-gray-300'
                    }`;
                    const checkInPeriodClass = `w-12 md:w-14 px-0.5 md:px-1 py-0.5 md:py-1 border rounded text-[10px] md:text-xs ${
                      isCheckInIncomplete ? 'border-red-500 ring-1 ring-red-500 focus:border-red-500 bg-red-50' : 'border-gray-300'
                    }`;
                    const checkOutSelectClass = `w-10 md:w-12 px-0.5 md:px-1 py-0.5 md:py-1 border rounded text-[10px] md:text-xs ${
                      isCheckOutIncomplete ? 'border-red-500 ring-1 ring-red-500 focus:border-red-500 bg-red-50' : 'border-gray-300'
                    }`;
                    const checkOutPeriodClass = `w-12 md:w-14 px-0.5 md:px-1 py-0.5 md:py-1 border rounded text-[10px] md:text-xs ${
                      isCheckOutIncomplete ? 'border-red-500 ring-1 ring-red-500 focus:border-red-500 bg-red-50' : 'border-gray-300'
                    }`;

                    return (
                      <TableRow 
                        key={r.date} 
                        className={`${isSunday ? 'bg-purple-50' : ''} ${isAutoAbsent ? 'bg-orange-50' : ''}`}
                      >
                        <TableCell className="font-medium whitespace-nowrap text-xs md:text-sm px-2 md:px-4">
                          {d
                            .toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })
                            .replace(/\//g, '.')}
                        </TableCell>
                        <TableCell className="text-xs md:text-sm px-2 md:px-4">{d.getDate()}</TableCell>
                        <TableCell className="flex items-center gap-1 text-xs md:text-sm px-2 md:px-4">
                          {d.toLocaleDateString('en-US', { weekday: 'short' })}
                          {isSunday && <Sun className="h-3 w-3 md:h-4 md:w-4 text-purple-600" />}
                        </TableCell>
                        <TableCell className="text-xs md:text-sm px-2 md:px-4">
                          <Badge variant="outline" className="text-[10px] md:text-xs">{config.name}</Badge>
                        </TableCell>
                        <TableCell className="px-2 md:px-4">
                          {editing ? (
                            <Select
                              value={buf.status || r.status}
                              onValueChange={v => updateEditBufferStatusField(r.date, v)}
                            >
                              <SelectTrigger className="w-20 md:w-28 h-7 md:h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {['Select', 'Present', 'Absent', 'Half Day', 'Holiday'].map(
                                  s => (
                                    <SelectItem key={s} value={s} className="text-xs">
                                      {s}
                                    </SelectItem>
                                  )
                                )}
                              </SelectContent>
                            </Select>
                          ) : (
                            <StatusBadge status={r.status} tone={statusTone} className="text-[10px] md:text-xs" />
                          )}
                        </TableCell>

                        {/* Check In */}
                        <TableCell className="text-center px-1 md:px-2">
                          {editing ? (
                            <div className="flex flex-col items-center">
                              <div className="flex gap-0.5 md:gap-1 justify-center min-w-[140px] md:min-w-[160px]">
                                <select
                                  value={buf.checkInHour || ''}
                                  onChange={e =>
                                    updateEditBufferTimeField(r.date, { checkInHour: e.target.value })
                                  }
                                  className={checkInSelectClass}
                                >
                                  <option value="">--</option>
                                  {HOURS.map(h => (
                                    <option key={h} value={h}>
                                      {h}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={buf.checkInMinute || ''}
                                  onChange={e =>
                                    updateEditBufferTimeField(r.date, { checkInMinute: e.target.value })
                                  }
                                  className={checkInSelectClass}
                                >
                                  <option value="">--</option>
                                  {MINUTES.map(m => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={buf.checkInPeriod || 'AM'}
                                  onChange={e =>
                                    updateEditBufferTimeField(r.date, { checkInPeriod: e.target.value })
                                  }
                                  className={checkInPeriodClass}
                                >
                                  <option value="AM">AM</option>
                                  <option value="PM">PM</option>
                                </select>
                              </div>
                              {isCheckInIncomplete && (
                                <span className="text-[9px] text-red-600 font-semibold mt-0.5">In required</span>
                              )}
                            </div>
                          ) : (
                            <span
                              className={`text-[10px] md:text-xs whitespace-nowrap ${
                                r.checkIn ? 'text-green-600 font-medium' : 'text-muted-foreground'
                              }`}
                            >
                              {r.checkIn || '-'}
                            </span>
                          )}
                        </TableCell>

                        {/* Lunch In */}
                        <TableCell className="text-center px-1 md:px-2">
                          {config.hasLunch ? (
                            editing ? (
                              <div className="flex gap-0.5 md:gap-1 justify-center min-w-[140px] md:min-w-[160px]">
                                <select
                                  value={buf.lunchInHour || '01'}
                                  onChange={e =>
                                    updateEditBufferTimeField(r.date, { lunchInHour: e.target.value })
                                  }
                                  className="w-10 md:w-12 px-0.5 md:px-1 py-0.5 md:py-1 border rounded text-[10px] md:text-xs border-gray-300"
                                >
                                  {HOURS.map(h => (
                                    <option key={h} value={h}>
                                      {h}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={buf.lunchInMinute || '00'}
                                  onChange={e =>
                                    updateEditBufferTimeField(r.date, { lunchInMinute: e.target.value })
                                  }
                                  className="w-10 md:w-12 px-0.5 md:px-1 py-0.5 md:py-1 border rounded text-[10px] md:text-xs border-gray-300"
                                >
                                  {MINUTES.map(m => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={buf.lunchInPeriod || 'PM'}
                                  onChange={e =>
                                    updateEditBufferTimeField(r.date, { lunchInPeriod: e.target.value })
                                  }
                                  className="w-12 md:w-14 px-0.5 md:px-1 py-0.5 md:py-1 border rounded text-[10px] md:text-xs border-gray-300"
                                >
                                  <option value="AM">AM</option>
                                  <option value="PM">PM</option>
                                </select>
                              </div>
                            ) : (
                              <span
                                className={`text-[10px] md:text-xs whitespace-nowrap ${
                                  r.lunchIn ? 'text-orange-600 font-medium' : 'text-muted-foreground'
                                }`}
                              >
                                {r.lunchIn || '1:00 PM'}
                              </span>
                            )
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>

                        {/* Lunch Out */}
                        <TableCell className="text-center px-1 md:px-2">
                          {config.hasLunch ? (
                            editing ? (
                              <div className="flex gap-0.5 md:gap-1 justify-center min-w-[140px] md:min-w-[160px]">
                                <select
                                  value={buf.lunchOutHour || '01'}
                                  onChange={e =>
                                    updateEditBufferTimeField(r.date, { lunchOutHour: e.target.value })
                                  }
                                  className="w-10 md:w-12 px-0.5 md:px-1 py-0.5 md:py-1 border rounded text-[10px] md:text-xs border-gray-300"
                                >
                                  {HOURS.map(h => (
                                    <option key={h} value={h}>
                                      {h}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={buf.lunchOutMinute || '30'}
                                  onChange={e =>
                                    updateEditBufferTimeField(r.date, { lunchOutMinute: e.target.value })
                                  }
                                  className="w-10 md:w-12 px-0.5 md:px-1 py-0.5 md:py-1 border rounded text-[10px] md:text-xs border-gray-300"
                                >
                                  {MINUTES.map(m => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={buf.lunchOutPeriod || 'PM'}
                                  onChange={e =>
                                    updateEditBufferTimeField(r.date, { lunchOutPeriod: e.target.value })
                                  }
                                  className="w-12 md:w-14 px-0.5 md:px-1 py-0.5 md:py-1 border rounded text-[10px] md:text-xs border-gray-300"
                                >
                                  <option value="AM">AM</option>
                                  <option value="PM">PM</option>
                                </select>
                              </div>
                            ) : (
                              <span
                                className={`text-[10px] md:text-xs whitespace-nowrap ${
                                  r.lunchOut ? 'text-orange-600 font-medium' : 'text-muted-foreground'
                                }`}
                              >
                                {r.lunchOut || '1:30 PM'}
                              </span>
                            )
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>

                        {/* Check Out */}
                        <TableCell className="text-center px-1 md:px-2">
                          {editing ? (
                            <div className="flex flex-col items-center">
                              <div className="flex gap-0.5 md:gap-1 justify-center min-w-[140px] md:min-w-[160px]">
                                <select
                                  value={buf.checkOutHour || ''}
                                  onChange={e =>
                                    updateEditBufferTimeField(r.date, { checkOutHour: e.target.value })
                                  }
                                  className={checkOutSelectClass}
                                >
                                  <option value="">--</option>
                                  {HOURS.map(h => (
                                    <option key={h} value={h}>
                                      {h}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={buf.checkOutMinute || ''}
                                  onChange={e =>
                                    updateEditBufferTimeField(r.date, { checkOutMinute: e.target.value })
                                  }
                                  className={checkOutSelectClass}
                                >
                                  <option value="">--</option>
                                  {MINUTES.map(m => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={buf.checkOutPeriod || 'PM'}
                                  onChange={e =>
                                    updateEditBufferTimeField(r.date, { checkOutPeriod: e.target.value })
                                  }
                                  className={checkOutPeriodClass}
                                >
                                  <option value="AM">AM</option>
                                  <option value="PM">PM</option>
                                </select>
                              </div>
                              {isCheckOutIncomplete && (
                                <span className="text-[9px] text-red-600 font-semibold mt-0.5">Out required</span>
                              )}
                            </div>
                          ) : (
                            <span
                              className={`text-[10px] md:text-xs whitespace-nowrap ${
                                r.checkOut ? 'text-blue-600 font-medium' : 'text-muted-foreground'
                              }`}
                            >
                              {r.checkOut || '-'}
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-center font-medium text-gray-700 text-xs md:text-sm px-2 md:px-4">
                          {formatHoursToHMM(editing ? (buf.actualWorkHrs ?? r.actualWorkHrs ?? 0) : (r.actualWorkHrs || 0))}
                        </TableCell>
                        <TableCell className="text-center font-semibold text-emerald-700 text-xs md:text-sm px-2 md:px-4">
                          {formatHoursToHMM(editing ? (buf.workHrs ?? r.workHrs ?? 0) : (r.workHrs || 0))}
                        </TableCell>
                        <TableCell className="text-center font-bold text-green-600 text-xs md:text-sm px-2 md:px-4">
                          {formatHoursToHMM(editing ? (buf.otHrs ?? r.otHrs ?? 0) : (r.otHrs || 0))}
                        </TableCell>
                        <TableCell className="text-center font-bold text-red-600 text-xs md:text-sm px-2 md:px-4">
                          {formatHoursToHMM(editing ? (buf.pendingHrs ?? r.pendingHrs ?? 0) : (r.pendingHrs || 0))}
                        </TableCell>

                        <TableCell className="px-2 md:px-4">
                          {editing ? (
                            <div className="flex justify-center gap-1 md:gap-2">
                              <Button 
                                size="sm" 
                                onClick={() => saveEdit(r.date)} 
                                className="h-7 md:h-9 px-2 md:px-3"
                                disabled={isRowInvalid}
                                title={isRowInvalid ? "In & Out times are required for Present/Half Day" : "Save"}
                              >
                                <Save className="h-3 w-3 md:h-4 md:w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 md:h-9 px-2 md:px-3">
                                <XCircle className="h-3 w-3 md:h-4 md:w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex justify-center">
                              <Button size="sm" variant="ghost" onClick={() => startEdit(r)} className="h-7 md:h-9 px-2 md:px-3">
                                <Edit2 className="h-3 w-3 md:h-4 md:w-4" />
                              </Button>
                            </div>
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
    </div>
  );
}