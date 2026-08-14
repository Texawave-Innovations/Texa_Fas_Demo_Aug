'use client';

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
import {
  DocType,
  RunningNumberConfig,
  getAllRunningNumbers,
  saveRunningNumberConfig,
} from '@/services/runningNumberService';

// ── MasterItem type ────────────────────────────────────────────────────────────
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

// ── Running Number doc types ─────────────────────────────────────────────────
const DOC_TYPES: { key: DocType; label: string; placeholder: string }[] = [
  { key: 'quoteNo',    label: 'Quote No',    placeholder: 'e.g. SQFY26-27' },
  { key: 'soNumber',   label: 'SO Number',   placeholder: 'e.g. SOFY26-27' },
  { key: 'invoiceNo',  label: 'Invoice No',  placeholder: 'e.g. INVFY26-27' },
  { key: 'shipmentId', label: 'Shipment ID', placeholder: 'e.g. SHIPFY26-27' },
  { key: 'dcNo',       label: 'DC No',       placeholder: 'e.g. DCFY26-27' },
  { key: 'nrgpNo',     label: 'NRGP No',     placeholder: 'e.g. NRGPFY26-27' },
  { key: 'rgpNo',      label: 'RGP No',      placeholder: 'e.g. RGPFY26-27' },
];

// ── Running Number Section ───────────────────────────────────────────────────
function RunningNumberSection() {
  const [configs, setConfigs] = useState<Partial<Record<DocType, RunningNumberConfig>>>({});
  const [selected, setSelected] = useState<DocType | ''>('');
  const [inputValue, setInputValue] = useState('');
  const [savedDate, setSavedDate] = useState<Partial<Record<DocType, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAllRunningNumbers()
      .then((data) => {
        setConfigs(data);
        const dates: Partial<Record<DocType, string>> = {};
        for (const [key, val] of Object.entries(data)) {
          if (val?.updatedAt) dates[key as DocType] = val.updatedAt;
        }
        setSavedDate(dates);
      })
      .catch(() => toast({ title: 'Failed to load running numbers', variant: 'destructive' }));
  }, []);

  const handleSelect = (val: DocType) => {
    setSelected(val);
    setInputValue(configs[val]?.prefix ?? '');
  };

  const handleSave = async () => {
    if (!selected) {
      toast({ title: 'Please select a document type', variant: 'destructive' });
      return;
    }
    if (!inputValue.trim()) {
      toast({ title: 'Please enter a prefix', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const today = new Date();
      const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;

      await saveRunningNumberConfig(selected, inputValue.trim(), dateStr);

      setConfigs((prev) => ({
        ...prev,
        [selected]: { prefix: inputValue.trim(), nextSeq: 1, updatedAt: dateStr },
      }));
      setSavedDate((prev) => ({ ...prev, [selected]: dateStr }));

      toast({ title: `${DOC_TYPES.find((d) => d.key === selected)?.label} prefix saved — counter reset to 0001` });

      setSelected('');
      setInputValue('');
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const selectedMeta = DOC_TYPES.find((d) => d.key === selected);

  return (
    <Card className="border-2 border-blue-200 shadow-md">
      <CardHeader className="bg-blue-50 rounded-t-lg pb-3">
        <CardTitle className="text-xl text-blue-900 font-bold">Running Number</CardTitle>
        <p className="text-sm text-blue-700 mt-1">
          Set the prefix for each document type. The counter resets to 0001 whenever you save a new prefix.
        </p>
      </CardHeader>
      <CardContent className="pt-5">
        {/* ── Input Row ── */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={selected} onValueChange={(v) => handleSelect(v as DocType)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map((d) => (
                <SelectItem key={d.key} value={d.key}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            className="w-52"
            placeholder={selectedMeta?.placeholder ?? 'Select a type first'}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            disabled={!selected}
          />

          <Button variant="ghost" size="icon" disabled={!selected} onClick={() => {}}>
            <Pencil className="h-4 w-4 text-gray-500" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            disabled={!selected || !inputValue.trim() || saving}
            onClick={handleSave}
            className="border-green-500 text-green-600 hover:bg-green-50"
          >
            <Check className="h-4 w-4" />
          </Button>

          {selected && savedDate[selected] && (
            <span className="ml-1 px-3 py-1.5 rounded-full border border-gray-400 text-sm font-semibold text-gray-700 bg-white">
              {savedDate[selected]}
            </span>
          )}
        </div>

        {/* ── Summary table ── */}
        {Object.keys(configs).length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm border rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-4 py-2 text-left font-semibold">Document Type</th>
                  <th className="border px-4 py-2 text-left font-semibold">Prefix</th>
                  <th className="border px-4 py-2 text-left font-semibold">Next Number</th>
                  <th className="border px-4 py-2 text-left font-semibold">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {DOC_TYPES.filter((d) => configs[d.key]).map((d) => {
                  const cfg = configs[d.key]!;
                  return (
                    <tr key={d.key} className="hover:bg-blue-50 transition-colors">
                      <td className="border px-4 py-2 font-medium">{d.label}</td>
                      <td className="border px-4 py-2">
                        <Badge variant="secondary" className="font-mono">
                          {cfg.prefix}
                        </Badge>
                      </td>
                      <td className="border px-4 py-2 font-mono text-blue-700">
                        {cfg.prefix}-{String(cfg.nextSeq ?? 1).padStart(4, '0')}
                      </td>
                      <td className="border px-4 py-2 text-gray-500">{cfg.updatedAt}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN GeneralMaster component
// ════════════════════════════════════════════════════════════════════════════
export default function GeneralMaster() {
  const [paymentTerms,   setPaymentTerms]   = useState<MasterItem[]>([]);
  const [deliveryTerms,  setDeliveryTerms]  = useState<MasterItem[]>([]);
  const [dispatchModes,  setDispatchModes]  = useState<MasterItem[]>([]);
  const [gstList,        setGstList]        = useState<MasterItem[]>([]);
  const [itemCategories, setItemCategories] = useState<MasterItem[]>([]);
  const [itemTypes,      setItemTypes]      = useState<MasterItem[]>([]);
  const [itemGroups,     setItemGroups]     = useState<MasterItem[]>([]);
  const [units,          setUnits]          = useState<MasterItem[]>([]);
  const [warehouses,     setWarehouses]     = useState<MasterItem[]>([]);
  const [expireDates,    setExpireDates]    = useState<MasterItem[]>([]);

  const [newItem,        setNewItem]        = useState('');
  const [addingCategory, setAddingCategory] = useState<string | null>(null);

  const [editingItem,  setEditingItem]  = useState<{ category: string; index: number } | null>(null);
  const [editValue,    setEditValue]    = useState('');
  const [editStatus,   setEditStatus]   = useState<'active' | 'inactive'>('active');

  useEffect(() => { loadMasterData(); }, []);

  const loadMasterData = async () => {
    try {
      const snap = await get(ref(database, 'masters/sales'));
      if (snap.exists()) {
        const data = snap.val();
        setPaymentTerms(toMasterArray(data.paymentTerms));
        setDeliveryTerms(toMasterArray(data.deliveryTerms));
        setDispatchModes(toMasterArray(data.dispatchModes));
        setGstList(toMasterArray(data.gstList));
        setItemCategories(toMasterArray(data.itemCategories));
        setItemTypes(toMasterArray(data.itemTypes));
        setItemGroups(toMasterArray(data.itemGroups));
        setUnits(toMasterArray(data.units));
        setWarehouses(toMasterArray(data.warehouses));
        setExpireDates(toMasterArray(data.expireDates));
      }
    } catch {
      toast({ title: 'Failed to load masters', variant: 'destructive' });
    }
  };

  const getList = (cat: string): MasterItem[] => {
    switch (cat) {
      case 'paymentTerms':   return paymentTerms;
      case 'deliveryTerms':  return deliveryTerms;
      case 'dispatchModes':  return dispatchModes;
      case 'gstList':        return gstList;
      case 'itemCategories': return itemCategories;
      case 'itemTypes':      return itemTypes;
      case 'itemGroups':     return itemGroups;
      case 'units':          return units;
      case 'warehouses':     return warehouses;
      case 'expireDates':    return expireDates;
      default: return [];
    }
  };

  const setList = (cat: string, list: MasterItem[]) => {
    switch (cat) {
      case 'paymentTerms':   setPaymentTerms(list);   break;
      case 'deliveryTerms':  setDeliveryTerms(list);  break;
      case 'dispatchModes':  setDispatchModes(list);  break;
      case 'gstList':        setGstList(list);        break;
      case 'itemCategories': setItemCategories(list); break;
      case 'itemTypes':      setItemTypes(list);      break;
      case 'itemGroups':     setItemGroups(list);     break;
      case 'units':          setUnits(list);          break;
      case 'warehouses':     setWarehouses(list);     break;
      case 'expireDates':    setExpireDates(list);    break;
    }
  };

  const addItem = async (category: string) => {
    if (!newItem.trim()) {
      toast({ title: 'Please enter a value', variant: 'destructive' });
      return;
    }
    const list = getList(category);
    // case-insensitive duplicate validation
    const isDuplicate = list.some(item => item.value.trim().toLowerCase() === newItem.trim().toLowerCase());
    if (isDuplicate) {
      toast({ title: 'Duplicate entries are not allowed. Record already exists.', variant: 'destructive' });
      return;
    }
    const updated: MasterItem[] = [...list, { value: newItem.trim(), status: 'active' }];
    setList(category, updated);
    await set(ref(database, `masters/sales/${category}`), updated);
    setNewItem('');
    setAddingCategory(null);
    toast({ title: `${newItem} added successfully` });
  };

  const saveEdit = async (category: string) => {
    if (!editingItem || !editValue.trim()) {
      toast({ title: 'Value cannot be empty', variant: 'destructive' });
      return;
    }
    const list = getList(category);
    // case-insensitive duplicate validation
    const isDuplicate = list.some((item, i) => i !== editingItem.index && item.value.trim().toLowerCase() === editValue.trim().toLowerCase());
    if (isDuplicate) {
      toast({ title: 'Duplicate entries are not allowed. Record already exists.', variant: 'destructive' });
      return;
    }
    const updated = list.map((item, i) =>
      i === editingItem.index ? { value: editValue.trim(), status: editStatus } : item
    );
    setList(category, updated);
    await set(ref(database, `masters/sales/${category}`), updated);
    setEditingItem(null);
    setEditValue('');
    setEditStatus('active');
    toast({ title: 'Item updated successfully' });
  };

  const startEdit = (category: string, index: number, item: MasterItem) => {
    setEditingItem({ category, index });
    setEditValue(item.value);
    setEditStatus(item.status);
    setAddingCategory(null);
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setEditValue('');
    setEditStatus('active');
  };

  const renderList = (title: string, items: MasterItem[], category: string) => (
    <Card className="h-[250px] flex flex-col justify-between">
      <CardHeader className="p-4 pb-2 shrink-0">
        <CardTitle className="text-base font-bold flex items-center justify-between">
          {title}
          <Button
            size="sm"
            onClick={() => { setAddingCategory(category); setNewItem(''); cancelEdit(); }}
            className="bg-primary hover:bg-primary/90 h-8"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1 flex-grow overflow-y-auto max-h-[170px] pr-1">
        {addingCategory === category && (
          <div className="flex gap-2 mb-3 shrink-0">
            <Input
              placeholder="Enter new value"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem(category)}
              autoFocus
              className="h-8 text-xs"
            />
            <Button size="sm" onClick={() => addItem(category)} className="h-8">Add</Button>
            <Button size="sm" variant="outline" onClick={() => { setAddingCategory(null); setNewItem(''); }} className="h-8">
              Cancel
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2 min-h-[40px]">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-xs">No items added yet</p>
          ) : (
            items.map((item, index) =>
              editingItem?.category === category && editingItem.index === index ? (
                <div
                  key={index}
                  className="w-full flex flex-wrap gap-1 items-center p-1.5 bg-muted/30 rounded border border-border"
                >
                  <Input
                    className="flex-1 min-w-[80px] h-7 text-xs"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    autoFocus
                  />
                  <Select value={editStatus} onValueChange={(v) => setEditStatus(v as 'active' | 'inactive')}>
                    <SelectTrigger className="w-24 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => saveEdit(category)}
                    className="bg-green-600 hover:bg-green-700 text-white gap-0.5 h-7 text-xs px-2"
                  >
                    <Check className="h-3 w-3" /> Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit} className="gap-0.5 h-7 text-xs px-2">
                    <X className="h-3 w-3" /> Cancel
                  </Button>
                </div>
              ) : (
                <Badge
                  key={index}
                  variant="secondary"
                  className={`text-xs px-2 py-1 flex items-center gap-1.5 ${
                    item.status === 'inactive' ? 'opacity-40 line-through' : ''
                  }`}
                >
                  {item.value}
                  {item.status === 'inactive' && (
                    <span className="text-[10px] text-red-500 no-underline">(Inactive)</span>
                  )}
                  <button
                    onClick={() => startEdit(category, index, item)}
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

  return (
    <div className="space-y-8">
      {/* ── Running Number ── */}
      <RunningNumberSection />

      {/* ── Master Lists ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {renderList('Payment Terms',        paymentTerms,   'paymentTerms')}
        {renderList('Delivery Terms',       deliveryTerms,  'deliveryTerms')}
        {renderList('Dispatch Modes',       dispatchModes,  'dispatchModes')}
        {renderList('GST Rates',            gstList,        'gstList')}
        {renderList('Item Categories',      itemCategories, 'itemCategories')}
        {renderList('Item Types',           itemTypes,      'itemTypes')}
        {renderList('Item Groups',          itemGroups,     'itemGroups')}
        {renderList('Units',               units,          'units')}
        {renderList('Warehouse / Location', warehouses,     'warehouses')}
        {renderList('Expire Dates',         expireDates,    'expireDates')}
      </div>
    </div>
  );
}
