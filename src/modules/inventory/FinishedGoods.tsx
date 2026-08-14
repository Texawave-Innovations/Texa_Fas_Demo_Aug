import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Search, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { database } from '@/services/firebase';
import { ref, onValue, off, update } from 'firebase/database';

interface FGItem {
  id: string;
  productCode: string;
  productName: string;
  quantity: number;
  uom: string;
  qc: 'ok' | 'notOk' | 'hold';
  soNumber?: string;
  woKey?: string;
  dispatchStatus?: 'sent';
  invoiceStatus?: 'sent';
  createdAt: number;
}

const SAMPLE_FG: FGItem[] = [
  { id: 's1', productCode: 'RSA-001', productName: 'Rubber Seal Type A',       quantity: 250, uom: 'Nos', qc: 'ok',  soNumber: 'SO-2026-0045', createdAt: Date.now() - 86400000 },
  { id: 's2', productCode: 'ORB-002', productName: 'O-Ring Type B (50mm)',      quantity: 180, uom: 'Nos', qc: 'ok',  soNumber: 'SO-2026-0046', createdAt: Date.now() - 172800000 },
  { id: 's3', productCode: 'GKC-003', productName: 'Gasket Type C (Flat)',      quantity: 45,  uom: 'Nos', qc: 'ok',  soNumber: 'SO-2026-0041', createdAt: Date.now() - 259200000 },
  { id: 's4', productCode: 'RSD-004', productName: 'Rubber Sheet D (2mm)',      quantity: 320, uom: 'kg',  qc: 'ok',  soNumber: 'SO-2026-0043', createdAt: Date.now() - 345600000 },
  { id: 's5', productCode: 'SSE-005', productName: 'Sealing Strip E (EPDM)',    quantity: 8,   uom: 'mtr', qc: 'ok',  soNumber: 'SO-2026-0040', createdAt: Date.now() - 432000000 },
  { id: 's6', productCode: 'MBF-006', productName: 'Moulded Bush F (Nitrile)',  quantity: 3,   uom: 'Nos', qc: 'ok',  soNumber: 'SO-2026-0038', createdAt: Date.now() - 518400000 },
  { id: 's7', productCode: 'FLG-007', productName: 'Flap Gasket G',             quantity: 95,  uom: 'Nos', qc: 'hold', soNumber: 'SO-2026-0039', createdAt: Date.now() - 604800000 },
];

export default function FinishedGoods() {
  const navigate = useNavigate();
  const [fgStock,          setFgStock]          = useState<FGItem[]>(SAMPLE_FG);
  const [search,           setSearch]           = useState('');
  const [movingToInvoice,  setMovingToInvoice]  = useState<string | null>(null);

  useEffect(() => {
    const fgRef = ref(database, 'stores/fg');
    const u = onValue(fgRef, (snap) => {
      const data = snap.val();
      if (data) {
        const list: FGItem[] = Object.keys(data)
          .map(key => ({
            id:             key,
            productCode:    data[key].productCode    || '',
            productName:    data[key].productName    || '',
            quantity:       Number(data[key].quantity) || 0,
            uom:            data[key].uom            || 'Nos',
            qc:             data[key].qc             || 'hold',
            soNumber:       data[key].soNumber,
            woKey:          data[key].woKey,
            dispatchStatus: data[key].dispatchStatus,
            invoiceStatus:  data[key].invoiceStatus,
            createdAt:      data[key].createdAt      || Date.now(),
          }))
          .filter(item => item.productCode || item.productName)
          .sort((a, b) => b.createdAt - a.createdAt);
        if (list.length > 0) setFgStock(list);
      }
    });
    return () => off(fgRef, 'value', u);
  }, []);

  const handleMoveToInvoice = async (item: FGItem) => {
    setMovingToInvoice(item.id);
    try {
      await update(ref(database, `stores/fg/${item.id}`), { invoiceStatus: 'sent' });
      toast.success(`${item.productName} moved to Invoices`);
      navigate('/sales/invoices/create', {
        state: {
          fgItem: {
            productCode: item.productCode,
            productName:  item.productName,
            quantity:     item.quantity,
            uom:          item.uom,
            soNumber:     item.soNumber || '',
          },
        },
      });
    } catch {
      toast.error('Failed to move to invoice');
      setMovingToInvoice(null);
    }
  };

  const filtered = fgStock.filter(i =>
    (i.productCode || '').toLowerCase().includes(search.toLowerCase()) ||
    (i.productName || '').toLowerCase().includes(search.toLowerCase()) ||
    (i.soNumber    || '').toLowerCase().includes(search.toLowerCase())
  );

  const ok       = fgStock.filter(i => i.qc === 'ok');
  const hold     = fgStock.filter(i => i.qc === 'hold');
  const lowStock = ok.filter(i => i.quantity <= 10);
  const critical = ok.filter(i => i.quantity <= 3);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-green-600">{ok.length}</div>
          <p className="text-xs text-muted-foreground mt-1">QC Passed SKUs</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-yellow-600">{hold.length}</div>
          <p className="text-xs text-muted-foreground mt-1">On Hold</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-orange-600">{lowStock.length}</div>
          <p className="text-xs text-muted-foreground mt-1">Low Stock (&le;10)</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-red-600">{critical.length}</div>
          <p className="text-xs text-muted-foreground mt-1">Critical (&le;3)</p>
        </CardContent></Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle>Finished Goods Stock</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search product / SO..."
                className="pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No results found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Product Code</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>SO Number</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-center">QC Status</TableHead>
                    <TableHead className="text-center">Stock Status</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item, idx) => {
                    const isCritical = item.qc === 'ok' && item.quantity <= 3;
                    const isLow      = item.qc === 'ok' && item.quantity <= 10 && !isCritical;
                    return (
                      <TableRow
                        key={item.id}
                        className={isCritical ? 'border-l-4 border-l-red-500 bg-red-50/40' : isLow ? 'bg-yellow-50/40' : ''}
                      >
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-mono font-bold text-green-700">{item.productCode}</TableCell>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{item.soNumber || '—'}</TableCell>
                        <TableCell className={`text-right text-lg font-bold ${isCritical ? 'text-red-600' : isLow ? 'text-orange-600' : 'text-green-600'}`}>
                          {(item.quantity ?? 0).toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell>{item.uom}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={item.qc === 'ok' ? 'QC Passed' : 'On Hold'} />
                        </TableCell>
                        <TableCell className="text-center">
                          {isCritical
                            ? <StatusBadge status="Critical" tone="red" />
                            : isLow
                            ? <StatusBadge status="Low" tone="orange" />
                            : <StatusBadge status="Ready" tone="green" />
                          }
                        </TableCell>
                        <TableCell className="text-center">
                          {item.invoiceStatus === 'sent' ? (
                            <StatusBadge status="Moved to Invoice" tone="green" />
                          ) : item.qc === 'ok' ? (
                            <Button
                              size="sm"
                              disabled={movingToInvoice === item.id}
                              className="h-7 px-3 text-xs bg-green-700 hover:bg-green-800 text-white gap-1.5"
                              onClick={() => handleMoveToInvoice(item)}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              {movingToInvoice === item.id ? '…' : 'Move to Invoice'}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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
    </div>
  );
}
