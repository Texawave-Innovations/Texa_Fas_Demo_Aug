// modules/sales/CustomerForm.tsx
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RowActions } from '@/components/ui/row-actions';
import { ArrowLeft, Plus, Trash2, MapPin, Edit, Copy, Check, Globe, Percent, Building2, Phone, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { createRecord, updateRecord, getRecordById, getAllRecords } from '@/services/firebase';
import { nanoid } from 'nanoid';

const indianStates = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh"
];

const top20Currencies = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr" },
  { code: "KRW", name: "South Korean Won", symbol: "₩" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
  { code: "MXN", name: "Mexican Peso", symbol: "$" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "RUB", name: "Russian Ruble", symbol: "₽" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ" }
];

const countryCodes = [
  { code: "IN", name: "India", dialCode: "+91", flag: "🇮🇳" },
  { code: "US", name: "United States", dialCode: "+1", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", dialCode: "+44", flag: "🇬🇧" },
  { code: "AE", name: "UAE", dialCode: "+971", flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia", dialCode: "+966", flag: "🇸🇦" },
  { code: "SG", name: "Singapore", dialCode: "+65", flag: "🇸🇬" },
  { code: "AU", name: "Australia", dialCode: "+61", flag: "🇦🇺" },
  { code: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦" },
  { code: "DE", name: "Germany", dialCode: "+49", flag: "🇩🇪" },
  { code: "FR", name: "France", dialCode: "+33", flag: "🇫🇷" },
];

interface Address {
  id: string;
  type: 'billing' | 'shipping';
  label: string;
  street: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault: boolean;
}

interface Branch {
  id: string;
  branchName: string;
  branchCode: string;
  contactPerson: string;
  email: string;
  phone: string;
  phoneCountryCode: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isHeadOffice: boolean;
}

interface CustomerData {
  customerCode: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  phoneCountryCode: string;
  currency: string;
  gst?: string;
  cgst?: string;
  sgst?: string;
  igst?: string;
  pan?: string;
  cin?: string;
  addresses: Address[];
  branches: Branch[];
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  bankBranch?: string;
  bankDetails?: string;
  createdAt?: number;
  updatedAt?: number;
}

const initialAddressForm: Omit<Address, 'id'> = {
  type: 'billing',
  label: 'Head Office',
  street: '',
  area: '',
  city: '',
  state: 'Tamil Nadu',
  pincode: '',
  country: 'India',
  isDefault: false,
};

const initialBranchForm: Omit<Branch, 'id'> = {
  branchName: '',
  branchCode: '',
  contactPerson: '',
  email: '',
  phone: '',
  phoneCountryCode: 'IN',
  address: '',
  city: '',
  state: 'Tamil Nadu',
  pincode: '',
  country: 'India',
  isHeadOffice: false,
};

export default function CustomerForm() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [formData, setFormData] = useState<CustomerData>({
    customerCode: '',
    companyName: '',
    contactPerson: '',
    email: '',
    phone: '',
    phoneCountryCode: 'IN',
    currency: 'INR',
    gst: '',
    cgst: '',
    sgst: '',
    igst: '',
    pan: '',
    cin: '',
    addresses: [],
    branches: [],
    bankName: '',
    bankAccountNo: '',
    bankIfsc: '',
    bankBranch: '',
    bankDetails: '',
  });

  const [customerCode, setCustomerCode] = useState('CUST-0000');
  const [copied, setCopied] = useState(false);

  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [addressForm, setAddressForm] = useState<Omit<Address, 'id'>>(initialAddressForm);

  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchForm, setBranchForm] = useState<Omit<Branch, 'id'>>(initialBranchForm);

  // Input helpers
  const onlyDigits = (value: string) => value.replace(/\D/g, '');
  const toUpper = (value: string) => value.toUpperCase();
  const limitLength = (value: string, max: number) => value.slice(0, max);

  // Validations
  const validateEmail = (email: string): boolean => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(email)) {
      toast.error('Please enter a valid email address');
      return false;
    }
    return true;
  };

  const validatePhone = (phone: string): boolean => {
    if (phone.length < 7 || phone.length > 15) {
      toast.error('Phone number should be 7–15 digits');
      return false;
    }
    return true;
  };

  const validatePincode = (pin: string): boolean => {
    if (pin && pin.length !== 6) {
      toast.error('Pincode must be exactly 6 digits');
      return false;
    }
    return true;
  };

  const validatePAN = (pan: string): boolean => {
    if (!pan) return true;
    const cleaned = pan.toUpperCase();
    if (cleaned.length !== 10 || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleaned)) {
      toast.error('Invalid PAN format (e.g., ABCDE1234F)');
      return false;
    }
    return true;
  };

  const validateGST = (gst: string): boolean => {
    if (!gst) return true;
    const cleaned = gst.toUpperCase();
    if (cleaned.length !== 15 || !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(cleaned)) {
      toast.error('Invalid GSTIN format');
      return false;
    }
    return true;
  };

  const validateCIN = (cin: string): boolean => {
    if (!cin) return true;
    const cleaned = cin.toUpperCase();
    if (cleaned.length !== 21 || !/^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(cleaned)) {
      toast.error('Invalid CIN format');
      return false;
    }
    return true;
  };

  const validateIFSC = (ifsc: string): boolean => {
    if (!ifsc) return true;
    const cleaned = ifsc.toUpperCase();
    if (cleaned.length !== 11 || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleaned)) {
      toast.error('Invalid IFSC code');
      return false;
    }
    return true;
  };

  const validateBankAccount = (acc: string): boolean => {
    if (!acc) return true;
    if (acc.length < 9 || acc.length > 18) {
      toast.error('Bank Account No. must be 9–18 digits');
      return false;
    }
    return true;
  };

  // Generate Customer Code
  const generateCustomerCode = async () => {
    try {
      const customers = await getAllRecords('sales/customers');
      const codes = customers
        .map((c: any) => c.customerCode || '')
        .filter((code: string) => code.startsWith('CUST-'))
        .map((code: string) => parseInt(code.split('-')[1] || '0', 10));
      const nextNum = (Math.max(...codes, 0) + 1).toString().padStart(4, '0');
      const newCode = `CUST-${nextNum}`;
      setCustomerCode(newCode);
      setFormData((prev) => ({ ...prev, customerCode: newCode }));
    } catch (error) {
      const fallback = `CUST-${Date.now().toString().slice(-4)}`;
      setCustomerCode(fallback);
      setFormData((prev) => ({ ...prev, customerCode: fallback }));
    }
  };

  const loadCustomer = async () => {
    if (!id) return;
    try {
      const customer = await getRecordById('sales/customers', id);
      if (customer) {
        setCustomerCode(customer.customerCode || 'N/A');
        setFormData({
          customerCode: customer.customerCode || '',
          companyName: customer.companyName || '',
          contactPerson: customer.contactPerson || '',
          email: customer.email || '',
          phone: customer.phone || '',
          phoneCountryCode: customer.phoneCountryCode || 'IN',
          currency: customer.currency || 'INR',
          gst: customer.gst || '',
          cgst: customer.cgst || '',
          sgst: customer.sgst || '',
          igst: customer.igst || '',
          pan: customer.pan || '',
          cin: customer.cin || '',
          addresses: customer.addresses || [],
          branches: customer.branches || [],
          bankName: customer.bankName || '',
          bankAccountNo: customer.bankAccountNo || '',
          bankIfsc: customer.bankIfsc || '',
          bankBranch: customer.bankBranch || '',
          bankDetails: customer.bankDetails || '',
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
        });
      }
    } catch (error) {
      toast.error('Failed to load customer data');
      navigate('/master/sales/customer');
    }
  };

  useEffect(() => {
    if (isEdit && id) {
      loadCustomer();
    } else {
      generateCustomerCode();
    }
  }, [id, isEdit]);

  // ✅ FIXED: Address Handlers
  const openAddressDialog = (addressType?: 'billing' | 'shipping', address?: Address) => {
    if (address) {
      // Editing existing address
      setEditingAddress(address);
      setAddressForm({ ...address });
    } else {
      // Adding new address
      setEditingAddress(null);
      const newAddressForm = { ...initialAddressForm };
      if (addressType) {
        newAddressForm.type = addressType;
      }
      // Set isDefault to true if it's the first address of this type
      const sameTypeCount = formData.addresses.filter((a) => a.type === (addressType || 'billing')).length;
      newAddressForm.isDefault = sameTypeCount === 0;
      setAddressForm(newAddressForm);
    }
    setAddressDialogOpen(true);
  };

  const saveAddress = () => {
    if (!addressForm.street.trim()) return toast.error('Street address is required');
    if (!addressForm.city.trim()) return toast.error('City is required');
    if (!validatePincode(addressForm.pincode)) return;

    const newAddress: Address = editingAddress
      ? { ...addressForm, id: editingAddress.id }
      : { ...addressForm, id: nanoid() };

    let updatedAddresses = [...formData.addresses];

    if (editingAddress) {
      // Update existing
      updatedAddresses = updatedAddresses.map((a) =>
        a.id === editingAddress.id ? newAddress : a
      );
    } else {
      // Add new
      updatedAddresses.push(newAddress);
    }

    // Handle default logic - only one default per type
    if (newAddress.isDefault) {
      updatedAddresses = updatedAddresses.map((a) => ({
        ...a,
        isDefault: a.id === newAddress.id && a.type === newAddress.type,
      }));
    }

    // ✅ Update state immediately
    setFormData((prev) => ({ ...prev, addresses: updatedAddresses }));
    setAddressDialogOpen(false);
    setEditingAddress(null);
    setAddressForm(initialAddressForm);
    toast.success(editingAddress ? 'Address updated' : 'Address added');
  };

  const deleteAddress = (addrId: string) => {
    const addr = formData.addresses.find((a) => a.id === addrId);
    if (!addr) return;

    const sameTypeCount = formData.addresses.filter((a) => a.type === addr.type).length;
    if (sameTypeCount === 1) {
      return toast.error(`Cannot delete the last ${addr.type} address`);
    }

    setFormData((prev) => ({
      ...prev,
      addresses: prev.addresses.filter((a) => a.id !== addrId),
    }));
    toast.success('Address removed');
  };

  const setDefaultAddress = (addrId: string, type: 'billing' | 'shipping') => {
    setFormData((prev) => ({
      ...prev,
      addresses: prev.addresses.map((a) => ({
        ...a,
        isDefault: a.id === addrId && a.type === type,
      })),
    }));
    toast.success(`Default ${type} address set`);
  };

  // ✅ FIXED: Branch Handlers
  const openBranchDialog = (branch?: Branch) => {
    if (branch) {
      setEditingBranch(branch);
      setBranchForm({ ...branch });
    } else {
      setEditingBranch(null);
      const newBranchForm = { ...initialBranchForm };
      // Set isHeadOffice to true if it's the first branch
      newBranchForm.isHeadOffice = formData.branches.length === 0;
      setBranchForm(newBranchForm);
    }
    setBranchDialogOpen(true);
  };

  const saveBranch = () => {
    if (!branchForm.branchName.trim()) return toast.error('Branch name is required');
    if (!branchForm.branchCode.trim()) return toast.error('Branch code is required');
    if (!branchForm.contactPerson.trim()) return toast.error('Contact person is required');
    if (!validateEmail(branchForm.email)) return;
    if (!branchForm.phone.trim() || !validatePhone(branchForm.phone)) return;
    if (!branchForm.address.trim()) return toast.error('Address is required');
    if (!branchForm.city.trim()) return toast.error('City is required');
    if (!validatePincode(branchForm.pincode)) return;

    const isDuplicateCode = formData.branches.some(
      (b) => b.branchCode === branchForm.branchCode && b.id !== editingBranch?.id
    );
    if (isDuplicateCode) return toast.error('Branch code already in use');

    const newBranch: Branch = editingBranch
      ? { ...branchForm, id: editingBranch.id }
      : { ...branchForm, id: nanoid() };

    let updatedBranches = [...formData.branches];

    if (editingBranch) {
      updatedBranches = updatedBranches.map((b) =>
        b.id === editingBranch.id ? newBranch : b
      );
    } else {
      updatedBranches.push(newBranch);
    }

    if (newBranch.isHeadOffice) {
      updatedBranches = updatedBranches.map((b) => ({
        ...b,
        isHeadOffice: b.id === newBranch.id,
      }));
    }

    // ✅ Update state immediately
    setFormData((prev) => ({ ...prev, branches: updatedBranches }));
    setBranchDialogOpen(false);
    setEditingBranch(null);
    setBranchForm(initialBranchForm);
    toast.success(editingBranch ? 'Branch updated' : 'Branch added');
  };

  const deleteBranch = (branchId: string) => {
    setFormData((prev) => ({
      ...prev,
      branches: prev.branches.filter((b) => b.id !== branchId),
    }));
    toast.success('Branch removed');
  };

  const setHeadOffice = (branchId: string) => {
    setFormData((prev) => ({
      ...prev,
      branches: prev.branches.map((b) => ({
        ...b,
        isHeadOffice: b.id === branchId,
      })),
    }));
    toast.success('Head office updated');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.companyName.trim()) return toast.error('Company Name is required');
    if (!formData.contactPerson.trim()) return toast.error('Contact Person is required');
    if (!validateEmail(formData.email)) return;
    if (!validatePhone(formData.phone)) return;

    const billingCount = formData.addresses.filter((a) => a.type === 'billing').length;
    const shippingCount = formData.addresses.filter((a) => a.type === 'shipping').length;

    if (billingCount === 0) return toast.error('At least one Billing Address is required');
    if (shippingCount === 0) return toast.error('At least one Shipping Address is required');

    if (formData.pan && !validatePAN(formData.pan)) return;
    if (formData.gst && !validateGST(formData.gst)) return;
    if (formData.cin && !validateCIN(formData.cin)) return;
    if (formData.bankIfsc && !validateIFSC(formData.bankIfsc)) return;
    if (formData.bankAccountNo && !validateBankAccount(formData.bankAccountNo)) return;

    // Check for duplicates (case-insensitive)
    try {
      const existingCustomers = await getAllRecords('sales/customers');
      
      const isDuplicateName = existingCustomers.some((c: any) => 
        c.id !== id && 
        c.companyName?.trim().toLowerCase() === formData.companyName.trim().toLowerCase()
      );
      
      const isDuplicateCode = existingCustomers.some((c: any) => 
        c.id !== id && 
        c.customerCode?.trim().toLowerCase() === customerCode.trim().toLowerCase()
      );

      if (isDuplicateName) {
        toast.error("Duplicate entries are not allowed. Customer with this Company Name already exists.");
        return;
      }
      if (isDuplicateCode) {
        toast.error("Duplicate entries are not allowed. Customer with this Customer Code already exists.");
        return;
      }
    } catch (err) {
      console.error("Duplicate check failed:", err);
      toast.error("Failed to perform duplicate check validation.");
      return;
    }

    const payload = {
      ...formData,
      customerCode: customerCode.trim(), // Ensure the current code is saved
      updatedAt: Date.now(),
      ...(isEdit ? {} : { createdAt: Date.now() }),
    };

    try {
      if (isEdit) {
        await updateRecord('sales/customers', id!, payload);
        toast.success('Customer updated successfully');
      } else {
        await createRecord('sales/customers', payload);
        toast.success('Customer created successfully');
      }
      navigate('/master/sales/customer');
    } catch (error) {
      console.error(error);
      toast.error('Failed to save customer. Check console for details.');
    }
  };

  const billingAddresses = formData.addresses.filter((a) => a.type === 'billing');
  const shippingAddresses = formData.addresses.filter((a) => a.type === 'shipping');

  return (
    <div className="min-h-screen bg-muted/40 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/master/sales/customer">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                {isEdit ? 'Edit Customer' : 'Add New Customer'}
              </h1>
              <p className="text-sm md:text-base text-muted-foreground">
                {isEdit ? `Customer Code: ${customerCode}` : 'A unique customer code has been generated'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-blue-50 px-4 md:px-6 py-3 md:py-4 rounded-xl border-2 border-blue-200">
            <span className="text-xs md:text-sm font-medium text-blue-700">Customer Code</span>
            <code className="text-lg md:text-2xl font-bold text-blue-600">{customerCode}</code>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(customerCode);
                setCopied(true);
                toast.success('Copied!');
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
          {/* BASIC + TAX INFO */}
          <Card className="shadow-xl">
            <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <CardTitle className="text-xl md:text-2xl">Basic & Tax Information</CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                <div className="space-y-2">
                  <Label>Company Name <span className="text-red-500">*</span></Label>
                  <Input
                    required
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    placeholder="ABC Industries Pvt Ltd"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Contact Person <span className="text-red-500">*</span></Label>
                  <Input
                    required
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Email <span className="text-red-500">*</span></Label>
                  <Input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="john@company.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Mobile Number <span className="text-red-500">*</span></Label>
                  <div className="flex">
                    <Select
                      value={formData.phoneCountryCode}
                      onValueChange={(v) => setFormData({ ...formData, phoneCountryCode: v })}
                    >
                      <SelectTrigger className="w-[100px] rounded-r-none border-r-0">
                        <SelectValue>
                          {(() => {
                            const c = countryCodes.find((c) => c.code === formData.phoneCountryCode);
                            return c ? `${c.flag} ${c.dialCode}` : '+91';
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {countryCodes.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            <span className="flex items-center gap-2">
                              <span className="text-lg">{country.flag}</span>
                              <span>{country.dialCode}</span>
                              <span className="text-xs text-muted-foreground">{country.name}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: onlyDigits(limitLength(e.target.value, 15)) })
                      }
                      placeholder="9876543210"
                      maxLength={10}
                      className="rounded-l-none flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Currency <span className="text-red-500">*</span></Label>
                  <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {top20Currencies.map((curr) => (
                        <SelectItem key={curr.code} value={curr.code}>
                          <span className="flex items-center gap-2">
                            <Globe className="h-4 w-4" />
                            {curr.code} - {curr.name} {curr.symbol}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>GST Number</Label>
                  <Input
                    value={formData.gst || ''}
                    onChange={(e) => setFormData({ ...formData, gst: toUpper(limitLength(e.target.value, 15)) })}
                    placeholder="27AAAAA0000A1Z5"
                    maxLength={15}
                  />
                </div>

                <div className="space-y-2">
                  <Label>CGST Rate (%)</Label>
                  <div className="relative">
                    <Input
                      type="text"
                      value={formData.cgst || ''}
                      onChange={(e) => {
                        const val = onlyDigits(e.target.value);
                        if (val === '' || Number(val) <= 28) {
                          setFormData({ ...formData, cgst: val });
                        }
                      }}
                      placeholder="0"
                      className="pr-10"
                    />
                    <Percent className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>SGST Rate (%)</Label>
                  <div className="relative">
                    <Input  
                      type="text"
                      value={formData.sgst || ''}
                      onChange={(e) => {
                        const val = onlyDigits(e.target.value);
                        if (val === '' || Number(val) <= 28) {
                          setFormData({ ...formData, sgst: val });
                        }
                      }}
                      placeholder="0"
                      className="pr-10"
                    />
                    <Percent className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>IGST Rate (%)</Label>
                  <div className="relative">
                    <Input
                      type="text"
                      value={formData.igst || ''}
                      onChange={(e) => {
                        const val = onlyDigits(e.target.value);
                        if (val === '' || Number(val) <= 28) {
                          setFormData({ ...formData, igst: val });
                        }
                      }}
                      placeholder="0"
                      className="pr-10"
                    />
                    <Percent className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>PAN Number</Label>
                  <Input
                    value={formData.pan || ''}
                    onChange={(e) => setFormData({ ...formData, pan: toUpper(limitLength(e.target.value, 10)) })}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                  />
                </div>

                <div className="space-y-2">
                  <Label>CIN Number</Label>
                  <Input
                    value={formData.cin || ''}
                    onChange={(e) => setFormData({ ...formData, cin: toUpper(limitLength(e.target.value, 21)) })}
                    placeholder="L12345MH2020PLC123456"
                    maxLength={21}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* BRANCHES */}
          <Card className="shadow-xl">
            <CardHeader className="bg-gradient-to-r from-orange-600 to-red-600 text-white">
              <CardTitle className="text-xl md:text-2xl flex items-center gap-2">
                <Building2 className="h-6 w-6" />
                Branch Management
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:p-8">
              <div className="flex justify-end mb-4">
                <Button
                  type="button"
                  onClick={() => openBranchDialog()}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  <Plus className="h-4 w-4 mr-2" /> Add Branch
                </Button>
              </div>

              {formData.branches.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-xl">
                  <Building2 className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p className="text-muted-foreground">No branches added yet</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {formData.branches.map((branch) => (
                    <BranchCard
                      key={branch.id}
                      branch={branch}
                      onEdit={openBranchDialog}
                      onDelete={deleteBranch}
                      onSetHeadOffice={setHeadOffice}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ADDRESSES */}
          <Card className="shadow-xl">
            <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600 text-white">
              <CardTitle className="text-xl md:text-2xl">Billing & Shipping Addresses</CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:p-8">
              <Tabs defaultValue="billing" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="billing">Billing ({billingAddresses.length})</TabsTrigger>
                  <TabsTrigger value="shipping">Shipping ({shippingAddresses.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="billing">
                  <div className="flex justify-end mb-4">
                    <Button
                      type="button"
                      onClick={() => openAddressDialog('billing')}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Plus className="h-4 w-4 mr-2" /> Add Billing Address
                    </Button>
                  </div>

                  {billingAddresses.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-xl">
                      <MapPin className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                      <p className="text-muted-foreground">No billing addresses added yet</p>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {billingAddresses.map((addr) => (
                        <AddressCard
                          key={addr.id}
                          addr={addr}
                          onEdit={(a) => openAddressDialog(undefined, a)}
                          onDelete={deleteAddress}
                          onSetDefault={setDefaultAddress}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="shipping">
                  <div className="flex justify-end mb-4">
                    <Button
                      type="button"
                      onClick={() => openAddressDialog('shipping')}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4 mr-2" /> Add Shipping Address
                    </Button>
                  </div>

                  {shippingAddresses.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-xl">
                      <MapPin className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                      <p className="text-muted-foreground">No shipping addresses added yet</p>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {shippingAddresses.map((addr) => (
                        <AddressCard
                          key={addr.id}
                          addr={addr}
                          onEdit={(a) => openAddressDialog(undefined, a)}
                          onDelete={deleteAddress}
                          onSetDefault={setDefaultAddress}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* BANK DETAILS */}
          <Card className="shadow-xl">
            <CardHeader className="bg-gradient-to-r from-purple-600 to-violet-600 text-white">
              <CardTitle className="text-xl md:text-2xl">Bank Details (Optional)</CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <Input
                  placeholder="Bank Name"
                  value={formData.bankName || ''}
                  onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                />
                <Input
                  placeholder="Account Number"
                  value={formData.bankAccountNo || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, bankAccountNo: onlyDigits(limitLength(e.target.value, 18)) })
                  }
                  maxLength={18}
                />
                <Input
                  placeholder="IFSC Code"
                  value={formData.bankIfsc || ''}
                  onChange={(e) => setFormData({ ...formData, bankIfsc: toUpper(limitLength(e.target.value, 11)) })}
                  maxLength={11}
                />
                <Input
                  placeholder="Branch"
                  value={formData.bankBranch || ''}
                  onChange={(e) => setFormData({ ...formData, bankBranch: e.target.value })}
                />
                <div className="md:col-span-2">
                  <Textarea
                    placeholder="Additional payment notes, UPI ID, etc..."
                    value={formData.bankDetails || ''}
                    onChange={(e) => setFormData({ ...formData, bankDetails: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col md:flex-row justify-end gap-3 md:gap-4 pt-4 md:pt-8">
            <Button type="button" variant="outline" size="lg" className="w-full md:w-auto" asChild>
              <Link to="/master/sales/customer">Cancel</Link>
            </Button>
            <Button type="submit" size="lg" className="w-full md:w-auto md:px-12">
              {isEdit ? 'Update Customer' : 'Create Customer'}
            </Button>
          </div>
        </form>

        {/* ADDRESS DIALOG - ✅ MODIFIED WITH BRANCH LABEL DROPDOWN */}
        <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingAddress ? 'Edit' : 'Add'} {addressForm.type === 'billing' ? 'Billing' : 'Shipping'} Address
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant={addressForm.type === 'billing' ? 'default' : 'outline'}
                  onClick={() => setAddressForm((prev) => ({ ...prev, type: 'billing' }))}
                  className="flex-1"
                >
                  Billing
                </Button>
                <Button
                  type="button"
                  variant={addressForm.type === 'shipping' ? 'default' : 'outline'}
                  onClick={() => setAddressForm((prev) => ({ ...prev, type: 'shipping' }))}
                  className="flex-1"
                >
                  Shipping
                </Button>
              </div>

              {/* ✅ CHANGED: Input changed to Select dropdown populated with branch names */}
              <div className="space-y-2">
                <Label>Label (Select Branch) <span className="text-red-500">*</span></Label>
                {formData.branches.length === 0 ? (
                  <div className="p-3 border-2 border-dashed rounded-lg text-sm text-muted-foreground text-center">
                    No branches available. Please add a branch first.
                  </div>
                ) : (
                  <Select
                    value={addressForm.label}
                    onValueChange={(value) => setAddressForm({ ...addressForm, label: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {formData.branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.branchName}>
                          <span className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            {branch.branchName}
                            {branch.isHeadOffice && (
                              <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">HO</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <Textarea
                placeholder="Street / Building No. *"
                value={addressForm.street}
                onChange={(e) => setAddressForm({ ...addressForm, street: e.target.value })}
                rows={2}
              />

              <Input
                placeholder="Area / Locality"
                value={addressForm.area}
                onChange={(e) => setAddressForm({ ...addressForm, area: e.target.value })}
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  placeholder="City *"
                  value={addressForm.city}
                  onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                />
                <Select
                  value={addressForm.state}
                  onValueChange={(v) => setAddressForm({ ...addressForm, state: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select State" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {indianStates.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  placeholder="Pincode *"
                  value={addressForm.pincode}
                  onChange={(e) =>
                    setAddressForm({ ...addressForm, pincode: onlyDigits(limitLength(e.target.value, 6)) })
                  }
                  maxLength={6}
                />
                <Input
                  placeholder="Country"
                  value={addressForm.country}
                  onChange={(e) => setAddressForm({ ...addressForm, country: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isDefaultAddress"
                  checked={addressForm.isDefault}
                  onChange={(e) => setAddressForm({ ...addressForm, isDefault: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor="isDefaultAddress" className="cursor-pointer">
                  Set as default {addressForm.type} address
                </Label>
              </div>

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setAddressDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={saveAddress}>
                  {editingAddress ? 'Update' : 'Add'} Address
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* BRANCH DIALOG */}
        <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingBranch ? 'Edit' : 'Add'} Branch</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  placeholder="Branch Name *"
                  value={branchForm.branchName}
                  onChange={(e) => setBranchForm({ ...branchForm, branchName: e.target.value })}
                />
                <Input
                  placeholder="Branch Code *"
                  value={branchForm.branchCode}
                  onChange={(e) => setBranchForm({ ...branchForm, branchCode: toUpper(e.target.value) })}
                />
              </div>

              <Input
                placeholder="Contact Person *"
                value={branchForm.contactPerson}
                onChange={(e) => setBranchForm({ ...branchForm, contactPerson: e.target.value })}
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  type="email"
                  placeholder="Email *"
                  value={branchForm.email}
                  onChange={(e) => setBranchForm({ ...branchForm, email: e.target.value })}
                />
                <div className="flex">
                  <Select
                    value={branchForm.phoneCountryCode}
                    onValueChange={(v) => setBranchForm({ ...branchForm, phoneCountryCode: v })}
                  >
                    <SelectTrigger className="w-[100px] rounded-r-none border-r-0">
                      <SelectValue>
                        {(() => {
                          const c = countryCodes.find((c) => c.code === branchForm.phoneCountryCode);
                          return c ? `${c.flag} ${c.dialCode}` : '+91';
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {countryCodes.map((country) => (
                        <SelectItem key={country.code} value={country.code}>
                          {country.flag} {country.dialCode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Phone *"
                    value={branchForm.phone}
                    onChange={(e) =>
                      setBranchForm({ ...branchForm, phone: onlyDigits(limitLength(e.target.value, 15)) })
                    }
                    className="rounded-l-none flex-1"
                  />
                </div>
              </div>

              <Textarea
                placeholder="Address *"
                value={branchForm.address}
                onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                rows={2}
              />

              <div className="grid grid-cols-3 gap-4">
                <Input
                  placeholder="City *"
                  value={branchForm.city}
                  onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })}
                />
                <Select
                  value={branchForm.state}
                  onValueChange={(v) => setBranchForm({ ...branchForm, state: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {indianStates.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Pincode *"
                  value={branchForm.pincode}
                  onChange={(e) =>
                    setBranchForm({ ...branchForm, pincode: onlyDigits(limitLength(e.target.value, 6)) })
                  }
                  maxLength={6}
                />
              </div>

              <Input
                placeholder="Country"
                value={branchForm.country}
                onChange={(e) => setBranchForm({ ...branchForm, country: e.target.value })}
              />

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isHeadOffice"
                  checked={branchForm.isHeadOffice}
                  onChange={(e) => setBranchForm({ ...branchForm, isHeadOffice: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor="isHeadOffice" className="cursor-pointer">
                  Mark as Head Office
                </Label>
              </div>

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setBranchDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={saveBranch}>
                  {editingBranch ? 'Update' : 'Add'} Branch
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// ✅ Address Card Component
function AddressCard({
  addr,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  addr: Address;
  onEdit: (addr: Address) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string, type: 'billing' | 'shipping') => void;
}) {
  return (
    <Card className={`${addr.isDefault ? 'border-2 border-primary' : ''}`}>
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{addr.label || 'Address'}</span>
            {addr.isDefault && (
              <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Default</span>
            )}
          </div>
          <RowActions
            actions={[
              { label: 'Edit', icon: Edit, onClick: () => onEdit(addr) },
              { label: 'Delete', icon: Trash2, onClick: () => onDelete(addr.id), className: 'text-red-600 hover:text-red-700' },
            ]}
          />
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>{addr.street}</p>
          {addr.area && <p>{addr.area}</p>}
          <p>
            {addr.city}, {addr.state} - {addr.pincode}
          </p>
          <p>{addr.country}</p>
        </div>
        {!addr.isDefault && (
          <Button
            size="sm"
            variant="outline"
            type="button"
            className="mt-3"
            onClick={(e) => {
              e.stopPropagation();
              onSetDefault(addr.id, addr.type);
            }}
          >
            Set as Default
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ✅ Branch Card Component
function BranchCard({
  branch,
  onEdit,
  onDelete,
  onSetHeadOffice,
}: {
  branch: Branch;
  onEdit: (branch: Branch) => void;
  onDelete: (id: string) => void;
  onSetHeadOffice: (id: string) => void;
}) {
  return (
    <Card className={`${branch.isHeadOffice ? 'border-2 border-orange-500' : ''}`}>
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">{branch.branchName}</span>
            </div>
            <code className="text-xs bg-muted px-2 py-1 rounded">{branch.branchCode}</code>
            {branch.isHeadOffice && (
              <span className="ml-2 text-xs bg-orange-500 text-white px-2 py-1 rounded">Head Office</span>
            )}
          </div>
          <RowActions
            actions={[
              { label: 'Edit', icon: Edit, onClick: () => onEdit(branch) },
              { label: 'Delete', icon: Trash2, onClick: () => onDelete(branch.id), className: 'text-red-600 hover:text-red-700' },
            ]}
          />
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <div className="flex items-center gap-2">
            <Phone className="h-3 w-3" />
            <span>{branch.contactPerson}</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="h-3 w-3" />
            <span>{branch.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="h-3 w-3" />
            <span>{branch.phone}</span>
          </div>
          <p className="text-xs mt-2">
            {branch.address}, {branch.city}
          </p>
        </div>
        {!branch.isHeadOffice && (
          <Button
            size="sm"
            variant="outline"
            type="button"
            className="mt-3"
            onClick={(e) => {
              e.stopPropagation();
              onSetHeadOffice(branch.id);
            }}
          >
            Set as Head Office
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
