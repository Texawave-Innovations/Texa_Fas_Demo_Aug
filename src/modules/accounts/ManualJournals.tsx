import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, BookText } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getAllRecords, createRecord } from '@/services/firebase';
import { useOrgSettings } from '@/context/OrgSettingsContext';
import { formatCurrency } from '@/lib/countryConfig';
import type { ChartOfAccount, JournalEntry, JournalLine } from '@/types/accounts';

const emptyLine = (): JournalLine => ({ accountId: '', accountName: '', debit: 0, credit: 0 });

export default function ManualJournals() {
  const { country } = useOrgSettings();
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([emptyLine(), emptyLine()]);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [jData, aData] = await Promise.all([
        getAllRecords('accounts/journals'),
        getAllRecords('accounts/chartOfAccounts'),
      ]);
      setJournals((jData as JournalEntry[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      setAccounts((aData as ChartOfAccount[]).filter((a) => a.status === 'active').sort((a, b) => a.code.localeCompare(b.code)));
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
  const isBalanced = totalDebit > 0 && totalDebit === totalCredit;

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
    const journalNumber = `JV-${Date.now().toString().slice(-6)}`;
    try {
      await createRecord('accounts/journals', {
        journalNumber,
        date,
        narration,
        lines: validLines,
        totalDebit,
        totalCredit,
        status,
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{journals.length} journal entries</p>
        <Button size="sm" onClick={() => setDialogOpen(true)} disabled={accounts.length === 0}>
          <Plus className="h-4 w-4 mr-1.5" />New Journal Entry
        </Button>
      </div>

      {accounts.length === 0 && !loading && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Add accounts under Chart of Accounts first before creating journal entries.
        </p>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><BookText className="h-4 w-4 text-primary" />Journal Entries</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading journals...</p>
          ) : journals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No journal entries yet.</p>
          ) : (
            <div className="space-y-3">
              {journals.map((j) => (
                <div key={j.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-mono font-semibold text-sm">{j.journalNumber}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {(() => { try { return format(new Date(j.date), 'dd-MM-yyyy'); } catch { return j.date; } })()}
                      </span>
                    </div>
                    <StatusBadge status={j.status} />
                  </div>
                  {j.narration && <p className="text-xs text-muted-foreground mb-2">{j.narration}</p>}
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
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}
