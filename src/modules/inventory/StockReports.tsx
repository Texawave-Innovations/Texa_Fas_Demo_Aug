import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { BarChart3, Download, TrendingUp, TrendingDown } from 'lucide-react';

interface StockSummaryRow {
  category: string;
  itemCode: string;
  itemName: string;
  openingQty: number;
  received: number;
  issued: number;
  closingQty: number;
  unit: string;
  value: number;
}

interface MovementRow {
  date: string;
  type: 'GRN' | 'Issue' | 'FG In' | 'Transfer';
  itemCode: string;
  itemName: string;
  qty: number;
  unit: string;
  from: string;
  to: string;
  reference: string;
}

const STOCK_SUMMARY: StockSummaryRow[] = [
  { category: 'Raw Material', itemCode: 'NR-GRADE-1',       itemName: 'Natural Rubber Grade 1',     openingQty: 800,  received: 500,  issued: 100, closingQty: 1200, unit: 'kg',  value: 240000 },
  { category: 'Raw Material', itemCode: 'SBR-1502',          itemName: 'SBR Compound 1502',           openingQty: 670,  received: 300,  issued: 120, closingQty: 850,  unit: 'kg',  value: 127500 },
  { category: 'Raw Material', itemCode: 'CARBON-BLACK-N330', itemName: 'Carbon Black N330',           openingQty: 400,  received: 200,  issued: 100, closingQty: 500,  unit: 'kg',  value: 50000  },
  { category: 'Raw Material', itemCode: 'ZINC-OXIDE-99',     itemName: 'Zinc Oxide 99%',              openingQty: 150,  received: 100,  issued: 50,  closingQty: 200,  unit: 'kg',  value: 30000  },
  { category: 'Raw Material', itemCode: 'SULPHUR-POWDER',    itemName: 'Sulphur Powder',              openingQty: 100,  received: 150,  issued: 100, closingQty: 150,  unit: 'kg',  value: 9000   },
  { category: 'WIP',          itemCode: 'RSA-001',           itemName: 'Rubber Seal Type A',          openingQty: 0,    received: 200,  issued: 100, closingQty: 100,  unit: 'Nos', value: 25000  },
  { category: 'WIP',          itemCode: 'ORB-002',           itemName: 'O-Ring Type B (50mm)',        openingQty: 0,    received: 300,  issued: 100, closingQty: 200,  unit: 'Nos', value: 30000  },
  { category: 'Finished Good', itemCode: 'RSA-001',          itemName: 'Rubber Seal Type A',          openingQty: 0,    received: 250,  issued: 0,   closingQty: 250,  unit: 'Nos', value: 87500  },
  { category: 'Finished Good', itemCode: 'ORB-002',          itemName: 'O-Ring Type B (50mm)',        openingQty: 0,    received: 180,  issued: 0,   closingQty: 180,  unit: 'Nos', value: 54000  },
  { category: 'Finished Good', itemCode: 'GKC-003',          itemName: 'Gasket Type C (Flat)',        openingQty: 0,    received: 45,   issued: 0,   closingQty: 45,   unit: 'Nos', value: 13500  },
];

const MOVEMENT_LOG: MovementRow[] = [
  { date: '2026-06-05', type: 'GRN',      itemCode: 'NR-GRADE-1',       itemName: 'Natural Rubber',         qty: 500, unit: 'kg',  from: 'Supplier: Alpha Chemicals', to: 'Rack A-1',   reference: 'GRN-2026-001' },
  { date: '2026-06-04', type: 'Issue',    itemCode: 'SBR-1502',          itemName: 'SBR Compound',           qty: 120, unit: 'kg',  from: 'Rack A-2',                  to: 'Production', reference: 'WO-2026-0018' },
  { date: '2026-06-04', type: 'FG In',    itemCode: 'RSA-001',           itemName: 'Rubber Seal Type A',     qty: 250, unit: 'Nos', from: 'Production',                to: 'FG Store',   reference: 'WO-2026-0015' },
  { date: '2026-06-03', type: 'GRN',      itemCode: 'CARBON-BLACK-N330', itemName: 'Carbon Black N330',      qty: 200, unit: 'kg',  from: 'Supplier: Gamma Materials', to: 'Rack B-1',   reference: 'GRN-2026-003' },
  { date: '2026-06-02', type: 'Issue',    itemCode: 'ZINC-OXIDE-99',     itemName: 'Zinc Oxide 99%',         qty: 50,  unit: 'kg',  from: 'Rack B-2',                  to: 'Production', reference: 'WO-2026-0016' },
  { date: '2026-06-01', type: 'FG In',    itemCode: 'ORB-002',           itemName: 'O-Ring Type B',          qty: 180, unit: 'Nos', from: 'Production',                to: 'FG Store',   reference: 'WO-2026-0014' },
  { date: '2026-05-31', type: 'Transfer', itemCode: 'NR-GRADE-1',       itemName: 'Natural Rubber',         qty: 100, unit: 'kg',  from: 'Rack A-1',                  to: 'Rack A-2',   reference: 'TR-2026-001'  },
  { date: '2026-05-30', type: 'Issue',    itemCode: 'NR-GRADE-1',       itemName: 'Natural Rubber',         qty: 80,  unit: 'kg',  from: 'Rack A-1',                  to: 'Production', reference: 'WO-2026-0013' },
];

