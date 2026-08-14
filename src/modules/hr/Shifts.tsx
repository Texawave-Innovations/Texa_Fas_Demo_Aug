'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { createRecord, updateRecord, deleteRecord, getAllRecords } from '@/services/firebase';
import { useMasterData } from '@/context/MasterDataContext';

// Types
interface Shift {
  
  id: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  assignedEmployees: string[];
}

interface Employee {
  id: string;
  name: string;
  employeeId: string;
}

export default function ShiftManagement() {
  const { masterData } = useMasterData();

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);

  const [formData, setFormData] = useState({
    shiftName: '',
    startTime: '',
    endTime: '',
    assignedEmployees: [] as string[],
  });


  // Fetch data
  useEffect(() => {
    fetchShifts();
    fetchEmployees();
  }, []);

  const fetchShifts = async () => {
    try {
      const data = await getAllRecords('hr/shifts');
      // Ensure assignedEmployees is always an array
      const safeShifts = (data || []).map((shift: any) => ({
        ...shift,
        assignedEmployees: shift.assignedEmployees || [],
      }));
      setShifts(safeShifts);
    } catch (error) {
      toast({ title: 'Failed to load shifts', variant: 'destructive' });
    }
  };

  const fetchEmployees = async () => {
    try {
      const data = await getAllRecords('hr/employees');
      setEmployees((data || []) as Employee[]);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.shiftName || !formData.startTime || !formData.endTime) {
      toast({ title: 'Please fill all required fields', variant: 'destructive' });
      return;
    }

    try {
      if (isEditing && currentShift) {
        await updateRecord('hr/shifts', currentShift.id, formData);
        toast({ title: 'Shift updated successfully' });
      } else {
        await createRecord('hr/shifts', formData);
        toast({ title: 'Shift created successfully' });
      }

      resetForm();
      setIsDialogOpen(false);
      fetchShifts();
    } catch (error) {
      toast({ title: 'Operation failed', variant: 'destructive' });
    }
  };

const handleEdit = (shift: Shift) => {
  setCurrentShift(shift);

  setFormData({
    shiftName: shift.shiftName || '',
    startTime: shift.startTime || '',
    endTime: shift.endTime || '',
    assignedEmployees: shift.assignedEmployees || [],
  });

  setIsEditing(true);
  setIsDialogOpen(true);
};


  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this shift?')) return;

    try {
      await deleteRecord('hr/shifts', id);
      toast({ title: 'Shift deleted successfully' });
      fetchShifts();
    } catch (error) {
      toast({ title: 'Failed to delete shift', variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setFormData({
      shiftName: '',
      startTime: '',
      endTime: '',
      assignedEmployees: [],
    });
    setIsEditing(false);
    setCurrentShift(null);
  };

  const getEmployeeName = (empId: string) => {
    const emp = employees.find((e) => e.id === empId);
    return emp ? emp.name : 'Unknown';
  };

  // Safe access to master shifts
  const availableShifts = masterData?.hr?.shifts || [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Shift Management</h1>
          <p className="text-muted-foreground mt-1">Manage work shifts and assignments</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Shift
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Shift' : 'Create New Shift'}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label>Shift Name *</Label>
                <Select
                  value={formData.shiftName}
                  onValueChange={(value) => setFormData({ ...formData, shiftName: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a shift" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableShifts.length === 0 ? (
                      <SelectItem value="disabled" disabled>
                        No shifts defined in master data
                      </SelectItem>
                    ) : (
                      availableShifts.map((shift) => (
                        <SelectItem key={shift} value={shift}>
                          {shift}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time *</Label>
                  <Input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Time *</Label>
                  <Input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                Employee assignment can be done later from employee profile or attendance module.
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {isEditing ? 'Update Shift' : 'Create Shift'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Shifts Table */}
<Card>
  <CardHeader>
    <h3 className="text-lg font-semibold">All Shifts</h3>
  </CardHeader>

  <CardContent>
    {shifts.length === 0 ? (
      <div className="text-center py-12 text-muted-foreground">
        No shifts created yet. Click "Create Shift" to add one.
      </div>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Shift Name</TableHead>
            <TableHead>Timing</TableHead>
            <TableHead>Assigned Employees</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {shifts.map((shift) => {
            const empCount = (shift.assignedEmployees || []).length;

            return (
              <TableRow key={shift.id}>
                <TableCell className="font-medium">{shift.shiftName}</TableCell>

                <TableCell>
                  {shift.startTime} – {shift.endTime}
                </TableCell>

                <TableCell>
                  {empCount === 0 ? (
                    <span className="text-muted-foreground">No one assigned</span>
                  ) : (
                    <span>
                      {empCount} employee{empCount > 1 ? 's' : ''}
                    </span>
                  )}
                </TableCell>

                <TableCell>
                  <div className="flex justify-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(shift)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(shift.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    )}
  </CardContent>
</Card>

    </div>
  );
}
