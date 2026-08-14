// src/modules/hr/Holiday.tsx
import { useEffect, useState } from 'react';
import { Plus, Calendar, Sun, Trash2, Edit2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { ref, onValue, set, remove } from 'firebase/database';
import { database } from '@/services/firebase';
import { getAllRecords } from '@/services/firebase';

interface Holiday {
  id: string;
  date: string;           // YYYY-MM-DD
  name: string;
  departments: string[];  // ['Staff', 'Worker', 'Other Workers'] or ['All']
  isRecurring?: boolean;  // e.g. every year on Diwali
}

const DEPARTMENTS = ['Staff', 'Worker', 'Other Workers', 'All'];

export default function Holiday() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [departmentFilter, setDepartmentFilter] = useState<string>('All');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    date: '',
    name: '',
    departments: ['All'] as string[],
  });

  // Fetch holidays for selected month
  useEffect(() => {
    const holidaysRef = ref(database, `hr/holidays/${selectedMonth}`);
    const unsub = onValue(holidaysRef, (snap) => {
      const data = snap.val();
      if (!data) {
        setHolidays([]);
        return;
      }
      const list = Object.entries(data).map(([id, val]: any) => ({
        id,
        ...val,
      }));
      setHolidays(list);
    });
    return () => unsub();
  }, [selectedMonth]);

  // Apply holidays to attendance when month changes
  useEffect(() => {
    applyHolidaysToAttendance();
  }, [selectedMonth, holidays]);

  const applyHolidaysToAttendance = async () => {
    const [year, month] = selectedMonth.split('-');
    const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();

    const employees = await getAllRecords('hr/employees');
    const activeEmployees = employees.filter((e: any) => e.status !== 'inactive');

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${month.padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dateObj = new Date(dateStr);
      const isSunday = dateObj.getDay() === 0;

      // Find holidays on this date
      const holidayOnDate = holidays.find(h => h.date === dateStr);

      for (const emp of activeEmployees) {
        const appliesToEmp =
          holidayOnDate &&
          (holidayOnDate.departments.includes('All') ||
            holidayOnDate.departments.includes(emp.department));

        if (isSunday || appliesToEmp) {
          const status = isSunday ? 'Holiday' : holidayOnDate.name;
          const notes = isSunday
            ? 'Auto: Sunday Holiday'
            : `Auto: ${holidayOnDate.name}`;

          await set(ref(database, `hr/attendance/${dateStr}/${emp.id}`), {
            employeeId: emp.id,
            employeeName: emp.name,
            date: dateStr,
            status: 'Holiday',
            checkIn: '',
            checkOut: '',
            workHrs: 0,
            otHrs: 0,
            pendingHrs: 0,
            totalHours: 0,
            notes,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }
    }

    if (holidays.length > 0 || isSunday) {
      toast({ title: 'Holidays Applied', description: 'Attendance updated for holidays & Sundays' });
    }
  };

  const handleSubmit = async () => {
    if (!form.date || !form.name || form.departments.length === 0) {
      toast({ title: 'Fill all fields', variant: 'destructive' });
      return;
    }

    const id = editingId || Date.now().toString();
    const path = `hr/holidays/${form.date.slice(0, 7)}/${id}`;

    await set(ref(database, path), {
      id,
      date: form.date,
      name: form.name,
      departments: form.departments,
      isRecurring: false,
    });

    toast({ title: editingId ? 'Holiday Updated' : 'Holiday Added' });
    resetForm();
  };

  const handleDelete = async (holiday: Holiday) => {
    if (!confirm(`Delete "${holiday.name}" on ${holiday.date}?`)) return;
    await remove(ref(database, `hr/holidays/${holiday.date.slice(0, 7)}/${holiday.id}`));
    toast({ title: 'Holiday Deleted' });
  };

  const startEdit = (h: Holiday) => {
    setForm({
      date: h.date,
      name: h.name,
      departments: h.departments,
    });
    setEditingId(h.id);
    setIsAdding(true);
  };

  const resetForm = () => {
    setForm({ date: '', name: '', departments: ['All'] });
    setIsAdding(false);
    setEditingId(null);
  };

  const filteredHolidays = holidays.filter(h =>
    departmentFilter === 'All' || h.departments.includes(departmentFilter)
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Calendar className="h-10 w-10 text-purple-600" />
          <div>
            <h1 className="text-3xl font-bold">Holidays Management</h1>
            <p className="text-muted-foreground">
              Manage company holidays • Sundays are auto-applied
            </p>
          </div>
        </div>
      </div>

      {/* Add/Edit Holiday Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {editingId ? 'Edit Holiday' : 'Add New Holiday'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isAdding || editingId ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div>
                <Label>Holiday Name</Label>
                <Input
                  placeholder="e.g. Diwali, Christmas"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Apply To</Label>
                <Select
                  value={form.departments[0]}
                  onValueChange={v =>
                    setForm({
                      ...form,
                      departments: v === 'All' ? ['All'] : [v],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 items-end">
                <Button onClick={handleSubmit}>
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
              <Plus className="h-4 w-4 mr-2" /> Add Holiday
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex gap-4 items-end">
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
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Departments</SelectItem>
                  {['Staff', 'Worker', 'Other Workers'].map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Holiday List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Sun className="h-6 w-6 text-yellow-600" />
            Holidays in {new Date(selectedMonth + '-01').toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric',
            })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Day</TableHead>
                <TableHead>Holiday Name</TableHead>
                <TableHead>Applied To</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHolidays.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No custom holidays defined for this month
                  </TableCell>
                </TableRow>
              ) : (
                filteredHolidays.map(holiday => {
                  const date = new Date(holiday.date);
                  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });

                  return (
                    <TableRow key={holiday.id}>
                      <TableCell className="font-medium">
                        {date.toLocaleDateString('en-IN')}
                      </TableCell>
                      <TableCell>{dayName}</TableCell>
                      <TableCell className="font-semibold">{holiday.name}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {holiday.departments.map(d => (
                            <span key={d} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              {d}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(holiday)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() => handleDelete(holiday)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
        <CardContent className="py-6">
          <div className="flex items-center gap-4">
            <Sun className="h-12 w-12 text-purple-600" />
            <div>
              <h3 className="font-bold text-purple-900">Sundays are Weekly Off</h3>
              <p className="text-sm text-purple-700">
                All Sundays are automatically marked as <strong>Holiday</strong> for every employee.
                <br />
                Custom holidays (Diwali, Christmas, etc.) can be added above.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}