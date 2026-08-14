import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { QualityInspection } from '@/types';
import { database } from '@/services/firebase';
import { ref, onValue, off } from 'firebase/database';

export default function StockMapping() {
  const [inspections, setInspections] = useState<QualityInspection[]>([]);
  const [filteredInspections, setFilteredInspections] = useState<QualityInspection[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const inspectionsRef = ref(database, 'quality/inspections');
    
    const unsubscribe = onValue(inspectionsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const inspectionList = Object.keys(data)
          .map(key => ({ ...data[key], id: key }))
          .filter((insp: QualityInspection) => insp.status === 'completed')
          .sort((a, b) => b.createdAt - a.createdAt);
        setInspections(inspectionList);
        setFilteredInspections(inspectionList);
      } else {
        setInspections([]);
        setFilteredInspections([]);
      }
    });

    return () => off(inspectionsRef, 'value', unsubscribe);
  }, []);

  useEffect(() => {
    const filtered = inspections.filter(insp =>
      insp.batchId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      insp.partName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      insp.partNo.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredInspections(filtered);
  }, [searchTerm, inspections]);

  const getQCStatus = (okQty: number, notOkQty: number) => {
    if (notOkQty === 0 && okQty > 0) return 'QC Passed';
    if (okQty === 0 && notOkQty > 0) return 'QC Rejected';
    return 'QC Partial';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Quality Stock Mapping</h1>
        <p className="text-muted-foreground mt-1">Track where each inspected batch goes</p>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by batch ID, part name, or part number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch ID</TableHead>
                <TableHead>Part Name</TableHead>
                <TableHead>Part No</TableHead>
                <TableHead>OK Qty</TableHead>
                <TableHead>NOT OK Qty</TableHead>
                <TableHead>Inspection Date</TableHead>
                <TableHead>Inspector</TableHead>
                <TableHead>Sales Order No</TableHead>
                <TableHead>Sales Order Date</TableHead>
                <TableHead>Final QC Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInspections.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    No completed inspections found
                  </TableCell>
                </TableRow>
              ) : (
                filteredInspections.map((inspection) => {
                  const qcStatus = getQCStatus(inspection.okQty, inspection.notOkQty);
                  return (
                    <TableRow key={inspection.id}>
                      <TableCell className="font-medium">{inspection.batchId}</TableCell>
                      <TableCell>{inspection.partName}</TableCell>
                      <TableCell>{inspection.partNo}</TableCell>
                      <TableCell className="text-green-600 font-semibold">{inspection.okQty}</TableCell>
                      <TableCell className="text-red-600 font-semibold">{inspection.notOkQty}</TableCell>
                      <TableCell>{inspection.inspectionDate}</TableCell>
                      <TableCell>{inspection.inspectorName}</TableCell>
                      <TableCell>{inspection.salesOrderNo || '-'}</TableCell>
                      <TableCell>{inspection.salesOrderDate || '-'}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          qcStatus === 'QC Passed' ? 'bg-green-100 text-green-800' :
                          qcStatus === 'QC Rejected' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {qcStatus}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <p className="text-sm text-muted-foreground">Total Inspections</p>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{inspections.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <p className="text-sm text-green-600">Total OK Quantity</p>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {inspections.reduce((sum, i) => sum + i.okQty, 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <p className="text-sm text-red-600">Total NOT OK Quantity</p>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">
              {inspections.reduce((sum, i) => sum + i.notOkQty, 0)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
