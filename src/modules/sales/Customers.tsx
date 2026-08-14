// modules/sales/Customers.tsx
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RowActions } from '@/components/ui/row-actions';
import { Search, Plus, Edit, Trash2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { deleteRecord, getAllRecords } from '@/services/firebase';
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
  createdAt?: number;
  updatedAt?: number;
}

export default function Customers() {
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

  const handleDelete = async (id: string, customerCode: string) => {
    if (!confirm(`Delete customer ${customerCode}? This cannot be undone.`)) return;

    try {
      await deleteRecord('sales/customers', id);
      toast.success('Customer deleted successfully');
      loadCustomers();
    } catch (error) {
      toast.error('Failed to delete customer');
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

  const getDefaultAddress = (addresses: Address[]) => {
    const def = addresses.find(a => a.isDefault);
    if (!def) return null;
    return `${def.city}, ${def.state}`;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Customers</h1>
          <p className="text-muted-foreground mt-1">Manage your customer database</p>
        </div>
        <Button asChild size="lg">
          <Link to="/sales/customers/new">
            <Plus className="h-5 w-5 mr-2" />
            Add Customer
          </Link>
        </Button>
      </div>

      <Card className="shadow-xl">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by code, name, email, city..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {filteredCustomers.length} of {customers.length} customers
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Code</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>
                    <div className="flex items-center justify-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Default Address
                    </div>
                  </TableHead>
                  <TableHead>GST</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                      {searchTerm ? (
                        <>No customers found matching "{searchTerm}"</>
                      ) : (
                        <>
                          <div className="text-2xl mb-4">No customers yet</div>
                          <Button asChild>
                            <Link to="/sales/customers/new">
                              <Plus className="h-4 w-4 mr-2" />
                              Create your first customer
                            </Link>
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((customer) => {
                    const defaultAddr = customer.addresses?.find(a => a.isDefault);

                    return (
                      <TableRow key={customer.id} className="hover:bg-muted/50 transition-colors">
                        <TableCell>
                          <Badge variant="secondary" className="font-mono text-sm">
                            {customer.customerCode || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {customer.companyName}
                        </TableCell>
                        <TableCell>{customer.contactPerson}</TableCell>
                        <TableCell className="text-muted-foreground">{customer.email}</TableCell>
                        <TableCell>{customer.phone}</TableCell>
                        <TableCell>
                          {defaultAddr ? (
                            <div className="text-sm">
                              <div className="font-medium">{defaultAddr.city}, {defaultAddr.state}</div>
                              <div className="text-xs text-muted-foreground">
                                {defaultAddr.label}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {customer.gst ? (
                            <Badge variant="outline">{customer.gst}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-center">
                            <RowActions
                              actions={[
                                { label: 'Edit', icon: Edit, onClick: () => navigate(`/sales/customers/edit/${customer.id}`) },
                                { label: 'Delete', icon: Trash2, onClick: () => handleDelete(customer.id, customer.customerCode || customer.companyName), className: 'text-red-600 hover:text-red-700' },
                              ]}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}