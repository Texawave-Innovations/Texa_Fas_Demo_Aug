import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Mail,
  Phone,
  Building,
  Briefcase,
  Calendar,
  Heart,
  Home,
  User,
  FileText,
  IndianRupee,
  MapPin,
  Users,
  Globe,
  Church,
  Languages,
  GraduationCap,
  CreditCard,
  Banknote,
  Shield,
  Baby,
  UserCheck,
  Clock,
  Award,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getRecord } from '@/services/firebase';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { toast } from '@/hooks/use-toast';


interface Employee {
  id: string;
  name: string;
  initial?: string;
  employeeId: string;
  profilePhoto?: string;
  department: string;
  role: string;
  email: string;
  phone: string;
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
  emergencyContact?: { name: string; phone: string; relationship: string };
  permanentAddress?: { address: string; area?: string; district?: string; city: string; state: string; pincode: string };
  presentAddress?: { address: string; area?: string; district?: string; city: string; state: string; pincode: string };
  panNumber?: string;
  aadhaarNumber?: string;
  esiNumber?: string;
  pfNumber?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  bankBranch?: string;
  salary?: {
    basic: number;
    hra: number;
    conveyance: number;
    otherAllowance?: number;
    additionalSpecialAllowance?: number;
    grossMonthly: number;
    ctcLPA: number;
    da?: number; // kept for compatibility
  };
  officeType?: string;
  referredBy?: string;
  previousCompany?: string;
  previousRole?: string;
  experienceYears?: number | string;
  status?: string;
}


