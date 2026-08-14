// src/modules/hr/loans/LoanBox.tsx
'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { createRecord, updateRecord } from '@/services/firebase';
import { toast } from '@/hooks/use-toast';

interface Employee {
  id: string;
  name: string;
  employeeId: string;
  salary: { grossMonthly: number };
  department: string;
}

type LoanStatus = 'Pending' | 'Approved' | 'Rejected' | 'Repaid';

interface SkipEmiRequest {
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedBy: string;
  requestedAt: number;
  approvedBy?: string;
  approvedAt?: number;
  reason?: string;
}

interface Loan {
  id?: string;
  amount: number;
  reason: string;
  date: string;
  status: LoanStatus;
  emiMonths?: number;
  emiAmount?: number;
  approvedBy?: string;
  createdBy?: string;
  disbursedDate?: string;
  createdAt?: number;
  skipEmiRequests?: {
    [yyyyMm: string]: SkipEmiRequest;
  };
}

interface Props {
  employee: Employee;
  loans: Loan[];
  isAdmin: boolean;
  currentUser: any;
  onLoanUpdate: () => void;
}

const getCurrentMonthKey = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
};

export default function LoanBox({
  employee,
  loans,
  isAdmin,
  currentUser,
  onLoanUpdate,
}: Props) {
  const [form, setForm] = useState<{
    amount: number;
    reason: string;
    emiMonths: number | string;
    date: string;
  }>({
    amount: 0,
    reason: '',
    emiMonths: 6,
    date: new Date().toISOString().split('T')[0],
  });

  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);

  const [skipMonth, setSkipMonth] = useState<string>(getCurrentMonthKey());
  const [skipReason, setSkipReason] = useState<string>('');

  const gross = employee.salary.grossMonthly;
  const approvedLoans = loans.filter((l) => l.status === 'Approved');

  const currentUserId = currentUser?.uid || currentUser?.id || 'unknown';
  const currentUserName = currentUser?.name || 'User';

  const totalEmiCurrentMonth = useMemo(() => {
    const monthKey = getCurrentMonthKey();
    return approvedLoans.reduce((sum, loan) => {
      const baseEmi = loan.emiAmount || 0;
      const req = loan.skipEmiRequests?.[monthKey];
      const shouldSkip =
        req && (req.status === 'Approved' || req.status === 'Pending');
      return sum + (shouldSkip ? 0 : baseEmi);
    }, 0);
  }, [approvedLoans]);

  const maxLoan = gross * 3;
  const newEMI =
    Number(form.emiMonths) > 0 ? Math.ceil(form.amount / Number(form.emiMonths)) : form.amount;

  const netAfterNewLoan = gross - totalEmiCurrentMonth - newEMI;

  const handleCreateOrUpdate = async () => {
    if (form.amount <= 0 || !form.reason.trim()) {
      toast({ title: 'Please fill amount and reason', variant: 'destructive' });
      return;
    }
    if (form.amount > maxLoan) {
      toast({
        title: `Max loan: ₹${maxLoan.toLocaleString()} (3× gross)`,
        variant: 'destructive',
      });
      return;
    }
    if (netAfterNewLoan < 0) {
      toast({
        title: 'Net salary cannot be negative!',
        variant: 'destructive',
      });
      return;
    }

    const payload: any = {
      employeeId: employee.id, // Firebase key
      employeeName: employee.name,
      amount: form.amount,
      reason: form.reason,
      date: form.date,
      emiMonths: Number(form.emiMonths) || 0,
      emiAmount: newEMI,
      status: 'Pending' as LoanStatus,
      createdBy: currentUserId,
      createdAt: Date.now(),
    };

    try {
      if (editingLoan && editingLoan.id) {
        await updateRecord('hr/loans', editingLoan.id, payload);
        toast({ title: 'Loan request updated!' });
        setEditingLoan(null);
      } else {
        await createRecord('hr/loans', payload);
        toast({ title: 'Loan request created!' });
      }
      setForm({
        amount: 0,
        reason: '',
        emiMonths: 6,
        date: new Date().toISOString().split('T')[0],
      });
      onLoanUpdate();
    } catch (err) {
      console.error(err);
      toast({ title: 'Operation failed', variant: 'destructive' });
    }
  };

  const handleStatus = async (loanId: string, status: 'Approved' | 'Rejected') => {
    if (!isAdmin) {
      toast({
        title: 'Only Admin can approve/reject loans',
        variant: 'destructive',
      });
      return;
    }

    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return;

    const updateData: any = {
      status,
      approvedBy: currentUserName,
      approvedAt: Date.now(),
    };

    if (status === 'Approved') {
      updateData.disbursedDate = new Date().toISOString().split('T')[0];
    } else if (status === 'Rejected' && loan.disbursedDate) {
      updateData.disbursedDate = null;
    }

    try {
      await updateRecord('hr/loans', loanId, updateData);
      onLoanUpdate();
      toast({ title: `Loan ${status.toLowerCase()} successfully!` });
    } catch (err) {
      console.error('Update failed:', err);
      toast({
        title: 'Failed to update loan status',
        variant: 'destructive',
      });
    }
  };

  const startEdit = (loan: Loan) => {
    if (loan.status !== 'Pending') {
      toast({
        title: 'Cannot edit approved/rejected loan',
        variant: 'destructive',
      });
      return;
    }
    if (!isAdmin && loan.createdBy !== currentUserId) {
      toast({
        title: 'You can only edit your own requests',
        variant: 'destructive',
      });
      return;
    }

    setEditingLoan(loan);
    setForm({
      amount: loan.amount,
      reason: loan.reason,
      emiMonths: loan.emiMonths || 6,
      date: loan.date,
    });
  };

  const cancelEdit = () => {
    setEditingLoan(null);
    setForm({
      amount: 0,
      reason: '',
      emiMonths: 6,
      date: new Date().toISOString().split('T')[0],
    });
  };

  // Skip EMI logic
  const handleRequestSkipEmi = async (loan: Loan) => {
    if (!skipMonth) {
      toast({ title: 'Select a month first', variant: 'destructive' });
      return;
    }
    if (!skipReason.trim()) {
      toast({ title: 'Enter reason for skip request', variant: 'destructive' });
      return;
    }
    if (loan.status !== 'Approved') {
      toast({
        title: 'Skip EMI allowed only for approved loans',
        variant: 'destructive',
      });
      return;
    }

    const existing = loan.skipEmiRequests?.[skipMonth];
    if (existing && existing.status === 'Approved') {
      toast({
        title: 'This month EMI already skipped for this loan',
        variant: 'destructive',
      });
      return;
    }

    const updateData: any = {
      skipEmiRequests: {
        ...(loan.skipEmiRequests || {}),
        [skipMonth]: {
          status: 'Pending',
          requestedBy: currentUserId,
          requestedAt: Date.now(),
          reason: skipReason.trim(),
        } as SkipEmiRequest,
      },
    };

    try {
      await updateRecord('hr/loans', loan.id!, updateData);
      toast({ title: `Skip EMI requested for ${skipMonth}` });
      setSkipReason('');
      onLoanUpdate();
    } catch (err) {
      console.error(err);
      toast({
        title: 'Failed to request skip EMI',
        variant: 'destructive',
      });
    }
  };

  const handleApproveSkipEmi = async (
    loan: Loan,
    monthKey: string,
    status: 'Approved' | 'Rejected'
  ) => {
    if (!isAdmin) {
      toast({
        title: 'Only Admin can approve/reject skip EMI',
        variant: 'destructive',
      });
      return;
    }

    const orig = loan.skipEmiRequests || {};
    const req = orig[monthKey];
    if (!req) return;

    const updatedReq: SkipEmiRequest = {
      ...req,
      status,
      approvedBy: currentUserName,
      approvedAt: Date.now(),
    };

    const updateData: any = {
      skipEmiRequests: {
        ...orig,
        [monthKey]: updatedReq,
      },
    };

    try {
      await updateRecord('hr/loans', loan.id!, updateData);
      toast({
        title: `Skip EMI ${status.toLowerCase()} for ${monthKey}`,
      });
      onLoanUpdate();
    } catch (err) {
      console.error(err);
      toast({
        title: 'Failed to update skip EMI',
        variant: 'destructive',
      });
    }
  };

  const sortedLoans = [...loans].sort((a, b) => {
    const ad = new Date(a.date).getTime();
    const bd = new Date(b.date).getTime();
    return bd - ad;
  });

  return (
    <div className="space-y-6 py-4">
      {/* Salary Impact Summary for current month */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            Salary Impact (Current Month)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>Gross Salary</div>
            <div className="font-bold text-right">
              ₹{gross.toLocaleString()}
            </div>
            <div>Current EMI Deduction (after skips)</div>
            <div className="font-bold text-right text-red-600">
              {totalEmiCurrentMonth > 0
                ? `-₹${totalEmiCurrentMonth.toLocaleString()}`
                : '₹0'}
            </div>
            <div>Net Salary (Current Month)</div>
            <div className="font-bold text-right text-green-600">
              ₹{(gross - totalEmiCurrentMonth).toLocaleString()}
            </div>
            <div>Max Loan Allowed (3× Gross)</div>
            <div className="font-bold text-right">
              ₹{maxLoan.toLocaleString()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create / Edit Form */}
      <Card
        className={`border-2 ${
          editingLoan
            ? 'border-blue-400 bg-blue-50'
            : 'border-orange-300 bg-orange-50'
        }`}
      >
        <CardHeader>
          <CardTitle className="text-lg">
            {editingLoan ? 'Edit Loan Request' : 'Request New Loan'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Loan Amount (₹)</Label>
              <Input
                type="number"
                value={form.amount || ''}
                onChange={(e) =>
                  setForm({ ...form, amount: Number(e.target.value) })
                }
                placeholder="25000"
              />
            </div>
            <div>
              <Label>EMI Months (0 = full deduction)</Label>
              <Input
                type="number"
                min="0"
                value={form.emiMonths ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    emiMonths: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>

          <div>
            <Label>Reason for Loan</Label>
            <Input
              value={form.reason}
              onChange={(e) =>
                setForm({ ...form, reason: e.target.value })
              }
              placeholder="Medical, Education, Personal..."
            />
          </div>

          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) =>
                setForm({ ...form, date: e.target.value })
              }
            />
          </div>

          {form.amount > 0 && (
            <Alert
              className={
                netAfterNewLoan < 0
                  ? 'border-red-500 bg-red-50'
                  : 'border-green-500 bg-green-50'
              }
            >
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Projected Net Salary (Current Month)</AlertTitle>
              <AlertDescription>
                <strong className="text-lg">
                  ₹{netAfterNewLoan.toLocaleString()}
                </strong>
                {Number(form.emiMonths) > 0 && (
                  <span className="block mt-1 text-sm">
                    EMI: ₹{newEMI.toLocaleString()} × {Number(form.emiMonths)} months
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button onClick={handleCreateOrUpdate} className="flex-1" size="lg">
              {editingLoan ? 'Update Request' : 'Create Request'}
            </Button>
            {editingLoan && (
              <Button variant="outline" onClick={cancelEdit}>
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Skip EMI section */}
      <Card className="border-2 border-purple-300 bg-purple-50">
        <CardHeader>
          <CardTitle className="text-lg">
            Skip EMI for a Month
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            If salary is tight for a month, request HR to skip EMI for that month for a specific loan.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <Label>Month (YYYY-MM)</Label>
              <Input
                type="month"
                value={skipMonth}
                onChange={(e) => setSkipMonth(e.target.value)}
              />
            </div>
            <div>
              <Label>Reason</Label>
              <Input
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                placeholder="Medical emergency, personal reasons..."
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Choose a loan below and click "Request Skip EMI" to raise request for that loan and month.
          </p>
        </CardContent>
      </Card>

      {/* Loan History with Skip EMI management */}
      <div>
        <h3 className="text-lg font-bold mb-4">
          Loan History ({sortedLoans.length})
        </h3>

        {sortedLoans.length === 0 ? (
          <Card>
            <CardContent className="text-center py-10 text-muted-foreground">
              No loan requests yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sortedLoans.map((loan) => {
              const canEdit =
                loan.status === 'Pending' &&
                (isAdmin || loan.createdBy === currentUserId);

              const currentMonthKey = getCurrentMonthKey();
              const currentMonthSkip = loan.skipEmiRequests?.[currentMonthKey];

              return (
                <Card
                  key={loan.id}
                  className={
                    loan.status === 'Pending'
                      ? 'border-orange-400 bg-orange-50'
                      : loan.status === 'Approved'
                      ? 'border-green-400 bg-green-50'
                      : 'border-gray-300'
                  }
                >
                  <CardContent className="pt-5 space-y-2">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <p className="font-bold text-lg">
                          ₹{loan.amount.toLocaleString()}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {loan.reason}
                        </p>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                          <span>
                            {new Date(loan.date).toLocaleDateString('en-IN')}
                          </span>
                          {loan.emiMonths && loan.emiMonths > 0 && (
                            <span>
                              EMI: ₹{loan.emiAmount?.toLocaleString()} ×{' '}
                              {loan.emiMonths}m
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <StatusBadge status={loan.status} />

                        {canEdit && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEdit(loan)}
                          >
                            Edit
                          </Button>
                        )}

                        {isAdmin && loan.status === 'Pending' && (
                          <div className="flex gap-2 mt-2">
                            <Button
                              size="sm"
                              onClick={() =>
                                handleStatus(loan.id!, 'Approved')
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleStatus(loan.id!, 'Rejected')
                              }
                            >
                              Reject
                            </Button>
                          </div>
                        )}

                        {loan.approvedBy && (
                          <span className="text-xs text-muted-foreground mt-1">
                            {loan.approvedBy}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Skip EMI actions for this loan */}
                    <div className="border-t pt-2 mt-2 text-xs space-y-1">
                      <div className="flex justify-between items-center gap-2">
                        <span className="font-semibold">
                          Skip EMI Requests
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRequestSkipEmi(loan)}
                          disabled={!skipMonth || !skipReason.trim()}
                        >
                          Request Skip EMI ({skipMonth})
                        </Button>
                      </div>

                      {/* Show current month skip status */}
                      {currentMonthSkip && (
                        <div className="flex justify-between items-center text-xs">
                          <span>
                            Current month ({currentMonthKey}) status:{' '}
                            <strong>{currentMonthSkip.status}</strong>
                          </span>
                          {isAdmin && currentMonthSkip.status === 'Pending' && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() =>
                                  handleApproveSkipEmi(
                                    loan,
                                    currentMonthKey,
                                    'Approved'
                                  )
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleApproveSkipEmi(
                                    loan,
                                    currentMonthKey,
                                    'Rejected'
                                  )
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* List all months' skip requests */}
                      {loan.skipEmiRequests && (
                        <div className="space-y-1 mt-1">
                          {Object.entries(loan.skipEmiRequests)
                            .sort(([a], [b]) => (a > b ? -1 : 1))
                            .map(([month, req]) => (
                              <div
                                key={month}
                                className="flex justify-between items-center"
                              >
                                <span>
                                  {month} – {req.status}{' '}
                                  {req.reason ? `(${req.reason})` : ''}
                                </span>
                                {isAdmin && req.status === 'Pending' && (
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        handleApproveSkipEmi(
                                          loan,
                                          month,
                                          'Approved'
                                        )
                                      }
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        handleApproveSkipEmi(
                                          loan,
                                          month,
                                          'Rejected'
                                        )
                                      }
                                    >
                                      Reject
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
