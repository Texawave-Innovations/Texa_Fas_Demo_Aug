import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { WIPStock } from '@/types';
import { database } from '@/services/firebase';
import { ref, onValue, off } from 'firebase/database';

export default function WIPStockPage() {
  const [wipStock, setWIPStock] = useState<WIPStock[]>([]);

  useEffect(() => {
    const wipRef = ref(database, 'stores/wip');
    const unsubscribe = onValue(wipRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const wipList = Object.keys(data).map(key => ({ ...data[key], id: key }))
          .sort((a, b) => b.createdAt - a.createdAt);
        setWIPStock(wipList);
      } else {
        setWIPStock([]);
      }
    });

    return () => off(wipRef, 'value', unsubscribe);
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Work-in-Progress Stock</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch ID</TableHead>
                <TableHead>Part Name</TableHead>
                <TableHead>Part No</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Stage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wipStock.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No WIP stock found
                  </TableCell>
                </TableRow>
              ) : (
                wipStock.map(wip => (
                  <TableRow key={wip.id}>
                    <TableCell className="font-medium">{wip.batchId}</TableCell>
                    <TableCell>{wip.partName}</TableCell>
                    <TableCell>{wip.partNo}</TableCell>
                    <TableCell>{wip.quantity}</TableCell>
                    <TableCell>
                      <StatusBadge status={wip.stage} />
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
