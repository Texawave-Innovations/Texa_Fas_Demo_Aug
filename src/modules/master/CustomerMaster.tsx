// modules/master/CustomerMaster.tsx
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Edit, Power, MapPin, Mail, Phone, User, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import { updateRecord, getAllRecords } from '@/services/firebase';
import { Link, useNavigate } from 'react-router-dom';

interface Address {
  id: string;
  label: string;
  street: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault?: boolean;
}

interface Customer {
  id: string;
  customerCode: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  gst?: string;
  pan?: string;
  addresses: Address[];
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  bankBranch?: string;
  bankDetails?: string;
  currency?: string;
  status?: 'active' | 'inactive';
  createdAt?: number;
  updatedAt?: number;
}

export default function CustomerMaster() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const data = await getAllRecords('sales/customers');
      // Sort by latest first
      const sorted = data.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
      setCustomers(sorted);
    } catch (error) {
      toast.error('Failed to load customers');
    }
  };

  const toggleStatus = async (customer: Customer) => {
    const newStatus = customer.status === 'inactive' ? 'active' : 'inactive';
    try {
      await updateRecord('sales/customers', customer.id, { status: newStatus });
      toast.success(`Customer marked as ${newStatus}`);
      loadCustomers();
    } catch (error) {
      toast.error('Failed to update customer status');
    }
  };

  // Enhanced search: includes customerCode + default address city/state
  const filteredCustomers = customers.filter(customer => {
    const search = searchTerm.toLowerCase();
    const defaultAddress = customer.addresses?.find(a => a.isDefault);

    return (
      customer.customerCode?.toLowerCase().includes(search) ||
      customer.companyName?.toLowerCase().includes(search) ||
      customer.contactPerson?.toLowerCase().includes(search) ||
      customer.email?.toLowerCase().includes(search) ||
      customer.phone?.toLowerCase().includes(search) ||
      customer.gst?.toLowerCase().includes(search) ||
      defaultAddress?.city?.toLowerCase().includes(search) ||
      defaultAddress?.state?.toLowerCase().includes(search)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-muted/20 p-4 rounded-xl border border-border">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by code, name, email, city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-3 justify-between w-full sm:w-auto">
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            {filteredCustomers.length} of {customers.length} customers
          </div>
          <Button asChild>
            <Link to="/master/sales/customer/new">
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Link>
          </Button>
        </div>
      </div>

      {/* Customer Listing Area - Scrollable */}
      <div className="max-h-[600px] overflow-y-auto pr-2 border border-border/60 rounded-xl p-4 bg-slate-50/50">
        {filteredCustomers.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            {searchTerm ? (
              <>No customers found matching "{searchTerm}"</>
            ) : (
              <div className="space-y-4">
                <div className="text-xl font-semibold">No Customers Registered</div>
                <p className="text-sm">Create your first customer to get started.</p>
                <Button asChild>
                  <Link to="/master/sales/customer/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Customer
                  </Link>
                </Button>
              </div>
            )}
          </div>
        ) : (
          /* Responsive 5-6 cards layout on large screens */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {filteredCustomers.map((customer) => {
              const defaultAddr = customer.addresses?.find(a => a.isDefault);
              const isInactive = customer.status === 'inactive';

              return (
                <Card 
                  key={customer.id} 
                  className={`flex flex-col h-[285px] justify-between hover:-translate-y-1 hover:shadow-md transition-all duration-200 border-2 hover:border-blue-100 group relative ${
                    isInactive ? 'border-slate-200 bg-slate-50/50 opacity-60' : 'border-slate-100'
                  }`}
                >
                  <CardHeader className="p-4 pb-2 shrink-0">
                    <div className="flex items-start justify-between gap-1">
                      <Badge variant="secondary" className="font-mono text-[11px] px-1.5 py-0.5 max-w-[90px] truncate bg-blue-50 text-blue-700 border border-blue-100">
                        {customer.customerCode || '—'}
                      </Badge>
                      {customer.currency && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 border-slate-300">
                          {customer.currency}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className={`text-sm font-bold text-slate-800 leading-tight mt-1.5 line-clamp-2 min-h-[40px] ${isInactive ? 'line-through text-slate-400' : ''}`}>
                      {customer.companyName}
                      {isInactive && (
                        <span className="text-[10px] text-red-500 block font-normal no-underline mt-0.5">(Inactive)</span>
                      )}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="p-4 pt-1 pb-3 text-xs space-y-2 flex-grow overflow-y-auto max-h-[145px] pr-1">
                    {/* Contact Person */}
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{customer.contactPerson || '—'}</span>
                    </div>

                    {/* Email */}
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate" title={customer.email}>{customer.email || '—'}</span>
                    </div>

                    {/* Phone */}
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{customer.phone || '—'}</span>
                    </div>

                    {/* GST Number */}
                    {customer.gst && (
                      <div className="bg-slate-100 p-1.5 rounded text-[11px] font-medium text-slate-700 font-mono flex items-center justify-between">
                        <span>GSTIN:</span>
                        <span className="text-slate-800">{customer.gst}</span>
                      </div>
                    )}

                    {/* Default Address */}
                    <div className="flex items-start gap-1.5 text-slate-500 pt-1 border-t border-slate-100">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <div className="truncate text-[11px]">
                        {defaultAddr ? (
                          <>
                            <span className="font-semibold text-slate-700">{defaultAddr.city}</span>
                            <span>, {defaultAddr.state}</span>
                          </>
                        ) : (
                          <span className="text-slate-400 font-light italic">No default address</span>
                        )}
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="p-3 bg-slate-50 rounded-b-lg flex justify-end gap-1 border-t border-slate-100/60 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                      onClick={() => navigate(`/master/sales/customer/edit/${customer.id}`)}
                      title="Edit Customer"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 ${isInactive ? 'text-green-600 hover:text-green-700 hover:bg-green-50' : 'text-slate-500 hover:text-red-600 hover:bg-red-50'}`}
                      onClick={() => toggleStatus(customer)}
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
      </div>
    </div>
  );
}
