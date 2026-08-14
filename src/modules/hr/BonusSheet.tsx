// src/modules/hr/BonusSheet.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, X, Calendar, IndianRupee, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { getAllRecords, updateRecord } from '@/services/firebase';
import { toast } from '@/hooks/use-toast';

interface Bonus {
  id?: string;
  employeeName: string;
  amount: number;
  bonusType: string;
  month: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedAt: number;
  processedAt?: number;
  processedBy?: string;
}

export default function BonusSheet() {
  const { employeeId, month } = useParams<{ employeeId: string; month: string }>();
  const navigate = useNavigate();
  const [employeeName, setEmployeeName] = useState('Loading...');
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [currentMonth, setCurrentMonth] = useState(month || new Date().toISOString().slice(0, 7));

  const currentUser = JSON.parse(localStorage.getItem('erp_user') || '{}');
  const isAdmin = currentUser.role === 'admin';

  useEffect(() => {
    // Fetch employee name
    getAllRecords('hr/employees').then((emps: any[]) => {
      const emp = emps.find(e => e.id === employeeId);
      if (emp) setEmployeeName(emp.name);
    });

    // Fetch all bonuses for this employee
    getAllRecords('hr/bonuses').then((data: any[]) => {
      const filtered = data
        .filter(b => b.employeeId === employeeId)
        .map(b => ({ ...b, id: b.id }))
        .sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));
      setBonuses(filtered);
    });
  }, [employeeId]);

  const filteredBonuses = bonuses.filter(b => b.month === currentMonth);

  const handleStatusChange = async (id: string, status: 'Approved' | 'Rejected') => {
    if (!isAdmin) return;

    try {
      await updateRecord('hr/bonuses', id, {
        status,
        processedAt: Date.now(),
        processedBy: currentUser.name,
      });
      setBonuses(prev => prev.map(b => b.id === id ? { ...b, status, processedAt: Date.now(), processedBy: currentUser.name } : b));
      toast({ title: `Bonus ${status.toLowerCase()} successfully!` });
    } catch {
      toast({ title: 'Failed to update', variant: 'destructive' });
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/hr/bonus')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Bonus History - {employeeName}</h1>
          <p className="text-muted-foreground">View all bonus requests and approval status</p>
        </div>
      </div>

      {/* Month Filter */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Calendar className="h-5 w-5 text-primary" />
            <Input
              type="month"
              value={currentMonth}
              onChange={e => setCurrentMonth(e.target.value)}
              className="w-64"
            />
          </div>
        </CardHeader>
      </Card>

      {/* Current Month Bonuses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IndianRupee className="h-6 w-6" />
            Bonus Requests for {new Date(currentMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bonus Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested On</TableHead>
                <TableHead>Processed By</TableHead>
                {isAdmin && <TableHead className="text-center">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBonuses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-12 text-muted-foreground">
                    No bonus requests for this month
                  </TableCell>
                </TableRow>
              ) : (
                filteredBonuses.map(b => (
                  <TableRow key={b.id} className={b.status === 'Approved' ? 'bg-emerald-50' : b.status === 'Rejected' ? 'bg-red-50' : ''}>
                    <TableCell className="font-medium">{b.bonusType}</TableCell>
                    <TableCell className="font-bold text-lg">₹{b.amount.toLocaleString()}</TableCell>
                    <TableCell>
                      <StatusBadge status={b.status} tone={b.status === 'Pending' ? 'amber' : undefined} />
                    </TableCell>
                    <TableCell>{new Date(b.requestedAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-sm">
                      {b.processedBy || '—'}
                    </TableCell>
                    {isAdmin && b.status === 'Pending' && (
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-3">
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => handleStatusChange(b.id!, 'Approved')}
                          >
                            <Check className="h-5 w-5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleStatusChange(b.id!, 'Rejected')}
                          >
                            <X className="h-5 w-5" /> Decline
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Full History */}
      {bonuses.length > filteredBonuses.length && (
        <Card>
          <CardHeader>
            <CardTitle>All Time Bonus History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Bonus Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Processed By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bonuses.map(b => (
                  <TableRow key={b.id}>
                    <TableCell>{new Date(b.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</TableCell>
                    <TableCell>{b.bonusType}</TableCell>
                    <TableCell className="font-bold">₹{b.amount.toLocaleString()}</TableCell>
                    <TableCell>
                      <StatusBadge status={b.status} tone={b.status === 'Pending' ? 'amber' : undefined} />
                    </TableCell>
                    <TableCell>{b.processedBy || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}