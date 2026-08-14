import { useState, useEffect, useRef } from 'react';
import { Plus, Upload, Tag, Package, Disc, Cog, GitBranch, Navigation, Link, Hash, Pencil, Trash2, Layers, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { toast } from '@/hooks/use-toast';
import { database, storage, storageRef, uploadBytes, getDownloadURL } from '@/services/firebase';
import { ref, set, get } from 'firebase/database';

// ── Types ──────────────────────────────────────────────────────────────────────

interface RMGrade {
  gradeCode: string;
  gradeDescription: string;
  gradeType: string;
}

interface DieRecord {
  dieCode: string;
  dieDescription: string;
  dieType: string;
}

interface MachineRecord {
  machineGroupCode: string;
  machineGroupName: string; // UI label: "Machine Name"
  operatorName: string;
  machineLocation: string;
  serialNumber: string;
  make: string;
  year: string;
  serviceDate: string;
}

interface RouteProcessEntry {
  processCode: string;
  processName: string;
}

interface RouteRecord {
  routeId: string;
  routeName: string;
  processes: RouteProcessEntry[];
}

interface ProcessTypeRecord {
  processTypeCode: string;
  processTypeName: string;
  processLocation: string;
}

interface ProcessRecord {
  processId: string;
  processName: string;
  processType: string;
}

interface MaterialSpecRecord {
  materialSpecNo: string;
  itemCode: string;
  itemName: string;
  customerGroup: string;
  documentUrl: string;
  documentName: string;
}

const emptyDieForm: DieRecord = { dieCode: '', dieDescription: '', dieType: '' };
const emptyMachineForm: MachineRecord = {
  machineGroupCode: '', machineGroupName: '',
  operatorName: '', machineLocation: '', serialNumber: '', make: '', year: '', serviceDate: '',
};
interface ItemRouteRecord {
  itemCode: string;
  itemName: string;
  routeCode: string;
  routeName: string;
  routeType: string;
}

const emptyRouteForm: RouteRecord = { routeId: '', routeName: '', processes: [] };
const emptyItemRouteForm: ItemRouteRecord = {
  itemCode: '', itemName: '', routeCode: '', routeName: '', routeType: '',
};
const emptyProcessTypeForm: ProcessTypeRecord = { processTypeCode: '', processTypeName: '', processLocation: '' };
const emptyProcessForm: ProcessRecord = { processId: '', processName: '', processType: '' };
const emptyMaterialSpecForm: MaterialSpecRecord = {
  materialSpecNo: '', itemCode: '', itemName: '', customerGroup: '', documentUrl: '', documentName: '',
};
const DIE_TYPES = ['Outer Diameter', 'Inner Diameter', 'Thickness', 'Other', 'Set'];

interface DieProductMapping {
  mouldingType: string;
  dieCode: string;
  itemType: string;
}
const emptyDPMForm: DieProductMapping = { mouldingType: '', dieCode: '', itemType: '' };

// Always picks max existing number + 1 so deleting records never causes collisions
const nextKey = (map: Record<string, unknown>, prefix: string) => {
  const max = Object.keys(map).reduce((m, k) => {
    const n = parseInt(k.replace(prefix, ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
};

type ItemType = 'RM' | 'SF' | 'FG';

const SECTION_LABEL: Record<ItemType, string> = {
  RM: 'Raw Material Item Master',
  SF: 'Semi-Finished Item Master',
  FG: 'Finished Goods Item Master',
};

// Flat form — all fields combined; only relevant ones rendered per type
interface ItemFormData {
  itemType: ItemType | '';
  binLocation: string;
  // RM / SF
  rmCode: string;
  rmDescription: string;
  sfCode: string;
  sfDescription: string;
  uom: string;
  gradeCode: string;
  gradeType: string;
  colour: string;
  minimumStock: string;
  maximumStock: string;
  expireDate: string;
  rmPrice: string;
  // FG
  fgItemCode: string;
  fgDescription: string;
  finishSizeL: string;
  finishSizeW: string;
  finishSizeH: string;
  drawingNo: string;
  revisionNo: string;
  roughSizeL: string;
  roughSizeW: string;
  roughSizeH: string;
  fgRmCode: string;
  price: string;
  fgPrice: string;
  weight: string;
  customerGroup: string;
  category: string;
  bom: boolean;
}

interface StoredItem extends ItemFormData {
  itemType: ItemType;
}

const emptyRMGradeForm: RMGrade = { gradeCode: '', gradeDescription: '', gradeType: '' };

const emptyItemForm: ItemFormData = {
  itemType: '',
  binLocation: '',
  rmCode: '', rmDescription: '',
  sfCode: '', sfDescription: '',
  uom: '', gradeCode: '', gradeType: '', colour: '',
  minimumStock: '', maximumStock: '',
  expireDate: '', rmPrice: '',
  fgItemCode: '', fgDescription: '',
  finishSizeL: '', finishSizeW: '', finishSizeH: '',
  drawingNo: '', revisionNo: '',
  roughSizeL: '', roughSizeW: '', roughSizeH: '',
  fgRmCode: '', price: '', fgPrice: '', weight: '',
  customerGroup: '', category: '', bom: false,
};

const UOM_OPTIONS = ['KG', 'KGS', 'M', 'Nos', 'Set'];

type ActiveTab = 'rmGrade' | 'item' | 'die' | 'dieProductMapping' | 'machine' | 'process' | 'route' | 'itemRoute' | 'materialSpec';

// ── Component ──────────────────────────────────────────────────────────────────

export default function ProductionMaster() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('rmGrade');

  // RM Grade state
  const [rmGrades, setRmGrades] = useState<Record<string, RMGrade>>({});
  const [rmGradeForm, setRmGradeForm] = useState<RMGrade>(emptyRMGradeForm);
  const [showRMGradeForm, setShowRMGradeForm] = useState(false);
  const [editingRmGradeKey, setEditingRmGradeKey] = useState<string | null>(null);

  // Die state
  const [dies, setDies] = useState<Record<string, DieRecord>>({});
  const [dieForm, setDieForm] = useState<DieRecord>(emptyDieForm);
  const [showDieForm, setShowDieForm] = useState(false);
  const [editingDieKey, setEditingDieKey] = useState<string | null>(null);

  // Machine state
  const [machines, setMachines] = useState<Record<string, MachineRecord>>({});
  const [machineForm, setMachineForm] = useState<MachineRecord>(emptyMachineForm);
  const [showMachineForm, setShowMachineForm] = useState(false);
  const [editingMachineKey, setEditingMachineKey] = useState<string | null>(null);

  // Route state
  const [routes, setRoutes] = useState<Record<string, RouteRecord>>({});
  const [routeForm, setRouteForm] = useState<RouteRecord>(emptyRouteForm);
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [editingRouteKey, setEditingRouteKey] = useState<string | null>(null);
  const [routeProcessSelection, setRouteProcessSelection] = useState('');

  // Item-Route state
  const [itemRoutes, setItemRoutes] = useState<Record<string, ItemRouteRecord>>({});
  const [itemRouteForm, setItemRouteForm] = useState<ItemRouteRecord>(emptyItemRouteForm);
  const [showItemRouteForm, setShowItemRouteForm] = useState(false);
  const [editingItemRouteKey, setEditingItemRouteKey] = useState<string | null>(null);

  // Process Type state
  const [processTypes, setProcessTypes] = useState<Record<string, ProcessTypeRecord>>({});
  const [processTypeForm, setProcessTypeForm] = useState<ProcessTypeRecord>(emptyProcessTypeForm);
  const [showProcessTypeForm, setShowProcessTypeForm] = useState(false);
  const [editingProcessTypeKey, setEditingProcessTypeKey] = useState<string | null>(null);
  const [processSubTab, setProcessSubTab] = useState<'type' | 'master'>('type');

  // Process state
  const [processes, setProcesses] = useState<Record<string, ProcessRecord>>({});
  const [processForm, setProcessForm] = useState<ProcessRecord>(emptyProcessForm);
  const [showProcessForm, setShowProcessForm] = useState(false);
  const [editingProcessKey, setEditingProcessKey] = useState<string | null>(null);

  // Material Spec state
  const [materialSpecs, setMaterialSpecs] = useState<Record<string, MaterialSpecRecord>>({});
  const [materialSpecForm, setMaterialSpecForm] = useState<MaterialSpecRecord>(emptyMaterialSpecForm);
  const [showMaterialSpecForm, setShowMaterialSpecForm] = useState(false);
  const [editingMaterialSpecKey, setEditingMaterialSpecKey] = useState<string | null>(null);
  const [specUploading, setSpecUploading] = useState(false);
  const specFileInputRef = useRef<HTMLInputElement>(null);

  // Die-Product Mapping state
  const [dieProductMappings, setDieProductMappings] = useState<Record<string, DieProductMapping>>({});
  const [dpmForm, setDPMForm] = useState<DieProductMapping>(emptyDPMForm);
  const [showDPMForm, setShowDPMForm] = useState(false);
  const [editingDPMKey, setEditingDPMKey] = useState<string | null>(null);

  // Expire Date options loaded from Sales Master
  const [expireDateOptions, setExpireDateOptions] = useState<string[]>([]);

  // Item state
  const [items, setItems] = useState<Record<string, StoredItem>>({});
  const [itemForm, setItemForm] = useState<ItemFormData>(emptyItemForm);
  const [showItemForm, setShowItemForm] = useState(false);
  const [savedItemsTab, setSavedItemsTab] = useState<'RM' | 'SF' | 'FG'>('RM');
  const [savedItemsSearch, setSavedItemsSearch] = useState('');
  const [savedItemsGradeFilter, setSavedItemsGradeFilter] = useState('');

  // Data from Sales Master
  const [salesCustomers, setSalesCustomers] = useState<{ name: string }[]>([]);
  const [itemGroups, setItemGroups] = useState<string[]>([]);

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documentFileName, setDocumentFileName] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [materialSnap, salesSnap, customersSnap] = await Promise.all([
      get(ref(database, 'masters/material')),
      get(ref(database, 'masters/sales')),
      get(ref(database, 'sales/customers')),
    ]);

    if (materialSnap.exists()) {
      const data = materialSnap.val();
      setRmGrades(data.rmGrades || {});
      setItems(data.items || {});
      setDies(data.dies || {});
      setMachines(data.machines || {});
      setRoutes(data.routes || {});
      setItemRoutes(data.itemRoutes || {});
      setProcessTypes(data.processTypes || {});
      setProcesses(data.processes || {});
      setMaterialSpecs(data.materialSpecs || {});
      setDieProductMappings(data.dieProductMappings || {});
    }

    if (salesSnap.exists()) {
      const sales = salesSnap.val();

      // Item Groups: may be string[] or { value, status }[] (from GeneralMaster)
      if (sales.itemGroups) {
        const raw = sales.itemGroups;
        const arr: any[] = Array.isArray(raw) ? raw : Object.values(raw as Record<string, any>);
        setItemGroups(
          arr
            .filter((item: any) => {
              if (typeof item === 'string') return true;
              if (item && typeof item === 'object') return item.status !== 'inactive';
              return false;
            })
            .map((item: any) => (typeof item === 'string' ? item : String(item?.value ?? item)))
        );
      }

      // Expire Dates: load from Sales Master (supports legacy string[] and new MasterItem[])
      if (sales.expireDates) {
        const raw = sales.expireDates;
        const arr: any[] = Array.isArray(raw) ? raw : Object.values(raw as Record<string, any>);
        setExpireDateOptions(
          arr.map((item: any) => (typeof item === 'string' ? item : item?.value)).filter(Boolean)
        );
      }
    }

    if (customersSnap.exists()) {
      setSalesCustomers(
        Object.values(customersSnap.val() as Record<string, any>).map((c) => ({
          name: c.companyName || c.customerName || '',
        }))
      );
    }
  };

  // auto-fill Grade Type when Grade Code changes
  const handleGradeCodeChange = (code: string) => {
    const grade = Object.values(rmGrades).find((g) => g.gradeCode === code);
    setItemForm((f) => ({ ...f, gradeCode: code, gradeType: grade?.gradeType ?? '' }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = storageRef(storage, `material-documents/${Date.now()}_${file.name}`);
      await uploadBytes(path, file);
      const url = await getDownloadURL(path);
      setDocumentFileName(file.name);
      setItemForm((f) => ({ ...f, uploadDocument: url }));
      toast({ title: `${file.name} uploaded successfully` });
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleItemTypeChange = (type: ItemType) => {
    setItemForm({ ...emptyItemForm, itemType: type });
  };

  // ── RM Grade handlers ────────────────────────────────────────────────────────

  const saveRMGrade = async () => {
    if (!rmGradeForm.gradeCode.trim() || !rmGradeForm.gradeDescription.trim() || !rmGradeForm.gradeType.trim()) {
      toast({ title: 'Please fill all fields', variant: 'destructive' });
      return;
    }
    const id = editingRmGradeKey ?? nextKey(rmGrades, 'RMG');
    const updated = { ...rmGrades, [id]: rmGradeForm };
    setRmGrades(updated);
    await set(ref(database, 'masters/material/rmGrades'), updated);
    setRmGradeForm(emptyRMGradeForm);
    setShowRMGradeForm(false);
    setEditingRmGradeKey(null);
    toast({ title: editingRmGradeKey ? 'RM Grade updated' : 'RM Grade saved successfully' });
  };

  const clearRMGrade = () => setRmGradeForm(emptyRMGradeForm);
  const cancelRMGrade = () => { setRmGradeForm(emptyRMGradeForm); setShowRMGradeForm(false); setEditingRmGradeKey(null); };

  const editRMGrade = (key: string, grade: RMGrade) => {
    setRmGradeForm({ ...grade });
    setEditingRmGradeKey(key);
    setShowRMGradeForm(true);
  };

  const deleteRMGrade = async (key: string) => {
    const updated = { ...rmGrades };
    delete updated[key];
    setRmGrades(updated);
    await set(ref(database, 'masters/material/rmGrades'), updated);
    toast({ title: 'RM Grade deleted' });
  };

  // ── Item handlers ────────────────────────────────────────────────────────────

  const saveItem = async () => {
    if (!itemForm.itemType) {
      toast({ title: 'Please select an Item Type', variant: 'destructive' });
      return;
    }
    if (itemForm.itemType === 'RM' && (!itemForm.rmCode.trim() || !itemForm.rmDescription.trim())) {
      toast({ title: 'RM Code and RM Description are required', variant: 'destructive' });
      return;
    }
    if (itemForm.itemType === 'SF' && (!itemForm.sfCode.trim() || !itemForm.sfDescription.trim())) {
      toast({ title: 'SF Code and SF Description are required', variant: 'destructive' });
      return;
    }
    if (itemForm.itemType === 'FG' && (!itemForm.fgItemCode.trim() || !itemForm.fgDescription.trim())) {
      toast({ title: 'FG Item Code and FG Description are required', variant: 'destructive' });
      return;
    }
    // FG Price validation: must be ≥ 150% of RM Price
    if (itemForm.itemType === 'FG' && itemForm.fgPrice && itemForm.rmPrice) {
      const fp = parseFloat(itemForm.fgPrice);
      const rp = parseFloat(itemForm.rmPrice);
      if (!isNaN(fp) && !isNaN(rp) && rp > 0 && fp < rp * 1.5) {
        toast({
          title: `FG Price must be at least 150% of RM Price (minimum: ${(rp * 1.5).toFixed(2)})`,
          variant: 'destructive',
        });
        return;
      }
    }
    const id = nextKey(items, 'ITEM');
    const updated = { ...items, [id]: itemForm as StoredItem };
    setItems(updated);
    await set(ref(database, 'masters/material/items'), updated);
    setItemForm(emptyItemForm);
    setShowItemForm(false);
    toast({ title: 'Item saved successfully' });
  };

  const clearItem = () => { setItemForm((f) => ({ ...emptyItemForm, itemType: f.itemType })); setDocumentFileName(''); };
  const cancelItem = () => { setItemForm(emptyItemForm); setShowItemForm(false); setDocumentFileName(''); };

  // ── Die handlers ─────────────────────────────────────────────────────────────

  const saveDie = async () => {
    if (!dieForm.dieCode.trim() || !dieForm.dieDescription.trim() || !dieForm.dieType) {
      toast({ title: 'Please fill all Die fields', variant: 'destructive' });
      return;
    }
    const id = editingDieKey ?? nextKey(dies, 'DIE');
    const updated = { ...dies, [id]: dieForm };
    setDies(updated);
    await set(ref(database, 'masters/material/dies'), updated);
    setDieForm(emptyDieForm);
    setShowDieForm(false);
    setEditingDieKey(null);
    toast({ title: editingDieKey ? 'Die updated' : 'Die saved successfully' });
  };

  const editDie = (key: string, die: DieRecord) => {
    setDieForm({ ...die });
    setEditingDieKey(key);
    setShowDieForm(true);
  };

  const deleteDie = async (key: string) => {
    const updated = { ...dies };
    delete updated[key];
    setDies(updated);
    await set(ref(database, 'masters/material/dies'), updated);
    toast({ title: 'Die deleted' });
  };

  // ── Machine handlers ──────────────────────────────────────────────────────────

  const saveMachine = async () => {
    if (!machineForm.machineGroupCode.trim() || !machineForm.machineGroupName.trim()) {
      toast({ title: 'Please fill all Machine fields', variant: 'destructive' });
      return;
    }
    const id = editingMachineKey ?? nextKey(machines, 'MCH');
    const updated = { ...machines, [id]: machineForm };
    setMachines(updated);
    await set(ref(database, 'masters/material/machines'), updated);
    setMachineForm(emptyMachineForm);
    setShowMachineForm(false);
    setEditingMachineKey(null);
    toast({ title: editingMachineKey ? 'Machine updated' : 'Machine saved successfully' });
  };

  const editMachine = (key: string, machine: MachineRecord) => {
    setMachineForm({ ...machine });
    setEditingMachineKey(key);
    setShowMachineForm(true);
  };

  const deleteMachine = async (key: string) => {
    const updated = { ...machines };
    delete updated[key];
    setMachines(updated);
    await set(ref(database, 'masters/material/machines'), updated);
    toast({ title: 'Machine deleted' });
  };

  // ── Item-Route handlers ───────────────────────────────────────────────────────

  const handleItemRouteCodeChange = (routeId: string) => {
    const route = Object.values(routes).find((r) => r.routeId === routeId);
    setItemRouteForm((f) => ({ ...f, routeCode: routeId, routeName: route?.routeName || '' }));
  };

  const handleItemRouteItemChange = (fgCode: string) => {
    const fg = Object.values(items).find((i) => i.itemType === 'FG' && i.fgItemCode === fgCode);
    setItemRouteForm((f) => ({ ...f, itemCode: fgCode, itemName: fg?.fgDescription || '' }));
  };

  const saveItemRoute = async () => {
    if (!itemRouteForm.itemCode || !itemRouteForm.routeCode || !itemRouteForm.routeType) {
      toast({ title: 'Item Code, Route Code and Route Type are required', variant: 'destructive' });
      return;
    }
    const id = editingItemRouteKey ?? nextKey(itemRoutes, 'IR');
    const updated = { ...itemRoutes, [id]: itemRouteForm };
    setItemRoutes(updated);
    await set(ref(database, 'masters/material/itemRoutes'), updated);
    setItemRouteForm(emptyItemRouteForm);
    setShowItemRouteForm(false);
    setEditingItemRouteKey(null);
    toast({ title: editingItemRouteKey ? 'Item-Route updated' : 'Item-Route saved' });
  };

  const editItemRoute = (key: string, ir: ItemRouteRecord) => {
    setItemRouteForm({ ...ir });
    setEditingItemRouteKey(key);
    setShowItemRouteForm(true);
  };

  const deleteItemRoute = async (key: string) => {
    const updated = { ...itemRoutes };
    delete updated[key];
    setItemRoutes(updated);
    await set(ref(database, 'masters/material/itemRoutes'), updated);
    toast({ title: 'Item-Route deleted' });
  };

  // ── Route handlers ────────────────────────────────────────────────────────────

  const normaliseProcesses = (raw: unknown): RouteProcessEntry[] => {
    if (!raw) return [];
    return Array.isArray(raw) ? raw : Object.values(raw as Record<string, RouteProcessEntry>);
  };

  const addProcessToRoute = (processId: string) => {
    const proc = Object.values(processes).find((p) => p.processId === processId);
    if (!proc) return;
    const current = normaliseProcesses(routeForm.processes);
    if (current.some((p) => p.processCode === processId)) return;
    setRouteForm((f) => ({
      ...f,
      processes: [...normaliseProcesses(f.processes), { processCode: processId, processName: proc.processName }],
    }));
    setRouteProcessSelection('');
  };

  const removeProcessFromRoute = (processCode: string) => {
    setRouteForm((f) => ({
      ...f,
      processes: normaliseProcesses(f.processes).filter((p) => p.processCode !== processCode),
    }));
  };

  const saveRoute = async () => {
    if (!routeForm.routeId.trim() || !routeForm.routeName.trim()) {
      toast({ title: 'Route ID and Route Name are required', variant: 'destructive' });
      return;
    }
    const id = editingRouteKey ?? nextKey(routes, 'RTE');
    const updated = { ...routes, [id]: routeForm };
    setRoutes(updated);
    await set(ref(database, 'masters/material/routes'), updated);
    setRouteForm(emptyRouteForm);
    setRouteProcessSelection('');
    setShowRouteForm(false);
    setEditingRouteKey(null);
    toast({ title: editingRouteKey ? 'Route updated' : 'Route saved' });
  };

  const editRoute = (key: string, route: RouteRecord) => {
    const rawProcesses = route.processes;
    const processes = rawProcesses
      ? (Array.isArray(rawProcesses) ? rawProcesses : Object.values(rawProcesses))
      : [];
    setRouteForm({ ...route, processes });
    setRouteProcessSelection('');
    setEditingRouteKey(key);
    setShowRouteForm(true);
  };

  const deleteRoute = async (key: string) => {
    const updated = { ...routes };
    delete updated[key];
    setRoutes(updated);
    await set(ref(database, 'masters/material/routes'), updated);
    toast({ title: 'Route deleted' });
  };

  // ── Process Type handlers ─────────────────────────────────────────────────────

  const saveProcessType = async () => {
    if (!processTypeForm.processTypeCode.trim() || !processTypeForm.processTypeName.trim()) {
      toast({ title: 'Please fill all Process Type fields', variant: 'destructive' });
      return;
    }
    const id = editingProcessTypeKey ?? nextKey(processTypes, 'PTYPE');
    const updated = { ...processTypes, [id]: processTypeForm };
    setProcessTypes(updated);
    await set(ref(database, 'masters/material/processTypes'), updated);
    setProcessTypeForm(emptyProcessTypeForm);
    setShowProcessTypeForm(false);
    setEditingProcessTypeKey(null);
    toast({ title: editingProcessTypeKey ? 'Process Type updated' : 'Process Type saved' });
  };

  const editProcessType = (key: string, pt: ProcessTypeRecord) => {
    setProcessTypeForm({ ...pt });
    setEditingProcessTypeKey(key);
    setShowProcessTypeForm(true);
  };

  const deleteProcessType = async (key: string) => {
    const updated = { ...processTypes };
    delete updated[key];
    setProcessTypes(updated);
    await set(ref(database, 'masters/material/processTypes'), updated);
    toast({ title: 'Process Type deleted' });
  };

  // ── Process handlers ──────────────────────────────────────────────────────────

  const saveProcess = async () => {
    if (!processForm.processId.trim() || !processForm.processName.trim() || !processForm.processType.trim()) {
      toast({ title: 'Please fill all Process fields', variant: 'destructive' });
      return;
    }
    const id = editingProcessKey ?? nextKey(processes, 'PRC');
    const updated = { ...processes, [id]: processForm };
    setProcesses(updated);
    await set(ref(database, 'masters/material/processes'), updated);
    setProcessForm(emptyProcessForm);
    setShowProcessForm(false);
    setEditingProcessKey(null);
    toast({ title: editingProcessKey ? 'Process updated' : 'Process saved successfully' });
  };

  const editProcess = (key: string, process: ProcessRecord) => {
    setProcessForm({ ...process });
    setEditingProcessKey(key);
    setShowProcessForm(true);
  };

  const deleteProcess = async (key: string) => {
    const updated = { ...processes };
    delete updated[key];
    setProcesses(updated);
    await set(ref(database, 'masters/material/processes'), updated);
    toast({ title: 'Process deleted' });
  };

  // ── Material Spec handlers ────────────────────────────────────────────────────

  const handleSpecFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSpecUploading(true);
    try {
      const path = storageRef(storage, `material-specs/${Date.now()}_${file.name}`);
      await uploadBytes(path, file);
      const url = await getDownloadURL(path);
      setMaterialSpecForm((f) => ({ ...f, documentUrl: url, documentName: file.name }));
      toast({ title: `${file.name} uploaded` });
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setSpecUploading(false);
      if (specFileInputRef.current) specFileInputRef.current.value = '';
    }
  };

  const saveMaterialSpec = async () => {
    if (!materialSpecForm.materialSpecNo.trim() || !materialSpecForm.itemCode.trim()) {
      toast({ title: 'Material Spec No and Item Code are required', variant: 'destructive' });
      return;
    }
    const id = editingMaterialSpecKey ?? nextKey(materialSpecs, 'MSPEC');
    const updated = { ...materialSpecs, [id]: materialSpecForm };
    setMaterialSpecs(updated);
    await set(ref(database, 'masters/material/materialSpecs'), updated);
    setMaterialSpecForm(emptyMaterialSpecForm);
    setShowMaterialSpecForm(false);
    setEditingMaterialSpecKey(null);
    toast({ title: editingMaterialSpecKey ? 'Material Spec updated' : 'Material Spec saved' });
  };

  const editMaterialSpec = (key: string, spec: MaterialSpecRecord) => {
    setMaterialSpecForm({ ...spec });
    setEditingMaterialSpecKey(key);
    setShowMaterialSpecForm(true);
  };

  const deleteMaterialSpec = async (key: string) => {
    const updated = { ...materialSpecs };
    delete updated[key];
    setMaterialSpecs(updated);
    await set(ref(database, 'masters/material/materialSpecs'), updated);
    toast({ title: 'Material Spec deleted' });
  };

  // ── Die-Product Mapping handlers ────────────────────────────────────────────
  const saveDPM = async () => {
    if (!dpmForm.mouldingType || !dpmForm.dieCode || !dpmForm.itemType) {
      toast({ title: 'Please fill all Die-Product Mapping fields', variant: 'destructive' });
      return;
    }
    const id = editingDPMKey ?? nextKey(dieProductMappings, 'DPM');
    const updated = { ...dieProductMappings, [id]: dpmForm };
    setDieProductMappings(updated);
    await set(ref(database, 'masters/material/dieProductMappings'), updated);
    setDPMForm(emptyDPMForm);
    setShowDPMForm(false);
    setEditingDPMKey(null);
    toast({ title: editingDPMKey ? 'Mapping updated' : 'Mapping saved' });
  };

  const editDPM = (key: string, dpm: DieProductMapping) => {
    setDPMForm({ ...dpm });
    setEditingDPMKey(key);
    setShowDPMForm(true);
  };

  const deleteDPM = async (key: string) => {
    const updated = { ...dieProductMappings };
    delete updated[key];
    setDieProductMappings(updated);
    await set(ref(database, 'masters/material/dieProductMappings'), updated);
    toast({ title: 'Mapping deleted' });
  };

  // helper
  const gradeCodeOptions = Object.values(rmGrades).map((g) => g.gradeCode);
  const rmCodeOptions = Object.values(items)
    .filter((i) => i.itemType === 'RM')
    .map((i) => i.rmCode);

  // ── Tabs ─────────────────────────────────────────────────────────────────────

  const tabs: { key: ActiveTab; label: string; icon: LucideIcon }[] = [
    { key: 'rmGrade', label: 'RM Grade Master', icon: Tag },
    { key: 'item', label: 'Item Master', icon: Package },
    { key: 'die', label: 'Die', icon: Disc },
    { key: 'dieProductMapping', label: 'Die-Product Mapping', icon: Layers },
    { key: 'machine', label: 'Machine', icon: Cog },
    { key: 'process', label: 'Process', icon: GitBranch },
    { key: 'route', label: 'Route', icon: Navigation },
    { key: 'itemRoute', label: 'Item-Route', icon: Link },
    { key: 'materialSpec', label: 'Material Spec-Number', icon: Hash },
  ];

  const ComingSoon = ({ label }: { label: string }) => (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-lg">
      {label} — coming soon
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Sub-nav */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── RM Grade Master ── */}
      {activeTab === 'rmGrade' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              RM Grade Master
              <Button size="sm" onClick={() => setShowRMGradeForm(true)} className="bg-primary">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {showRMGradeForm && (
              <div className="mb-6 p-4 border border-border rounded-lg bg-muted/30 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="gradeCode">Grade Code</Label>
                    <Input id="gradeCode" placeholder="Enter grade code"
                      value={rmGradeForm.gradeCode}
                      onChange={(e) => setRmGradeForm({ ...rmGradeForm, gradeCode: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="gradeDescription">Grade Description</Label>
                    <Input id="gradeDescription" placeholder="Enter grade description"
                      value={rmGradeForm.gradeDescription}
                      onChange={(e) => setRmGradeForm({ ...rmGradeForm, gradeDescription: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="gradeType">Grade Type</Label>
                    <Input id="gradeType" placeholder="Enter grade type"
                      value={rmGradeForm.gradeType}
                      onChange={(e) => setRmGradeForm({ ...rmGradeForm, gradeType: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveRMGrade} className="bg-green-600 hover:bg-green-700 text-white">
                    {editingRmGradeKey ? 'Update' : 'Save'}
                  </Button>
                  <Button onClick={clearRMGrade} className="bg-yellow-500 hover:bg-yellow-600 text-white">Clear</Button>
                  <Button onClick={cancelRMGrade} className="bg-red-500 hover:bg-red-600 text-white">Cancel</Button>
                </div>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">S.No</TableHead>
                  <TableHead>Grade Code</TableHead>
                  <TableHead>Grade Description</TableHead>
                  <TableHead>Grade Type</TableHead>
                  <TableHead className="w-28">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(rmGrades).map(([id, grade], idx) => (
                  <TableRow key={id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-medium">{grade.gradeCode}</TableCell>
                    <TableCell>{grade.gradeDescription}</TableCell>
                    <TableCell>{grade.gradeType}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <button onClick={() => editRMGrade(id, grade)}
                          className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteRMGrade(id)}
                          className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {Object.keys(rmGrades).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      No RM grades added yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === 'die' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              Die Master
              <Button size="sm" onClick={() => { setShowDieForm(true); setDieForm(emptyDieForm); setEditingDieKey(null); }}
                className="bg-primary">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {showDieForm && (
              <div className="mb-6 p-4 border border-border rounded-lg bg-muted/30 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label>Die Code <span className="text-red-500">*</span></Label>
                    <Input placeholder="Enter die code" value={dieForm.dieCode}
                      onChange={(e) => setDieForm({ ...dieForm, dieCode: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Die Description <span className="text-red-500">*</span></Label>
                    <Input placeholder="Enter die description" value={dieForm.dieDescription}
                      onChange={(e) => setDieForm({ ...dieForm, dieDescription: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Die Type <span className="text-red-500">*</span></Label>
                    <Select value={dieForm.dieType} onValueChange={(v) => setDieForm({ ...dieForm, dieType: v })}>
                      <SelectTrigger><SelectValue placeholder="-- SELECT --" /></SelectTrigger>
                      <SelectContent>
                        {DIE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveDie} className="bg-green-600 hover:bg-green-700 text-white">
                    {editingDieKey ? 'Update' : 'Save'}
                  </Button>
                  <Button onClick={() => setDieForm(emptyDieForm)}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white">Clear</Button>
                  <Button onClick={() => { setShowDieForm(false); setDieForm(emptyDieForm); setEditingDieKey(null); }}
                    className="bg-red-500 hover:bg-red-600 text-white">Cancel</Button>
                </div>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">S.No</TableHead>
                  <TableHead>Die Code</TableHead>
                  <TableHead>Die Description</TableHead>
                  <TableHead>Die Type</TableHead>
                  <TableHead className="w-28">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(dies).map(([id, die], idx) => (
                  <TableRow key={id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-medium">{die.dieCode}</TableCell>
                    <TableCell>{die.dieDescription}</TableCell>
                    <TableCell>{die.dieType}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <button onClick={() => editDie(id, die)}
                          className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteDie(id)}
                          className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {Object.keys(dies).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      No dies added yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {activeTab === 'machine' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              Machine Master
              <Button size="sm" onClick={() => { setShowMachineForm(true); setMachineForm(emptyMachineForm); setEditingMachineKey(null); }}
                className="bg-primary">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {showMachineForm && (
              <div className="mb-6 p-4 border border-border rounded-lg bg-muted/30 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label>Machine Group Code <span className="text-red-500">*</span></Label>
                    <Input placeholder="Enter machine group code" value={machineForm.machineGroupCode}
                      onChange={(e) => setMachineForm({ ...machineForm, machineGroupCode: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Machine Name <span className="text-red-500">*</span></Label>
                    <Input placeholder="Enter machine name" value={machineForm.machineGroupName}
                      onChange={(e) => setMachineForm({ ...machineForm, machineGroupName: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Operator Name</Label>
                    <Input placeholder="Enter operator name" value={machineForm.operatorName}
                      onChange={(e) => setMachineForm({ ...machineForm, operatorName: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Machine Location</Label>
                    <Input placeholder="Enter machine location" value={machineForm.machineLocation}
                      onChange={(e) => setMachineForm({ ...machineForm, machineLocation: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Serial Number</Label>
                    <Input placeholder="Enter serial number" value={machineForm.serialNumber}
                      onChange={(e) => setMachineForm({ ...machineForm, serialNumber: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Make (Brand Name)</Label>
                    <Input placeholder="Enter make / brand" value={machineForm.make}
                      onChange={(e) => setMachineForm({ ...machineForm, make: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Year</Label>
                    <Input placeholder="e.g. 2024" value={machineForm.year}
                      onChange={(e) => setMachineForm({ ...machineForm, year: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Service Date</Label>
                    <Input type="date" value={machineForm.serviceDate}
                      onChange={(e) => setMachineForm({ ...machineForm, serviceDate: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveMachine} className="bg-green-600 hover:bg-green-700 text-white">
                    {editingMachineKey ? 'Update' : 'Save'}
                  </Button>
                  <Button onClick={() => setMachineForm(emptyMachineForm)}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white">Clear</Button>
                  <Button onClick={() => { setShowMachineForm(false); setMachineForm(emptyMachineForm); setEditingMachineKey(null); }}
                    className="bg-red-500 hover:bg-red-600 text-white">Cancel</Button>
                </div>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">S.No</TableHead>
                  <TableHead>Machine Group Code</TableHead>
                  <TableHead>Machine Name</TableHead>
                  <TableHead>Operator Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Make</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Service Date</TableHead>
                  <TableHead className="w-28">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(machines).map(([id, machine], idx) => (
                  <TableRow key={id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-medium">{machine.machineGroupCode}</TableCell>
                    <TableCell>{machine.machineGroupName}</TableCell>
                    <TableCell>{machine.operatorName || '—'}</TableCell>
                    <TableCell>{machine.machineLocation || '—'}</TableCell>
                    <TableCell>{machine.make || '—'}</TableCell>
                    <TableCell>{machine.year || '—'}</TableCell>
                    <TableCell>{machine.serviceDate || '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <button onClick={() => editMachine(id, machine)}
                          className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteMachine(id)}
                          className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {Object.keys(machines).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                      No machines added yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === 'process' && (
        <div className="space-y-4">
          {/* Process sub-nav */}
          <div className="flex gap-1 border-b border-border">
            {(['type', 'master'] as const).map((sub) => (
              <button key={sub} onClick={() => setProcessSubTab(sub)}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${processSubTab === sub
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}>
                {sub === 'type' ? 'Process Type Master' : 'Process Master'}
              </button>
            ))}
          </div>

          {/* ── Process Type Master ── */}
          {processSubTab === 'type' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  Process Type Master
                  <Button size="sm" onClick={() => { setShowProcessTypeForm(true); setProcessTypeForm(emptyProcessTypeForm); setEditingProcessTypeKey(null); }}
                    className="bg-primary">
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {showProcessTypeForm && (
                  <div className="mb-6 p-4 border border-border rounded-lg bg-muted/30 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <Label>Process Type Code <span className="text-red-500">*</span></Label>
                        <Input placeholder="Enter process type code" value={processTypeForm.processTypeCode}
                          onChange={(e) => setProcessTypeForm({ ...processTypeForm, processTypeCode: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Process Type Name <span className="text-red-500">*</span></Label>
                        <Input placeholder="Enter process type name" value={processTypeForm.processTypeName}
                          onChange={(e) => setProcessTypeForm({ ...processTypeForm, processTypeName: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Process Location</Label>
                        <Input placeholder="Enter process location" value={processTypeForm.processLocation}
                          onChange={(e) => setProcessTypeForm({ ...processTypeForm, processLocation: e.target.value })} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={saveProcessType} className="bg-green-600 hover:bg-green-700 text-white">
                        {editingProcessTypeKey ? 'Update' : 'Save'}
                      </Button>
                      <Button onClick={() => setProcessTypeForm(emptyProcessTypeForm)}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white">Clear</Button>
                      <Button onClick={() => { setShowProcessTypeForm(false); setProcessTypeForm(emptyProcessTypeForm); setEditingProcessTypeKey(null); }}
                        className="bg-red-500 hover:bg-red-600 text-white">Cancel</Button>
                    </div>
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">S.No</TableHead>
                      <TableHead>Process Type Code</TableHead>
                      <TableHead>Process Type Name</TableHead>
                      <TableHead>Process Location</TableHead>
                      <TableHead className="w-28">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(processTypes).map(([id, pt], idx) => (
                      <TableRow key={id}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell className="font-medium">{pt.processTypeCode}</TableCell>
                        <TableCell>{pt.processTypeName}</TableCell>
                        <TableCell>{pt.processLocation || '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <button onClick={() => editProcessType(id, pt)}
                              className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => deleteProcessType(id)}
                              className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {Object.keys(processTypes).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                          No process types added yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* ── Process Master ── */}
          {processSubTab === 'master' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  Process Master
                  <Button size="sm" onClick={() => { setShowProcessForm(true); setProcessForm(emptyProcessForm); setEditingProcessKey(null); }}
                    className="bg-primary">
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {showProcessForm && (
                  <div className="mb-6 p-4 border border-border rounded-lg bg-muted/30 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <Label>Process ID <span className="text-red-500">*</span></Label>
                        <Input placeholder="Enter process ID" value={processForm.processId}
                          onChange={(e) => setProcessForm({ ...processForm, processId: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Process Name <span className="text-red-500">*</span></Label>
                        <Input placeholder="Enter process name" value={processForm.processName}
                          onChange={(e) => setProcessForm({ ...processForm, processName: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Process Type <span className="text-red-500">*</span></Label>
                        <Select value={processForm.processType}
                          onValueChange={(v) => setProcessForm({ ...processForm, processType: v })}>
                          <SelectTrigger><SelectValue placeholder="-- SELECT --" /></SelectTrigger>
                          <SelectContent>
                            {Object.values(processTypes).length === 0 && (
                              <SelectItem value="_none" disabled>Add types in Process Type Master first</SelectItem>
                            )}
                            {Object.values(processTypes).map((pt) => (
                              <SelectItem key={pt.processTypeCode} value={pt.processTypeName}>
                                {pt.processTypeName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={saveProcess} className="bg-green-600 hover:bg-green-700 text-white">
                        {editingProcessKey ? 'Update' : 'Save'}
                      </Button>
                      <Button onClick={() => setProcessForm(emptyProcessForm)}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white">Clear</Button>
                      <Button onClick={() => { setShowProcessForm(false); setProcessForm(emptyProcessForm); setEditingProcessKey(null); }}
                        className="bg-red-500 hover:bg-red-600 text-white">Cancel</Button>
                    </div>
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">S.No</TableHead>
                      <TableHead>Process ID</TableHead>
                      <TableHead>Process Name</TableHead>
                      <TableHead>Process Type</TableHead>
                      <TableHead className="w-28">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(processes).map(([id, process], idx) => (
                      <TableRow key={id}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell className="font-medium">{process.processId}</TableCell>
                        <TableCell>{process.processName}</TableCell>
                        <TableCell>{process.processType}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <button onClick={() => editProcess(id, process)}
                              className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => deleteProcess(id)}
                              className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {Object.keys(processes).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                          No processes added yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      {activeTab === 'route' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              Route Master
              <Button size="sm" onClick={() => { setShowRouteForm(true); setRouteForm(emptyRouteForm); setEditingRouteKey(null); }}
                className="bg-primary">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {showRouteForm && (
              <div className="mb-6 p-4 border border-border rounded-lg bg-muted/30 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left: inputs */}
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <Label>Route ID <span className="text-red-500">*</span></Label>
                      <Input placeholder="Enter route ID" value={routeForm.routeId}
                        onChange={(e) => setRouteForm({ ...routeForm, routeId: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Route Name <span className="text-red-500">*</span></Label>
                      <Input placeholder="Enter route name" value={routeForm.routeName}
                        onChange={(e) => setRouteForm({ ...routeForm, routeName: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Process Type</Label>
                      <Select value={routeProcessSelection} onValueChange={addProcessToRoute}>
                        <SelectTrigger><SelectValue placeholder="-- SELECT --" /></SelectTrigger>
                        <SelectContent>
                          {Object.values(processes).length === 0 && (
                            <SelectItem value="_none" disabled>Add processes in Process Master first</SelectItem>
                          )}
                          {Object.values(processes).map((p) => (
                            <SelectItem key={p.processId} value={p.processId}>
                              {p.processName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Right: process list table */}
                  <div className="border border-border rounded overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Process Code</TableHead>
                          <TableHead>Process Name</TableHead>
                          <TableHead className="w-16">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {normaliseProcesses(routeForm.processes).map((p) => (
                          <TableRow key={p.processCode}>
                            <TableCell className="font-medium">{p.processCode}</TableCell>
                            <TableCell>{p.processName}</TableCell>
                            <TableCell>
                              <button onClick={() => removeProcessFromRoute(p.processCode)}
                                className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {normaliseProcesses(routeForm.processes).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground py-4 text-sm">
                              No processes added
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={saveRoute} className="bg-green-600 hover:bg-green-700 text-white">
                    {editingRouteKey ? 'Update' : 'Save'}
                  </Button>
                  <Button onClick={() => { setRouteForm(emptyRouteForm); setRouteProcessSelection(''); }}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white">Clear</Button>
                  <Button onClick={() => { setShowRouteForm(false); setRouteForm(emptyRouteForm); setRouteProcessSelection(''); setEditingRouteKey(null); }}
                    className="bg-red-500 hover:bg-red-600 text-white">Cancel</Button>
                </div>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">S.No</TableHead>
                  <TableHead>Route ID</TableHead>
                  <TableHead>Route Name</TableHead>
                  <TableHead>No. of Processes</TableHead>
                  <TableHead className="w-28">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(routes).map(([id, route], idx) => (
                  <TableRow key={id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-medium">{route.routeId}</TableCell>
                    <TableCell>{route.routeName}</TableCell>
                    <TableCell>{(Array.isArray(route.processes) ? route.processes : Object.values(route.processes || {})).length}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <button onClick={() => editRoute(id, route)}
                          className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteRoute(id)}
                          className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {Object.keys(routes).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      No routes added yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {activeTab === 'itemRoute' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              Item-Route Master
              <Button size="sm" onClick={() => { setShowItemRouteForm(true); setItemRouteForm(emptyItemRouteForm); setEditingItemRouteKey(null); }}
                className="bg-primary">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {showItemRouteForm && (
              <div className="mb-6 p-4 border border-border rounded-lg bg-muted/30 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">

                  {/* Item Code */}
                  <div className="space-y-1">
                    <Label>Item Code <span className="text-red-500">*</span></Label>
                    <Select value={itemRouteForm.itemCode} onValueChange={handleItemRouteItemChange}>
                      <SelectTrigger><SelectValue placeholder="-- SELECT --" /></SelectTrigger>
                      <SelectContent>
                        {Object.values(items).filter(i => i.itemType === 'FG').length === 0 && (
                          <SelectItem value="_none" disabled>No FG items in Item Master</SelectItem>
                        )}
                        {Object.values(items).filter(i => i.itemType === 'FG').map(i => (
                          <SelectItem key={i.fgItemCode} value={i.fgItemCode}>{i.fgItemCode}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Item Name — auto-filled */}
                  <div className="space-y-1">
                    <Label>Item Name</Label>
                    <Input readOnly value={itemRouteForm.itemName}
                      className="bg-muted text-muted-foreground" placeholder="Auto-filled from Item Code" />
                  </div>

                  {/* Route Type */}
                  <div className="space-y-1">
                    <Label>Route Type <span className="text-red-500">*</span></Label>
                    <Select value={itemRouteForm.routeType}
                      onValueChange={(v) => setItemRouteForm(f => ({ ...f, routeType: v }))}>
                      <SelectTrigger><SelectValue placeholder="-- SELECT --" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Primary">Primary</SelectItem>
                        <SelectItem value="Alternate">Alternate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Route Code */}
                  <div className="space-y-1">
                    <Label>Route Code <span className="text-red-500">*</span></Label>
                    <Select value={itemRouteForm.routeCode} onValueChange={handleItemRouteCodeChange}>
                      <SelectTrigger><SelectValue placeholder="-- SELECT --" /></SelectTrigger>
                      <SelectContent>
                        {Object.values(routes).length === 0 && (
                          <SelectItem value="_none" disabled>No routes in Route Master</SelectItem>
                        )}
                        {Object.values(routes).map(r => (
                          <SelectItem key={r.routeId} value={r.routeId}>{r.routeId}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Route Name — auto-filled */}
                  <div className="space-y-1">
                    <Label>Route Name</Label>
                    <Input readOnly value={itemRouteForm.routeName}
                      className="bg-muted text-muted-foreground" placeholder="Auto-filled from Route Code" />
                  </div>

                </div>
                <div className="flex gap-2">
                  <Button onClick={saveItemRoute} className="bg-green-600 hover:bg-green-700 text-white">
                    {editingItemRouteKey ? 'Update' : 'Save'}
                  </Button>
                  <Button onClick={() => setItemRouteForm(emptyItemRouteForm)}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white">Clear</Button>
                  <Button onClick={() => { setShowItemRouteForm(false); setItemRouteForm(emptyItemRouteForm); setEditingItemRouteKey(null); }}
                    className="bg-red-500 hover:bg-red-600 text-white">Cancel</Button>
                </div>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">S.No</TableHead>
                  <TableHead>Item Code</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Route Code</TableHead>
                  <TableHead>Route Name</TableHead>
                  <TableHead>Route Type</TableHead>
                  <TableHead className="w-28">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(itemRoutes).map(([id, ir], idx) => (
                  <TableRow key={id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-medium">{ir.itemCode}</TableCell>
                    <TableCell>{ir.itemName}</TableCell>
                    <TableCell>{ir.routeCode}</TableCell>
                    <TableCell>{ir.routeName}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ir.routeType === 'Primary'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                        }`}>{ir.routeType}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <button onClick={() => editItemRoute(id, ir)}
                          className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteItemRoute(id)}
                          className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {Object.keys(itemRoutes).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      No item routes added yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Die-Product Mapping ── */}
      {activeTab === 'dieProductMapping' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              Die-Product Mapping
              <Button size="sm" onClick={() => { setShowDPMForm(true); setDPMForm(emptyDPMForm); setEditingDPMKey(null); }}
                className="bg-primary">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {showDPMForm && (
              <div className="mb-6 p-4 border border-border rounded-lg bg-muted/30 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Moulding Type — highest priority field */}
                  <div className="space-y-1">
                    <Label>Moulding Type <span className="text-red-500">*</span></Label>
                    <Select value={dpmForm.mouldingType} onValueChange={(v) => setDPMForm({ ...dpmForm, mouldingType: v })}>
                      <SelectTrigger><SelectValue placeholder="-- SELECT --" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Injection Moulding">Injection Moulding</SelectItem>
                        <SelectItem value="Compression Moulding">Compression Moulding</SelectItem>
                        <SelectItem value="Rubber Moulding">Rubber Moulding</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Die — from Die Master */}
                  <div className="space-y-1">
                    <Label>Die <span className="text-red-500">*</span></Label>
                    <Select value={dpmForm.dieCode} onValueChange={(v) => setDPMForm({ ...dpmForm, dieCode: v })}>
                      <SelectTrigger><SelectValue placeholder="-- SELECT --" /></SelectTrigger>
                      <SelectContent>
                        {Object.values(dies).length === 0 && (
                          <SelectItem value="_none" disabled>No dies in Die Master</SelectItem>
                        )}
                        {Object.values(dies).map((d) => (
                          <SelectItem key={d.dieCode} value={d.dieCode}>
                            {d.dieCode} — {d.dieDescription}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Item Type */}
                  <div className="space-y-1">
                    <Label>Item Type <span className="text-red-500">*</span></Label>
                    <Select value={dpmForm.itemType} onValueChange={(v) => setDPMForm({ ...dpmForm, itemType: v })}>
                      <SelectTrigger><SelectValue placeholder="-- SELECT --" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RM">RM</SelectItem>
                        <SelectItem value="SF">SF</SelectItem>
                        <SelectItem value="FG">FG</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveDPM} className="bg-green-600 hover:bg-green-700 text-white">
                    {editingDPMKey ? 'Update' : 'Save'}
                  </Button>
                  <Button onClick={() => setDPMForm(emptyDPMForm)} className="bg-yellow-500 hover:bg-yellow-600 text-white">Clear</Button>
                  <Button onClick={() => { setShowDPMForm(false); setDPMForm(emptyDPMForm); setEditingDPMKey(null); }}
                    className="bg-red-500 hover:bg-red-600 text-white">Cancel</Button>
                </div>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">S.No</TableHead>
                  <TableHead>Moulding Type</TableHead>
                  <TableHead>Die Code</TableHead>
                  <TableHead>Item Type</TableHead>
                  <TableHead className="w-28">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(dieProductMappings).map(([id, dpm], idx) => (
                  <TableRow key={id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-medium">{dpm.mouldingType}</TableCell>
                    <TableCell>{dpm.dieCode}</TableCell>
                    <TableCell>
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700">{dpm.itemType}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <button onClick={() => editDPM(id, dpm)}
                          className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteDPM(id)}
                          className="p-1.5 rounded bg-red-400 hover:bg-red-500 text-white">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {Object.keys(dieProductMappings).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      No mappings added yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === 'materialSpec' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              Material Spec-Number
              <Button size="sm" onClick={() => { setShowMaterialSpecForm(true); setMaterialSpecForm(emptyMaterialSpecForm); setEditingMaterialSpecKey(null); }}
                className="bg-primary">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {showMaterialSpecForm && (
              <div className="mb-6 p-4 border border-border rounded-lg bg-muted/30 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Label>Material Spec No <span className="text-red-500">*</span></Label>
                    <Input placeholder="Enter spec number" value={materialSpecForm.materialSpecNo}
                      onChange={(e) => setMaterialSpecForm({ ...materialSpecForm, materialSpecNo: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Item Code <span className="text-red-500">*</span></Label>
                    <Select value={materialSpecForm.itemCode} onValueChange={(v) => {
                      const fg = Object.values(items).find((i) => i.itemType === 'FG' && i.fgItemCode === v);
                      setMaterialSpecForm((f) => ({ ...f, itemCode: v, itemName: fg?.fgDescription || '' }));
                    }}>
                      <SelectTrigger><SelectValue placeholder="-- SELECT --" /></SelectTrigger>
                      <SelectContent>
                        {Object.values(items).filter(i => i.itemType === 'FG').map((i) => (
                          <SelectItem key={i.fgItemCode} value={i.fgItemCode}>{i.fgItemCode}</SelectItem>
                        ))}
                        {Object.values(items).filter(i => i.itemType === 'FG').length === 0 && (
                          <SelectItem value="_none" disabled>No FG items in Item Master</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Customer Group</Label>
                    <Select value={materialSpecForm.customerGroup}
                      onValueChange={(v) => setMaterialSpecForm({ ...materialSpecForm, customerGroup: v })}>
                      <SelectTrigger><SelectValue placeholder="-- SELECT --" /></SelectTrigger>
                      <SelectContent>
                        {salesCustomers.length === 0 && (
                          <SelectItem value="_none" disabled>No customers in Sales Master</SelectItem>
                        )}
                        {salesCustomers.map((c) => (
                          <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Upload Document</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={materialSpecForm.documentName} placeholder="No file chosen"
                        className="flex-1 cursor-pointer text-sm"
                        onClick={() => specFileInputRef.current?.click()} />
                      <Button variant="outline" className="border-primary text-primary shrink-0"
                        disabled={specUploading} onClick={() => specFileInputRef.current?.click()}>
                        <Upload className="h-4 w-4 mr-1" />
                        {specUploading ? '…' : 'Browse'}
                      </Button>
                      <input ref={specFileInputRef} type="file" className="hidden" onChange={handleSpecFileChange} />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveMaterialSpec} className="bg-green-600 hover:bg-green-700 text-white">
                    {editingMaterialSpecKey ? 'Update' : 'Save'}
                  </Button>
                  <Button onClick={() => setMaterialSpecForm(emptyMaterialSpecForm)}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white">Clear</Button>
                  <Button onClick={() => { setShowMaterialSpecForm(false); setMaterialSpecForm(emptyMaterialSpecForm); setEditingMaterialSpecKey(null); }}
                    className="bg-red-500 hover:bg-red-600 text-white">Cancel</Button>
                </div>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">S.No</TableHead>
                  <TableHead>Material Spec No</TableHead>
                  <TableHead>Item Code</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead>View Document</TableHead>
                  <TableHead className="w-28">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(materialSpecs).map(([id, spec], idx) => (
                  <TableRow key={id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-medium">{spec.materialSpecNo}</TableCell>
                    <TableCell>{spec.itemCode}</TableCell>
                    <TableCell>{spec.itemName}</TableCell>
                    <TableCell>
                      {spec.documentUrl
                        ? <a href={spec.documentUrl} target="_blank" rel="noreferrer"
                          className="text-primary underline text-sm">{spec.documentName || 'View'}</a>
                        : <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <button onClick={() => editMaterialSpec(id, spec)}
                          className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteMaterialSpec(id)}
                          className="p-1.5 rounded bg-sky-400 hover:bg-sky-500 text-white">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {Object.keys(materialSpecs).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                      No material specs added yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Item Master ── */}
      {activeTab === 'item' && (
        <div className="space-y-4">
          {/* Top controls */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <Label>Item Type <span className="text-red-500">*</span></Label>
                  <Select value={itemForm.itemType} onValueChange={(v) => handleItemTypeChange(v as ItemType)}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RM">RM</SelectItem>
                      <SelectItem value="SF">SF</SelectItem>
                      <SelectItem value="FG">FG</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {itemForm.itemType && (
                  <Button variant="outline" className="border-primary text-primary hover:bg-primary/10">
                    <Upload className="h-4 w-4 mr-2" /> Bulk Upload
                  </Button>
                )}

                {(itemForm.itemType === 'RM' || itemForm.itemType === 'SF') && (
                  <div className="space-y-1">
                    <Label>Bin Location <span className="text-red-500">*</span></Label>
                    <Input className="w-52" placeholder="Enter bin location"
                      value={itemForm.binLocation}
                      onChange={(e) => setItemForm({ ...itemForm, binLocation: e.target.value })} />
                  </div>
                )}

                {!showItemForm && itemForm.itemType && (
                  <Button size="sm" onClick={() => setShowItemForm(true)} className="bg-primary ml-auto">
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Dynamic form */}
          {showItemForm && itemForm.itemType && (
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Dark header */}
              <div className="bg-gray-900 text-white px-4 py-3 text-sm font-semibold flex items-center gap-2">
                <span className="inline-flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                  <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
                  <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                </span>
                {SECTION_LABEL[itemForm.itemType as ItemType]}
              </div>

              <div className="p-5 bg-background space-y-5">

                {/* ── RM Form ── */}
                {itemForm.itemType === 'RM' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                    <div className="space-y-1">
                      <Label>RM Code <span className="text-red-500">*</span></Label>
                      <Input placeholder="Enter RM code" value={itemForm.rmCode}
                        onChange={(e) => setItemForm({ ...itemForm, rmCode: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>RM Description <span className="text-red-500">*</span></Label>
                      <Input placeholder="Enter RM description" value={itemForm.rmDescription}
                        onChange={(e) => setItemForm({ ...itemForm, rmDescription: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>UOM <span className="text-red-500">*</span></Label>
                      <Select value={itemForm.uom} onValueChange={(v) => setItemForm({ ...itemForm, uom: v })}>
                        <SelectTrigger><SelectValue placeholder="-- SELECT --" /></SelectTrigger>
                        <SelectContent>
                          {UOM_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Grade Code <span className="text-red-500">*</span></Label>
                      <SearchableSelect
                        value={itemForm.gradeCode}
                        onValueChange={handleGradeCodeChange}
                        options={gradeCodeOptions}
                        placeholder="-- SELECT --"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Grade Type</Label>
                      <Input readOnly value={itemForm.gradeType} className="bg-muted text-muted-foreground" placeholder="Auto-filled" />
                    </div>
                    <div className="space-y-1">
                      <Label>Colour</Label>
                      <Input placeholder="Enter colour" value={itemForm.colour}
                        onChange={(e) => setItemForm({ ...itemForm, colour: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Minimum Stock</Label>
                      <Input type="number" placeholder="0.00" value={itemForm.minimumStock}
                        onChange={(e) => setItemForm({ ...itemForm, minimumStock: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Maximum Stock</Label>
                      <Input type="number" placeholder="0.00" value={itemForm.maximumStock}
                        onChange={(e) => setItemForm({ ...itemForm, maximumStock: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Expire Date</Label>
                      <Select value={itemForm.expireDate} onValueChange={(v) => setItemForm({ ...itemForm, expireDate: v })}>
                        <SelectTrigger><SelectValue placeholder="-- SELECT --" /></SelectTrigger>
                        <SelectContent>
                          {expireDateOptions.length === 0 && (
                            <SelectItem value="_none" disabled>Add expire dates in Sales Master</SelectItem>
                          )}
                          {expireDateOptions.map((opt) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Price</Label>
                      <Input type="number" placeholder="0.00" value={itemForm.rmPrice}
                        onChange={(e) => setItemForm({ ...itemForm, rmPrice: e.target.value })} />
                    </div>
                  </div>
                )}

                {/* ── SF Form ── */}
                {itemForm.itemType === 'SF' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                    <div className="space-y-1">
                      <Label>SF Code <span className="text-red-500">*</span></Label>
                      <Input placeholder="Enter SF code" value={itemForm.sfCode}
                        onChange={(e) => setItemForm({ ...itemForm, sfCode: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>SF Description <span className="text-red-500">*</span></Label>
                      <Input placeholder="Enter SF description" value={itemForm.sfDescription}
                        onChange={(e) => setItemForm({ ...itemForm, sfDescription: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>UOM <span className="text-red-500">*</span></Label>
                      <Select value={itemForm.uom} onValueChange={(v) => setItemForm({ ...itemForm, uom: v })}>
                        <SelectTrigger><SelectValue placeholder="-- SELECT --" /></SelectTrigger>
                        <SelectContent>
                          {UOM_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Grade Code <span className="text-red-500">*</span></Label>
                      <SearchableSelect
                        value={itemForm.gradeCode}
                        onValueChange={handleGradeCodeChange}
                        options={gradeCodeOptions}
                        placeholder="-- SELECT --"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Grade Type</Label>
                      <Input readOnly value={itemForm.gradeType} className="bg-muted text-muted-foreground" placeholder="Auto-filled" />
                    </div>
                    <div className="space-y-1">
                      <Label>Colour</Label>
                      <Input placeholder="Enter colour" value={itemForm.colour}
                        onChange={(e) => setItemForm({ ...itemForm, colour: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Minimum Stock</Label>
                      <Input type="number" placeholder="0.00" value={itemForm.minimumStock}
                        onChange={(e) => setItemForm({ ...itemForm, minimumStock: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Maximum Stock</Label>
                      <Input type="number" placeholder="0.00" value={itemForm.maximumStock}
                        onChange={(e) => setItemForm({ ...itemForm, maximumStock: e.target.value })} />
                    </div>
                  </div>
                )}

                {/* ── FG Form ── */}
                {itemForm.itemType === 'FG' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                      {/* Col 1 */}
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <Label>FG Item Code <span className="text-red-500">*</span></Label>
                          <Input placeholder="Enter FG item code" value={itemForm.fgItemCode}
                            onChange={(e) => setItemForm({ ...itemForm, fgItemCode: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label>Drawing No <span className="text-red-500">*</span></Label>
                          <Input placeholder="Enter drawing no" value={itemForm.drawingNo}
                            onChange={(e) => setItemForm({ ...itemForm, drawingNo: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label>RM Code <span className="text-red-500">*</span></Label>
                          <SearchableSelect
                            value={itemForm.fgRmCode}
                            onValueChange={(v) => {
                              const rmItem = Object.values(items).find((i) => i.itemType === 'RM' && i.rmCode === v);
                              setItemForm({ ...itemForm, fgRmCode: v, gradeCode: rmItem?.gradeCode ?? '', rmPrice: (rmItem as any)?.rmPrice ?? '' });
                            }}
                            options={rmCodeOptions}
                            placeholder="-- SELECT --"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>UOM <span className="text-red-500">*</span></Label>
                          <Select value={itemForm.uom} onValueChange={(v) => setItemForm({ ...itemForm, uom: v })}>
                            <SelectTrigger><SelectValue placeholder="-- SELECT --" /></SelectTrigger>
                            <SelectContent>
                              {UOM_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>Upload Document</Label>
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              value={documentFileName || ''}
                              placeholder="No file chosen"
                              className="flex-1 cursor-pointer"
                              onClick={() => fileInputRef.current?.click()}
                            />
                            <Button
                              variant="outline"
                              className="border-primary text-primary"
                              disabled={uploading}
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <Upload className="h-4 w-4 mr-1" />
                              {uploading ? 'Uploading…' : 'Browse'}
                            </Button>
                            <input
                              ref={fileInputRef}
                              type="file"
                              className="hidden"
                              onChange={handleFileChange}
                            />
                          </div>
                          {itemForm.uploadDocument && (
                            <a
                              href={itemForm.uploadDocument}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary underline mt-1 inline-block"
                            >
                              View uploaded file
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Col 2 */}
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <Label>FG Description <span className="text-red-500">*</span></Label>
                          <Input placeholder="Enter FG description" value={itemForm.fgDescription}
                            onChange={(e) => setItemForm({ ...itemForm, fgDescription: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label>Revision No <span className="text-red-500">*</span></Label>
                          <Input placeholder="Enter revision no" value={itemForm.revisionNo}
                            onChange={(e) => setItemForm({ ...itemForm, revisionNo: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label>Grade Code <span className="text-red-500">*</span></Label>
                          <Input readOnly value={itemForm.gradeCode} className="bg-muted" placeholder="Auto from RM" />
                        </div>
                        <div className="space-y-1">
                          <Label>RM Price</Label>
                          <Input readOnly value={itemForm.rmPrice} className="bg-muted text-muted-foreground" placeholder="Auto-filled from RM" />
                        </div>
                        <div className="space-y-1">
                          <Label>FG Price <span className="text-red-500">*</span></Label>
                          <Input type="number" placeholder="0.00" value={itemForm.fgPrice}
                            onChange={(e) => setItemForm({ ...itemForm, fgPrice: e.target.value })} />
                        </div>
                      </div>

                      {/* Col 3 — sizes, price, weight, category, BOM */}
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <Label>Finish Size <span className="text-red-500">*</span></Label>
                          <div className="flex gap-2">
                            <Input type="number" placeholder="0.0000" value={itemForm.finishSizeL}
                              onChange={(e) => setItemForm({ ...itemForm, finishSizeL: e.target.value })} />
                            <Input type="number" placeholder="0.0000" value={itemForm.finishSizeW}
                              onChange={(e) => setItemForm({ ...itemForm, finishSizeW: e.target.value })} />
                            <Input type="number" placeholder="0.0000" value={itemForm.finishSizeH}
                              onChange={(e) => setItemForm({ ...itemForm, finishSizeH: e.target.value })} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label>Rough Size <span className="text-red-500">*</span></Label>
                          <div className="flex gap-2">
                            <Input type="number" placeholder="0.0000" value={itemForm.roughSizeL}
                              onChange={(e) => setItemForm({ ...itemForm, roughSizeL: e.target.value })} />
                            <Input type="number" placeholder="0.0000" value={itemForm.roughSizeW}
                              onChange={(e) => setItemForm({ ...itemForm, roughSizeW: e.target.value })} />
                            <Input type="number" placeholder="0.0000" value={itemForm.roughSizeH}
                              onChange={(e) => setItemForm({ ...itemForm, roughSizeH: e.target.value })} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label>Weight <span className="text-red-500">*</span></Label>
                          <Input type="number" placeholder="0.00" value={itemForm.weight}
                            onChange={(e) => setItemForm({ ...itemForm, weight: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label>Item Group <span className="text-red-500">*</span></Label>
                          <SearchableSelect
                            value={itemForm.category}
                            onValueChange={(v) => setItemForm({ ...itemForm, category: v })}
                            options={itemGroups}
                            placeholder="-- SELECT --"
                          />
                        </div>
                        <div className="flex items-center gap-3 pt-1">
                          <Label>BOM</Label>
                          <Switch checked={itemForm.bom}
                            onCheckedChange={(v) => setItemForm({ ...itemForm, bom: v })} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                {itemForm.itemType && (
                  <div className="flex gap-3 pt-2">
                    <Button onClick={saveItem} className="bg-green-600 hover:bg-green-700 text-white px-6">Save</Button>
                    <Button onClick={clearItem} className="bg-yellow-500 hover:bg-yellow-600 text-white px-6">Clear</Button>
                    <Button onClick={cancelItem} className="bg-red-500 hover:bg-red-600 text-white px-6">Cancel</Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Items table */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-base font-bold">Saved Items</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex rounded-lg border bg-muted p-1 text-muted-foreground">
                  <button
                    onClick={() => {
                      setSavedItemsTab('RM');
                      setSavedItemsGradeFilter('');
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                      savedItemsTab === 'RM'
                        ? 'bg-blue-400 text-white shadow'
                        : 'hover:text-blue-400'
                    }`}
                  >
                    RM (Raw Materials)
                  </button>
                  <button
                    onClick={() => {
                      setSavedItemsTab('SF');
                      setSavedItemsGradeFilter('');
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                      savedItemsTab === 'SF'
                        ? 'bg-blue-400 text-white shadow'
                        : 'hover:text-blue-400'
                    }`}
                  >
                    SF (Semi-Finished Goods)
                  </button>
                  <button
                    onClick={() => {
                      setSavedItemsTab('FG');
                      setSavedItemsGradeFilter('');
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                      savedItemsTab === 'FG'
                        ? 'bg-blue-400 text-white shadow'
                        : 'hover:text-blue-400'
                    }`}
                  >
                    FG (Finished Goods)
                  </button>
                </div>
                <div className="w-full sm:w-48 text-xs">
                  <SearchableSelect
                    value={savedItemsGradeFilter || 'ALL'}
                    onValueChange={(val) => setSavedItemsGradeFilter(val === 'ALL' ? '' : val)}
                    options={[{ value: 'ALL', label: 'All Grades' }, ...gradeCodeOptions]}
                    placeholder="Filter by Grade Code"
                  />
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder={`Search ${savedItemsTab}...`}
                    value={savedItemsSearch}
                    onChange={(e) => setSavedItemsSearch(e.target.value)}
                    className="pl-8 h-8 text-xs w-full"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {savedItemsTab === 'RM' && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>UOM</TableHead>
                        <TableHead>Grade Code</TableHead>
                        <TableHead>Colour</TableHead>
                        <TableHead>Bin Location</TableHead>
                        <TableHead>Min Stock</TableHead>
                        <TableHead>Max Stock</TableHead>
                        <TableHead>Price (₹)</TableHead>
                        <TableHead>Expire Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(items)
                        .filter(([_, item]) => item.itemType === 'RM')
                        .filter(([_, item]) => {
                          if (savedItemsGradeFilter && item.gradeCode !== savedItemsGradeFilter) return false;
                          if (!savedItemsSearch.trim()) return true;
                          const q = savedItemsSearch.toLowerCase();
                          return (
                            item.rmCode?.toLowerCase().includes(q) ||
                            item.rmDescription?.toLowerCase().includes(q) ||
                            item.uom?.toLowerCase().includes(q) ||
                            item.gradeCode?.toLowerCase().includes(q) ||
                            item.colour?.toLowerCase().includes(q) ||
                            item.binLocation?.toLowerCase().includes(q) ||
                            item.expireDate?.toLowerCase().includes(q)
                          );
                        })
                        .sort((a, b) => {
                          const numA = parseInt(a[0].replace('ITEM', ''), 10) || 0;
                          const numB = parseInt(b[0].replace('ITEM', ''), 10) || 0;
                          return numB - numA;
                        })
                        .map(([id, item]) => (
                          <TableRow key={id}>
                            <TableCell className="font-medium text-blue-700">{item.rmCode}</TableCell>
                            <TableCell>{item.rmDescription}</TableCell>
                            <TableCell>{item.uom}</TableCell>
                            <TableCell>{item.gradeCode}</TableCell>
                            <TableCell>{item.colour || '—'}</TableCell>
                            <TableCell>{item.binLocation || '—'}</TableCell>
                            <TableCell>{item.minimumStock || '—'}</TableCell>
                            <TableCell>{item.maximumStock || '—'}</TableCell>
                            <TableCell>₹{item.rmPrice ? Number(item.rmPrice).toFixed(2) : '—'}</TableCell>
                            <TableCell>{item.expireDate || '—'}</TableCell>
                          </TableRow>
                        ))}
                      {Object.entries(items).filter(([_, item]) => item.itemType === 'RM').length === 0 && (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground py-6">
                            No Raw Material items added yet
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {savedItemsTab === 'SF' && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>UOM</TableHead>
                        <TableHead>Grade Code</TableHead>
                        <TableHead>Colour</TableHead>
                        <TableHead>Bin Location</TableHead>
                        <TableHead>Min Stock</TableHead>
                        <TableHead>Max Stock</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(items)
                        .filter(([_, item]) => item.itemType === 'SF')
                        .filter(([_, item]) => {
                          if (savedItemsGradeFilter && item.gradeCode !== savedItemsGradeFilter) return false;
                          if (!savedItemsSearch.trim()) return true;
                          const q = savedItemsSearch.toLowerCase();
                          return (
                            item.sfCode?.toLowerCase().includes(q) ||
                            item.sfDescription?.toLowerCase().includes(q) ||
                            item.uom?.toLowerCase().includes(q) ||
                            item.gradeCode?.toLowerCase().includes(q) ||
                            item.colour?.toLowerCase().includes(q) ||
                            item.binLocation?.toLowerCase().includes(q)
                          );
                        })
                        .sort((a, b) => {
                          const numA = parseInt(a[0].replace('ITEM', ''), 10) || 0;
                          const numB = parseInt(b[0].replace('ITEM', ''), 10) || 0;
                          return numB - numA;
                        })
                        .map(([id, item]) => (
                          <TableRow key={id}>
                            <TableCell className="font-medium text-purple-700">{item.sfCode}</TableCell>
                            <TableCell>{item.sfDescription}</TableCell>
                            <TableCell>{item.uom}</TableCell>
                            <TableCell>{item.gradeCode}</TableCell>
                            <TableCell>{item.colour || '—'}</TableCell>
                            <TableCell>{item.binLocation || '—'}</TableCell>
                            <TableCell>{item.minimumStock || '—'}</TableCell>
                            <TableCell>{item.maximumStock || '—'}</TableCell>
                          </TableRow>
                        ))}
                      {Object.entries(items).filter(([_, item]) => item.itemType === 'SF').length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                            No Semi-Finished items added yet
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {savedItemsTab === 'FG' && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>UOM</TableHead>
                        <TableHead>Grade Code</TableHead>
                        <TableHead>Item Group</TableHead>
                        <TableHead>Finish Size (L×W×H)</TableHead>
                        <TableHead>Rough Size (L×W×H)</TableHead>
                        <TableHead>Weight</TableHead>
                        <TableHead>Drawing No</TableHead>
                        <TableHead>Revision No</TableHead>
                        <TableHead>Price (₹)</TableHead>
                        <TableHead>Document</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(items)
                        .filter(([_, item]) => item.itemType === 'FG')
                        .filter(([_, item]) => {
                          if (savedItemsGradeFilter && item.gradeCode !== savedItemsGradeFilter) return false;
                          if (!savedItemsSearch.trim()) return true;
                          const q = savedItemsSearch.toLowerCase();
                          return (
                            item.fgItemCode?.toLowerCase().includes(q) ||
                            item.fgDescription?.toLowerCase().includes(q) ||
                            item.uom?.toLowerCase().includes(q) ||
                            item.gradeCode?.toLowerCase().includes(q) ||
                            item.category?.toLowerCase().includes(q) ||
                            item.drawingNo?.toLowerCase().includes(q) ||
                            item.revisionNo?.toLowerCase().includes(q)
                          );
                        })
                        .sort((a, b) => {
                          const numA = parseInt(a[0].replace('ITEM', ''), 10) || 0;
                          const numB = parseInt(b[0].replace('ITEM', ''), 10) || 0;
                          return numB - numA;
                        })
                        .map(([id, item]) => (
                          <TableRow key={id}>
                            <TableCell className="font-medium text-green-700">{item.fgItemCode}</TableCell>
                            <TableCell>{item.fgDescription}</TableCell>
                            <TableCell>{item.uom}</TableCell>
                            <TableCell>{item.gradeCode}</TableCell>
                            <TableCell>{item.category || '—'}</TableCell>
                            <TableCell>
                              {item.finishSizeL || '—'} × {item.finishSizeW || '—'} × {item.finishSizeH || '—'}
                            </TableCell>
                            <TableCell>
                              {item.roughSizeL || '—'} × {item.roughSizeW || '—'} × {item.roughSizeH || '—'}
                            </TableCell>
                            <TableCell>{item.weight || '—'}</TableCell>
                            <TableCell>{item.drawingNo || '—'}</TableCell>
                            <TableCell>{item.revisionNo || '—'}</TableCell>
                            <TableCell>₹{item.fgPrice ? Number(item.fgPrice).toFixed(2) : '—'}</TableCell>
                            <TableCell>
                              {item.uploadDocument ? (
                                <a
                                  href={item.uploadDocument}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary underline text-xs font-semibold"
                                >
                                  View
                                </a>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      {Object.entries(items).filter(([_, item]) => item.itemType === 'FG').length === 0 && (
                        <TableRow>
                          <TableCell colSpan={12} className="text-center text-muted-foreground py-6">
                            No Finished Goods items added yet
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}