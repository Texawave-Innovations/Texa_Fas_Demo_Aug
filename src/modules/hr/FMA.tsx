// src/modules/hr/MonthlyAbsentLeaveReport.tsx
import { useEffect, useState, useMemo } from "react";
import { Download, Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ref, query, orderByKey, startAt, endAt, get } from "firebase/database";
import { database } from "@/services/firebase";
import * as XLSX from "xlsx";

interface Employee {
  id: string;
  name: string;
  department: string;
}

interface AttendanceRecord {
  employeeId: string;
  status: string;
  date: string;
  updatedAt?: number;
  createdAt?: number;
}

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => (currentYear - 2 + i).toString());

export default function MonthlyAbsentLeaveReport() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendanceData, setAttendanceData] = useState<Record<string, any>>({});
  const [department, setDepartment] = useState("All");
  const [fromMonth, setFromMonth] = useState(`${currentYear}-06`);
  const [toMonth, setToMonth] = useState(`${currentYear}-12`);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Fetch employees
  useEffect(() => {
    const empRef = ref(database, "hr/employees");
    const fetchEmployees = async () => {
      const snap = await get(empRef);
      const data = snap.val() || {};
      const list: Employee[] = [];

      Object.entries(data).forEach(([id, emp]: any) => {
        const isActive = !emp.status || 
                        emp.status.toLowerCase() === "active" || 
                        emp.status === "Active" || 
                        emp.status === "active";
        
        if (isActive && emp.name && emp.name.trim()) {
          list.push({
            id,
            name: emp.name.trim(),
            department: emp.department || "Others",
          });
        }
      });

      list.sort((a, b) => a.name.localeCompare(b.name));
      setEmployees(list);
      console.log("Loaded employees:", list.length);
    };

    fetchEmployees();
  }, []);

  // Fetch attendance data (EXACT SAME AS APPROVED.TSX)
  useEffect(() => {
    const fetchAttendance = async () => {
      setLoading(true);
      setLoadingProgress(0);

      const [fromYear, fromMonthIdx] = fromMonth.split("-").map(Number);
      const [toYear, toMonthIdx] = toMonth.split("-").map(Number);

      const startDate = new Date(fromYear, fromMonthIdx - 1, 1);
      const endDate = new Date(toYear, toMonthIdx, 0);

      const startDateStr = startDate.toISOString().split("T")[0];
      const endDateStr = endDate.toISOString().split("T")[0];

      try {
        setLoadingProgress(30);
        
        // Fetch all attendance data
        const attRef = ref(database, "hr/attendance");
        const dateRangeQuery = query(
          attRef,
          orderByKey(),
          startAt(startDateStr),
          endAt(endDateStr)
        );

        setLoadingProgress(50);

        const snapshot = await get(dateRangeQuery);
        
        setLoadingProgress(70);

        if (snapshot.exists()) {
          const data = snapshot.val();
          setAttendanceData(data);
          setLoadingProgress(100);
          console.log("Loaded attendance data");
        } else {
          setAttendanceData({});
          setLoadingProgress(100);
        }
      } catch (error) {
        console.error("Error fetching attendance:", error);
        setAttendanceData({});
      } finally {
        setLoading(false);
      }
    };

    if (fromMonth && toMonth && employees.length > 0) {
      fetchAttendance();
    }
  }, [fromMonth, toMonth, employees.length]);

  // Generate month labels
  const monthLabels = useMemo(() => {
    const labels: string[] = [];
    const [fromY, fromM] = fromMonth.split("-").map(Number);
    const [toY, toM] = toMonth.split("-").map(Number);

    let year = fromY;
    let month = fromM;

    while (year < toY || (year === toY && month <= toM)) {
      labels.push(`${months[month - 1].slice(0, 3)} - ${year}`);
      if (month === 12) {
        month = 1;
        year++;
      } else {
        month++;
      }
    }
    return labels;
  }, [fromMonth, toMonth]);

  // Calculate report data (EXACT SAME LOGIC AS APPROVED.TSX)
  const reportData = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};

    // Initialize
    employees.forEach((emp) => {
      if (department !== "All" && emp.department !== department) return;
      result[emp.id] = {};
      monthLabels.forEach((m) => {
        result[emp.id][m] = 0;
      });
    });

    // Calculate for each employee
    employees.forEach((emp) => {
      if (department !== "All" && emp.department !== department) return;

      const [fromY, fromM] = fromMonth.split("-").map(Number);
      const [toY, toM] = toMonth.split("-").map(Number);

      let year = fromY;
      let month = fromM;

      // Process each month in the range
      while (year < toY || (year === toY && month <= toM)) {
        const monthKey = `${year}-${String(month).padStart(2, "0")}`;
        const monthLabel = `${months[month - 1].slice(0, 3)} - ${year}`;
        
        // Get days in this month
        const daysInMonth = new Date(year, month, 0).getDate();
        
        let absentDays = 0;
        let leaveDays = 0;

        // **EXACT LOGIC FROM APPROVED.TSX: Process each day**
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${monthKey}-${String(d).padStart(2, "0")}`;
          
          // Get all records for this employee on this date
          const dayRecords = attendanceData[dateStr] || {};
          const employeeRecords: any[] = [];
          
          Object.values(dayRecords).forEach((rec: any) => {
            if (rec.employeeId === emp.id && rec.date === dateStr) {
              employeeRecords.push(rec);
            }
          });

          if (employeeRecords.length === 0) {
            // No record - skip (don't count as absent)
            continue;
          }

          // **Find latest record by timestamp (EXACT LOGIC FROM APPROVED.TSX)**
          let latestRecord = employeeRecords[0];
          let latestTimestamp = latestRecord.updatedAt || latestRecord.createdAt || 0;

          employeeRecords.forEach((r) => {
            const timestamp = r.updatedAt || r.createdAt || 0;
            if (timestamp > latestTimestamp) {
              latestTimestamp = timestamp;
              latestRecord = r;
            }
          });

          // **Process based on latest record status (EXACT LOGIC FROM APPROVED.TSX)**
          const recordStatus = latestRecord.status;

          if (recordStatus === 'Leave') {
            leaveDays++;
          } else if (recordStatus === 'Absent') {
            absentDays++;
          }
          // Don't count Present, Half Day, Holiday, Week Off
        }

        // **Combined Absent + Leave (EXACT LOGIC FROM APPROVED.TSX)**
        const totalAbsentAndLeave = absentDays + leaveDays;
        result[emp.id][monthLabel] = totalAbsentAndLeave;

        // Move to next month
        if (month === 12) {
          month = 1;
          year++;
        } else {
          month++;
        }
      }
    });

    // Convert to rows
    return Object.entries(result)
      .map(([id, months]) => {
        const emp = employees.find((e) => e.id === id)!;
        const total = Object.values(months).reduce((sum, v) => sum + v, 0);

        return {
          id,
          name: emp.name,
          ...months,
          total: total,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [attendanceData, employees, department, monthLabels, fromMonth, toMonth]);

  const exportToExcel = () => {
    const rows = reportData.map((row, i) => ({
      "S.No": i + 1,
      "Employee Name": row.name,
      ...monthLabels.reduce((acc, m) => ({ ...acc, [m]: row[m] || 0 }), {}),
      Total: row.total,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Absent Leave Report");
    XLSX.writeFile(wb, `Absent_Leave_${fromMonth}_to_${toMonth}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <Card className="max-w-full mx-auto shadow-lg rounded-xl overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white p-8 rounded-t-xl">
          <h1 className="text-4xl font-bold text-center mb-8">
            Monthly Absent Report
          </h1>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {/* Department */}
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-gray-200" />
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger className="bg-white text-gray-900 font-medium">
                  <SelectValue placeholder="Select Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Departments</SelectItem>
                  <SelectItem value="Staff">Staff</SelectItem>
                  <SelectItem value="Worker">Worker</SelectItem>
                  <SelectItem value="Other Workers">Other Workers</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* From Month */}
            <div className="flex items-center gap-3">
              <span className="font-medium text-gray-200">From</span>
              <Input
                type="month"
                value={fromMonth}
                onChange={(e) => setFromMonth(e.target.value)}
                className="bg-white text-black"
              />
            </div>

            {/* To Month */}
            <div className="flex items-center gap-3">
              <span className="font-medium text-gray-200">To</span>
              <Input
                type="month"
                value={toMonth}
                onChange={(e) => setToMonth(e.target.value)}
                className="bg-white text-black"
              />
            </div>

            {/* Export Button */}
            <Button
              onClick={exportToExcel}
              disabled={loading || reportData.length === 0}
              className="bg-green-600 hover:bg-green-700 text-white font-semibold flex items-center gap-2 justify-center disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
              Export Excel
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="p-6 bg-white">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-12 h-12 animate-spin text-slate-600 mb-4" />
              <p className="text-lg text-gray-600 mb-2">Loading report data...</p>
              <div className="w-64 bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-slate-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${loadingProgress}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-500 mt-2">{loadingProgress}%</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm md:text-base border-collapse">
                <thead className="bg-gray-100 text-gray-700">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold">S.No</th>
                    <th className="px-10 py-4 text-left font-semibold">Employee Name</th>
                    {monthLabels.map((month) => (
                      <th key={month} className="px-6 py-4 text-center font-semibold">
                        {month}
                      </th>
                    ))}
                    <th className="px-8 py-4 text-center font-bold text-red-600 bg-gray-50">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.length > 0 ? (
                    reportData.map((row, idx) => (
                      <tr
                        key={row.id}
                        className={`border-b hover:bg-gray-50 transition ${
                          row.total === 0 ? "text-gray-400" : ""
                        }`}
                      >
                        <td className="px-6 py-4 text-center">{idx + 1}</td>
                        <td className="px-10 py-4 font-medium">{row.name}</td>
                        {monthLabels.map((month) => (
                          <td key={month} className="px-6 py-4 text-center">
                            <span
                              className={
                                row[month] > 0 ? "text-red-600 font-bold" : "text-gray-400"
                              }
                            >
                              {row[month] || 0}
                            </span>
                          </td>
                        ))}
                        <td className="px-8 py-4 text-center text-xl font-bold text-red-600 bg-red-50">
                          {row.total}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={monthLabels.length + 3}
                        className="px-6 py-12 text-center text-gray-500"
                      >
                        No data available for selected filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
