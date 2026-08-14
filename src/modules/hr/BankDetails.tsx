import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAllRecords } from '@/services/firebase';
import { EmployeeProfile } from '@/types/hr';

export default function BankDetails() {
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [filtered, setFiltered] = useState<EmployeeProfile[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState('All');

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (departmentFilter === 'All') {
      setFiltered(employees);
    } else {
      setFiltered(employees.filter(e => e.department === departmentFilter));
    }
  }, [departmentFilter, employees]);

  const fetchEmployees = async () => {
    const data = await getAllRecords('hr/employees');
    setEmployees(data as EmployeeProfile[]);
  };

  const exportToCSV = () => {
    const csv = [
      ['S.No', 'Employee Name', 'Bank Account', 'Bank Name', 'Branch', 'IFSC', 'PAN', 'Aadhaar', 'ESI No'].join(','),
      ...filtered.map((e, idx) => [
        idx + 1,
        e.name,
        e.bankDetails?.bankAccountNo || 'N/A',
        e.bankDetails?.bankName || 'N/A',
        e.bankDetails?.bankBranch || 'N/A',
        e.bankDetails?.bankIfsc || 'N/A',
        e.bankDetails?.panNumber || 'N/A',
        e.bankDetails?.aadhaarNumber || 'N/A',
        e.bankDetails?.esiNumber || 'N/A',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bank-details.csv';
    a.click();
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Employee Bank Details</h1>
          <p className="text-muted-foreground mt-1">View bank and compliance information</p>
        </div>
        <Button variant="outline" onClick={exportToCSV}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      <Card>
        <CardHeader>
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Departments</SelectItem>
              <SelectItem value="Staff">Staff</SelectItem>
              <SelectItem value="Worker">Worker</SelectItem>
              <SelectItem value="Visitors">Visitors</SelectItem>
              <SelectItem value="Others">Others</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>S.No</TableHead>
                  <TableHead>Employee Name</TableHead>
                  <TableHead>Bank Account</TableHead>
                  <TableHead>Bank Name</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>IFSC</TableHead>
                  <TableHead>PAN</TableHead>
                  <TableHead>Aadhaar</TableHead>
                  <TableHead>ESI No</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No employees found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((emp, idx) => (
                    <TableRow key={emp.id}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell>{emp.bankDetails?.bankAccountNo || 'N/A'}</TableCell>
                      <TableCell>{emp.bankDetails?.bankName || 'N/A'}</TableCell>
                      <TableCell>{emp.bankDetails?.bankBranch || 'N/A'}</TableCell>
                      <TableCell>{emp.bankDetails?.bankIfsc || 'N/A'}</TableCell>
                      <TableCell>{emp.bankDetails?.panNumber || 'N/A'}</TableCell>
                      <TableCell>{emp.bankDetails?.aadhaarNumber || 'N/A'}</TableCell>
                      <TableCell>{emp.bankDetails?.esiNumber || 'N/A'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
