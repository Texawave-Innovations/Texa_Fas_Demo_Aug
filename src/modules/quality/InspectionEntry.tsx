'use client';

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { getRecord, updateRecord, createRecord } from '@/services/firebase';
import { uploadImage } from '@/services/cloudinary';
import { useMasterData } from '@/context/MasterDataContext';

export default function InspectionEntry() {
  const { inspectionId } = useParams();
  const navigate = useNavigate();
  const { masterData } = useMasterData();

  const [inspection, setInspection] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    inspectorName: '',
    inspectionDate: new Date().toISOString().split('T')[0],
    okQty: 0,
    notOkQty: 0,
    rejectionReason: '',
    remarks: '',
    images: [] as string[],
  });

  // Load inspection
  useEffect(() => {
    if (inspectionId) fetchInspection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionId]);

  const fetchInspection = async () => {
    if (!inspectionId) return;
    const data = await getRecord('quality/inspections', inspectionId);

    if (!data) return;

    setInspection(data);

    setFormData({
      inspectorName: data.inspectorName || '',
      inspectionDate: data.inspectionDate || new Date().toISOString().split('T')[0],
      okQty: data.okQty || 0,
      notOkQty: data.notOkQty || 0,
      rejectionReason: data.rejectionReason || '',
      remarks: data.remarks || '',
      images: data.images || [],
    });
  };

  const qtyReceived = inspection?.qty || 0;

  // Quantity logic
  const handleQtyChange = (field: 'okQty' | 'notOkQty', value: number) => {
    let v = Number(value);
    if (v < 0) v = 0;
    if (v > qtyReceived) v = qtyReceived;

    if (field === 'okQty') {
      setFormData({
        ...formData,
        okQty: v,
        notOkQty: qtyReceived - v,
      });
    } else {
      setFormData({
        ...formData,
        notOkQty: v,
        okQty: qtyReceived - v,
      });
    }
  };

  // Image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);

    try {
      const urls = await Promise.all(Array.from(files).map((file) => uploadImage(file)));

      setFormData((prev) => ({
        ...prev,
        images: [...prev.images, ...urls],
      }));

      toast({ title: 'Images uploaded successfully' });
    } catch (err) {
      toast({ title: 'Image upload failed', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  // Submit QC inspection
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inspection) return;

    if (formData.okQty + formData.notOkQty !== qtyReceived) {
      toast({
        title: `OK + NOT OK must equal ${qtyReceived}`,
        variant: 'destructive',
      });
      return;
    }

    try {
      // 1) Update the inspection record
      await updateRecord('quality/inspections', inspectionId!, {
        ...formData,
        qcStatus: 'completed',
        updatedAt: Date.now(),
        // ensure orderId is never undefined in inspections
        orderId: inspection.orderId ?? null,
      });

      // 2) Add FG stock (always safe, even for direct-from-products jobs)
      if (formData.okQty > 0) {
        await createRecord('stores/fg', {
          orderId: inspection.orderId ?? null,
          jobId: inspection.jobId,
          soNumber: inspection.soNumber,
          productId: inspection.productId,
          productCode: inspection.productCode,
          originalqty: formData.okQty,
          productName: inspection.productName,
          quantity: formData.okQty,
          qc: 'ok',
          timestamp: Date.now(),
        });
      }

      // 3) Add Scrap
      if (formData.notOkQty > 0) {
        await createRecord('stores/scrap', {
          orderId: inspection.orderId ?? null,
          jobId: inspection.jobId,
          soNumber: inspection.soNumber,
          productId: inspection.productId,
          productName: inspection.productName,
          quantity: formData.notOkQty,
          reason: formData.rejectionReason,
          timestamp: Date.now(),
        });
      }

      // 4 & 5) Order-level QC updates ONLY when this inspection is linked to a real order
      if (inspection.orderId) {
        // 4) Update order header QC status
        await updateRecord('sales/orderAcknowledgements', inspection.orderId, {
          qcStatus: 'completed',
          status: 'QC Completed',
          updatedAt: Date.now(),
        });

        // 5) Update item-level QC summary inside orderAcknowledgement
        const orderData = await getRecord(
          'sales/orderAcknowledgements',
          inspection.orderId
        );

        if (orderData && Array.isArray(orderData.items)) {
          const index = orderData.items.findIndex(
            (item: any) =>
              item.sku === inspection.productId ||
              item.productDescription === inspection.productName
          );

          if (index !== -1) {
            orderData.items[index].okQty = formData.okQty;
            orderData.items[index].notOkQty = formData.notOkQty;
            orderData.items[index].qcStatus = 'completed';
          }

          await updateRecord('sales/orderAcknowledgements', inspection.orderId, {
            items: orderData.items,
            updatedAt: Date.now(),
          });
        }
      }

      toast({ title: 'Inspection completed successfully' });
      navigate('/quality/incoming');
    } catch (err) {
      console.error(err);
      toast({ title: 'Failed to save inspection', variant: 'destructive' });
    }
  };

  if (!inspection) return <div>Loading…</div>;

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => navigate('/quality/incoming')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <h1 className="text-2xl font-bold">QC Inspection Entry</h1>
      </div>

      {/* Inspection Info */}
      <Card>
        <CardHeader>
          <CardTitle>Order Info</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">SO Number</span>
            <p className="font-semibold">
              {inspection.soNumber || (inspection.orderId ? '' : 'DIRECT')}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Product</span>
            <p className="font-semibold">{inspection.productName}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Qty Received</span>
            <p className="font-bold text-lg">{qtyReceived}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Status</span>
            <p className="font-semibold capitalize">{inspection.qcStatus}</p>
          </div>
        </CardContent>
      </Card>

      {/* QC Form */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Inspection Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <Label>Inspector Name *</Label>
                <Input
                  value={formData.inspectorName}
                  onChange={(e) =>
                    setFormData({ ...formData, inspectorName: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <Label>Inspection Date *</Label>
                <Input
                  type="date"
                  value={formData.inspectionDate}
                  onChange={(e) =>
                    setFormData({ ...formData, inspectionDate: e.target.value })
                  }
                  required
                />
              </div>
            </div>

            {/* Qty Inputs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label>OK Qty</Label>
                <Input
                  type="number"
                  value={formData.okQty}
                  onChange={(e) =>
                    handleQtyChange('okQty', Number(e.target.value))
                  }
                  min={0}
                  max={qtyReceived}
                />
              </div>
              <div>
                <Label>NOT OK Qty</Label>
                <Input
                  type="number"
                  value={formData.notOkQty}
                  onChange={(e) =>
                    handleQtyChange('notOkQty', Number(e.target.value))
                  }
                  min={0}
                  max={qtyReceived}
                />
              </div>
              <div className="flex items-end">
                <p className="text-sm text-muted-foreground">
                  Total: {formData.okQty + formData.notOkQty} / {qtyReceived}
                </p>
              </div>
            </div>

            {/* Rejection Reason */}
            {formData.notOkQty > 0 && (
              <div>
                <Label>Rejection Reason *</Label>
                <Select
                  value={formData.rejectionReason}
                  onValueChange={(v) =>
                    setFormData({ ...formData, rejectionReason: v })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {(masterData?.quality?.rejectionReasons || []).map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Remarks */}
            <div>
              <Label>Remarks</Label>
              <Textarea
                value={formData.remarks}
                onChange={(e) =>
                  setFormData({ ...formData, remarks: e.target.value })
                }
                rows={3}
              />
            </div>

            {/* Image Upload */}
            <div>
              <Label>Upload Images</Label>
              <Input
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploading}
              />
              {uploading && (
                <p className="text-sm text-muted-foreground">Uploading…</p>
              )}

              {formData.images.length > 0 && (
                <div className="flex gap-2 mt-4 flex-wrap">
                  {formData.images.map((url, idx) => (
                    <img
                      key={idx}
                      src={url}
                      alt={`img-${idx}`}
                      className="h-20 w-20 object-cover rounded border"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Submit */}
            <Button type="submit" size="lg" className="w-full">
              <Save className="h-5 w-5 mr-2" />
              Complete Inspection
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
