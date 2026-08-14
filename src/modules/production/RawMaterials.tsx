import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { toast } from '@/hooks/use-toast';
import { RawMaterial } from '@/types';
import { createRecord } from '@/services/firebase';
import { database } from '@/services/firebase';
import { ref, onValue, off } from 'firebase/database';
import { useMasterData } from '@/context/MasterDataContext';

export default function RawMaterials() {
  const { masterData } = useMasterData();
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [materialForm, setMaterialForm] = useState({
    compoundCode: '',
    qty: 0,
    shelfLife: '',
    batchNumber: '',
    location: '',
  });

  useEffect(() => {
    const rawRef = ref(database, 'stores/raw');
    const unsubscribe = onValue(rawRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const rawList = Object.keys(data).map(key => ({ ...data[key], id: key }))
          .sort((a, b) => b.createdAt - a.createdAt);
        setRawMaterials(rawList);
      } else {
        setRawMaterials([]);
      }
    });

    return () => off(rawRef, 'value', unsubscribe);
  }, []);

  const addMaterial = async () => {
    if (!materialForm.compoundCode || !materialForm.qty) {
      toast({ title: 'Please fill all required fields', variant: 'destructive' });
      return;
    }

    await createRecord('stores/raw', materialForm);

    setShowDialog(false);
    setMaterialForm({
      compoundCode: '',
      qty: 0,
      shelfLife: '',
      batchNumber: '',
      location: '',
    });
    toast({ title: 'Raw material added successfully' });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Raw Materials
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Raw Material
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Raw Material</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Compound Code</Label>
                    <SearchableSelect
                      value={materialForm.compoundCode}
                      onValueChange={(v) => setMaterialForm({ ...materialForm, compoundCode: v })}
                      options={(masterData?.production?.compoundCodes ?? []).map((code: string) => ({ value: code, label: code }))}
                      placeholder="Select compound"
                    />
                  </div>
                  <div>
                    <Label>Quantity (kg)</Label>
                    <Input
                      type="number"
                      value={materialForm.qty}
                      onChange={(e) => setMaterialForm({ ...materialForm, qty: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Shelf Life</Label>
                    <Input
                      placeholder="e.g., 12 Months"
                      value={materialForm.shelfLife}
                      onChange={(e) => setMaterialForm({ ...materialForm, shelfLife: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Batch Number</Label>
                    <Input
                      value={materialForm.batchNumber}
                      onChange={(e) => setMaterialForm({ ...materialForm, batchNumber: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Storage Location</Label>
                    <SearchableSelect
                      value={materialForm.location}
                      onValueChange={(v) => setMaterialForm({ ...materialForm, location: v })}
                      options={(masterData?.stores?.stockLocations ?? []).map((loc: string) => ({ value: loc, label: loc }))}
                      placeholder="Select location"
                    />
                  </div>
                  <Button onClick={addMaterial} className="w-full">Add Material</Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Compound Code</TableHead>
                <TableHead>Quantity (kg)</TableHead>
                <TableHead>Batch Number</TableHead>
                <TableHead>Shelf Life</TableHead>
                <TableHead>Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rawMaterials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No raw materials found
                  </TableCell>
                </TableRow>
              ) : (
                rawMaterials.map(material => (
                  <TableRow key={material.id}>
                    <TableCell className="font-medium">{material.compoundCode}</TableCell>
                    <TableCell>{material.qty}</TableCell>
                    <TableCell>{material.batchNumber}</TableCell>
                    <TableCell>{material.shelfLife}</TableCell>
                    <TableCell>{material.location}</TableCell>
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
