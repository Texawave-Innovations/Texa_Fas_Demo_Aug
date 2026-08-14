import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Plus, Search, Lock, Unlock, ShieldAlert, FileText, Eye,
  Clock, History, UploadCloud, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getAllRecords, createRecord, updateRecord } from '@/services/firebase';
import { uploadFile, uploadRaw } from '@/services/cloudinary';
import { encryptFile, decryptToBlob } from '@/lib/vaultCrypto';
import { useAuth } from '@/context/AuthContext';
import {
  useVaultAccessSettings, canSeeClassification, canOpen, canManage,
  pendingRequest as findPendingRequest,
} from './vaultAccess';
import {
  VAULT_CATEGORIES,
  type VaultDocument, type VaultDocumentVersion, type VaultAccessRequest,
  type VaultCategory, type VaultClassification,
} from '@/types/vault';

const emptyForm = () => ({
  title: '',
  category: VAULT_CATEGORIES[0] as VaultCategory,
  classification: 'commercial' as VaultClassification,
  restricted: false,
  description: '',
  tags: '',
});

export default function VaultDocuments() {
  const { user } = useAuth();
  const { settings } = useVaultAccessSettings();
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [requests, setRequests] = useState<VaultAccessRequest[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [versioningDoc, setVersioningDoc] = useState<VaultDocument | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [requestDoc, setRequestDoc] = useState<VaultDocument | null>(null);
  const [requestReason, setRequestReason] = useState('');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const [docs, reqs] = await Promise.all([
      getAllRecords('vault/documents'),
      getAllRecords('vault/accessRequests'),
    ]);
    setDocuments((docs as VaultDocument[]).sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)));
    setRequests(reqs as VaultAccessRequest[]);
  };

  if (!user) return null;

  const canSeeDefenceOption = settings.defenceRoles.map((r) => r.toLowerCase()).includes(user.role.toLowerCase());

  const visibleDocs = documents
    .filter((d) => canSeeClassification(d, user, settings))
    .filter((d) => categoryFilter === 'all' || d.category === categoryFilter)
    .filter((d) => !search.trim() ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      (d.tags || []).some((t) => t.toLowerCase().includes(search.toLowerCase())));

  const openNew = () => {
    setVersioningDoc(null);
    setForm(emptyForm());
    setFile(null);
    setDialogOpen(true);
  };

  const openNewVersion = (doc: VaultDocument) => {
    setVersioningDoc(doc);
    setForm({
      ...emptyForm(),
      title: doc.title,
      category: doc.category,
      classification: doc.classification,
      restricted: doc.sensitivity === 'restricted',
    });
    setFile(null);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!versioningDoc && !form.title.trim()) { toast.error('Title is required'); return; }
    if (!file) { toast.error('Select a file to upload'); return; }
    setUploading(true);
    try {
      let versionEntry: VaultDocumentVersion;
      if (form.restricted) {
        const { blob, keyB64, ivB64 } = await encryptFile(file);
        const fileUrl = await uploadRaw(blob, `${file.name}.enc`);
        versionEntry = {
          version: (versioningDoc?.currentVersion || 0) + 1,
          fileUrl, fileName: file.name, fileType: file.type || 'application/octet-stream',
          fileSize: file.size, encrypted: true, encryptedKey: keyB64, iv: ivB64,
          uploadedBy: user.username, uploadedByName: user.name, uploadedAt: Date.now(),
        };
      } else {
        const fileUrl = await uploadFile(file);
        versionEntry = {
          version: (versioningDoc?.currentVersion || 0) + 1,
          fileUrl, fileName: file.name, fileType: file.type || 'application/octet-stream',
          fileSize: file.size, encrypted: false,
          uploadedBy: user.username, uploadedByName: user.name, uploadedAt: Date.now(),
        };
      }

      const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);

      if (versioningDoc) {
        await updateRecord('vault/documents', versioningDoc.id, {
          currentVersion: versionEntry.version,
          versions: [...versioningDoc.versions, versionEntry],
          sensitivity: form.restricted ? 'restricted' : 'standard',
          description: form.description || versioningDoc.description,
          tags: tags.length ? tags : versioningDoc.tags,
        });
        toast.success(`New version uploaded for "${versioningDoc.title}"`);
      } else {
        await createRecord('vault/documents', {
          title: form.title.trim(),
          category: form.category,
          classification: form.classification,
          sensitivity: form.restricted ? 'restricted' : 'standard',
          tags,
          description: form.description || undefined,
          currentVersion: 1,
          versions: [versionEntry],
          status: 'active',
          uploadedBy: user.username,
          uploadedByName: user.name,
        });
        toast.success('Document added to Vault');
      }

      setDialogOpen(false);
      loadAll();
    } catch (err) {
      console.error(err);
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const openDocument = async (doc: VaultDocument) => {
    const latest = doc.versions[doc.versions.length - 1];
    if (!latest) return;
    if (!latest.encrypted) {
      window.open(latest.fileUrl, '_blank');
      return;
    }
    setOpeningId(doc.id);
    try {
      const res = await fetch(latest.fileUrl);
      const buf = await res.arrayBuffer();
      const blob = await decryptToBlob(buf, latest.encryptedKey!, latest.iv!, latest.fileType);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error(err);
      toast.error('Could not decrypt document');
    } finally {
      setOpeningId(null);
    }
  };

  const submitRequest = async () => {
    if (!requestDoc) return;
    setRequesting(true);
    try {
      await createRecord('vault/accessRequests', {
        documentId: requestDoc.id,
        documentTitle: requestDoc.title,
        requestedBy: user.username,
        requestedByName: user.name,
        requestedByRole: user.role,
        reason: requestReason || undefined,
        status: 'pending',
        requestedAt: Date.now(),
      });
      toast.success('Access request sent to the approver');
      setRequestDoc(null);
      setRequestReason('');
      loadAll();
    } catch {
      toast.error('Failed to send request');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search documents or tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {VAULT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{visibleDocs.length} document{visibleDocs.length === 1 ? '' : 's'}</span>
          <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1" />Upload Document</Button>
        </div>
      </div>

      {visibleDocs.length === 0 ? (
        <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">No documents match — try clearing filters, or upload the first one.</CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {visibleDocs.map((doc) => {
            const latest = doc.versions[doc.versions.length - 1];
            const openable = canOpen(doc, user, settings, requests);
            const pending = findPendingRequest(doc, user, requests);
            const manageable = canManage(doc, user, settings);
            return (
              <Card key={doc.id} className="flex flex-col">
                <CardContent className="pt-4 pb-3 flex-1 flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-semibold truncate" title={doc.title}>{doc.title}</span>
                    </div>
                    {doc.sensitivity === 'restricted' ? (
                      <Lock className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    ) : (
                      <Unlock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">{doc.category}</Badge>
                    <Badge variant="secondary" className="text-[10px]">v{doc.currentVersion}</Badge>
                    {doc.classification === 'defence-unit' && (
                      <Badge className="text-[10px] bg-purple-100 text-purple-800 border-0 flex items-center gap-1">
                        <ShieldAlert className="h-2.5 w-2.5" />Defence Division
                      </Badge>
                    )}
                    {latest?.encrypted && (
                      <Badge className="text-[10px] bg-slate-800 text-white border-0">Encrypted</Badge>
                    )}
                  </div>

                  {doc.description && <p className="text-xs text-muted-foreground line-clamp-2">{doc.description}</p>}

                  <div className="text-[11px] text-muted-foreground mt-auto pt-1">
                    Uploaded by {doc.uploadedByName} · {new Date(doc.updatedAt || doc.createdAt).toLocaleDateString()}
                  </div>
                </CardContent>

                <div className="border-t px-4 py-2.5 flex items-center justify-between gap-2">
                  {manageable ? (
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openNewVersion(doc)}>
                      <History className="h-3 w-3 mr-1" />New version
                    </Button>
                  ) : <span />}
                  {openable ? (
                    <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => openDocument(doc)} disabled={openingId === doc.id}>
                      {openingId === doc.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Eye className="h-3 w-3 mr-1" />}
                      {latest?.encrypted ? 'Decrypt & View' : 'View'}
                    </Button>
                  ) : pending ? (
                    <Badge variant="outline" className="text-[10px] flex items-center gap-1"><Clock className="h-2.5 w-2.5" />Approval pending</Badge>
                  ) : (
                    <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => setRequestDoc(doc)}>
                      <Lock className="h-3 w-3 mr-1" />Request Access
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Upload / new-version dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{versioningDoc ? `New version — ${versioningDoc.title}` : 'Upload Document'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            {!versioningDoc && (
              <div>
                <Label className="text-xs">Title</Label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Assembly Line Layout Drawing — Rev C" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as VaultCategory }))} disabled={!!versioningDoc}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{VAULT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Entity</Label>
                <Select
                  value={form.classification}
                  onValueChange={(v) => setForm((f) => ({ ...f, classification: v as VaultClassification }))}
                  disabled={!!versioningDoc || !canSeeDefenceOption}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    {canSeeDefenceOption && <SelectItem value="defence-unit">Defence Division</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between border rounded-lg px-3 py-2.5">
              <div>
                <p className="text-xs font-medium">Restricted — requires CMMS approval to open</p>
                <p className="text-[11px] text-muted-foreground">File is AES-256 encrypted in your browser before upload; the key is only released once a request is approved.</p>
              </div>
              <Switch checked={form.restricted} onCheckedChange={(v) => setForm((f) => ({ ...f, restricted: v }))} />
            </div>

            <div>
              <Label className="text-xs">Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            {!versioningDoc && (
              <div>
                <Label className="text-xs">Tags (comma separated)</Label>
                <Input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="e.g. thruster, classification-society" />
              </div>
            )}

            <div>
              <Label className="text-xs">File</Label>
              <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg py-4 cursor-pointer hover:bg-muted/40 text-sm text-muted-foreground">
                <UploadCloud className="h-4 w-4" />
                {file ? file.name : 'Click to choose a file'}
                <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={uploading}>
              {uploading ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Uploading...</> : 'Save to Vault'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request access dialog */}
      <Dialog open={!!requestDoc} onOpenChange={(v) => !v && setRequestDoc(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Request access — {requestDoc?.title}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            This document is restricted. Your request goes to the CMMS approver, who can grant, deny, or time-box access.
          </p>
          <div>
            <Label className="text-xs">Reason (optional)</Label>
            <Textarea rows={3} value={requestReason} onChange={(e) => setRequestReason(e.target.value)} placeholder="Why do you need this document?" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestDoc(null)}>Cancel</Button>
            <Button onClick={submitRequest} disabled={requesting}>{requesting ? 'Sending...' : 'Send Request'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
