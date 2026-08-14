import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Save, ShieldAlert, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { createRecord, updateRecord } from '@/services/firebase';
import { useVaultAccessSettings } from './vaultAccess';

const ROLE_OPTIONS = [
  { id: 'admin', label: 'Admin' },
  { id: 'sales', label: 'Sales' },
  { id: 'hr', label: 'HR' },
  { id: 'accountant', label: 'Accountant' },
  { id: 'manager', label: 'Manager' },
  { id: 'quality', label: 'Quality' },
  { id: 'production', label: 'Production' },
  { id: 'maintenance', label: 'Maintenance' },
];

export default function AccessControl() {
  const { settings, setSettings, loaded } = useVaultAccessSettings();
  const [saving, setSaving] = useState(false);

  const toggle = (list: 'defenceRoles' | 'approverRoles', role: string) => {
    setSettings((prev) => {
      const current = prev[list];
      const has = current.includes(role);
      return { ...prev, [list]: has ? current.filter((r) => r !== role) : [...current, role] };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...settings, updatedAt: Date.now() };
      try {
        await updateRecord('settings', 'vaultAccess', payload);
      } catch {
        await createRecord('settings', payload);
      }
      toast.success('Vault access control saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-purple-600" />Who can see Defence Division documents
          </CardTitle>
          <p className="text-xs text-muted-foreground">Roles outside this list never see Defence Division-classified documents in the Vault — filtered out of the list entirely, not just hidden by a collapsed section.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {ROLE_OPTIONS.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-1">
              <span className="text-sm">{r.label}</span>
              <Switch checked={settings.defenceRoles.includes(r.id)} onCheckedChange={() => toggle('defenceRoles', r.id)} disabled={r.id === 'admin'} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-green-600" />Who approves restricted-document access requests
          </CardTitle>
          <p className="text-xs text-muted-foreground">The "main CMMS person" gate — these roles see the Approvals tab and can grant, deny, or time-box access to restricted drawings.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {ROLE_OPTIONS.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-1">
              <span className="text-sm">{r.label}</span>
              <Switch checked={settings.approverRoles.includes(r.id)} onCheckedChange={() => toggle('approverRoles', r.id)} disabled={r.id === 'admin'} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1.5" />{saving ? 'Saving...' : 'Save Access Control'}</Button>
    </div>
  );
}
