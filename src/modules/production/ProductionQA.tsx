import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { database, logAudit } from '@/services/firebase';
import { ref, get, update, push } from 'firebase/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { PackageCheck } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface QAData {
  totalAccepted: number;
  totalRejected: number;
  status: 'qa_pending' | 'qa_completed';
  lastQaDate: string;
  lastAssignee: string;
  lastRejectionReason: string;
}

interface WORow {
  key: string;
  soNo: string;
  workOrderNo: string;
  customerName: string;
  plannedQty: number;
  totalAccepted: number;
  totalRejected: number;
  remainingQty: number;
  fgItem: string;
  fgDescription: string;
  movedToFG: boolean;
  qa?: QAData;
  createdAt?: string;
}

interface QAInput {
  assignee: string;
  acceptedQty: string;
  rejectedQty: string;
  reason: string;
}

const emptyInput = (): QAInput => ({ assignee: '', acceptedQty: '', rejectedQty: '', reason: '' });

// ── Component ──────────────────────────────────────────────────────────────────

export default function ProductionQA() {
  const navigate = useNavigate();
  const [tab,       setTab]       = useState<'pending' | 'completed'>('pending');
  const [pending,   setPending]   = useState<WORow[]>([]);
  const [completed, setCompleted] = useState<WORow[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [inputs,    setInputs]    = useState<Record<string, QAInput>>({});
  const [saving,    setSaving]    = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [woSnap, soSnap] = await Promise.all([
        get(ref(database, 'production/workOrders')),
        get(ref(database, 'production/salesOrders')),
      ]);
      if (!woSnap.exists()) return;

      // Build SO key → readable number lookup
      const soLookup: Record<string, string> = {};
      if (soSnap.exists()) {
        const soRaw = soSnap.val() as Record<string, any>;
        Object.entries(soRaw).forEach(([k, so]) => {
          soLookup[k] = so.soNumber || so.poNumber || k;
        });
      }

      const raw = woSnap.val() as Record<string, any>;
      const pend: WORow[] = [];
      const comp: WORow[] = [];

      Object.entries(raw).forEach(([key, wo]) => {
        if (!wo.tracking) return;

        const plannedQty    = parseFloat(wo.requiredQty) || 0;
        const totalAccepted = parseFloat(wo.qa?.totalAccepted ?? 0) || 0;
        const totalRejected = parseFloat(wo.qa?.totalRejected ?? 0) || 0;
        // Only accepted qty closes items — rejected ones must come back for re-inspection after rework
        const remainingQty  = Math.max(0, plannedQty - totalAccepted);

        const row: WORow = {
          key,
          soNo:          soLookup[wo.soNo] || wo.soNo || '',
          workOrderNo:   wo.workOrderNo    || '',
          customerName:  wo.customerName   || '',
          plannedQty,
          totalAccepted,
          totalRejected,
          remainingQty,
          fgItem:        wo.fgItem        || wo.itemCode        || wo.workOrderNo || '',
          fgDescription: wo.fgDescription || wo.itemName        || wo.partName    || '',
          movedToFG:     !!wo.qa?.movedToFG,
          qa: wo.qa,
          createdAt:     wo.createdAt      || '',
        };

        if (remainingQty > 0 && wo.qa?.status !== 'dispatched') pend.push(row);
        // QA Completed: accepted qty exists, not yet moved to FG, not dispatched
        if (totalAccepted > 0 && !wo.qa?.movedToFG && wo.qa?.status !== 'dispatched') comp.push(row);
      });

      const sortByDate = (a: WORow, b: WORow) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (dateA !== dateB) return dateB - dateA;
        return b.workOrderNo.localeCompare(a.workOrderNo);
      };

      pend.sort(sortByDate);
      comp.sort(sortByDate);

      setPending(pend);
      setCompleted(comp);
    } finally {
      setLoading(false);
    }
  };

  const setField = (key: string, field: keyof QAInput, val: string) =>
    setInputs(prev => ({ ...prev, [key]: { ...(prev[key] || emptyInput()), [field]: val } }));

  // Go: save QA entry and advance
  const handleGoPending = async (row: WORow) => {
    const inp = inputs[row.key] || emptyInput();
    const accepted = parseFloat(inp.acceptedQty || '');
    const rejected = parseFloat(inp.rejectedQty || '0') || 0;

    if (!inp.assignee.trim()) {
      toast({ title: 'Enter Assignee Name', variant: 'destructive' }); return;
    }
    if (!accepted || accepted <= 0) {
      toast({ title: 'Enter a valid Accepted Qty', variant: 'destructive' }); return;
    }
    if (rejected > 0 && !inp.reason.trim()) {
      toast({ title: 'Enter Reason of Rejection for rejected qty', variant: 'destructive' }); return;
    }
    if (accepted > row.remainingQty) {
      toast({
        title: `Accepted Qty (${accepted}) cannot exceed Remaining Qty (${row.remainingQty})`,
        variant: 'destructive',
      }); return;
    }
    if (accepted + rejected > row.remainingQty) {
      toast({
        title: `Accepted (${accepted}) + Rejected (${rejected}) exceeds Remaining Qty (${row.remainingQty})`,
        description: 'You can only inspect up to the remaining quantity in this pass.',
        variant: 'destructive',
      }); return;
    }

    setSaving(row.key);
    try {
      const newAccepted  = row.totalAccepted + accepted;
      const newRejected  = row.totalRejected + rejected;
      // Remaining = planned minus total accepted; rejected items stay pending rework
      const newRemaining = Math.max(0, row.plannedQty - newAccepted);
      const allDone      = newRemaining === 0;

      const qa: QAData = {
        totalAccepted:       newAccepted,
        totalRejected:       newRejected,
        status:              allDone ? 'qa_completed' : 'qa_pending',
        lastQaDate:          new Date().toISOString(),
        lastAssignee:        inp.assignee,
        lastRejectionReason: inp.reason,
      };

      await update(ref(database, `production/workOrders/${row.key}`), { qa });

      if (allDone) {
        toast({
          title: `All ${row.plannedQty} units inspected`,
          description: `Accepted: ${newAccepted} | Rejected: ${newRejected}`,
        });
      } else {
        const parts = [`${accepted} accepted`];
        if (rejected > 0) parts.push(`${rejected} rejected`);
        toast({
          title: parts.join(', '),
          description: `${newRemaining} units still need QA`,
        });
      }

      setInputs(prev => ({ ...prev, [row.key]: emptyInput() }));
      await loadData();
    } finally {
      setSaving(null);
    }
  };

  const handleMoveToInventory = async (row: WORow) => {
    if (row.remainingQty > 0) {
      toast({
        title: `${row.remainingQty} units still pending QA`,
        description: 'Complete all qty in QA Pending first.',
        variant: 'destructive',
      }); return;
    }
    setSaving(row.key);
    try {
      // Write accepted qty to Finished Goods store
      const fgRef = await push(ref(database, 'stores/fg'), {
        productCode:  row.fgItem        || row.workOrderNo,
        productName:  row.fgDescription || row.workOrderNo,
        quantity:     row.totalAccepted,
        uom:          'Nos',
        qc:           'ok',
        soNumber:     row.soNo,
        woKey:        row.key,
        createdAt:    Date.now(),
      });
      logAudit(
        'stores/fg',
        fgRef.key,
        'stock_added',
        `+${row.totalAccepted} of ${row.fgItem || row.workOrderNo} from QA-accepted WO ${row.workOrderNo}`,
      );
      // Mark work order as moved to inventory
      await update(ref(database, `production/workOrders/${row.key}/qa`), { movedToFG: true });
      toast({ title: `${row.workOrderNo} moved to Inventory → Finished Goods` });
      navigate('/inventory/finished-goods');
    } finally {
      setSaving(null);
    }
  };

  const TAB = (active: boolean) =>
    `px-6 py-2 text-sm font-medium border-b-2 transition-colors ${
      active ? 'border-slate-700 text-slate-800'
             : 'border-transparent text-muted-foreground hover:text-slate-700 hover:border-slate-300'}`;

  const TH = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <TableHead className={`text-xs font-semibold text-slate-700 text-center bg-blue-50 ${className}`}>
      {children}
    </TableHead>
  );

  return (
    <div className="space-y-4">

      {/* Tabs */}
      <div className="flex border-b">
        <button className={TAB(tab === 'pending')} onClick={() => setTab('pending')}>
          QA Pending
          {pending.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
              {pending.length}
            </span>
          )}
        </button>
        <button className={TAB(tab === 'completed')} onClick={() => setTab('completed')}>
          QA Completed
          {completed.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
              {completed.length}
            </span>
          )}
        </button>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-700">
              {tab === 'pending' ? 'QA Pending' : 'QA Completed'}
            </CardTitle>
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={loadData} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 overflow-x-auto">

          {/* ── QA Pending ────────────────────────────────────────────────── */}
          {tab === 'pending' && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TH className="w-10">S.No</TH>
                  <TH>SO No</TH>
                  <TH>Work Order No</TH>
                  <TH>Customer Name</TH>
                  <TH>Planned Qty</TH>
                  <TH>QA Completed Qty</TH>
                  <TH>Remaining Qty</TH>
                  <TH>Assignee Name</TH>
                  <TH>Accepted Qty</TH>
                  <TH>Rejected Qty</TH>
                  <TH>Reason of Rejection</TH>
                  <TH className="w-14">Go</TH>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-10 text-sm">
                      {loading ? 'Loading…' : 'No pending QA records'}
                    </TableCell>
                  </TableRow>
                ) : pending.map((row, i) => {
                  const inp = inputs[row.key] || emptyInput();
                  const rejQty = parseFloat(inp.rejectedQty || '0') || 0;
                  return (
                    <TableRow key={row.key} className="hover:bg-muted/20">
                      <TableCell className="text-xs text-center">{i + 1}</TableCell>
                      <TableCell className="text-xs font-medium text-primary">{row.soNo || '—'}</TableCell>
                      <TableCell className="text-xs font-medium text-primary">{row.workOrderNo}</TableCell>
                      <TableCell className="text-xs">{row.customerName}</TableCell>
                      <TableCell className="text-xs text-center">{row.plannedQty}</TableCell>

                      {/* QA Completed Qty */}
                      <TableCell className="text-xs text-center">
                        {row.totalAccepted > 0 ? (
                          <span className="inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                            {row.totalAccepted}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>

                      {/* Remaining Qty = items not yet inspected */}
                      <TableCell className="text-xs text-center">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                          {row.remainingQty}
                        </span>
                      </TableCell>

                      {/* Assignee */}
                      <TableCell>
                        <Input className="h-7 w-32 text-xs mx-auto block"
                          placeholder="Name"
                          value={inp.assignee}
                          onChange={e => setField(row.key, 'assignee', e.target.value)} />
                      </TableCell>

                      {/* Accepted Qty */}
                      <TableCell>
                        <Input type="number" min="0" max={row.remainingQty}
                          className="h-7 w-24 text-xs mx-auto block"
                          placeholder={`Max ${row.remainingQty}`}
                          value={inp.acceptedQty}
                          onChange={e => setField(row.key, 'acceptedQty', e.target.value)} />
                      </TableCell>

                      {/* Rejected Qty */}
                      <TableCell>
                        <Input type="number" min="0"
                          className="h-7 w-24 text-xs mx-auto block"
                          placeholder="0"
                          value={inp.rejectedQty}
                          onChange={e => setField(row.key, 'rejectedQty', e.target.value)} />
                      </TableCell>

                      {/* Reason of Rejection */}
                      <TableCell>
                        <Input
                          className={`h-7 w-36 text-xs mx-auto block transition-opacity ${
                            rejQty > 0 ? 'opacity-100' : 'opacity-30 pointer-events-none'
                          }`}
                          placeholder={rejQty > 0 ? 'Enter reason' : '—'}
                          value={inp.reason}
                          onChange={e => setField(row.key, 'reason', e.target.value)} />
                      </TableCell>

                      {/* Go */}
                      <TableCell className="text-center">
                        <Button size="sm" disabled={saving === row.key}
                          className="h-7 px-4 text-xs bg-blue-700 hover:bg-blue-800 text-white"
                          onClick={() => handleGoPending(row)}>
                          {saving === row.key ? '…' : 'Go'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* ── QA Completed ──────────────────────────────────────────────── */}
          {tab === 'completed' && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TH className="w-10">S.No</TH>
                  <TH>SO No</TH>
                  <TH>Work Order No</TH>
                  <TH>Customer Name</TH>
                  <TH>Planned Qty</TH>
                  <TH>Accepted Qty</TH>
                  <TH>Rejected Qty</TH>
                  <TH>Remaining Qty</TH>
                  <TH>Last Assignee</TH>
                  <TH>Rejection Reason</TH>
                  <TH className="w-40">Action</TH>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completed.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-10 text-sm">
                      {loading ? 'Loading…' : 'No completed QA records'}
                    </TableCell>
                  </TableRow>
                ) : completed.map((row, i) => (
                  <TableRow key={row.key} className="hover:bg-muted/20">
                    <TableCell className="text-xs text-center">{i + 1}</TableCell>
                    <TableCell className="text-xs font-medium text-primary">{row.soNo || '—'}</TableCell>
                    <TableCell className="text-xs font-medium text-primary">{row.workOrderNo}</TableCell>
                    <TableCell className="text-xs">{row.customerName}</TableCell>
                    <TableCell className="text-xs text-center">{row.plannedQty}</TableCell>

                    <TableCell className="text-xs text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                        {row.totalAccepted}
                      </span>
                    </TableCell>

                    <TableCell className="text-xs text-center">
                      {row.totalRejected > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                          {row.totalRejected}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>

                    <TableCell className="text-xs text-center">
                      {row.remainingQty > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                          {row.remainingQty} in rework
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                          All accepted
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-xs text-center">
                      {row.qa?.lastAssignee || '—'}
                    </TableCell>

                    <TableCell className="text-xs text-center max-w-[140px] truncate"
                      title={row.qa?.lastRejectionReason}>
                      {row.qa?.lastRejectionReason || '—'}
                    </TableCell>

                    <TableCell className="text-center">
                      <Button size="sm"
                        disabled={saving === row.key || row.remainingQty > 0}
                        title={row.remainingQty > 0 ? `${row.remainingQty} units still in rework` : 'Move to Inventory'}
                        className="h-7 px-3 text-xs bg-green-700 hover:bg-green-800 text-white disabled:opacity-40 whitespace-nowrap gap-1.5"
                        onClick={() => handleMoveToInventory(row)}>
                        <PackageCheck className="h-3.5 w-3.5" />
                        {saving === row.key ? '…' : 'Move to Inventory'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
