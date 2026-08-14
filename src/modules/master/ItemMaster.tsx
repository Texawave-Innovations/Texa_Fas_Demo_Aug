'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  Power,
  Search,
  Ruler,
  Upload,
  X,
  Image as ImageIcon,
  Wrench,
  FileText,
  Boxes,
} from 'lucide-react';
import { toast } from 'sonner';
import { Product } from '@/types';
import { createRecord, updateRecord, getAllRecords } from '@/services/firebase';
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

export default function ItemMaster() {
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

    // Check for duplicates (case-insensitive)
    try {
      const existingProducts = await getAllRecords('sales/products');

      const isDuplicateName = existingProducts.some((p: any) =>
        p.id !== editingProduct?.id &&
        p.name?.trim().toLowerCase() === productName.trim().toLowerCase()
      );
      if (isDuplicateName) {
        toast.error("Duplicate entries are not allowed. Product with this Name already exists.");
        return;
      }

      // Check duplicate product codes inside variant items
      const codesInNewItems = items.map(it => it.productCode.trim().toLowerCase());
      const hasLocalDuplicates = new Set(codesInNewItems).size !== codesInNewItems.length;
      if (hasLocalDuplicates) {
        toast.error("Duplicate Product Codes are not allowed in the variant list.");
        return;
      }

      const isDuplicateCode = existingProducts.some((p: any) =>
        p.id !== editingProduct?.id &&
        (p.items || []).some((it: any) => codesInNewItems.includes(it.productCode?.trim().toLowerCase()))
      );
      if (isDuplicateCode) {
        toast.error("Duplicate entries are not allowed. One or more Product Codes already exist in other items.");
        return;
      }
    } catch (err) {
      console.error("Duplicate check failed:", err);
      toast.error("Failed to perform duplicate check validation.");
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
        status: editingProduct ? (editingProduct as any).status || 'active' : 'active',
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

  const toggleStatus = async (product: any) => {
    const newStatus = product.status === 'inactive' ? 'active' : 'inactive';
    try {
      await updateRecord('sales/products', product.id, { status: newStatus });
      toast.success(`Product marked as ${newStatus}`);
      loadProducts();
    } catch (error) {
      toast.error('Failed to update product status');
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

  // Flatten products into items for display
  const flattenedItems = products.flatMap((product: any) => {
    const productItems = product.items || [];
    return productItems.map((item: any, itemIndex: number) => ({
      ...item,
      productId: product.id,
      productName: product.name,
      productImages: product.productImages || [],
      itemIndex,
      totalItems: productItems.length,
      productStatus: product.status || 'active',
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
    if (size.height) parts.push(`ID: ${size.height}${size.heightUnit || ''}`);
    if (size.weight) parts.push(`OD: ${size.weight}${size.weightUnit || ''}`);
    if (size.length) parts.push(`T: ${size.length}${size.lengthUnit || ''}`);
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

  const salesMasters = masterData?.sales || {};

  return (
    <div className="space-y-6">
      {/* Search and Add Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-muted/20 p-4 rounded-xl border border-border">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, code, category, type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-3 justify-between w-full sm:w-auto">
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            {filteredItems.length} of {flattenedItems.length} items
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
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

                {/* Product-Level Images */}
                <Card className="bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 border-2 border-green-200">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-600 rounded-lg">
                        <ImageIcon className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-green-950">Product Common Images</h3>
                        <p className="text-xs text-green-700">These images are shown for all variant configurations</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div
                      className="border-2 border-dashed border-green-300 rounded-lg p-6 text-center cursor-pointer hover:border-green-500 hover:bg-green-50/50 transition-all bg-white"
                      onClick={() => productImageInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleProductImageUpload(e.dataTransfer.files);
                      }}
                    >
                      <div className="flex flex-col items-center gap-1.5">
                        <Upload className="h-7 w-7 text-green-600 mb-1" />
                        <p className="text-sm font-semibold text-green-900">Upload Product Images</p>
                        <p className="text-xs text-green-600">Click or drag images here</p>
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
                      <div className="grid grid-cols-5 gap-3">
                        {productImages.map((url, imgIndex) => (
                          <div key={imgIndex} className="relative group rounded-lg overflow-hidden border border-green-200 shadow-sm">
                            <img src={url} alt={`Product - ${imgIndex + 1}`} className="w-full h-20 object-cover" />
                            <button
                              type="button"
                              onClick={() => removeProductImage(imgIndex)}
                              className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Dynamic Items List */}
                <div className="border-t pt-4">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-bold text-slate-800">Item Variant Matrix</h3>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add Variant
                    </Button>
                  </div>

                  {items.map((item, index) => (
                    <div key={index} className="border p-4 rounded-lg space-y-4 mb-4 bg-gradient-to-r from-slate-50 to-blue-50/20">
                      <div className="flex justify-between items-center">
                        <h4 className="font-semibold text-xs text-blue-700">Variant #{index + 1}</h4>
                        {items.length > 1 && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveItem(index)}>
                            <X className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs">Product Code *</Label>
                          <Input
                            value={item.productCode}
                            onChange={(e) => handleItemChange(index, 'productCode', e.target.value.toUpperCase())}
                            required
                            placeholder="FAS001"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Category</Label>
                          <Select value={item.category} onValueChange={(v) => handleItemChange(index, 'category', v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {(salesMasters.itemCategories || ['NBR BASE', 'SILICONE BASE', 'VITON BASE', 'EPDM BASE', 'PTFE BASE']).map((cat: string) => (
                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs">Type</Label>
                          <Select value={item.type} onValueChange={(v) => handleItemChange(index, 'type', v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {(salesMasters.itemTypes || ['FINISHED GOODS', 'SEMI FINISHED GOODS', 'PURCHASE ITEM']).map((type: string) => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Group</Label>
                          <Select value={item.group} onValueChange={(v) => handleItemChange(index, 'group', v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {(salesMasters.itemGroups || ['O-RING', 'GASKET', 'BUSH', 'OIL SEAL', 'OTHERS']).map((group: string) => (
                                <SelectItem key={group} value={group}>{group}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs">Unit Price (₹) *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.unitPrice}
                            onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Unit *</Label>
                          <Select value={item.unit} onValueChange={(v) => handleItemChange(index, 'unit', v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(salesMasters.units || ['pcs', 'NOS', 'SET', 'kg']).map((uom: string) => (
                                <SelectItem key={uom} value={uom}>{uom}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Opening Stock *</Label>
                          <Input
                            type="number"
                            min="0"
                            value={item.stockQty}
                            onChange={(e) => handleItemChange(index, 'stockQty', e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      {/* Dimensions */}
                      <div className="pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Ruler className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-[11px] font-semibold text-slate-600">Variant Dimensions (Optional)</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-[10px]">Inner Dia (ID)</Label>
                            <div className="flex gap-1">
                              <Input
                                type="number"
                                step="0.01"
                                value={item.innerDiameter}
                                onChange={(e) => handleItemChange(index, 'innerDiameter', e.target.value)}
                                className="text-xs h-8"
                              />
                              <Select value={item.innerDiameterUnit} onValueChange={(v) => handleItemChange(index, 'innerDiameterUnit', v)}>
                                <SelectTrigger className="w-14 h-8 text-[10px] px-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="mm">mm</SelectItem>
                                  <SelectItem value="cm">cm</SelectItem>
                                  <SelectItem value="inch">in</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">Outer Dia (OD)</Label>
                            <div className="flex gap-1">
                              <Input
                                type="number"
                                step="0.01"
                                value={item.outerDiameter}
                                onChange={(e) => handleItemChange(index, 'outerDiameter', e.target.value)}
                                className="text-xs h-8"
                              />
                              <Select value={item.outerDiameterUnit} onValueChange={(v) => handleItemChange(index, 'outerDiameterUnit', v)}>
                                <SelectTrigger className="w-14 h-8 text-[10px] px-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="mm">mm</SelectItem>
                                  <SelectItem value="cm">cm</SelectItem>
                                  <SelectItem value="inch">in</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">Thickness (T)</Label>
                            <div className="flex gap-1">
                              <Input
                                type="number"
                                step="0.01"
                                value={item.thickness}
                                onChange={(e) => handleItemChange(index, 'thickness', e.target.value)}
                                className="text-xs h-8"
                              />
                              <Select value={item.thicknessUnit} onValueChange={(v) => handleItemChange(index, 'thicknessUnit', v)}>
                                <SelectTrigger className="w-14 h-8 text-[10px] px-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="mm">mm</SelectItem>
                                  <SelectItem value="cm">cm</SelectItem>
                                  <SelectItem value="inch">in</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Variant-specific images */}
                      <div className="space-y-2 border-t border-slate-100 pt-2">
                        <Label className="text-xs">Variant-Specific Images</Label>
                        <div
                          className="border border-dashed rounded p-3 text-center cursor-pointer hover:bg-slate-100 transition-colors bg-white"
                          onClick={() => imageInputRefs.current[index]?.click()}
                        >
                          <Upload className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
                          <p className="text-[10px] text-muted-foreground">Click to upload variant image</p>
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
                          <div className="flex flex-wrap gap-2">
                            {item.images.map((url, imgIndex) => (
                              <div key={imgIndex} className="relative group rounded border overflow-hidden w-12 h-12">
                                <img src={url} alt="Variant" className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => removeFile('image', index, imgIndex)}
                                  className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Technical Drawings */}
                      <div className="space-y-2 border-t border-slate-100 pt-2">
                        <Label className="text-xs">Technical Drawings (PDF)</Label>
                        <div
                          className="border border-dashed rounded p-3 text-center cursor-pointer hover:bg-slate-100 transition-colors bg-white"
                          onClick={() => pdfInputRefs.current[index]?.click()}
                        >
                          <FileText className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
                          <p className="text-[10px] text-muted-foreground">Click to upload drawing PDF</p>
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
                          <div className="space-y-1">
                            {item.drawings.map((url, drawIndex) => (
                              <div key={drawIndex} className="flex items-center justify-between p-1.5 border rounded text-[11px] bg-white">
                                <span className="truncate flex-1 mr-2">Drawing #{drawIndex + 1}</span>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" onClick={() => removeFile('pdf', index, drawIndex)}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={uploading}>
                    {editingProduct ? 'Save Changes' : 'Create Product'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Item Cards Listing - Scrollable and responsive grid */}
      <div className="max-h-[600px] overflow-y-auto pr-2 border border-border/60 rounded-xl p-4 bg-slate-50/50">
        {filteredItems.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            No products found matching "{searchTerm}"
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {filteredItems.map((item: any, idx: number) => {
              const product = products.find((p: any) => p.id === item.productId) as any;
              const productImages = item.productImages || [];
              const itemImages = item.images || [];
              const isInactive = item.productStatus === 'inactive';

              // Get standard image: item-specific first, then product level
              const displayImage = itemImages.length > 0 ? itemImages[0] : (productImages.length > 0 ? productImages[0] : null);

              return (
                <Card
                  key={`${item.productId}-${idx}`}
                  className={`flex flex-col h-[390px] justify-between hover:-translate-y-1 hover:shadow-md transition-all duration-200 border-2 hover:border-blue-100 bg-white ${isInactive ? 'border-slate-200 bg-slate-50/50 opacity-60' : 'border-slate-100'
                    }`}
                >
                  <CardHeader className="p-3 pb-1.5 shrink-0">
                    <div className="flex justify-between items-start gap-1">
                      <Badge variant="outline" className="font-mono text-[10px] bg-slate-50 text-slate-700 max-w-[100px] truncate">
                        {item.productCode}
                      </Badge>
                      {item.category && (
                        <Badge className="text-[9px] px-1 py-0.2 bg-teal-50 text-teal-700 border border-teal-100 truncate max-w-[80px]">
                          {item.category}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className={`text-xs font-bold text-slate-800 leading-tight mt-1.5 line-clamp-2 min-h-[32px] ${isInactive ? 'line-through text-slate-400' : ''}`}>
                      {item.productName}
                      {isInactive && (
                        <span className="text-[9px] text-red-500 block font-normal no-underline mt-0.5">(Inactive)</span>
                      )}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="p-3 pt-1 pb-2 text-[11px] space-y-1.5 flex-grow overflow-y-auto max-h-[200px] pr-1">
                    {/* Item Thumbnail */}
                    <div className="w-full h-24 rounded-lg bg-slate-100 border overflow-hidden flex items-center justify-center relative mb-2 group">
                      {displayImage ? (
                        <img src={displayImage} alt="Item" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200" />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-slate-300" />
                      )}
                      {(itemImages.length > 1 || productImages.length > 1) && (
                        <span className="absolute bottom-1 right-1 bg-slate-800/80 text-white text-[9px] px-1 rounded font-bold">
                          +{Math.max(itemImages.length, productImages.length) - 1}
                        </span>
                      )}
                    </div>

                    {/* Specifications */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-slate-500">
                        <span>Group:</span>
                        <span className="font-medium text-slate-700 truncate max-w-[100px]">{item.group || '—'}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Type:</span>
                        <span className="font-medium text-slate-700 truncate max-w-[100px] text-[10px]">{item.type || '—'}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Dimensions:</span>
                        <span className="font-medium text-slate-700 text-[10px]">{formatSize(item.size)}</span>
                      </div>
                    </div>

                    {/* Stock & Pricing */}
                    <div className="mt-2 pt-1.5 border-t border-slate-100 flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-400 font-semibold uppercase leading-none">Stock</span>
                        <span className="text-slate-800 font-bold text-xs mt-0.5">
                          {item.stockQty} <span className="text-[10px] text-slate-500 font-normal">{item.unit}</span>
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] text-slate-400 font-semibold uppercase leading-none">Price</span>
                        <span className="text-blue-700 font-extrabold text-xs mt-0.5">
                          ₹{Number(item.unitPrice || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Drawings Link */}
                    {item.drawings && item.drawings.length > 0 && (
                      <div className="pt-1 flex items-center gap-1 text-red-600 hover:text-red-700 font-semibold text-[10px]">
                        <FileText className="h-3 w-3" />
                        <a href={item.drawings[0]} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          View CAD Drawing ({item.drawings.length})
                        </a>
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="p-2 bg-slate-50 rounded-b-lg flex justify-between items-center border-t border-slate-100 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                      onClick={() => {
                        setProdTargetProduct(product);
                        setProdTargetItem(item);
                        setProdQty('');
                        setProdDeliveryDate('');
                        setProdPriority('normal');
                        setProdDialogOpen(true);
                      }}
                      title="Create Production Job"
                    >
                      <Wrench className="h-3.5 w-3.5" />
                    </Button>

                    <div className="flex gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                        onClick={() => product && handleEdit(product)}
                        title="Edit Product"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-7 w-7 ${isInactive ? 'text-green-600 hover:text-green-700 hover:bg-green-50' : 'text-slate-500 hover:text-red-600 hover:bg-red-50'}`}
                        onClick={() => product && toggleStatus(product)}
                        title={isInactive ? 'Mark Active' : 'Mark Inactive'}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>

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
              <div className="text-xs p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="font-semibold text-sm text-slate-800">{prodTargetProduct?.name}</p>
                <div className="mt-2 space-y-1 text-slate-600">
                  <p><span className="font-medium">Code:</span> <span className="font-mono">{prodTargetItem.productCode}</span></p>
                  <p><span className="font-medium">Category:</span> {prodTargetItem.category}</p>
                  <p><span className="font-medium">Type:</span> {prodTargetItem.type}</p>
                  <p><span className="font-medium">Unit Price:</span> ₹{prodTargetItem.unitPrice}</p>
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

            <div className="flex justify-end gap-3 pt-4 border-t">
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
