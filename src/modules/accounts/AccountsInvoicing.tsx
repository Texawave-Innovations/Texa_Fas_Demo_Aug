import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, ExternalLink, FileText } from 'lucide-react';
import { getAllRecords } from '@/services/firebase';
import { useOrgSettings } from '@/context/OrgSettingsContext';
import { formatCurrency } from '@/lib/countryConfig';
import { format } from 'date-fns';

// Read-only financial view of Sales' invoices — the Accounts module reports
// on the same sales/invoices data rather than duplicating invoice creation,
// which stays owned by the Sales module.
export default function AccountsInvoicing() {
  const { country } = useOrgSettings();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getAllRecords('sales/invoices');
        setInvoices((data as any[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();
    return (
      (inv.invoiceNumber || '').toLowerCase().includes(q) ||
      (inv.customerName || '').toLowerCase().includes(q)
    );
  });

  const totalBilled = filtered.reduce((s, i) => s + (i.grandTotal || 0), 0);
  const totalOutstanding = filtered
    .filter((i) => i.status !== 'cancelled' && i.paymentStatus !== 'Paid')
    .reduce((s, i) => s + ((i.grandTotal || 0) - (i.paidAmount || 0)), 0);

  const statusBadge = (inv: any) => {
    if (inv.status === 'cancelled') return <StatusBadge status="Cancelled" />;
    if (inv.paymentStatus === 'Paid') return <StatusBadge status="Paid" />;
    if (inv.paymentStatus === 'Partial') return <StatusBadge status="Partial" />;
    return <StatusBadge status="Unpaid" tone="slate" />;
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="pt-5 pb-4">
          <p className="text-xs text-muted-foreground">Total Invoices</p>
          <p className="text-2xl font-bold">{filtered.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 pb-4">
          <p className="text-xs text-muted-foreground">Total Billed</p>
          <p className="text-2xl font-bold">{formatCurrency(totalBilled, country)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 pb-4">
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalOutstanding, country)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Sales Invoices
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search invoice or customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs w-56"
              />
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/sales/invoices/create">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                New Invoice (Sales)
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading invoices...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No invoices found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono font-semibold">{inv.invoiceNumber}</TableCell>
                      <TableCell>
                        {(() => { try { return format(new Date(inv.invoiceDate), 'dd-MM-yyyy'); } catch { return '—'; } })()}
                      </TableCell>
                      <TableCell>{inv.customerName || '—'}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(inv.grandTotal || 0, country)}</TableCell>
                      <TableCell className="text-orange-600 font-medium">
                        {inv.status === 'cancelled' || inv.paymentStatus === 'Paid'
                          ? '—'
                          : formatCurrency((inv.grandTotal || 0) - (inv.paidAmount || 0), country)}
                      </TableCell>
                      <TableCell>{statusBadge(inv)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
