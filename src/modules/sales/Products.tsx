'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { RowActions } from '@/components/ui/row-actions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Edit,
  Trash2,
  Search,
  Ruler,
  Upload,
  X,
  Image as ImageIcon,
  Wrench,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { Product } from '@/types';
import { createRecord, updateRecord, deleteRecord, getAllRecords } from '@/services/firebase';
import { useMasterData } from '@/context/MasterDataContext';

// Cloudinary Config
const CLOUDINARY_CLOUD_NAME = 'dpgf1rkjl';
const CLOUDINARY_UPLOAD_PRESET = 'unsigned_preset';

const uploadToCloudinary = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const resourceType = file.type.startsWith('image/') ? 'image' : 'raw';

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Upload failed');
  }
  const data = await response.json();
  return data.secure_url;
};

// Initial item structure
const getInitialItem = () => ({
  productCode: '',
  category: '',
  type: '',
  group: '',
  unitPrice: '',
  unit: 'pcs',
  stockQty: '',
  innerDiameter: '',
  outerDiameter: '',
  thickness: '',
  innerDiameterUnit: 'mm',
  outerDiameterUnit: 'mm',
  thicknessUnit: 'mm',
  images: [] as string[],
  drawings: [] as string[],
});

export default function Products() {
  const { masterData } = useMasterData();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Main product name and images
  const [productName, setProductName] = useState('');
  const [productImages, setProductImages] = useState<string[]>([]);

  // Dynamic items list with individual images
  const [items, setItems] = useState([getInitialItem()]);

  const [uploading, setUploading] = useState(false);

  const productImageInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const pdfInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  const HSN_CODE = '39269099';

  // Production Job Dialog
  const [prodDialogOpen, setProdDialogOpen] = useState(false);
  const [prodTargetProduct, setProdTargetProduct] = useState<any>(null);
  const [prodTargetItem, setProdTargetItem] = useState<any>(null);
  const [prodQty, setProdQty] = useState<string>('');
  const [prodDeliveryDate, setProdDeliveryDate] = useState<string>('');
  const [prodPriority, setProdPriority] = useState<'normal' | 'high'>('normal');

  useEffect(() => {
    loadProducts();
  }, []);

  // Reset form when dialog closes
  useEffect(() => {
    if (!dialogOpen) {
      resetForm();
    }
  }, [dialogOpen]);

  const loadProducts = async () => {
    try {
      const data = await getAllRecords('sales/products');
      setProducts(data as Product[]);
    } catch (error) {
      toast.error('Failed to load products');
    }
  };

  const handleProductImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploadPromises = Array.from(files).map((file) => uploadToCloudinary(file));
      const urls = await Promise.all(uploadPromises);
      setProductImages([...productImages, ...urls]);
      toast.success(`${urls.length} product image(s) uploaded`);
    } catch (error) {
      toast.error('Failed to upload product image(s)');
    } finally {
      setUploading(false);
    }
  };

  const removeProductImage = (fileIndex: number) => {
    setProductImages(productImages.filter((_, i) => i !== fileIndex));
  };

  const handleFileUpload = async (files: FileList | null, type: 'image' | 'pdf', itemIndex: number) => {
    if (!files || files.length === 0) return;
    setUploading(true);

    try {
      const uploadPromises = Array.from(files).map((file) => uploadToCloudinary(file));
      const urls = await Promise.all(uploadPromises);

      const newItems = [...items];
      if (type === 'image') {
        newItems[itemIndex].images = [...newItems[itemIndex].images, ...urls];
        toast.success(`${urls.length} item image(s) uploaded`);
      } else {
        newItems[itemIndex].drawings = [...newItems[itemIndex].drawings, ...urls];
        toast.success(`${urls.length} drawing(s) uploaded`);
      }
      setItems(newItems);
    } catch (error) {
      toast.error('Failed to upload file(s)');
    } finally {
      setUploading(false);
    }
  };

  const removeFile = (type: 'image' | 'pdf', itemIndex: number, fileIndex: number) => {
    const newItems = [...items];
    if (type === 'image') {
      newItems[itemIndex].images = newItems[itemIndex].images.filter((_, i) => i !== fileIndex);
    } else {
      newItems[itemIndex].drawings = newItems[itemIndex].drawings.filter((_, i) => i !== fileIndex);
    }
    setItems(newItems);
  };

  const handleAddItem = () => {
    setItems([...items, getInitialItem()]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) {
      toast.error('At least one item is required');
      return;
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!productName.trim()) {
      toast.error('Product Name is required');
      return;
    }

    if (items.some(item => !item.productCode || !item.unitPrice || !item.stockQty)) {
      toast.error('Please fill all required fields (Product Code, Unit Price, Stock Qty) for each item');
      return;
    }

    try {
      const submitData = {
        name: productName.trim(),
        productImages: productImages.length > 0 ? productImages : null,
        items: items.map(item => ({
          productCode: item.productCode.trim().toUpperCase(),
          hsn: HSN_CODE,
          unitPrice: parseFloat(item.unitPrice),
          stockQty: parseInt(item.stockQty, 10),
          unit: item.unit,
          category: item.category || null,
          type: item.type || null,
          group: item.group || null,
          images: item.images.length > 0 ? item.images : null,
          drawings: item.drawings.length > 0 ? item.drawings : null,
          size: {
            height: item.innerDiameter ? parseFloat(item.innerDiameter) : null,
            width: null,
            length: item.thickness ? parseFloat(item.thickness) : null,
            weight: item.outerDiameter ? parseFloat(item.outerDiameter) : null,
            heightUnit: item.innerDiameter ? item.innerDiameterUnit : null,
            widthUnit: null,
            lengthUnit: item.thickness ? item.thicknessUnit : null,
            weightUnit: item.outerDiameter ? item.outerDiameterUnit : null,
          },
        })),
        createdAt: editingProduct ? (editingProduct as any).createdAt : Date.now(),
        updatedAt: Date.now(),
      };

      if (editingProduct) {
        await updateRecord('sales/products', editingProduct.id!, submitData);
        toast.success('Product updated successfully');
      } else {
        await createRecord('sales/products', submitData);
        toast.success('Product created successfully');
      }

      setDialogOpen(false);
      loadProducts();
    } catch (error) {
      toast.error('Failed to save product');
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    const productData = product as any;
    const productItems = productData.items || [];

    setProductName(product.name || '');
    setProductImages(productData.productImages || []);

    if (productItems.length > 0) {
      setItems(
        productItems.map((item: any) => ({
          productCode: item.productCode || '',
          category: item.category || '',
          type: item.type || '',
          group: item.group || '',
          unitPrice: item.unitPrice?.toString() || '',
          unit: item.unit || 'pcs',
          stockQty: item.stockQty?.toString() || '',
          innerDiameter: (item.size?.height || '').toString(),
          outerDiameter: (item.size?.weight || '').toString(),
          thickness: (item.size?.length || '').toString(),
          innerDiameterUnit: item.size?.heightUnit || 'mm',
          outerDiameterUnit: item.size?.weightUnit || 'mm',
          thicknessUnit: item.size?.lengthUnit || 'mm',
          images: item.images || [],
          drawings: item.drawings || [],
        }))
      );
    } else {
      setItems([getInitialItem()]);
    }

    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product and all its items?')) return;
    try {
      await deleteRecord('sales/products', id);
      toast.success('Product deleted successfully');
      loadProducts();
    } catch (error) {
      toast.error('Failed to delete product');
    }
  };

  const resetForm = () => {
    setEditingProduct(null);
    setProductName('');
    setProductImages([]);
    setItems([getInitialItem()]);
  };

  const resetProdForm = () => {
    setProdTargetProduct(null);
    setProdTargetItem(null);
    setProdQty('');
    setProdDeliveryDate('');
    setProdPriority('normal');
  };

  // Flatten products into items for table display
  const flattenedItems = products.flatMap((product: any) => {
    const productItems = product.items || [];
    return productItems.map((item: any, itemIndex: number) => ({
      ...item,
      productId: product.id,
      productName: product.name,
      productImages: product.productImages || [],
      itemIndex,
      totalItems: productItems.length,
    }));
  });

  const filteredItems = flattenedItems.filter(
    (item: any) =>
      item.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.productCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.group?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatSize = (size: any) => {
    if (!size) return '—';
    const parts: string[] = [];
    if (size.height) parts.push(`ID:${size.height}${size.heightUnit || ''}`);
    if (size.weight) parts.push(`OD:${size.weight}${size.weightUnit || ''}`);
    if (size.length) parts.push(`T:${size.length}${size.lengthUnit || ''}`);
    return parts.join(' × ') || '—';
  };

  const handleCreateProductionJob = async () => {
    if (!prodTargetItem) {
      toast.error('No item selected');
      return;
    }
    const qtyNum = Number(prodQty || 0);
    if (!qtyNum || qtyNum <= 0) {
      toast.error('Enter a valid quantity');
      return;
    }

    try {
      const now = Date.now();
      const productId = prodTargetItem.productCode;
      const productName = `${prodTargetProduct.name} - ${prodTargetItem.productCode}`;
      const unitRate = Number(prodTargetItem.unitPrice || 0);
      const netAmount = unitRate * qtyNum;

      await createRecord('production/jobs', {
        orderId: null,
        soNumber: null,
        customerName: null,
        productId,
        productName,
        qty: qtyNum,
        hsnCode: HSN_CODE,
        unitRate,
        netAmount,
        deliveryDate: prodDeliveryDate || null,
        priority: prodPriority,
        status: 'not_started',
        createdAt: now,
      });

      toast.success(`Production job created for ${productName}`);
      setProdDialogOpen(false);
      resetProdForm();
    } catch (err) {
      toast.error('Failed to create production job');
    }
  };

  const salesMasters: any = masterData?.sales || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Items</h1>
          <p className="text-muted-foreground mt-1">Manage your item catalog</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-5xl max-h-screen overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Product Name */}
              <div className="space-y-2">
                <Label htmlFor="productName">Product Name <span className="text-red-500">*</span></Label>
                <Input
                  id="productName"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  required
                  placeholder="e.g., Bolt Net"
                />
              </div>

              {/* Product-Level Images - Now in prominent card */}
              <Card className="bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 border-2 border-green-200">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-600 rounded-lg">
                      <ImageIcon className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-green-900">Product Images</h3>
                      <p className="text-sm text-green-700">Common images displayed for all item variants</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div
                    className="border-2 border-dashed border-green-300 rounded-lg p-8 text-center cursor-pointer hover:border-green-500 hover:bg-green-50/50 transition-all bg-white"
                    onClick={() => productImageInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleProductImageUpload(e.dataTransfer.files);
                    }}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-3 bg-green-100 rounded-full">
                        <Upload className="h-8 w-8 text-green-600" />
                      </div>
                      <p className="text-base font-semibold text-green-900">Upload Product Images</p>
                      <p className="text-sm text-green-700">Click to upload or drag and drop images here</p>
                      <p className="text-xs text-muted-foreground mt-1">These images will be displayed across all item variants</p>
                    </div>
                    <input
                      ref={productImageInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleProductImageUpload(e.target.files)}
                    />
                  </div>

                  {productImages.length > 0 && (
                    <div className="grid grid-cols-5 gap-4">
                      {productImages.map((url, imgIndex) => (
                        <div key={imgIndex} className="relative group rounded-lg overflow-hidden border-2 border-green-300 shadow-md">
                          <img src={url} alt={`Product - ${imgIndex + 1}`} className="w-full h-28 object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all" />
                          <button
                            type="button"
                            onClick={() => removeProductImage(imgIndex)}
                            className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <div className="absolute bottom-2 left-2 bg-green-600 text-white text-xs px-2 py-1 rounded-full font-medium">
                            #{imgIndex + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Dynamic Items List */}
              <div className="border-t pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Items</h3>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                </div>

                {items.map((item, index) => (
                  <div key={index} className="border p-4 rounded-lg space-y-4 mb-4 bg-gradient-to-r from-blue-50 to-gray-50">
                    <div className="flex justify-between items-center">
                      <h4 className="font-semibold text-blue-700">Item {index + 1}</h4>
                      {items.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveItem(index)}>
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`productCode-${index}`}>Product Code <span className="text-red-500">*</span></Label>
                        <Input
                          id={`productCode-${index}`}
                          value={item.productCode}
                          onChange={(e) => handleItemChange(index, 'productCode', e.target.value.toUpperCase())}
                          required
                          placeholder="e.g., FAS001"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Item Category</Label>
                        <Select value={item.category} onValueChange={(v) => handleItemChange(index, 'category', v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {(salesMasters.itemCategories || ['DASS SEAL BASE', 'EPDM BASE', 'FKM BASE', 'HNBR BASE', 'JOB WORK', 'NBR BASE', 'NEOPRENE BASE', 'PTFE BASE', 'PU BASE', 'SILICONE BASE', 'VITON BASE', 'DELRIN POM BASE']).map((cat: string) => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Item Type</Label>
                        <Select value={item.type} onValueChange={(v) => handleItemChange(index, 'type', v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {(salesMasters.itemTypes || ['FINISHED GOODS', 'SEMI FINISHED GOODS', 'PURCHASE ITEM', 'TOOLS']).map((type: string) => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Item Group</Label>
                        <Select value={item.group} onValueChange={(v) => handleItemChange(index, 'group', v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select group" />
                          </SelectTrigger>
                          <SelectContent>
                            {(salesMasters.itemGroups || ['c', '3 TYPE', '8 TYPE', 'BACKUP RING', 'BONDED SEAL', 'BUSH', 'CUP SEAL', 'D RING', 'GASKET', 'GLAND SEAL', 'L TYPE', 'O-RING', 'OIL SEAL', 'OTHERS', 'PISTON SEAL']).map((group: string) => (
                              <SelectItem key={group} value={group}>{group}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`unitPrice-${index}`}>Unit Price (₹) <span className="text-red-500">*</span></Label>
                        <Input
                          id={`unitPrice-${index}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`unit-${index}`}>Unit <span className="text-red-500">*</span></Label>
                        <Select value={item.unit} onValueChange={(v) => handleItemChange(index, 'unit', v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(salesMasters.units || ['kg', 'litres', 'SET', 'GRM', 'NOS', 'pcs']).map((uom: string) => (
                              <SelectItem key={uom} value={uom}>{uom}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`stockQty-${index}`}>Opening Stock <span className="text-red-500">*</span></Label>
                        <Input
                          id={`stockQty-${index}`}
                          type="number"
                          min="0"
                          value={item.stockQty}
                          onChange={(e) => handleItemChange(index, 'stockQty', e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    {/* Dimensions - ID, OD, Thickness */}
                    <div className="border-t pt-4 mt-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Ruler className="h-4 w-4 text-muted-foreground" />
                        <h4 className="font-semibold text-sm">Product Dimensions (Optional)</h4>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`innerDiameter-${index}`} className="text-xs">Inner Diameter (ID)</Label>
                          <div className="flex gap-2">
                            <Input
                              id={`innerDiameter-${index}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.innerDiameter}
                              onChange={(e) => handleItemChange(index, 'innerDiameter', e.target.value)}
                              className="text-sm"
                              placeholder="ID"
                            />
                            <Select value={item.innerDiameterUnit} onValueChange={(v) => handleItemChange(index, 'innerDiameterUnit', v)}>
                              <SelectTrigger className="w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="mm">mm</SelectItem>
                                <SelectItem value="cm">cm</SelectItem>
                                <SelectItem value="inch">inch</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`outerDiameter-${index}`} className="text-xs">Outer Diameter (OD)</Label>
                          <div className="flex gap-2">
                            <Input
                              id={`outerDiameter-${index}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.outerDiameter}
                              onChange={(e) => handleItemChange(index, 'outerDiameter', e.target.value)}
                              className="text-sm"
                              placeholder="OD"
                            />
                            <Select value={item.outerDiameterUnit} onValueChange={(v) => handleItemChange(index, 'outerDiameterUnit', v)}>
                              <SelectTrigger className="w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="mm">mm</SelectItem>
                                <SelectItem value="cm">cm</SelectItem>
                                <SelectItem value="inch">inch</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`thickness-${index}`} className="text-xs">Thickness</Label>
                          <div className="flex gap-2">
                            <Input
                              id={`thickness-${index}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.thickness}
                              onChange={(e) => handleItemChange(index, 'thickness', e.target.value)}
                              className="text-sm"
                              placeholder="Thickness"
                            />
                            <Select value={item.thicknessUnit} onValueChange={(v) => handleItemChange(index, 'thicknessUnit', v)}>
                              <SelectTrigger className="w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="mm">mm</SelectItem>
                                <SelectItem value="cm">cm</SelectItem>
                                <SelectItem value="inch">inch</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Item-specific Images */}
                    <div className="space-y-4 border-t pt-4">
                      <Label>Item-Specific Images (Optional)</Label>
                      <p className="text-xs text-muted-foreground">Upload images specific to this item variant</p>
                      <div
                        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => imageInputRefs.current[index]?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleFileUpload(e.dataTransfer.files, 'image', index);
                        }}
                      >
                        <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-xs text-muted-foreground">Click to upload or drag images</p>
                        <input
                          ref={(el) => (imageInputRefs.current[index] = el)}
                          type="file"
                          multiple
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleFileUpload(e.target.files, 'image', index)}
                        />
                      </div>

                      {item.images.length > 0 && (
                        <div className="grid grid-cols-4 gap-3">
                          {item.images.map((url, imgIndex) => (
                            <div key={imgIndex} className="relative group rounded-lg overflow-hidden border">
                              <img src={url} alt={`Item ${index + 1} - ${imgIndex + 1}`} className="w-full h-24 object-cover" />
                              <button
                                type="button"
                                onClick={() => removeFile('image', index, imgIndex)}
                                className="absolute top-1 right-1 bg-black/70 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Item-specific Technical Drawings */}
                    <div className="space-y-4 border-t pt-4">
                      <Label>Technical Drawings (PDF - Optional)</Label>
                      <div
                        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => pdfInputRefs.current[index]?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleFileUpload(e.dataTransfer.files, 'pdf', index);
                        }}
                      >
                        <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-xs text-muted-foreground">Click to upload or drag PDFs</p>
                        <input
                          ref={(el) => (pdfInputRefs.current[index] = el)}
                          type="file"
                          multiple
                          accept=".pdf"
                          className="hidden"
                          onChange={(e) => handleFileUpload(e.target.files, 'pdf', index)}
                        />
                      </div>

                      {item.drawings.length > 0 && (
                        <div className="space-y-2">
                          {item.drawings.map((url, drawIndex) => (
                            <div key={drawIndex} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                              <div className="flex items-center gap-2">
                                <FileText className="h-6 w-6 text-red-600" />
                                <div>
                                  <p className="text-xs font-medium">Drawing {drawIndex + 1}</p>
                                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                                    View PDF
                                  </a>
                                </div>
                              </div>
                              <Button size="sm" variant="ghost" onClick={() => removeFile('pdf', index, drawIndex)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-6">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={uploading}>
                  {editingProduct ? 'Update' : 'Create'} Product
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, product code, category, type, or group..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Images</TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Product Code</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    No products found
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item: any, idx: number) => {
                  const product = products.find((p: any) => p.id === item.productId) as any;
                  const productImages = item.productImages || [];
                  const itemImages = item.images || [];
                  const isFirstItemOfProduct = item.itemIndex === 0;

                  return (
                    <TableRow key={`${item.productId}-${idx}`}>
                      <TableCell>
                        <div className="flex gap-2">
                          {/* Product-level image in distinct card */}
                          {isFirstItemOfProduct && productImages.length > 0 && (
                            <div className="relative group">
                              <div className="w-16 h-16 rounded-lg overflow-hidden border-2 border-green-500 shadow-md">
                                <img
                                  src={productImages[0]}
                                  alt={item.productName}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              {productImages.length > 1 && (
                                <div className="absolute -bottom-1 -right-1 bg-green-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold shadow-lg">
                                  +{productImages.length - 1}
                                </div>
                              )}
                              <div className="absolute inset-0 bg-green-500/0 group-hover:bg-green-500/10 transition-all rounded-lg" />
                            </div>
                          )}

                          {/* Item-specific image */}
                          {itemImages.length > 0 ? (
                            <div className="relative group">
                              <div className="w-16 h-16 rounded-lg overflow-hidden border-2 border-blue-500 shadow-md">
                                <img
                                  src={itemImages[0]}
                                  alt={`${item.productCode}`}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              {itemImages.length > 1 && (
                                <div className="absolute -bottom-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold shadow-lg">
                                  +{itemImages.length - 1}
                                </div>
                              )}
                              <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/10 transition-all rounded-lg" />
                            </div>
                          ) : (
                            !isFirstItemOfProduct || productImages.length === 0 ? (
                              <div className="w-16 h-16 bg-muted rounded-md flex items-center justify-center border">
                                <ImageIcon className="h-6 w-6 text-muted-foreground" />
                              </div>
                            ) : null
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {isFirstItemOfProduct && (
                          <div>
                            <div>{item.productName}</div>
                            {item.totalItems > 1 && (
                              <div className="text-xs text-muted-foreground">
                                ({item.totalItems} variants)
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{item.productCode}</TableCell>
                      <TableCell className="text-sm">{item.category || '—'}</TableCell>
                      <TableCell className="text-sm">{item.type || '—'}</TableCell>
                      <TableCell className="text-sm">{item.group || '—'}</TableCell>
                      <TableCell className="text-xs">{formatSize(item.size)}</TableCell>
                      <TableCell>₹{Number(item.unitPrice || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {item.stockQty} <span className="text-xs text-muted-foreground">{item.unit}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center">
                          <RowActions
                            actions={[
                              { label: 'Edit', icon: Edit, onClick: () => product && handleEdit(product), hidden: !isFirstItemOfProduct },
                              { label: 'Delete', icon: Trash2, onClick: () => handleDelete(item.productId), className: 'text-red-600 hover:text-red-700', hidden: !isFirstItemOfProduct },
                              {
                                label: 'Create Production Job',
                                icon: Wrench,
                                onClick: () => {
                                  setProdTargetProduct(product);
                                  setProdTargetItem(item);
                                  setProdQty('');
                                  setProdDeliveryDate('');
                                  setProdPriority('normal');
                                  setProdDialogOpen(true);
                                },
                              },
                            ]}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Production Job Dialog */}
      <Dialog open={prodDialogOpen} onOpenChange={(open) => {
        setProdDialogOpen(open);
        if (!open) resetProdForm();
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Production Job</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {prodTargetItem && (
              <div className="text-sm p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="font-semibold text-base">{prodTargetProduct?.name}</p>
                <div className="mt-2 space-y-1">
                  <p className="text-xs"><span className="font-medium">Code:</span> <span className="font-mono">{prodTargetItem.productCode}</span></p>
                  <p className="text-xs"><span className="font-medium">Category:</span> {prodTargetItem.category}</p>
                  <p className="text-xs"><span className="font-medium">Type:</span> {prodTargetItem.type}</p>
                  <p className="text-xs"><span className="font-medium">Unit Price:</span> ₹{prodTargetItem.unitPrice}</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="prodQty">Quantity to Produce</Label>
              <Input
                id="prodQty"
                type="number"
                min="1"
                value={prodQty}
                onChange={(e) => setProdQty(e.target.value)}
                placeholder="e.g., 100"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prodDeliveryDate">Target Delivery Date (Optional)</Label>
              <Input
                id="prodDeliveryDate"
                type="date"
                value={prodDeliveryDate}
                onChange={(e) => setProdDeliveryDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={prodPriority} onValueChange={(v) => setProdPriority(v as 'normal' | 'high')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setProdDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateProductionJob}>
                Create Job
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
