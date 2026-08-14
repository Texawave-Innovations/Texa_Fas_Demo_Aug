import { useEffect, useState } from 'react';
import { Pencil, Trash2, Search, Plus, IndianRupee, Check, X, Filter, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { RowActions } from '@/components/ui/row-actions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Link, useNavigate } from 'react-router-dom';
import { deleteRecord, getAllRecords, updateRecord } from '@/services/firebase';
import { Employee } from '@/types';

const DEPARTMENTS = ['All Departments', 'Staff', 'Worker', 'Other Workers'] as const;

export default function EmployeesList() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filtered, setFiltered] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('All Departments');
  const [selectedName, setSelectedName] = useState<string>('All Employees');
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Read user role from localStorage
  useEffect(() => {
    try {
      const userData = localStorage.getItem('erp_user');
      if (userData) {
        const user = JSON.parse(userData);
        setIsAdmin(user?.role === 'admin');
      }
    } catch (error) {
      console.error('Failed to read erp_user', error);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, []);

  // Helper function to get monthly salary from different data structures
  const getMonthlySalary = (emp: any): number => {
    // Priority 1: Check monthlySalary field (new structure)
    if (emp.monthlySalary && emp.monthlySalary > 0) {
      return emp.monthlySalary;
    }
    
    // Priority 2: Check salary.grossMonthly (old structure)
    if (emp.salary?.grossMonthly) {
      return emp.salary.grossMonthly;
    }
    
    // Priority 3: Check salary.monthlySalary
    if (emp.salary?.monthlySalary) {
      return emp.salary.monthlySalary;
    }
    
    // Priority 4: Calculate from allowances if available
    if (emp.allowances) {
      const { basic = 0, hra = 0, conveyance = 0, otherAllowances = 0 } = emp.allowances;
      return basic + hra + conveyance + otherAllowances;
    }
    
    return 0;
  };

  // Helper function to get CTC in LPA
  const getCTCLPA = (emp: any): number => {
    // Priority 1: Check salary.ctcLPA (old structure)
    if (emp.salary?.ctcLPA) {
      return emp.salary.ctcLPA;
    }
    
    // Priority 2: Calculate from monthlySalary
    const monthly = getMonthlySalary(emp);
    if (monthly > 0) {
      return parseFloat(((monthly * 12) / 100000).toFixed(2));
    }
    
    return 0;
  };

  const fetchEmployees = async () => {
    try {
      const data = await getAllRecords('hr/employees');
      const employeesWithStatus = (data as Employee[]).map(emp => ({
        ...emp,
        status: emp.status || 'active',
        // Add computed fields for easy access
        computedMonthlySalary: getMonthlySalary(emp),
        computedCTCLPA: getCTCLPA(emp)
      }));
      setEmployees(employeesWithStatus);
    } catch (error) {
      toast({ title: 'Failed to load employees', variant: 'destructive' });
    }
  };

  // Get unique employee names for selected department
  const getEmployeeNamesInDept = () => {
    if (selectedDept === 'All Departments') return [];
    return Array.from(
      new Set(
        employees
          .filter(e => e.department === selectedDept)
          .map(e => e.name)
          .filter(Boolean)
          .sort()
      )
    );
  };

  const employeeNames = selectedDept === 'All Departments' ? [] : getEmployeeNamesInDept();

  // Apply all filters
  useEffect(() => {
    let result = employees;

    // Search filter
    if (search.trim()) {
      result = result.filter(e =>
        e.name?.toLowerCase().includes(search.toLowerCase()) ||
        e.employeeId?.toLowerCase().includes(search.toLowerCase()) ||
        e.email?.toLowerCase().includes(search.toLowerCase()) ||
        e.phone?.includes(search) ||
        e.department?.toLowerCase().includes(search.toLowerCase()) ||
        e.role?.toLowerCase().includes(search.toLowerCase()) ||
        (e.status || 'active').toLowerCase().includes(search.toLowerCase())
      );
    }

    // Department filter
    if (selectedDept !== 'All Departments') {
      result = result.filter(e => e.department === selectedDept);
    }

    // Name filter
    if (selectedName !== 'All Employees') {
      result = result.filter(e => e.name === selectedName);
    }

    setFiltered(result);
  }, [search, employees, selectedDept, selectedName]);

  const handleDelete = async (id: string) => {
    if (!isAdmin) {
      toast({ title: 'Access Denied', description: 'Only admins can delete.', variant: 'destructive' });
      return;
    }
    if (!confirm('Are you sure you want to delete this employee?')) return;

    try {
      await deleteRecord('hr/employees', id);
      toast({ title: 'Employee deleted' });
      fetchEmployees();
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  };

  const toggleStatus = async (id: string, current: string) => {
    if (!isAdmin) {
      toast({ title: 'Access Denied', description: 'Only admins can change status.', variant: 'destructive' });
      return;
    }

    setUpdatingStatus(id);
    const newStatus = current === 'active' ? 'inactive' : 'active';

    try {
      await updateRecord('hr/employees', id, { status: newStatus });
      setEmployees(prev =>
        prev.map(emp => (emp.id === id ? { ...emp, status: newStatus } : emp))
      );
      toast({ title: 'Status updated', description: `Now ${newStatus.toUpperCase()}` });
    } catch {
      toast({ title: 'Update failed', variant: 'destructive' });
    } finally {
      setUpdatingStatus(null);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setSelectedDept('All Departments');
    setSelectedName('All Employees');
  };

  const hasActiveFilters = search || selectedDept !== 'All Departments' || selectedName !== 'All Employees';

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employees</h1>
          <p className="text-muted-foreground">Manage team members • Total: {employees.length}</p>
        </div>
        <Link to="new">
          <Button size="lg" className="bg-blue-700 hover:bg-blue-800">
            <Plus className="h-5 w-5 mr-2" />
            Add Employee
          </Button>
        </Link>
      </div>

      {/* Filters Bar */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search by name, ID, email, phone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-11"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              {/* Department Filter */}
              <Select value={selectedDept} onValueChange={setSelectedDept}>
                <SelectTrigger className="w-56">
                  <SelectValue>
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      {selectedDept}
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Employee Name Filter (only when dept selected) */}
              {selectedDept !== 'All Departments' && employeeNames.length > 0 && (
                <Select value={selectedName} onValueChange={setSelectedName}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="All Employees in Dept" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Employees">All Employees</SelectItem>
                    {employeeNames.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Clear Filters */}
              {hasActiveFilters && (
                <Button variant="outline" onClick={clearFilters} size="sm">
                  <XCircle className="h-4 w-4 mr-2" />
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Results Count */}
      {hasActiveFilters && (
        <div className="text-sm text-muted-foreground">
          Showing <span className="font-semibold">{filtered.length}</span> of {employees.length} employees
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Photo</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Monthly Gross</TableHead>
                  <TableHead>CTC (LPA)</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-20 text-muted-foreground text-lg">
                      {search || selectedDept !== 'All Departments' || selectedName !== 'All Employees'
                        ? 'No employees match your filters.'
                        : 'No employees found. Click "Add Employee" to get started!'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(emp => {
                    const isActive = (emp.status || 'active').toLowerCase() === 'active';
                    const monthlySalary = getMonthlySalary(emp);
                    const ctcLPA = getCTCLPA(emp);

                    return (
                      <TableRow key={emp.id} className="hover:bg-muted/50 transition">
                        <TableCell>
                          {emp.profilePhoto ? (
                            <img
                              src={emp.profilePhoto}
                              alt={emp.name}
                              className="h-12 w-12 rounded-full object-cover ring-2 ring-background shadow-sm"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500/20 to-blue-600/40 flex items-center justify-center font-bold text-blue-700">
                              {emp.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="font-semibold text-blue-700">{emp.employeeId}</TableCell>
                        <TableCell className="font-medium text-lg">{emp.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-medium">
                            {emp.department}
                          </Badge>
                        </TableCell>
                        <TableCell>{emp.role || '-'}</TableCell>
                        <TableCell>{emp.phone}</TableCell>

                        <TableCell className="font-bold text-green-600">
                          <div className="flex items-center gap-1">
                            <IndianRupee className="h-4 w-4" />
                            {monthlySalary > 0 ? monthlySalary.toLocaleString('en-IN') : '-'}
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge variant="outline" className="text-lg font-bold text-blue-700 border-blue-300">
                            {ctcLPA > 0 ? `${ctcLPA} LPA` : '-'}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-center">
                          {isAdmin ? (
                            <Button
                              size="sm"
                              variant={isActive ? "default" : "destructive"}
                              className={`min-w-28 font-medium ${isActive ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                              onClick={() => toggleStatus(emp.id!, emp.status || 'active')}
                              disabled={updatingStatus === emp.id}
                            >
                              {updatingStatus === emp.id ? 'Updating...' : isActive ? 'Active' : 'Inactive'}
                            </Button>
                          ) : (
                            <StatusBadge status={isActive ? 'Active' : 'Inactive'} />
                          )}
                        </TableCell>

                        <TableCell>
                          <div className="flex justify-center">
                            <RowActions
                              actions={[
                                { label: 'Edit', icon: Pencil, onClick: () => navigate(`edit/${emp.id}`) },
                                { label: 'Delete', icon: Trash2, onClick: () => handleDelete(emp.id!), className: 'text-red-600 hover:text-red-700', hidden: !isAdmin },
                              ]}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
