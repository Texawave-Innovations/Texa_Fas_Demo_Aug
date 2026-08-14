'use client';

import { useEffect, useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { database } from '@/services/firebase';
import { ref, onValue, off, update } from 'firebase/database';
import { useNavigate } from 'react-router-dom';
import {
  format,
  isToday,
  isYesterday,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  isWithinInterval,
} from 'date-fns';

interface Inspection {
  id: string;
  soNumber: string;
  customerName: string;
  productName: string;
  productId: string;
  qty: number;
  okQty: number;
  notOkQty: number;
  qcStatus: 'pending' | 'in-progress' | 'completed';
  inspectorName?: string;
  inspectionDate: string;
  createdAt: number;
  updatedAt?: number;
  rejectionReason?: string;
  remarks?: string;
}

export default function IncomingInspection() {
  const navigate = useNavigate();
  const [allInspections, setAllInspections] = useState<Inspection[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('all');

  // Firebase listener
  useEffect(() => {
    const inspectionsRef = ref(database, 'quality/inspections');

    const unsubscribe = onValue(inspectionsRef, (snapshot) => {
      const data = snapshot.val();

      if (data) {
        const list: Inspection[] = Object.keys(data).map((id) => ({
          id,
          ...data[id],
          qty: Number(data[id].qty) || 0,
          okQty: Number(data[id].okQty) || 0,
          notOkQty: Number(data[id].notOkQty) || 0,
          inspectorName: data[id].inspectorName || 'Not Assigned',
        }));

        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setAllInspections(list);
      } else {
        setAllInspections([]);
      }
    });

    return () => off(inspectionsRef, 'value', unsubscribe);
  }, []);

  // Search
  const searched = useMemo(() => {
    if (!searchTerm) return allInspections;
    const term = searchTerm.toLowerCase();
    return allInspections.filter(
      (i) =>
        i.productName?.toLowerCase().includes(term) ||
        i.productId?.toLowerCase().includes(term) ||
        i.soNumber?.toLowerCase().includes(term) ||
        i.customerName?.toLowerCase().includes(term) ||
        i.inspectorName?.toLowerCase().includes(term)
    );
  }, [allInspections, searchTerm]);

  // Date filter
  const filtered = useMemo(() => {
    return searched.filter((i) => {
      const date = new Date(i.inspectionDate || i.createdAt);
      switch (dateFilter) {
        case 'today':
          return isToday(date);
        case 'yesterday':
          return isYesterday(date);
        case 'this-week':
          return isWithinInterval(date, { start: startOfWeek(new Date()), end: endOfWeek(new Date()) });
        case 'this-month':
          return isWithinInterval(date, { start: startOfMonth(new Date()), end: endOfMonth(new Date()) });
        case 'this-year':
          return isWithinInterval(date, { start: startOfYear(new Date()), end: endOfYear(new Date()) });
        default:
          return true;
      }
    });
  }, [searched, dateFilter]);

  const pending = filtered.filter((i) => i.qcStatus === 'pending');
  const inProgress = filtered.filter((i) => i.qcStatus === 'in-progress');
  const completed = filtered.filter((i) => i.qcStatus === 'completed');

  const startInspection = async (inspection: Inspection) => {
    try {
      await update(ref(database, `quality/inspections/${inspection.id}`), {
        qcStatus: 'in-progress',
        updatedAt: Date.now(),
      });
      toast({ title: 'Inspection started' });
      navigate(`/quality/inspection-entry/${inspection.id}`);
    } catch {
      toast({ title: 'Failed to start', variant: 'destructive' });
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-4xl font-bold">Quality Inspections</h1>
        <p className="text-muted-foreground">Manage all incoming QC inspections</p>
      </div>

      {/* Date filter tabs */}
      <Tabs value={dateFilter} onValueChange={setDateFilter}>
        <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full">
          <TabsTrigger value="all">All <Badge className="ml-2">{allInspections.length}</Badge></TabsTrigger>
          <TabsTrigger value="today">Today <Badge className="ml-2">{searched.filter(i => isToday(new Date(i.inspectionDate || i.createdAt))).length}</Badge></TabsTrigger>
          <TabsTrigger value="yesterday">Yesterday <Badge className="ml-2">{searched.filter(i => isYesterday(new Date(i.inspectionDate || i.createdAt))).length}</Badge></TabsTrigger>
          <TabsTrigger value="this-week">This Week <Badge className="ml-2">{searched.filter(i => isWithinInterval(new Date(i.inspectionDate || i.createdAt), { start: startOfWeek(new Date()), end: endOfWeek(new Date()) })).length}</Badge></TabsTrigger>
          <TabsTrigger value="this-month">This Month <Badge className="ml-2">{searched.filter(i => isWithinInterval(new Date(i.inspectionDate || i.createdAt), { start: startOfMonth(new Date()), end: endOfMonth(new Date()) })).length}</Badge></TabsTrigger>
          <TabsTrigger value="this-year">This Year <Badge className="ml-2">{searched.filter(i => isWithinInterval(new Date(i.inspectionDate || i.createdAt), { start: startOfYear(new Date()), end: endOfYear(new Date()) })).length}</Badge></TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search product, SO, customer, inspector..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="pending">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pending">Pending <Badge variant="destructive" className="ml-2">{pending.length}</Badge></TabsTrigger>
              <TabsTrigger value="in-progress">In Progress <Badge className="ml-2">{inProgress.length}</Badge></TabsTrigger>
              <TabsTrigger value="completed">Completed <Badge variant="secondary" className="ml-2">{completed.length}</Badge></TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-6">
              <InspectionTable list={pending} onStart={startInspection} />
            </TabsContent>

            <TabsContent value="in-progress" className="mt-6">
              <InspectionTable list={inProgress} onStart={startInspection} />
            </TabsContent>

            <TabsContent value="completed" className="mt-6">
              <CompletedInspectionTable list={completed} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

/* Table for Pending & In-Progress */
function InspectionTable({ list, onStart }: { list: Inspection[]; onStart: (i: Inspection) => void }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>SO Number</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Qty</TableHead>
          <TableHead>Inspector</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
              No inspections found
            </TableCell>
          </TableRow>
        ) : (
          list.map((insp) => (
            <TableRow key={insp.id}>
              <TableCell className="font-semibold">{insp.soNumber}</TableCell>
              <TableCell>{insp.customerName}</TableCell>
              <TableCell>
                {insp.productName}
                <br />
                <span className="text-xs text-muted-foreground">({insp.productId})</span>
              </TableCell>
              <TableCell>{insp.qty}</TableCell>
              <TableCell>
                <Badge variant="outline">{insp.inspectorName}</Badge>
              </TableCell>
              <TableCell>{format(new Date(insp.inspectionDate || insp.createdAt), 'dd MMM yyyy')}</TableCell>
              <TableCell>
                <Button size="sm" onClick={() => onStart(insp)}>
                  Start
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

/* Table for Completed Inspections – shows OK / Not OK */
function CompletedInspectionTable({ list }: { list: Inspection[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>SO Number</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Total Qty</TableHead>
          <TableHead>OK Qty</TableHead>
          <TableHead>Not OK Qty</TableHead>
          <TableHead>Inspector</TableHead>
          <TableHead>Rejection Reason</TableHead>
          <TableHead>Remarks</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.length === 0 ? (
          <TableRow>
            <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
              No completed inspections
            </TableCell>
          </TableRow>
        ) : (
          list.map((insp) => (
            <TableRow key={insp.id}>
              <TableCell className="font-semibold">{insp.soNumber}</TableCell>
              <TableCell>{insp.customerName}</TableCell>
              <TableCell>{insp.productName}</TableCell>
              <TableCell>{insp.qty}</TableCell>
              <TableCell><Badge className="bg-green-100 text-green-800">{insp.okQty}</Badge></TableCell>
              <TableCell><Badge className="bg-red-100 text-red-800">{insp.notOkQty}</Badge></TableCell>
              <TableCell><Badge variant="secondary">{insp.inspectorName}</Badge></TableCell>
              <TableCell className="max-w-[150px] truncate">{insp.rejectionReason || '—'}</TableCell>
              <TableCell className="max-w-[180px] truncate">{insp.remarks || '—'}</TableCell>
              <TableCell>{format(new Date(insp.inspectionDate), 'dd MMM yyyy')}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}