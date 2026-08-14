import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, StickyNote, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getAllRecords, createRecord } from '@/services/firebase';
import { useOrgSettings } from '@/context/OrgSettingsContext';
import { COUNTRY_LIST, getCountryConfig } from '@/lib/countryConfig';
import type { CurrencyAdjustment } from '@/types/accounts';

export default function CurrencyAdjustments() {
  const { country, countryConfig } = useOrgSettings();
  const location = useLocation();
  const preset = location.state as { presetCurrency?: string; presetRate?: number } | null;
  const [adjustments, setAdjustments] = useState<CurrencyAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(!!preset?.presetCurrency);

  const otherCurrencies = Array.from(new Set(COUNTRY_LIST.map((c) => c.currencyCode))).filter((c) => c !== countryConfig.currencyCode);

  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    currency: preset?.presetCurrency || otherCurrencies[0] || 'USD',
    exchangeRate: preset?.presetRate != null ? String(preset.presetRate) : '',
    gainOrLoss: '',
    notes: preset?.presetCurrency ? 'Prefilled from Dashboard location/currency indicator' : '',
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const data = await getAllRecords('accounts/currencyAdjustments');
      setAdjustments((data as CurrencyAdjustment[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!form.exchangeRate) {
      toast.error('Enter an exchange rate');
      return;
    }
    try {
      await createRecord('accounts/currencyAdjustments', {
        date: form.date,
        currency: form.currency,
        exchangeRate: Number(form.exchangeRate),
        gainOrLoss: Number(form.gainOrLoss || 0),
        notes: form.notes || undefined,
      });
      toast.success('Adjustment recorded');
      setDialogOpen(false);
      setForm({ date: format(new Date(), 'yyyy-MM-dd'), currency: otherCurrencies[0] || 'USD', exchangeRate: '', gainOrLoss: '', notes: '' });
      load();
    } catch {
      toast.error('Failed to record adjustment');
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between p-4 border-b">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-primary" />
                Base Currency Adjustments
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Base currency: {countryConfig.currencyCode} ({countryConfig.currencySymbol})
              </p>
            </div>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />Make an Adjustment
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">Loading adjustments...</p>
          ) : adjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No base currency adjustments recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Exchange Rate</TableHead>
                    <TableHead>Gain or Loss</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{(() => { try { return format(new Date(a.date), 'dd/MM/yyyy'); } catch { return a.date; } })()}</TableCell>
                      <TableCell className="font-medium">{a.currency}</TableCell>
                      <TableCell>{a.exchangeRate}</TableCell>
                      <TableCell className={a.gainOrLoss >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {a.gainOrLoss >= 0 ? '+' : ''}{a.gainOrLoss.toLocaleString(countryConfig.locale, { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        {a.notes ? (
                          <span title={a.notes} className="inline-flex">
                            <StickyNote className="h-4 w-4 text-muted-foreground" />
                          </span>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Make a Base Currency Adjustment</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {otherCurrencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Exchange Rate</Label>
                <Input type="number" step="0.0001" value={form.exchangeRate} onChange={(e) => setForm((f) => ({ ...f, exchangeRate: e.target.value }))} placeholder="e.g. 83.25" />
              </div>
              <div>
                <Label>Gain / Loss ({countryConfig.currencySymbol})</Label>
                <Input type="number" value={form.gainOrLoss} onChange={(e) => setForm((f) => ({ ...f, gainOrLoss: e.target.value }))} placeholder="e.g. -1250" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save Adjustment</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
