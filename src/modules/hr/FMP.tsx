// src/modules/hr/MonthlyAttendanceSheet.tsx
import { useEffect, useState, useMemo } from "react";
import { Download, Calendar, Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { ref, get } from "firebase/database";
import { database } from "@/services/firebase";
import * as XLSX from "xlsx";

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  department: string;
  cName?: string;
}

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const currentDate = new Date();
const currentMonthName = months[currentDate.getMonth()];
const currentYear = currentDate.getFullYear().toString();

export default function MonthlyAttendanceSheet() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendanceData, setAttendanceData] = useState<Record<string, Record<string, string>>>({});
  const [otHoursData, setOtHoursData] = useState<Record<string, number>>({});
  const [pendingHoursData, setPendingHoursData] = useState<Record<string, number>>({});
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [selectedMonth, setSelectedMonth] = useState(currentMonthName);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [department, setDepartment] = useState("All");
  const [loading, setLoading] = useState(true);

  const monthIndex = months.indexOf(selectedMonth) + 1;
  const yearMonth = `${selectedYear}-${String(monthIndex).padStart(2, "0")}`;
  const daysInMonth = new Date(parseInt(selectedYear), monthIndex, 0).getDate();

  // Helper: Format OT hours as HH:MM
  const formatOTHours = (hours: number): string => {
    if (hours === 0) return "0:00";
    const h = Math.floor(Math.abs(hours));
    const m = Math.round((Math.abs(hours) % 1) * 60);
    return `${hours < 0 ? '-' : ''}${h}:${m.toString().padStart(2, '0')}`;
  };

  // Fetch employees
  useEffect(() => {
    const fetchEmployees = async () => {
      const empRef = ref(database, "hr/employees");
      const snap = await get(empRef);
      const data = snap.val() || {};
      const list: Employee[] = [];

      Object.entries(data).forEach(([id, emp]: any) => {
        // Include employees with status "active", "Active", or no status field
        const isActive = !emp.status || 
                        emp.status.toLowerCase() === "active" || 
                        emp.status === "Active" || 
                        emp.status === "active";
        
        if (isActive && emp.name && emp.name.trim()) {
          list.push({
            id,
            employeeId: emp.employeeId || "N/A",
            name: emp.name.trim(),
            department: emp.department || "Others",
            cName: emp.cName || emp.department || "N/A",
          });
        }
      });

      list.sort((a, b) => a.name.localeCompare(b.name));
      setEmployees(list);
      console.log("Loaded employees:", list.length, list.map(e => e.name));
    };

    fetchEmployees();
  }, []);

  // Fetch attendance, holidays & OT hours
  useEffect(() => {
    if (employees.length === 0) return;

    const fetchAttendance = async () => {
      setLoading(true);
      const newHolidays = new Set<string>();
      const newAttendance: Record<string, Record<string, string>> = {};
      const newOtHours: Record<string, number> = {};
      const newPendingHours: Record<string, number> = {};

      // Initialize for all employees
      employees.forEach((emp) => {
        newOtHours[emp.id] = 0;
        newPendingHours[emp.id] = 0;
        newAttendance[emp.id] = {};
      });

      // Fetch holidays
      try {
        const holidaysRef = ref(database, `hr/holidays/${yearMonth}`);
        const holidaySnap = await get(holidaysRef);
        const holidayData = holidaySnap.val() || {};
        Object.values(holidayData).forEach((h: any) => {
          if (h.date) newHolidays.add(h.date);
        });
      } catch (error) {
        console.error("Error fetching holidays:", error);
      }

      // Fetch attendance for each day
      const promises = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${yearMonth}-${String(d).padStart(2, "0")}`;
        const attRef = ref(database, `hr/attendance/${dateStr}`);

        promises.push(
          get(attRef).then((snap) => {
            const records = snap.val() || {};
            
            // Group records by employeeId
            const employeeRecords: Record<string, any[]> = {};
            
            Object.values(records).forEach((rec: any) => {
              if (rec.employeeId && rec.date === dateStr) {
                if (!employeeRecords[rec.employeeId]) {
                  employeeRecords[rec.employeeId] = [];
                }
                employeeRecords[rec.employeeId].push(rec);
              }
            });

            // Process each employee's records
            Object.entries(employeeRecords).forEach(([empId, recs]) => {
              // Find latest record by timestamp
              let latestRecord = recs[0];
              let latestTimestamp = latestRecord.updatedAt || latestRecord.createdAt || 0;

              recs.forEach((r) => {
                const timestamp = r.updatedAt || r.createdAt || 0;
                if (timestamp > latestTimestamp) {
                  latestTimestamp = timestamp;
                  latestRecord = r;
                }
              });

              // Determine status
              let status = "A";
              const recordStatus = latestRecord.status;

              if (recordStatus === "Present" || recordStatus === "Half Day") {
                status = "P";
              } else if (recordStatus === "Holiday" || recordStatus === "Week Off" || newHolidays.has(dateStr)) {
                status = "H";
              } else if (recordStatus === "Absent" || recordStatus === "Leave") {
                status = "A";
              }

              // Store status
              if (!newAttendance[empId]) newAttendance[empId] = {};
              newAttendance[empId][dateStr] = status;

              // Accumulate OT hours
              if (typeof latestRecord.otHrs === 'number') {
                if (!newOtHours[empId]) newOtHours[empId] = 0;
                newOtHours[empId] += latestRecord.otHrs;
              }

              // Accumulate Pending hours
              if (typeof latestRecord.pendingHrs === 'number') {
                if (!newPendingHours[empId]) newPendingHours[empId] = 0;
                newPendingHours[empId] += latestRecord.pendingHrs;
              }
            });
          }).catch(error => {
            console.error(`Error fetching attendance for ${dateStr}:`, error);
          })
        );
      }

      await Promise.all(promises);

      console.log("Attendance data loaded for", Object.keys(newAttendance).length, "employees");

      setHolidays(newHolidays);
      setAttendanceData(newAttendance);
      setOtHoursData(newOtHours);
      setPendingHoursData(newPendingHours);
      setLoading(false);
    };

    fetchAttendance();
  }, [selectedMonth, selectedYear, employees, daysInMonth, yearMonth]);

  // Build attendance list
  const employeeAttendanceList = useMemo(() => {
    if (employees.length === 0) return [];

    return employees
      .filter((emp) => department === "All" || emp.department === department)
      .map((emp) => {
        const days = Array(daysInMonth).fill("A");
        let present = 0;
        let leave = 0;
        let absent = 0;

        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${yearMonth}-${String(d).padStart(2, "0")}`;
          const status = attendanceData[emp.id]?.[dateStr];

          if (status === "P") {
            present++;
            days[d - 1] = "P";
          } else if (status === "L") {
            leave++;
            days[d - 1] = "L";
          } else if (status === "H" || holidays.has(dateStr)) {
            days[d - 1] = "H";
          } else if (status === "A") {
            absent++;
            days[d - 1] = "A";
          } else {
            // No status - default to absent
            absent++;
            days[d - 1] = "A";
          }
        }

        const totalOtHours = otHoursData[emp.id] || 0;
        const totalPendingHours = pendingHoursData[emp.id] || 0;
        const netOtHours = totalOtHours - totalPendingHours;

        // Combined Absent + Leave
        const totalAbsentAndLeave = absent + leave;

        return {
          ...emp,
          days,
          present,
          leave,
          absent,
          totalAbsentAndLeave,
          totalOtHours,
          totalPendingHours,
          netOtHours,
          totalOtFormatted: formatOTHours(totalOtHours),
          totalPendingFormatted: formatOTHours(totalPendingHours),
          netOtFormatted: formatOTHours(netOtHours),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, attendanceData, holidays, otHoursData, pendingHoursData, department, yearMonth, daysInMonth]);

  const exportToExcel = () => {
    const rows = employeeAttendanceList.map((emp, i) => {
      // Create the row object with proper column order
      const row: any = {
        "S.No": i + 1,
        "Employee Name": emp.name,
        "Category": emp.cName,
        "Month": `${selectedMonth} ${selectedYear}`,
        "Total Days": daysInMonth,
      };

      // Add day columns (1, 2, 3, ... 31)
      emp.days.forEach((status, idx) => {
        row[`Day ${idx + 1}`] = status;
      });

      // Add summary columns at the end
      row["Present Days"] = emp.present;
      row["Total Absent"] = emp.totalAbsentAndLeave;
      row["Total OT Hours"] = emp.totalOtFormatted;
      row["Pending Hours"] = emp.totalPendingFormatted;
      row["Net OT Hours"] = emp.netOtFormatted;

      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    
    // Auto-size columns
    const cols = [
      { wch: 6 },  // S.No
      { wch: 25 }, // Employee Name
      { wch: 15 }, // Category
      { wch: 15 }, // Month
      { wch: 12 }, // Total Days
    ];
    
    // Add column width for each day
    for (let i = 0; i < daysInMonth; i++) {
      cols.push({ wch: 4 });
    }
    
    // Add column width for summary columns
    cols.push(
      { wch: 12 }, // Present Days
      { wch: 15 }, // Total Absent
      { wch: 15 }, // Total OT Hours
      { wch: 15 }, // Pending Hours
      { wch: 15 }  // Net OT Hours
    );
    
    ws['!cols'] = cols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `Attendance_${selectedMonth}_${selectedYear}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4 md:p-8">
      <Card className="max-w-full mx-auto shadow-2xl rounded-2xl overflow-hidden border-0">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-blue-500 text-white p-8 md:p-12">
          <h1 className="text-4xl md:text-5xl font-extrabold text-center mb-8 tracking-tight">
            Monthly Attendance Sheet
          </h1>

          <div className="flex flex-col md:flex-row justify-center items-center gap-6 max-w-5xl mx-auto">
            <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md px-6 py-4 rounded-xl">
              <Calendar className="w-8 h-8 text-yellow-300" />
              <div className="flex gap-3">
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-48 bg-white text-gray-900 font-semibold text-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (
                      <SelectItem key={m} value={m} className="text-lg">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-28 bg-white text-gray-900 font-bold text-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["2024", "2025", "2026", "2027"].map((y) => (
                      <SelectItem key={y} value={y} className="text-lg">{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md px-6 py-4 rounded-xl">
              <Users className="w-8 h-8 text-cyan-300" />
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger className="w-64 bg-white text-gray-900 font-semibold text-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Departments</SelectItem>
                  <SelectItem value="Staff">Staff</SelectItem>
                  <SelectItem value="Worker">Worker</SelectItem>
                  <SelectItem value="Other Workers">Other Workers</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={exportToExcel}
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg px-10 py-6 rounded-xl shadow-lg transform hover:scale-105 transition"
            >
              <Download className="w-6 h-6 mr-3" />
              Export Excel
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="p-6 bg-white">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Loader2 className="w-16 h-16 animate-spin text-blue-600 mb-4" />
              <p className="text-xl text-gray-600">Loading attendance data...</p>
            </div>
          ) : employeeAttendanceList.length === 0 ? (
            <div className="text-center py-20 text-gray-500 text-xl">
              No employees found for selected filters
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-lg">
              <table className="w-full text-sm md:text-base border-collapse">
                <thead>
                  <tr className="bg-gradient-to-r from-blue-700 to-blue-600 text-white">
                    <th rowSpan={2} className="px-4 py-5 font-bold">S.No</th>
                    <th rowSpan={2} className="px-8 py-5 font-bold">Employee Name</th>
                    <th rowSpan={2} className="px-6 py-5 font-bold">Category</th>
                    <th rowSpan={2} className="px-6 py-5 font-bold">Month</th>
                    <th rowSpan={2} className="px-5 py-5 font-bold">Total</th>
                    <th colSpan={daysInMonth} className="px-4 py-3 font-extrabold text-yellow-200 text-lg">
                      DAYS
                    </th>
                    <th rowSpan={2} className="px-6 py-5 font-bold text-green-300">P</th>
                    <th rowSpan={2} className="px-6 py-5 font-bold text-red-300">Absent</th>
                    <th rowSpan={2} className="px-6 py-5 font-bold text-orange-300">OT Hrs</th>
                    <th rowSpan={2} className="px-6 py-5 font-bold text-purple-300">Pending</th>
                    <th rowSpan={2} className="px-6 py-5 font-bold text-emerald-300">Net OT</th>
                    <th rowSpan={2} className="px-4 py-5 font-bold">S.No</th>
                  </tr>
                  <tr className="bg-blue-800 text-white">
                    {Array.from({ length: daysInMonth }, (_, i) => (
                      <th key={i + 1} className="px-3 py-3 font-bold">
                        {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employeeAttendanceList.map((emp, idx) => (
                    <tr
                      key={emp.id}
                      className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-blue-100 transition-all border-b"
                    >
                      <td className="px-4 py-4 text-center font-medium text-gray-700">{idx + 1}</td>
                      <td className="px-8 py-4 font-semibold text-gray-900 text-lg">{emp.name}</td>
                      <td className="px-6 py-4 text-gray-700">{emp.cName}</td>
                      <td className="px-6 py-4 text-center">{selectedMonth} {selectedYear}</td>
                      <td className="px-5 py-4 text-center font-bold text-gray-800">{daysInMonth}</td>

                      {emp.days.map((status, i) => (
                        <td
                          key={i}
                          className={`px-4 py-3 text-center text-xl font-bold ${
                            status === "P" ? "text-green-600" :
                            status === "L" ? "text-red-600" :
                            status === "H" ? "text-blue-600" :
                            "text-gray-400"
                          }`}
                        >
                          {status}
                        </td>
                      ))}

                      <td className="px-6 py-4 text-center text-2xl font-bold text-green-600">
                        {emp.present}
                      </td>
                      <td className="px-6 py-4 text-center text-2xl font-bold text-red-600">
                        {emp.totalAbsentAndLeave}
                      </td>
                      <td className="px-6 py-4 text-center text-xl font-bold text-orange-600">
                        {emp.totalOtFormatted}
                      </td>
                      <td className="px-6 py-4 text-center text-xl font-bold text-purple-600">
                        {emp.totalPendingFormatted}
                      </td>
                      <td className="px-6 py-4 text-center text-xl font-bold text-emerald-600">
                        {emp.netOtFormatted}
                      </td>
                      <td className="px-4 py-4 text-center font-medium text-gray-700">{idx + 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div className="mt-10 flex flex-wrap justify-center gap-6 text-lg font-medium">
            {["P", "H", "A"].map((s) => (
              <span key={s} className="flex items-center gap-3">
                <span
                  className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xl ${
                    s === "P" ? "bg-green-500" :
                    s === "H" ? "bg-blue-500" : "bg-gray-500"
                  }`}
                >
                  {s}
                </span>
                <span>
                  {s === "P" ? "Present" : s === "H" ? "Holiday" : "Absent"}
                </span>
              </span>
            ))}
            <span className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-lg flex items-center justify-center bg-orange-500 text-white font-bold text-xl">
                OT
              </span>
              <span>Total OT Hours</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-500 text-white font-bold text-xl">
                P
              </span>
              <span>Pending Hours</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-500 text-white font-bold text-xl">
                N
              </span>
              <span>Net OT (OT - Pending)</span>
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
