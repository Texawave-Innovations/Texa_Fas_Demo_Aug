// modules/sales/CreateQuotation.tsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import QuotationPrintTemplate from '@/components/QuotationPrintTemplate';
import {
  Plus, Trash2, Download, ArrowLeft, Ruler,
  UserPlus, Edit, Copy, Check, Globe, Building2,
  Search, X, ChevronDown, Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Customer } from '@/types';
import {
  createRecord, getAllRecords, getRecordById, updateRecord,
} from '@/services/firebase';
import { peekNextNumber } from '@/services/runningNumberService';
import { generateNextNumber } from '@/services/runningNumberService';
import { formatAddress } from '@/utils/addressUtils';
import html2pdf from 'html2pdf.js';
import { nanoid } from 'nanoid';

// ─── Constants ───────────────────────────────────────────────────────────────

const EXCHANGE_RATES: Record<string, number> = {
  INR: 1, USD: 85.50, EUR: 92.00, GBP: 108.00, AED: 23.30,
};

const indianStates = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu and Kashmir', 'Ladakh',
];

const currencies = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
];

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Address {
  id: string;
  type: 'billing' | 'shipping';
  label: string;
  street: string;
  area?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault?: boolean;
}

interface Branch {
  id: string;
  branchName: string;
  branchCode: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isHeadOffice?: boolean;
}

interface LineItem {
  sNo: number;
  productCode: string;
  sku?: string | null;
  productDescription: string;
  hsnCode: string;
  uom: string;
  qty: number;
  unitRate: number;
  amount: number;
  discount: number;
  netAmount: number;
  size?: string;
}

interface CustomerData {
  id?: string;
  customerCode: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  currency: string;
  gst?: string;
  pan?: string;
  cin?: string;
  addresses: Address[];
  branches?: Branch[];
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  bankBranch?: string;
}

interface ProductItem {
  productCode: string;
  category: string;
  group: string;
  type: string;
  hsn: string;
  unit: string;
  unitPrice: number;
  stockQty: number;
  size?: {
    height?: number; heightUnit?: string;
    width?: number; widthUnit?: string;
    length?: number; lengthUnit?: string;
    weight?: number; weightUnit?: string;
  };
}

