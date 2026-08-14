// src/modules/hr/Profile.tsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Plus, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getAllRecords } from '@/services/firebase';
import * as XLSX from 'xlsx';


interface Address {
  address: string;
  area?: string;
  district?: string;
  city: string;
  state: string;
  pincode: string;
}


interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}


interface Salary {
  basic: number;
  hra: number;
  conveyance: number;
  medical: number;
  da: number;
  additionalSpecialAllowance?: number;
  grossMonthly: number;
  ctcLPA: number;
}


interface Employee {
  id: string;
  name: string;
  initial?: string;
  employeeId: string;
  profilePhoto?: string;
  department: string;
  role: string;
  phone: string;
  email: string;
  joiningDate?: string;
  dob?: string;
  bloodGroup?: string;
  gender?: string;
  maritalStatus?: string;
  religion?: string;
  languages?: string[];
  fatherName?: string;
  motherName?: string;
  spouseName?: string;
  emergencyContact?: EmergencyContact;
  permanentAddress?: Address;
  presentAddress?: Address;
  panNumber?: string;
  aadhaarNumber?: string;
  esiNumber?: string;
  pfNumber?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  salary?: Salary;
  officeType?: string;
  referredBy?: string;
  previousCompany?: string;
  previousRole?: string;
  experienceYears?: string;
  status?: string;
}


