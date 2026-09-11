import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Trash2, BookText, Lock, Unlock, ShieldAlert, CheckCircle2, RotateCcw,
  Sparkles, Calendar, Info, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getAllRecords, createRecord } from '@/services/firebase';
import { useOrgSettings } from '@/context/OrgSettingsContext';
import { formatCurrency } from '@/lib/countryConfig';
import {
  getPeriodLock,
  setPeriodLock,
  getPostingConfig,
  activateLivePosting,
  reverseUnifiedVoucher,
} from '@/services/voucherPostingService';
import type { ChartOfAccount, UnifiedVoucher, JournalLine, PeriodLock, PostingConfig } from '@/types/accounts';

const emptyLine = (): JournalLine => ({ accountId: '', accountName: '', debit: 0, credit: 0 });

export default function ManualJournals() {
  const { country } = useOrgSettings();
  const [journals, setJournals] = useState<UnifiedVoucher[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [periodLock, setPeriodLockState] = useState<PeriodLock | null>(null);
  const [postingConfig, setPostingConfigState] = useState<PostingConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // New Journal Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([emptyLine(), emptyLine()]);

  // Period Lock Dialog
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [newLockDate, setNewLockDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [lockNotes, setLockNotes] = useState('');
  const [isSavingLock, setIsSavingLock] = useState(false);

  // Reversal Dialog
  const [reverseDialogOpen, setReverseDialogOpen] = useState(false);
  const [targetVoucherForReversal, setTargetVoucherForReversal] = useState<UnifiedVoucher | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalDate, setReversalDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isReversing, setIsReversing] = useState(false);

  // Activating live posting state
  const [isActivatingLive, setIsActivatingLive] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [jData, aData, pLock, pConfig] = await Promise.all([
        getAllRecords('accounts/journals'),
        getAllRecords('accounts/chartOfAccounts'),
        getPeriodLock(),
        getPostingConfig(),
      ]);
      setJournals((jData as UnifiedVoucher[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      setAccounts((aData as ChartOfAccount[]).filter((a) => a.status === 'active').sort((a, b) => a.code.localeCompare(b.code)));
      setPeriodLockState(pLock);
      setPostingConfigState(pConfig);
      if (pLock?.lockDate) setNewLockDate(pLock.lockDate);
    } catch (err) {
      console.error('Error loading journals data:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateLine = (idx: number, field: keyof JournalLine, value: any) => {
    setLines((prev) => {
      const next = [...prev];
      const line = { ...next[idx] };
      if (field === 'accountId') {
        const acc = accounts.find((a) => a.id === value);
        line.accountId = value;
        line.accountName = acc ? `${acc.code} - ${acc.name}` : '';
      } else if (field === 'debit') {
        line.debit = Number(value) || 0;
        if (line.debit > 0) line.credit = 0;
      } else if (field === 'credit') {
        line.credit = Number(value) || 0;
        if (line.credit > 0) line.debit = 0;
      }
      next[idx] = line;
      return next;
    });
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

  const saveJournal = async (status: 'Draft' | 'Posted') => {
    const validLines = lines.filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));
    if (validLines.length < 2) {
      toast.error('Add at least two account lines');
      return;
    }
    if (status === 'Posted' && !isBalanced) {
      toast.error('Total debit must equal total credit to post');
      return;
    }

    // Period Lock Check
    if (periodLock && periodLock.lockDate && date <= periodLock.lockDate) {
      toast.error(`Accounting period is locked up to ${periodLock.lockDate}. Entries cannot be posted on or before this date.`);
      return;
    }

    const journalNumber = `JV-${Date.now().toString().slice(-6)}`;
    try {
      await createRecord('accounts/journals', {
        journalNumber,
        voucherNumber: journalNumber,
        voucherType: 'Journal',
        date,
        effectiveAccountingDate: date,
        narration,
        lines: validLines,
        totalDebit,
        totalCredit,
        status,
        createdAt: Date.now(),
      });
      toast.success(status === 'Posted' ? 'Journal posted' : 'Journal saved as draft');
      setDialogOpen(false);
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setNarration('');
      setLines([emptyLine(), emptyLine()]);
      loadAll();
    } catch {
      toast.error('Failed to save journal');
    }
  };

  const handleSavePeriodLock = async () => {
    if (!newLockDate) {
      toast.error('Select a lock date');
      return;
    }
    setIsSavingLock(true);
    try {
      await setPeriodLock(newLockDate, lockNotes);
      toast.success(`Accounting period locked up to ${newLockDate}`);
      setLockDialogOpen(false);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update period lock');
    } finally {
      setIsSavingLock(false);
    }
  };

  const openReversalDialog = (v: UnifiedVoucher) => {
    setTargetVoucherForReversal(v);
    setReversalReason('');
    setReversalDate(format(new Date(), 'yyyy-MM-dd'));
    setReverseDialogOpen(true);
  };

  const handleExecuteReversal = async () => {
    if (!targetVoucherForReversal) return;
    if (!reversalReason.trim()) {
      toast.error('Please enter a reversal reason');
      return;
    }
    setIsReversing(true);
    try {
      const res = await reverseUnifiedVoucher({
        voucherId: targetVoucherForReversal.id,
        reason: reversalReason.trim(),
        effectiveDate: reversalDate,
      });
      toast.success(`Voucher reversed. Reciprocal entry ${res.reversalVoucherNumber} posted.`);
      setReverseDialogOpen(false);
      setTargetVoucherForReversal(null);
      setReversalReason('');
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reverse voucher');
    } finally {
      setIsReversing(false);
    }
  };

  const handleActivateLivePosting = async () => {
    if (!confirm('Activate live posting? All validation vouchers will be committed to the General Ledger and live posting will be enforced.')) {
      return;
    }
    setIsActivatingLive(true);
    try {
      const res = await activateLivePosting();
      toast.success(`Live Posting Activated! ${res.count} validation vouchers committed.`);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to activate live posting');
    } finally {
      setIsActivatingLive(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. Controlled Activation Banner */}
      {postingConfig && (
        <Card className={postingConfig.postingMode === 'validation' ? 'border-amber-300 bg-amber-50/60' : 'border-green-300 bg-green-50/50'}>
          <CardContent className="py-3 px-4 flex items-center justify-between flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              {postingConfig.postingMode === 'validation' ? (
                <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              )}
              <div>
                <div className="font-semibold text-foreground flex items-center gap-2">
                  <span>Posting Mode: {postingConfig.postingMode === 'validation' ? 'Validation & Simulation' : 'Active (Live General Ledger)'}</span>
                  <Badge variant={postingConfig.postingMode === 'validation' ? 'outline' : 'default'} className="text-[10px]">
                    Cutover: {postingConfig.cutoverDate || '2026-04-01'}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-[11px] mt-0.5">
                  {postingConfig.postingMode === 'validation'
                    ? 'Automated postings generate validation preview vouchers without irreversible balance mutation. Audit entries before committing live.'
                    : 'All invoices, bills, payments, and settlements post directly to the immutable General Ledger.'}
                </p>
              </div>
            </div>

            {postingConfig.postingMode === 'validation' && (
              <Button
                size="sm"
                className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                onClick={handleActivateLivePosting}
                disabled={isActivatingLive}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isActivatingLive ? 'Activating...' : 'Activate Live Posting'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* 2. Top Header with Period Lock & Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">{journals.length} journal entries &amp; vouchers</p>
          {/* Period Lock Badge */}
          <button
            onClick={() => setLockDialogOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-muted/40 hover:bg-muted/70 transition-colors"
            title="Configure Accounting Period Lock"
          >
            {periodLock && periodLock.lockDate ? (
              <>
                <Lock className="h-3.5 w-3.5 text-amber-600" />
                <span className="text-foreground font-semibold">Locked to: {periodLock.lockDate}</span>
              </>
            ) : (
              <>
                <Unlock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Period Lock: Unset</span>
              </>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setLockDialogOpen(true)}>
            <Lock className="h-3.5 w-3.5 mr-1.5" />Period Lock
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)} disabled={accounts.length === 0}>
            <Plus className="h-4 w-4 mr-1.5" />New Journal Entry
          </Button>
        </div>
      </div>

      {accounts.length === 0 && !loading && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Add accounts under Chart of Accounts first before creating journal entries.
        </p>
      )}

      {/* 3. Journals Table / List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookText className="h-4 w-4 text-primary" />
              Unified Journal &amp; Voucher Register
            </div>
            <p className="text-xs text-muted-foreground font-normal">
              Immutable double-entry vouchers with reciprocal reversals and period lock enforcement.
            </p>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading vouchers...</p>
          ) : journals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No journal entries yet.</p>
          ) : (
            <div className="space-y-3">
              {journals.map((j) => {
                const isReversed = j.status === 'Reversed';
                const isValidation = j.status === 'Validation' || j.isValidation;

                return (
                  <div key={j.id} className={`border rounded-lg p-3 ${isReversed ? 'bg-muted/10 opacity-75' : isValidation ? 'border-dashed border-amber-300 bg-amber-50/20' : ''}`}>
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm">{j.voucherNumber || j.journalNumber}</span>
                        {j.voucherType && (
                          <Badge variant="outline" className="text-[10px]">
                            {j.voucherType}
                          </Badge>
                        )}
                        {j.sourceType && (
                          <span className="text-[11px] text-muted-foreground font-mono">
                            src: {j.sourceType} {j.sourceNumber ? `(${j.sourceNumber})` : ''}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground ml-1">
                          {(() => { try { return format(new Date(j.date), 'dd-MM-yyyy'); } catch { return j.date; } })()}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <StatusBadge status={j.status} />

                        {j.status === 'Posted' && !isReversed && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => openReversalDialog(j)}
                            title="Reverse this voucher immutably"
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />Reverse
                          </Button>
                        )}
                      </div>
                    </div>

                    {j.narration && <p className="text-xs text-muted-foreground mb-2">{j.narration}</p>}

                    {isReversed && (
                      <div className="mb-2 p-2 bg-red-50/80 border border-red-200 rounded text-[11px] text-red-900 flex items-center gap-2">
                        <RotateCcw className="h-3.5 w-3.5 text-red-600 shrink-0" />
                        <span>
                          <strong>Reversed: </strong>
                          {j.reversalReason || 'Reciprocal reversal voucher posted.'}
                          {j.reversalVoucherId && <span className="font-mono ml-1">Ref: {j.reversalVoucherId}</span>}
                        </span>
                      </div>
                    )}

                    <div className="text-xs divide-y border rounded-md overflow-hidden">
                      {j.lines.map((l, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-muted/20">
                          <span>{l.accountName}</span>
                          <span className="font-mono">
                            {l.debit > 0 ? `Dr ${formatCurrency(l.debit, country)}` : `Cr ${formatCurrency(l.credit, country)}`}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end gap-4 pt-1.5 text-[11px] font-mono text-muted-foreground">
                      <span>Total Debit: {formatCurrency(j.totalDebit, country)}</span>
                      <span>Total Credit: {formatCurrency(j.totalCredit, country)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* DIALOG 1: NEW JOURNAL ENTRY */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Journal Entry</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label>Narration</Label>
                <Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Purpose of this entry" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Account Lines</Label>
                <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" />Add Line</Button>
              </div>
              <div className="border rounded-md divide-y">
                {lines.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2">
                    <Select value={line.accountId} onValueChange={(v) => updateLine(idx, 'accountId', v)}>
                      <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="number" placeholder="Debit" value={line.debit || ''}
                      onChange={(e) => updateLine(idx, 'debit', e.target.value)} className="w-24 h-8 text-xs" />
                    <Input type="number" placeholder="Credit" value={line.credit || ''}
                      onChange={(e) => updateLine(idx, 'credit', e.target.value)} className="w-24 h-8 text-xs" />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeLine(idx)} disabled={lines.length <= 2}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-6 text-xs font-medium">
                <span>Total Debit: {formatCurrency(totalDebit, country)}</span>
                <span>Total Credit: {formatCurrency(totalCredit, country)}</span>
                <span className={isBalanced ? 'text-green-600' : 'text-red-600'}>
                  {isBalanced ? 'Balanced' : 'Not Balanced'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="outline" onClick={() => saveJournal('Draft')}>Save as Draft</Button>
            <Button onClick={() => saveJournal('Posted')} disabled={!isBalanced}>Post Journal</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: ACCOUNTING PERIOD LOCK */}
      <Dialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-600" />
              Accounting Period Lock
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-muted-foreground">
              Entries on or prior to the lock date cannot be posted, edited, or reversed. This protects audited periods and tax filings.
            </p>

            <div>
              <Label>Lock Date (Closed Through)</Label>
              <Input
                type="date"
                value={newLockDate}
                onChange={(e) => setNewLockDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div>
              <Label>Lock Reason / Notes</Label>
              <Textarea
                rows={2}
                value={lockNotes}
                onChange={(e) => setLockNotes(e.target.value)}
                placeholder="e.g. Q1 Year-End Audit Closed"
                className="text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setLockDialogOpen(false)} disabled={isSavingLock}>
                Cancel
              </Button>
              <Button onClick={handleSavePeriodLock} disabled={isSavingLock}>
                {isSavingLock ? 'Saving...' : 'Set Period Lock'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: REVERSE VOUCHER */}
      <Dialog open={reverseDialogOpen} onOpenChange={setReverseDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-red-600" />
              Reverse Accounting Voucher
            </DialogTitle>
          </DialogHeader>
          {targetVoucherForReversal && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-red-50/70 border border-red-200 rounded-lg space-y-1">
                <p className="font-semibold text-red-900">
                  Immutable Reciprocal Reversal
                </p>
                <p className="text-[11px] text-red-800">
                  Voucher <strong>{targetVoucherForReversal.voucherNumber || targetVoucherForReversal.journalNumber}</strong> will be marked as Reversed.
                  A reciprocal reversal entry will be created with swapped Debits and Credits, ensuring net zero movement in the General Ledger.
                </p>
              </div>

              <div>
                <Label>Reversal Effective Date</Label>
                <Input
                  type="date"
                  value={reversalDate}
                  onChange={(e) => setReversalDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div>
                <Label>Reversal Reason (Required)</Label>
                <Textarea
                  rows={2}
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g. Incorrect account line or duplicate vendor billing"
                  className="text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setReverseDialogOpen(false)} disabled={isReversing}>
                  Cancel
                </Button>
                <Button
                  onClick={handleExecuteReversal}
                  disabled={isReversing}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {isReversing ? 'Reversing...' : 'Confirm Reversal'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
