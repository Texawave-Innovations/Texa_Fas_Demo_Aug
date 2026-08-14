// src/modules/hr/EmployeeDocumentsView.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Eye, Upload, X, FileText, User, GraduationCap, CreditCard, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { getRecordById, updateRecord } from '@/services/firebase';
import { Employee } from '@/types';

interface CustomDocument {
  label: string;
  url: string;
  uploadedAt: string;
  filename: string;
}

const CLOUDINARY_UPLOAD_PRESET = 'unsigned_preset'; // Replace with your actual preset
const CLOUDINARY_CLOUD_NAME = 'dkzwhqhbr'; // From your URLs

export default function EmployeeDocumentsView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [docLabel, setDocLabel] = useState('');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    fetchEmployee();
  }, [id]);

  const fetchEmployee = async () => {
    if (!id) return;
    try {
      const data = await getRecordById('hr/employees', id);
      setEmployee(data as Employee);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openFile = (url: string) => window.open(url, '_blank');

  const getDownloadUrl = (url: string) => {
    return url.includes('/upload/') ? url.replace('/upload/', '/upload/fl_attachment:/') : url;
  };

  const downloadFile = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = getDownloadUrl(url);
    a.download = filename;
    a.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
    }
  };

  const uploadToCloudinary = async () => {
    if (!file || !docLabel.trim() || !employee) return;

    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', `hr/documents/${employee.employeeId}`);

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await response.json();
      if (data.secure_url) {
        const newDoc: CustomDocument = {
          label: docLabel,
          url: data.secure_url,
          uploadedAt: new Date().toISOString(),
          filename: file.name,
        };

        const updatedEmployee = {
          ...employee,
          customDocuments: employee.customDocuments ? [...employee.customDocuments, newDoc] : [newDoc],
        };

        await updateRecord('hr/employees', id!, updatedEmployee);
        setEmployee(updatedEmployee);
        alert('Document uploaded successfully!');
      } else {
        throw new Error('Upload failed');
      }
    } catch (err) {
      console.error(err);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      setProgress(0);
      setFile(null);
      setDocLabel('');
    }
  };

  if (loading) return <div className="text-center py-20 text-2xl">Loading...</div>;
  if (!employee) return <div className="text-center py-20 text-red-600 text-xl">Employee not found</div>;

  const defaultDocuments = [
    { label: 'Profile Photo', url: employee.profilePhoto, icon: User, type: 'image' },
    { label: 'Resume', url: employee.resumeUrl, icon: FileText, type: 'pdf' },
    { label: 'Aadhaar Card', url: employee.aadhaarUrl, icon: FileText, type: 'image' },
    { label: 'PAN Card', url: employee.panUrl, icon: FileText, type: 'image' },
    { label: 'Bank Statement', url: employee.bankStatementUrl, icon: CreditCard, type: 'pdf' },
    { label: '10th Certificate', url: employee.tenthCertificateUrl, icon: GraduationCap, type: 'any' },
    { label: '12th Certificate', url: employee.twelfthCertificateUrl, icon: GraduationCap, type: 'any' },
    { label: 'Graduation Certificate', url: employee.graduationCertificateUrl, icon: GraduationCap, type: 'any' },
    { label: 'Post Graduation', url: employee.postGraduationCertificateUrl, icon: GraduationCap, type: 'any' },
  ];

  const uploadedDefault = defaultDocuments.filter(d => d.url);
  const customDocs = employee.customDocuments || [];

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate('/hr/documents')}>
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-blue-900">Documents - {employee.name}</h1>
          <div className="flex items-center gap-4 mt-2">
            <Badge variant="secondary" className="text-lg">{employee.employeeId}</Badge>
            <span className="text-gray-600">{employee.department} • {employee.role}</span>
          </div>
        </div>
      </div>

      {/* Upload New Document */}
      <Card className="border-2 border-dashed border-blue-300 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <Plus className="h-6 w-6" />
            Upload New Document
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="docLabel">Document Name</Label>
              <Input
                id="docLabel"
                placeholder="e.g. Offer Letter, Experience Certificate"
                value={docLabel}
                onChange={(e) => setDocLabel(e.target.value)}
                disabled={uploading}
              />
            </div>
            <div>
              <Label htmlFor="file">Select File</Label>
              <Input
                id="file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={handleFileSelect}
                disabled={uploading}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={uploadToCloudinary}
                disabled={!file || !docLabel.trim() || uploading}
                className="w-full"
              >
                {uploading ? (
                  <>Uploading... {progress > 0 ? `${Math.round(progress)}%` : ''}</>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" /> Upload
                  </>
                )}
              </Button>
            </div>
          </div>

          {uploading && (
            <div className="space-y-2">
              <Progress value={progress} className="h-3" />
              <p className="text-sm text-center text-blue-600">Uploading {file?.name}...</p>
            </div>
          )}

          {file && !uploading && (
            <div className="flex items-center justify-between bg-white p-3 rounded border">
              <span className="text-sm font-medium truncate max-w-xs">{file.name}</span>
              <Button size="sm" variant="ghost" onClick={() => setFile(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Standard Documents */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Standard Documents</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {uploadedDefault.map((doc, idx) => {
            const isImage = /\.(jpg|jpeg|png|webp)$/i.test(doc.url);
            const isPdf = doc.url.endsWith('.pdf');
            const filename = doc.url.split('/').pop()?.split('?')[0] || 'document';

            return (
              <Card key={idx} className="overflow-hidden hover:shadow-xl transition-all group">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <doc.icon className="h-5 w-5 text-blue-600" />
                      {doc.label}
                    </CardTitle>
                    {isPdf && <Badge variant="outline">PDF</Badge>}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="relative aspect-square bg-gray-50 rounded-lg overflow-hidden border-2 border-dashed border-gray-300">
                    {isImage ? (
                      <img src={doc.url} alt={doc.label} className="w-full h-full object-cover" />
                    ) : isPdf ? (
                      <div className="flex flex-col items-center justify-center h-full text-gray-600">
                        <FileText className="h-16 w-16 text-red-600 mb-3" />
                        <p className="text-sm font-medium">PDF Document</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <FileText className="h-16 w-16 text-gray-400" />
                      </div>
                    )}

                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-4">
                      <Button size="sm" variant="secondary" onClick={() => openFile(doc.url)}>
                        <Eye className="h-5 w-5 mr-1" /> View
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => downloadFile(doc.url, `${employee.employeeId}_${doc.label.replace(/ /g, '_')}`)}
                      >
                        <Download className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-3 truncate">{filename}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Custom Documents */}
      {customDocs.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Additional Documents</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {customDocs.map((doc: CustomDocument, idx: number) => {
              const isImage = /\.(jpg|jpeg|png|webp)$/i.test(doc.url);
              const isPdf = doc.url.endsWith('.pdf');

              return (
                <Card key={idx} className="overflow-hidden hover:shadow-xl transition-all group">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5 text-green-600" />
                      {doc.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="relative aspect-square bg-gray-50 rounded-lg overflow-hidden border-2 border-dashed border-gray-300">
                      {isImage ? (
                        <img src={doc.url} alt={doc.label} className="w-full h-full object-cover" />
                      ) : isPdf ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-600">
                          <FileText className="h-16 w-16 text-red-600 mb-3" />
                          <p className="text-sm font-medium">PDF Document</p>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <FileText className="h-16 w-16 text-gray-400" />
                        </div>
                      )}

                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-4">
                        <Button size="sm" variant="secondary" onClick={() => openFile(doc.url)}>
                          <Eye className="h-5 w-5 mr-1" /> View
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => downloadFile(doc.url, `${employee.employeeId}_${doc.label}_${doc.filename}`)}
                        >
                          <Download className="h-5 w-5" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1">
                      <p className="text-xs text-gray-500 truncate">{doc.filename}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(doc.uploadedAt).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {uploadedDefault.length === 0 && customDocs.length === 0 && (
        <div className="text-center py-20">
          <FileText className="h-20 w-20 text-gray-300 mx-auto mb-4" />
          <p className="text-xl text-gray-500">No documents uploaded yet</p>
        </div>
      )}
    </div>
  );
}