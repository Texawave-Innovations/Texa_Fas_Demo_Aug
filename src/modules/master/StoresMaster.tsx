import { useState, useEffect } from 'react';
import { Plus, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { database } from '@/services/firebase';
import { ref, set, get } from 'firebase/database';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ── MasterItem type (same as GeneralMaster) ────────────────────────────────
type MasterItem = { value: string; status: 'active' | 'inactive' };

const toMasterArray = (val: any): MasterItem[] => {
  if (!val) return [];
  const arr: any[] = Array.isArray(val)
    ? val
    : Object.keys(val)
        .filter((k) => !isNaN(Number(k)))
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => val[k])
        .filter((item) => item !== null && item !== undefined);
  return arr.map((item) => {
    if (typeof item === 'string') return { value: item, status: 'active' as const };
    if (item && typeof item === 'object' && item.value !== undefined) return item as MasterItem;
    return { value: String(item), status: 'active' as const };
  });
};

export default function StoresMaster() {
  // ── Plain string lists ────────────────────────────────────────────────────
  const [rawMaterialCategories, setRawMaterialCategories] = useState<string[]>([]);
  const [uomList, setUomList] = useState<string[]>([]);

  // ── Storage Locations (MasterItem list) ───────────────────────────────────
  const [storageLocations, setStorageLocations] = useState<MasterItem[]>([]);

  // ── Shared "add" state (for plain string lists) ───────────────────────────
  const [newItem, setNewItem] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);

  // ── Storage Location add state ────────────────────────────────────────────
  const [addingLocation, setAddingLocation] = useState(false);
  const [newLocation, setNewLocation] = useState('');

  // ── Storage Location inline-edit state ────────────────────────────────────
  const [editingLocIdx, setEditingLocIdx] = useState<number | null>(null);
  const [editLocValue, setEditLocValue] = useState('');
  const [editLocStatus, setEditLocStatus] = useState<'active' | 'inactive'>('active');

  useEffect(() => {
    loadMasterData();
  }, []);

  const loadMasterData = async () => {
    const mastersRef = ref(database, 'masters/stores');
    const snapshot = await get(mastersRef);
    if (snapshot.exists()) {
      const data = snapshot.val();
      setRawMaterialCategories(
        Array.isArray(data.rawMaterialCategories) ? data.rawMaterialCategories : []
      );
      setUomList(Array.isArray(data.uomList) ? data.uomList : []);
      setStorageLocations(toMasterArray(data.storageLocations ?? data.stockLocations));
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Plain string list helpers (rawMaterialCategories & uomList)
  // ─────────────────────────────────────────────────────────────────────────
  const addStringItem = async (category: string) => {
    if (!newItem.trim()) {
      toast({ title: 'Please enter a value', variant: 'destructive' });
      return;
    }

    let list: string[] =
      category === 'rawMaterialCategories' ? rawMaterialCategories : uomList;

    const isDuplicate = list.some(
      (item) => item.trim().toLowerCase() === newItem.trim().toLowerCase()
    );
    if (isDuplicate) {
      toast({
        title: 'Duplicate entries are not allowed. Record already exists.',
        variant: 'destructive',
      });
      return;
    }

    const updatedList = [...list, newItem.trim()];
    if (category === 'rawMaterialCategories') setRawMaterialCategories(updatedList);
    else setUomList(updatedList);

    await set(ref(database, `masters/stores/${category}`), updatedList);
    setNewItem('');
    setEditingCategory(null);
    toast({ title: 'Item added successfully' });
  };

  const removeStringItem = async (category: string, index: number) => {
    let list: string[];
    if (category === 'rawMaterialCategories') {
      list = rawMaterialCategories.filter((_, i) => i !== index);
      setRawMaterialCategories(list);
    } else {
      list = uomList.filter((_, i) => i !== index);
      setUomList(list);
    }
    await set(ref(database, `masters/stores/${category}`), list);
    toast({ title: 'Item removed successfully' });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Storage Location helpers
  // ─────────────────────────────────────────────────────────────────────────
  const addStorageLocation = async () => {
    if (!newLocation.trim()) {
      toast({ title: 'Please enter a value', variant: 'destructive' });
      return;
    }
    const isDuplicate = storageLocations.some(
      (loc) => loc.value.trim().toLowerCase() === newLocation.trim().toLowerCase()
    );
    if (isDuplicate) {
      toast({
        title: 'Duplicate entries are not allowed. Record already exists.',
        variant: 'destructive',
      });
      return;
    }
    const updated: MasterItem[] = [
      ...storageLocations,
      { value: newLocation.trim(), status: 'active' },
    ];
    setStorageLocations(updated);
    await set(ref(database, 'masters/stores/storageLocations'), updated);
    setNewLocation('');
    setAddingLocation(false);
    toast({ title: `"${newLocation.trim()}" added successfully` });
  };

  const startEditLocation = (index: number, item: MasterItem) => {
    setEditingLocIdx(index);
    setEditLocValue(item.value);
    setEditLocStatus(item.status);
    setAddingLocation(false);
    setNewLocation('');
  };

  const cancelEditLocation = () => {
    setEditingLocIdx(null);
    setEditLocValue('');
    setEditLocStatus('active');
  };

  const saveEditLocation = async () => {
    if (editingLocIdx === null || !editLocValue.trim()) {
      toast({ title: 'Value cannot be empty', variant: 'destructive' });
      return;
    }
    const isDuplicate = storageLocations.some(
      (loc, i) =>
        i !== editingLocIdx &&
        loc.value.trim().toLowerCase() === editLocValue.trim().toLowerCase()
    );
    if (isDuplicate) {
      toast({
        title: 'Duplicate entries are not allowed. Record already exists.',
        variant: 'destructive',
      });
      return;
    }
    const updated = storageLocations.map((loc, i) =>
      i === editingLocIdx ? { value: editLocValue.trim(), status: editLocStatus } : loc
    );
    setStorageLocations(updated);
    await set(ref(database, 'masters/stores/storageLocations'), updated);
    cancelEditLocation();
    toast({ title: 'Storage location updated successfully' });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────
  const renderStringList = (title: string, items: string[], category: string) => (
    <Card className="h-[250px] flex flex-col justify-between">
      <CardHeader className="p-4 pb-2 shrink-0">
        <CardTitle className="text-lg flex items-center justify-between font-bold">
          {title}
          <Button
            size="sm"
            onClick={() => {
              setEditingCategory(category);
              setNewItem('');
            }}
            className="bg-primary hover:bg-primary/90 h-8"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1 flex-grow overflow-y-auto max-h-[170px] pr-1">
        {editingCategory === category && (
          <div className="flex gap-2 mb-3 shrink-0">
            <Input
              placeholder="Enter value"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addStringItem(category)}
              className="h-8 text-xs"
              autoFocus
            />
            <Button size="sm" onClick={() => addStringItem(category)} className="h-8">
              Add
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingCategory(null);
                setNewItem('');
              }}
              className="h-8"
            >
              Cancel
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-xs">No items added</p>
          ) : (
            items.map((item, index) => (
              <Badge key={index} variant="secondary" className="text-xs px-2 py-1">
                {item}
                <button
                  onClick={() => removeStringItem(category, index)}
                  className="ml-1.5 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );

  const renderStorageLocations = () => (
    <Card className="md:col-span-2 flex flex-col">
      <CardHeader className="p-4 pb-2 shrink-0">
        <CardTitle className="text-lg flex items-center justify-between font-bold">
          Storage Locations
          <Button
            size="sm"
            onClick={() => {
              setAddingLocation(true);
              setNewLocation('');
              cancelEditLocation();
            }}
            className="bg-primary hover:bg-primary/90 h-8"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          Only <span className="font-semibold text-green-600">Active</span> locations appear in the Raw Material form.
        </p>
      </CardHeader>

      <CardContent className="p-4 pt-2 flex-grow overflow-y-auto">
        {/* Add row */}
        {addingLocation && (
          <div className="flex gap-2 mb-4 shrink-0">
            <Input
              placeholder="Enter storage location name"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addStorageLocation()}
              className="h-8 text-xs flex-1"
              autoFocus
            />
            <Button size="sm" onClick={addStorageLocation} className="h-8">
              Add
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAddingLocation(false);
                setNewLocation('');
              }}
              className="h-8"
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Location badges / edit rows */}
        <div className="flex flex-wrap gap-2 min-h-[40px]">
          {storageLocations.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No storage locations added yet. Click <strong>Add</strong> to create one.
            </p>
          ) : (
            storageLocations.map((loc, index) =>
              editingLocIdx === index ? (
                /* ── Inline edit row ── */
                <div
                  key={index}
                  className="w-full flex flex-wrap gap-1.5 items-center p-2 bg-muted/30 rounded border border-border"
                >
                  <Input
                    className="flex-1 min-w-[120px] h-7 text-xs"
                    value={editLocValue}
                    onChange={(e) => setEditLocValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveEditLocation()}
                    autoFocus
                  />
                  <Select
                    value={editLocStatus}
                    onValueChange={(v) => setEditLocStatus(v as 'active' | 'inactive')}
                  >
                    <SelectTrigger className="w-28 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={saveEditLocation}
                    className="bg-green-600 hover:bg-green-700 text-white gap-0.5 h-7 text-xs px-2"
                  >
                    <Check className="h-3 w-3" /> Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={cancelEditLocation}
                    className="gap-0.5 h-7 text-xs px-2"
                  >
                    <X className="h-3 w-3" /> Cancel
                  </Button>
                </div>
              ) : (
                /* ── Badge row ── */
                <Badge
                  key={index}
                  variant="secondary"
                  className={`text-xs px-2 py-1 flex items-center gap-1.5 ${
                    loc.status === 'inactive' ? 'opacity-40 line-through' : ''
                  }`}
                >
                  {loc.value}
                  {loc.status === 'inactive' && (
                    <span className="text-[10px] text-red-500 no-underline">(Inactive)</span>
                  )}
                  <button
                    onClick={() => startEditLocation(index, loc)}
                    className="hover:text-primary transition-colors ml-0.5"
                    title="Edit"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </Badge>
              )
            )
          )}
        </div>
      </CardContent>
    </Card>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {renderStringList('Raw Material Categories', rawMaterialCategories, 'rawMaterialCategories')}
        {renderStringList('Unit of Measurement', uomList, 'uomList')}
        {renderStorageLocations()}
      </div>
    </div>
  );
}