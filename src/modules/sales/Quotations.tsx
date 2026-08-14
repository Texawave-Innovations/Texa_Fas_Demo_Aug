// modules/sales/Quotations.tsx
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Edit, Download, Trash2, Search, X, Filter, Calendar, Eye, ChevronDown } from 'lucide-react';
import { RowActions } from '@/components/ui/row-actions';
import { toast } from 'sonner';
import { getAllRecords, updateRecord, deleteRecord } from '@/services/firebase';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import html2pdf from 'html2pdf.js';
import QuotationPrintTemplate from '@/components/QuotationPrintTemplate';

// Currency symbols map
const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'د.إ',
};

// Generate year options (last 5 years + next year)
const generateYearOptions = () => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear - 5; y <= currentYear + 1; y++) {
    years.push(y);
  }
  return years.sort((a, b) => b - a);
};

// Generate month options
const monthOptions = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

export default function Quotations() {
  const [quotations, setQuotations] = useState<any[]>([]);
  const [filteredQuotations, setFilteredQuotations] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Date filters
  const [filterType, setFilterType] = useState<'all' | 'date' | 'month' | 'year'>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Preview dialog
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewQuotation, setPreviewQuotation] = useState<any>(null);
  
  // Ref for PDF generation
  const printRef = useRef<HTMLDivElement>(null);
  
  const navigate = useNavigate();
  const yearOptions = generateYearOptions();

  useEffect(() => {
    loadQuotations();
  }, []);

  // Filter quotations based on all filters
  useEffect(() => {
    let result = quotations;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((q) => {
        const quoteNumber = (q.quoteNumber || '').toLowerCase();
        const customerName = q.isWalkIn
          ? 'walk-in customer'
          : (q.customerName || '').toLowerCase();
        return quoteNumber.startsWith(query) || customerName.startsWith(query);
      });
    }

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter((q) => (q.status || 'Draft') === statusFilter);
    }

    // Filter by date/month/year
    if (filterType === 'date' && selectedDate) {
      result = result.filter((q) => {
        try {
          if (!q.quoteDate) return false;
          const qDate = new Date(q.quoteDate).toISOString().split('T')[0];
          return qDate === selectedDate;
        } catch (e) {
          return false;
        }
      });
    } else if (filterType === 'month' && selectedMonth && selectedYear) {
      result = result.filter((q) => {
        try {
          if (!q.quoteDate) return false;
          const qDate = new Date(q.quoteDate);
          if (isNaN(qDate.getTime())) return false;
          const qYear = qDate.getFullYear().toString();
          const qMonth = String(qDate.getMonth() + 1).padStart(2, '0');
          return qYear === selectedYear && qMonth === selectedMonth;
        } catch (e) {
          return false;
        }
      });
    } else if (filterType === 'year' && selectedYear) {
      result = result.filter((q) => {
        try {
          if (!q.quoteDate) return false;
          const qDate = new Date(q.quoteDate);
          if (isNaN(qDate.getTime())) return false;
          const qYear = qDate.getFullYear().toString();
          return qYear === selectedYear;
        } catch (e) {
          return false;
        }
      });
    }

    setFilteredQuotations(result);
  }, [searchQuery, statusFilter, quotations, filterType, selectedDate, selectedMonth, selectedYear]);

  const loadQuotations = async () => {
    try {
      setLoading(true);
      const data = await getAllRecords('sales/quotations');
      const sorted = (data as any[]).sort(
        (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
      );
      setQuotations(sorted);
      setFilteredQuotations(sorted);
    } catch (error) {
      toast.error('Failed to load quotations');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await updateRecord('sales/quotations', id, { status });
      setQuotations((prev) =>
        prev.map((q) => (q.id === id ? { ...q, status } : q))
      );
      toast.success(`Status updated to ${status}`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (id: string, quoteNumber: string) => {
    if (
      !confirm(
        `Are you sure you want to delete quotation ${quoteNumber}? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await deleteRecord('sales/quotations', id);
      setQuotations((prev) => prev.filter((q) => q.id !== id));
      toast.success(`Quotation ${quoteNumber} deleted successfully`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete quotation');
    }
  };

  const getCurrencySymbol = (currency: string) => {
    return CURRENCY_SYMBOLS[currency] || '₹';
  };

  const formatAmount = (amount: number, currency: string) => {
    const symbol = getCurrencySymbol(currency);
    const num = Number(amount || 0);
    if (currency === 'INR') {
      return `${symbol}${num.toLocaleString('en-IN', {
        maximumFractionDigits: 2,
      })}`;
    }
    return `${symbol}${num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const handleViewQuotation = (q: any) => {
    setPreviewQuotation(q);
    setPreviewDialogOpen(true);
  };

  const downloadPDF = async (q: any) => {
    // Open preview to render the template (if not already open)
    if (!previewDialogOpen) {
      setPreviewQuotation(q);
      setPreviewDialogOpen(true);
    }
    
    // Wait for preview to render
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (!printRef.current) {
      toast.error('Preview not loaded. Please try again.');
      return;
    }

    const toastId = toast.loading('Generating PDF...');
    
    try {
      const element = printRef.current;
      const opt = {
        margin: 0,
        filename: `${q.quoteNumber}.pdf`,
        image: { type: 'jpeg' as const, quality: 1 },
        html2canvas: { 
          scale: 3, 
          useCORS: true, 
          letterRendering: true,
          ignoreElements: (el: any) => el.classList?.contains('no-print')
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'landscape' as const
        },
      };

      await html2pdf().set(opt).from(element).save();
      
      toast.success('PDF downloaded successfully!', { id: toastId });
      
      // Close preview after download
      setTimeout(() => {
        setPreviewDialogOpen(false);
      }, 500);
      
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF', { id: toastId });
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setFilterType('all');
    setSelectedDate('');
    setSelectedMonth('');
    setSelectedYear('');
  };

  const hasActiveFilters =
    searchQuery ||
    statusFilter !== 'all' ||
    filterType !== 'all';

  // Calculate total amount for filtered quotations
  const totalAmount = filteredQuotations.reduce(
    (sum, q) => sum + (q.grandTotal || 0),
    0
  );

  // Group quotations by currency for summary
  const currencySummary = filteredQuotations.reduce<Record<string, number>>((acc, q) => {
    const currency = q.currency || 'INR';
    if (!acc[currency]) acc[currency] = 0;
    acc[currency] += q.grandTotal || 0;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-blue-900">
              Sales Quotations
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              {filteredQuotations.length} quotation{filteredQuotations.length !== 1 ? 's' : ''}
              {Object.keys(currencySummary).length > 0 && (
                <span className="ml-2">
                  • {Object.entries(currencySummary).map(([curr, amt]) => 
                    formatAmount(amt, curr)
                  ).join(' + ')}
                </span>
              )}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="bg-blue-700 hover:bg-blue-800 flex items-center gap-2">
                Create New Quotation
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem 
                onClick={() => navigate('/sales/quotations/create')}
                className="cursor-pointer font-medium text-black-700 focus:text-blue-700 focus:bg-blue-50"
              >
                Standard Quotation
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => navigate('/sales/quotations/create?mode=manual')}
                className="cursor-pointer font-medium text-black-700 focus:text-blue-700 focus:bg-blue-50"
              >
                Create Quotation Manually
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Filters Section */}
        <Card className="mb-6">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg">Filters</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search Bar */}
            <div className="relative flex-1">
              <Label className="text-sm font-medium mb-2 block">Search</Label>
              <Search className="absolute left-3 top-10 h-5 w-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by quotation number or customer name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-10 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Status Filter */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Sent">Sent</SelectItem>
                    <SelectItem value="Accepted">Accepted</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
                    <SelectItem value="Expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date Filter Type */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Date Filter</Label>
                <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Dates</SelectItem>
                    <SelectItem value="date">Specific Date</SelectItem>
                    <SelectItem value="month">Month & Year</SelectItem>
                    <SelectItem value="year">Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Conditional Date Inputs */}
            {filterType === 'date' && (
              <div>
                <Label className="text-sm font-medium mb-2 block">Select Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            )}

            {filterType === 'month' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium mb-2 block">Month</Label>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block">Year</Label>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((y) => (
                        <SelectItem key={y} value={y.toString()}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {filterType === 'year' && (
              <div>
                <Label className="text-sm font-medium mb-2 block">Year</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={y.toString()}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-2" />
                  Clear All Filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Summary */}
        {hasActiveFilters && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900 font-medium">
              Found {filteredQuotations.length} result{filteredQuotations.length !== 1 ? 's' : ''}
              {searchQuery && ` matching "${searchQuery}"`}
              {statusFilter !== 'all' && ` with status "${statusFilter}"`}
              {filterType === 'date' && selectedDate && ` on ${format(new Date(selectedDate), 'dd-MM-yyyy')}`}
              {filterType === 'month' && selectedMonth && selectedYear && ` for ${monthOptions.find(m => m.value === selectedMonth)?.label} ${selectedYear}`}
              {filterType === 'year' && selectedYear && ` for year ${selectedYear}`}
            </p>
          </div>
        )}

        {/* Table View */}
        <Card>
          <CardHeader>
            <CardTitle>All Quotations</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8">Loading quotations...</p>
            ) : filteredQuotations.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                {hasActiveFilters ? (
                  <>
                    <p className="text-lg font-medium mb-2">No quotations found</p>
                    <p className="text-sm mb-4">
                      No results match your current filters.
                    </p>
                    <Button variant="outline" onClick={clearFilters}>
                      Clear All Filters
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-medium mb-4">No quotations found</p>
                    <Button
                      onClick={() => navigate('/sales/quotations/create')}
                    >
                      Create Your First Quotation
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quote No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQuotations.map((q) => {
                      const currency = q.currency || 'INR';
                      const symbol = getCurrencySymbol(currency);

                      return (
                        <TableRow key={q.id}>
                          <TableCell className="font-mono font-semibold">
                            {q.quoteNumber}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              try {
                                if (!q.quoteDate) return 'N/A';
                                const d = new Date(q.quoteDate);
                                return isNaN(d.getTime()) ? 'Invalid Date' : format(d, 'dd-MM-yyyy');
                              } catch (e) {
                                return 'Invalid Date';
                              }
                            })()}
                          </TableCell>
                          <TableCell>
                            {q.isWalkIn ? (
                              <span className="text-orange-600 font-medium">
                                Walk-in Customer
                              </span>
                            ) : (
                              q.customerName || 'N/A'
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-bold text-xs">
                              {currency} {symbol}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatAmount(q.grandTotal, currency)}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={q.status || 'Draft'}
                              onValueChange={(v) => updateStatus(q.id!, v)}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Draft">Draft</SelectItem>
                                <SelectItem value="Sent">Sent</SelectItem>
                                <SelectItem value="Accepted">Accepted</SelectItem>
                                <SelectItem value="Rejected">Rejected</SelectItem>
                                <SelectItem value="Expired">Expired</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-center">
                              <RowActions
                                actions={[
                                  { label: 'View Quotation', icon: Eye, onClick: () => handleViewQuotation(q), className: 'text-blue-600 hover:text-blue-700' },
                                  { label: 'Edit', icon: Edit, onClick: () => navigate(`/sales/quotations/edit/${q.id}`) },
                                  { label: 'Download PDF', icon: Download, onClick: () => downloadPDF(q), className: 'text-green-600 hover:text-green-700' },
                                  { label: 'Delete', icon: Trash2, onClick: () => handleDelete(q.id!, q.quoteNumber), className: 'text-red-600 hover:text-red-700', hidden: q.status === 'Accepted' },
                                ]}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Preview Dialog - Hidden Print Template */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-blue-900">
              Quotation Preview - {previewQuotation?.quoteNumber}
            </DialogTitle>
          </DialogHeader>
          
          <div className="bg-gray-100 rounded-lg p-4 overflow-auto">
            {previewQuotation && (
              <div ref={printRef} className="bg-white" style={{ width: 'fit-content', margin: '0 auto' }}>
                <QuotationPrintTemplate quotation={previewQuotation} />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setPreviewDialogOpen(false)}
            >
              Close
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => {
                if (previewQuotation) {
                  downloadPDF(previewQuotation);
                }
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
