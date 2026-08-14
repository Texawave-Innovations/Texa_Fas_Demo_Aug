// src/modules/hr/HolidayAllowance.tsx
import { useEffect, useState } from 'react';
import { Plus, Edit2, Save, X, Trash2, Calendar, IndianRupee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RowActions } from '@/components/ui/row-actions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { ref, onValue, set, remove } from 'firebase/database';
import { database } from '@/services/firebase';

interface HolidayAllowance {
  id: string;
  yearMonth: string; // "2025-12"
  department: string; // "Staff" | "Worker" | "Other Workers"
  dailyRate: number;  // Daily salary for holiday pay
  holidaysCount: number;
  totalAmount: number;
  createdAt: number;
  updatedAt: number;
}

const DEPARTMENTS = ['Staff', 'Worker', 'Other Workers'];

export default function HolidayAllowance() {
  const [allowances, setAllowances] = useState<HolidayAllowance[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    department: 'Staff',
    dailyRate: '',
    holidaysCount: '',
  });

  // Fetch allowances for selected month
  useEffect(() => {
    const path = `hr/holidayAllowances/${selectedMonth}`;
    const allowancesRef = ref(database, path);
    const unsub = onValue(allowancesRef, (snap) => {
      const data = snap.val() || {};
      const list = Object.entries(data).map(([id, val]: any) => ({
        id,
        ...val,
      }));
      setAllowances(list);
    });
    return () => unsub();
  }, [selectedMonth]);

  const handleSubmit = async () => {
    const dailyRate = parseFloat(form.dailyRate);
    const holidaysCount = parseInt(form.holidaysCount);

    if (!dailyRate || !holidaysCount || dailyRate <= 0 || holidaysCount <= 0) {
      toast({ title: 'Invalid input', variant: 'destructive' });
      return;
    }

    const totalAmount = dailyRate * holidaysCount;

    const id = editingId || Date.now().toString();
    const path = `hr/holidayAllowances/${selectedMonth}/${id}`;

    const payload = {
      id,
      yearMonth: selectedMonth,
      department: form.department,
      dailyRate,
      holidaysCount,
      totalAmount,
      createdAt: editingId ? allowances.find(a => a.id === editingId)?.createdAt : Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await set(ref(database, path), payload);
      toast({ title: editingId ? 'Updated' : 'Holiday Allowance Added' });
      resetForm();
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this holiday allowance?')) return;
    await remove(ref(database, `hr/holidayAllowances/${selectedMonth}/${id}`));
    toast({ title: 'Deleted' });
  };

  const startEdit = (a: HolidayAllowance) => {
    setForm({
      department: a.department,
      dailyRate: a.dailyRate.toString(),
      holidaysCount: a.holidaysCount.toString(),
    });
    setEditingId(a.id);
    setIsAdding(true);
  };

  const resetForm = () => {
    setForm({ department: 'Staff', dailyRate: '', holidaysCount: '' });
    setIsAdding(false);
    setEditingId(null);
  };

  const filtered = allowances.filter(a =>
    departmentFilter === 'all' || a.department === departmentFilter
  );

  const grandTotal = filtered.reduce((sum, a) => sum + a.totalAmount, 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <IndianRupee className="h-10 w-10 text-green-600" />
          <div>
            <h1 className="text-3xl font-bold">Holiday Allowance</h1>
            <p className="text-muted-foreground">
              Manage holiday pay for employees • Auto-reflected in salary
            </p>
          </div>
        </div>
      </div>

      {/* Add/Edit Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {editingId ? 'Edit Allowance' : 'Add Holiday Allowance'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isAdding || editingId ? (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <Label>Department</Label>
                <Select value={form.department} onValueChange={v => setForm({ ...form, department: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Daily Rate (₹)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 800"
                  value={form.dailyRate}
                  onChange={e => setForm({ ...form, dailyRate: e.target.value })}
                />
              </div>
              <div>
                <Label>No. of Holidays</Label>
                <Input
                  type="number"
                  placeholder="e.g. 3"
                  value={form.holidaysCount}
                  onChange={e => setForm({ ...form, holidaysCount: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 w-full">
                  <p className="text-sm text-green-700">Total Amount</p>
                  <p className="text-2xl font-bold text-green-800">
                    ₹{(parseFloat(form.dailyRate || '0') * parseInt(form.holidaysCount || '0')).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 items-end">
                <Button onClick={handleSubmit} className="bg-green-600 hover:bg-green-700">
                  <Save className="h-4 w-4 mr-2" />
                  {editingId ? 'Update' : 'Save'}
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setIsAdding(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Allowance
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div>
              <Label>Month & Year</Label>
              <Input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
              />
            </div>
            <div>
              <Label>Department</Label>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {DEPARTMENTS.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-r from-green-50 to-emerald-50">
          <CardContent className="pt-6">
            <p className="text-sm text-green-700">Total Holiday Allowance</p>
            <p className="text-4xl font-bold text-green-800">
              ₹{grandTotal.toLocaleString('en-IN')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold">{filtered.length}</p>
            <p className="text-sm text-muted-foreground">Department Entries</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold">{allowances.reduce((sum, a) => sum + a.holidaysCount, 0)}</p>
            <p className="text-sm text-muted-foreground">Total Holidays Paid</p>
          </CardContent>
        </Card>
      </div>

      {/* Allowance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Calendar className="h-6 w-6 text-green-600" />
            Holiday Allowance for {new Date(selectedMonth + '-01').toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric'
            })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead>Daily Rate</TableHead>
                <TableHead>Holidays</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    No holiday allowance defined for this month
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(a => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Badge variant="secondary" className="font-medium">
                        {a.department}
                      </Badge>
                    </TableCell>
                    <TableCell>₹{a.dailyRate.toLocaleString('en-IN')}</TableCell>
                    <TableCell>{a.holidaysCount} days</TableCell>
                    <TableCell className="font-bold text-green-700">
                      ₹{a.totalAmount.toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell>
                      <RowActions
                        actions={[
                          { label: 'Edit', icon: Edit2, onClick: () => startEdit(a) },
                          { label: 'Delete', icon: Trash2, onClick: () => handleDelete(a.id), className: 'text-red-600 hover:text-red-700' },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Info */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardContent className="py-6">
          <div className="flex items-center gap-4">
            <IndianRupee className="h-12 w-12 text-blue-600" />
            <div>
              <h3 className="font-bold text-blue-900">How it works</h3>
              <p className="text-sm text-blue-700">
                Holiday allowance is automatically added to employee salary for the month.
                <br />
                Example: Worker with ₹800 daily rate × 3 holidays = ₹2,400 added to salary
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}