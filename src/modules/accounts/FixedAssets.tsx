// src/modules/accounts/FixedAssets.tsx
// Fixed Assets Register & Depreciation Execution Management:
// - Asset Register with categories, acquisition costs, useful lives, and GL accounts
// - Straight-Line and Written Down Value (WDV) depreciation calculation
// - Run Depreciation with period selection, live preview, duplicate protection, and balanced GL posting
// - Audit history of depreciation runs and drill-down asset inspection

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Building2, Plus, Play, RotateCcw, Calendar, ShieldCheck,
  AlertCircle, CheckCircle2, Eye, FileSpreadsheet, Search, Filter,
  Calculator, ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useOrgSettings } from '@/context/OrgSettingsContext';
import { formatCurrency } from '@/lib/countryConfig';
import {
  getFixedAssets,
  createFixedAsset,
  getDepreciationRuns,
  runPeriodDepreciation,
  calculateAssetPeriodDepreciation,
} from '@/services/fixedAssetService';
import type {
  FixedAsset,
  FixedAssetCategory,
  DepreciationMethod,
  DepreciationRun,
} from '@/types/accounts';

const CATEGORIES: FixedAssetCategory[] = [
  'Plant & Machinery',
  'Office Equipment',
  'Vehicles',
  'Furniture & Fixtures',
  'Building',
  'Other',
];

const METHODS: DepreciationMethod[] = ['Straight-Line', 'WDV'];

const emptyAssetForm = () => ({
  name: '',
  category: CATEGORIES[0] as FixedAssetCategory,
  purchaseDate: format(new Date(), 'yyyy-MM-dd'),
  purchaseCost: '',
  salvageValue: '0',
  usefulLifeYears: '5',
  depreciationMethod: 'Straight-Line' as DepreciationMethod,
  depreciationRatePercent: '',
  glAssetAccount: '1500',
  glDepreciationAccount: '5500',
  glAccumulatedDepAccount: '1510',
  vendorBillRef: '',
  location: '',
  notes: '',
});

