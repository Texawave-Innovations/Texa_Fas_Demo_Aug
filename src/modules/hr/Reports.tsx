import { useEffect, useState } from 'react';
import { Download, FileText, Users, Calendar, TrendingUp, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Employee, Leave, DEPARTMENTS } from '@/types';
import { getAllRecords } from '@/services/firebase';

export default function HRReports() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const empData = await getAllRecords('hr/employees');
    const leaveData = await getAllRecords('hr/leaves');
    setEmployees(empData as Employee[]);
    setLeaves(leaveData as Leave[]);
  };

  const filteredEmployees = employees.filter(e => 
    departmentFilter === 'all' || e.department === departmentFilter
  );

  const filteredLeaves = leaves.filter(l => {
    const matchesDept = departmentFilter === 'all' || l.department === departmentFilter;
    const matchesMonth = !monthFilter || l.startDate?.startsWith(monthFilter);
    return matchesDept && matchesMonth;
  });

  const exportEmployeeReport = () => {
    const csv = [
      ['Employee ID', 'Name', 'Department', 'Role', 'Phone', 'Email', 'Joining Date', 'Status', 'Gross Salary'].join(','),
      ...filteredEmployees.map(e => [
        e.employeeId,
        e.name,
        e.department,
        e.role,
        e.phone,
        e.email,
        e.joiningDate,
        e.status,
        e.salary?.grossMonthly || 0,
      ].join(','))
    ].join('\n');

    downloadCSV(csv, `employee-report-${departmentFilter}.csv`);
  };

  const exportLeaveReport = () => {
    const csv = [
      ['Employee', 'Department', 'Start Date', 'End Date', 'Days', 'Reason', 'Status'].join(','),
      ...filteredLeaves.map(l => [
        l.employeeName,
        l.department || 'N/A',
        l.startDate,
        l.endDate,
        l.totalDays || '',
        `"${l.reason}"`,
        l.status,
      ].join(','))
    ].join('\n');

    downloadCSV(csv, `leave-report-${monthFilter}.csv`);
  };

  const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  const departmentWiseCount = filteredEmployees.reduce((acc: Record<string, number>, emp) => {
    acc[emp.department] = (acc[emp.department] || 0) + 1;
    return acc;
  }, {});

  const totalSalary = filteredEmployees.reduce((sum, e) => sum + (e.salary?.grossMonthly || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">HR Reports</h2>
          <p className="text-muted-foreground">Generate and export HR analytics</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Month</Label>
            <Input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Department</Label>
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Depts</SelectItem>
                {DEPARTMENTS.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> Total Employees
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{filteredEmployees.length}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Monthly Payroll
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-700">₹{totalSalary.toLocaleString('en-IN')}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-700 flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Leave Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-700">{filteredLeaves.length}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-700">Pending Leaves</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-700">
              {filteredLeaves.filter(l => l.status === 'Pending').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Export Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Employee Report
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Filtered Employees</p>
              <p className="text-3xl font-bold">{filteredEmployees.length}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(departmentWiseCount).map(([dept, count]) => (
                <Badge key={dept} variant="secondary">
                  {dept}: {count}
                </Badge>
              ))}
            </div>
            <Button onClick={exportEmployeeReport} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Export Employee Data
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-green-600" />
              Leave Report
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{filteredLeaves.length}</p>
              </div>
              <div>
                <p className="text-sm text-green-600">Approved</p>
                <p className="text-2xl font-bold text-green-600">
                  {filteredLeaves.filter(l => l.status === 'Approved').length}
                </p>
              </div>
              <div>
                <p className="text-sm text-red-600">Rejected</p>
                <p className="text-2xl font-bold text-red-600">
                  {filteredLeaves.filter(l => l.status === 'Rejected').length}
                </p>
              </div>
            </div>
            <Button onClick={exportLeaveReport} className="w-full" variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Leave Data
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Department Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Department-wise Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(departmentWiseCount).map(([dept, count]) => {
              const percentage = Math.round((count / filteredEmployees.length) * 100);
              return (
                <div key={dept} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{dept}</span>
                    <span className="text-lg font-bold text-primary">{count} ({percentage}%)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
