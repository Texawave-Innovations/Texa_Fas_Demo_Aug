import { useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ShieldCheck, RefreshCw, LogIn, LogOut, ShieldAlert, Pencil, Plus, Trash2,
  ArrowUpCircle, ArrowDownCircle, PackagePlus, KeyRound,
} from 'lucide-react';
import { getAllRecords } from '@/services/firebase';
import type { AuditEntry, AuditAction } from '@/types/auditTrail';
import { format } from 'date-fns';

const ACTION_META: Record<AuditAction, { label: string; icon: React.ElementType; className: string }> = {
  create:            { label: 'Create',            icon: Plus,        className: 'bg-green-100 text-green-800 border-green-200' },
  update:            { label: 'Update',             icon: Pencil,      className: 'bg-blue-100 text-blue-800 border-blue-200' },
  delete:            { label: 'Delete',             icon: Trash2,      className: 'bg-red-100 text-red-800 border-red-200' },
  login:             { label: 'Login',               icon: LogIn,       className: 'bg-teal-100 text-teal-800 border-teal-200' },
  login_failed:      { label: 'Login Failed',       icon: ShieldAlert, className: 'bg-orange-100 text-orange-800 border-orange-200' },
  logout:            { label: 'Logout',              icon: LogOut,      className: 'bg-slate-100 text-slate-800 border-slate-200' },
  payment_made:      { label: 'Payment Made',       icon: ArrowUpCircle,   className: 'bg-rose-100 text-rose-800 border-rose-200' },
  payment_received:  { label: 'Payment Received',   icon: ArrowDownCircle, className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  stock_added:       { label: 'Stock Added',        icon: PackagePlus, className: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  permission_change: { label: 'Permission Change',  icon: KeyRound,    className: 'bg-purple-100 text-purple-800 border-purple-200' },
};

const moduleLabel = (entityPath: string) => {
  if (entityPath === 'auth') return 'Authentication';
  return entityPath.split('/')[0];
};

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleFilter, setModuleFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await getAllRecords('auditTrail/entries') as AuditEntry[];
      data.sort((a, b) => b.at - a.at);
      setEntries(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const modules = useMemo(
    () => Array.from(new Set(entries.map((e) => moduleLabel(e.entityPath)))).sort(),
    [entries],
  );
  const users = useMemo(
    () => Array.from(new Set(entries.map((e) => e.byUser))).sort(),
    [entries],
  );

  const filtered = useMemo(() => entries.filter((e) => {
    if (moduleFilter !== 'all' && moduleLabel(e.entityPath) !== moduleFilter) return false;
    if (actionFilter !== 'all' && e.action !== actionFilter) return false;
    if (userFilter !== 'all' && e.byUser !== userFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const haystack = `${e.entityPath} ${e.recordId ?? ''} ${e.byUserName} ${e.byUser} ${e.details ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }), [entries, moduleFilter, actionFilter, userFilter, search]);

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-blue-600" />
              Audit Trail &amp; Activity Log
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              System-wide, append-only record of logins, record changes, and permission edits.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total entries</p>
            <p className="text-2xl font-bold">{entries.length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Logins recorded</p>
            <p className="text-2xl font-bold">{entries.filter((e) => e.action === 'login').length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Failed logins</p>
            <p className="text-2xl font-bold text-orange-600">{entries.filter((e) => e.action === 'login_failed').length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Record changes</p>
            <p className="text-2xl font-bold">{entries.filter((e) => ['create', 'update', 'delete'].includes(e.action)).length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Payments made</p>
            <p className="text-2xl font-bold text-rose-600">{entries.filter((e) => e.action === 'payment_made').length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Payments received</p>
            <p className="text-2xl font-bold text-emerald-600">{entries.filter((e) => e.action === 'payment_received').length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Stock additions</p>
            <p className="text-2xl font-bold text-indigo-600">{entries.filter((e) => e.action === 'stock_added').length}</p>
          </CardContent></Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Module" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modules</SelectItem>
                {modules.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Action" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {Object.entries(ACTION_META).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>{meta.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="User" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {users.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>

            <Input
              placeholder="Search record id, user, details…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-muted-foreground py-8">Loading audit log…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-muted-foreground py-8">No matching activity found.</TableCell></TableRow>
                ) : filtered.map((e) => {
                  const meta = ACTION_META[e.action];
                  const Icon = meta?.icon ?? Pencil;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-left font-mono text-xs">
                        {format(new Date(e.at), 'dd MMM yyyy, HH:mm:ss')}
                      </TableCell>
                      <TableCell className="text-left">
                        <div className="font-medium">{e.byUserName}</div>
                        <div className="text-xs text-muted-foreground capitalize">{e.byUserRole}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={meta?.className}>
                          <Icon className="h-3 w-3 mr-1" />
                          {meta?.label ?? e.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize text-left">{moduleLabel(e.entityPath)}</TableCell>
                      <TableCell className="text-left font-mono text-xs text-muted-foreground">{e.recordId ?? '—'}</TableCell>
                      <TableCell className="text-left text-xs text-muted-foreground max-w-xs truncate" title={e.details}>
                        {e.details ?? '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