export default function FixedAssets() {
  const { country } = useOrgSettings();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [runs, setRuns] = useState<DepreciationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Add Asset Dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyAssetForm());
  const [isSaving, setIsSaving] = useState(false);

  // Run Depreciation Dialog
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runPeriod, setRunPeriod] = useState(format(new Date(), 'yyyy-MM'));
  const [runDate, setRunDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isExecutingRun, setIsExecutingRun] = useState(false);

  // View Asset Dialog
  const [selectedAsset, setSelectedAsset] = useState<FixedAsset | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [aData, rData] = await Promise.all([getFixedAssets(), getDepreciationRuns()]);
      setAssets(aData);
      setRuns(rData);
    } catch (err) {
      console.error('Error loading fixed assets:', err);
      toast.error('Failed to load fixed assets data.');
    } finally {
      setLoading(false);
    }
  };

  // Metric computations
  const totalCost = assets.reduce((s, a) => s + (a.purchaseCost || 0), 0);
  const totalAccumDep = assets.reduce((s, a) => s + (a.accumulatedDepreciation || 0), 0);
  const totalNetBookValue = assets.reduce((s, a) => s + (a.netBookValue || 0), 0);
  const activeCount = assets.filter((a) => a.status === 'Active').length;

  const filteredAssets = assets.filter((a) => {
    if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.assetNumber.toLowerCase().includes(q) ||
        (a.location || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Asset name is required.');
      return;
    }
    const cost = Number(form.purchaseCost);
    if (!cost || cost <= 0) {
      toast.error('Please enter a valid purchase cost.');
      return;
    }

    setIsSaving(true);
    try {
      await createFixedAsset({
        name: form.name,
        category: form.category,
        purchaseDate: form.purchaseDate,
        purchaseCost: cost,
        salvageValue: Number(form.salvageValue) || 0,
        usefulLifeYears: Number(form.usefulLifeYears) || 5,
        depreciationMethod: form.depreciationMethod,
        depreciationRatePercent: form.depreciationRatePercent ? Number(form.depreciationRatePercent) : undefined,
        glAssetAccount: form.glAssetAccount,
        glDepreciationAccount: form.glDepreciationAccount,
        glAccumulatedDepAccount: form.glAccumulatedDepAccount,
        vendorBillRef: form.vendorBillRef,
        location: form.location,
        notes: form.notes,
      });

      toast.success(`Fixed asset "${form.name}" created successfully.`);
      setAddDialogOpen(false);
      setForm(emptyAssetForm());
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create asset.');
    } finally {
      setIsSaving(false);
    }
  };

  // Preview eligible assets for depreciation run
  const eligiblePreview = assets.filter(
    (a) => a.status === 'Active' && a.netBookValue > a.salvageValue,
  );
  const previewTotalDep = eligiblePreview.reduce(
    (s, a) => s + calculateAssetPeriodDepreciation(a, 'monthly'),
    0,
  );

  const handleExecuteDepreciation = async () => {
    if (!runPeriod) {
      toast.error('Please specify a valid period (YYYY-MM).');
      return;
    }

    setIsExecutingRun(true);
    try {
      const run = await runPeriodDepreciation({
        period: runPeriod,
        runDate,
      });

      toast.success(
        `Depreciation posted successfully for ${run.period}! Total: ${formatCurrency(run.totalDepreciation, country)} across ${run.assetCount} assets.`,
      );
      setRunDialogOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to run depreciation.');
    } finally {
      setIsExecutingRun(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
              <Building2 className="h-3.5 w-3.5 text-blue-600" /> Gross Fixed Assets
            </p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {formatCurrency(totalCost, country)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{assets.length} total registered</p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
              <RotateCcw className="h-3.5 w-3.5 text-orange-600" /> Accumulated Depreciation
            </p>
            <p className="text-2xl font-bold text-orange-600 mt-1">
              {formatCurrency(totalAccumDep, country)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Contra Account 1510</p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-green-50/40 to-transparent">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1 font-medium text-green-800">
              <ShieldCheck className="h-3.5 w-3.5 text-green-600" /> Net Book Value (NBV)
            </p>
            <p className="text-2xl font-bold text-green-700 mt-1">
              {formatCurrency(totalNetBookValue, country)}
            </p>
            <p className="text-[11px] text-green-700/80 mt-0.5">Carrying asset value</p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" /> Active Assets
            </p>
            <p className="text-2xl font-bold text-foreground mt-1">{activeCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Depreciating monthly</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="register">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <TabsList className="bg-muted/70 p-1">
            <TabsTrigger value="register" className="text-xs">
              <Building2 className="h-3.5 w-3.5 mr-1.5" /> Asset Register ({assets.length})
            </TabsTrigger>
            <TabsTrigger value="runs" className="text-xs">
              <Play className="h-3.5 w-3.5 mr-1.5" /> Depreciation Runs ({runs.length})
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRunDialogOpen(true)}
              className="text-xs font-semibold border-primary/30 text-primary hover:bg-primary/5"
            >
              <Play className="h-3.5 w-3.5 mr-1.5 fill-primary/20" /> Run Depreciation
            </Button>
            <Button size="sm" onClick={() => setAddDialogOpen(true)} className="text-xs font-semibold">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Asset
            </Button>
          </div>
        </div>

        {/* TAB 1: ASSET REGISTER */}
        <TabsContent value="register" className="mt-4 space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 max-w-sm">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search assets by code, name, location..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-8 text-xs w-[160px]">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 text-xs">
                    <TableHead>Asset No</TableHead>
                    <TableHead>Name &amp; Category</TableHead>
                    <TableHead>Purchase Date</TableHead>
                    <TableHead className="text-right">Purchase Cost</TableHead>
                    <TableHead>Method &amp; Life</TableHead>
                    <TableHead className="text-right">Accum. Dep.</TableHead>
                    <TableHead className="text-right font-semibold">Net Book Value</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-10 text-muted-foreground text-xs">
                        No fixed assets found. Click &quot;Add Asset&quot; to register plant, machinery, or equipment.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAssets.map((asset) => (
                      <TableRow key={asset.id} className="text-xs hover:bg-muted/30">
                        <TableCell className="font-mono font-medium text-primary">
                          {asset.assetNumber}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">{asset.name}</div>
                          <div className="text-[11px] text-muted-foreground">{asset.category}</div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{asset.purchaseDate}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(asset.purchaseCost, country)}
                        </TableCell>
                        <TableCell>
                          <div>{asset.depreciationMethod}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {asset.usefulLifeYears} yrs ({asset.depreciationRatePercent}%)
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-orange-600 font-medium">
                          {formatCurrency(asset.accumulatedDepreciation, country)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-green-700">
                          {formatCurrency(asset.netBookValue, country)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="secondary"
                            className={
                              asset.status === 'Active'
                                ? 'bg-green-100 text-green-800 text-[10px]'
                                : 'bg-gray-100 text-gray-700 text-[10px]'
                            }
                          >
                            {asset.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setSelectedAsset(asset)}
                          >
                            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: DEPRECIATION RUNS HISTORY */}
        <TabsContent value="runs" className="mt-4 space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold">Executed Depreciation Runs</CardTitle>
              <p className="text-xs text-muted-foreground">
                History of closed depreciation periods with balanced GL journal vouchers posted to 5500 / 1510.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 text-xs">
                    <TableHead>Run No</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Run Date</TableHead>
                    <TableHead className="text-center">Asset Count</TableHead>
                    <TableHead className="text-right font-semibold">Total Depreciation</TableHead>
                    <TableHead>Voucher Ref</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-xs">
                        No depreciation runs recorded yet. Click &quot;Run Depreciation&quot; to post monthly depreciation.
                      </TableCell>
                    </TableRow>
                  ) : (
                    runs.map((r) => (
                      <TableRow key={r.id} className="text-xs hover:bg-muted/30">
                        <TableCell className="font-mono font-medium">{r.runNumber}</TableCell>
                        <TableCell className="font-semibold text-primary">{r.period}</TableCell>
                        <TableCell className="text-muted-foreground">{r.runDate}</TableCell>
                        <TableCell className="text-center">{r.assetCount} assets</TableCell>
                        <TableCell className="text-right font-bold text-orange-600">
                          {formatCurrency(r.totalDepreciation, country)}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {r.voucherNumber || 'Posted'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-green-100 text-green-800 text-[10px]">
                            {r.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DIALOG 1: ADD ASSET */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> Register New Fixed Asset
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateAsset} className="space-y-4 pt-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Asset Name *</Label>
                <Input
                  required
                  placeholder="e.g. Hydraulic Rubber Moulding Press 200T"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(val: FixedAssetCategory) => setForm({ ...form, category: val })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Acquisition Date</Label>
                <Input
                  type="date"
                  required
                  value={form.purchaseDate}
                  onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Purchase Cost (₹) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  placeholder="e.g. 850000"
                  value={form.purchaseCost}
                  onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Salvage / Scrap Value (₹)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 50000"
                  value={form.salvageValue}
                  onChange={(e) => setForm({ ...form, salvageValue: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Depreciation Method</Label>
                <Select
                  value={form.depreciationMethod}
                  onValueChange={(val: DepreciationMethod) =>
                    setForm({ ...form, depreciationMethod: val })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Useful Life (Years)</Label>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  required
                  value={form.usefulLifeYears}
                  onChange={(e) => setForm({ ...form, usefulLifeYears: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Location / Department</Label>
                <Input
                  placeholder="e.g. Shop Floor Bay 3"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Vendor Bill / PO Ref</Label>
                <Input
                  placeholder="e.g. BILL-2026-0042"
                  value={form.vendorBillRef}
                  onChange={(e) => setForm({ ...form, vendorBillRef: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1 col-span-2">
                <Label className="text-xs">GL Mapping</Label>
                <div className="grid grid-cols-3 gap-2 bg-muted/30 p-2 rounded border text-[11px]">
                  <div>Asset: <span className="font-mono font-bold">1500</span> Fixed Assets</div>
                  <div>Accum: <span className="font-mono font-bold">1510</span> Accum. Dep.</div>
                  <div>Expense: <span className="font-mono font-bold">5500</span> Dep. Expense</div>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddDialogOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSaving}>
                {isSaving ? 'Registering...' : 'Register Asset'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: RUN DEPRECIATION */}
      <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Play className="h-4 w-4 text-primary" /> Execute Period Depreciation Run
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2 text-xs">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="font-semibold text-xs">Duplicate Period Protection Active</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  The system will automatically prevent running depreciation twice for the same period.
                  Upon execution, a balanced GL voucher will be posted to Dr 5500 / Cr 1510.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Period (YYYY-MM) *</Label>
                <Input
                  placeholder="2026-06"
                  value={runPeriod}
                  onChange={(e) => setRunPeriod(e.target.value)}
                  className="h-8 text-xs font-mono font-semibold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Voucher Posting Date *</Label>
                <Input
                  type="date"
                  value={runDate}
                  onChange={(e) => setRunDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Live Calculation Preview */}
            <div className="bg-muted/40 p-3 rounded-lg border space-y-2">
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground">Eligible Assets:</span>
                <span>{eligiblePreview.length} active assets</span>
              </div>
              <div className="flex justify-between font-bold text-sm">
                <span>Calculated Monthly Depreciation:</span>
                <span className="text-orange-600">{formatCurrency(previewTotalDep, country)}</span>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRunDialogOpen(false)}
                disabled={isExecutingRun}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleExecuteDepreciation}
                disabled={isExecutingRun || previewTotalDep <= 0}
                className="bg-primary hover:bg-primary/90"
              >
                {isExecutingRun ? 'Executing Run & Posting...' : 'Post Depreciation Run'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: VIEW ASSET DETAILS */}
      {selectedAsset && (
        <Dialog open={Boolean(selectedAsset)} onOpenChange={() => setSelectedAsset(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" /> {selectedAsset.name} ({selectedAsset.assetNumber})
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-muted/30 p-3 rounded border">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Category</span>
                  <span className="font-semibold">{selectedAsset.category}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Purchase Date</span>
                  <span className="font-semibold">{selectedAsset.purchaseDate}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Purchase Cost</span>
                  <span className="font-bold">{formatCurrency(selectedAsset.purchaseCost, country)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Salvage Value</span>
                  <span className="font-semibold">{formatCurrency(selectedAsset.salvageValue, country)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Accumulated Depreciation</span>
                  <span className="font-bold text-orange-600">
                    {formatCurrency(selectedAsset.accumulatedDepreciation, country)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Net Book Value</span>
                  <span className="font-bold text-green-700">
                    {formatCurrency(selectedAsset.netBookValue, country)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Method &amp; Rate</span>
                  <span>{selectedAsset.depreciationMethod} ({selectedAsset.depreciationRatePercent}%)</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Location</span>
                  <span>{selectedAsset.location || 'N/A'}</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" variant="outline" onClick={() => setSelectedAsset(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

