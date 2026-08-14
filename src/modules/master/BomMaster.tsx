// src/modules/master/BomMaster.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDatabase, ref, onValue, push, update } from 'firebase/database';

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Edit, Power, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface BomRecord {
  id: string;
  bomCode: string;
  description: string;
  status: string;
  bomDate?: string;
  site?: string;
  activeStatus?: 'active' | 'inactive';
}

const BomMaster: React.FC = () => {
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
      }));
      list.sort((a, b) => a.bomCode.localeCompare(b.bomCode));
      setBoms(list);
    });
    return () => unsub();
  }, [db]);

  const handleCreate = async () => {
    if (!newCode.trim()) return;

    // Check duplicate (case-insensitive)
    const isDuplicate = boms.some(b => b.bomCode.trim().toLowerCase() === newCode.trim().toLowerCase());
    if (isDuplicate) {
      toast.error("Duplicate entries are not allowed. BOM Code already exists.");
      return;
    }

    const bomsRef = ref(db, 'engineering/boms');
    const now = new Date().toISOString().slice(0, 10);
    await push(bomsRef, {
      bomCode: newCode.trim(),
      description: newDesc.trim(),
      status: 'Approved',
      bomDate: now,
      site: 'FAS',
      products: [],
      activeStatus: 'active',
    });
    setNewCode('');
    setNewDesc('');
    toast.success("BOM created successfully.");
  };

  const toggleStatus = async (bom: BomRecord) => {
    const currentStatus = bom.activeStatus || 'active';
    const newStatus = currentStatus === 'inactive' ? 'active' : 'inactive';
    try {
      const bomRef = ref(db, `engineering/boms/${bom.id}`);
      await update(bomRef, { activeStatus: newStatus });
      toast.success(`BOM status marked as ${newStatus}`);
    } catch (err) {
      toast.error("Failed to update BOM status");
    }
  };

  const handleEditBasic = async (bom: BomRecord) => {
    const code = prompt('Edit BOM Code', bom.bomCode);
    if (code === null) return; // cancelled
    if (!code.trim()) {
      toast.error("BOM Code cannot be empty.");
      return;
    }

    // Check duplicate (case-insensitive)
    const isDuplicate = boms.some(b => b.id !== bom.id && b.bomCode.trim().toLowerCase() === code.trim().toLowerCase());
    if (isDuplicate) {
      toast.error("Duplicate entries are not allowed. BOM Code already exists.");
      return;
    }

    const desc = prompt('Edit Description', bom.description) || bom.description;
    const bomRef = ref(db, `engineering/boms/${bom.id}`);
    await update(bomRef, { bomCode: code.toUpperCase().trim(), description: desc.trim() });
    toast.success("BOM updated successfully.");
  };

  return (
    <div className="space-y-6">
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
          <CardTitle className="text-base font-semibold">BOM Records</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {boms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">No BOM records yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 max-h-[600px] overflow-y-auto pr-1">
              {boms.map((bom) => {
                const isInactive = bom.activeStatus === 'inactive';
                return (
                  <Card
                    key={bom.id}
                    className={`h-[285px] flex flex-col border shadow-sm ${isInactive ? 'opacity-60 bg-slate-50' : ''}`}
                  >
                    <CardHeader className="p-4 pb-2 flex-shrink-0">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          className={`font-semibold text-sm text-left leading-tight ${isInactive ? 'line-through text-slate-400 cursor-default' : 'text-blue-600 hover:underline'}`}
                          onClick={() => !isInactive && navigate(`/master/sales/bom/${bom.id}`)}
                          disabled={isInactive}
                        >
                          {bom.bomCode}
                        </button>
                        <StatusBadge status={bom.status} className="shrink-0" />
                      </div>
                      {isInactive && (
                        <StatusBadge status="Inactive" className="w-fit mt-1" />
                      )}
                    </CardHeader>
                    <CardContent className="p-4 pt-1 flex-1 overflow-y-auto">
                      <p className={`text-xs leading-relaxed ${isInactive ? 'line-through text-slate-400' : 'text-muted-foreground'}`}>
                        {bom.description || '—'}
                      </p>
                      <div className="mt-3 space-y-1">
                        {bom.bomDate && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <span className="text-muted-foreground">Date:</span>
                            <span>{bom.bomDate}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span className="text-muted-foreground">Site:</span>
                          <span>{bom.site || 'FAS'}</span>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="p-3 border-t flex justify-between items-center mt-auto flex-shrink-0">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => handleEditBasic(bom)}
                        title="Edit"
                        disabled={isInactive}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className={`h-7 w-7 ${isInactive ? 'text-green-600 hover:bg-green-50' : 'text-slate-500 hover:text-red-600 hover:bg-red-50'}`}
                        onClick={() => toggleStatus(bom)}
                        title={isInactive ? 'Mark Active' : 'Mark Inactive'}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BomMaster;
