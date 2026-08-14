'use client';

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDatabase, onValue, ref, remove, update, get } from 'firebase/database';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';

interface ProductItem {
  productCode: string;
  category: string;
  group?: string;
  hsn?: string;
  type?: string;
  unit: string;
  unitPrice?: number;
  stockQty?: number;
  size?: any;
  images?: any;
}

interface Product {
  id: string;
  name: string;
  items: ProductItem[];
}

interface FlatProduct {
  id: string; // productId-itemIndex
  productId: string; // Firebase product ID
  itemIndex: number; // Index in items array
  code: string;
  description: string;
  uom: string;
  category: string;
  type?: string;
  group?: string; // Added group field
}

interface BomProduct {
  productId: string;
  qty: number;
  isRawMaterial?: boolean;
}

interface BomRecord {
  id: string;
  bomCode: string;
  description: string;
  status: string;
  products: BomProduct[];
}

const BomView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const db = getDatabase();

  const [bom, setBom] = useState<BomRecord | null>(null);
  const [allProducts, setAllProducts] = useState<FlatProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const bomRef = ref(db, `engineering/boms/${id}`);
    const productsRef = ref(db, 'sales/products');

    const unsubBom = onValue(bomRef, (snap) => {
      const val = snap.val();
      if (val) {
        setBom({
          id,
          bomCode: val.bomCode || '',
          description: val.description || '',
          status: val.status || 'Approved',
          products: val.products || [],
        });
      } else {
        setBom(null);
      }
      setLoading(false);
    });

    const unsubProducts = onValue(productsRef, (snap) => {
      const val = snap.val() || {};
      const flatList: FlatProduct[] = [];

      // Flatten the products structure
      Object.keys(val).forEach((productId) => {
        const product = val[productId];
        if (product.status === 'inactive') return;
        const productName = product.name || '';
        const items = product.items || [];

        items.forEach((item: ProductItem, itemIndex: number) => {
          flatList.push({
            id: `${productId}-${itemIndex}`, // Unique ID combining productId and itemIndex
            productId: productId,
            itemIndex: itemIndex,
            code: item.productCode || '',
            description: `${productName} - ${item.category || ''}`.trim(),
            uom: item.unit || '',
            category: item.category || '',
            type: item.type || '',
            group: item.group || '', // Added group field
          });
        });
      });

      setAllProducts(flatList);
    });

    return () => {
      unsubBom();
      unsubProducts();
    };
  }, [db, id]);

  const getProductDetails = (productId: string) =>
    allProducts.find((p) => p.id === productId);

  const handleHeaderChange = (field: keyof BomRecord, value: string) => {
    if (!bom) return;
    setBom({ ...bom, [field]: value });
  };

  const handleQtyChange = (index: number, qty: number) => {
    if (!bom) return;
    const updated = [...bom.products];
    updated[index] = { ...updated[index], qty };
    setBom({ ...bom, products: updated });
  };

  const handleRawMaterialChange = (index: number, isRawMaterial: boolean) => {
    if (!bom) return;
    const updated = [...bom.products];
    updated[index] = { ...updated[index], isRawMaterial };
    setBom({ ...bom, products: updated });
  };

  const handleRemoveProduct = (index: number) => {
    if (!bom) return;
    const updated = bom.products.filter((_, i) => i !== index);
    setBom({ ...bom, products: updated });
  };

  const handleAddProduct = () => {
    if (!bom || allProducts.length === 0) return;
    const first = allProducts[0];
    setBom({
      ...bom,
      products: [...bom.products, { productId: first.id, qty: 1, isRawMaterial: false }],
    });
  };

  const handleProductChange = (index: number, productId: string) => {
    if (!bom) return;
    const updated = [...bom.products];
    updated[index] = { ...updated[index], productId };
    setBom({ ...bom, products: updated });
  };

  const handleSave = async () => {
    if (!bom) return;

    // Fetch all boms to validate duplicate code
    try {
      const bomsRef = ref(db, 'engineering/boms');
      const snap = await get(bomsRef);
      if (snap.exists()) {
        const val = snap.val();
        const isDuplicate = Object.keys(val).some((key) => 
          key !== bom.id && 
          val[key].bomCode?.trim().toLowerCase() === bom.bomCode.trim().toLowerCase()
        );
        if (isDuplicate) {
          toast.error("Duplicate entries are not allowed. BOM Code already exists.");
          return;
        }
      }
    } catch (err) {
      console.error("Duplicate check failed:", err);
      toast.error("Failed to perform duplicate check validation.");
      return;
    }

    const bomRef = ref(db, `engineering/boms/${bom.id}`);
    await update(bomRef, {
      bomCode: bom.bomCode.trim().toUpperCase(),
      description: bom.description.trim(),
      status: bom.status,
      products: bom.products,
    });
    toast.success("BOM saved successfully.");
    navigate('/master/sales/bom');
  };

  const handleDeleteBom = async () => {
    if (!bom) return;
    if (!confirm(`Are you sure you want to delete BOM ${bom.bomCode}? This action cannot be undone.`)) {
      return;
    }
    const bomRef = ref(db, `engineering/boms/${bom.id}`);
    await remove(bomRef);
    navigate('/master/sales/bom');
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading BOM...
      </div>
    );
  }

  if (!bom) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">BOM not found.</p>
        <Button variant="outline" onClick={() => navigate('/master/sales/bom')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to BOM list
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="mr-1"
            onClick={() => navigate('/master/sales/bom')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              BOM: {bom.bomCode}
            </h1>
            <p className="text-xs text-muted-foreground">
              Configure list of products under this BOM code.
            </p>
          </div>
        </div>
        <StatusBadge status={bom.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">BOM Header</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Code</Label>
            <Input
              value={bom.bomCode}
              onChange={(e) =>
                handleHeaderChange('bomCode', e.target.value.toUpperCase())
              }
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Description</Label>
            <Input
              value={bom.description}
              onChange={(e) =>
                handleHeaderChange('description', e.target.value)
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={bom.status}
              onValueChange={(v) => handleHeaderChange('status', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Products in this BOM</CardTitle>
          <Button size="sm" className="gap-2" onClick={handleAddProduct}>
            <Plus className="h-4 w-4" />
            Add Product
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Sl.No</TableHead>
                  <TableHead className="min-w-[220px]">Product Code</TableHead>
                  <TableHead className="min-w-[250px]">Description</TableHead>
                  <TableHead className="w-[120px]">Category</TableHead>
                  <TableHead className="w-[120px]">Group</TableHead>
                  <TableHead className="w-[140px]">Type</TableHead>
                  <TableHead className="w-[80px]">UOM</TableHead>
                  <TableHead className="w-[120px]">Qty</TableHead>
                  <TableHead className="w-[150px]">Raw Material</TableHead>
                  <TableHead className="text-center w-[100px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bom.products.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      No products added to this BOM.
                    </TableCell>
                  </TableRow>
                )}
                {bom.products.map((bp, index) => {
                  const p = getProductDetails(bp.productId);
                  return (
                    <TableRow key={`${bp.productId}-${index}`}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell>
                        <Select
                          value={bp.productId}
                          onValueChange={(v) => handleProductChange(index, v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent className="max-h-64">
                            {allProducts
                              .filter((prod) => prod.id === bp.productId || !bom.products.some((other) => other !== bp && other.productId === prod.id))
                              .map((prod) => (
                              <SelectItem key={prod.id} value={prod.id}>
                                {prod.code} — {prod.description}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {p?.description}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {p?.category || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="secondary" 
                          className="text-xs bg-purple-100 text-purple-800 border-purple-200"
                        >
                          {p?.group || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${
                            p?.type === 'RAW MATERIAL' 
                              ? 'bg-blue-100 text-blue-800' 
                              : p?.type === 'SEMI FINISHED GOODS'
                              ? 'bg-amber-100 text-amber-800'
                              : p?.type === 'FINISHED GOODS'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {p?.type || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>{p?.uom}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="w-24"
                          value={bp.qty}
                          onChange={(e) =>
                            handleQtyChange(index, Number(e.target.value || 0))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={bp.isRawMaterial ? 'yes' : 'no'}
                          onValueChange={(v) =>
                            handleRawMaterialChange(index, v === 'yes')
                          }
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yes">
                              <span className="flex items-center gap-2">
                                <Badge className="bg-green-100 text-green-800 border-green-300">
                                  Yes
                                </Badge>
                              </span>
                            </SelectItem>
                            <SelectItem value="no">
                              <span className="flex items-center gap-2">
                                <Badge className="bg-gray-100 text-gray-800 border-gray-300">
                                  No
                                </Badge>
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleRemoveProduct(index)}
                          title="Remove Product"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => navigate('/master/sales/bom')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            className="gap-2"
            onClick={handleDeleteBom}
          >
            <Trash2 className="h-4 w-4" />
            Delete BOM
          </Button>
          <Button className="gap-2" onClick={handleSave}>
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BomView;
