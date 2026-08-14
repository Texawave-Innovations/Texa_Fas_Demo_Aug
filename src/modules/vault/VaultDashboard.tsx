import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Lock, ShieldAlert, Clock, FolderLock } from 'lucide-react';
import { database } from '@/services/firebase';
import { ref, onValue, off } from 'firebase/database';
import { useAuth } from '@/context/AuthContext';
import type { VaultDocument, VaultAccessRequest } from '@/types/vault';
import { useVaultAccessSettings, canSeeClassification, isApprover } from './vaultAccess';

export default function VaultDashboard() {
  const { user } = useAuth();
  const { settings } = useVaultAccessSettings();
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [requests, setRequests] = useState<VaultAccessRequest[]>([]);

  useEffect(() => {
    const dRef = ref(database, 'vault/documents');
    const rRef = ref(database, 'vault/accessRequests');
    const u1 = onValue(dRef, (snap) => {
      const data = snap.val() || {};
      setDocuments(Object.keys(data).map((k) => ({ ...data[k], id: k })));
    });
    const u2 = onValue(rRef, (snap) => {
      const data = snap.val() || {};
      setRequests(Object.keys(data).map((k) => ({ ...data[k], id: k })));
    });
    return () => { off(dRef, 'value', u1); off(rRef, 'value', u2); };
  }, []);

  if (!user) return null;

  const visible = documents.filter((d) => canSeeClassification(d, user, settings));
  const restricted = visible.filter((d) => d.sensitivity === 'restricted');
  const defence = visible.filter((d) => d.classification === 'defence-unit');
  const pending = requests.filter((r) => r.status === 'pending');
  const approver = isApprover(user, settings);

  const stats = [
    { label: 'Documents', value: visible.length, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Restricted (approval required)', value: restricted.length, icon: Lock, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Defence Division-classified', value: defence.length, icon: ShieldAlert, color: 'text-purple-600', bg: 'bg-purple-50' },
    ...(approver ? [{ label: 'Pending your approval', value: pending.length, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' }] : []),
  ];

  const byCategory = visible.reduce<Record<string, number>>((acc, d) => {
    acc[d.category] = (acc[d.category] || 0) + 1;
    return acc;
  }, {});
  const recent = [...visible].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)).slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-lg ${s.bg}`}>
                    <Icon className={`h-5 w-5 ${s.color}`} />
                  </div>
                  <div>
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">By Category</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.keys(byCategory).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No documents yet.</p>
            ) : (
              Object.entries(byCategory).map(([cat, count]) => (
                <div key={cat} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                  <span className="flex items-center gap-2"><FolderLock className="h-3.5 w-3.5 text-muted-foreground" />{cat}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recently Updated</CardTitle></CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nothing uploaded yet.</p>
            ) : (
              <div className="space-y-0">
                {recent.map((d) => (
                  <div key={d.id} className="flex items-center justify-between py-2.5 border-b last:border-0">
                    <div>
                      <span className="text-sm font-medium">{d.title}</span>
                      <span className="text-xs text-muted-foreground ml-2">{d.category} · v{d.currentVersion}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(d.updatedAt || d.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
