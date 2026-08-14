import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QualityInspection } from '@/types';
import { getAllRecords } from '@/services/firebase';

export default function QualityReports() {
  const [inspections, setInspections] = useState<QualityInspection[]>([]);

  useEffect(() => {
    fetchInspections();
  }, []);

  const fetchInspections = async () => {
    const data = await getAllRecords('quality/inspections');
    setInspections(data.filter((i: QualityInspection) => i.status === 'completed'));
  };

  // Report 1: Daily Inspection Summary
  const dailySummary = inspections.reduce((acc: any, insp) => {
    const date = insp.inspectionDate;
    if (!acc[date]) {
      acc[date] = { date, batches: 0, okQty: 0, notOkQty: 0 };
    }
    acc[date].batches += 1;
    acc[date].okQty += insp.okQty;
    acc[date].notOkQty += insp.notOkQty;
    return acc;
  }, {});

  const dailyData = Object.values(dailySummary).map((day: any) => ({
    ...day,
    rejectionPercent: ((day.notOkQty / (day.okQty + day.notOkQty)) * 100).toFixed(2),
  }));

  // Report 2: Inspector-wise Report
  const inspectorSummary = inspections.reduce((acc: any, insp) => {
    const inspector = insp.inspectorName;
    if (!inspector) return acc;
    if (!acc[inspector]) {
      acc[inspector] = { inspector, inspections: 0, okQty: 0, notOkQty: 0 };
    }
    acc[inspector].inspections += 1;
    acc[inspector].okQty += insp.okQty;
    acc[inspector].notOkQty += insp.notOkQty;
    return acc;
  }, {});

  const inspectorData = Object.values(inspectorSummary).map((insp: any) => ({
    ...insp,
    okPercent: ((insp.okQty / (insp.okQty + insp.notOkQty)) * 100).toFixed(2),
  }));

  // Report 3: Part-wise Rejection Analysis
  const partSummary = inspections.reduce((acc: any, insp) => {
    const partNo = insp.partNo;
    if (!acc[partNo]) {
      acc[partNo] = { 
        partNo, 
        partName: insp.partName, 
        inspections: 0, 
        rejected: 0, 
        reasons: {} 
      };
    }
    acc[partNo].inspections += 1;
    if (insp.notOkQty > 0) {
      acc[partNo].rejected += insp.notOkQty;
      if (insp.rejectionReason) {
        acc[partNo].reasons[insp.rejectionReason] = 
          (acc[partNo].reasons[insp.rejectionReason] || 0) + 1;
      }
    }
    return acc;
  }, {});

  const partData = Object.values(partSummary).map((part: any) => ({
    ...part,
    topReason: Object.entries(part.reasons).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || '-',
  }));

  const exportCSV = (data: any[], filename: string) => {
    const headers = Object.keys(data[0] || {});
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(h => row[h]).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Quality Reports</h1>
        <p className="text-muted-foreground mt-1">Comprehensive quality analytics and reports</p>
      </div>

      <Tabs defaultValue="daily" className="space-y-4">
        <TabsList>
          <TabsTrigger value="daily">Daily Summary</TabsTrigger>
          <TabsTrigger value="inspector">Inspector-wise</TabsTrigger>
          <TabsTrigger value="part">Part-wise Rejection</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Daily Inspection Summary</CardTitle>
              <Button onClick={() => exportCSV(dailyData, 'daily-inspection-summary.csv')}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Total Batches</TableHead>
                    <TableHead>OK Quantity</TableHead>
                    <TableHead>NOT OK Quantity</TableHead>
                    <TableHead>Rejection %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    dailyData.map((day: any, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{day.date}</TableCell>
                        <TableCell>{day.batches}</TableCell>
                        <TableCell className="text-green-600">{day.okQty}</TableCell>
                        <TableCell className="text-red-600">{day.notOkQty}</TableCell>
                        <TableCell>{day.rejectionPercent}%</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inspector">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Inspector-wise Report</CardTitle>
              <Button onClick={() => exportCSV(inspectorData, 'inspector-wise-report.csv')}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Inspector</TableHead>
                    <TableHead>Total Inspections</TableHead>
                    <TableHead>OK Quantity</TableHead>
                    <TableHead>NOT OK Quantity</TableHead>
                    <TableHead>Average OK %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inspectorData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    inspectorData.map((insp: any, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{insp.inspector}</TableCell>
                        <TableCell>{insp.inspections}</TableCell>
                        <TableCell className="text-green-600">{insp.okQty}</TableCell>
                        <TableCell className="text-red-600">{insp.notOkQty}</TableCell>
                        <TableCell>{insp.okPercent}%</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="part">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Part-wise Rejection Analysis</CardTitle>
              <Button onClick={() => exportCSV(partData, 'part-wise-rejection.csv')}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part No</TableHead>
                    <TableHead>Part Name</TableHead>
                    <TableHead>Total Inspections</TableHead>
                    <TableHead>Total Rejected</TableHead>
                    <TableHead>Top Rejection Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    partData.map((part: any, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{part.partNo}</TableCell>
                        <TableCell>{part.partName}</TableCell>
                        <TableCell>{part.inspections}</TableCell>
                        <TableCell className="text-red-600">{part.rejected}</TableCell>
                        <TableCell>{part.topReason}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
