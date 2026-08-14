import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { toast } from '@/hooks/use-toast';
import { ProductionBatch } from '@/types';
import { createRecord, getAllRecords } from '@/services/firebase';
import { database } from '@/services/firebase';
import { ref, onValue, off } from 'firebase/database';
import { useMasterData } from '@/context/MasterDataContext';

export default function BatchManagement() {
  const { masterData } = useMasterData();
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [batchForm, setBatchForm] = useState({
    partName: '',
    partNo: '',
    machineNo: '',
    dieNo: '',
    productionQty: 0,
    productionDate: new Date().toISOString().split('T')[0],
    operatorName: '',
  });

  useEffect(() => {
    const batchesRef = ref(database, 'production/batches');
    const unsubscribe = onValue(batchesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const batchList = Object.keys(data).map(key => ({ ...data[key], id: key }))
          .sort((a, b) => b.createdAt - a.createdAt);
        setBatches(batchList);
      } else {
        setBatches([]);
      }
    });

    loadEmployees();

    return () => off(batchesRef, 'value', unsubscribe);
  }, []);

  const loadEmployees = async () => {
    const empList = await getAllRecords('hr/employees');
    setEmployees(empList.filter(e => e.department === 'Production'));
  };

  const createBatch = async () => {
    if (!batchForm.partName || !batchForm.productionQty) {
      toast({ title: 'Please fill all required fields', variant: 'destructive' });
      return;
    }

    const batchId = `BATCH-${Date.now()}`;
    await createRecord('production/batches', {
      batchId,
      ...batchForm,
      qcStatus: 'pending',
    });

    setShowDialog(false);
    setBatchForm({
      partName: '',
      partNo: '',
      machineNo: '',
      dieNo: '',
      productionQty: 0,
      productionDate: new Date().toISOString().split('T')[0],
      operatorName: '',
    });
    toast({ title: 'Batch created successfully' });
  };

  const getQCStatusTone = (status: string): 'amber' | 'blue' | 'green' | undefined => {
    switch (status) {
      case 'pending': return 'amber';
      case 'in-progress': return 'blue';
      case 'completed': return 'green';
      default: return undefined;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Batch Management
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Batch
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create Production Batch</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Part Name</Label>
                    <Input
                      value={batchForm.partName}
                      onChange={(e) => setBatchForm({ ...batchForm, partName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Part Number</Label>
                    <Input
                      value={batchForm.partNo}
                      onChange={(e) => setBatchForm({ ...batchForm, partNo: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Machine</Label>
                    <SearchableSelect
                      value={batchForm.machineNo}
                      onValueChange={(v) => setBatchForm({ ...batchForm, machineNo: v })}
                      options={
                        masterData?.production
                          ? Object.entries(masterData.production.machines).map(([id, machine]: any) => ({
                              value: id,
                              label: `${id} - ${machine.name}`,
                            }))
                          : []
                      }
                      placeholder="Select machine"
                    />
                  </div>
                  <div>
                    <Label>Die</Label>
                    <SearchableSelect
                      value={batchForm.dieNo}
                      onValueChange={(v) => setBatchForm({ ...batchForm, dieNo: v })}
                      options={
                        masterData?.production
                          ? Object.entries(masterData.production.dies).map(([id, die]: any) => ({
                              value: id,
                              label: `${id} - ${die.name}`,
                            }))
                          : []
                      }
                      placeholder="Select die"
                    />
                  </div>
                  <div>
                    <Label>Production Quantity</Label>
                    <Input
                      type="number"
                      value={batchForm.productionQty}
                      onChange={(e) => setBatchForm({ ...batchForm, productionQty: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Production Date</Label>
                    <Input
                      type="date"
                      value={batchForm.productionDate}
                      onChange={(e) => setBatchForm({ ...batchForm, productionDate: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Operator</Label>
                    <SearchableSelect
                      value={batchForm.operatorName}
                      onValueChange={(v) => setBatchForm({ ...batchForm, operatorName: v })}
                      options={employees.map((emp: any) => ({ value: emp.name, label: emp.name }))}
                      placeholder="Select operator"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button onClick={createBatch} className="w-full">Create Batch</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch ID</TableHead>
                <TableHead>Part Name</TableHead>
                <TableHead>Machine</TableHead>
                <TableHead>Die</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead>QC Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No batches found
                  </TableCell>
                </TableRow>
              ) : (
                batches.map(batch => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium">{batch.batchId}</TableCell>
                    <TableCell>{batch.partName}</TableCell>
                    <TableCell>{batch.machineNo}</TableCell>
                    <TableCell>{batch.dieNo}</TableCell>
                    <TableCell>{batch.productionQty}</TableCell>
                    <TableCell>{batch.productionDate}</TableCell>
                    <TableCell>{batch.operatorName}</TableCell>
                    <TableCell>
                      <StatusBadge status={batch.qcStatus.toUpperCase()} tone={getQCStatusTone(batch.qcStatus)} />
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
