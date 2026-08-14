// src/modules/hr/EmployeeForm.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, FileText, X, AlertCircle, GraduationCap, Download, Eye, 
  Briefcase, User, CreditCard, AlertTriangle, Home, Droplet, Phone, MapPin, 
  Calendar, Globe, Plus, Trash2, Building, Award, Lock, History, TrendingUp, 
  TrendingDown, Clock, Edit3, IndianRupee, CheckCircle2, Pencil, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { createRecord, updateRecord, getRecordById, getAllRecords } from '@/services/firebase';
import type { Employee } from '@/types';

interface SalaryChange {
  field: string;
  fieldLabel: string;
  oldValue: number | boolean;
  newValue: number | boolean;
  changeType: 'increase' | 'decrease' | 'toggle';
  changeAmount?: number;
  changePercentage?: number;
}

interface SalaryRevision {
  id: string;
  employeeId: string;
  employeeName: string;
  revisionDate: string;
  effectiveFrom: string;
  changedBy: string;
  changedByName: string;
  changes: SalaryChange[];
  reason: string;
  timestamp: number;
  previousSalary: number;
  newSalary: number;
  incrementPercentage: number;
}

const CLOUDINARY_IMAGE_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/dkzwhqhbr/image/upload';
const CLOUDINARY_RAW_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/dkzwhqhbr/raw/upload';
const CLOUDINARY_UPLOAD_PRESET = 'unsigned_preset';

const digitsOnly = (v: string) => v.replace(/\D/g, '');
const limit = (v: string, n: number) => v.slice(0, n);
const toUpper = (v: string) => v.toUpperCase();

const validateAadhaar = (v?: string) => !!v?.match(/^\d{12}$/);
const validatePAN = (v?: string) => !!v?.match(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/);
const validateIFSC = (v?: string) => !!v?.match(/^[A-Z]{4}0?[0-9]{6}$/);
const validatePhone = (v?: string) => !!v?.match(/^\d{10}$/);
const validateEmail = (v?: string) => !!v?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const religions = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Others'];
const maritalStatusOptions = ['Single', 'Married', 'Divorced', 'Widowed'];
const departments = ['Staff', 'Worker', 'Other Workers'];