export default function EmployeeProfileView() {
  const { id } = useParams<{ id: string }>();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    const fetchEmployee = async () => {
      if (!id) return;
      try {
        const data = await getRecord('hr/employees', id);
        setEmployee({ id, ...data } as Employee);
      } catch (err) {
        console.error('Error fetching employee:', err);
        toast({ title: 'Failed to load employee', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchEmployee();
  }, [id]);


  if (loading) return <div className="p-20 text-center text-gray-600 text-xl">Loading employee details...</div>;
  if (!employee) return <div className="p-20 text-center text-red-600 text-xl">Employee not found</div>;


  const addr = employee.presentAddress || employee.permanentAddress || {};
  const isSameAddress = employee.permanentAddress && employee.presentAddress &&
    JSON.stringify(employee.permanentAddress) === JSON.stringify(employee.presentAddress);


  const handleDownloadPdf = async () => {
    if (!containerRef.current) return;
    try {
      setDownloading(true);
      toast({ title: 'Preparing PDF — please wait...' });


      const canvas = await html2canvas(containerRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight
      });


      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210;
      const pageHeight = 297;


      const imgWidthPx = canvas.width;
      const imgHeightPx = canvas.height;
      const pxToMm = pageWidth / imgWidthPx;
      const imgWidthMm = pageWidth;
      const imgHeightMm = imgHeightPx * pxToMm;


      let heightLeft = imgHeightMm;
      let position = 0;


      pdf.addImage(imgData, 'PNG', 0, position, imgWidthMm, imgHeightMm);
      heightLeft -= pageHeight;


      while (heightLeft > 0) {
        pdf.addPage();
        position -= pageHeight;
        pdf.addImage(imgData, 'PNG', 0, position, imgWidthMm, imgHeightMm);
        heightLeft -= pageHeight;
      }


      const fileName = `${employee.name.replace(/\s+/g, '_')}_Profile.pdf`;
      pdf.save(fileName);
      toast({ title: 'PDF downloaded', description: fileName });
    } catch (err) {
      console.error('PDF export error', err);
      toast({ title: 'Failed to export PDF', variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };


  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex justify-between items-center mb-8">
          <div>
            <Link to="/hr/employees">
              <Button variant="ghost" className="text-blue-700 hover:bg-blue-50">
                <ArrowLeft className="mr-2 h-5 w-5" /> Back to All Employees
              </Button>
            </Link>
          </div>


          <div className="flex items-center gap-3">
            <Button onClick={handleDownloadPdf} disabled={downloading} className="flex items-center">
              <Download className="mr-2 h-5 w-5" />
              {downloading ? 'Preparing PDF...' : 'Download PDF'}
            </Button>
          </div>
        </div>


        {/* PDF Capture Container */}
        <div ref={containerRef} id="employee-profile-pdf" className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-blue-900 text-white p-10">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-10">
              <div className="relative">
                <div className="w-48 h-48 rounded-full overflow-hidden ring-8 ring-white/30 shadow-2xl">
                  {employee.profilePhoto ? (
                    <img src={employee.profilePhoto} alt={employee.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-white/30 backdrop-blur flex items-center justify-center text-8xl font-bold">
                      {employee.name[0]}
                    </div>
                  )}
                </div>
                {employee.status === 'active' && (
                  <Badge className="absolute bottom-2 right-2 bg-green-500 text-white border-none">Active</Badge>
                )}
              </div>


              <div className="text-center md:text-left flex-1">
                <h1 className="text-5xl font-bold">{employee.initial || ''} {employee.name}</h1>
                <p className="text-3xl opacity-90 mt-2">{employee.role}</p>
                <div className="flex flex-wrap gap-6 mt-6 text-xl">
                  <span className="flex items-center gap-3">
                    <Building className="h-7 w-7" /> {employee.employeeId}
                  </span>
                  <span className="flex items-center gap-3">
                    <Briefcase className="h-7 w-7" /> {employee.department}
                  </span>
                  {employee.officeType && (
                    <span className="flex items-center gap-3">
                      <Home className="h-7 w-7" /> {employee.officeType}
                    </span>
                  )}
                </div>
                {employee.joiningDate && (
                  <p className="mt-4 text-lg opacity-80">
                    <Calendar className="inline h-5 w-5 mr-2" />
                    Joined on: {new Date(employee.joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
          </div>


          <div className="p-10 space-y-12">
            {/* Personal Information */}
            <section>
              <h2 className="text-3xl font-bold text-gray-800 flex items-center gap-3 border-b-4 border-blue-600 pb-3 w-fit">
                <User className="h-8 w-8" /> Personal Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8 text-lg">
                <div><span className="text-gray-600">Full Name</span><p className="font-bold text-xl">{employee.initial || ''} {employee.name}</p></div>
                <div><span className="text-gray-600">Date of Birth</span><p className="font-bold">{employee.dob ? new Date(employee.dob).toLocaleDateString('en-IN') : '—'}</p></div>
                <div><span className="text-gray-600">Gender</span><p className="font-bold">{employee.gender || '—'}</p></div>
                <div><span className="text-gray-600">Blood Group</span><p className="font-bold text-red-600 text-2xl">{employee.bloodGroup || '—'}</p></div>
                <div><span className="text-gray-600">Marital Status</span><p className="font-bold">{employee.maritalStatus || 'Single'}</p></div>
                <div><span className="text-gray-600">Religion</span><p className="font-bold flex items-center gap-2"><Church className="h-5 w-5" /> {employee.religion || '—'}</p></div>
                {employee.languages && employee.languages.length > 0 && (
                  <div><span className="text-gray-600">Languages Known</span><p className="font-bold flex items-center gap-2"><Languages className="h-5 w-5" /> {employee.languages.join(', ')}</p></div>
                )}
              </div>
            </section>


            <Separator />


            {/* Family Details */}
            {(employee.fatherName || employee.motherName || employee.spouseName) && (
              <section>
                <h2 className="text-3xl font-bold text-gray-800 flex items-center gap-3 border-b-4 border-blue-600 pb-3 w-fit">
                  <Users className="h-8 w-8" /> Family Details
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8 text-lg">
                  {employee.fatherName && <div><span className="text-gray-600">Father's Name</span><p className="font-bold">{employee.fatherName}</p></div>}
                  {employee.motherName && <div><span className="text-gray-600">Mother's Name</span><p className="font-bold">{employee.motherName}</p></div>}
                  {employee.spouseName && <div><span className="text-gray-600">Spouse Name</span><p className="font-bold flex items-center gap-2"><Heart className="h-5 w-5 text-pink-600" /> {employee.spouseName}</p></div>}
                </div>
              </section>
            )}


            <Separator />


            {/* Emergency Contact */}
            {employee.emergencyContact && (
              <section>
                <h2 className="text-3xl font-bold text-gray-800 flex items-center gap-3 border-b-4 border-red-600 pb-3 w-fit">
                  <UserCheck className="h-8 w-8" /> Emergency Contact
                </h2>
                <div className="bg-red-50 border border-red-200 rounded-xl p-6 mt-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-lg">
                    <div><span className="text-gray-600">Name</span><p className="font-bold">{employee.emergencyContact.name}</p></div>
                    <div><span className="text-gray-600">Phone</span><p className="font-bold">{employee.emergencyContact.phone}</p></div>
                    <div><span className="text-gray-600">Relationship</span><p className="font-bold">{employee.emergencyContact.relationship}</p></div>
                  </div>
                </div>
              </section>
            )}


            <Separator />


            {/* Contact Information */}
            <section>
              <h2 className="text-3xl font-bold text-gray-800 flex items-center gap-3 border-b-4 border-blue-600 pb-3 w-fit">
                <Phone className="h-8 w-8" /> Contact Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mt-8 text-lg">
                <div className="flex items-center gap-5 bg-blue-50 p-5 rounded-xl">
                  <Mail className="h-10 w-10 text-blue-700" />
                  <div>
                    <p className="text-gray-600">Official Email</p>
                    <p className="font-bold text-xl">{employee.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-5 bg-green-50 p-5 rounded-xl">
                  <Phone className="h-10 w-10 text-green-700" />
                  <div>
                    <p className="text-gray-600">Phone Number</p>
                    <p className="font-bold text-xl">{employee.phone}</p>
                  </div>
                </div>
              </div>
            </section>


            <Separator />


            {/* Address */}
            <section>
              <h2 className="text-3xl font-bold text-gray-800 flex items-center gap-3 border-b-4 border-blue-600 pb-3 w-fit">
                <MapPin className="h-8 w-8" /> Address Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-8">
                <div className="bg-gray-50 p-8 rounded-xl border">
                  <h3 className="font-bold text-xl text-gray-800 mb-4">Current Address</h3>
                  <p className="text-gray-700 leading-relaxed text-lg">
                    {addr.address || 'Not provided'}<br />
                    {addr.area && `${addr.area}, `}
                    {addr.district && `${addr.district}, `}
                    {addr.city}<br />
                    {addr.state} - {addr.pincode}
                  </p>
                </div>
                <div className="bg-gray-50 p-8 rounded-xl border">
                  <h3 className="font-bold text-xl text-gray-800 mb-4">Permanent Address</h3>
                  <p className="text-gray-700 leading-relaxed text-lg">
                    {isSameAddress ? 'Same as Current Address' : (employee.permanentAddress?.address || 'Not provided')}
                    {employee.permanentAddress && !isSameAddress && (
                      <>
                        <br />
                        {employee.permanentAddress.area && `${employee.permanentAddress.area}, `}
                        {employee.permanentAddress.district && `${employee.permanentAddress.district}, `}
                        {employee.permanentAddress.city}<br />
                        {employee.permanentAddress.state} - {employee.permanentAddress.pincode}
                      </>
                    )}
                  </p>
                </div>
              </div>
            </section>


            <Separator />


            {/* Identity & Bank Details */}
            <section>
              <h2 className="text-3xl font-bold text-gray-800 flex items-center gap-3 border-b-4 border-blue-600 pb-3 w-fit">
                <CreditCard className="h-8 w-8" /> Identity & Bank Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8 text-lg">
                {employee.panNumber && <div><span className="text-gray-600">PAN Number</span><p className="font-bold text-xl">{employee.panNumber}</p></div>}
                {employee.aadhaarNumber && <div><span className="text-gray-600">Aadhaar Number</span><p className="font-bold text-xl">{employee.aadhaarNumber}</p></div>}
                {employee.esiNumber && <div><span className="text-gray-600">ESI Number</span><p className="font-bold">{employee.esiNumber || '—'}</p></div>}
                {employee.pfNumber && <div><span className="text-gray-600">PF Number</span><p className="font-bold">{employee.pfNumber || '—'}</p></div>}
                {employee.bankName && <div><span className="text-gray-600">Bank Name</span><p className="font-bold flex items-center gap-2"><Banknote className="h-6 w-6" /> {employee.bankName}</p></div>}
                {employee.bankAccountNo && <div><span className="text-gray-600">Account Number</span><p className="font-bold">{employee.bankAccountNo}</p></div>}
                {employee.bankIfsc && <div><span className="text-gray-600">IFSC Code</span><p className="font-bold">{employee.bankIfsc}</p></div>}
                {employee.bankBranch && <div><span className="text-gray-600">Branch</span><p className="font-bold">{employee.bankBranch}</p></div>}
              </div>
            </section>


            <Separator />


            {/* Salary Structure */}
            {employee.salary && (
              <section>
                <h2 className="text-3xl font-bold text-gray-800 flex items-center gap-3 border-b-4 border-green-600 pb-3 w-fit">
                  <IndianRupee className="h-9 w-9" /> Salary Structure
                </h2>
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-10 mt-8 border-2 border-green-200">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-10 text-center">
                    <div className="bg-white rounded-xl p-6 shadow-md">
                      <p className="text-gray-600 text-lg">Gross Monthly</p>
                      <p className="text-4xl font-bold text-green-600">₹{employee.salary.grossMonthly.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="bg-white rounded-xl p-6 shadow-md">
                      <p className="text-gray-600 text-lg">CTC (Annual)</p>
                      <p className="text-4xl font-bold text-blue-600">{employee.salary.ctcLPA} LPA</p>
                    </div>
                    <div className="bg-white rounded-xl p-6 shadow-md">
                      <p className="text-gray-600 text-lg">Basic</p>
                      <p className="text-3xl font-bold">₹{employee.salary.basic.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="bg-white rounded-xl p-6 shadow-md">
                      <p className="text-gray-600 text-lg">HRA</p>
                      <p className="text-3xl font-bold">₹{employee.salary.hra.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8 text-center text-lg">
                    <div><span className="text-gray-600">Conveyance</span><p className="font-bold">₹{employee.salary.conveyance?.toLocaleString('en-IN') || 0}</p></div>
                    <div><span className="text-gray-600">Special Allowance</span><p className="font-bold">₹{employee.salary.additionalSpecialAllowance?.toLocaleString('en-IN') || 0}</p></div>
                    <div><span className="text-gray-600">Other Allowance</span><p className="font-bold">₹{employee.salary.otherAllowance?.toLocaleString('en-IN') || 0}</p></div>
                  </div>
                </div>
              </section>
            )}


            <Separator />


            {/* Experience & Referral */}
            {(employee.experienceYears || employee.previousCompany || employee.referredBy) && (
              <section>
                <h2 className="text-3xl font-bold text-gray-800 flex items-center gap-3 border-b-4 border-blue-600 pb-3 w-fit">
                  <Award className="h-8 w-8" /> Experience & Referral
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mt-8 text-lg">
                  {employee.experienceYears !== undefined && (
                    <div>
                      <span className="text-gray-600">Years of Experience</span>
                      <p className="font-bold text-xl">{employee.experienceYears} years</p>
                    </div>
                  )}
                  {employee.previousCompany && (
                    <div>
                      <span className="text-gray-600">Previous Company</span>
                      <p className="font-bold text-xl">{employee.previousCompany}</p>
                      {employee.previousRole && <p className="text-gray-700">Role: {employee.previousRole}</p>}
                    </div>
                  )}
                  {employee.referredBy && (
                    <div>
                      <span className="text-gray-600">Referred By</span>
                      <p className="font-bold text-xl">{employee.referredBy}</p>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
