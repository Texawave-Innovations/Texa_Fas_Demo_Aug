// src/modules/hr/LeaveManagement.tsx
import { useEffect, useState, useMemo } from 'react';
import { Plus, Check, X, Search, Calendar, Filter, Download, Clock, User, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { Leave, Employee, DEPARTMENTS } from '@/types';
import { createRecord, updateRecord, getAllRecords, deleteRecord } from '@/services/firebase';
import { ref, set } from 'firebase/database';
import { database } from '@/services/firebase';

const calculateDays = (start: string, end: string): number => {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  const diff = e.getTime() - s.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
};

const isAdmin = () => {
  const user = localStorage.getItem('erp_user');
  if (!user) return false;
  try {
    const parsed = JSON.parse(user);
    return parsed.role === 'admin';
  } catch {
    return false;
  }
};

export default function LeaveManagement() {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [formData, setFormData] = useState({
    employeeId: '',
    employeeName: '',
    department: '',
    startDate: '',
    endDate: '',
    reason: '',
  });

  useEffect(() => {
    fetchLeaves();
    fetchEmployees();
  }, []);

  const fetchLeaves = async () => {
    const data = await getAllRecords('hr/leaves');
    setLeaves((data as Leave[]).sort((a: any, b: any) => b.appliedAt - a.appliedAt));
  };

  const fetchEmployees = async () => {
    const data = await getAllRecords('hr/employees');
    setEmployees(data as Employee[]);
  };

  // Auto-mark attendance as "Leave" when approved
  const markAttendanceAsLeave = async (employeeId: string, employeeName: string, start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const path = `hr/attendance/${dateStr}`;

      // Check if attendance already exists
      const existing = await getAllRecords(path);
      const existingRecord = Object.values(existing || {}).find((rec: any) => rec.employeeId === employeeId);

      const payload = {
        employeeId,
        employeeName,
        date: dateStr,
        status: 'Leave',
        checkIn: '',
        checkOut: '',
        workHrs: 0,
        otHrs: 0,
        pendingHrs: 0,
        totalHours: 0,
        notes: 'Auto-marked due to approved leave',
        createdAt: existingRecord?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      if (existingRecord?.id) {
        await updateRecord(path, existingRecord.id, payload);
      } else {
        await createRecord(path, payload);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.employeeId || !formData.startDate || !formData.endDate || !formData.reason) {
      toast({ title: 'Please fill all required fields', variant: 'destructive' });
      return;
    }

    if (new Date(formData.endDate) < new Date(formData.startDate)) {
      toast({ title: 'End date cannot be before start date', variant: 'destructive' });
      return;
    }

    try {
      const emp = employees.find(e => e.id === formData.employeeId);
      if (!emp) return;

      const totalDays = calculateDays(formData.startDate, formData.endDate);

      await createRecord('hr/leaves', {
        employeeId: formData.employeeId,
        employeeName: emp.name,
        department: emp.department,
        startDate: formData.startDate,
        endDate: formData.endDate,
        reason: formData.reason,
        totalDays,
        status: 'Pending',
        appliedAt: Date.now(),
      });

      toast({ title: 'Leave request submitted' });
      setIsDialogOpen(false);
      resetForm();
      fetchLeaves();
    } catch (error) {
      toast({ title: 'Failed to submit', variant: 'destructive' });
    }
  };

  const handleApprove = async (leave: Leave) => {
    if (!isAdmin()) {
      toast({ title: 'Only Admin can approve leaves', variant: 'destructive' });
      return;
    }

    try {
      await updateRecord('hr/leaves', leave.id!, {
        status: 'Approved',
        processedBy: JSON.parse(localStorage.getItem('erp_user') || '{}').name || 'Admin',
        processedAt: Date.now(),
      });

      // Auto-mark attendance as Leave
      await markAttendanceAsLeave(
        leave.employeeId!,
        leave.employeeName,
        leave.startDate,
        leave.endDate
      );

      toast({ title: 'Leave approved & attendance updated' });
      fetchLeaves();
    } catch (error) {
      toast({ title: 'Failed to approve', variant: 'destructive' });
    }
  };

  const handleReject = async (leave: Leave) => {
    if (!isAdmin()) {
      toast({ title: 'Only Admin can reject leaves', variant: 'destructive' });
      return;
    }

    try {
      await updateRecord('hr/leaves', leave.id!, {
        status: 'Rejected',
        processedBy: JSON.parse(localStorage.getItem('erp_user') || '{}').name || 'Admin',
        processedAt: Date.now(),
      });
      toast({ title: 'Leave rejected' });
      fetchLeaves();
    } catch (error) {
      toast({ title: 'Failed to reject', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin()) {
      toast({ title: 'Only Admin can delete', variant: 'destructive' });
      return;
    }
    if (!confirm('Delete this leave request?')) return;

    try {
      await deleteRecord('hr/leaves', id);
      toast({ title: 'Leave deleted' });
      fetchLeaves();
    } catch (error) {
      toast({ title: 'Failed to delete', variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setFormData({
      employeeId: '',
      employeeName: '',
      department: '',
      startDate: '',
      endDate: '',
      reason: '',
    });
  };

  const filteredLeaves = useMemo(() => {
    return leaves.filter(leave => {
      const matchesSearch = leave.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        leave.reason.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDept = departmentFilter === 'all' || leave.department === departmentFilter;
      const matchesStatus = statusFilter === 'all' || leave.status === statusFilter;
      const matchesMonth = !monthFilter || leave.startDate.startsWith(monthFilter);
      return matchesSearch && matchesDept && matchesStatus && matchesMonth;
    });
  }, [leaves, searchTerm, departmentFilter, statusFilter, monthFilter]);

  const stats = useMemo(() => ({
    total: filteredLeaves.length,
    pending: filteredLeaves.filter(l => l.status === 'Pending').length,
    approved: filteredLeaves.filter(l => l.status === 'Approved').length,
    rejected: filteredLeaves.filter(l => l.status === 'Rejected').length,
    totalDays: filteredLeaves.filter(l => l.status === 'Approved').reduce((s, l) => s + (l.totalDays || 0), 0),
  }), [filteredLeaves]);

  const exportToCSV = () => {
    const headers = ['Employee', 'Dept', 'From', 'To', 'Days', 'Reason', 'Status', 'Applied On'];
    const rows = filteredLeaves.map(l => [
      l.employeeName,
      l.department,
      l.startDate,
      l.endDate,
      l.totalDays,
      `"${l.reason.replace(/"/g, '""')}"`,
      l.status,
      new Date(l.appliedAt).toLocaleDateString()
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Leaves_${monthFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 p-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Leave Management</h2>
          <p className="text-muted-foreground">Manage employee leave requests</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={exportToCSV} variant="outline">
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Apply Leave</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>New Leave Request</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Employee</Label>
                  <Select value={formData.employeeId} onValueChange={(v) => {
                    const emp = employees.find(e => e.id === v);
                    setFormData({ ...formData, employeeId: v, department: emp?.department || '' });
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {employees.filter(e => e.status === 'active').map(emp => (
                        <SelectItem key={emp.id} value={emp.id!}>
                          {emp.name} ({emp.employeeId}) - {emp.department}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>From Date</Label>
                    <Input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} />
                  </div>
                  <div>
                    <Label>To Date</Label>
                    <Input type="date" value={formData.endDate} min={formData.startDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} />
                  </div>
                </div>

                {formData.startDate && formData.endDate && (
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="font-semibold text-blue-700">
                      Total Leave Days: {calculateDays(formData.startDate, formData.endDate)}
                    </p>
                  </div>
                )}

                <div>
                  <Label>Reason</Label>
                  <Textarea value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} rows={4} />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button type="submit">Submit Request</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold">{stats.total}</p><p>Total</p></CardContent></Card>
        <Card className="bg-amber-50"><CardContent className="pt-6 text-center text-amber-700"><p className="text-3xl font-bold">{stats.pending}</p><p>Pending</p></CardContent></Card>
        <Card className="bg-emerald-50"><CardContent className="pt-6 text-center text-emerald-700"><p className="text-3xl font-bold">{stats.approved}</p><p>Approved</p></CardContent></Card>
        <Card className="bg-red-50"><CardContent className="pt-6 text-center text-red-700"><p className="text-3xl font-bold">{stats.rejected}</p><p>Rejected</p></CardContent></Card>
        <Card className="bg-blue-50"><CardContent className="pt-6 text-center text-blue-700"><p className="text-3xl font-bold">{stats.totalDays}</p><p>Days Taken</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <div className="flex gap-3">
              <Input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} />
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Depts</SelectItem>
                  {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Dept</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeaves.map(leave => (
                <TableRow key={leave.id}>
                  <TableCell className="font-medium">{leave.employeeName}</TableCell>
                  <TableCell><Badge variant="secondary">{leave.department}</Badge></TableCell>
                  <TableCell>{new Date(leave.startDate).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(leave.endDate).toLocaleDateString()}</TableCell>
                  <TableCell className="text-center font-bold">{leave.totalDays}</TableCell>
                  <TableCell className="max-w-xs truncate">{leave.reason}</TableCell>
                  <TableCell>
                    <StatusBadge status={leave.status} tone={leave.status === 'Pending' ? 'amber' : undefined} />
                  </TableCell>
                  <TableCell>
                    {isAdmin() && leave.status === 'Pending' ? (
                      <div className="flex justify-center gap-2">
                        <Button size="sm" onClick={() => handleApprove(leave)} className="bg-emerald-600">
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleReject(leave)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : isAdmin() ? (
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDelete(leave.id!)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {leave.processedBy ? `By ${leave.processedBy}` : 'Pending'}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}