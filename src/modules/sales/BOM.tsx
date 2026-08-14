// src/pages/bom.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDatabase, ref, onValue, push, update, remove } from 'firebase/database';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { RowActions } from '@/components/ui/row-actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Edit, Trash2, FileText } from 'lucide-react';

interface BomRecord {
  id: string;
  bomCode: string;
  description: string;
  status: string;
  bomDate?: string;
  site?: string;
}

const BOM: React.FC = () => {
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const navigate = useNavigate();
  const db = getDatabase();

  useEffect(() => {
    const bomsRef = ref(db, 'engineering/boms');
    const unsub = onValue(bomsRef, (snap) => {
      const val = snap.val() || {};
      const list: BomRecord[] = Object.keys(val).map((key) => ({
        id: key,
        bomCode: val[key].bomCode || '',
        description: val[key].description || '',
        status: val[key].status || 'Approved',
        bomDate: val[key].bomDate || '',
        site: val[key].site || 'FAS',
        activeStatus: val[key].activeStatus || 'active',
      })).filter((b) => b.activeStatus !== 'inactive');
      list.sort((a, b) => a.bomCode.localeCompare(b.bomCode));
      setBoms(list);
    });
    return () => unsub();
  }, [db]);

  const handleCreate = async () => {
    if (!newCode.trim()) return;
    const bomsRef = ref(db, 'engineering/boms');
    const now = new Date().toISOString().slice(0, 10);
    await push(bomsRef, {
      bomCode: newCode.trim(),
      description: newDesc.trim(),
      status: 'Approved',
      bomDate: now,
      site: 'FAS',
      products: [],
    });
    setNewCode('');
    setNewDesc('');
  };

  const handleDelete = async (id: string) => {
    const bomRef = ref(db, `engineering/boms/${id}`);
    await remove(bomRef);
  };

  const handleEditBasic = async (bom: BomRecord) => {
    const code = prompt('Edit BOM Code', bom.bomCode) || bom.bomCode;
    const desc = prompt('Edit Description', bom.description) || bom.description;
    const bomRef = ref(db, `engineering/boms/${bom.id}`);
    await update(bomRef, { bomCode: code, description: desc });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">BOM Master</h1>
          <p className="text-sm text-muted-foreground">
            Manage common BOM codes and their product structures.
          </p>
        </div>
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Create New BOM</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>BOM Code</Label>
            <Input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="e.g. KIT-1"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Description</Label>
            <Input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="e.g. BLACK FIXEL KIT"
            />
          </div>
          <div className="flex items-end justify-end md:col-span-3">
            <Button onClick={handleCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Save BOM
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">BOM Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Select</TableHead>
                <TableHead>BOM Code</TableHead>
                <TableHead>BOM Description</TableHead>
                <TableHead>BOM Date</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Project Code</TableHead>
                <TableHead className="text-center">More</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boms.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-16 text-center text-muted-foreground"
                  >
                    <FileText className="mx-auto mb-3 h-10 w-10 opacity-40" />
                    No BOM records yet.
                  </TableCell>
                </TableRow>
              )}
              {boms.map((bom) => (
                <TableRow key={bom.id} className="hover:bg-muted/40">
                  <TableCell>
                    <input type="radio" name="selectedBom" />
                  </TableCell>
                  <TableCell>
                    <button
                      className="font-semibold text-blue-600 hover:underline"
                      onClick={() => navigate(`/sales/bom/${bom.id}`)}
                    >
                      {bom.bomCode}
                    </button>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {bom.description}
                  </TableCell>
                  <TableCell>{bom.bomDate}</TableCell>
                  <TableCell>{bom.site}</TableCell>
                  <TableCell>
                    <StatusBadge status={bom.status} />
                  </TableCell>
                  <TableCell>All</TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center">
                      <RowActions
                        actions={[
                          { label: 'Edit', icon: Edit, onClick: () => handleEditBasic(bom) },
                          { label: 'Delete', icon: Trash2, onClick: () => handleDelete(bom.id), className: 'text-red-600 hover:text-red-700' },
                        ]}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default BOM;
