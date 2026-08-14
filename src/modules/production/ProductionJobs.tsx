'use client';
import { useEffect, useState, useMemo } from 'react';
import { Play, Square, Pencil, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { RowActions } from '@/components/ui/row-actions';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { toast } from '@/hooks/use-toast';
import { createRecord, getAllRecords, updateRecord } from '@/services/firebase';
import { database } from '@/services/firebase';
import { ref, onValue } from 'firebase/database';
import { useMasterData } from '@/context/MasterDataContext';
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns';

type ProductionJob = {
  id: string;
  orderId: string | null; // allow null for direct-from-products jobs
  soNumber: string;
  customerName: string;
  deliveryDate?: string;
  productId?: string;
  productName?: string;
  productCode?: string;
  qty?: number;
  machineId: string;
  operatorId: string;
  operatorName: string;
  status: 'not_started' | 'running' | 'completed';
  priority: string;
  startTime?: string;
  endTime?: string;
  createdAt: number;
  updatedAt?: number;
};

type Employee = {
  id: string;
  name: string;
  department?: string;
  role?: string;
};

export default function ProductionJobs() {
  const { masterData } = useMasterData();
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editJob, setEditJob] = useState<ProductionJob | null>(null);
  const [editDialog, setEditDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [editForm, setEditForm] = useState({
    machineId: '',
    operatorId: '',
  });

  useEffect(() => {
    const jobsRef = ref(database, 'production/jobs');
    const unsubscribe = onValue(jobsRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setJobs([]);
        return;
      }

      const jobEntries = Object.keys(data).map((id) => ({ ...data[id], id }));

      // Fetch Order Acknowledgements (for jobs coming from Sales Orders)
      const oaRecords = await getAllRecords('sales/orderAcknowledgements');
      const oaMap = new Map();
      oaRecords.forEach((oa: any) => {
        oaMap.set(oa.id, {
          deliveryDate: oa.deliveryDate,
          items: oa.items || [],
          customerName: oa.customerName,
        });
      });

      // Fetch Products (for jobs created directly from sales/products)
      const productRecords = await getAllRecords('sales/products');
      const productMap = new Map<
        string,
        { productCode: string; name: string; hsn?: string }
      >();
      productRecords.forEach((p: any) => {
        const code = (p.productCode || '').toString();
        if (code) {
          productMap.set(code, {
            productCode: code,
            name: p.name || code,
            hsn: p.hsn,
          });
        }
      });

      const enrichedJobs = jobEntries.map((job: any) => {
        const orderId = job.orderId || null;

        // If job is linked to an order, enrich from OA
        if (orderId && oaMap.has(orderId)) {
          const oaData: any = oaMap.get(orderId) || {};
          const item = oaData.items?.find(
            (i: any) =>
              i.productCode === job.productId ||
              i.productCode === job.productCode ||
              i.productDescription === job.productName
          );

          return {
            ...job,
            orderId,
            deliveryDate: oaData.deliveryDate || 'Not Set',
            productCode: item?.productCode || job.productCode || 'N/A',
            customerName: job.customerName || oaData.customerName || 'Unknown',
          };
        }

        // Direct-from-products job (no orderId)
        let derivedProductCode = job.productCode || '';
        let derivedProductName = job.productName || '';
        if (!derivedProductCode && job.productId) {
          const fromProd = productMap.get(job.productId);
          if (fromProd) {
            derivedProductCode = fromProd.productCode;
            if (!derivedProductName) {
              derivedProductName = fromProd.name;
            }
          }
        }

        return {
          ...job,
          orderId: null,
          soNumber: job.soNumber || 'DIRECT',
          customerName: job.customerName || 'Internal',
          deliveryDate: job.deliveryDate || 'Not Set',
          productCode: derivedProductCode || 'N/A',
          productName: derivedProductName || job.productName || 'Unknown',
        };
      });

      const sortedJobs = enrichedJobs.sort(
        (a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0)
      );

      setJobs(sortedJobs as ProductionJob[]);
    });

    loadEmployees();
    return () => unsubscribe();
  }, []);

  const loadEmployees = async () => {
    const all = await getAllRecords('hr/employees');
    const prod = all.filter(
      (e: any) =>
        (e.department || '').toLowerCase().includes('production') ||
        (e.role || '').toLowerCase().includes('production')
    );
    setEmployees(prod);
  };

  // Search & Filter Logic
  const filteredJobs = useMemo(() => {
    if (!searchTerm.trim()) return jobs;

    const term = searchTerm.toLowerCase();
    return jobs.filter(
      (job) =>
        (job.soNumber || '').toLowerCase().includes(term) ||
        (job.productCode || '').toLowerCase().includes(term) ||
        (job.customerName || '').toLowerCase().includes(term)
    );
  }, [jobs, searchTerm]);

  const updateOrderStatus = async (orderId: string | null) => {
    // For direct-from-products jobs, there is no order to update
    if (!orderId) return;

    try {
      const allJobs = await getAllRecords('production/jobs');
      const related = allJobs.filter((j: any) => j.orderId === orderId);
      if (related.length === 0) return;

      let productionStatus = 'pending';
      let orderStatus = 'Confirmed';
      const allCompleted = related.every((j) => j.status === 'completed');
      const anyRunning = related.some((j) => j.status === 'running');

      if (allCompleted) {
        productionStatus = 'completed';
        orderStatus = 'QC Pending';
      } else if (anyRunning) {
        productionStatus = 'in_progress';
        orderStatus = 'In Production';
      }

      await updateRecord('sales/orderAcknowledgements', orderId, {
        productionStatus,
        status: orderStatus,
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.error('Update order status failed:', err);
    }
  };

  const handleOpenEdit = (job: ProductionJob) => {
    setEditJob(job);
    setEditForm({
      machineId: job.machineId || '',
      operatorId: job.operatorId || '',
    });
    setEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!editJob) return;
    const operator = employees.find((e) => e.id === editForm.operatorId);
    await updateRecord('production/jobs', editJob.id, {
      machineId: editForm.machineId,
      operatorId: editForm.operatorId,
      operatorName: operator?.name || '',
      updatedAt: Date.now(),
    });
    toast({ title: 'Job updated successfully!' });
    setEditDialog(false);
  };

  const handleStartJob = async (job: ProductionJob) => {
    if (!job.machineId || !job.operatorId) {
      toast({
        title: 'Assign Machine & Operator first',
        variant: 'destructive',
      });
      return;
    }
    await updateRecord('production/jobs', job.id, {
      status: 'running',
      startTime: new Date().toISOString(),
      updatedAt: Date.now(),
    });
    toast({ title: 'Job started' });
    await updateOrderStatus(job.orderId);
  };

  const handleCompleteJob = async (job: ProductionJob) => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    await updateRecord('production/jobs', job.id, {
      status: 'completed',
      endTime: now.toISOString(),
      updatedAt: Date.now(),
    });

    const productId = job.productId || job.productCode || 'unknown';
    const productName = job.productName || 'Unknown';
    const qty = job.qty || 1;

    // QC record works for both: order-based and direct jobs
    await createRecord('quality/inspections', {
      orderId: job.orderId || null,
      jobId: job.id,
      soNumber: job.soNumber || (job.orderId ? '' : 'DIRECT'),
      customerName: job.customerName || (job.orderId ? '' : 'Internal'),
      productId,
      productName,
      productCode: job.productCode || 'N/A',
      qty,
      qcStatus: 'pending',
      inspectionDate: today,
      createdAt: Date.now(),
    });

    toast({ title: 'Job completed & QC batch created' });
    await updateOrderStatus(job.orderId);
  };

  const formatStatus = (s: string) => s.replace('_', ' ').toUpperCase();

  const getDeliveryDateBadge = (dateStr: string) => {
    if (!dateStr || dateStr === 'Not Set') {
      return <Badge variant="outline">No Date</Badge>;
    }
    const date = parseISO(dateStr);
    const formatted = format(date, 'dd-MMM-yyyy');

    if (isPast(date) && !isToday(date)) {
      return (
        <Badge className="bg-red-600 text-white animate-pulse">
          OVERDUE {formatted}
        </Badge>
      );
    }
    if (isToday(date)) {
      return (
        <Badge className="bg-red-500 text-white font-bold">
          TODAY {formatted}
        </Badge>
      );
    }
    if (isTomorrow(date)) {
      return (
        <Badge className="bg-orange-500 text-white">
          Tomorrow {formatted}
        </Badge>
      );
    }
    return <Badge className="bg-green-600 text-white">{formatted}</Badge>;
  };

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="text-2xl font-bold">
              Production Jobs Dashboard
            </CardTitle>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search by SO Number, Product Code or Customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Job ID</TableHead>
                  <TableHead className="font-bold text-blue-700">
                    SO Number
                  </TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-center font-bold text-red-600">
                    Delivery Date
                  </TableHead>
                  <TableHead>Product Code</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead>Machine</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className="text-center text-muted-foreground py-12 text-lg"
                    >
                      {searchTerm
                        ? 'No jobs match your search'
                        : 'No production jobs found'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredJobs.map((job) => (
                    <TableRow key={job.id} className="hover:bg-gray-50">
                      <TableCell className="font-mono text-xs">
                        {job.id.slice(-6).toUpperCase()}
                      </TableCell>
                      <TableCell className="font-bold text-blue-700 text-lg">
                        {job.soNumber || (job.orderId ? '' : 'DIRECT')}
                      </TableCell>
                      <TableCell className="font-medium">
                        {job.customerName || (job.orderId ? '' : 'Internal')}
                      </TableCell>
                      <TableCell className="text-center">
                        {getDeliveryDateBadge(job.deliveryDate || 'Not Set')}
                      </TableCell>
                      <TableCell className="font-mono font-semibold text-purple-700">
                        {job.productCode || 'N/A'}
                      </TableCell>
                      <TableCell>{job.productName || '-'}</TableCell>
                      <TableCell className="text-center font-bold text-lg">
                        {job.qty ?? '-'}
                      </TableCell>
                      <TableCell>
                        {job.machineId ? (
                          <span className="font-semibold">{job.machineId}</span>
                        ) : (
                          <span className="text-muted-foreground italic">
                            Not Assigned
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {job.operatorName ? (
                          <span className="font-medium">
                            {job.operatorName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">
                            Not Assigned
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={formatStatus(job.status)} />
                      </TableCell>
                      <TableCell>
                        <RowActions
                          actions={[
                            { label: 'Edit', icon: Pencil, onClick: () => handleOpenEdit(job), hidden: job.status !== 'not_started' },
                            { label: 'Start', icon: Play, onClick: () => handleStartJob(job), hidden: job.status !== 'not_started', className: 'text-blue-600 hover:text-blue-700' },
                            { label: 'Complete', icon: Square, onClick: () => handleCompleteJob(job), hidden: job.status !== 'running', className: 'text-green-600 hover:text-green-700' },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit Job Assignment - {editJob?.soNumber || 'DIRECT'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Machine</Label>
              <SearchableSelect
                value={editForm.machineId}
                onValueChange={(v) => setEditForm((p) => ({ ...p, machineId: v }))}
                options={
                  masterData?.production
                    ? Object.entries(masterData.production.machines || {}).map(
                        ([id, machine]: any) => ({ value: id, label: `${machine.name} (${id})` })
                      )
                    : []
                }
                placeholder="Select machine"
              />
            </div>
            <div>
              <Label>Operator</Label>
              <SearchableSelect
                value={editForm.operatorId}
                onValueChange={(v) => setEditForm((p) => ({ ...p, operatorId: v }))}
                options={employees.map((e) => ({ value: e.id, label: e.name }))}
                placeholder="Select operator"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
