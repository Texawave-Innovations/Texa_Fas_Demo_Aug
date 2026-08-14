import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle, Clock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { getAllRecords, updateRecord } from '@/services/firebase';
import { useAuth } from '@/context/AuthContext';
import type { VaultAccessRequest } from '@/types/vault';

const EXPIRY_OPTIONS = [
  { label: 'No expiry', value: '0' },
  { label: '24 hours', value: `${24 * 60 * 60 * 1000}` },
  { label: '7 days', value: `${7 * 24 * 60 * 60 * 1000}` },
  { label: '30 days', value: `${30 * 24 * 60 * 60 * 1000}` },
];

export default function Approvals() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<VaultAccessRequest[]>([]);
  const [decision, setDecision] = useState<{ req: VaultAccessRequest; action: 'approved' | 'denied' } | null>(null);
  const [note, setNote] = useState('');
  const [expiry, setExpiry] = useState('0');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);
  const load = async () => setRequests((await getAllRecords('vault/accessRequests')) as VaultAccessRequest[]);

  const pending = requests.filter((r) => r.status === 'pending').sort((a, b) => a.requestedAt - b.requestedAt);
  const decided = requests.filter((r) => r.status !== 'pending').sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0)).slice(0, 20);

  const openDecision = (req: VaultAccessRequest, action: 'approved' | 'denied') => {
    setDecision({ req, action });
    setNote('');
    setExpiry('0');
  };

  const confirmDecision = async () => {
    if (!decision || !user) return;
    setSaving(true);
    try {
      const expiresAt = decision.action === 'approved' && expiry !== '0' ? Date.now() + Number(expiry) : undefined;
      await updateRecord('vault/accessRequests', decision.req.id, {
        status: decision.action,
        decidedBy: user.username,
        decidedByName: user.name,
        decidedAt: Date.now(),
        decisionNote: note || undefined,
        expiresAt,
      });
      toast.success(decision.action === 'approved' ? 'Access granted' : 'Access denied');
      setDecision(null);
      load();
    } catch {
      toast.error('Failed to record decision');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold">Pending Requests ({pending.length})</h3>
          </div>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nothing waiting on you right now.</p>
          ) : (
            <div className="space-y-2">
              {pending.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 border rounded-lg px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.documentTitle}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.requestedByName} ({r.requestedByRole}) · {new Date(r.requestedAt).toLocaleString()}
                      {r.reason ? ` — "${r.reason}"` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600 hover:text-red-700" onClick={() => openDecision(r, 'denied')}>
                      <XCircle className="h-3.5 w-3.5 mr-1" />Deny
                    </Button>
                    <Button size="sm" className="h-7 px-2 text-xs" onClick={() => openDecision(r, 'approved')}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Approve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Recent Decisions</h3>
          </div>
          {decided.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No decisions recorded yet.</p>
          ) : (
            <div className="space-y-0">
              {decided.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5 border-b last:border-0">
                  <div className="min-w-0">
                    <span className="text-sm font-medium">{r.documentTitle}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {r.requestedByName} · by {r.decidedByName}
                      {r.expiresAt ? ` · expires ${new Date(r.expiresAt).toLocaleDateString()}` : ''}
                    </span>
                  </div>
                  <StatusBadge status={r.status} tone={r.status === 'denied' ? 'red' : undefined} className="text-[10px]" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!decision} onOpenChange={(v) => !v && setDecision(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{decision?.action === 'approved' ? 'Grant access' : 'Deny access'} — {decision?.req.documentTitle}</DialogTitle>
          </DialogHeader>
          {decision?.action === 'approved' && (
            <div>
              <Label className="text-xs">Access expires</Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EXPIRY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Note (optional)</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={decision?.action === 'denied' ? 'Reason for denial' : 'Any conditions...'} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>Cancel</Button>
            <Button onClick={confirmDecision} disabled={saving}>{saving ? 'Saving...' : 'Confirm'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
