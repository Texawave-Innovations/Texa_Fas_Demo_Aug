// src/modules/hr/StaffOThours.tsx
import { useEffect, useState, useMemo } from 'react';
import { Download, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAllRecords } from '@/services/firebase';
import { ref, onValue } from 'firebase/database';
import { database } from '@/services/firebase';
import * as XLSX from 'xlsx';

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  department: string;
}

interface AttendanceRecord {
  employeeId: string;
  employeeName: string;
  otHrs: number;
  date: string;
}

export default function StaffOThours() {
  const [staffEmployees, setStaffEmployees] = useState<Employee[]>([]);
  const [otData, setOtData] = useState<Record<string, number>>({}); // employeeId → total OT hrs
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

  // Fetch only Staff employees
  useEffect(() => {
    getAllRecords('hr/employees').then((data: any[]) => {
      const staff = data
        .filter(e => e.department === 'Staff' && e.status !== 'inactive')
        .map(e => ({ id: e.id, employeeId: e.employeeId, name: e.name, department: e.department }));
      setStaffEmployees(staff);
    });
  }, []);

  // Fetch OT hours for selected month
  useEffect(() => {
    const yearMonth = selectedMonth;
    const startDate = `${yearMonth}-01`;
    const endDate = new Date(parseInt(yearMonth.split('-')[0]), parseInt(yearMonth.split('-')[1]), 0)
      .toISOString().split('T')[0];

    const days = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().split('T')[0]);
    }

    const otMap: Record<string, number> = {};

    const fetchPromises = days.map(date =>
      new Promise<void>((resolve) => {
        const attRef = ref(database, `hr/attendance/${date}`);
        onValue(attRef, (snap) => {
          const data = snap.val();
          if (data) {
            Object.values(data).forEach((rec: any) => {
              if (rec.employeeId && rec.otHrs > 0) {
                otMap[rec.employeeId] = (otMap[rec.employeeId] || 0) + rec.otHrs;
              }
            });
          }
          resolve();
        }, { onlyOnce: true });
      })
    );

    Promise.all(fetchPromises).then(() => {
      setOtData(otMap);
    });
  }, [selectedMonth]);

  const staffWithOT = useMemo(() => {
    return staffEmployees.map(emp => ({
      ...emp,
      totalOT: otData[emp.id] || 0
    })).sort((a, b) => b.totalOT - a.totalOT);
  }, [staffEmployees, otData]);

  const grandTotalOT = staffWithOT.reduce((sum, e) => sum + e.totalOT, 0);

  const exportToExcel = () => {
    // Format month and year properly
    const monthDate = new Date(selectedMonth + '-01');
    const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const monthYear = monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    // Prepare data with month column
    const data = staffWithOT.map((e, index) => ({
      'Sl.No': index + 1,
      'Month': monthName,
      'Employee ID': e.employeeId,
      'Name': e.name,
      'Department': e.department,
      'Total OT Hours': e.totalOT.toFixed(2),
      'Status': e.totalOT === 0 ? 'No OT' : e.totalOT > 50 ? 'High OT' : 'Normal'
    }));

    // Add summary row
    data.push({
      'Sl.No': '',
      'Month': '',
      'Employee ID': '',
      'Name': 'TOTAL',
      'Department': '',
      'Total OT Hours': grandTotalOT.toFixed(2),
      'Status': ''
    } as any);

    const ws = XLSX.utils.json_to_sheet(data);

    // Add title row at the top
    XLSX.utils.sheet_add_aoa(ws, [[`Staff OT Summary - ${monthName}`]], { origin: 'A1' });
    
    // Shift data down by 2 rows to accommodate title and blank row
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    range.e.r += 2;
    ws['!ref'] = XLSX.utils.encode_range(range);

    // Add headers at row 3
    XLSX.utils.sheet_add_aoa(
      ws,
      [['Sl.No', 'Month', 'Employee ID', 'Name', 'Department', 'Total OT Hours', 'Status']],
      { origin: 'A3' }
    );

    // Add the data starting from row 4
    staffWithOT.forEach((e, index) => {
      XLSX.utils.sheet_add_aoa(
        ws,
        [[
          index + 1,
          monthName,
          e.employeeId,
          e.name,
          e.department,
          e.totalOT.toFixed(2),
          e.totalOT === 0 ? 'No OT' : e.totalOT > 50 ? 'High OT' : 'Normal'
        ]],
        { origin: `A${4 + index}` }
      );
    });

    // Add total row
    const totalRow = 4 + staffWithOT.length;
    XLSX.utils.sheet_add_aoa(
      ws,
      [['', '', '', 'TOTAL', '', grandTotalOT.toFixed(2), '']],
      { origin: `A${totalRow}` }
    );

    // Set column widths
    ws['!cols'] = [
      { wch: 8 },   // Sl.No
      { wch: 20 },  // Month
      { wch: 15 },  // Employee ID
      { wch: 25 },  // Name
      { wch: 15 },  // Department
      { wch: 18 },  // Total OT Hours
      { wch: 12 }   // Status
    ];

    // Style the title cell
    if (ws['A1']) {
      ws['A1'].s = {
        font: { bold: true, sz: 14 },
        alignment: { horizontal: 'center' }
      };
    }

    // Merge title cells
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } } // Merge A1 to G1
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff OT Hours');
    
    // File name with month and year
    XLSX.writeFile(wb, `Staff_OT_Hours_${monthYear.replace(' ', '_')}.xlsx`);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="flex items-center gap-4">
          <Clock className="h-10 w-10 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold">Staff OT Hours</h1>
            <p className="text-muted-foreground">Monthly overtime summary for Staff department</p>
          </div>
        </div>
        <Button onClick={exportToExcel} className="bg-blue-600 hover:bg-blue-700 w-full lg:w-auto">
          <Download className="h-4 w-4 mr-2" />
          Export to Excel
        </Button>
      </div>

      {/* Month Filter */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <Label className="text-lg">Select Month</Label>
            <Input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="w-full md:w-64"
            />
            <div className="ml-auto text-right">
              <p className="text-sm text-muted-foreground">Total OT Hours</p>
              <p className="text-3xl font-bold text-blue-600">{grandTotalOT.toFixed(2)} hrs</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* OT Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Calendar className="h-6 w-6 text-blue-600" />
            Staff Overtime - {new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100">
                  <TableHead className="w-20">Sl.No</TableHead>
                  <TableHead className="w-32">Employee ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-center">Total OT Hours</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffWithOT.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      No staff employees or no OT recorded for this month
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {staffWithOT.map((emp, index) => (
                      <TableRow key={emp.id} className={emp.totalOT > 50 ? 'bg-amber-50' : ''}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell className="font-medium">{emp.employeeId}</TableCell>
                        <TableCell className="font-semibold">{emp.name}</TableCell>
                        <TableCell className="font-bold text-blue-700 text-center">
                          {emp.totalOT.toFixed(2)} hrs
                        </TableCell>
                        <TableCell className="text-center">
                          {emp.totalOT === 0 ? (
                            <span className="text-muted-foreground text-sm">No OT</span>
                          ) : emp.totalOT > 50 ? (
                            <span className="text-amber-700 font-medium">High OT</span>
                          ) : (
                            <span className="text-green-700 font-medium">Normal</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Total Row */}
                    <TableRow className="bg-blue-50 font-bold">
                      <TableCell colSpan={3} className="text-right font-bold text-lg">
                        TOTAL
                      </TableCell>
                      <TableCell className="text-center font-bold text-blue-800 text-lg">
                        {grandTotalOT.toFixed(2)} hrs
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-blue-700">Total Staff</p>
            <p className="text-4xl font-bold text-blue-800">{staffEmployees.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-green-50 to-emerald-50">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-green-700">With OT</p>
            <p className="text-4xl font-bold text-green-800">
              {staffWithOT.filter(e => e.totalOT > 0).length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-purple-50 to-pink-50">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-purple-700">Avg OT per Staff</p>
            <p className="text-4xl font-bold text-purple-800">
              {(grandTotalOT / staffEmployees.length || 0).toFixed(2)} hrs
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