export default function EmployeeForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [currentUser, setCurrentUser] = useState<{ username: string; role: string; name: string } | null>(null);
  const isAdmin = currentUser?.role === 'admin';
  const isHR = currentUser?.role === 'hr';

  const [loading, setLoading] = useState(false);

  // ─── Office Locations State ───────────────────────────────────────────────
  const [officeLocations, setOfficeLocations] = useState<string[]>([]);
  const [officeSettingsId, setOfficeSettingsId] = useState<string | null>(null);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  const [newOfficeLocation, setNewOfficeLocation] = useState('');
  const [editingLocation, setEditingLocation] = useState<string | null>(null);
  const [editLocationValue, setEditLocationValue] = useState('');
  // ─────────────────────────────────────────────────────────────────────────

  const [uploading, setUploading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'personal' | 'address' | 'emergency' | 'salary' | 'experience' | 'documents' | 'bank'>('basic');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [newLanguage, setNewLanguage] = useState('');
  const [sameAsPermanent, setSameAsPermanent] = useState(true);

  const [previousSalaryData, setPreviousSalaryData] = useState<Employee['salary'] | null>(null);
  const [previousMonthlySalary, setPreviousMonthlySalary] = useState<number>(0);
  const [previousESIPF, setPreviousESIPF] = useState<{ esi: boolean; pf: boolean }>({ esi: false, pf: false });
  const [revisionReason, setRevisionReason] = useState('');
  const [showRevisionHistory, setShowRevisionHistory] = useState(false);
  const [salaryRevisions, setSalaryRevisions] = useState<SalaryRevision[]>([]);

  const [formData, setFormData] = useState<Partial<Employee>>({
    employeeId: '',
    initial: 'Mr',
    name: '',
    gender: '',
    religion: '',
    dob: '',
    age: 0,
    maritalStatus: '',
    languages: ['Tamil', 'English'],
    landline: '',
    referredBy: '',
    phone: '',
    email: '',
    bloodGroup: '',
    department: '',
    role: '',
    joiningDate: new Date().toISOString().split('T')[0],
    officeType: '',
    status: 'inactive',
    experienceYears: 0,
    previousCompany: '',
    previousRole: '',
    salary: {
      monthlySalary: 0,
      basic: 0,
      hra: 0,
      conveyance: 0,
      additionalSpecialAllowance: 0,
      otherAllowance: 0,
      grossMonthly: 0,
      ctcLPA: 0,
      da: 0,
    },
    profilePhoto: '',
    resumeUrl: '',
    aadhaarUrl: '',
    panUrl: '',
    bankStatementUrl: '',
    tenthCertificateUrl: '',
    twelfthCertificateUrl: '',
    graduationCertificateUrl: '',
    postGraduationCertificateUrl: '',
    aadhaarNumber: '',
    panNumber: '',
    esiNumber: '',
    pfNumber: '',
    bankName: '',
    bankAccountNo: '',
    bankIfsc: '',
    bankBranch: '',
    fatherName: '',
    fatherPhone: '',
    motherName: '',
    motherPhone: '',
    spouseName: '',
    spousePhone: '',
    emergencyContact: {
      name: '',
      relationship: '',
      phone: '',
    },
    permanentAddress: {
      address: '',
      area: '',
      district: '',
      city: '',
      state: '',
      pincode: '',
    },
    presentAddress: {
      address: '',
      area: '',
      district: '',
      city: '',
      state: '',
      pincode: '',
    },
    includePF: false,
    includeESI: false,
    salaryRevisions: [],
  });

  const [previews, setPreviews] = useState<Record<string, string>>({
    profilePhoto: '',
    resumeUrl: '',
    aadhaarUrl: '',
    panUrl: '',
    bankStatementUrl: '',
    tenthCertificateUrl: '',
    twelfthCertificateUrl: '',
    graduationCertificateUrl: '',
    postGraduationCertificateUrl: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // ─── Load office locations from DB on mount ───────────────────────────────
  useEffect(() => {
    const loadOfficeLocations = async () => {
      try {
        const records = await getAllRecords('hr/settings/officeLocations');
        if (records && records.length > 0) {
          const doc = records[0] as any;
          const locs: string[] = doc.locations ?? ['OMR', 'Kayar'];
          setOfficeLocations(locs);
          setOfficeSettingsId(doc.id);
        } else {
          const defaultLocs = ['OMR', 'Kayar'];
          setOfficeLocations(defaultLocs);
          const newId = await createRecord('hr/settings/officeLocations', {
            locations: defaultLocs,
            createdAt: Date.now(),
          });
          setOfficeSettingsId(newId as string);
        }
      } finally {
        setLocationsLoaded(true);
      }
    };
    loadOfficeLocations();
  }, []);

  // ─── Auto-set officeType to first location once loaded (new employee only) ─
  useEffect(() => {
    if (!locationsLoaded || isEdit) return;
    if (!formData.officeType && officeLocations.length > 0) {
      setFormData(p => ({ ...p, officeType: officeLocations[0] as any }));
    }
  }, [locationsLoaded, officeLocations]);

  // ─── On edit: if employee's saved officeType was deleted from list, re-add it ─
  useEffect(() => {
    if (!locationsLoaded || !isEdit) return;
    const savedLocation = formData.officeType;
    if (savedLocation && !officeLocations.includes(savedLocation)) {
      const updated = [...officeLocations, savedLocation];
      setOfficeLocations(updated);
      if (officeSettingsId) {
        updateRecord('hr/settings/officeLocations', officeSettingsId, {
          locations: updated,
          updatedAt: Date.now(),
        });
      }
    }
  }, [locationsLoaded, formData.officeType]);
  // ─────────────────────────────────────────────────────────────────────────

  const saveLocations = async (updated: string[]) => {
    if (officeSettingsId) {
      await updateRecord('hr/settings/officeLocations', officeSettingsId, {
        locations: updated,
        updatedAt: Date.now(),
      });
    }
  };

  const addOfficeLocation = async () => {
    const trimmed = newOfficeLocation.trim();
    if (!trimmed) return;
    if (officeLocations.includes(trimmed)) {
      toast({ title: 'Location already exists', variant: 'destructive' });
      return;
    }
    const updated = [...officeLocations, trimmed];
    setOfficeLocations(updated);
    setNewOfficeLocation('');
    await saveLocations(updated);
    toast({ title: `"${trimmed}" added` });
  };

  const deleteOfficeLocation = async (loc: string) => {
    if (officeLocations.length <= 1) {
      toast({ title: 'At least one location required', variant: 'destructive' });
      return;
    }
    const updated = officeLocations.filter(l => l !== loc);
    setOfficeLocations(updated);
    if (formData.officeType === loc) {
      setFormData(p => ({ ...p, officeType: updated[0] as any }));
    }
    await saveLocations(updated);
    toast({ title: `"${loc}" deleted` });
  };

  const startEditLocation = (loc: string) => {
    setEditingLocation(loc);
    setEditLocationValue(loc);
  };

  const saveEditLocation = async () => {
    const trimmed = editLocationValue.trim();
    if (!trimmed || !editingLocation) return;
    if (trimmed !== editingLocation && officeLocations.includes(trimmed)) {
      toast({ title: 'Location already exists', variant: 'destructive' });
      return;
    }
    const updated = officeLocations.map(l => (l === editingLocation ? trimmed : l));
    setOfficeLocations(updated);
    if (formData.officeType === editingLocation) {
      setFormData(p => ({ ...p, officeType: trimmed as any }));
    }
    setEditingLocation(null);
    setEditLocationValue('');
    await saveLocations(updated);
    toast({ title: `Renamed to "${trimmed}"` });
  };

  useEffect(() => {
    const erpUserStr = localStorage.getItem('erp_user');
    if (erpUserStr) {
      try {
        const user = JSON.parse(erpUserStr);
        setCurrentUser(user);
      } catch (e) {
        console.error('Failed to parse user', e);
      }
    }
  }, []);

  useEffect(() => {
    if (!isEdit || !id) return;
    const loadEmployee = async () => {
      const emp = await getRecordById('hr/employees', id);
      if (emp) {
        setFormData(emp as any);
        setPreviousSalaryData((emp as any).salary);
        setPreviousMonthlySalary((emp as any).salary?.monthlySalary || 0);
        setPreviousESIPF({
          esi: (emp as any).includeESI || false,
          pf: (emp as any).includePF || false,
        });
        setSalaryRevisions((emp as any).salaryRevisions || []);
        Object.keys(previews).forEach((k) => {
          const url = (emp as any)[k];
          if (url) setPreviews((p) => ({ ...p, [k]: url }));
        });
      }
    };
    loadEmployee();
  }, [isEdit, id]);

  useEffect(() => {
    if (formData.dob) {
      const birth = new Date(formData.dob);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      setFormData((p) => ({ ...p, age }));
    }
  }, [formData.dob]);

  useEffect(() => {
    if (sameAsPermanent && formData.permanentAddress) {
      setFormData((p) => ({
        ...p,
        presentAddress: { ...p.permanentAddress! },
      }));
    }
  }, [sameAsPermanent, formData.permanentAddress]);

  useEffect(() => {
    if (!isAdmin) return;
    const s = formData.salary!;
    const monthly = s.monthlySalary || 0;
    if (monthly === 0) return;
    const basic = monthly * 0.50;
    const hra = monthly * 0.25;
    const remaining = monthly - (basic + hra);
    const conv = s.conveyance || 0;
    const additionalSpecial = s.additionalSpecialAllowance || 0;
    const other = Math.max(0, remaining - conv);
    const gross = basic + hra + conv + other;
    const totalMonthlyWithAddl = gross + additionalSpecial;
    const ctc = Number((totalMonthlyWithAddl * 12 / 100000).toFixed(2));
    setFormData(prev => ({
      ...prev,
      salary: {
        ...prev.salary!,
        basic: Math.round(basic),
        hra: Math.round(hra),
        conveyance: conv,
        additionalSpecialAllowance: additionalSpecial,
        otherAllowance: Math.round(other),
        grossMonthly: Math.round(gross),
        ctcLPA: ctc,
      }
    }));
  }, [
    formData.salary?.monthlySalary,
    formData.salary?.conveyance,
    formData.salary?.additionalSpecialAllowance,
    isAdmin
  ]);

  const detectSalaryChanges = (): SalaryChange[] => {
    if (!previousSalaryData || !isAdmin) return [];
    const changes: SalaryChange[] = [];
    const current = formData.salary!;
    const previous = previousSalaryData;

    if (previousMonthlySalary !== formData.salary?.monthlySalary) {
      const diff = (formData.salary?.monthlySalary || 0) - previousMonthlySalary;
      const changeType = diff > 0 ? 'increase' : 'decrease';
      const changePercentage = previousMonthlySalary !== 0
        ? Math.abs((diff / previousMonthlySalary) * 100)
        : 100;
      changes.push({
        field: 'monthlySalary',
        fieldLabel: 'Monthly Salary',
        oldValue: previousMonthlySalary,
        newValue: formData.salary?.monthlySalary || 0,
        changeType,
        changeAmount: Math.abs(diff),
        changePercentage: parseFloat(changePercentage.toFixed(2))
      });
    }

    const allowanceFields = [
      { key: 'basic', label: 'Basic' },
      { key: 'hra', label: 'HRA' },
      { key: 'conveyance', label: 'Conveyance' },
      { key: 'additionalSpecialAllowance', label: 'Special Allowance' },
      { key: 'otherAllowance', label: 'Other Allowance' },
    ];

    allowanceFields.forEach(({ key, label }) => {
      const oldVal = previous[key as keyof typeof previous] || 0;
      const newVal = current[key as keyof typeof current] || 0;
      if (oldVal !== newVal) {
        const diff = Number(newVal) - Number(oldVal);
        const changeType = diff > 0 ? 'increase' : 'decrease';
        const changePercentage = oldVal !== 0 ? Math.abs((diff / oldVal) * 100) : 100;
        changes.push({
          field: key,
          fieldLabel: label,
          oldValue: Number(oldVal),
          newValue: Number(newVal),
          changeType,
          changeAmount: Math.abs(diff),
          changePercentage: parseFloat(changePercentage.toFixed(2))
        });
      }
    });

    if (previousESIPF.esi !== formData.includeESI) {
      changes.push({
        field: 'includeESI',
        fieldLabel: 'ESI',
        oldValue: previousESIPF.esi,
        newValue: formData.includeESI || false,
        changeType: 'toggle'
      });
    }

    if (previousESIPF.pf !== formData.includePF) {
      changes.push({
        field: 'includePF',
        fieldLabel: 'PF',
        oldValue: previousESIPF.pf,
        newValue: formData.includePF || false,
        changeType: 'toggle'
      });
    }

    return changes;
  };

  const createSalaryRevision = async (): Promise<SalaryRevision | null> => {
    if (!isEdit || !currentUser || !isAdmin) return null;
    const changes = detectSalaryChanges();
    if (changes.length === 0) return null;
    const incrementPercentage = previousMonthlySalary !== 0
      ? (((formData.salary?.monthlySalary || 0) - previousMonthlySalary) / previousMonthlySalary) * 100
      : 0;
    const revision: SalaryRevision = {
      id: `REV-${Date.now()}`,
      employeeId: formData.employeeId!,
      employeeName: formData.name!,
      revisionDate: new Date().toISOString().split('T')[0],
      effectiveFrom: new Date().toISOString().split('T')[0],
      changedBy: currentUser.username,
      changedByName: currentUser.name,
      changes,
      reason: revisionReason.trim() || 'Salary revision',
      timestamp: Date.now(),
      previousSalary: previousMonthlySalary,
      newSalary: formData.salary?.monthlySalary || 0,
      incrementPercentage: parseFloat(incrementPercentage.toFixed(2))
    };
    return revision;
  };

  const uploadFile = async (file: File, isImage: boolean): Promise<string> => {
    const url = isImage ? CLOUDINARY_IMAGE_UPLOAD_URL : CLOUDINARY_RAW_UPLOAD_URL;
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    const res = await fetch(url, { method: 'POST', body: form });
    const data = await res.json();
    if (!data.secure_url) throw new Error(data.error?.message || 'Upload failed');
    return data.secure_url;
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: keyof typeof previews
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    setUploading(field as string);
    try {
      const url = await uploadFile(file, isImage);
      setFormData((p) => ({ ...p, [field]: url as any }));
      setPreviews((p) => ({ ...p, [field]: url }));
      setErrors((p) => {
        const { [field]: _, ...rest } = p;
        return rest;
      });
      toast({ title: `${file.name} uploaded successfully` });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message ?? '', variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  const openPreview = (url: string) => {
    if (url.endsWith('.pdf')) {
      window.open(url, '_blank');
    } else {
      setPreviewUrl(url);
      setPreviewOpen(true);
    }
  };

  const downloadFile = (url: string, name: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  };

  const grossSalary = formData.salary?.grossMonthly || 0;
  const isEsiPfApplicable = grossSalary > 0 && grossSalary <= 21500;

  const validateForm = (): boolean => {
    const e: Record<string, string> = {};
    if (!formData.name?.trim()) e.name = 'Name is required';
    if (!validatePhone(formData.phone)) e.phone = '10 digits required';
    if (!validateEmail(formData.email)) e.email = 'Valid email required';
    if (!formData.bloodGroup) e.bloodGroup = 'Select blood group';
    if (!formData.department) e.department = 'Select department';
    if (!formData.role) e.role = 'Select designation';
    if (!formData.joiningDate) e.joiningDate = 'Joining date required';
    if (isAdmin) {
      if (!formData.salary?.monthlySalary || formData.salary.monthlySalary === 0) {
        e.monthlySalary = 'Monthly salary required';
      }
    }
    if (!formData.profilePhoto) e.profilePhoto = 'Profile photo required';
    if (!formData.resumeUrl) e.resumeUrl = 'Resume required';
    if (!formData.aadhaarUrl) e.aadhaarUrl = 'Aadhaar card required';
    if (!formData.panUrl) e.panUrl = 'PAN card required';
    if (!validateAadhaar(formData.aadhaarNumber)) e.aadhaarNumber = 'Aadhaar must be 12 digits';
    if (!validatePAN(formData.panNumber)) e.panNumber = 'Invalid PAN format';
    if (!formData.bankName?.trim()) e.bankName = 'Bank name required';
    if (!formData.bankAccountNo?.trim()) e.bankAccountNo = 'Account number required';
    if (!validateIFSC(formData.bankIfsc)) e.bankIfsc = 'Invalid IFSC code';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const hasErrorsInTab = (tab: string) => {
    const map: Record<string, string[]> = {
      basic: ['name', 'phone', 'email', 'bloodGroup', 'department', 'role', 'joiningDate'],
      personal: ['dob', 'gender'],
      salary: isAdmin ? ['monthlySalary'] : [],
      experience: [],
      documents: ['profilePhoto', 'resumeUrl', 'aadhaarUrl', 'panUrl'],
      bank: ['aadhaarNumber', 'panNumber', 'bankName', 'bankAccountNo', 'bankIfsc'],
      address: [],
      emergency: [],
    };
    return map[tab]?.some((f) => !!errors[f]) || false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      toast({ title: 'Please fix all errors', variant: 'destructive' });
      const first = ['basic', 'personal', 'salary', 'experience', 'documents', 'bank'].find((t) => hasErrorsInTab(t));
      if (first) setActiveTab(first as any);
      return;
    }
    setLoading(true);
    try {
      if (isEdit && id) {
        const revision = await createSalaryRevision();
        const updatedRevisions = revision
          ? [...(salaryRevisions || []), revision]
          : salaryRevisions;
        await updateRecord('hr/employees', id, {
          ...formData,
          salaryRevisions: updatedRevisions,
          updatedAt: Date.now(),
        });
        if (revision) {
          toast({
            title: 'Employee updated with salary revision',
            description: `${revision.changes.length} field(s) changed`
          });
        } else {
          toast({ title: 'Employee updated successfully' });
        }
        navigate('/hr/employees');
      } else {
        const count = (await getAllRecords('hr/employees')).length + 1;
        const empId = `EMP${String(count).padStart(4, '0')}`;
        await createRecord('hr/employees', {
          ...formData,
          employeeId: empId,
          status: 'active',
          salaryRevisions: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        toast({ title: 'Employee created successfully' });
        navigate('/hr/employees');
      }
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setLoading(false);
      setRevisionReason('');
    }
  };

  const addLanguage = () => {
    if (!newLanguage.trim()) return;
    if (formData.languages?.includes(newLanguage.trim())) return;
    setFormData((p) => ({
      ...p,
      languages: [...(p.languages || []), newLanguage.trim()],
    }));
    setNewLanguage('');
  };

  const removeLanguage = (lang: string) => {
    setFormData((p) => ({
      ...p,
      languages: p.languages?.filter((l) => l !== lang),
    }));
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 pb-20">
      {isEdit ? (
        <div className="flex items-center gap-6 mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-200">
          <div className="relative">
            {formData.profilePhoto ? (
              <img
                src={formData.profilePhoto}
                alt={formData.name}
                className="h-32 w-32 rounded-full object-cover ring-4 ring-white shadow-xl"
              />
            ) : (
              <div className="h-32 w-32 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-4xl shadow-xl">
                {formData.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            )}
            <Badge className="absolute bottom-0 right-0" variant="secondary">
              {formData.employeeId}
            </Badge>
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold text-blue-900 flex items-center gap-3">
              {formData.initial} {formData.name}
              {formData.status === 'active' ? (
                <Badge className="ml-3" variant="default">Active</Badge>
              ) : (
                <Badge className="ml-3" variant="destructive">Inactive</Badge>
              )}
            </h1>
            <div className="mt-3 flex flex-wrap gap-4 text-muted-foreground">
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                <span className="font-medium text-foreground">{formData.role}</span>
                <span>at {formData.department}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                <span>Joined {formData.joiningDate}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                <span>{formData.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                <span>{formData.officeType}</span>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/hr/employees')}>
            <ArrowLeft className="h-6 w-6" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/hr/employees')}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <h1 className="text-3xl font-bold text-blue-900">Add New Employee</h1>
          </div>
          {isHR && (
            <Badge variant="outline" className="text-orange-600 border-orange-600">
              <AlertCircle className="h-4 w-4 mr-2" />
              HR Mode: Salary tab not accessible
            </Badge>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-10">
        <Tabs value={activeTab} onValueChange={setActiveTab as any}>
          <TabsList className={isAdmin ? "grid grid-cols-8 w-full" : "grid grid-cols-7 w-full"}>
            <TabsTrigger value="basic" className="relative">
              Basic{hasErrorsInTab('basic') && <Badge variant="destructive" className="absolute -top-2 -right-2 text-xs">!</Badge>}
            </TabsTrigger>
            <TabsTrigger value="personal">Personal</TabsTrigger>
            <TabsTrigger value="address">Address</TabsTrigger>
            <TabsTrigger value="emergency">Emergency</TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="salary" className="relative">
                Salary{hasErrorsInTab('salary') && <Badge variant="destructive" className="absolute -top-2 -right-2 text-xs">!</Badge>}
              </TabsTrigger>
            )}
            <TabsTrigger value="experience">Experience</TabsTrigger>
            <TabsTrigger value="documents" className="relative">
              Documents{hasErrorsInTab('documents') && <Badge variant="destructive" className="absolute -top-2 -right-2 text-xs">!</Badge>}
            </TabsTrigger>
            <TabsTrigger value="bank" className="relative">
              Family & Bank{hasErrorsInTab('bank') && <Badge variant="destructive" className="absolute -top-2 -right-2 text-xs">!</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════════ BASIC TAB ═══════════════════ */}
          <TabsContent value="basic" className="mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <User className="h-6 w-6 text-blue-600" />
                  Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <Label>Initial</Label>
                  <Select value={formData.initial} onValueChange={(v) => setFormData((p) => ({ ...p, initial: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mr">Mr</SelectItem>
                      <SelectItem value="Ms">Ms</SelectItem>
                      <SelectItem value="Mrs">Mrs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-2">
                  <Label>Full Name</Label>
                  <Input value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} />
                  {errors.name && <p className="text-sm text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{errors.name}</p>}
                </div>

                <div>
                  <Label>Phone</Label>
                  <Input value={formData.phone} onChange={(e) => setFormData((p) => ({ ...p, phone: limit(digitsOnly(e.target.value), 10) }))} maxLength={10} />
                  {errors.phone && <p className="text-sm text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{errors.phone}</p>}
                </div>

                <div>
                  <Label>Email</Label>
                  <Input type="email" value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} />
                  {errors.email && <p className="text-sm text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{errors.email}</p>}
                </div>

                <div>
                  <Label>Blood Group</Label>
                  <Select value={formData.bloodGroup || ''} onValueChange={(v) => setFormData((p) => ({ ...p, bloodGroup: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select blood group" /></SelectTrigger>
                    <SelectContent>
                      {bloodGroups.map((bg) => <SelectItem key={bg} value={bg}><Droplet className="h-4 w-4 inline mr-2 text-red-600" />{bg}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {errors.bloodGroup && <p className="text-sm text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{errors.bloodGroup}</p>}
                </div>

                <div>
                  <Label>Department</Label>
                  <Select value={formData.department || ''} onValueChange={(v) => setFormData((p) => ({ ...p, department: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>{departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                  {errors.department && <p className="text-sm text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{errors.department}</p>}
                </div>

                <div>
                  <Label>Designation</Label>
                  <Input value={formData.role} onChange={(e) => setFormData((p) => ({ ...p, role: e.target.value }))} />
                  {errors.role && <p className="text-sm text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{errors.role}</p>}
                </div>

                <div>
                  <Label>Joining Date</Label>
                  <Input type="date" value={formData.joiningDate} onChange={(e) => setFormData((p) => ({ ...p, joiningDate: e.target.value }))} />
                  {errors.joiningDate && <p className="text-sm text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{errors.joiningDate}</p>}
                </div>

                {/* ─── OFFICE LOCATION - FULLY FIXED ─── */}
                <div className="md:col-span-2">
                  <Label className="flex items-center gap-2 mb-2">
                    <Building className="h-4 w-4 text-blue-600" />
                    Office Location
                  </Label>

                  {locationsLoaded && officeLocations.length > 0 ? (
                    <Select
                      value={formData.officeType || officeLocations[0]}
                      onValueChange={v => setFormData(p => ({ ...p, officeType: v as any }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Select office location" /></SelectTrigger>
                      <SelectContent>
                        {officeLocations.map(loc => (
                          <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="h-10 bg-gray-100 rounded-md animate-pulse" />
                  )}

                  <div className="mt-3 border rounded-lg p-3 bg-gray-50 space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Manage Locations</p>

                    <div className="space-y-1">
                      {officeLocations.map(loc => (
                        <div key={loc} className="flex items-center gap-2 bg-white border rounded-md px-2 py-1">
                          {editingLocation === loc ? (
                            <>
                              <Input
                                value={editLocationValue}
                                onChange={e => setEditLocationValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); saveEditLocation(); }
                                  if (e.key === 'Escape') setEditingLocation(null);
                                }}
                                className="h-7 text-sm flex-1"
                                autoFocus
                              />
                              <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={saveEditLocation}>
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-gray-400" onClick={() => setEditingLocation(null)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 text-sm font-medium">{loc}</span>
                              {formData.officeType === loc && (
                                <Badge variant="secondary" className="text-xs px-1 py-0">Selected</Badge>
                              )}
                              <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-blue-500" onClick={() => startEditLocation(loc)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button" size="icon" variant="ghost"
                                className="h-7 w-7 text-red-500 hover:text-red-700"
                                onClick={() => deleteOfficeLocation(loc)}
                                disabled={officeLocations.length <= 1}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Input
                        placeholder="Add new location..."
                        value={newOfficeLocation}
                        onChange={e => setNewOfficeLocation(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOfficeLocation(); } }}
                        className="text-sm h-8"
                      />
                      <Button type="button" size="sm" className="h-8" onClick={addOfficeLocation} disabled={!newOfficeLocation.trim()}>
                        <Plus className="h-4 w-4 mr-1" /> Add
                      </Button>
                    </div>
                  </div>
                </div>
                {/* ─────────────────────────────────────── */}

                <div>
                  <Label>Referred By</Label>
                  <Input value={formData.referredBy} onChange={(e) => setFormData((p) => ({ ...p, referredBy: e.target.value }))} />
                </div>

                <div>
                  <Label>Landline</Label>
                  <Input value={formData.landline} onChange={(e) => setFormData((p) => ({ ...p, landline: digitsOnly(e.target.value) }))} />
                </div>
              </CardContent>
            </Card>

            {isHR && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <CreditCard className="h-6 w-6 text-green-600" />
                    ESI & PF Options
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="include-pf-hr" checked={formData.includePF || false} onCheckedChange={(v) => setFormData((p) => ({ ...p, includePF: !!v }))} />
                    <Label htmlFor="include-pf-hr" className="text-sm font-medium cursor-pointer">Include PF</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="include-esi-hr" checked={formData.includeESI || false} onCheckedChange={(v) => setFormData((p) => ({ ...p, includeESI: !!v }))} />
                    <Label htmlFor="include-esi-hr" className="text-sm font-medium cursor-pointer">Include ESI</Label>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ═══════════════════ PERSONAL TAB ═══════════════════ */}
          <TabsContent value="personal" className="mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <User className="h-6 w-6 text-purple-600" />
                  Personal Details
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <Label>Gender</Label>
                  <Select value={formData.gender || ''} onValueChange={(v) => setFormData((p) => ({ ...p, gender: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date of Birth</Label>
                  <Input type="date" value={formData.dob} onChange={(e) => setFormData((p) => ({ ...p, dob: e.target.value }))} />
                </div>
                <div>
                  <Label>Age (Auto)</Label>
                  <Input value={formData.age || 0} disabled className="bg-gray-100" />
                </div>
                <div>
                  <Label>Religion</Label>
                  <Select value={formData.religion || ''} onValueChange={(v) => setFormData((p) => ({ ...p, religion: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select religion" /></SelectTrigger>
                    <SelectContent>{religions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Marital Status</Label>
                  <Select value={formData.maritalStatus || ''} onValueChange={(v) => setFormData((p) => ({ ...p, maritalStatus: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>{maritalStatusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Globe className="h-5 w-5" />
                  Languages Known
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3 mb-4">
                  <Input placeholder="Add language..." value={newLanguage} onChange={(e) => setNewLanguage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLanguage(); } }} />
                  <Button type="button" onClick={addLanguage} size="sm"><Plus className="h-4 w-4 mr-2" />Add</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.languages?.map((l) => (
                    <Badge key={l} variant="secondary" className="px-3 py-1">
                      {l}
                      <button type="button" onClick={() => removeLanguage(l)} className="ml-2"><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                  {!formData.languages?.length && <p className="text-sm text-muted-foreground">No languages added</p>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════════════ ADDRESS TAB ═══════════════════ */}
          <TabsContent value="address" className="mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <MapPin className="h-6 w-6 text-green-600" />
                  Address Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-8">
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Home className="h-5 w-5" />Permanent Address</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <Label>Address Line</Label>
                      <Input value={formData.permanentAddress?.address || ''} onChange={(e) => setFormData((p) => ({ ...p, permanentAddress: { ...p.permanentAddress!, address: e.target.value } }))} />
                    </div>
                    <div><Label>Area / Locality</Label><Input value={formData.permanentAddress?.area || ''} onChange={(e) => setFormData((p) => ({ ...p, permanentAddress: { ...p.permanentAddress!, area: e.target.value } }))} /></div>
                    <div><Label>District</Label><Input value={formData.permanentAddress?.district || ''} onChange={(e) => setFormData((p) => ({ ...p, permanentAddress: { ...p.permanentAddress!, district: e.target.value } }))} /></div>
                    <div><Label>City</Label><Input value={formData.permanentAddress?.city || ''} onChange={(e) => setFormData((p) => ({ ...p, permanentAddress: { ...p.permanentAddress!, city: e.target.value } }))} /></div>
                    <div><Label>State</Label><Input value={formData.permanentAddress?.state || ''} onChange={(e) => setFormData((p) => ({ ...p, permanentAddress: { ...p.permanentAddress!, state: e.target.value } }))} /></div>
                    <div><Label>Pincode</Label><Input value={formData.permanentAddress?.pincode || ''} onChange={(e) => setFormData((p) => ({ ...p, permanentAddress: { ...p.permanentAddress!, pincode: limit(digitsOnly(e.target.value), 6) } }))} maxLength={6} /></div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="same" checked={sameAsPermanent} onCheckedChange={(v) => setSameAsPermanent(!!v)} />
                  <label htmlFor="same" className="text-sm font-medium cursor-pointer">Present address same as permanent</label>
                </div>
                {!sameAsPermanent && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><MapPin className="h-5 w-5" />Present Address</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2"><Label>Address Line</Label><Input value={formData.presentAddress?.address || ''} onChange={(e) => setFormData((p) => ({ ...p, presentAddress: { ...p.presentAddress!, address: e.target.value } }))} /></div>
                      <div><Label>Area / Locality</Label><Input value={formData.presentAddress?.area || ''} onChange={(e) => setFormData((p) => ({ ...p, presentAddress: { ...p.presentAddress!, area: e.target.value } }))} /></div>
                      <div><Label>District</Label><Input value={formData.presentAddress?.district || ''} onChange={(e) => setFormData((p) => ({ ...p, presentAddress: { ...p.presentAddress!, district: e.target.value } }))} /></div>
                      <div><Label>City</Label><Input value={formData.presentAddress?.city || ''} onChange={(e) => setFormData((p) => ({ ...p, presentAddress: { ...p.presentAddress!, city: e.target.value } }))} /></div>
                      <div><Label>State</Label><Input value={formData.presentAddress?.state || ''} onChange={(e) => setFormData((p) => ({ ...p, presentAddress: { ...p.presentAddress!, state: e.target.value } }))} /></div>
                      <div><Label>Pincode</Label><Input value={formData.presentAddress?.pincode || ''} onChange={(e) => setFormData((p) => ({ ...p, presentAddress: { ...p.presentAddress!, pincode: limit(digitsOnly(e.target.value), 6) } }))} maxLength={6} /></div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════════════ EMERGENCY TAB ═══════════════════ */}
          <TabsContent value="emergency" className="mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <AlertCircle className="h-6 w-6 text-red-600" />
                  Emergency Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label>Contact Name</Label>
                  <Input value={formData.emergencyContact?.name || ''} onChange={(e) => setFormData((p) => ({ ...p, emergencyContact: { ...p.emergencyContact!, name: e.target.value } }))} />
                </div>
                <div>
                  <Label>Relationship</Label>
                  <Input value={formData.emergencyContact?.relationship || ''} onChange={(e) => setFormData((p) => ({ ...p, emergencyContact: { ...p.emergencyContact!, relationship: e.target.value } }))} />
                </div>
                <div>
                  <Label>Phone Number</Label>
                  <Input value={formData.emergencyContact?.phone || ''} onChange={(e) => setFormData((p) => ({ ...p, emergencyContact: { ...p.emergencyContact!, phone: limit(digitsOnly(e.target.value), 10) } }))} maxLength={10} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════════════ SALARY TAB (admin only) ═══════════════════ */}
          {isAdmin && (
            <TabsContent value="salary" className="mt-8 space-y-8">
              {isEdit && salaryRevisions.length > 0 && (
                <div className="flex justify-end">
                  <Button type="button" variant="outline" onClick={() => setShowRevisionHistory(true)} className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-300">
                    <History className="h-4 w-4 mr-2" />
                    View Salary History ({salaryRevisions.length} revisions)
                  </Button>
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <IndianRupee className="h-6 w-6 text-green-600" />
                    Salary Structure (Monthly)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                      <Label className="font-bold text-lg">Monthly Salary *</Label>
                      <Input
                        type="number"
                        value={formData.salary?.monthlySalary || ''}
                        onChange={(e) => setFormData((p) => ({ ...p, salary: { ...p.salary!, monthlySalary: Number(e.target.value) || 0 } }))}
                        className="text-2xl font-bold text-blue-600"
                      />
                      {errors.monthlySalary && <p className="text-sm text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{errors.monthlySalary}</p>}
                    </div>
                    <div>
                      <Label>Basic (50%)</Label>
                      <Input type="number" value={formData.salary?.basic || ''} disabled className="bg-green-50 font-medium" />
                    </div>
                    <div>
                      <Label>HRA (25%)</Label>
                      <Input type="number" value={formData.salary?.hra || ''} disabled className="bg-blue-50 font-medium" />
                    </div>
                    <div>
                      <Label>Conveyance</Label>
                      <Input type="number" value={formData.salary?.conveyance || ''} onChange={(e) => setFormData((p) => ({ ...p, salary: { ...p.salary!, conveyance: Number(e.target.value) || 0 } }))} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                      <Label>Special Allowance</Label>
                      <Input type="number" value={formData.salary?.additionalSpecialAllowance || ''} onChange={(e) => setFormData((p) => ({ ...p, salary: { ...p.salary!, additionalSpecialAllowance: Number(e.target.value) || 0 } }))} />
                    </div>
                    <div>
                      <Label>Other Allowances (Auto)</Label>
                      <Input type="number" value={formData.salary?.otherAllowance || ''} disabled className="bg-gray-100" />
                    </div>
                    <div className="flex items-center space-x-2 pt-8">
                      <Checkbox id="pf-admin" checked={formData.includePF || false} onCheckedChange={(v) => setFormData((p) => ({ ...p, includePF: !!v }))} />
                      <Label htmlFor="pf-admin" className="text-sm font-medium cursor-pointer">Include PF</Label>
                    </div>
                    <div className="flex items-center space-x-2 pt-8">
                      <Checkbox id="esi-admin" checked={formData.includeESI || false} onCheckedChange={(v) => setFormData((p) => ({ ...p, includeESI: !!v }))} />
                      <Label htmlFor="esi-admin" className="text-sm font-medium cursor-pointer">Include ESI</Label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-green-50 p-6 rounded-2xl text-center border border-green-200">
                      <p className="text-sm text-muted-foreground mb-2">Gross Monthly</p>
                      <p className="text-4xl font-bold text-green-600">₹{grossSalary.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="bg-blue-50 p-6 rounded-2xl text-center border border-blue-200">
                      <p className="text-sm text-muted-foreground mb-2">Annual CTC</p>
                      <p className="text-4xl font-bold text-blue-600">{((grossSalary * 12) / 100000).toFixed(2)} LPA</p>
                    </div>
                    <div className="bg-purple-50 p-6 rounded-2xl text-center border border-purple-200">
                      <p className="text-sm text-muted-foreground mb-2">ESI/PF Status</p>
                      <p className={`text-3xl font-bold ${isEsiPfApplicable ? 'text-green-600' : 'text-red-600'}`}>
                        {isEsiPfApplicable ? 'Applicable' : 'Not Applicable'}
                      </p>
                    </div>
                  </div>

                  {isEdit && detectSalaryChanges().length > 0 && (
                    <Card className="bg-gradient-to-r from-orange-50 to-red-50 border-orange-200">
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Edit3 className="h-5 w-5 text-orange-600" />
                          Salary Revision Detected
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <Alert className="bg-white/50">
                          <AlertCircle className="h-4 w-4 text-orange-600" />
                          <AlertDescription>
                            {detectSalaryChanges().length} field(s) will be updated. Please provide a reason for this revision.
                          </AlertDescription>
                        </Alert>
                        <div>
                          <Label htmlFor="revision-reason">Revision Reason *</Label>
                          <Textarea
                            id="revision-reason"
                            placeholder="E.g., Annual increment, Performance bonus, Promotion, Market adjustment..."
                            value={revisionReason}
                            onChange={(e) => setRevisionReason(e.target.value)}
                            rows={3}
                            className="bg-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm">Changes Preview:</h4>
                          <div className="grid grid-cols-2 gap-2">
                            {detectSalaryChanges().map((change, idx) => (
                              <div key={idx} className="bg-white p-3 rounded-lg border">
                                <p className="text-xs font-semibold">{change.fieldLabel}</p>
                                {change.changeType === 'toggle' ? (
                                  <p className="text-sm">{change.oldValue ? 'Yes' : 'No'} → {change.newValue ? 'Yes' : 'No'}</p>
                                ) : (
                                  <p className="text-sm">
                                    ₹{(change.oldValue as number).toLocaleString()} → ₹{(change.newValue as number).toLocaleString()}
                                    <Badge variant="secondary" className="ml-2">
                                      {change.changeType === 'increase' ? '+' : '-'}{change.changePercentage?.toFixed(1)}%
                                    </Badge>
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ═══════════════════ EXPERIENCE TAB ═══════════════════ */}
          <TabsContent value="experience" className="mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Award className="h-6 w-6 text-orange-600" />
                  Work Experience
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label>Years of Experience</Label>
                  <Input type="number" value={formData.experienceYears || ''} onChange={(e) => setFormData((p) => ({ ...p, experienceYears: Number(e.target.value) || 0 }))} />
                </div>
                <div>
                  <Label>Previous Company</Label>
                  <Input value={formData.previousCompany || ''} onChange={(e) => setFormData((p) => ({ ...p, previousCompany: e.target.value }))} />
                </div>
                <div>
                  <Label>Previous Role</Label>
                  <Input value={formData.previousRole || ''} onChange={(e) => setFormData((p) => ({ ...p, previousRole: e.target.value }))} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════════════ DOCUMENTS TAB ═══════════════════ */}
          <TabsContent value="documents" className="mt-8 space-y-12">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <User className="h-6 w-6 text-indigo-600" />
                  Personal Documents
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {(['profilePhoto', 'resumeUrl', 'aadhaarUrl', 'panUrl', 'bankStatementUrl'] as const).map((f) => (
                  <div key={f} className="space-y-3">
                    <Label>
                      {f === 'profilePhoto' ? 'Profile Photo' :
                       f === 'resumeUrl' ? 'Resume (PDF)' :
                       f === 'aadhaarUrl' ? 'Aadhaar Card' :
                       f === 'panUrl' ? 'PAN Card' : 'Bank Statement'}
                    </Label>
                    <Input
                      type="file"
                      accept={f === 'resumeUrl' || f === 'bankStatementUrl' ? '.pdf' : 'image/*,.pdf'}
                      onChange={(e) => handleFileChange(e, f as keyof typeof previews)}
                      disabled={uploading === f}
                    />
                    {previews[f] && (
                      <div className="relative group rounded-xl overflow-hidden border-2 border-dashed border-gray-300 bg-gray-50 aspect-square">
                        {previews[f].endsWith('.pdf') ? (
                          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                            <FileText className="h-16 w-16 text-red-600 mb-3" />
                            <p className="font-medium">PDF Document</p>
                            <div className="flex gap-2 mt-4">
                              <Button size="sm" variant="secondary" type="button" onClick={() => openPreview(previews[f])}><Eye className="h-4 w-4 mr-1" />View</Button>
                              <Button size="sm" type="button" onClick={() => downloadFile(previews[f], `${f}.pdf`)}><Download className="h-4 w-4 mr-1" />Download</Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <img src={previews[f]} alt="preview" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-4">
                              <Button size="sm" variant="secondary" type="button" onClick={() => openPreview(previews[f])}><Eye className="h-5 w-5" /></Button>
                              <Button size="sm" type="button" onClick={() => downloadFile(previews[f], `${f}.jpg`)}><Download className="h-5 w-5" /></Button>
                            </div>
                          </>
                        )}
                        <Button
                          size="icon" type="button" variant="destructive"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"
                          onClick={() => {
                            setFormData((p) => ({ ...p, [f]: '' as any }));
                            setPreviews((p) => ({ ...p, [f]: '' }));
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {errors[f] && <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{errors[f]}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <GraduationCap className="h-6 w-6 text-green-600" />
                  Educational Certificates
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {(['tenthCertificateUrl', 'twelfthCertificateUrl', 'graduationCertificateUrl', 'postGraduationCertificateUrl'] as const).map((f) => (
                  <div key={f} className="space-y-3">
                    <Label>
                      {f.includes('tenth') ? '10th' :
                       f.includes('twelfth') ? '12th' :
                       f.includes('postGraduation') ? 'Post Graduation' : 'Graduation'}
                    </Label>
                    <Input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => handleFileChange(e, f as keyof typeof previews)}
                      disabled={uploading === f}
                    />
                    {previews[f] && (
                      <div className="relative group rounded-xl overflow-hidden border-2 border-dashed border-gray-300 bg-gray-50 aspect-square">
                        {previews[f].endsWith('.pdf') ? (
                          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                            <FileText className="h-16 w-16 text-red-600 mb-3" />
                            <p>PDF</p>
                            <div className="flex gap-2 mt-4">
                              <Button size="sm" variant="secondary" type="button" onClick={() => openPreview(previews[f])}><Eye className="h-4 w-4 mr-1" />View</Button>
                              <Button size="sm" type="button" onClick={() => downloadFile(previews[f], `${f}.pdf`)}><Download className="h-4 w-4 mr-1" />Download</Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <img src={previews[f]} alt="" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-4">
                              <Button size="sm" variant="secondary" type="button" onClick={() => openPreview(previews[f])}><Eye className="h-5 w-5" /></Button>
                              <Button size="sm" type="button" onClick={() => downloadFile(previews[f], `${f}.jpg`)}><Download className="h-5 w-5" /></Button>
                            </div>
                          </>
                        )}
                        <Button
                          size="icon" type="button" variant="destructive"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"
                          onClick={() => {
                            setFormData((p) => ({ ...p, [f]: '' as any }));
                            setPreviews((p) => ({ ...p, [f]: '' }));
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════════════ FAMILY & BANK TAB ═══════════════════ */}
          <TabsContent value="bank" className="mt-8 space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <User className="h-6 w-6 text-indigo-600" />
                  Family Details
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Father's Name</Label>
                  <Input value={formData.fatherName || ''} onChange={(e) => setFormData((p) => ({ ...p, fatherName: e.target.value }))} />
                </div>
                <div>
                  <Label>Father's Phone</Label>
                  <Input value={formData.fatherPhone || ''} onChange={(e) => setFormData((p) => ({ ...p, fatherPhone: limit(digitsOnly(e.target.value), 10) }))} maxLength={10} />
                </div>
                <div>
                  <Label>Mother's Name</Label>
                  <Input value={formData.motherName || ''} onChange={(e) => setFormData((p) => ({ ...p, motherName: e.target.value }))} />
                </div>
                <div>
                  <Label>Mother's Phone</Label>
                  <Input value={formData.motherPhone || ''} onChange={(e) => setFormData((p) => ({ ...p, motherPhone: limit(digitsOnly(e.target.value), 10) }))} maxLength={10} />
                </div>
                <div>
                  <Label>Spouse Name</Label>
                  <Input value={formData.spouseName || ''} onChange={(e) => setFormData((p) => ({ ...p, spouseName: e.target.value }))} />
                </div>
                <div>
                  <Label>Spouse Phone</Label>
                  <Input value={formData.spousePhone || ''} onChange={(e) => setFormData((p) => ({ ...p, spousePhone: limit(digitsOnly(e.target.value), 10) }))} maxLength={10} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <CreditCard className="h-6 w-6 text-green-600" />
                  Bank & Government IDs
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Aadhaar Number</Label>
                  <Input value={formData.aadhaarNumber || ''} onChange={(e) => setFormData((p) => ({ ...p, aadhaarNumber: limit(digitsOnly(e.target.value), 12) }))} maxLength={12} />
                  {errors.aadhaarNumber && <p className="text-sm text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{errors.aadhaarNumber}</p>}
                </div>
                <div>
                  <Label>PAN Number</Label>
                  <Input value={formData.panNumber || ''} onChange={(e) => setFormData((p) => ({ ...p, panNumber: toUpper(e.target.value) }))} maxLength={10} />
                  {errors.panNumber && <p className="text-sm text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{errors.panNumber}</p>}
                </div>
                <div>
                  <Label>ESI Number</Label>
                  <Input value={formData.esiNumber || ''} onChange={(e) => setFormData((p) => ({ ...p, esiNumber: e.target.value }))} />
                </div>
                <div>
                  <Label>PF Number</Label>
                  <Input value={formData.pfNumber || ''} onChange={(e) => setFormData((p) => ({ ...p, pfNumber: e.target.value }))} />
                </div>
                <div>
                  <Label>Bank Name</Label>
                  <Input value={formData.bankName || ''} onChange={(e) => setFormData((p) => ({ ...p, bankName: e.target.value }))} />
                  {errors.bankName && <p className="text-sm text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{errors.bankName}</p>}
                </div>
                <div>
                  <Label>Account Number</Label>
                  <Input value={formData.bankAccountNo || ''} onChange={(e) => setFormData((p) => ({ ...p, bankAccountNo: e.target.value }))} />
                  {errors.bankAccountNo && <p className="text-sm text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{errors.bankAccountNo}</p>}
                </div>
                <div>
                  <Label>IFSC Code</Label>
                  <Input value={formData.bankIfsc || ''} onChange={(e) => setFormData((p) => ({ ...p, bankIfsc: toUpper(e.target.value) }))} maxLength={11} />
                  {errors.bankIfsc && <p className="text-sm text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{errors.bankIfsc}</p>}
                </div>
                <div>
                  <Label>Branch Name</Label>
                  <Input value={formData.bankBranch || ''} onChange={(e) => setFormData((p) => ({ ...p, bankBranch: e.target.value }))} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

        <div className="flex justify-end gap-4 pt-10 border-t">
          <Button type="button" variant="outline" size="lg" onClick={() => navigate('/hr/employees')} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={loading || !!uploading}
            className="min-w-64 bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-800 hover:to-blue-700"
          >
            {loading ? 'Saving Employee...' : isEdit ? 'Update Employee' : 'Create Employee'}
          </Button>
        </div>
      </form>

      {/* Image Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <img src={previewUrl} alt="Preview" className="w-full h-auto" />
        </DialogContent>
      </Dialog>

      {/* Salary Revision History Dialog */}
      <Dialog open={showRevisionHistory} onOpenChange={setShowRevisionHistory}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-2xl">
              <History className="h-7 w-7 text-purple-600" />
              Salary Revision History - {formData.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-6">
            {salaryRevisions.length === 0 ? (
              <div className="text-center py-12">
                <History className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">No salary revisions yet</p>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-200 via-blue-300 to-blue-200" />
                <div className="space-y-6">
                  {[...salaryRevisions].reverse().map((revision, index) => (
                    <Card
                      key={revision.id}
                      className={`ml-16 border-2 transition-all hover:shadow-lg ${
                        index === 0 ? 'border-green-300 bg-gradient-to-r from-green-50 to-emerald-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`absolute left-6 w-5 h-5 rounded-full border-4 ${index === 0 ? 'bg-green-500 border-green-200 animate-pulse' : 'bg-blue-400 border-blue-200'}`} />
                            <div>
                              <div className="flex items-center gap-3">
                                <h3 className="text-lg font-bold">Revision #{salaryRevisions.length - index}</h3>
                                {index === 0 && (
                                  <Badge className="bg-green-500">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />Current
                                  </Badge>
                                )}
                                <Badge variant={revision.incrementPercentage > 0 ? 'default' : 'destructive'}>
                                  {revision.incrementPercentage > 0 ? '+' : ''}{revision.incrementPercentage.toFixed(2)}%
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1"><Calendar className="h-4 w-4" /><span>Effective: {revision.effectiveFrom}</span></div>
                                <div className="flex items-center gap-1"><User className="h-4 w-4" /><span>By: {revision.changedByName}</span></div>
                                <div className="flex items-center gap-1"><Clock className="h-4 w-4" /><span>{new Date(revision.timestamp).toLocaleString()}</span></div>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Salary Change</p>
                            <p className="text-2xl font-bold">
                              <span className="text-gray-500 text-base">₹{revision.previousSalary.toLocaleString('en-IN')}</span>
                              <span className="mx-2">→</span>
                              <span className="text-green-600">₹{revision.newSalary.toLocaleString('en-IN')}</span>
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {revision.reason && (
                          <div className="bg-white/50 p-3 rounded-lg border border-gray-200">
                            <p className="text-sm font-medium text-gray-700"><span className="font-bold">Reason: </span>{revision.reason}</p>
                          </div>
                        )}
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm text-gray-700">Changes Made:</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {revision.changes.map((change, changeIdx) => (
                              <div
                                key={changeIdx}
                                className={`p-4 rounded-xl border-2 ${
                                  change.changeType === 'increase' ? 'bg-green-50 border-green-200' :
                                  change.changeType === 'decrease' ? 'bg-red-50 border-red-200' :
                                  'bg-blue-50 border-blue-200'
                                }`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <p className="font-semibold text-sm mb-2">{change.fieldLabel}</p>
                                    {change.changeType === 'toggle' ? (
                                      <div className="flex items-center gap-2 text-sm">
                                        <Badge variant="outline" className="bg-white">{change.oldValue ? 'Yes' : 'No'}</Badge>
                                        <span>→</span>
                                        <Badge variant="outline" className="bg-white">{change.newValue ? 'Yes' : 'No'}</Badge>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="flex items-center gap-2 text-sm mb-2">
                                          <span className="text-gray-600">₹{(change.oldValue as number).toLocaleString('en-IN')}</span>
                                          <span>→</span>
                                          <span className="font-bold">₹{(change.newValue as number).toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <Badge
                                            variant="secondary"
                                            className={change.changeType === 'increase' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}
                                          >
                                            {change.changeType === 'increase' ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                                            ₹{change.changeAmount?.toLocaleString('en-IN')}
                                          </Badge>
                                          <Badge variant="outline" className="bg-white">{change.changePercentage?.toFixed(2)}%</Badge>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                  <div>
                                    {change.changeType === 'increase' ? (
                                      <div className="bg-green-500 p-2 rounded-full"><TrendingUp className="h-5 w-5 text-white" /></div>
                                    ) : change.changeType === 'decrease' ? (
                                      <div className="bg-red-500 p-2 rounded-full"><TrendingDown className="h-5 w-5 text-white" /></div>
                                    ) : (
                                      <div className="bg-blue-500 p-2 rounded-full"><CheckCircle2 className="h-5 w-5 text-white" /></div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}