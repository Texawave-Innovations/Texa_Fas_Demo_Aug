'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Package, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { createRecord, getAllRecords, updateRecord, deleteRecord } from '@/services/firebase';

export default function PackingList() {
  const [packingLists, setPackingLists] = useState([]);
  const [orders, setOrders] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);
  const [editingPL, setEditingPL] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  // LOAD DATA
  const loadData = async () => {
    try {
      const [plData, oaData] = await Promise.all([
        getAllRecords('sales/packingLists'),
        getAllRecords('sales/orderAcknowledgements'),
      ]);

      setPackingLists(plData);

      // Calculate already packed qty for each order
      const packedMap = {};

      plData.forEach(pl => {
        pl.items.forEach(it => {
          if (!packedMap[pl.orderId]) packedMap[pl.orderId] = {};
          if (!packedMap[pl.orderId][it.partNo]) packedMap[pl.orderId][it.partNo] = 0;

          packedMap[pl.orderId][it.partNo] += it.quantity;
        });
      });

      // filter valid orders
      const validOrders = oaData.filter(o => ['QC Completed', 'Ready for Dispatch'].includes(o.status));
      validOrders.forEach(o => {
        (o.items || []).forEach(item => {
          const alreadyPacked = packedMap[o.id]?.[item.sku] || 0;
          item.remainingQty = (item.okQty || 0) - alreadyPacked;
        });
      });

      // Only show orders that have at least one item left to pack
      setOrders(validOrders.filter(o => o.items.some(i => i.remainingQty > 0)));
    } catch {
      toast.error("Failed to load data");
    }
  };

  // ORDER SELECTION
  const handleOrderChange = (orderId) => {
    setSelectedOrderId(orderId);
    const order = orders.find(o => o.id === orderId);

    if (!order) {
      setSelectedItems([]);
      return;
    }

    const map = order.items
      .filter(i => i.remainingQty > 0)
      .map(i => ({
        batchId: order.soNumber,
        partName: i.productDescription,
        partNo: i.sku,
        availableQty: i.remainingQty,
        quantity: 0,
        selected: false,
      }));

    setSelectedItems(map);
  };

  // CHECKBOX
  const toggleItem = (index) => {
    setSelectedItems(prev =>
      prev.map((item, i) => i === index ? { ...item, selected: !item.selected } : item)
    );
  };

  // QUANTITY INPUT
  const updateQuantity = (index, qty) => {
    setSelectedItems(prev =>
      prev.map((item, i) => {
        if (i !== index) return item;
        return {
          ...item,
          quantity: Math.min(Math.max(qty, 0), item.availableQty)
        };
      })
    );
  };

  // CREATE PACKING LIST
  const handleCreatePackingList = async () => {
    const order = orders.find(o => o.id === selectedOrderId);
    const selected = selectedItems.filter(i => i.selected && i.quantity > 0);

    if (!order) return toast.error("Select order");
    if (selected.length === 0) return toast.error("Select at least 1 item");

    const packingListNumber = `PL-${String(packingLists.length + 1001).padStart(4, '0')}`;

    const plData = {
      packingListNumber,
      orderId: order.id,
      orderNumber: order.soNumber,
      customerName: order.customerName,
      items: selected,
      packingDate: new Date().toISOString().split("T")[0],
      status: 'Packed',
      createdAt: Date.now()
    };

    try {
      await createRecord('sales/packingLists', plData);
      toast.success("Packing List created");

      setDialogOpen(false);
      setSelectedOrderId('');
      setSelectedItems([]);
      loadData();
    } catch {
      toast.error("Failed to create");
    }
  };

  // OPEN EDIT
  const openEdit = (pl) => {
    setEditingPL(pl);
    setEditDialog(true);
  };

  // DELETE PACKING LIST
  const deletePL = async (pl) => {
    if (!confirm("Delete this packing list?")) return;

    try {
      await deleteRecord('sales/packingLists', pl.id);
      toast.success("Deleted");

      loadData();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Packing Lists</h1>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2"/> Create</Button>
          </DialogTrigger>

          <DialogContent className="max-w-4xl">
            <DialogHeader><DialogTitle>Create Packing List</DialogTitle></DialogHeader>

            <div className="space-y-6 mt-4">

              {/* SELECT ORDER */}
              <Label>Select Order</Label>
              <Select value={selectedOrderId} onValueChange={handleOrderChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose order..."/>
                </SelectTrigger>
                <SelectContent>
                  {orders.map(o => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.soNumber} - {o.customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* ITEMS TABLE */}
              {selectedItems.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Select</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Part Name</TableHead>
                      <TableHead>Part No</TableHead>
                      <TableHead>Available</TableHead>
                      <TableHead>Pack Qty</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {selectedItems.map((it, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Checkbox checked={it.selected} onCheckedChange={() => toggleItem(i)} />
                        </TableCell>
                        <TableCell>{it.batchId}</TableCell>
                        <TableCell>{it.partName}</TableCell>
                        <TableCell>{it.partNo}</TableCell>
                        <TableCell><Badge>{it.availableQty}</Badge></TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={it.quantity}
                            disabled={!it.selected}
                            min={0}
                            max={it.availableQty}
                            onChange={(e)=>updateQuantity(i, Number(e.target.value))}
                            className="w-20"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <Button
                className="w-full"
                disabled={selectedItems.filter(i => i.selected && i.quantity > 0).length === 0}
                onClick={handleCreatePackingList}
              >
                Create Packing List
              </Button>
            </div>

          </DialogContent>
        </Dialog>
      </div>

      {/* PACKING LIST TABLE */}
      <Card>
        <CardHeader><CardTitle>All Packing Lists</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No.</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {packingLists.map(pl => (
                <TableRow key={pl.id}>
                  <TableCell>{pl.packingListNumber}</TableCell>
                  <TableCell>{pl.orderNumber}</TableCell>
                  <TableCell>{pl.customerName}</TableCell>
                  <TableCell>{pl.packingDate}</TableCell>
                  <TableCell><Badge>{pl.items.length} items</Badge></TableCell>
                  <TableCell>

                    <Button variant="ghost" onClick={()=>deletePL(pl)}><Trash2 className="h-4 text-red-600"/></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>

          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
