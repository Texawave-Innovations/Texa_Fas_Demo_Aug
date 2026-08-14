// src/modules/hr/loans/Loans.tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  Search,
  Eye,
  AlertCircle,
  ShieldAlert,
  CheckCircle,
  XCircle,
  Lock,
  Unlock,
  X,
  History,
  IndianRupee,
  Clock,
  CheckSquare,
  XSquare,
  Circle,
  TrendingDown,
  Calendar,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { getAllRecords, createRecord, updateRecord } from '@/services/firebase';
import { database } from '@/services/firebase';
import { ref, onValue, update } from 'firebase/database';

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  department: string;
  salary: {
    grossMonthly: number;
    basic: number;
    [key: string]: any;
  };
  joiningDate: string;
  status?: string;
  [key: string]: any;
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

interface MaxLoanOverride {
  requestedAmount: number;
  requestedBy: string;
  requestedAt: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  approvedBy?: string;
  approvedAt?: number;
  reason?: string;
  employeeGross: number;
  standardMax: number;
}

interface EmiPayment {
  month: string;
  amount: number;
  paidAt: number;
  payrollCredited: boolean;
  remainingBalance: number;
  deductedFrom: string;
}

interface Loan {
  id?: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  approvedAmount?: number;
  reason: string;
  date: string;
  emiMonths?: number;
  emiAmount?: number;
  status: LoanStatus;
  disbursedDate?: string;
  notes?: string;
  approvedBy?: string;
  approvedAt?: number;
  createdBy?: string;
  createdAt?: number;
  skipEmiRequests?: {
    [yyyyMm: string]: SkipEmiRequest;
  };
  maxLoanOverride?: MaxLoanOverride;
  remainingBalance?: number;
  emiPayments?: {
    [yyyyMm: string]: EmiPayment;
  };
  [key: string]: any;
}

interface AttendanceRecord {
  employeeId: string;
  status: string;
  workHrs?: number;
  otHrs?: number;
  date: string;
}

const useCurrentUser = () => {
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    const u = localStorage.getItem('erp_user');
    if (u) setUser(JSON.parse(u));
  }, []);
  return user;
};

const getCurrentMonthKey = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
};

const getLastMonthKey = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

// Check if employee is active (case-insensitive)
const isEmployeeActive = (employee: Employee): boolean => {
  if (!employee.status) return false;
  return employee.status.toLowerCase() === 'active';
};

// Calculate remaining loan balance based on EMI payments
const calculateRemainingBalance = (loan: Loan): number => {
  if (!loan.approvedAmount) return loan.amount;
  
  const totalApproved = loan.approvedAmount;
  let totalPaid = 0;

  if (loan.emiPayments) {
    Object.values(loan.emiPayments).forEach((payment) => {
      if (payment.payrollCredited) {
        totalPaid += payment.amount;
      }
    });
  }

  return Math.max(0, totalApproved - totalPaid);
};

// ============= HISTORY TAB COMPONENT =============
interface HistoryTabProps {
  loans: Loan[];
  isAdmin: boolean;
  currentUser: any;
}

