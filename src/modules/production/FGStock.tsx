'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { database } from '@/services/firebase';
import { ref, onValue, off } from 'firebase/database';

export default function FGStockPage() {
  const [fgStock, setFGStock] = useState<any[]>([]);
  const [totalOK, setTotalOK] = useState(0);

  useEffect(() => {
    const fgRef = ref(database, 'stores/fg');

    const unsubscribe = onValue(fgRef, (snapshot) => {
      const data = snapshot.val();

      if (data) {
        const list = Object.keys(data)
          .map((id) => ({ ...data[id], id }))
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        setFGStock(list);

        const okQty = list
          .filter((item) => item.qc === 'ok')
          .reduce((sum, item) => sum + (item.quantity || 0), 0);

        setTotalOK(okQty);
      } else {
        setFGStock([]);
        setTotalOK(0);
      }
    });

    return () => off(fgRef, 'value', unsubscribe);
  }, []);

  return (
    <div className="space-y-6">
      {/* TOP CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-primary">{totalOK}</div>
            <p className="text-muted-foreground text-sm mt-1">
              Total QC Passed Stock
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-warning">
              {fgStock.filter(item => item.qc === 'hold').length}
            </div>
            <p className="text-muted-foreground text-sm mt-1">On Hold</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-foreground">
              {fgStock.length}
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              Total Records
            </p>
          </CardContent>
        </Card>
      </div>

      {/* TABLE */}
      <Card>
        <CardHeader>
          <CardTitle>Finished Goods Stock</CardTitle>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SO Number</TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Product ID</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>QC Status</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {fgStock.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    No finished goods available
                  </TableCell>
                </TableRow>
              ) : (
                fgStock.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.soNumber}</TableCell>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell>{item.productId}</TableCell>
                    <TableCell>{item.quantity}</TableCell>

                    <TableCell>
                      <StatusBadge status={item.qc === 'ok' ? 'QC PASSED' : 'ON HOLD'} tone={item.qc === 'ok' ? 'green' : 'amber'} />
                    </TableCell>

                    <TableCell>
                      {new Date(item.timestamp).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