const MOVE_TONE: Record<string, 'blue' | 'orange' | 'green' | 'purple'> = {
  GRN:      'blue',
  Issue:    'orange',
  'FG In':  'green',
  Transfer: 'purple',
};

const CAT_TONE: Record<string, 'blue' | 'orange' | 'green'> = {
  'Raw Material':  'blue',
  'WIP':           'orange',
  'Finished Good': 'green',
};

type TabKey = 'summary' | 'movement';

export default function StockReports() {
  const [tab, setTab] = useState<TabKey>('summary');

  const totalValue = STOCK_SUMMARY.reduce((s, r) => s + r.value, 0);
  const totalRM    = STOCK_SUMMARY.filter(r => r.category === 'Raw Material').reduce((s, r) => s + r.value, 0);
  const totalFG    = STOCK_SUMMARY.filter(r => r.category === 'Finished Good').reduce((s, r) => s + r.value, 0);

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            <span className="text-xl font-bold text-green-600">₹{(totalFG / 1000).toFixed(1)}K</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">FG Stock Value</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-blue-600" />
            <span className="text-xl font-bold text-blue-600">₹{(totalRM / 1000).toFixed(1)}K</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">RM Stock Value</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-purple-600" />
            <span className="text-xl font-bold text-purple-600">₹{(totalValue / 1000).toFixed(1)}K</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Total Stock Value</p>
        </CardContent></Card>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-2 border-b border-border">
        {(['summary', 'movement'] as TabKey[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'summary' ? 'Stock Summary' : 'Movement Log'}
          </button>
        ))}
        <div className="ml-auto pb-1">
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        </div>
      </div>

      {tab === 'summary' && (
        <Card>
          <CardHeader>
            <CardTitle>Stock Summary Report — June 2026</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Issued</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Value (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {STOCK_SUMMARY.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell><StatusBadge status={row.category} tone={CAT_TONE[row.category]} /></TableCell>
                      <TableCell className="font-mono text-sm font-bold">{row.itemCode}</TableCell>
                      <TableCell className="font-medium">{row.itemName}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{row.openingQty}</TableCell>
                      <TableCell className="text-right text-blue-600 font-medium">+{row.received}</TableCell>
                      <TableCell className="text-right text-orange-600 font-medium">−{row.issued}</TableCell>
                      <TableCell className="text-right font-bold text-foreground">{row.closingQty}</TableCell>
                      <TableCell>{row.unit}</TableCell>
                      <TableCell className="text-right font-semibold">₹{row.value.toLocaleString('en-IN')}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={8} className="text-right">Total Stock Value</TableCell>
                    <TableCell className="text-right">₹{totalValue.toLocaleString('en-IN')}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'movement' && (
        <Card>
          <CardHeader>
            <CardTitle>Stock Movement Log — June 2026</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MOVEMENT_LOG.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{row.date}</TableCell>
                      <TableCell><StatusBadge status={row.type} tone={MOVE_TONE[row.type]} /></TableCell>
                      <TableCell className="font-mono text-sm font-bold">{row.itemCode}</TableCell>
                      <TableCell className="font-medium">{row.itemName}</TableCell>
                      <TableCell className="text-right font-bold">{row.qty}</TableCell>
                      <TableCell>{row.unit}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.from}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.to}</TableCell>
                      <TableCell className="font-mono text-sm text-purple-700">{row.reference}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
