import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Wallet, TrendingDown, Scale, TrendingUp, ArrowDownRight } from 'lucide-react';
import { toast } from 'sonner';
import { database } from '@/services/firebase';
import { ref, get, set } from 'firebase/database';
import { createRecord, updateRecord, deleteRecord, getAllRecords } from '@/services/firebase';
import type { AccountType, ChartOfAccount } from '@/types/accounts';

const TYPE_META: Record<AccountType, { icon: any; color: string; bg: string }> = {
  Asset:     { icon: Wallet,       color: 'text-blue-600',   bg: 'bg-blue-50' },
  Liability: { icon: ArrowDownRight, color: 'text-red-600',    bg: 'bg-red-50' },
  Equity:    { icon: Scale,        color: 'text-purple-600', bg: 'bg-purple-50' },
  Income:    { icon: TrendingUp,   color: 'text-green-600',  bg: 'bg-green-50' },
  Expense:   { icon: TrendingDown, color: 'text-orange-600', bg: 'bg-orange-50' },
};

const ACCOUNT_TYPES: AccountType[] = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];

const DEFAULT_ACCOUNTS: Array<Omit<ChartOfAccount, 'id' | 'createdAt'>> = [
  { code: '1000', name: 'Cash in Hand', type: 'Asset', subType: 'Current Asset', status: 'active', isSystem: true },
  { code: '1010', name: 'Bank Accounts', type: 'Asset', subType: 'Bank', status: 'active', isSystem: true },
  { code: '1200', name: 'Accounts Receivable', type: 'Asset', subType: 'Current Asset', status: 'active', isSystem: true },
  { code: '1400', name: 'Inventory', type: 'Asset', subType: 'Current Asset', status: 'active', isSystem: true },
  { code: '1500', name: 'Fixed Assets', type: 'Asset', subType: 'Fixed Asset', status: 'active', isSystem: true },
  { code: '2000', name: 'Accounts Payable', type: 'Liability', subType: 'Current Liability', status: 'active', isSystem: true },
  { code: '2100', name: 'Taxes Payable', type: 'Liability', subType: 'Current Liability', status: 'active', isSystem: true },
  { code: '2200', name: 'Accrued Expenses', type: 'Liability', subType: 'Current Liability', status: 'active', isSystem: true },
  { code: '3000', name: "Owner's Equity", type: 'Equity', subType: 'Equity', status: 'active', isSystem: true },
  { code: '3100', name: 'Retained Earnings', type: 'Equity', subType: 'Equity', status: 'active', isSystem: true },
  { code: '4000', name: 'Sales Revenue', type: 'Income', subType: 'Operating Income', status: 'active', isSystem: true },
  { code: '4100', name: 'Other Income', type: 'Income', subType: 'Other Income', status: 'active', isSystem: true },
  { code: '5000', name: 'Cost of Goods Sold', type: 'Expense', subType: 'Cost of Sales', status: 'active', isSystem: true },
  { code: '5100', name: 'Operating Expenses', type: 'Expense', subType: 'Operating Expense', status: 'active', isSystem: true },
  { code: '5200', name: 'Salaries & Wages', type: 'Expense', subType: 'Operating Expense', status: 'active', isSystem: true },
  { code: '5300', name: 'Rent Expense', type: 'Expense', subType: 'Operating Expense', status: 'active', isSystem: true },
  { code: '5400', name: 'Utilities', type: 'Expense', subType: 'Operating Expense', status: 'active', isSystem: true },
];

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', type: 'Asset' as AccountType, subType: '', openingBalance: '' });

  useEffect(() => {
    initAndLoad();
  }, []);

  const initAndLoad = async () => {
    const coaRef = ref(database, 'accounts/chartOfAccounts');
    const snap = await get(coaRef);
    if (!snap.exists()) {
      // Seed default COA on first visit — migrates the old flat FinanceMaster
      // lists into a proper ledger tree without deleting anything.
      const seeded: Record<string, any> = {};
      DEFAULT_ACCOUNTS.forEach((acc) => {
        const key = `acc_${acc.code}`;
        seeded[key] = { ...acc, id: key, createdAt: Date.now() };
      });
      await set(coaRef, seeded);
    }
    await loadAccounts();
  };

  const loadAccounts = async () => {
    try {
      const data = await getAllRecords('accounts/chartOfAccounts');
      setAccounts((data as ChartOfAccount[]).sort((a, b) => a.code.localeCompare(b.code)));
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (acc: ChartOfAccount) => {
    const next = acc.status === 'active' ? 'inactive' : 'active';
    await updateRecord('accounts/chartOfAccounts', acc.id, { status: next });
    toast.success(`${acc.name} marked ${next}`);
    loadAccounts();
  };

  const removeAccount = async (acc: ChartOfAccount) => {
    if (acc.isSystem) {
      toast.error('Default accounts cannot be deleted, only deactivated');
      return;
    }
    if (!confirm(`Delete account "${acc.name}"?`)) return;
    await deleteRecord('accounts/chartOfAccounts', acc.id);
    toast.success('Account deleted');
    loadAccounts();
  };

  const saveAccount = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('Code and name are required');
      return;
    }
    if (accounts.some((a) => a.code === form.code.trim())) {
      toast.error('Account code already exists');
      return;
    }
    try {
      await createRecord('accounts/chartOfAccounts', {
        code: form.code.trim(),
        name: form.name.trim(),
        type: form.type,
        subType: form.subType.trim() || form.type,
        status: 'active',
        isSystem: false,
        openingBalance: Number(form.openingBalance || 0),
      });
      toast.success('Account created');
      setDialogOpen(false);
      setForm({ code: '', name: '', type: 'Asset', subType: '', openingBalance: '' });
      loadAccounts();
    } catch {
      toast.error('Failed to create account');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {accounts.length} accounts across {ACCOUNT_TYPES.length} categories
        </p>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />Add Account
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading chart of accounts...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {ACCOUNT_TYPES.map((type) => {
            const meta = TYPE_META[type];
            const Icon = meta.icon;
            const list = accounts.filter((a) => a.type === type);
            return (
              <Card key={type}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <div className={`p-1.5 rounded-md ${meta.bg}`}>
                      <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                    </div>
                    {type}
                    <Badge variant="secondary" className="ml-auto text-[10px]">{list.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y max-h-[280px] overflow-y-auto">
                    {list.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 px-4">No accounts in this category.</p>
                    ) : (
                      list.map((acc) => (
                        <div key={acc.id} className={`flex items-center justify-between px-4 py-2.5 ${acc.status === 'inactive' ? 'opacity-50' : ''}`}>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-muted-foreground">{acc.code}</span>
                              <span className="text-sm font-medium truncate">{acc.name}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">{acc.subType}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Switch checked={acc.status === 'active'} onCheckedChange={() => toggleStatus(acc)} className="scale-75" />
                            {!acc.isSystem && (
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeAccount(acc)}>
                                <Trash2 className="h-3 w-3 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Ledger Account</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Account Code</Label>
                <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="e.g. 5500" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v: AccountType) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Account Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Marketing Expense" />
            </div>
            <div>
              <Label>Sub Type</Label>
              <Input value={form.subType} onChange={(e) => setForm((f) => ({ ...f, subType: e.target.value }))} placeholder="e.g. Operating Expense" />
            </div>
            <div>
              <Label>Opening Balance</Label>
              <Input type="number" value={form.openingBalance} onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))} placeholder="0.00" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveAccount}>Save Account</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
