'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Package, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getAllRecords } from '@/services/firebase';

interface FGItem {
  id: string;
  productCode: string;
  productName: string;
  quantity: number;
  uom?: string;
  qc: 'ok' | 'notOk';
  createdAt: number;
  soNumber?: string;
}

interface ProductDetails {
  id: string;
  name: string;
  productCode: string;
  hsn: string;
  unit: string;
  unitPrice: number;
  taxPercent: number;
  images?: string[];
}

export default function Inventory() {
  const [fgStock, setFgStock] = useState<FGItem[]>([]);
  const [products, setProducts] = useState<Record<string, ProductDetails>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [fgData, prodData] = await Promise.all([
          getAllRecords('stores/fg'),
          getAllRecords('sales/products'),
        ]);

        // Build product lookup map
        const prodMap: Record<string, ProductDetails> = {};
        (prodData as any[]).forEach((p: any) => {
          prodMap[p.productCode] = {
            id: p.id,
            name: p.name,
            productCode: p.productCode,
            hsn: p.hsn || p.hsnCode || '39269099',
            unit: p.unit || p.uom || 'kg',
            unitPrice: p.unitPrice || 0,
            taxPercent: p.taxPercent || 18,
            images: p.images || [],
          };
        });
        setProducts(prodMap);

        // Filter only OK items and group by productCode
        const okItems = (fgData as any[])
          .filter((item: any) => item.qc === 'ok')
          .map((item: any) => ({
            id: item.id,
            productCode: item.productCode || item.productId,
            productName: item.productName,
            quantity: Number(item.quantity || 0),
            uom: item.uom || 'kg',
            qc: item.qc,
            createdAt: item.createdAt || item.timestamp,
            soNumber: item.soNumber,
          }));

        // Aggregate by productCode
        const aggregated: Record<string, FGItem> = {};
        okItems.forEach((item: FGItem) => {
          if (!aggregated[item.productCode]) {
            aggregated[item.productCode] = { ...item, quantity: 0 };
          }
          aggregated[item.productCode].quantity += item.quantity;
          // Keep latest timestamp
          if (item.createdAt > (aggregated[item.productCode].createdAt || 0)) {
            aggregated[item.productCode].createdAt = item.createdAt;
          }
        });

        const finalList = Object.values(aggregated)
          .sort((a, b) => b.createdAt - a.createdAt);

        setFgStock(finalList);
      } catch (err) {
        console.error('Error loading FG inventory:', err);
        toast.error('Failed to load FG stock');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg font-medium">Loading FG inventory...</div>
      </div>
    );
  }

  const totalItems = fgStock.length;
  const totalQuantity = fgStock.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-gray-900 flex items-center gap-4">
          <Package className="w-12 h-12 text-green-600" />
          Finished Goods Stock (FG)
        </h1>
        <p className="text-gray-600 mt-3 text-lg">
          Total Products in FG: <strong className="text-blue-700">{totalItems}</strong> | 
          Total OK Quantity: <strong className="text-green-700">{totalQuantity.toLocaleString('en-IN')}</strong>
        </p>
        <p className="text-sm text-gray-500 mt-2">
          This shows all QC-passed (OK) finished goods currently in production storage
        </p>
      </div>

      {/* Empty State */}
      {fgStock.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="text-center py-20">
            <AlertCircle className="w-20 h-20 text-gray-300 mx-auto mb-6" />
            <p className="text-2xl font-semibold text-gray-700">No Finished Goods Available</p>
            <p className="text-gray-500 mt-3 max-w-md mx-auto">
              Once production jobs are completed and QC marked as "OK", stock will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Current FG Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-green-50">
                    <TableHead className="w-12">#</TableHead>
                    <TableHead className="w-32">Image</TableHead>
                    <TableHead>Product Code</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>HSN/SAC</TableHead>
                    <TableHead>FG Stock Qty</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead className="text-center">GST %</TableHead>
                    <TableHead>Latest Entry</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fgStock.map((item, idx) => {
                    const prod = products[item.productCode];
                    const imageUrl = prod?.images?.[0];
                    const isLow = item.quantity <= 10;
                    const isCritical = item.quantity <= 3;

                    return (
                      <TableRow
                        key={item.productCode}
                        className={`${isLow ? 'bg-yellow-50' : ''} ${isCritical ? 'border-l-4 border-l-red-600' : ''}`}
                      >
                        <TableCell className="font-medium">{idx + 1}</TableCell>

                        {/* Image */}
                        <TableCell>
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={item.productName}
                              className="w-20 h-20 object-cover rounded-lg border-2 shadow-md"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty('display', 'flex');
                              }}
                            />
                          ) : null}
                          {!imageUrl && (
                            <div className="w-20 h-20 bg-gray-200 border-2 border-dashed rounded-lg flex items-center justify-center">
                              <Package className="w-10 h-10 text-gray-400" />
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="font-mono font-bold text-green-700 text-lg">
                          {item.productCode}
                        </TableCell>

                        <TableCell className="font-semibold text-gray-800">
                          {prod?.name || item.productName}
                        </TableCell>

                        <TableCell className="text-center font-mono">
                          {prod?.hsn || '39269099'}
                        </TableCell>

                        <TableCell className={`text-2xl font-bold ${isCritical ? 'text-red-600' : isLow ? 'text-orange-600' : 'text-green-600'}`}>
                          {item.quantity.toLocaleString('en-IN')}
                          {isCritical && <Badge variant="destructive" className="ml-3">Critical</Badge>}
                          {isLow && !isCritical && <Badge variant="secondary" className="ml-3">Low</Badge>}
                        </TableCell>

                        <TableCell className="text-center font-medium">
                          {item.uom || prod?.unit || 'kg'}
                        </TableCell>

                        <TableCell className="font-bold text-gray-700">
                          ₹{prod?.unitPrice?.toLocaleString('en-IN') || '0'}
                        </TableCell>

                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-sm font-mono px-3">
                            {prod?.taxPercent || 18}%
                          </Badge>
                        </TableCell>

                        <TableCell className="text-sm text-gray-600">
                          {new Date(item.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </TableCell>

                        <TableCell className="text-center">
                          <StatusBadge status="Ready for Sale" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-10 p-6 bg-blue-50 border border-blue-200 rounded-xl text-center">
        <p className="text-lg font-medium text-blue-900">
          This is your real-time Finished Goods stock
        </p>
        <p className="text-gray-700 mt-2">
          Use this stock in <strong>Direct Sale</strong> invoices or wait for partial invoicing from Sales Orders.
        </p>
      </div>
    </div>
  );
}