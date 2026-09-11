import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Search, ExternalLink, FileText, ArrowUpRight, ShieldAlert, Eye, Calendar,
  CheckCircle2, Clock, AlertTriangle, Info,
} from 'lucide-react';
import { getAllRecords } from '@/services/firebase';
import { useOrgSettings } from '@/context/OrgSettingsContext';
import { formatCurrency } from '@/lib/countryConfig';
import { safeSub, safeAdd, calculateOverdueDays } from '@/services/financeCalculations';
import { format } from 'date-fns';

export default function AccountsInvoicing() {
  const { country } = useOrgSettings();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid' | 'overdue'>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const data = await getAllRecords('sales/invoices');
      setInvoices((data as any[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    } finally {
      setLoading(false);
    }
  };

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const activeInvoices = invoices.filter((i) => i.status !== 'cancelled');

  const totalBilled = activeInvoices.reduce((s, i) => safeAdd(s, i.grandTotal || 0), 0);
  const totalCollected = activeInvoices.reduce((s, i) => safeAdd(s, i.paidAmount || 0), 0);
  const totalOutstanding = activeInvoices
    .filter((i) => i.paymentStatus !== 'Paid')
    .reduce((s, i) => safeAdd(s, safeSub(i.grandTotal || 0, i.paidAmount || 0)), 0);

  const overdueInvoices = activeInvoices.filter((i) => {
    const rem = safeSub(i.grandTotal || 0, i.paidAmount || 0);
    return rem > 0.001 && i.dueDate && i.dueDate < todayStr;
  });
  const totalOverdue = overdueInvoices.reduce((s, i) => safeAdd(s, safeSub(i.grandTotal || 0, i.paidAmount || 0)), 0);

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();
    const matchesSearch =
      (inv.invoiceNumber || '').toLowerCase().includes(q) ||
      (inv.customerName || '').toLowerCase().includes(q);

    if (!matchesSearch) return false;

    const rem = safeSub(inv.grandTotal || 0, inv.paidAmount || 0);
    const isOverdue = rem > 0.001 && inv.dueDate && inv.dueDate < todayStr && inv.status !== 'cancelled';

    if (statusFilter === 'unpaid') return rem > 0.001 && (inv.paymentStatus === 'Unpaid' || !inv.paymentStatus) && inv.status !== 'cancelled';
    if (statusFilter === 'partial') return inv.paymentStatus === 'Partial' && inv.status !== 'cancelled';
    if (statusFilter === 'paid') return inv.paymentStatus === 'Paid' && inv.status !== 'cancelled';
    if (statusFilter === 'overdue') return isOverdue;

    return true;
  });

  const statusBadge = (inv: any) => {
    if (inv.status === 'cancelled') return <StatusBadge status="Cancelled" tone="slate" />;
    if (inv.paymentStatus === 'Paid') return <StatusBadge status="Paid" tone="green" />;
    if (inv.paymentStatus === 'Partial') return <StatusBadge status="Partial" tone="amber" />;
    return <StatusBadge status="Unpaid" tone="red" />;
  };

  return (
    <div className="space-y-5">
      {/* Informational Banner on Sales Ownership */}
      <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg flex items-start justify-between gap-3 text-xs text-blue-950">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-blue-900">Customer Collections Ownership: </span>
            Customer sales invoices and collections are owned by the <strong>Sales module</strong>.
            Accounts provides read-only financial visibility, AR ageing, and statements without creating competing collection records.
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="h-7 text-xs shrink-0 bg-white hover:bg-blue-50 border-blue-300">
          <Link to="/sales/invoices">
            <ExternalLink className="h-3 w-3 mr-1" />
            Go to Sales Invoices
          </Link>
        </Button>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground flex items-center justify-between">
              Total Billed
              <FileText className="h-4 w-4 text-primary" />
            </p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totalBilled, country)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{activeInvoices.length} active invoices</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground flex items-center justify-between">
              Total Collected
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </p>
            <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalCollected, country)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0}% recovery rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground flex items-center justify-between">
              Outstanding (AR)
              <Clock className="h-4 w-4 text-orange-600" />
            </p>
            <p className="text-2xl font-bold text-orange-600 mt-1">{formatCurrency(totalOutstanding, country)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {activeInvoices.filter((i) => i.paymentStatus !== 'Paid').length} invoices pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground flex items-center justify-between">
              Overdue Receivables
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </p>
            <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totalOverdue, country)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{overdueInvoices.length} invoices past due date</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Customer Invoices &amp; Collections
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review invoice settlement statuses, ageing, and link directly to Sales collection actions.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg text-xs">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-colors ${statusFilter === 'all' ? 'bg-white font-semibold text-primary shadow-xs' : 'text-muted-foreground'}`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('unpaid')}
                className={`px-2.5 py-1 rounded-md transition-colors ${statusFilter === 'unpaid' ? 'bg-white font-semibold text-primary shadow-xs' : 'text-muted-foreground'}`}
              >
                Unpaid
              </button>
              <button
                onClick={() => setStatusFilter('partial')}
                className={`px-2.5 py-1 rounded-md transition-colors ${statusFilter === 'partial' ? 'bg-white font-semibold text-primary shadow-xs' : 'text-muted-foreground'}`}
              >
                Partial
              </button>
              <button
                onClick={() => setStatusFilter('overdue')}
                className={`px-2.5 py-1 rounded-md transition-colors ${statusFilter === 'overdue' ? 'bg-white font-semibold text-red-600 shadow-xs' : 'text-muted-foreground'}`}
              >
                Overdue
              </button>
              <button
                onClick={() => setStatusFilter('paid')}
                className={`px-2.5 py-1 rounded-md transition-colors ${statusFilter === 'paid' ? 'bg-white font-semibold text-green-600 shadow-xs' : 'text-muted-foreground'}`}
              >
                Paid
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search invoice or customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs w-52"
              />
            </div>

            <Button asChild size="sm" variant="outline" className="h-8 text-xs">
              <Link to="/sales/invoices/create">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                New Invoice
              </Link>
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading invoices...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No invoices found matching criteria.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Billed Amount</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Ageing</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((inv) => {
                    const grandTotal = Number(inv.grandTotal) || 0;
                    const paid = Number(inv.paidAmount) || 0;
                    const outstanding = Math.max(0, safeSub(grandTotal, paid));
                    const { overdueDays, bucket } = calculateOverdueDays(inv.dueDate, todayStr);

                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono font-semibold">
                          <button
                            onClick={() => setSelectedInvoice(inv)}
                            className="text-primary hover:underline"
                          >
                            {inv.invoiceNumber}
                          </button>
                        </TableCell>
                        <TableCell>
                          {(() => { try { return format(new Date(inv.invoiceDate), 'dd-MM-yyyy'); } catch { return '—'; } })()}
                        </TableCell>
                        <TableCell>
                          {inv.dueDate ? (
                            (() => { try { return format(new Date(inv.dueDate), 'dd-MM-yyyy'); } catch { return inv.dueDate; } })()
                          ) : (
                            <span className="text-muted-foreground italic text-[11px]">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium max-w-[180px] truncate" title={inv.customerName}>
                          {inv.customerName || '—'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(grandTotal, inv.currency || country)}
                        </TableCell>
                        <TableCell className="text-right text-green-600 font-medium">
                          {paid > 0 ? formatCurrency(paid, inv.currency || country) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {inv.status === 'cancelled' || inv.paymentStatus === 'Paid' ? (
                            <span className="text-muted-foreground font-normal">0.00</span>
                          ) : (
                            <span className="text-orange-600">{formatCurrency(outstanding, inv.currency || country)}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {inv.status === 'cancelled' || inv.paymentStatus === 'Paid' ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : bucket === 'current' ? (
                            <Badge variant="outline" className="text-[10px] text-green-700 bg-green-50 border-green-200">
                              Current
                            </Badge>
                          ) : bucket === 'no-due-date' ? (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              No Due Date
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-red-700 bg-red-50 border-red-200 font-medium">
                              {overdueDays}d overdue
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{statusBadge(inv)}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs px-2 text-primary hover:bg-primary/10"
                              onClick={() => setSelectedInvoice(inv)}
                              title="View Invoice & Receipt Summary"
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />View
                            </Button>
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                              title="Manage Collection in Sales"
                            >
                              <Link to={`/sales/invoices`}>
                                <ArrowUpRight className="h-3.5 w-3.5 mr-1" />Sales
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice Details & Receipt History Dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={(open) => { if (!open) setSelectedInvoice(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Customer Invoice &amp; Collection Details</span>
              {selectedInvoice && statusBadge(selectedInvoice)}
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (() => {
            const inv = selectedInvoice;
            const grandTotal = Number(inv.grandTotal) || 0;
            const paid = Number(inv.paidAmount) || 0;
            const outstanding = Math.max(0, safeSub(grandTotal, paid));

            return (
              <div className="space-y-4 py-2 text-xs">
                {/* Meta Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-muted/40 rounded-lg">
                  <div>
                    <span className="text-muted-foreground">Invoice No:</span>
                    <p className="font-mono font-bold text-sm">{inv.invoiceNumber}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Customer:</span>
                    <p className="font-medium text-sm truncate">{inv.customerName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Invoice Date:</span>
                    <p className="font-medium">{inv.invoiceDate || '—'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Due Date:</span>
                    <p className="font-medium">{inv.dueDate || '—'}</p>
                  </div>
                </div>

                {/* Line Items Table */}
                <div>
                  <h4 className="font-semibold text-xs text-foreground mb-1.5 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    Invoiced Line Items
                  </h4>
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Item / Description</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inv.lineItems?.map((li: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell>{li.description || li.partCode || 'Goods'}</TableCell>
                            <TableCell className="text-right">{li.invoicedQty || li.qty || 1}</TableCell>
                            <TableCell className="text-right">{formatCurrency(li.rate || 0, inv.currency || country)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(li.amount || li.total || 0, inv.currency || country)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Collection Status */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 border rounded-lg bg-muted/40">
                    <span className="text-muted-foreground">Total Invoiced</span>
                    <p className="text-base font-bold">{formatCurrency(grandTotal, inv.currency || country)}</p>
                  </div>
                  <div className="p-3 border rounded-lg bg-green-50/50">
                    <span className="text-muted-foreground">Total Collected</span>
                    <p className="text-base font-bold text-green-700">{formatCurrency(paid, inv.currency || country)}</p>
                  </div>
                  <div className="p-3 border rounded-lg bg-orange-50/50">
                    <span className="text-muted-foreground">Outstanding</span>
                    <p className="text-base font-bold text-orange-700">{formatCurrency(outstanding, inv.currency || country)}</p>
                  </div>
                </div>

                {/* Receipt History */}
                <div>
                  <h4 className="font-semibold text-xs text-foreground mb-1.5 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    Collection / Receipt History
                  </h4>
                  {paid > 0 ? (
                    <div className="p-3 bg-muted/30 border rounded-lg space-y-1">
                      <div className="flex justify-between font-medium">
                        <span>Recorded Receipt:</span>
                        <span className="text-green-700 font-bold">{formatCurrency(paid, inv.currency || country)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Payment status marked as: <strong className="text-foreground">{inv.paymentStatus || 'Paid'}</strong> in Sales order records.
                      </p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic text-[11px] py-2">No customer payment receipts recorded yet.</p>
                  )}
                </div>

                {/* Link to Sales for Collection Action */}
                <div className="flex items-center justify-between pt-3 border-t">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Info className="h-3.5 w-3.5 text-blue-600" />
                    Collections are updated in the Sales module.
                  </span>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/sales/invoices">
                        <ArrowUpRight className="h-3.5 w-3.5 mr-1" />Manage in Sales
                      </Link>
                    </Button>
                    <Button size="sm" onClick={() => setSelectedInvoice(null)}>
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