interface ProductGroup {
  id: string;
  name: string;
  items: ProductItem[];
  createdAt: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const initialAddressForm = {
  type: 'billing' as const,
  label: 'Head Office',
  street: '', area: '', city: '',
  state: 'Tamil Nadu', pincode: '', country: 'India',
  isDefault: true,
};

const fmt = (num: number) => Number(num || 0).toFixed(2);

const isTamilNaduGST = (gst: string) =>
  typeof gst === 'string' && gst.trim().toUpperCase().startsWith('33');

// ─── CustomerCombobox ─────────────────────────────────────────────────────────

interface CustomerComboboxProps {
  customers: Customer[];
  selectedCustomer: Customer | null;
  onSelect: (id: string) => void;
  onNewCustomer: () => void;
}

function CustomerCombobox({ customers, selectedCustomer, onSelect, onNewCustomer }: CustomerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = customers.filter(c =>
    c.companyName?.toLowerCase().includes(search.toLowerCase()) ||
    (c as any).customerCode?.toLowerCase().includes(search.toLowerCase()) ||
    (c as any).phone?.includes(search)
  );

  return (
    <div ref={ref} className="relative">
      <div
        className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer bg-white hover:border-blue-400 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className={`flex-1 text-sm truncate ${!selectedCustomer ? 'text-muted-foreground' : ''}`}>
          {selectedCustomer
            ? `${selectedCustomer.companyName} (${(selectedCustomer as any).customerCode}) — ${(selectedCustomer as any).currency || 'INR'}`
            : 'Select customer...'}
        </span>
        {selectedCustomer && (
          <X className="h-4 w-4 text-muted-foreground hover:text-red-500"
            onClick={(e) => { e.stopPropagation(); onSelect(''); setSearch(''); setOpen(false); }} />
        )}
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search by name, code, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground text-center">No customers found</div>
            ) : (
              filtered.map(c => (
                <div
                  key={c.id}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-blue-50 text-sm transition-colors ${selectedCustomer?.id === c.id ? 'bg-blue-50 font-semibold' : ''}`}
                  onClick={() => { onSelect(c.id!); setOpen(false); setSearch(''); }}
                >
                  <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{c.companyName}</div>
                    <div className="text-xs text-muted-foreground">
                      {(c as any).customerCode} · {(c as any).currency || 'INR'} · {(c as any).phone}
                    </div>
                  </div>
                  {selectedCustomer?.id === c.id && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
                </div>
              ))
            )}
          </div>
          <div className="p-2 border-t">
            <Button size="sm" variant="ghost" className="w-full justify-start text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              onClick={() => { setOpen(false); onNewCustomer(); }}>
              <UserPlus className="h-4 w-4 mr-2" /> Add New Customer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ProductCombobox ──────────────────────────────────────────────────────────

interface ProductComboboxProps {
  products: Array<ProductItem & { parentName: string; parentId: string }>;
  value: string;
  onChange: (value: string) => void;
  currencySymbol: string;
}

function ProductCombobox({ products, value, onChange, currencySymbol }: ProductComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = products.find(p => p.productCode === value);

  const filtered = products.filter(p =>
    p.productCode.toLowerCase().includes(search.toLowerCase()) ||
    p.parentName.toLowerCase().includes(search.toLowerCase()) ||
    p.category?.toLowerCase().includes(search.toLowerCase()) ||
    p.group?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} className="relative">
      <div
        className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer bg-white hover:border-blue-400 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className={`flex-1 text-sm truncate ${!selected ? 'text-muted-foreground' : ''}`}>
          {selected
            ? `${selected.parentName} — ${selected.productCode}`
            : 'Select product...'}
        </span>
        {selected && (
          <X
            className="h-4 w-4 text-muted-foreground hover:text-red-500 shrink-0"
            onClick={(e) => { e.stopPropagation(); onChange(''); setSearch(''); setOpen(false); }}
          />
        )}
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search by code, name, category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground text-center">No products found</div>
            ) : (
              filtered.map((p, idx) => (
                <div
                  key={`${p.parentId}-${p.productCode}-${idx}`}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-blue-50 text-sm transition-colors ${value === p.productCode ? 'bg-blue-50 font-semibold' : ''}`}
                  onClick={() => { onChange(p.productCode); setOpen(false); setSearch(''); }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{p.parentName}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.productCode} · {p.category} {p.group} · {currencySymbol}{fmt(p.unitPrice)} · Stock: {p.stockQty}
                    </div>
                  </div>
                  {value === p.productCode && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CreateQuotation() {
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  const isEditMode = !!id;
  const isManualMode = searchParams.get('mode') === 'manual';

  // ── State ──
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<ProductGroup[]>([]);
  const [flattenedProducts, setFlattenedProducts] = useState<
    Array<ProductItem & { parentName: string; parentId: string }>
  >([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedBillingAddress, setSelectedBillingAddress] = useState<Address | null>(null);
  const [selectedShippingAddress, setSelectedShippingAddress] = useState<Address | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeGST, setIncludeGST] = useState(true);
  const [isWalkInMode, setIsWalkInMode] = useState(false);
  const [walkInCustomerName, setWalkInCustomerName] = useState('');
  const [walkInTaxType, setWalkInTaxType] = useState<'intra' | 'inter'>('intra');
  const [transportChargeType, setTransportChargeType] = useState<'fixed' | 'percent'>('fixed');
  const [transportChargeFixed, setTransportChargeFixed] = useState<number | string>('');
  const [transportChargePercent, setTransportChargePercent] = useState<number | string>('');
  const [cgstPercent, setCgstPercent] = useState<number | string>(9);
  const [sgstPercent, setSgstPercent] = useState<number | string>(9);
  const [igstPercent, setIgstPercent] = useState<number | string>(18);
  const [dispatchModes, setDispatchModes] = useState<string[]>([]);
  const [deliveryTerms, setDeliveryTerms] = useState<string[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<string[]>([]);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [customerCode, setCustomerCode] = useState('CUST-0000');
  const [copied, setCopied] = useState(false);
  const [newCustomer, setNewCustomer] = useState<Omit<CustomerData, 'id'>>({
    customerCode: '', companyName: '', contactPerson: '',
    email: '', phone: '', currency: 'INR',
    gst: '', pan: '', cin: '', addresses: [], branches: [],
  });
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [addressForm, setAddressForm] = useState(initialAddressForm);
  const [peekedQuoteNumber, setPeekedQuoteNumber] = useState('');
  const [formData, setFormData] = useState({
    quoteNumber: '',   // set by useEffect below
    quoteDate: new Date().toISOString().split('T')[0],
    validity: '30 Days',
    paymentTerms: '', modeOfDispatch: '', deliveryTerm: '',
    remarks: '', comments: '', yourRef: '', ourRef: '', verNo: '', verDate: '',
  });
  // Auto-generate quote number from master running-number config
  useEffect(() => {
    if (!isEditMode && !formData.quoteNumber) {
      const fallback = `SQFY25-${String(Date.now()).slice(-5)}`;
      peekNextNumber('quoteNo', fallback).then((num) => {
        setPeekedQuoteNumber(num);
        setFormData((prev) => ({ ...prev, quoteNumber: num }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode]);

  // ── Derived ──
  const currentCurrency = isWalkInMode ? 'INR' : ((selectedCustomer as any)?.currency || 'INR');
  const currencySymbol = currencies.find(c => c.code === currentCurrency)?.symbol || '₹';
  const customerGST: string = isWalkInMode ? '' : ((selectedCustomer as any)?.gst || '');
  const isTNCustomer = isTamilNaduGST(customerGST);
  const appliedIsTNCustomer = isWalkInMode ? walkInTaxType === 'intra' : isTNCustomer;
  const customerAddresses: Address[] = selectedCustomer
    ? ((selectedCustomer as any).addresses as Address[]) || []
    : [];
  const customerBranches: Branch[] = selectedCustomer
    ? ((selectedCustomer as any).branches as Branch[]) || []
    : [];

  // ── Helpers ──
  const digitsOnly = (val: string) => val.replace(/\D/g, '');
  const limit = (val: string, max: number) => val.slice(0, max);
  const toUpper = (val: string) => val.toUpperCase();
  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const convertPriceToCurrency = (inrPrice: number): number => {
    if (currentCurrency === 'INR') return inrPrice;
    const rate = EXCHANGE_RATES[currentCurrency];
    return Number((inrPrice / rate).toFixed(2));
  };

  // ── Effects ──
  useEffect(() => { loadInitialData(); }, []);
  useEffect(() => {
    if (id && customers.length > 0) loadQuotationForEdit();
  }, [id, customers]);

  // ── Data Loading ──
  const loadInitialData = async () => {
    try {
      const [cust, prod, salesMaster] = await Promise.all([
        getAllRecords('sales/customers'),
        getAllRecords('sales/products'),
        getRecordById('masters', 'sales'),
      ]);
      const activeCustomers = (cust as Customer[]).filter((c) => (c as any).status !== 'inactive');
      setCustomers(activeCustomers);
      const activeProducts = (prod as ProductGroup[]).filter((pg) => (pg as any).status !== 'inactive');
      setProducts(activeProducts);

      const flattened: Array<ProductItem & { parentName: string; parentId: string }> = [];
      activeProducts.forEach(pg => {
        if (pg.items && Array.isArray(pg.items)) {
          pg.items.forEach(item => flattened.push({ ...item, parentName: pg.name, parentId: pg.id }));
        }
      });
      setFlattenedProducts(flattened);

      const masters = salesMaster as any;

      // Master items may be stored as { value, status } objects (MasterItem format).
      // Extract only the string value from active items to keep state as string[].
      const activeStrings = (arr: any[]): string[] => {
        if (!arr || !Array.isArray(arr)) return [];
        return arr
          .filter((item: any) =>
            typeof item === 'string' || item?.status !== 'inactive'
          )
          .map((item: any) =>
            typeof item === 'string' ? item : (item?.value ?? String(item))
          )
          .filter((v: string) => v);
      };

      const rawDispatch  = Array.isArray(masters?.dispatchModes) ? masters.dispatchModes : [];
      const rawDelivery  = Array.isArray(masters?.deliveryTerms)  ? masters.deliveryTerms  : [];
      const rawPayment   = Array.isArray(masters?.paymentTerms)   ? masters.paymentTerms   : [];

      const dispatchStrings = activeStrings(rawDispatch);
      const deliveryStrings = activeStrings(rawDelivery);
      const paymentStrings  = activeStrings(rawPayment);

      setDispatchModes(dispatchStrings);
      setDeliveryTerms(deliveryStrings);
      setPaymentTerms(paymentStrings);

      if (dispatchStrings.length > 0)
        setFormData(p => ({ ...p, modeOfDispatch: dispatchStrings[0] }));
      if (deliveryStrings.length > 0)
        setFormData(p => ({ ...p, deliveryTerm: deliveryStrings[0] }));
      if (paymentStrings.length > 0)
        setFormData(p => ({ ...p, paymentTerms: paymentStrings[0] }));
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  };

  const loadQuotationForEdit = async () => {
    if (!id) return;
    try {
      const q = await getRecordById('sales/quotations', id) as any;
      if (!q) throw new Error('Not found');

      setIsWalkInMode(q.isWalkIn || false);
      setWalkInCustomerName(q.walkInCustomerName || '');
      setWalkInTaxType(q.walkInTaxType || 'intra');
      setIncludeGST(q.includeGST ?? true);
      setTransportChargeType(q.transportChargeType || 'percent');
      setTransportChargeFixed(q.transportCharge || '');
      setTransportChargePercent(q.transportChargePercent || '');
      setCgstPercent(q.cgstPercent ?? 9);
      setSgstPercent(q.sgstPercent ?? 9);
      setIgstPercent(q.igstPercent ?? 18);
      setFormData({
        quoteNumber: q.quoteNumber || formData.quoteNumber,
        quoteDate: q.quoteDate || formData.quoteDate,
        validity: q.validity || '30 Days',
        paymentTerms: q.paymentTerms || '',
        modeOfDispatch: q.modeOfDispatch || '',
        deliveryTerm: q.deliveryTerm || '',
        remarks: q.remarks || '', comments: q.comments || '',
        yourRef: q.yourRef || '', ourRef: q.ourRef || '',
        verNo: q.verNo || '', verDate: q.verDate || '',
      });

      if (!q.isWalkIn && q.customerId) {
        let customer = customers.find(c => c.id === q.customerId);
        if (!customer) {
          const fetched = await getRecordById('sales/customers', q.customerId);
          if (fetched) {
            customer = fetched as Customer;
            setCustomers(prev => [...prev, customer!]);
          }
        }
        setSelectedCustomer(customer || null);
        setSelectedBillingAddress(q.billingAddress || null);
        setSelectedShippingAddress(q.shippingAddress || null);
        if (q.selectedBranch) setSelectedBranch(q.selectedBranch);
      }

      setLineItems(
        (q.lineItems || []).map((item: any, i: number) => ({
          sNo: i + 1,
          productCode: item.productCode || item.sku || '',
          sku: item.sku || null,
          productDescription: item.productDescription || '',
          hsnCode: item.hsnCode || '',
          uom: item.uom || 'Nos',
          qty: Number(item.qty) || 1,
          unitRate: Number(item.unitRate) || 0,
          amount: Number(item.qty || 1) * Number(item.unitRate || 0),
          discount: Number(item.discount) || 0,
          netAmount: Number(item.netAmount) || 0,
          size: item.size || '',
        }))
      );
    } catch {
      toast.error('Failed to load quotation');
      navigate('/sales/quotations');
    }
  };

  // ── Customer Code Generation ──
  const generateCustomerCode = async () => {
    try {
      const all = await getAllRecords('sales/customers');
      const codes = (all as any[])
        .map(c => c.customerCode)
        .filter(c => typeof c === 'string' && c.startsWith('CUST-'))
        .map(c => parseInt(c.split('-')[1] || '0', 10));
      const next = (Math.max(...codes, 0) + 1).toString().padStart(4, '0');
      const code = `CUST-${next}`;
      setCustomerCode(code);
      setNewCustomer(prev => ({ ...prev, customerCode: code }));
    } catch {
      const code = `CUST-${Date.now().toString().slice(-4)}`;
      setCustomerCode(code);
      setNewCustomer(prev => ({ ...prev, customerCode: code }));
    }
  };

  const openNewCustomerDialog = () => {
    generateCustomerCode();
    setNewCustomer({
      customerCode: '', companyName: '', contactPerson: '',
      email: '', phone: '', currency: 'INR',
      gst: '', pan: '', cin: '', addresses: [], branches: [],
    });
    setCustomerDialogOpen(true);
  };

  // ── Address Dialogs ──
  const openAddressDialog = (addr?: Address, type?: 'billing' | 'shipping') => {
    if (addr) { setEditingAddress(addr); setAddressForm({ ...addr }); }
    else { setEditingAddress(null); setAddressForm({ ...initialAddressForm, type: type || 'billing' }); }
    setAddressDialogOpen(true);
  };

  const saveAddress = () => {
    if (!addressForm.street.trim()) return toast.error('Street is required');
    if (!addressForm.city.trim()) return toast.error('City is required');
    if (addressForm.pincode.length !== 6) return toast.error('Pincode must be 6 digits');

    let updated = [...(newCustomer.addresses || [])];
    const currentId = editingAddress?.id || nanoid();

    if (editingAddress) {
      updated = updated.map(a => a.id === editingAddress.id ? { ...addressForm, id: a.id } : a);
    } else {
      updated.push({ ...addressForm, id: currentId });
    }
    if (addressForm.isDefault) {
      updated = updated.map(a => ({
        ...a,
        isDefault: a.type === addressForm.type ? a.id === currentId : a.isDefault,
      }));
    }
    setNewCustomer(prev => ({ ...prev, addresses: updated }));
    setAddressDialogOpen(false);
    setAddressForm(initialAddressForm);
    toast.success('Address saved');
  };

  const deleteAddress = (addrId: string) => {
    const addr = newCustomer.addresses.find(a => a.id === addrId);
    if (!addr) return;
    if (newCustomer.addresses.filter(a => a.type === addr.type).length === 1)
      return toast.error(`At least one ${addr.type} address required`);
    setNewCustomer(prev => ({ ...prev, addresses: prev.addresses.filter(a => a.id !== addrId) }));
  };

  const saveNewCustomer = async () => {
    if (!newCustomer.companyName.trim()) return toast.error('Company Name required');
    if (!newCustomer.contactPerson.trim()) return toast.error('Contact Person required');
    if (!newCustomer.email.trim() || !validateEmail(newCustomer.email)) return toast.error('Valid email required');
    if (newCustomer.phone.length !== 10) return toast.error('Phone must be 10 digits');
    if ((newCustomer.addresses || []).filter(a => a.type === 'billing').length === 0)
      return toast.error('Add at least one Billing Address');
    if ((newCustomer.addresses || []).filter(a => a.type === 'shipping').length === 0)
      return toast.error('Add at least one Shipping Address');

    try {
      const docRef = await createRecord('sales/customers', {
        ...newCustomer, createdAt: Date.now(), updatedAt: Date.now(),
      });
      const created = { ...newCustomer, id: docRef.id };
      setCustomers(prev => [...prev, created as Customer]);
      setSelectedCustomer(created as Customer);
      const defaultBilling =
        created.addresses.find(a => a.type === 'billing' && a.isDefault) ||
        created.addresses.find(a => a.type === 'billing');
      const defaultShipping =
        created.addresses.find(a => a.type === 'shipping' && a.isDefault) ||
        created.addresses.find(a => a.type === 'shipping');
      setSelectedBillingAddress(defaultBilling || null);
      setSelectedShippingAddress(defaultShipping || null);
      setIsWalkInMode(false);
      toast.success('Customer created & selected');
      setCustomerDialogOpen(false);
    } catch { toast.error('Failed to create customer'); }
  };

  // ── Customer Change ──
  const handleCustomerChange = (custId: string) => {
    if (!custId) {
      setSelectedCustomer(null);
      setSelectedBranch(null);
      setSelectedBillingAddress(null);
      setSelectedShippingAddress(null);
      return;
    }
    const cust = customers.find(c => c.id === custId);
    setSelectedCustomer(cust || null);
    setSelectedBranch(null);
    if (cust) {
      const addresses = (cust as any).addresses as Address[] || [];
      const billing = addresses.find(a => a.type === 'billing' && a.isDefault) || addresses.find(a => a.type === 'billing');
      const shipping = addresses.find(a => a.type === 'shipping' && a.isDefault) || addresses.find(a => a.type === 'shipping');
      setSelectedBillingAddress(billing || null);
      setSelectedShippingAddress(shipping || null);
      const branches = (cust as any).branches as Branch[] || [];
      const headOffice = branches.find((b: Branch) => b.isHeadOffice);
      if (headOffice) setSelectedBranch(headOffice);

      // Sync GST rates from customer profile
      const custCgst = (cust as any).cgst;
      const custSgst = (cust as any).sgst;
      const custIgst = (cust as any).igst;
      if (custCgst !== undefined && custCgst !== '') setCgstPercent(Number(custCgst));
      if (custSgst !== undefined && custSgst !== '') setSgstPercent(Number(custSgst));
      if (custIgst !== undefined && custIgst !== '') setIgstPercent(Number(custIgst));

      // In manual mode: never auto-recalculate rates when customer changes.
      // In standard mode: re-convert existing line item rates to the new currency.
      if (!isManualMode) {
        setLineItems(prev => prev.map(item => {
          const prod = flattenedProducts.find(p => p.productCode === item.productCode);
          if (prod && prod.unitPrice) {
            const convertedRate = convertPriceToCurrency(prod.unitPrice);
            const amount = Number(item.qty || 0) * convertedRate;
            const netAmount = amount * (1 - Number(item.discount || 0) / 100);
            return { ...item, unitRate: convertedRate, amount, netAmount };
          }
          return item;
        }));
      }
    }
  };

  // ── Line Items ──
  const addLineItem = () => {
    setLineItems(prev => [...prev, {
      sNo: prev.length + 1, productCode: '', sku: null,
      productDescription: '', hsnCode: '', uom: 'Nos',
      qty: 1, unitRate: 0, amount: 0, discount: 0, netAmount: 0, size: '',
    }]);
  };

  const formatSize = (size: any) => {
    if (!size) return '';
    const parts: string[] = [];
    if (size.height) parts.push(`${size.height}${size.heightUnit || 'mm'}`);
    if (size.width) parts.push(`${size.width}${size.widthUnit || 'mm'}`);
    if (size.length) parts.push(`${size.length}${size.lengthUnit || 'mm'}`);
    if (size.weight) parts.push(`${size.weight}${size.weightUnit || 'g'}`);
    return parts.join(' × ');
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      // ─── productCode change: populate descriptive fields ───────────────────
      if (field === 'productCode') {
        const prod = flattenedProducts.find(p => p.productCode === value);
        if (prod) {
          updated[index].productDescription = `${prod.parentName} - ${prod.category} ${prod.group}`;
          updated[index].uom = prod.unit || 'Nos';
          updated[index].hsnCode = prod.hsn || '';
          updated[index].size = formatSize(prod.size);
          updated[index].sku = null;

          // In manual mode: NEVER overwrite unitRate from the product master.
          // The user controls Rate independently. Only populate rate if the
          // current rate is 0 (i.e. a brand-new empty row) in standard mode.
          if (!isManualMode) {
            updated[index].unitRate = convertPriceToCurrency(prod.unitPrice || 0);
          }
          // Manual mode: leave unitRate exactly as the user has it (or 0 for new rows).
          // No automatic fetch, no sync, no overwrite.
        } else {
          // Product cleared
          updated[index].sku = null;
          updated[index].size = '';
          // In manual mode keep whatever rate the user typed; in standard mode reset.
          if (!isManualMode) {
            updated[index].unitRate = 0;
          }
        }
      }

      // ─── Recalculate amount & netAmount (Standard Mode only) ───────────────
      // In manual mode, these are decoupled and can be edited independently.
      if (!isManualMode) {
        const item = updated[index];
        item.amount = Number(item.qty || 1) * Number(item.unitRate || 0);
        item.netAmount = item.amount * (1 - Number(item.discount || 0) / 100);
      }

      return updated;
    });
  };

  const removeLineItem = (index: number) => {
    setLineItems(prev =>
      prev.filter((_, i) => i !== index).map((it, idx) => ({ ...it, sNo: idx + 1 }))
    );
  };

  // ── Totals ──
  const calculateTotals = () => {
    const subtotal = lineItems.reduce((sum, i) => sum + i.netAmount, 0);
    const cgst = includeGST && currentCurrency === 'INR' && appliedIsTNCustomer
      ? subtotal * (Number(cgstPercent || 0) / 100) : 0;
    const sgst = includeGST && currentCurrency === 'INR' && appliedIsTNCustomer
      ? subtotal * (Number(sgstPercent || 0) / 100) : 0;
    const igst = includeGST && currentCurrency === 'INR' && !appliedIsTNCustomer
      ? subtotal * (Number(igstPercent || 0) / 100) : 0;
    let transportCharge = 0;
    if (transportChargeType === 'fixed') {
      transportCharge = Number(transportChargeFixed || 0);
    } else {
      transportCharge = subtotal * (Number(transportChargePercent || 0) / 100);
    }
    const total = subtotal + cgst + sgst + igst + transportCharge;
    return { subtotal, cgst, sgst, igst, transportCharge, total };
  };

  const { subtotal, cgst, sgst, igst, transportCharge, total } = calculateTotals();

  // ── Quotation Data Object ──
  const quotationData = {
    ...formData,
    customerName: isWalkInMode
      ? walkInCustomerName || 'Walk-in Customer'
      : (selectedCustomer as any)?.companyName || '',
    customerGST: isWalkInMode ? '' : (selectedCustomer as any)?.gst || '',
    customerPAN: isWalkInMode ? '' : (selectedCustomer as any)?.pan || '',
    customerCIN: isWalkInMode ? '' : (selectedCustomer as any)?.cin || '',
    currency: currentCurrency,
    currencySymbol,
    billingAddress: selectedBillingAddress,
    shippingAddress: selectedShippingAddress,
    selectedBranch,
    lineItems,
    subtotal,
    cgstAmount: cgst,
    sgstAmount: sgst,
    igstAmount: igst,
    transportCharge,
    transportChargeType,
    cgstPercent: Number(cgstPercent || 0),
    sgstPercent: Number(sgstPercent || 0),
    igstPercent: Number(igstPercent || 0),
    transportChargePercent: Number(transportChargePercent || 0),
    grandTotal: total,
    includeGST: includeGST && currentCurrency === 'INR',
    isTNCustomer: appliedIsTNCustomer,
    isWalkIn: isWalkInMode,
    walkInTaxType,
    customerId: isWalkInMode ? null : selectedCustomer?.id,
  };

  // ── PDF Download ──
  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    const opt = {
      margin: 0,
      filename: `${quotationData.quoteNumber}.pdf`,
      image: { type: 'jpeg', quality: 1 },
      html2canvas: {
        scale: 3, useCORS: true, letterRendering: true,
        ignoreElements: (el: any) => el.classList?.contains('no-print'),
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
    };
    html2pdf().set(opt).from(printRef.current).save();
  };

  // ── Save ──
  const handleSave = async () => {
    if (lineItems.length === 0 || lineItems.some(i => !i.productCode)) {
      toast.error('Complete all line items'); return;
    }
    if (!isWalkInMode && !selectedCustomer) {
      toast.error('Select a customer or enable Walk-in'); return;
    }
    // Only increment sequence on save if not edit mode
    let finalQuoteNumber = formData.quoteNumber;
    if (!isEditMode && formData.quoteNumber === peekedQuoteNumber) {
      finalQuoteNumber = await generateNextNumber('quoteNo', peekedQuoteNumber);
    }
    const saveData: any = {
      ...quotationData, quoteNumber: finalQuoteNumber,
      lineItems: lineItems.map(({ sNo, ...rest }) => rest),
      billingAddress: selectedBillingAddress,
      shippingAddress: selectedShippingAddress,
      selectedBranch,
      transportChargeType,
      transportCharge,
      transportChargePercent: transportChargeType === 'percent' ? Number(transportChargePercent || 0) : 0,
      cgstPercent, sgstPercent, igstPercent,
      walkInTaxType,
      updatedAt: Date.now(),
      ...(!isEditMode && { createdAt: Date.now(), status: 'Draft' }),
    };
    try {
      if (isEditMode) {
        await updateRecord('sales/quotations', id!, saveData);

        // ─── SYNC LINKED ORDERS ───
        try {
          const allOrders = await getAllRecords('sales/orderAcknowledgements') as any[];
          const linkedOrders = allOrders.filter(o => o.quotationId === id);

          if (linkedOrders.length > 0) {
            const syncPromises = linkedOrders.map(order =>
              updateRecord('sales/orderAcknowledgements', order.id, {
                customerName: saveData.customerName,
                customerGST: saveData.customerGST,
                customerPAN: saveData.customerPAN,
                customerAddress: formatAddress(selectedBillingAddress) || '',
                // Map lineItems back to what Order expects (Orders usually keep items as-is from quotation)
                items: lineItems.map((item, idx) => ({
                  ...item,
                  sNo: idx + 1,
                  // Ensure consistent field names if Order module expects specific ones
                  productId: item.productCode,
                })),
                subtotal: saveData.subtotal,
                cgstAmount: saveData.cgstAmount,
                sgstAmount: saveData.sgstAmount,
                igstAmount: saveData.igstAmount,
                cgstPercent: Number(saveData.cgstPercent || 0),
                sgstPercent: Number(saveData.sgstPercent || 0),
                igstPercent: Number(saveData.igstPercent || 0),
                transportCharge: saveData.transportCharge,
                transportChargePercent: saveData.transportChargePercent,
                transportChargeType: saveData.transportChargeType,
                grandTotal: saveData.grandTotal,
                currency: saveData.currency,
                updatedAt: Date.now(),
              })
            );
            await Promise.all(syncPromises);
            toast.success(`Quotation and ${linkedOrders.length} linked order(s) updated!`);
          } else {
            toast.success('Quotation updated!');
          }
        } catch (syncErr) {
          console.error('Sync failed:', syncErr);
          toast.warning('Quotation updated, but failed to sync linked orders.');
        }
      } else {
        await createRecord('sales/quotations', saveData);
        toast.success('Quotation created!');
      }
      navigate('/sales/quotations');
    } catch (err: any) { toast.error(err?.message || 'Failed to save'); }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading quotation data...</p>
      </div>
    </div>
  );

  // ─── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      <div className="max-w-7xl mx-auto px-4">

        {/* ══ PAGE HEADER ══ */}
        <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-blue-900">
              {isEditMode ? 'Edit Quotation' : 'Create Quotation'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isEditMode ? `Editing: ${formData.quoteNumber}` : 'Fill in the details to create a new sales quotation'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/sales/quotations')}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
            <Button variant="secondary" onClick={handleDownloadPDF}>
              <Download className="h-4 w-4 mr-2" /> Download PDF
            </Button>
            <Button onClick={handleSave} className="bg-blue-700 hover:bg-blue-800">
              {isEditMode ? 'Update' : 'Save'} Quotation
            </Button>
          </div>
        </div>

        <div className="space-y-6 mb-8">

          {/* ══ WALK-IN MODE ══ */}
          <Card className="border-2 border-dashed border-blue-400 bg-blue-50">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="walkin"
                  checked={isWalkInMode}
                  onCheckedChange={(c) => {
                    setIsWalkInMode(c as boolean);
                    if (c) {
                      setSelectedCustomer(null); setSelectedBranch(null);
                      setSelectedBillingAddress(null); setSelectedShippingAddress(null);
                    }
                  }}
                />
                <Label htmlFor="walkin" className="cursor-pointer text-base font-semibold text-blue-900">
                  Walk-in Cash Sale (No Customer Details)
                </Label>
              </div>
              {isWalkInMode && (
                <div className="mt-4 max-w-sm">
                  <Label>Customer Name</Label>
                  <Input
                    value={walkInCustomerName}
                    onChange={(e) => setWalkInCustomerName(e.target.value)}
                    placeholder="Enter customer name"
                    className="mt-1"
                  />
                  <div className="mt-4">
                    <Label className="mb-2 block">Tax Type Assessment (Walk-in)</Label>
                    <div className="flex items-center gap-6 bg-white p-3 rounded-lg border">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="radio"
                          name="walkInTax"
                          checked={walkInTaxType === 'intra'}
                          onChange={() => setWalkInTaxType('intra')}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className={`text-sm font-medium ${walkInTaxType === 'intra' ? 'text-blue-700' : 'text-gray-600'}`}>
                          Intra-State (TN) <span className="text-[10px] opacity-70 ml-1">CGST+SGST</span>
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="radio"
                          name="walkInTax"
                          checked={walkInTaxType === 'inter'}
                          onChange={() => setWalkInTaxType('inter')}
                          className="w-4 h-4 text-orange-600 focus:ring-orange-500 cursor-pointer"
                        />
                        <span className={`text-sm font-medium ${walkInTaxType === 'inter' ? 'text-orange-700' : 'text-gray-600'}`}>
                          Inter-State <span className="text-[10px] opacity-70 ml-1">IGST</span>
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ══ CUSTOMER SELECTION ══ */}
          {!isWalkInMode && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                  Customer Details
                  <Button size="sm" onClick={openNewCustomerDialog} variant="outline">
                    <UserPlus className="h-4 w-4 mr-2" /> New Customer
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Searchable Combobox */}
                <div>
                  <Label className="mb-1.5 block">Select Customer</Label>
                  <CustomerCombobox
                    customers={customers}
                    selectedCustomer={selectedCustomer}
                    onSelect={handleCustomerChange}
                    onNewCustomer={openNewCustomerDialog}
                  />
                </div>

                {/* Customer Info (Locked in Manual Mode) */}
                {selectedCustomer && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Customer Code</Label>
                      <Input 
                        value={(selectedCustomer as any).customerCode || ''} 
                        readOnly
                        className="bg-gray-100"
                      />
                    </div>
                    <div>
                      <Label>GST Number</Label>
                      <Input 
                        value={customerGST} 
                        readOnly
                        className="bg-gray-100"
                      />
                    </div>
                  </div>
                )}

                {/* GST Type Badge */}
                {selectedCustomer && customerGST && (
                  <div className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium border ${isTNCustomer
                    ? 'bg-green-50 border-green-300 text-green-800'
                    : 'bg-orange-50 border-orange-300 text-orange-800'
                    }`}>
                    <span className="font-bold">Tax Type Assessment:</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${isTNCustomer ? 'bg-green-600' : 'bg-orange-600'
                      }`}>
                      {isTNCustomer ? 'Intra-State (TN) → CGST + SGST' : 'Inter-State (Outside TN) → IGST'}
                    </span>
                  </div>
                )}

                {/* Branch Selection */}
                {selectedCustomer && customerBranches.length > 0 && (
                  <div className="bg-orange-50 p-4 rounded-lg border-2 border-orange-200">
                    <Label className="flex items-center gap-2 mb-2">
                      <Building2 className="h-4 w-4 text-orange-600" /> Select Branch (Optional)
                    </Label>
                    <Select
                      value={selectedBranch?.id || ''}
                      onValueChange={(branchId) => {
                        if (branchId === 'no-branch') { setSelectedBranch(null); return; }
                        const branch = customerBranches.find(b => b.id === branchId);
                        setSelectedBranch(branch || null);
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no-branch">No Branch Selected</SelectItem>
                        {customerBranches.map(branch => (
                          <SelectItem key={branch.id} value={branch.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {branch.branchName} ({branch.branchCode})
                                {branch.isHeadOffice && (
                                  <span className="ml-2 text-xs bg-orange-600 text-white px-2 py-0.5 rounded">HEAD OFFICE</span>
                                )}
                              </span>
                              <span className="text-xs text-muted-foreground">{branch.city}, {branch.state}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedBranch && (
                      <div className="mt-3 p-3 bg-white rounded border text-sm">
                        <p className="font-semibold text-orange-700">{selectedBranch.branchName}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {selectedBranch.address}, {selectedBranch.city}, {selectedBranch.state} – {selectedBranch.pincode}
                        </p>
                        <p className="text-xs mt-1">
                          <strong>Contact:</strong> {selectedBranch.contactPerson} | {selectedBranch.phone}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Billing & Shipping */}
                {selectedCustomer && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Billing Address</Label>
                      <Select
                        value={selectedBillingAddress?.id || ''}
                        onValueChange={(v) => {
                          const addr = customerAddresses.find(a => a.id === v && a.type === 'billing');
                          setSelectedBillingAddress(addr || null);
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Select billing address" /></SelectTrigger>
                        <SelectContent>
                          {customerAddresses.filter(a => a.type === 'billing').map(addr => (
                            <SelectItem key={addr.id} value={addr.id}>{addr.label} — {addr.city}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Shipping Address</Label>
                      <Select
                        value={selectedShippingAddress?.id || ''}
                        onValueChange={(v) => {
                          const addr = customerAddresses.find(a => a.id === v && a.type === 'shipping');
                          setSelectedShippingAddress(addr || null);
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Select shipping address" /></SelectTrigger>
                        <SelectContent>
                          {customerAddresses.filter(a => a.type === 'shipping').map(addr => (
                            <SelectItem key={addr.id} value={addr.id}>{addr.label} — {addr.city}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ══ QUOTATION DETAILS ══ */}
          <Card>
            <CardHeader className="pb-3"><CardTitle>Quotation Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <Label>SQ Number</Label>
                <Input
                  value={formData.quoteNumber}
                  onChange={(e) => setFormData(p => ({ ...p, quoteNumber: e.target.value }))}
                  readOnly={isManualMode}
                  className={isManualMode ? 'bg-gray-100 font-semibold' : ''}
                />
              </div>
              <div>
                <Label>SQ Date</Label>
                <Input
                  type="date" value={formData.quoteDate}
                  onChange={(e) => setFormData(p => ({ ...p, quoteDate: e.target.value }))}
                />
              </div>
              <div>
                <Label>Quote Validity</Label>
                <Input
                  value={formData.validity}
                  onChange={(e) => setFormData(p => ({ ...p, validity: e.target.value }))}
                />
              </div>
              <div>
                <Label>Mode of Despatch</Label>
                <Select value={formData.modeOfDispatch} onValueChange={(v) => setFormData(p => ({ ...p, modeOfDispatch: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select dispatch mode" /></SelectTrigger>
                  <SelectContent>{dispatchModes.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Delivery Term</Label>
                <Select value={formData.deliveryTerm} onValueChange={(v) => setFormData(p => ({ ...p, deliveryTerm: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select delivery term" /></SelectTrigger>
                  <SelectContent>{deliveryTerms.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payment Terms</Label>
                <Select value={formData.paymentTerms} onValueChange={(v) => setFormData(p => ({ ...p, paymentTerms: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select payment terms" /></SelectTrigger>
                  <SelectContent>{paymentTerms.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Your Ref</Label>
                <Input value={formData.yourRef} onChange={(e) => setFormData(p => ({ ...p, yourRef: e.target.value }))} placeholder="Client Reference" />
              </div>
              <div>
                <Label>Our Ref</Label>
                <Input value={formData.ourRef} onChange={(e) => setFormData(p => ({ ...p, ourRef: e.target.value }))} placeholder="Internal Reference" />
              </div>
            </CardContent>
          </Card>

          {/* ══ TAX & CHARGES ══ */}
          <Card>
            <CardHeader className="pb-3"><CardTitle>Tax & Charges</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="gst"
                  checked={includeGST && currentCurrency === 'INR'}
                  disabled={currentCurrency !== 'INR'}
                  onCheckedChange={(c) => setIncludeGST(c as boolean)}
                />
                <Label htmlFor="gst" className="cursor-pointer">
                  Include GST {currentCurrency !== 'INR' && <span className="text-muted-foreground">(Only for INR)</span>}
                </Label>
              </div>

              {includeGST && currentCurrency === 'INR' && !isWalkInMode && (
                <>
                  {/* TN Customer: CGST + SGST */}
                  {isTNCustomer && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>CGST %</Label>
                        <Input
                          type="number" value={cgstPercent} min={0} step={0.01}
                          onChange={(e) => setCgstPercent(e.target.value ? Number(e.target.value) : '')}
                        />
                        <p className="text-xs text-muted-foreground mt-1">Amount: {currencySymbol}{fmt(cgst)}</p>
                      </div>
                      <div>
                        <Label>SGST %</Label>
                        <Input
                          type="number" value={sgstPercent} min={0} step={0.01}
                          onChange={(e) => setSgstPercent(e.target.value ? Number(e.target.value) : '')}
                        />
                        <p className="text-xs text-muted-foreground mt-1">Amount: {currencySymbol}{fmt(sgst)}</p>
                      </div>
                    </div>
                  )}
                  {/* Non-TN Customer: IGST */}
                  {!isTNCustomer && (
                    <div className="max-w-xs">
                      <Label>IGST %</Label>
                      <Input
                        type="number" value={igstPercent} min={0} step={0.01}
                        onChange={(e) => setIgstPercent(e.target.value ? Number(e.target.value) : '')}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Amount: {currencySymbol}{fmt(igst)}</p>
                    </div>
                  )}
                </>
              )}

              {/* Walk-in GST (Selectable Intra/Inter State) */}
              {includeGST && currentCurrency === 'INR' && isWalkInMode && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 border border-blue-200 p-3 rounded-lg bg-blue-50">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={walkInTaxType === 'intra'} onChange={() => setWalkInTaxType('intra')} className="w-4 h-4" />
                      <span className="text-sm font-medium">Intra-State (CGST + SGST)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={walkInTaxType === 'inter'} onChange={() => setWalkInTaxType('inter')} className="w-4 h-4" />
                      <span className="text-sm font-medium">Inter-State (IGST)</span>
                    </label>
                  </div>
                  {walkInTaxType === 'intra' ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>CGST %</Label>
                        <Input
                          type="number" value={cgstPercent} min={0} step={0.01}
                          onChange={(e) => setCgstPercent(e.target.value ? Number(e.target.value) : '')}
                        />
                        <p className="text-xs text-muted-foreground mt-1">Amount: {currencySymbol}{fmt(cgst)}</p>
                      </div>
                      <div>
                        <Label>SGST %</Label>
                        <Input
                          type="number" value={sgstPercent} min={0} step={0.01}
                          onChange={(e) => setSgstPercent(e.target.value ? Number(e.target.value) : '')}
                        />
                        <p className="text-xs text-muted-foreground mt-1">Amount: {currencySymbol}{fmt(sgst)}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-xs">
                      <Label>IGST %</Label>
                      <Input
                        type="number" value={igstPercent} min={0} step={0.01}
                        onChange={(e) => setIgstPercent(e.target.value ? Number(e.target.value) : '')}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Amount: {currencySymbol}{fmt(igst)}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="max-w-sm">
                <Label className="text-sm font-semibold">Transport Charge</Label>
                <div className="flex items-center gap-4 mt-1 mb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={transportChargeType === 'fixed'}
                      onChange={() => setTransportChargeType('fixed')}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium">Fixed Amount</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={transportChargeType === 'percent'}
                      onChange={() => setTransportChargeType('percent')}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium">Percentage (%)</span>
                  </label>
                </div>
                {transportChargeType === 'fixed' ? (
                  <div>
                    <Label>Fixed Amount ({currencySymbol})</Label>
                    <Input
                      type="number" value={transportChargeFixed} min={0} step={0.01}
                      placeholder="Enter fixed amount"
                      onChange={(e) => setTransportChargeFixed(e.target.value ? Number(e.target.value) : '')}
                    />
                  </div>
                ) : (
                  <div>
                    <Label>Percentage (%)</Label>
                    <Input
                      type="number" value={transportChargePercent} min={0} step={0.01} max={100}
                      placeholder="Enter percentage"
                      onChange={(e) => setTransportChargePercent(e.target.value ? Number(e.target.value) : '')}
                    />
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Calculated Amount: {currencySymbol}{fmt(transportCharge)}</p>
              </div>
            </CardContent>
          </Card>

          {/* ══ LINE ITEMS ══ */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <CardTitle>Line Items</CardTitle>
                <Button size="sm" onClick={addLineItem}>
                  <Plus className="h-4 w-4 mr-2" /> Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {lineItems.length === 0 && (
                <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-lg">
                  <p className="text-muted-foreground text-sm">No line items yet. Click "Add Item" to begin.</p>
                </div>
              )}
              {lineItems.map((item, i) => (
                <div key={i} className="border rounded-lg p-4 bg-gradient-to-r from-blue-50 to-gray-50 shadow-sm">
                  {/* Row 1: S.No badge + Delete */}
                  <div className="flex justify-between items-center mb-3">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-700 text-white text-xs font-bold">
                      {item.sNo}
                    </span>
                    <Button size="icon" variant="ghost" onClick={() => removeLineItem(i)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>

                  {/* Row 2: Product + Description */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <Label>Product Code</Label>
                      <ProductCombobox
                        products={flattenedProducts}
                        value={item.productCode}
                        onChange={(v) => updateLineItem(i, 'productCode', v)}
                        currencySymbol={currencySymbol}
                      />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea
                        value={item.productDescription}
                        onChange={(e) => updateLineItem(i, 'productDescription', e.target.value)}
                        rows={2}
                      />
                      {item.size && (
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <Ruler className="h-3 w-3" /><span>{typeof item.size === 'object' ? formatSize(item.size) : item.size}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row 3: UOM, HSN, Qty, Rate */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    <div>
                      <Label>UOM</Label>
                      <Input value={item.uom} readOnly className="bg-gray-100 text-sm" />
                    </div>
                    <div>
                      <Label>HSN</Label>
                      <Input value={item.hsnCode} readOnly className="bg-gray-100 text-sm" />
                    </div>
                    <div>
                      <Label>Qty</Label>
                      <Input
                        type="number"
                        value={item.qty === 0 ? '' : item.qty}
                        placeholder="0"
                        onChange={(e) => updateLineItem(i, 'qty', e.target.value === '' ? 0 : Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <Label>Rate ({currencySymbol})</Label>
                      <Input
                        type="number"
                        step={0.01}
                        min={0}
                        value={item.unitRate === 0 ? '' : item.unitRate}
                        placeholder="0.00"
                        onChange={(e) => updateLineItem(i, 'unitRate', e.target.value === '' ? 0 : Number(e.target.value))}
                      />
                    </div>
                  </div>

                  {/* Row 4: Discount + Net Amount */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Discount %</Label>
                      <Input
                        type="number" value={item.discount ?? ''}
                        onChange={(e) => updateLineItem(i, 'discount', e.target.value ? Number(e.target.value) : '')}
                      />
                    </div>
                    <div className="flex flex-col justify-end">
                      <Label className="text-xs text-muted-foreground">Net Amount ({currencySymbol})</Label>
                      {isManualMode ? (
                        <Input
                          type="number"
                          step={0.01}
                          min={0}
                          value={item.netAmount === 0 ? '' : item.netAmount}
                          placeholder="0.00"
                          className="font-bold text-blue-700 h-9"
                          onChange={(e) => updateLineItem(i, 'netAmount', e.target.value === '' ? 0 : Number(e.target.value))}
                        />
                      ) : (
                        <div className="text-xl font-bold text-blue-700">{currencySymbol}{fmt(item.netAmount)}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ══ TOTALS SUMMARY ══ */}
          <Card>
            <CardHeader className="pb-3"><CardTitle>Order Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="flex justify-end">
                <div className="w-full max-w-sm space-y-2 text-sm font-medium">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{currencySymbol}{fmt(subtotal)}</span>
                  </div>
                  {includeGST && currentCurrency === 'INR' && appliedIsTNCustomer && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">CGST @{cgstPercent}%</span>
                        <span>{currencySymbol}{fmt(cgst)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SGST @{sgstPercent}%</span>
                        <span>{currencySymbol}{fmt(sgst)}</span>
                      </div>
                    </>
                  )}
                  {includeGST && currentCurrency === 'INR' && !appliedIsTNCustomer && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IGST @{igstPercent}%</span>
                      <span>{currencySymbol}{fmt(igst)}</span>
                    </div>
                  )}
                  {transportCharge > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Transport {transportChargeType === 'percent' ? `@${transportChargePercent}%` : '(Fixed)'}
                      </span>
                      <span>{currencySymbol}{fmt(transportCharge)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold text-blue-700 border-t-2 border-blue-700 pt-2 mt-2">
                    <span>Grand Total ({currentCurrency})</span>
                    <span>{currencySymbol}{fmt(total)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ══ NOTES ══ */}
          <Card>
            <CardHeader className="pb-3"><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Remarks</Label>
                <Textarea
                  value={formData.remarks}
                  onChange={(e) => setFormData(p => ({ ...p, remarks: e.target.value }))}
                  rows={3} placeholder="Any special remarks..."
                />
              </div>
              <div>
                <Label>Comments</Label>
                <Textarea
                  value={formData.comments}
                  onChange={(e) => setFormData(p => ({ ...p, comments: e.target.value }))}
                  rows={3} placeholder="Additional comments..."
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ══ LIVE PREVIEW ══ */}
        <div className="w-full mb-8">
          <div className="bg-white rounded-lg shadow-2xl border overflow-hidden">
            <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white p-3 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="font-bold text-lg">Live Preview — A4 Landscape</span>
                {isWalkInMode && (
                  <span className="bg-red-600 text-white px-3 py-0.5 rounded-full text-xs font-bold">CASH SALE</span>
                )}
              </div>
              <div className="text-sm opacity-80">
                Currency: {currentCurrency} ({currencySymbol}) &nbsp;|&nbsp; Items: {lineItems.length}
              </div>
            </div>
            <div className="overflow-x-auto">
              <div ref={printRef}>
                <QuotationPrintTemplate quotation={quotationData} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          CUSTOMER DIALOG
      ══════════════════════════════════════════════════════════════ */}
      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Add New Customer</DialogTitle>
            <div className="flex items-center gap-4 bg-blue-50 px-5 py-3 rounded-xl border-2 border-blue-200 mt-2">
              <span className="text-sm font-medium text-blue-700">Customer Code:</span>
              <code className="text-xl font-bold text-blue-600 tracking-wider">{customerCode}</code>
              <Button
                size="icon" variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(customerCode);
                  setCopied(true); toast.success('Copied!');
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5" />}
              </Button>
            </div>
          </DialogHeader>

          <Tabs defaultValue="info" className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="info">Basic Info</TabsTrigger>
              <TabsTrigger value="addresses">Addresses</TabsTrigger>
              <TabsTrigger value="bank">Bank Details</TabsTrigger>
            </TabsList>

            {/* ── Basic Info Tab ── */}
            <TabsContent value="info" className="space-y-6 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Company Name *</Label>
                  <Input
                    value={newCustomer.companyName}
                    onChange={(e) => setNewCustomer(p => ({ ...p, companyName: e.target.value }))}
                    placeholder="e.g. ABC Pvt Ltd"
                  />
                </div>
                <div>
                  <Label>Contact Person *</Label>
                  <Input
                    value={newCustomer.contactPerson}
                    onChange={(e) => setNewCustomer(p => ({ ...p, contactPerson: e.target.value }))}
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input
                    type="email" value={newCustomer.email}
                    onChange={(e) => setNewCustomer(p => ({ ...p, email: e.target.value }))}
                    placeholder="contact@company.com"
                  />
                </div>
                <div>
                  <Label>Mobile Number *</Label>
                  <Input
                    value={newCustomer.phone} maxLength={10}
                    onChange={(e) => setNewCustomer(p => ({ ...p, phone: digitsOnly(limit(e.target.value, 10)) }))}
                    placeholder="10-digit mobile"
                  />
                </div>
                <div>
                  <Label>Currency *</Label>
                  <Select value={newCustomer.currency} onValueChange={(v) => setNewCustomer(p => ({ ...p, currency: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {currencies.map(c => (
                        <SelectItem key={c.code} value={c.code}>{c.name} ({c.symbol})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>GST Number</Label>
                  <Input
                    value={newCustomer.gst || ''} maxLength={15}
                    onChange={(e) => setNewCustomer(p => ({ ...p, gst: toUpper(limit(e.target.value, 15)) }))}
                    placeholder="e.g. 33XXXXX (TN) or 27XXXXX"
                  />
                  {newCustomer.gst && (
                    <p className={`text-xs mt-1 font-medium ${isTamilNaduGST(newCustomer.gst) ? 'text-green-600' : 'text-orange-600'}`}>
                      {isTamilNaduGST(newCustomer.gst)
                        ? '✓ Tamil Nadu customer → CGST + SGST will apply'
                        : '✓ Outside Tamil Nadu → IGST will apply'}
                    </p>
                  )}
                </div>
                <div>
                  <Label>PAN</Label>
                  <Input
                    value={newCustomer.pan || ''} maxLength={10}
                    onChange={(e) => setNewCustomer(p => ({ ...p, pan: toUpper(limit(e.target.value, 10)) }))}
                    placeholder="AAAAA0000A"
                  />
                </div>
                <div>
                  <Label>CIN</Label>
                  <Input
                    value={newCustomer.cin || ''} maxLength={21}
                    onChange={(e) => setNewCustomer(p => ({ ...p, cin: toUpper(limit(e.target.value, 21)) }))}
                    placeholder="U12345AB2020PTC123456"
                  />
                </div>
              </div>
            </TabsContent>

            {/* ── Addresses Tab ── */}
            <TabsContent value="addresses" className="pt-4">
              <Tabs defaultValue="billing">
                <TabsList className="mb-4">
                  <TabsTrigger value="billing">
                    Billing ({(newCustomer.addresses || []).filter(a => a.type === 'billing').length})
                  </TabsTrigger>
                  <TabsTrigger value="shipping">
                    Shipping ({(newCustomer.addresses || []).filter(a => a.type === 'shipping').length})
                  </TabsTrigger>
                </TabsList>

                {(['billing', 'shipping'] as const).map(type => (
                  <TabsContent key={type} value={type}>
                    <Button size="sm" className="mb-4" onClick={() => openAddressDialog(undefined, type)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add {type === 'billing' ? 'Billing' : 'Shipping'} Address
                    </Button>
                    {(newCustomer.addresses || []).filter(a => a.type === type).map(addr => (
                      <div
                        key={addr.id}
                        className={`p-4 rounded-lg border mb-3 ${addr.isDefault ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-white'}`}
                      >
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <strong className="text-sm">{addr.label}</strong>
                              {addr.isDefault && (
                                <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">DEFAULT</span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {addr.street}{addr.area && `, ${addr.area}`}<br />
                              {addr.city}, {addr.state} – {addr.pincode}, {addr.country}
                            </p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button size="icon" variant="ghost" onClick={() => openAddressDialog(addr)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => deleteAddress(addr.id)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(newCustomer.addresses || []).filter(a => a.type === type).length === 0 && (
                      <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                        <p className="text-muted-foreground text-sm">
                          No {type} addresses added yet.
                        </p>
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </TabsContent>

            {/* ── Bank Details Tab ── */}
            <TabsContent value="bank" className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Bank Name</Label>
                  <Input
                    value={newCustomer.bankName || ''}
                    onChange={(e) => setNewCustomer(p => ({ ...p, bankName: e.target.value }))}
                    placeholder="e.g. State Bank of India"
                  />
                </div>
                <div>
                  <Label>Account Number</Label>
                  <Input
                    value={newCustomer.bankAccountNo || ''}
                    onChange={(e) => setNewCustomer(p => ({ ...p, bankAccountNo: e.target.value }))}
                    placeholder="Account number"
                  />
                </div>
                <div>
                  <Label>IFSC Code</Label>
                  <Input
                    value={newCustomer.bankIfsc || ''}
                    onChange={(e) => setNewCustomer(p => ({ ...p, bankIfsc: toUpper(e.target.value) }))}
                    placeholder="e.g. SBIN0001234"
                  />
                </div>
                <div>
                  <Label>Branch</Label>
                  <Input
                    value={newCustomer.bankBranch || ''}
                    onChange={(e) => setNewCustomer(p => ({ ...p, bankBranch: e.target.value }))}
                    placeholder="Branch name & city"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setCustomerDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveNewCustomer} className="bg-blue-700 hover:bg-blue-800">
              Create & Select Customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════
          ADDRESS DIALOG
      ══════════════════════════════════════════════════════════════ */}
      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingAddress ? 'Edit' : 'Add'}{' '}
              {addressForm.type === 'billing' ? 'Billing' : 'Shipping'} Address
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <Label>Label *</Label>
              <Input
                value={addressForm.label}
                onChange={(e) => setAddressForm(p => ({ ...p, label: e.target.value }))}
                placeholder="e.g., Head Office, Warehouse"
              />
            </div>
            <div>
              <Label>Street *</Label>
              <Input
                value={addressForm.street}
                onChange={(e) => setAddressForm(p => ({ ...p, street: e.target.value }))}
                placeholder="Door no, Street name"
              />
            </div>
            <div>
              <Label>Area / Locality</Label>
              <Input
                value={addressForm.area || ''}
                onChange={(e) => setAddressForm(p => ({ ...p, area: e.target.value }))}
                placeholder="Area / Locality"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>City *</Label>
                <Input
                  value={addressForm.city}
                  onChange={(e) => setAddressForm(p => ({ ...p, city: e.target.value }))}
                />
              </div>
              <div>
                <Label>State *</Label>
                <Select value={addressForm.state} onValueChange={(v) => setAddressForm(p => ({ ...p, state: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {indianStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Pincode *</Label>
                <Input
                  value={addressForm.pincode} maxLength={6}
                  onChange={(e) => setAddressForm(p => ({ ...p, pincode: digitsOnly(limit(e.target.value, 6)) }))}
                  placeholder="6-digit pincode"
                />
              </div>
              <div>
                <Label>Country *</Label>
                <Input
                  value={addressForm.country}
                  onChange={(e) => setAddressForm(p => ({ ...p, country: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isDefault"
                checked={!!addressForm.isDefault}
                onCheckedChange={(c) => setAddressForm(p => ({ ...p, isDefault: c as boolean }))}
              />
              <Label htmlFor="isDefault" className="cursor-pointer">Set as default address</Label>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setAddressDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveAddress}>Save Address</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}