function HistoryTab({ loans, isAdmin, currentUser }: HistoryTabProps) {
  const currentUserId = currentUser?.uid || currentUser?.id || currentUser?.username || 'unknown';

  const userLoans = isAdmin 
    ? loans 
    : loans.filter(l => l.createdBy === currentUserId);

  const totalLoans = userLoans.length;
  const approvedLoans = userLoans.filter(l => l.status === 'Approved' || l.status === 'Repaid').length;
  const rejectedLoans = userLoans.filter(l => l.status === 'Rejected').length;
  const pendingLoans = userLoans.filter(l => l.status === 'Pending').length;
  const repaidLoans = userLoans.filter(l => l.status === 'Repaid').length;
  
  const totalApprovedAmount = userLoans
    .filter(l => l.status === 'Approved' || l.status === 'Repaid')
    .reduce((sum, l) => sum + (l.approvedAmount || l.amount), 0);
  
  const totalOutstanding = userLoans
    .filter(l => l.status === 'Approved')
    .reduce((sum, l) => sum + calculateRemainingBalance(l), 0);

  const sortedLoans = [...userLoans].sort((a, b) => {
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  return (
    <div className="space-y-6 py-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">Total Loans</p>
                <p className="text-3xl font-bold text-blue-900">{totalLoans}</p>
              </div>
              <IndianRupee className="h-12 w-12 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 font-medium">Approved</p>
                <p className="text-3xl font-bold text-green-900">{approvedLoans}</p>
                <p className="text-xs text-green-600 mt-1">
                  {formatCurrency(totalApprovedAmount)}
                </p>
              </div>
              <CheckCircle className="h-12 w-12 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-300">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600 font-medium">Pending</p>
                <p className="text-3xl font-bold text-orange-900">{pendingLoans}</p>
              </div>
              <Clock className="h-12 w-12 text-orange-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600 font-medium">Outstanding</p>
                <p className="text-2xl font-bold text-purple-900">{formatCurrency(totalOutstanding)}</p>
                <p className="text-xs text-purple-600 mt-1">Repaid: {repaidLoans}</p>
              </div>
              <TrendingDown className="h-12 w-12 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Loan History & EMI Payments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedLoans.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No loans found</div>
          ) : (
            <div className="space-y-4">
              {sortedLoans.map((loan) => {
                const finalAmount = loan.approvedAmount || loan.amount;
                const remaining = calculateRemainingBalance(loan);
                const paid = finalAmount - remaining;
                const progress = finalAmount > 0 ? (paid / finalAmount) * 100 : 0;

                return (
                  <Card key={loan.id} className="border-2">
                    <CardContent className="pt-4">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-lg">{loan.employeeName}</h3>
                            <StatusBadge status={loan.status} />
                          </div>
                          <p className="text-sm text-muted-foreground">{loan.reason}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Date: {loan.date} | EMI: {loan.emiMonths} months
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-blue-600">
                            {formatCurrency(finalAmount)}
                          </div>
                          {(loan.status === 'Approved' || loan.status === 'Repaid') && (
                            <div className="text-sm mt-1">
                              <div className="text-green-600">Paid: {formatCurrency(paid)}</div>
                              <div className="text-red-600">Remaining: {formatCurrency(remaining)}</div>
                            </div>
                          )}
                        </div>
                      </div>

                      {(loan.status === 'Approved' || loan.status === 'Repaid') && (
                        <>
                          <div className="mb-4">
                            <div className="flex justify-between text-xs mb-1">
                              <span>Repayment Progress</span>
                              <span>{progress.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-green-500 h-2 rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>

                          {loan.emiPayments && Object.keys(loan.emiPayments).length > 0 && (
                            <div className="mt-4 border-t pt-4">
                              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                EMI Payment History (Credited & Deducted)
                              </h4>
                              <div className="space-y-2 max-h-48 overflow-y-auto">
                                {Object.entries(loan.emiPayments)
                                  .sort(([a], [b]) => b.localeCompare(a))
                                  .map(([month, payment]) => (
                                    <div
                                      key={month}
                                      className="flex justify-between items-center p-2 bg-green-50 rounded-lg text-sm"
                                    >
                                      <div className="flex items-center gap-2">
                                        <TrendingDown className="h-4 w-4 text-red-500" />
                                        <div>
                                          <div className="font-medium">{month}</div>
                                          <div className="text-xs text-muted-foreground">
                                            {new Date(payment.paidAt).toLocaleString('en-IN')}
                                          </div>
                                          <div className="text-xs text-green-600 font-semibold">
                                            ✓ Credited & Deducted
                                          </div>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <div className="font-semibold text-red-600">
                                          -{formatCurrency(payment.amount)}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          Balance: {formatCurrency(payment.remainingBalance)}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============= LOAN BOX COMPONENT (Keeping original implementation) =============
interface LoanBoxProps {
  employee: Employee;
  loans: Loan[];
  isAdmin: boolean;
  currentUser: any;
  onLoanUpdate: () => void;
}

function LoanBox({ employee, loans, isAdmin, currentUser, onLoanUpdate }: LoanBoxProps) {
  const [activeTab, setActiveTab] = useState<'manage' | 'history'>('manage');
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
  const [overrideReason, setOverrideReason] = useState<string>('');

  const gross = employee.salary.grossMonthly;
  const approvedLoans = loans.filter((l) => l.status === 'Approved');

  const currentUserId = currentUser?.uid || currentUser?.id || currentUser?.username || 'unknown';
  const currentUserName = currentUser?.name || 'User';

  const totalEmiCurrentMonth = useMemo(() => {
    const monthKey = getCurrentMonthKey();
    return approvedLoans.reduce((sum, loan) => {
      const remaining = calculateRemainingBalance(loan);
      if (remaining <= 0) return sum;
      
      const emiAmount = loan.emiAmount || 0;
      const req = loan.skipEmiRequests?.[monthKey];
      const shouldSkip = req && req.status === 'Approved';
      const alreadyPaid = loan.emiPayments?.[monthKey]?.payrollCredited;
      
      return sum + (shouldSkip || alreadyPaid ? 0 : emiAmount);
    }, 0);
  }, [approvedLoans]);

  const standardMaxLoan = gross * 3;
  const hasApprovedOverride = editingLoan?.maxLoanOverride?.status === 'Approved';
  const approvedMaxLoan = hasApprovedOverride
    ? editingLoan?.maxLoanOverride?.requestedAmount || standardMaxLoan
    : standardMaxLoan;

  const maxLoan = approvedMaxLoan;
  const newEMI = Number(form.emiMonths) > 0 ? Math.ceil(form.amount / Number(form.emiMonths)) : form.amount;
  const netAfterNewLoan = gross - totalEmiCurrentMonth - newEMI;

  const exceedsStandardLimit = form.amount > standardMaxLoan;
  const exceedsApprovedLimit = form.amount > approvedMaxLoan;

  const handleCreateOrUpdateLoan = async () => {
    if (form.amount <= 0 || !form.reason.trim()) {
      toast({ title: 'Please enter amount and reason', variant: 'destructive' });
      return;
    }

    if (netAfterNewLoan < 0) {
      toast({ title: 'Net salary cannot be negative', variant: 'destructive' });
      return;
    }

    if (!isAdmin && exceedsStandardLimit && !hasApprovedOverride) {
      if (!overrideReason.trim()) {
        toast({
          title: 'Reason required',
          description: 'Please explain why you need more than standard limit',
          variant: 'destructive',
        });
        return;
      }
    }

    if (isAdmin && exceedsApprovedLimit) {
      toast({
        title: `Maximum allowed: ${formatCurrency(approvedMaxLoan)}`,
        variant: 'destructive',
      });
      return;
    }

    const payload: any = {
      employeeId: employee.id,
      employeeName: employee.name,
      amount: form.amount,
      reason: form.reason,
      date: form.date,
      emiMonths: Number(form.emiMonths) || 0,
      emiAmount: newEMI,
      status: 'Pending' as LoanStatus,
      createdBy: currentUserId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (!isAdmin && exceedsStandardLimit && !hasApprovedOverride) {
      payload.maxLoanOverride = {
        requestedAmount: form.amount,
        requestedBy: currentUserId,
        requestedAt: Date.now(),
        status: 'Pending',
        reason: overrideReason.trim(),
        employeeGross: gross,
        standardMax: standardMaxLoan,
      } as MaxLoanOverride;
    }

    if (editingLoan?.maxLoanOverride && !exceedsStandardLimit) {
      payload.maxLoanOverride = editingLoan.maxLoanOverride;
    }

    try {
      if (editingLoan && editingLoan.id) {
        await updateRecord('hr/loans', editingLoan.id, payload);
        toast({ title: '✅ Loan updated successfully' });
        setEditingLoan(null);
      } else {
        await createRecord('hr/loans', payload);
        toast({ title: '✅ Loan request submitted' });
      }
      setForm({
        amount: 0,
        reason: '',
        emiMonths: 6,
        date: new Date().toISOString().split('T')[0],
      });
      setOverrideReason('');
      onLoanUpdate();
    } catch (err) {
      console.error(err);
      toast({ title: '❌ Failed to save', variant: 'destructive' });
    }
  };

  const handleApproveOverride = async (loanId: string, status: 'Approved' | 'Rejected') => {
    if (!isAdmin) {
      toast({ title: 'Only Admin can approve', variant: 'destructive' });
      return;
    }

    const loan = loans.find((l) => l.id === loanId);
    if (!loan || !loan.maxLoanOverride) return;

    const updatedOverride: MaxLoanOverride = {
      ...loan.maxLoanOverride,
      status,
      approvedBy: currentUserName,
      approvedAt: Date.now(),
    };

    try {
      await updateRecord('hr/loans', loanId, { 
        maxLoanOverride: updatedOverride,
        updatedAt: Date.now(),
      });
      toast({ title: status === 'Approved' ? '✅ Override approved' : '❌ Override rejected' });
      onLoanUpdate();
    } catch (err) {
      console.error(err);
      toast({ title: 'Failed to update', variant: 'destructive' });
    }
  };

  const handleStatus = async (loanId: string, status: 'Approved' | 'Rejected') => {
    if (!isAdmin) {
      toast({ title: 'Only Admin can approve', variant: 'destructive' });
      return;
    }

    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return;

    const hasOverride = !!loan.maxLoanOverride;
    const overrideApproved = loan.maxLoanOverride?.status === 'Approved';
    const standardMax = loan.maxLoanOverride?.standardMax || (gross * 3);
    
    const finalAmount = overrideApproved ? loan.amount : Math.min(loan.amount, standardMax);
    const finalEmi = loan.emiMonths && loan.emiMonths > 0 
      ? Math.ceil(finalAmount / loan.emiMonths) 
      : finalAmount;

    const updateData: any = {
      status,
      approvedBy: currentUserName,
      approvedAt: Date.now(),
      updatedAt: Date.now(),
      approvedAmount: status === 'Approved' ? finalAmount : undefined,
      emiAmount: status === 'Approved' ? finalEmi : loan.emiAmount,
      remainingBalance: status === 'Approved' ? finalAmount : undefined,
    };

    if (status === 'Approved') {
      updateData.disbursedDate = new Date().toISOString().split('T')[0];
      
      if (!overrideApproved && loan.amount > standardMax) {
        toast({
          title: '✅ Loan approved with standard limit',
          description: `Approved: ${formatCurrency(finalAmount)} (Capped at 3× gross salary)`,
        });
      } else {
        toast({ title: '✅ Loan approved' });
      }
    } else {
      toast({ title: '❌ Loan rejected' });
    }

    try {
      await updateRecord('hr/loans', loanId, updateData);
      onLoanUpdate();
    } catch (err) {
      console.error('Update failed:', err);
      toast({ title: 'Failed to update', variant: 'destructive' });
    }
  };

  const startEdit = (loan: Loan) => {
    if (loan.status !== 'Pending') {
      toast({ title: 'Cannot edit approved/rejected loan', variant: 'destructive' });
      return;
    }
    if (!isAdmin && loan.createdBy !== currentUserId) {
      toast({ title: 'You can only edit your own', variant: 'destructive' });
      return;
    }

    setEditingLoan(loan);
    setForm({
      amount: loan.amount,
      reason: loan.reason,
      emiMonths: loan.emiMonths || 6,
      date: loan.date,
    });
    if (loan.maxLoanOverride) {
      setOverrideReason(loan.maxLoanOverride.reason || '');
    }
    setActiveTab('manage');
  };

  const cancelEdit = () => {
    setEditingLoan(null);
    setForm({
      amount: 0,
      reason: '',
      emiMonths: 6,
      date: new Date().toISOString().split('T')[0],
    });
    setOverrideReason('');
  };

  const handleRequestSkipEmi = async (loan: Loan) => {
    if (!skipMonth || !skipReason.trim()) {
      toast({ title: 'Enter month and reason', variant: 'destructive' });
      return;
    }
    if (loan.status !== 'Approved') {
      toast({ title: 'Only for approved loans', variant: 'destructive' });
      return;
    }

    const existing = loan.skipEmiRequests?.[skipMonth];
    if (existing?.status === 'Approved') {
      toast({ title: 'Already skipped', variant: 'destructive' });
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
      updatedAt: Date.now(),
    };

    try {
      await updateRecord('hr/loans', loan.id!, updateData);
      toast({ title: `✅ Skip requested for ${skipMonth}` });
      setSkipReason('');
      onLoanUpdate();
    } catch (err) {
      toast({ title: 'Failed', variant: 'destructive' });
    }
  };

  const handleApproveSkipEmi = async (
    loan: Loan,
    monthKey: string,
    status: 'Approved' | 'Rejected'
  ) => {
    if (!isAdmin) {
      toast({ title: 'Only Admin can approve', variant: 'destructive' });
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

    try {
      await updateRecord('hr/loans', loan.id!, {
        skipEmiRequests: { ...orig, [monthKey]: updatedReq },
        updatedAt: Date.now(),
      });
      toast({ title: `Skip ${status.toLowerCase()}` });
      onLoanUpdate();
    } catch (err) {
      toast({ title: 'Failed', variant: 'destructive' });
    }
  };

  const sortedLoans = [...loans].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const pendingOverrides = sortedLoans.filter((l) => l.maxLoanOverride?.status === 'Pending');

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
      <TabsList className="grid grid-cols-2 w-full">
        <TabsTrigger value="manage">Manage Loans</TabsTrigger>
        <TabsTrigger value="history">History & Payments</TabsTrigger>
      </TabsList>

      <TabsContent value="manage" className="space-y-6 py-4">
        {isAdmin && pendingOverrides.length > 0 && (
          <Alert className="border-2 border-red-500 bg-red-50">
            <ShieldAlert className="h-5 w-5 text-red-600" />
            <AlertTitle className="text-red-900 font-bold">
              {pendingOverrides.length} Override Request Pending
            </AlertTitle>
            <AlertDescription className="text-red-800">
              Review and approve/reject override requests below
            </AlertDescription>
          </Alert>
        )}

        <Card className="border-2 bg-gradient-to-br from-blue-50 to-blue-100">
          <CardHeader>
            <CardTitle>Salary Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>Gross Salary</div>
              <div className="font-bold text-right text-blue-600">{formatCurrency(gross)}</div>
              <div>Current EMI</div>
              <div className="font-bold text-right text-red-600">
                {totalEmiCurrentMonth > 0 ? `-${formatCurrency(totalEmiCurrentMonth)}` : formatCurrency(0)}
              </div>
              <div>Net Salary</div>
              <div className="font-bold text-right text-green-600">
                {formatCurrency(gross - totalEmiCurrentMonth)}
              </div>
              <div className="flex items-center gap-2">
                Max Loan (3× Gross)
                {hasApprovedOverride && (
                  <Badge variant="secondary" className="text-xs">
                    <Unlock className="w-3 h-3 mr-1" />Override
                  </Badge>
                )}
              </div>
              <div className="font-bold text-right text-purple-600">{formatCurrency(maxLoan)}</div>
            </div>
          </CardContent>
        </Card>

        <Card className={`border-2 ${editingLoan ? 'border-blue-500 bg-blue-50' : 'border-orange-400 bg-orange-50'}`}>
          <CardHeader>
            <CardTitle>{editingLoan ? 'Edit Loan' : 'New Loan Request'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount (₹)</Label>
                <Input
                  type="number"
                  value={form.amount || ''}
                  onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                  placeholder="25000"
                />
              </div>
              <div>
                <Label>EMI Months (0 = full)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.emiMonths}
                  onChange={(e) => setForm({ ...form, emiMonths: e.target.value === '' ? '' : Number(e.target.value) })}
                />
              </div>
            </div>

            <div>
              <Label>Reason</Label>
              <Input
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Medical, Education, etc."
              />
            </div>

            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>

            {exceedsStandardLimit && !hasApprovedOverride && !isAdmin && (
              <Alert className="border-2 border-orange-500 bg-orange-50">
                <Lock className="h-5 w-5 text-orange-600" />
                <AlertTitle className="text-orange-900 font-bold">Amount Exceeds Limit</AlertTitle>
                <AlertDescription className="space-y-3">
                  <div className="text-sm">
                    <div>Standard Max: {formatCurrency(standardMaxLoan)}</div>
                    <div>You Requested: {formatCurrency(form.amount)}</div>
                    <div className="text-red-600 font-bold">
                      Excess: {formatCurrency(form.amount - standardMaxLoan)}
                    </div>
                  </div>
                  <div>
                    <Label className="font-semibold">Why do you need more?</Label>
                    <Textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Example: Medical emergency for family member"
                      rows={2}
                      className="mt-2"
                    />
                    <p className="text-xs text-orange-700 mt-2">
                      Note: If override is rejected, you will receive standard amount: {formatCurrency(standardMaxLoan)}
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {form.amount > 0 && (
              <Alert className={netAfterNewLoan < 0 ? 'border-red-500 bg-red-50' : 'border-green-500 bg-green-50'}>
                <AlertTitle>Net Salary After Loan</AlertTitle>
                <AlertDescription>
                  <div className="text-2xl font-bold">{formatCurrency(netAfterNewLoan)}</div>
                  {Number(form.emiMonths) > 0 && (
                    <div className="text-sm mt-1">
                      EMI: {formatCurrency(newEMI)} × {Number(form.emiMonths)} months
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3">
              <Button onClick={handleCreateOrUpdateLoan} className="flex-1" size="lg">
                {editingLoan ? 'Update' : exceedsStandardLimit && !isAdmin ? 'Submit with Override' : 'Submit'}
              </Button>
              {editingLoan && (
                <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-purple-400 bg-purple-50">
          <CardHeader>
            <CardTitle>Skip EMI Request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Request to skip EMI for a specific month</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Month</Label>
                <Input type="month" value={skipMonth} onChange={(e) => setSkipMonth(e.target.value)} />
              </div>
              <div>
                <Label>Reason</Label>
                <Input
                  value={skipReason}
                  onChange={(e) => setSkipReason(e.target.value)}
                  placeholder="Emergency, etc."
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div>
          <h3 className="text-lg font-bold mb-4">Loan Requests ({sortedLoans.length})</h3>

          {sortedLoans.length === 0 ? (
            <Card>
              <CardContent className="text-center py-10 text-muted-foreground">No loans yet</CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {sortedLoans.map((loan) => {
                const canEdit = loan.status === 'Pending' && (isAdmin || loan.createdBy === currentUserId);
                const hasOverride = !!loan.maxLoanOverride;
                const overrideStatus = loan.maxLoanOverride?.status;
                const currentMonthKey = getCurrentMonthKey();
                const currentMonthSkip = loan.skipEmiRequests?.[currentMonthKey];

                const overrideApproved = hasOverride && overrideStatus === 'Approved';
                const overrideRejected = hasOverride && overrideStatus === 'Rejected';
                const overridePending = hasOverride && overrideStatus === 'Pending';

                const standardMax = loan.maxLoanOverride?.standardMax || (gross * 3);
                const finalAmount = loan.approvedAmount || loan.amount;
                const displayAmount = loan.status === 'Approved' || loan.status === 'Repaid' ? finalAmount : loan.amount;
                const finalEmi = loan.emiAmount || 0;
                const remaining = calculateRemainingBalance(loan);

                return (
                  <Card
                    key={loan.id}
                    className={`border-2 ${
                      hasOverride && overrideStatus === 'Pending'
                        ? 'border-red-500 bg-red-50'
                        : loan.status === 'Pending'
                        ? 'border-orange-400 bg-orange-50'
                        : loan.status === 'Approved'
                        ? 'border-green-400 bg-green-50'
                        : loan.status === 'Repaid'
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-300'
                    }`}
                  >
                    <CardContent className="pt-5 space-y-3">
                      {isAdmin && loan.status === 'Pending' && hasOverride && (
                        <Card className="border-2 border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50">
                          <CardHeader>
                            <CardTitle className="text-sm flex items-center gap-2">
                              <ShieldAlert className="h-5 w-5 text-purple-600" />
                              Admin Two-Step Approval
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="flex items-start gap-3 p-3 bg-white rounded-lg border-2 border-purple-300">
                              <div className="flex items-center gap-2">
                                {overrideApproved ? (
                                  <CheckCircle className="h-6 w-6 text-green-600" />
                                ) : overrideRejected ? (
                                  <XCircle className="h-6 w-6 text-red-600" />
                                ) : (
                                  <Circle className="h-6 w-6 text-orange-500" />
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="font-bold text-sm mb-1">
                                  STEP 1: Override Decision
                                </div>
                                <div className="text-xs mb-2">
                                  <div>Requested: {formatCurrency(loan.maxLoanOverride?.requestedAmount || 0)}</div>
                                  <div>Standard Max: {formatCurrency(standardMax)}</div>
                                  <div className="text-red-600 font-bold">
                                    Excess: {formatCurrency((loan.maxLoanOverride?.requestedAmount || 0) - standardMax)}
                                  </div>
                                  <div className="mt-1 p-2 bg-gray-100 rounded text-xs">
                                    <strong>Reason:</strong> {loan.maxLoanOverride?.reason}
                                  </div>
                                </div>
                                {overridePending && (
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => handleApproveOverride(loan.id!, 'Approved')}
                                      className="flex-1"
                                    >
                                      <CheckCircle className="w-4 h-4 mr-1" />
                                      Approve Override
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => handleApproveOverride(loan.id!, 'Rejected')}
                                      className="flex-1"
                                    >
                                      <XCircle className="w-4 h-4 mr-1" />
                                      Reject Override
                                    </Button>
                                  </div>
                                )}
                                {overrideApproved && (
                                  <Badge variant="default" className="mt-2">
                                    ✓ Approved - Can give {formatCurrency(loan.amount)}
                                  </Badge>
                                )}
                                {overrideRejected && (
                                  <Badge variant="destructive" className="mt-2">
                                    ✗ Rejected - Can give max {formatCurrency(standardMax)}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 bg-white rounded-lg border-2 border-green-300">
                              <div className="flex items-center gap-2">
                                {(loan.status as LoanStatus) === 'Approved' ? (
                                  <CheckCircle className="h-6 w-6 text-green-600" />
                                ) : (loan.status as LoanStatus) === 'Rejected' ? (
                                  <XCircle className="h-6 w-6 text-red-600" />
                                ) : (
                                  <Circle className="h-6 w-6 text-blue-500" />
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="font-bold text-sm mb-1">
                                  STEP 2: Final Loan Decision
                                </div>
                                <div className="text-xs mb-2">
                                  {overrideApproved ? (
                                    <div className="text-green-700 font-semibold">
                                      ✓ Will approve full: {formatCurrency(loan.amount)}
                                    </div>
                                  ) : overrideRejected ? (
                                    <div className="text-orange-700 font-semibold">
                                      ⚠️ Will approve capped: {formatCurrency(standardMax)}
                                      <div className="text-xs text-gray-600 mt-1">
                                        (Original request: {formatCurrency(loan.amount)})
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-blue-700 font-semibold">
                                      ⏳ Complete Step 1 first
                                    </div>
                                  )}
                                </div>
                                {loan.status === 'Pending' && (
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => handleStatus(loan.id!, 'Approved')}
                                      className="flex-1"
                                    >
                                      <CheckCircle className="w-4 h-4 mr-1" />
                                      Approve Loan
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleStatus(loan.id!, 'Rejected')}
                                      className="flex-1"
                                    >
                                      <XCircle className="w-4 h-4 mr-1" />
                                      Reject Loan
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {isAdmin && loan.status === 'Pending' && !hasOverride && (
                        <Card className="border-2 border-blue-500 bg-blue-50">
                          <CardContent className="pt-4">
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleStatus(loan.id!, 'Approved')}
                                className="flex-1"
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Approve Loan
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleStatus(loan.id!, 'Rejected')}
                                className="flex-1"
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Reject Loan
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-2xl text-blue-900">
                              {formatCurrency(displayAmount)}
                            </p>
                            {loan.status === 'Approved' && loan.amount !== finalAmount && (
                              <Badge variant="secondary" className="text-xs">
                                Requested: {formatCurrency(loan.amount)}
                              </Badge>
                            )}
                            {loan.status === 'Repaid' && (
                              <StatusBadge status="Fully Repaid" className="text-xs" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{loan.reason}</p>
                          <div className="flex gap-3 text-xs text-muted-foreground mt-2">
                            <span>{new Date(loan.date).toLocaleDateString('en-IN')}</span>
                            {(loan.status === 'Approved' || loan.status === 'Repaid') && loan.emiMonths && loan.emiMonths > 0 && (
                              <span>EMI: {formatCurrency(finalEmi)} × {loan.emiMonths}m</span>
                            )}
                            {loan.status === 'Pending' && loan.emiMonths && loan.emiMonths > 0 && (
                              <span className="text-gray-500">
                                Planned EMI: {formatCurrency(Math.ceil(loan.amount / loan.emiMonths))} × {loan.emiMonths}m
                              </span>
                            )}
                          </div>
                          {(loan.status === 'Approved' || loan.status === 'Repaid') && (
                            <div className="mt-2 p-2 bg-white rounded-lg">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="font-semibold">Remaining Balance:</span>
                                <span className={`font-bold ${remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  {formatCurrency(remaining)}
                                </span>
                              </div>
                              {loan.emiPayments && (
                                <div className="text-xs text-muted-foreground">
                                  Paid: {Object.keys(loan.emiPayments).length} EMIs ({formatCurrency(finalAmount - remaining)})
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          <StatusBadge status={loan.status} />

                          {canEdit && (
                            <Button size="sm" variant="ghost" onClick={() => startEdit(loan)}>
                              Edit
                            </Button>
                          )}

                          {loan.approvedBy && (
                            <span className="text-xs text-muted-foreground">by {loan.approvedBy}</span>
                          )}
                        </div>
                      </div>

                      <div className="border-t pt-3 mt-3 text-xs space-y-2 bg-white/50 p-3 rounded">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold">Skip EMI</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRequestSkipEmi(loan)}
                            disabled={!skipMonth || !skipReason.trim() || loan.status !== 'Approved'}
                          >
                            Request ({skipMonth})
                          </Button>
                        </div>

                        {currentMonthSkip && (
                          <div className="flex justify-between items-center bg-purple-100 p-2 rounded">
                            <span>
                              {currentMonthKey}: <strong>{currentMonthSkip.status}</strong>
                            </span>
                            {isAdmin && currentMonthSkip.status === 'Pending' && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveSkipEmi(loan, currentMonthKey, 'Approved')}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleApproveSkipEmi(loan, currentMonthKey, 'Rejected')}
                                >
                                  Reject
                                </Button>
                              </div>
                            )}
                          </div>
                        )}

                        {loan.skipEmiRequests && (
                          <div className="space-y-1">
                            {Object.entries(loan.skipEmiRequests)
                              .sort(([a], [b]) => (a > b ? -1 : 1))
                              .map(([month, req]) => (
                                <div key={month} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                                  <span>
                                    {month}: {req.status} {req.reason && `(${req.reason})`}
                                  </span>
                                  {isAdmin && req.status === 'Pending' && (
                                    <div className="flex gap-2">
                                      <Button size="sm" onClick={() => handleApproveSkipEmi(loan, month, 'Approved')}>
                                        Approve
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleApproveSkipEmi(loan, month, 'Rejected')}
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
      </TabsContent>

      <TabsContent value="history">
        <HistoryTab loans={loans} isAdmin={isAdmin} currentUser={currentUser} />
      </TabsContent>
    </Tabs>
  );
}

// ============= MAIN COMPONENT =============
export default function Loans() {
  const currentUser = useCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceRecord[]>>({});
  const [payrollCredited, setPayrollCredited] = useState<{ [key: string]: { [empId: string]: boolean } }>({});
  const [search, setSearch] = useState('');

  // Load employees (only active)
  useEffect(() => {
    getAllRecords('hr/employees').then((data: any) => {
      const list = Object.values(data || {}) as Employee[];
      const activeList = list.filter(isEmployeeActive);
      setEmployees(activeList);
    });
  }, []);

  // Listen to loans in real-time
  useEffect(() => {
    const loansRef = ref(database, 'hr/loans');
    const unsub = onValue(loansRef, (snap) => {
      const data = snap.val() || {};
      const list: Loan[] = [];
      Object.entries(data).forEach(([id, val]: any) => {
        const loan = { ...(val as Loan), id };
        loan.remainingBalance = calculateRemainingBalance(loan);
        list.push(loan);
      });
      setLoans(list);
    });
    return () => unsub();
  }, []);

  // Listen to attendance
  useEffect(() => {
    const attRef = ref(database, 'hr/attendance');
    const unsub = onValue(attRef, (snap) => {
      const data = snap.val() || {};
      const map: Record<string, AttendanceRecord[]> = {};
      Object.keys(data).forEach((date) => {
        const day = data[date];
        if (day && typeof day === 'object') {
          Object.values(day).forEach((rec: any) => {
            if (rec.employeeId) {
              if (!map[rec.employeeId]) map[rec.employeeId] = [];
              map[rec.employeeId].push(rec as AttendanceRecord);
            }
          });
        }
      });
      setAttendanceMap(map);
    });
    return () => unsub();
  }, []);

  // Listen to payroll credited
  useEffect(() => {
    const payrollRef = ref(database, 'hr/payrollCredited');
    const unsub = onValue(payrollRef, (snapshot) => {
      setPayrollCredited(snapshot.val() || {});
    });
    return () => unsub();
  }, []);

  // Auto-deduct EMI when payroll is credited
  useEffect(() => {
    const currentMonth = getCurrentMonthKey();
    const creditedThisMonth = payrollCredited[currentMonth] || {};

    loans.forEach(async (loan) => {
      if (
        loan.status === 'Approved' &&
        loan.employeeId &&
        creditedThisMonth[loan.employeeId] === true &&
        loan.id
      ) {
        const alreadyDeducted = loan.emiPayments?.[currentMonth]?.payrollCredited;
        const remaining = calculateRemainingBalance(loan);

        if (!alreadyDeducted && remaining > 0 && loan.emiAmount) {
          const emiToPay = Math.min(loan.emiAmount, remaining);
          const newBalance = remaining - emiToPay;

          const emiPayment: EmiPayment = {
            month: currentMonth,
            amount: emiToPay,
            paidAt: Date.now(),
            payrollCredited: true,
            remainingBalance: newBalance,
            deductedFrom: 'Payroll Auto-Deduction',
          };

          const updates: any = {
            [`emiPayments/${currentMonth}`]: emiPayment,
            remainingBalance: newBalance,
            updatedAt: Date.now(),
          };

          if (newBalance <= 0) {
            updates.status = 'Repaid';
          }

          const loanRef = ref(database, `hr/loans/${loan.id}`);
          await update(loanRef, updates);

          console.log(`EMI auto-deducted for ${loan.employeeName}: ${formatCurrency(emiToPay)}, Remaining: ${formatCurrency(newBalance)}`);
        }
      }
    });
  }, [payrollCredited, loans]);

  const getEmployeeStats = (empId: string) => {
    const records = attendanceMap[empId] || [];
    return {
      presentDays: records.filter((r) => r.status === 'Present').length,
      totalDays: records.length,
    };
  };

  const getLoanStats = (empId: string) => {
    const empLoans = loans.filter((l) => l.employeeId === empId);
    const approved = empLoans.filter((l) => l.status === 'Approved');
    const pending = empLoans.filter((l) => l.status === 'Pending');
    const overrideRequests = empLoans.filter((l) => l.maxLoanOverride?.status === 'Pending');

    // Calculate total outstanding balance (remaining amount across all active loans)
    const totalOutstanding = approved.reduce((sum, loan) => {
      return sum + calculateRemainingBalance(loan);
    }, 0);

    // Calculate last month's total EMI deduction
    const lastMonth = getLastMonthKey();
    const lastMonthEmiDeduction = approved.reduce((sum, loan) => {
      const payment = loan.emiPayments?.[lastMonth];
      return sum + (payment?.payrollCredited ? payment.amount : 0);
    }, 0);

    return {
      totalLoans: empLoans.length,
      approvedCount: approved.length,
      pendingCount: pending.length,
      totalApprovedAmount: approved.reduce((s, l) => s + (l.approvedAmount || l.amount), 0),
      totalPendingAmount: pending.reduce((s, l) => s + l.amount, 0),
      totalOutstanding,
      lastMonthEmiDeduction,
      overrideRequestsCount: overrideRequests.length,
    };
  };

  const filteredEmployees = employees.filter(
    (emp) =>
      emp.name?.toLowerCase().includes(search.toLowerCase()) ||
      emp.employeeId?.toLowerCase().includes(search.toLowerCase())
  );

  const pendingOverrides = loans.filter((l) => l.maxLoanOverride?.status === 'Pending');

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-700 to-blue-600 bg-clip-text text-transparent">
            Employee Loans Management
          </h1>
          <p className="text-muted-foreground mt-2">
            {isAdmin ? 'Manage all employee loan requests with auto EMI deduction' : 'View and request loans'}
          </p>
        </div>
        {isAdmin && pendingOverrides.length > 0 && (
          <Badge variant="destructive" className="px-4 py-3 animate-pulse">
            <ShieldAlert className="w-5 h-5 mr-2" />
            {pendingOverrides.length} Override Pending
          </Badge>
        )}
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Employees</CardTitle>
            <CheckSquare className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900">{employees.length}</div>
            <p className="text-xs text-blue-600 mt-1">Status: Active</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Loans</CardTitle>
            <IndianRupee className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900">{loans.length}</div>
            <p className="text-xs text-green-600 mt-1">
              Active: {loans.filter(l => l.status === 'Approved').length}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-900">
              {loans.filter(l => l.status === 'Pending').length}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fully Repaid</CardTitle>
            <CheckCircle className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-900">
              {loans.filter(l => l.status === 'Repaid').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-2">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search employee..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Emp ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Gross Salary</TableHead>
                <TableHead>Attendance</TableHead>
                <TableHead>Loans</TableHead>
                <TableHead>Approved</TableHead>
              
                <TableHead>Outstanding Balance</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.map((emp) => {
                const stats = getEmployeeStats(emp.id);
                const loanStats = getLoanStats(emp.id);

                return (
                  <TableRow
                    key={emp.id}
                    className={
                      loanStats.overrideRequestsCount > 0
                        ? 'bg-red-50 border-l-4 border-red-500'
                        : loanStats.pendingCount > 0
                        ? 'bg-yellow-50'
                        : ''
                    }
                  >
                    <TableCell className="font-medium">{emp.employeeId}</TableCell>
                    <TableCell className="font-medium">{emp.name}</TableCell>
                    <TableCell>
                      <StatusBadge status={emp.status || ''} />
                    </TableCell>
                    <TableCell>{emp.department}</TableCell>
                    <TableCell>{formatCurrency(emp.salary?.grossMonthly || 0)}</TableCell>
                    <TableCell>
                      {stats.presentDays}/{stats.totalDays}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{loanStats.totalLoans}</Badge>
                    </TableCell>
                    <TableCell className="text-green-600">
                      {loanStats.approvedCount} ({formatCurrency(loanStats.totalApprovedAmount)})
                    </TableCell>
                  
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-red-600">
                          {formatCurrency(loanStats.totalOutstanding)}
                        </span>
                        {loanStats.lastMonthEmiDeduction > 0 && (
                          <span className="text-xs text-muted-foreground">
                            Last EMI: -{formatCurrency(loanStats.lastMonthEmiDeduction)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Sheet>
                        <SheetTrigger asChild>
                          <Button size="sm" className="relative">
                            <Eye className="w-4 h-4 mr-2" />
                            Manage
                            {loanStats.overrideRequestsCount > 0 && (
                              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                {loanStats.overrideRequestsCount}
                              </span>
                            )}
                          </Button>
                        </SheetTrigger>
                        <SheetContent className="w-full sm:max-w-5xl overflow-y-auto">
                          <SheetHeader>
                            <SheetTitle>
                              {emp.name} ({emp.employeeId}) - <Badge variant="default">{emp.status}</Badge>
                            </SheetTitle>
                          </SheetHeader>
                          <LoanBox
                            employee={emp}
                            loans={loans.filter((l) => l.employeeId === emp.id)}
                            isAdmin={isAdmin}
                            currentUser={currentUser}
                            onLoanUpdate={() => {
                              toast({ title: '✅ Updated successfully' });
                            }}
                          />
                        </SheetContent>
                      </Sheet>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
