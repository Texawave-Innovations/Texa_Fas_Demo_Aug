// src/modules/hr/Documents.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { FileText, Eye, User, Building2, Calendar, Phone } from 'lucide-react';
import { getAllRecords } from '@/services/firebase';
import { Employee } from '@/types';

export default function Documents() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const data = await getAllRecords('hr/employees');
        const sorted = (data as Employee[]).sort((a, b) =>
          new Date(b.joiningDate!).getTime() - new Date(a.joiningDate!).getTime()
        );
        setEmployees(sorted);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchEmployees();
  }, []);

  const handleViewDocuments = (id: string) => {
    navigate(`/hr/documents/${id}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-xl font-medium text-gray-500 animate-pulse">Loading employees...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <FileText className="h-10 w-10 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-blue-900">Employee Documents</h1>
            <p className="text-gray-600 mt-1">View and download all uploaded documents</p>
          </div>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          Total: {employees.length} Employees
        </Badge>
      </div>

      {/* Table Card */}
      <Card className="shadow-xl border-0">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl">
          <CardTitle className="text-2xl flex items-center gap-3">
            <User className="h-7 w-7 text-blue-700" />
            All Employees Document List
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 hover:bg-gray-50">
                  <TableHead className="w-20 text-center font-bold">Photo</TableHead>
                  <TableHead className="font-bold">Employee ID</TableHead>
                  <TableHead className="font-bold">Name</TableHead>
                  <TableHead className="font-bold">Contact</TableHead>
                  <TableHead className="font-bold">Department</TableHead>
                  <TableHead className="font-bold">Role</TableHead>
                  <TableHead className="font-bold">Joining Date</TableHead>
                  <TableHead className="font-bold text-center">Status</TableHead>
                  <TableHead className="font-bold">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {employees.map((emp) => (
                  <TableRow
                    key={emp.id}
                    className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                    onClick={() => handleViewDocuments(emp.id!)}
                  >
                    <TableCell className="text-center">
                      <Avatar className="h-12 w-12 ring-2 ring-blue-200 mx-auto">
                        <AvatarImage src={emp.profilePhoto} />
                        <AvatarFallback className="bg-blue-100 text-blue-700 font-bold">
                          {emp.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>

                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-sm px-3 py-1">
                        {emp.employeeId}
                      </Badge>
                    </TableCell>

                    <TableCell className="font-semibold text-gray-800">
                      {emp.name}
                    </TableCell>

                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-sm">
                          <Phone className="h-3 w-3" /> {emp.phone}
                        </div>
                        <div className="text-xs text-gray-500">{emp.email}</div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-gray-500" />
                        <span className="font-medium">{emp.department}</span>
                      </div>
                    </TableCell>

                    <TableCell className="text-gray-700">{emp.role}</TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4" />
                        {new Date(emp.joiningDate!).toLocaleDateString('en-IN')}
                      </div>
                    </TableCell>

                    <TableCell className="text-center">
                      <StatusBadge status={emp.status?.toUpperCase() || ''} />
                    </TableCell>

                    <TableCell>
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewDocuments(emp.id!);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Documents
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* No Data State */}
            {employees.length === 0 && (
              <div className="text-center py-16">
                <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg text-gray-500">No employees found</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}