import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Eye, Download, Trash2, Upload, X, Search, FileText, Folder, AlertCircle } from "lucide-react";
import { createRecord, getAllRecords, deleteRecord } from "@/services/firebase";

const CLOUDINARY_UPLOAD_PRESET = "unsigned_preset";
const CLOUDINARY_CLOUD_NAME = "dkzwhqhbr";

const CLOUDINARY_IMAGE_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
const CLOUDINARY_RAW_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`;

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB in bytes

type DocType = "attendance" | "salary" | "esi" | "pf" | "other";

interface DocumentFolder {
  id: string;
  folderName: string;
  type: DocType;
  createdAt: string;
}

interface Document {
  id: string;
  folderId: string;
  filename: string;
  url: string;
  uploadedAt: string;
  uploadedBy?: string;
}

export default function HrDocumentsCenter() {
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeType, setActiveType] = useState<DocType>("attendance");
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  // Upload states
  const [folderName, setFolderName] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileError, setFileError] = useState("");

  // Filter states
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      const folderList = await getAllRecords("hr/documentFolders");
      const documentList = await getAllRecords("hr/documents");
      
      setFolders(folderList as DocumentFolder[]);
      setDocuments(documentList as Document[]);
    } catch (error) {
      console.error("Failed to load data:", error);
    }
  };

  const createFolder = async () => {
    if (!folderName.trim()) return;

    const newFolder: Omit<DocumentFolder, "id"> = {
      folderName: folderName.trim(),
      type: activeType,
      createdAt: new Date().toISOString(),
    };

    await createRecord("hr/documentFolders", newFolder);
    setFolderName("");
    loadAllData();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError("");
    const selectedFile = e.target.files?.[0];
    
    if (!selectedFile) {
      setFile(null);
      return;
    }

    // Check file size
    if (selectedFile.size > MAX_FILE_SIZE) {
      const sizeMB = (selectedFile.size / (1024 * 1024)).toFixed(2);
      setFileError(`File size (${sizeMB}MB) exceeds the 2MB limit. Please select a smaller file.`);
      setFile(null);
      e.target.value = ""; // Reset input
      return;
    }

    setFile(selectedFile);
  };

  const openFile = (url: string) => window.open(url, "_blank");

  const getDownloadUrl = (url: string) =>
    url.includes("/upload/") ? url.replace("/upload/", "/upload/fl_attachment:/") : url;

  const uploadToCloudinary = async () => {
    if (!file || !selectedFolderId) return;

    // Double-check file size before upload
    if (file.size > MAX_FILE_SIZE) {
      setFileError("File size exceeds 2MB limit");
      return;
    }

    setUploading(true);
    setProgress(10);

    const isImage = /\.(jpg|jpeg|png|webp)$/i.test(file.name);
    const uploadUrl = isImage ? CLOUDINARY_IMAGE_UPLOAD_URL : CLOUDINARY_RAW_UPLOAD_URL;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("folder", `hr/documents/${activeType}/${selectedFolderId}`);

    try {
      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      setProgress(80);

      if (data.secure_url) {
        const newDoc: Omit<Document, "id"> = {
          folderId: selectedFolderId,
          filename: file.name,
          url: data.secure_url,
          uploadedAt: new Date().toISOString(),
          uploadedBy: JSON.parse(localStorage.getItem("erpuser") || "{}")?.username || "",
        };

        await createRecord("hr/documents", newDoc);
        setProgress(100);
        setTimeout(() => {
          setProgress(0);
          setFile(null);
          setFileError("");
          loadAllData();
        }, 1000);
      }
    } catch (err) {
      console.error(err);
      setFileError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const deleteDocument = async (id: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    await deleteRecord("hr/documents", id);
    loadAllData();
  };

  const deleteFolder = async (folderId: string) => {
    if (!confirm("Delete this folder and all documents inside?")) return;
    
    // Delete documents in folder first
    const folderDocs = documents.filter(d => d.folderId === folderId);
    for (const doc of folderDocs) {
      await deleteRecord("hr/documents", doc.id);
    }
    
    // Delete folder
    await deleteRecord("hr/documentFolders", folderId);
    loadAllData();
  };

  const typeFolders = useMemo(() => 
    folders.filter(f => f.type === activeType), 
    [folders, activeType]
  );

  const activeFolderDocs = useMemo(() => {
    if (!activeFolderId) return [];
    return documents.filter(d => d.folderId === activeFolderId);
  }, [documents, activeFolderId]);

  const filteredDocs = useMemo(() => {
    return activeFolderDocs
      .filter(d => 
        d.filename.toLowerCase().includes(search.toLowerCase())
      )
      .filter(d => {
        if (!dateFrom && !dateTo) return true;
        const date = new Date(d.uploadedAt).toISOString().slice(0, 10);
        if (dateFrom && date < dateFrom) return false;
        if (dateTo && date > dateTo) return false;
        return true;
      })
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }, [activeFolderDocs, search, dateFrom, dateTo]);

  const currentTitle = 
    activeType === "attendance" ? "Attendance" :
    activeType === "salary" ? "Salary" :
    activeType === "esi" ? "ESI" :
    activeType === "pf" ? "PF" : "Other";

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 pb-20 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-600" />
              HR Document Center
            </h1>
            <p className="text-gray-600 mt-2">
              Organize documents in folders for {currentTitle} and other HR categories
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">
              {folders.length} Folders | {documents.length} Documents
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeType} onValueChange={(v) => setActiveType(v as DocType)}>
        <TabsList className="grid grid-cols-5 w-full md:w-[700px] bg-white border border-gray-200 rounded-xl shadow-sm p-1">
          <TabsTrigger 
            value="attendance" 
            className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:shadow-sm rounded-lg"
          >
            Attendance
          </TabsTrigger>
          <TabsTrigger 
            value="salary" 
            className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:shadow-sm rounded-lg"
          >
            Salary
          </TabsTrigger>
          <TabsTrigger 
            value="esi" 
            className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:shadow-sm rounded-lg"
          >
            ESI
          </TabsTrigger>
          <TabsTrigger 
            value="pf" 
            className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:shadow-sm rounded-lg"
          >
            PF
          </TabsTrigger>
          <TabsTrigger 
            value="other" 
            className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:shadow-sm rounded-lg"
          >
            Others
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeType} className="space-y-6 pt-6">
          {/* Folder Creation Section */}
          <Card className="border border-gray-200 shadow-sm p-6 bg-white">
            <div className="flex items-center gap-3 mb-4">
              <Folder className="h-6 w-6 text-blue-600" />
              <h3 className="text-xl font-semibold text-gray-900">Create New Folder</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="md:col-span-2">
                <Label className="text-sm font-medium text-gray-700 mb-2">Folder Name</Label>
                <Input
                  placeholder={`e.g. "Dec 2025 Attendance", "Q4 Salary Slips", "ESI Returns 2025"`}
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  className="h-12 text-base"
                />
              </div>
              <Button 
                className="h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium px-8"
                onClick={createFolder}
                disabled={!folderName.trim()}
              >
                Create Folder
              </Button>
            </div>
          </Card>

          {/* Folders List */}
          <Card className="border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                Folders ({typeFolders.length})
              </h3>
            </div>
            <div className="p-6">
              {typeFolders.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Folder className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg">No folders created yet</p>
                  <p className="text-sm mt-2">Create your first folder above</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {typeFolders.map((folder) => {
                    const folderDocCount = documents.filter(d => d.folderId === folder.id).length;
                    return (
                      <Card
                        key={folder.id}
                        className={`border-2 p-6 cursor-pointer hover:shadow-md transition-all hover:bg-blue-50 ${
                          activeFolderId === folder.id 
                            ? "border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-200" 
                            : "border-gray-200 hover:border-blue-300"
                        }`}
                        onClick={() => setActiveFolderId(folder.id)}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={`p-3 rounded-lg ${
                              activeFolderId === folder.id 
                                ? "bg-blue-600 text-white" 
                                : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                            }`}>
                              <Folder className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="font-semibold text-gray-900 truncate text-sm">{folder.folderName}</h4>
                              <p className="text-xs text-gray-500 capitalize">{folder.type}</p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 h-auto w-auto -mr-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteFolder(folder.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="text-sm space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Documents</span>
                            <span className="font-semibold text-gray-900">{folderDocCount}</span>
                          </div>
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>Created</span>
                            <span>{new Date(folder.createdAt).toLocaleDateString("en-IN")}</span>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          {/* Active Folder Documents */}
          {activeFolderId && (
            <Card className="border border-gray-200 shadow-sm bg-white">
              <div className="p-6 bg-blue-50 border-b border-blue-200 rounded-t-lg">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <Folder className="h-6 w-6 text-blue-600" />
                    <div>
                      <h4 className="text-xl font-semibold text-gray-900">
                        Documents in this Folder
                      </h4>
                      <p className="text-sm text-gray-600">
                        {typeFolders.find(f => f.id === activeFolderId)?.folderName}
                      </p>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">
                    {activeFolderDocs.length} documents total
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Upload Section */}
                <Card className="p-6 border border-gray-200 bg-gray-50">
                  <h5 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Upload className="h-5 w-5 text-blue-600" />
                    Upload Document (Max 2MB)
                  </h5>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-700 mb-2 block">Select Folder</Label>
                      <select
                        value={selectedFolderId}
                        onChange={(e) => setSelectedFolderId(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Choose folder...</option>
                        {typeFolders.map(folder => (
                          <option key={folder.id} value={folder.id}>
                            {folder.folderName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-700 mb-2 block">File (Max 2MB)</Label>
                      <Input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx,.xls"
                        onChange={handleFileSelect}
                        className="file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                    </div>
                    <div className="md:col-span-2 flex items-end">
                      <Button
                        className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium px-8"
                        onClick={uploadToCloudinary}
                        disabled={!file || !selectedFolderId || uploading || !!fileError}
                      >
                        {uploading ? "Uploading..." : "Upload Document"}
                      </Button>
                    </div>
                  </div>

                  {/* File Size Error */}
                  {fileError && (
                    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-red-800">Upload Error</p>
                        <p className="text-sm text-red-700 mt-1">{fileError}</p>
                      </div>
                    </div>
                  )}

                  {uploading && (
                    <div className="mt-6 space-y-3">
                      <Progress value={progress} className="h-3" />
                      <div className="flex items-center justify-between text-sm text-gray-700">
                        <span>Uploading {file?.name}</span>
                        <span>{progress}%</span>
                      </div>
                    </div>
                  )}

                  {file && !uploading && !fileError && (
                    <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-green-900 truncate max-w-[300px]">
                            {file.name}
                          </p>
                          <p className="text-xs text-green-700 mt-1">
                            Size: {(file.size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => {
                            setFile(null);
                            setFileError("");
                          }}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>

                {/* Filters */}
                <div className="flex flex-wrap gap-4 items-end p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                    <Search className="h-5 w-5 text-gray-500" />
                    <Input
                      placeholder="Search by filename..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <div>
                      <Label className="text-xs text-gray-700 block mb-1">From</Label>
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="h-10 w-32"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-700 block mb-1">To</Label>
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="h-10 w-32"
                      />
                    </div>
                    {(dateFrom || dateTo) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 px-4"
                        onClick={() => {
                          setDateFrom("");
                          setDateTo("");
                        }}
                      >
                        Clear Dates
                      </Button>
                    )}
                  </div>
                </div>

                {/* Documents Table */}
                <Card className="border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <h5 className="text-lg font-semibold text-gray-900">
                        All Documents ({filteredDocs.length})
                      </h5>
                      <span className="text-sm text-gray-600">
                        Showing {filteredDocs.length} of {activeFolderDocs.length}
                      </span>
                    </div>
                  </div>
                  
                  {filteredDocs.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <h6 className="text-lg font-semibold mb-2">No documents found</h6>
                      <p>Try adjusting your search or date filters</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="p-4 text-left font-semibold text-gray-800 border-b border-gray-200">Filename</th>
                            <th className="p-4 text-left font-semibold text-gray-800 border-b border-gray-200">Uploaded</th>
                            <th className="p-4 text-left font-semibold text-gray-800 border-b border-gray-200">By</th>
                            <th className="p-4 text-center font-semibold text-gray-800 border-b border-gray-200">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredDocs.map((doc) => (
                            <tr key={doc.id} className="hover:bg-gray-50 border-b border-gray-100">
                              <td className="p-4 font-medium text-gray-900 max-w-[300px] truncate">
                                {doc.filename}
                              </td>
                              <td className="p-4 text-sm text-gray-700">
                                {new Date(doc.uploadedAt).toLocaleString("en-IN", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })}
                              </td>
                              <td className="p-4 text-sm text-gray-600">
                                {doc.uploadedBy || "-"}
                              </td>
                              <td className="p-4 flex items-center gap-2 justify-center">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-9 w-9 p-0 border-gray-300 hover:bg-blue-50 hover:border-blue-300"
                                  onClick={() => openFile(doc.url)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-9 w-9 p-0 bg-green-50 hover:bg-green-100 border border-green-200 text-green-700"
                                  onClick={() => window.open(getDownloadUrl(doc.url), "_blank")}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-9 w-9 p-0 border-red-200 hover:bg-red-50"
                                  onClick={() => deleteDocument(doc.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