export default function Profile() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);


  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const data = await getAllRecords('hr/employees');
        const list = Object.keys(data).map(key => ({
          id: key,
          ...data[key],
        })) as Employee[];
        setEmployees(list);
      } catch (err) {
        console.error('Error fetching employees:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchEmployees();
  }, []);


  const formatDate = (value?: string) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };


  const buildAddressString = (addr?: Address): string => {
    if (!addr) return '';
    const parts: string[] = [];
    if (addr.address) parts.push(addr.address);
    const line2: string[] = [];
    if (addr.area) line2.push(addr.area);
    if (addr.district) line2.push(addr.district);
    if (addr.city) line2.push(addr.city);
    if (line2.length) parts.push(line2.join(', '));
    const line3: string[] = [];
    if (addr.state) line3.push(addr.state);
    if (addr.pincode) line3.push(addr.pincode);
    if (line3.length) parts.push(line3.join(' - '));
    return parts.join(' | ');
  };


  const handleExportMasterData = () => {
    if (!employees.length) return;


    try {
      setExporting(true);


      // Flatten all fields used in EmployeeProfileView into tabular columns
      const rows = employees.map(emp => {
        const isSameAddress =
          emp.permanentAddress &&
          emp.presentAddress &&
          JSON.stringify(emp.permanentAddress) ===
            JSON.stringify(emp.presentAddress);


        return {
          // Header columns:
          'Employee ID': emp.employeeId || '',
          'Full Name': `${emp.initial ? emp.initial + ' ' : ''}${emp.name || ''}`.trim(),
          'Status': emp.status || '',
          Department: emp.department || '',
          Role: emp.role || '',
          'Office Type': emp.officeType || '',
          'Joining Date': formatDate(emp.joiningDate),


          // Personal Information
          'Date of Birth': formatDate(emp.dob),
          Gender: emp.gender || '',
          'Blood Group': emp.bloodGroup || '',
          'Marital Status': emp.maritalStatus || 'Single',
          Religion: emp.religion || '',
          'Languages Known': emp.languages && emp.languages.length
            ? emp.languages.join(', ')
            : '',


          // Family
          "Father's Name": emp.fatherName || '',
          "Mother's Name": emp.motherName || '',
          'Spouse Name': emp.spouseName || '',


          // Emergency Contact
          'Emergency Name': emp.emergencyContact?.name || '',
          'Emergency Phone': emp.emergencyContact?.phone || '',
          'Emergency Relationship': emp.emergencyContact?.relationship || '',


          // Contact
          'Official Email': emp.email || '',
          'Phone Number': emp.phone || '',


          // Address
          'Current Address': buildAddressString(
            emp.presentAddress || emp.permanentAddress
          ),
          'Permanent Address': isSameAddress
            ? 'Same as Current Address'
            : buildAddressString(emp.permanentAddress),


          // Identity & Bank
          'PAN Number': emp.panNumber || '',
          'Aadhaar Number': emp.aadhaarNumber || '',
          'ESI Number': emp.esiNumber || '',
          'PF Number': emp.pfNumber || '',
          'Bank Name': emp.bankName || '',
          'Bank Account Number': emp.bankAccountNo || '',
          'Bank IFSC': emp.bankIfsc || '',


          // Salary Structure
          'Gross Monthly (₹)': emp.salary?.grossMonthly ?? '',
          'CTC (LPA)': emp.salary?.ctcLPA ?? '',
          'Basic (₹)': emp.salary?.basic ?? '',
          'HRA (₹)': emp.salary?.hra ?? '',
          'Conveyance (₹)': emp.salary?.conveyance ?? '',
          'Medical (₹)': emp.salary?.medical ?? '',
          'DA (₹)': emp.salary?.da ?? '',
          'Special Allowance (₹)': emp.salary?.additionalSpecialAllowance ?? '',


          // Experience & Referral
          'Previous Company': emp.previousCompany || '',
          'Previous Role': emp.previousRole || '',
          'Experience (Years)': emp.experienceYears || '',
          'Referred By': emp.referredBy || '',
        };
      });


      const worksheet = XLSX.utils.json_to_sheet(rows, { skipHeader: false });


      // Optional: set column widths roughly
      const colWidths = Object.keys(rows[0]).map(() => ({ wch: 22 }));
      worksheet['!cols'] = colWidths;


      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Employees Master');
      XLSX.writeFile(workbook, 'employees_master_data.xlsx');
    } catch (err) {
      console.error('Error exporting master data:', err);
    } finally {
      setExporting(false);
    }
  };


  if (loading)
    return (
      <div className="p-8 text-center text-gray-600">Loading employees...</div>
    );


  return (
    <div className="p-6 space-y-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">All Employees</h1>
          <p className="text-gray-600 mt-1">
            Total: {employees.length} employees
          </p>
        </div>
        <div className="flex flex-wrap gap-3 justify-end">
          <Button
            variant="outline"
            className="border-blue-700 text-blue-700 hover:bg-blue-50"
            onClick={handleExportMasterData}
            disabled={!employees.length || exporting}
          >
            <FileDown className="mr-2 h-5 w-5" />
            {exporting ? 'Exporting...' : 'Master Data Export'}
          </Button>


          <Link to="/hr/employees/new">
            <Button className="bg-blue-700 hover:bg-blue-800">
              <Plus className="mr-2 h-5 w-5" /> Add Employee
            </Button>
          </Link>
        </div>
      </div>


      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {employees.map(emp => (
          <Card
            key={emp.id}
            className="hover:shadow-xl transition-all duration-300 border border-gray-200"
          >
            <CardContent className="p-6 text-center">
              <div className="space-y-4">
                <div className="w-28 h-28 mx-auto rounded-full overflow-hidden ring-4 ring-blue-100">
                  {emp.profilePhoto ? (
                    <img
                      src={emp.profilePhoto}
                      alt={emp.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-4xl font-bold text-white">
                      {emp.name?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>


                <div>
                  <h3 className="font-bold text-xl text-gray-900">
                    {emp.name}
                  </h3>
                  <p className="text-sm text-blue-700 font-semibold">
                    {emp.employeeId}
                  </p>
                  <p className="text-gray-600 mt-1">{emp.role}</p>
                  <p className="text-xs text-gray-500">{emp.department}</p>
                </div>


                <div className="text-sm text-gray-600 space-y-1">
                  <p className="truncate">{emp.email}</p>
                  <p className="font-medium">{emp.phone}</p>
                </div>


                <Link to={`/hr/employees/profile/${emp.id}`} className="block">
                  <Button className="w-full bg-blue-700 hover:bg-blue-800">
                    <Eye className="mr-2 h-4 w-4" />
                    View Profile
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
