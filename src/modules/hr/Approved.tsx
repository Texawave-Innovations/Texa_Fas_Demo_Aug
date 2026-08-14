import React, { useEffect, useMemo, useState } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { database } from '@/services/firebase';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

type Department = 'All' | 'Staff' | 'Worker' | 'Other Workers';
type ApprovalStatus = 'pending' | 'accepted' | 'declined';

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  department: string;
  officeType?: string;
}

interface AttendanceApproval {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  month: string;
  department: string;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  halfDays: number;
  otHours: number;
  pendingHours: number;
  netOtHours: number;
  fullWorkingDays: number;
  status: ApprovalStatus;
  createdAt: number;
  updatedAt: number;
}

interface Holiday {
  id: string;
  date: string;
  name: string;
  departments: string[];
  isRecurring: boolean;
}

function getMonthKey(d: Date) {
  return format(d, 'yyyy-MM');
}

function getMonthRange(monthKey: string) {
  const [y, m] = monthKey.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start, end, totalDays: end.getDate() };
}

// Helper function to format hours to "Xh Ym" format
const formatHoursToHM = (hours: number): string => {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
};

interface ErpUser {
  username: string;
  role: 'admin' | 'hr' | string;
  name: string;
}

export default function Approved() {
  const [currentUser, setCurrentUser] = useState<ErpUser | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Record<string, any>>({});
  const [approvals, setApprovals] = useState<
    Record<string, Record<string, AttendanceApproval>>
  >({});
  const [superSaveStatus, setSuperSaveStatus] = useState<
    Record<string, Record<string, any>>
  >({});
  const [holidays, setHolidays] = useState<Record<string, Record<string, Holiday>>>({});
  const [selectedMonth, setSelectedMonth] = useState<string>(getMonthKey(new Date()));
  const [departmentFilter, setDepartmentFilter] = useState<Department>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | ApprovalStatus>('All');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('erp_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        setCurrentUser(parsed);
      }
    } catch {
      setCurrentUser(null);
    }
  }, []);

  useEffect(() => {
    const empRef = ref(database, 'hr/employees');
    const unsub = onValue(empRef, (snap) => {
      const val = snap.val() || {};
      const list: Employee[] = Object.keys(val).map((k) => ({
        id: k,
        employeeId: val[k].employeeId,
        name: val[k].name,
        department: val[k].department,
        officeType: val[k].officeType,
      }));
      setEmployees(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const attRef = ref(database, 'hr/attendance');
    const unsub = onValue(attRef, (snap) => {
      setAttendance(snap.val() || {});
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const apprRef = ref(database, 'hr/attendanceApprovals');
    const unsub = onValue(apprRef, (snap) => {
      setApprovals(snap.val() || {});
    });
    return () => unsub();
  }, []);

  // Listen to super save status
  useEffect(() => {
    const superSaveRef = ref(database, 'hr/supersave');
    const unsub = onValue(superSaveRef, (snap) => {
      setSuperSaveStatus(snap.val() || {});
    });
    return () => unsub();
  }, []);

  // Listen to holidays
  useEffect(() => {
    const holidaysRef = ref(database, 'hr/holidays');
    const unsub = onValue(holidaysRef, (snap) => {
      setHolidays(snap.val() || {});
    });
    return () => unsub();
  }, []);

  // Function to get holiday count for a specific month and department
  const getHolidayCount = (monthKey: string, department: string): number => {
    const monthHolidays = holidays[monthKey] || {};
    let count = 0;

    Object.values(monthHolidays).forEach((holiday: Holiday) => {
      if (holiday.departments.includes('All') || holiday.departments.includes(department)) {
        count++;
      }
    });

    return count;
  };

  const rows = useMemo(() => {
    const { start, end, totalDays } = getMonthRange(selectedMonth);
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

    const result: (AttendanceApproval & {
      firebaseEmployeeId: string;
      employeeCode: string;
      hasApproval: boolean;
      hasSuperSave: boolean;
    })[] = [];

    employees.forEach((emp) => {
      if (departmentFilter !== 'All' && emp.department !== departmentFilter) return;

      let presentDays = 0;
      let absentDays = 0;
      let leaveDays = 0;
      let halfDays = 0;
      let otHours = 0;
      let pendingHours = 0;

      Object.keys(attendance).forEach((dateStr) => {
        if (dateStr < startStr || dateStr > endStr) return;

        const dayRecords = attendance[dateStr] || {};
        const rec = Object.values<any>(dayRecords).find(
          (r: any) => r.employeeId === emp.id
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
          presentDays++;
        } else if (rec.status === 'Absent') {
          absentDays++;
        } else if (rec.status === 'Leave') {
          leaveDays++;
          absentDays++; // Count leave as absent too
        } else if (rec.status === 'Half Day') {
          halfDays++;
        }

        otHours += rec.otHrs || 0;
        pendingHours += rec.pendingHrs || 0;
      });

      // Calculate holiday count for this employee's department
      const holidayCount = getHolidayCount(selectedMonth, emp.department);
      
      // Calculate required working days
      const totalWorkingDays = totalDays - holidayCount;
      const requiredDaysForFull = totalDays === 31 ? 27 : 26;
      const adjustedRequiredDays = requiredDaysForFull - holidayCount;

      // Calculate full working days
      const fullWorkingDays = presentDays >= adjustedRequiredDays ? totalDays : presentDays;
      const netOtHours = otHours - pendingHours;
      
      const monthApproval = approvals[emp.id]?.[selectedMonth];

      const hasApproval = !!monthApproval;
      const status: ApprovalStatus = monthApproval?.status || 'pending';

      // Check if super save exists for this employee and month
      const hasSuperSave = !!(superSaveStatus[emp.id]?.[selectedMonth]);

      if (statusFilter !== 'All' && (!hasApproval || status !== statusFilter)) return;

      result.push({
        firebaseEmployeeId: emp.id,
        employeeId: emp.id,
        employeeCode: emp.employeeId,
        employeeName: emp.name,
        month: selectedMonth,
        department: emp.department,
        totalDays,
        presentDays: fullWorkingDays, // Now shows full working days directly
        absentDays, // This now includes both Absent and Leave
        leaveDays, // Keep this separate for reference
        halfDays,
        otHours,
        pendingHours,
        netOtHours,
        fullWorkingDays,
        status,
        createdAt: monthApproval?.createdAt || 0,
        updatedAt: monthApproval?.updatedAt || 0,
        hasApproval,
        hasSuperSave,
      });
    });

    return result;
  }, [employees, attendance, approvals, superSaveStatus, holidays, selectedMonth, departmentFilter, statusFilter]);

  const handleSendApproval = async (
    row: { firebaseEmployeeId: string; hasApproval: boolean; hasSuperSave: boolean } & AttendanceApproval
  ) => {
    if (!currentUser || currentUser.role !== 'hr') return;
    if (!row.hasSuperSave) return; // Prevent send if super save not done

    setBusyId(row.firebaseEmployeeId);
    try {
      const now = Date.now();
      const existing = approvals[row.firebaseEmployeeId]?.[row.month];
      const payload: AttendanceApproval = {
        ...row,
        employeeId: row.firebaseEmployeeId,
        employeeCode: row.employeeCode,
        employeeName: row.employeeName,
        status: 'pending',
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      const pRef = ref(
        database,
        `hr/attendanceApprovals/${row.firebaseEmployeeId}/${row.month}`
      );
      await set(pRef, payload);
    } finally {
      setBusyId(null);
    }
  };

  const handleAdminDecision = async (
    row: { firebaseEmployeeId: string; hasApproval: boolean } & AttendanceApproval,
    decision: ApprovalStatus
  ) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    if (!row.hasApproval) return;
    setBusyId(row.firebaseEmployeeId);
    try {
      const now = Date.now();
      const existing = approvals[row.firebaseEmployeeId]?.[row.month];
      if (!existing) return;
      const payload = {
        ...existing,
        status: decision,
        updatedAt: now,
      };
      const pRef = ref(
        database,
        `hr/attendanceApprovals/${row.firebaseEmployeeId}/${row.month}`
      );
      await set(pRef, payload);
    } finally {
      setBusyId(null);
    }
  };

  const renderStatusLabel = (row: { hasApproval: boolean } & AttendanceApproval) => {
    if (!row.hasApproval) {
      return (
        <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
          HR needs to mark completely for this employee on timesheet
        </span>
      );
    }
    if (row.status === 'accepted') {
      return (
        <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
          Accepted
        </span>
      );
    }
    if (row.status === 'declined') {
      return (
        <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
          Declined
        </span>
      );
    }
    return (
      <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
        Pending
      </span>
    );
  };

  const renderSuperSaveStatus = (row: { hasSuperSave: boolean }) => {
    if (row.hasSuperSave) {
      return (
        <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 font-medium">
          ✓ Done
        </span>
      );
    }
    return (
      <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800 font-medium">
        ✗ Not Done
      </span>
    );
  };

  const renderActionCell = (
    row: { firebaseEmployeeId: string; employeeCode: string; hasApproval: boolean; hasSuperSave: boolean } & AttendanceApproval
  ) => {
    if (!currentUser) return null;

    const isHr = currentUser.role === 'hr';
    const isAdmin = currentUser.role === 'admin';
    const canEditAttendance = isHr || isAdmin;

    return (
      <div className="flex gap-2 justify-end items-center flex-wrap">
        {canEditAttendance && (
          <Link
            to={`/hr/attendance/${row.employeeCode}/${row.month}`}
            className="px-3 py-1 rounded bg-indigo-600 text-white text-xs hover:bg-indigo-700 transition"
          >
            Edit Attendance
          </Link>
        )}

        {isHr && !row.hasApproval && (
          <button
            className={`px-3 py-1 rounded text-white text-xs ${
              row.hasSuperSave 
                ? 'bg-blue-600 hover:bg-blue-700' 
                : 'bg-gray-400 cursor-not-allowed'
            }`}
            disabled={busyId === row.firebaseEmployeeId || !row.hasSuperSave}
            onClick={() => handleSendApproval(row)}
            title={!row.hasSuperSave ? 'Super save must be done first' : 'Send for approval'}
          >
            Send Approval
          </button>
        )}

        {isHr && row.hasApproval && (
          <span className="text-xs text-gray-600">
            {row.status === 'pending'
              ? 'Waiting for admin'
              : row.status === 'accepted'
              ? 'Approved'
              : 'Declined'}
          </span>
        )}

        {isAdmin && !row.hasApproval && (
          <span className="text-xs text-gray-500">Awaiting HR</span>
        )}

        {isAdmin && row.hasApproval && row.status === 'pending' && (
          <>
            <button
              className="px-2 py-1 rounded bg-green-600 text-white text-xs hover:bg-green-700"
              disabled={busyId === row.firebaseEmployeeId}
              onClick={() => handleAdminDecision(row, 'accepted')}
            >
              Accept
            </button>
            <button
              className="px-2 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700"
              disabled={busyId === row.firebaseEmployeeId}
              onClick={() => handleAdminDecision(row, 'declined')}
            >
              Decline
            </button>
          </>
        )}

        {isAdmin && row.hasApproval && row.status !== 'pending' && (
          <span className="text-xs font-medium text-gray-700">
            {row.status === 'accepted' ? 'Approved' : 'Declined'}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Timesheet Approvals ({currentUser?.role === 'admin' ? 'Admin' : 'HR'} View)
          </h1>
          <p className="text-xs text-gray-500">
            Logged in as: {currentUser?.name} ({currentUser?.username})
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div>
            <label className="block text-xs font-medium text-gray-600">Month</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">Department</label>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value as Department)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="All">All</option>
              <option value="Staff">Staff</option>
              <option value="Worker">Worker</option>
              <option value="Other Workers">Other Workers</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="All">All</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
            </select>
          </div>
        </div>
      </div>

      <div className="border rounded-md overflow-x-auto shadow-sm">
        <table className="min-w-full text-sm divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Emp Code</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Name</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Dept</th>
              <th className="px-3 py-2 text-center font-medium text-gray-700">Month</th>
              <th className="px-3 py-2 text-center font-medium text-gray-700">Super Save</th>
              <th className="px-3 py-2 text-center font-medium text-gray-700">Present Days</th>
              <th className="px-3 py-2 text-center font-medium text-gray-700">Absent</th>
              <th className="px-3 py-2 text-center font-medium text-gray-700">Half Day</th>
              <th className="px-3 py-2 text-center font-medium text-gray-700">OT</th>
              <th className="px-3 py-2 text-center font-medium text-gray-700">Pending</th>
              <th className="px-3 py-2 text-center font-medium text-gray-700">Net OT</th>
              <th className="px-3 py-2 text-center font-medium text-gray-700">Status</th>
              <th className="px-3 py-2 text-right font-medium text-gray-700">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-gray-500">
                  Loading data...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-gray-500">
                  No records found
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.firebaseEmployeeId} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{row.employeeCode}</td>
                  <td className="px-3 py-2 font-medium">{row.employeeName}</td>
                  <td className="px-3 py-2">{row.department}</td>
                  <td className="px-3 py-2 text-center">{row.month}</td>

                  {/* Super Save Status */}
                  <td className="px-3 py-2 text-center">{renderSuperSaveStatus(row)}</td>

                  {/* Present Days (Full Working Days) */}
                  <td className="px-3 py-2 text-center font-bold text-green-700 bg-green-50">
                    {row.presentDays}
                  </td>

                  {/* Absent Combined */}
                  <td className="px-3 py-2 text-center font-bold text-red-700 bg-red-50">
                    {row.absentDays}
                  </td>

                  {/* Half Day */}
                  <td className="px-3 py-2 text-center font-bold text-amber-700 bg-amber-50">
                    {row.halfDays}
                  </td>

                  {/* OT in hours and minutes */}
                  <td className="px-3 py-2 text-center font-medium">
                    {formatHoursToHM(row.otHours)}
                  </td>

                  {/* Pending in hours and minutes */}
                  <td className="px-3 py-2 text-center font-medium">
                    {formatHoursToHM(row.pendingHours)}
                  </td>

                  {/* Net OT in hours and minutes */}
                  <td className="px-3 py-2 text-center font-bold text-emerald-700">
                    {formatHoursToHM(row.netOtHours)}
                  </td>

                  <td className="px-3 py-2 text-center">{renderStatusLabel(row)}</td>
                  <td className="px-3 py-2 text-right">{renderActionCell(row)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
