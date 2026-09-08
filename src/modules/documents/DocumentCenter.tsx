// src/modules/documents/DocumentCenter.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { LiveClock } from '@/components/layout/LiveClock';
import { useToast } from '@/components/ui/use-toast';
import {
  FasDocumentItem,
  FasModuleId,
  SelectedItemMap,
  ExportProgressState,
} from './documentTypes';
import { FAS_MODULES_CONFIG, INITIAL_DEMO_DOCUMENTS } from './mockFasDocumentData';
import { DocumentHeader } from './components/DocumentHeader';
import { ModuleCards } from './components/ModuleCards';
import { SubTabsBar } from './components/SubTabsBar';
import { BatchActionBar } from './components/BatchActionBar';
import { DocumentTable } from './components/DocumentTable';
import {
  DocumentPreviewDialog,
  DocumentTemplateRenderer,
  captureElementToPdfBlob,
} from './templates/DocumentPreviewDialog';
import { exportDocumentsToZip } from './utils/zipExportService';
import { database } from '@/services/firebase';
import { ref, onValue, off } from 'firebase/database';

export default function DocumentCenter() {
  const { toast } = useToast();

  // Navigation State
  const [activeModuleId, setActiveModuleId] = useState<FasModuleId>('sales');
  const [activeSubTabId, setActiveSubTabId] = useState<string>('quotations');

  // Filters
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-09');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Selection Map (doc.id -> doc)
  const [selectedItems, setSelectedItems] = useState<SelectedItemMap>({});

  // Modal State
  const [previewItem, setPreviewItem] = useState<FasDocumentItem | null>(null);

  // Export State
  const [exportState, setExportState] = useState<ExportProgressState>({
    isExporting: false,
    total: 0,
    current: 0,
    currentName: '',
  });

  // Master Document List (100% Live Firebase data, zero mock seeds)
  const [documents, setDocuments] = useState<FasDocumentItem[]>([]);

  // Hidden Offscreen Batch PDF Render State & Ref
  const [batchRenderItem, setBatchRenderItem] = useState<FasDocumentItem | null>(null);
  const batchPrintRef = React.useRef<HTMLDivElement>(null);

  // Listen to Firebase Realtime Database for live documents across ERP modules
  useEffect(() => {
    const listeners: Array<{ refObj: any; callback: (snapshot: any) => void }> = [];

    // Robust date-to-ISO string normalizer
    const parseToIso = (raw: any): string => {
      if (!raw) return '2026-09-01';
      if (typeof raw === 'number') {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      }
      const str = String(raw).trim();
      if (str.includes('T')) return str.split('T')[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
      if (str.includes('/')) {
        const parts = str.split('/');
        if (parts.length === 3) {
          // Check if DD/MM/YYYY or MM/DD/YYYY or YYYY/MM/DD
          if (parts[2].length === 4) {
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }
      }
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
      return '2026-09-01';
    };

    // Helper to register a live listener
    const registerListener = (
      collectionPath: string,
      mapper: (key: string, data: any) => FasDocumentItem | null,
      prefix: string
    ) => {
      const dbRef = ref(database, collectionPath);
      const callback = (snapshot: any) => {
        const val = snapshot.val();
        if (val) {
          const liveItems: FasDocumentItem[] = [];
          Object.keys(val).forEach((k) => {
            const mapped = mapper(k, val[k]);
            if (mapped) liveItems.push(mapped);
          });

          setDocuments((prev) => {
            const withoutCurrentCollection = prev.filter((d) => !d.id.startsWith(prefix));
            return [...withoutCurrentCollection, ...liveItems];
          });
        } else {
          // If collection is empty in DB, remove any existing items for this collection
          setDocuments((prev) => prev.filter((d) => !d.id.startsWith(prefix)));
        }
      };

      onValue(dbRef, callback);
      listeners.push({ refObj: dbRef, callback });
    };

    // 1. Sales - Quotations
    registerListener(
      'sales/quotations',
      (key, q) => {
        const rawDate = q.quoteDate || q.date || q.createdAt;
        const iso = parseToIso(rawDate);
        return {
          id: `live-quo-${key}`,
          code: q.quoteNumber || `QUO-${key.slice(0, 6)}`,
          title: q.subject || (q.isWalkIn ? 'Walk-in Customer Quotation' : 'Sales Quotation'),
          party: q.customerName || (q.isWalkIn ? 'Walk-in Customer' : 'Valued Customer'),
          date: iso,
          isoDate: iso,
          amount: q.grandTotal ?? q.subtotal ?? 0,
          status: q.status || 'Draft',
          category: 'Quotation',
          moduleId: 'sales',
          subTabId: 'quotations',
          details: q,
        };
      },
      'live-quo-'
    );

    // 2. Sales - Invoices
    registerListener(
      'sales/invoices',
      (key, inv) => {
        const rawDate = inv.invoiceDate || inv.date || inv.createdAt;
        const iso = parseToIso(rawDate);
        return {
          id: `live-inv-${key}`,
          code: inv.invoiceNumber || `INV-${key.slice(0, 6)}`,
          title: inv.remarks || 'Tax Invoice',
          party: inv.customerName || inv.party || 'Valued Customer',
          date: iso,
          isoDate: iso,
          amount: inv.grandTotal ?? inv.totalAmount ?? 0,
          status: inv.status || 'Paid',
          category: 'Tax Invoice',
          moduleId: 'sales',
          subTabId: 'invoices',
          details: inv,
        };
      },
      'live-inv-'
    );

    // 3. Sales - Orders / Acknowledgements
    registerListener(
      'sales/orderAcknowledgements',
      (key, ord) => {
        const rawDate = ord.orderDate || ord.date || ord.createdAt;
        const iso = parseToIso(rawDate);
        return {
          id: `live-ord-${key}`,
          code: ord.orderNumber || ord.poNumber || `ORD-${key.slice(0, 6)}`,
          title: ord.orderTitle || 'Sales Order Acknowledgement',
          party: ord.customerName || 'Valued Customer',
          date: iso,
          isoDate: iso,
          amount: ord.grandTotal ?? ord.netAmount ?? 0,
          status: ord.status || 'Approved',
          category: 'Order Confirmation',
          moduleId: 'sales',
          subTabId: 'orders',
          details: ord,
        };
      },
      'live-ord-'
    );

    // 4. Sales - Delivery Challans
    registerListener(
      'sales/deliveryChallans',
      (key, dc) => {
        const rawDate = dc.dcDate || dc.date || dc.createdAt;
        const iso = parseToIso(rawDate);
        return {
          id: `live-dc-${key}`,
          code: dc.dcNumber || `DC-${key.slice(0, 6)}`,
          title: dc.purpose || 'Delivery Challan',
          party: dc.customerName || dc.consignee || 'Consignee',
          date: iso,
          isoDate: iso,
          status: dc.status || 'Completed',
          category: 'Delivery Challan',
          moduleId: 'sales',
          subTabId: 'challan',
          details: dc,
        };
      },
      'live-dc-'
    );

    // 5. Sales - Gate Passes
    registerListener(
      'sales/gatePasses',
      (key, gp) => {
        const rawDate = gp.passDate || gp.date || gp.createdAt;
        const iso = parseToIso(rawDate);
        return {
          id: `live-gp-${key}`,
          code: gp.gatePassNumber || gp.passNumber || `GP-${key.slice(0, 6)}`,
          title: gp.reason || (gp.type === 'Non-Returnable' ? 'Non-Returnable Gate Pass' : 'Returnable Gate Pass'),
          party: gp.partyName || gp.carrierName || 'Authorized Bearer',
          date: iso,
          isoDate: iso,
          status: gp.status || 'Approved',
          category: 'Gate Pass',
          moduleId: 'sales',
          subTabId: 'gatepass',
          details: gp,
        };
      },
      'live-gp-'
    );

    // 6. HR - Employees
    registerListener(
      'hr/employees',
      (key, emp) => {
        const rawDate = emp.joiningDate || emp.createdAt;
        const iso = parseToIso(rawDate);
        const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name || 'Employee';
        return {
          id: `live-emp-${key}`,
          code: emp.employeeId || `EMP-${key.slice(0, 4)}`,
          title: `Employee Dossier & KYC — ${fullName}`,
          party: `${fullName} (${emp.designation || 'Staff'})`,
          date: iso,
          isoDate: iso,
          status: emp.status || 'Active',
          category: 'Employee Dossier',
          moduleId: 'hr',
          subTabId: 'documents',
          details: emp,
        };
      },
      'live-emp-'
    );

    // 7. Production - Work Orders
    registerListener(
      'production/workOrders',
      (key, wo) => {
        const rawDate = wo.orderDate || wo.createdAt;
        const iso = parseToIso(rawDate);
        return {
          id: `live-wo-${key}`,
          code: wo.workOrderNumber || `WO-${key.slice(0, 6)}`,
          title: wo.description || `Production Job — ${wo.itemName || 'Machined Part'}`,
          party: wo.assignedTo || wo.machineCell || 'Manufacturing Cell',
          date: iso,
          isoDate: iso,
          status: wo.status || 'Approved',
          category: 'Work Order',
          moduleId: 'quality_production',
          subTabId: 'work_orders',
          details: wo,
        };
      },
      'live-wo-'
    );

    return () => {
      listeners.forEach(({ refObj, callback }) => {
        off(refObj, 'value', callback);
      });
    };
  }, []);

  // Update active subtab when switching module
  const currentModule = useMemo(() => {
    return FAS_MODULES_CONFIG.find((m) => m.id === activeModuleId) || FAS_MODULES_CONFIG[0];
  }, [activeModuleId]);

  const handleSelectModule = (modId: FasModuleId) => {
    setActiveModuleId(modId);
    const mod = FAS_MODULES_CONFIG.find((m) => m.id === modId);
    if (mod && mod.tabs.length > 0) {
      setActiveSubTabId(mod.tabs[0].id);
    }
  };

  // Filter documents based on active module, sub-tab, month, and search query
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      // Module and Sub-tab match
      if (doc.moduleId !== activeModuleId) return false;
      if (doc.subTabId !== activeSubTabId) return false;

      // Month match (e.g. "2026-09")
      if (selectedMonth !== 'all') {
        if (!doc.isoDate.startsWith(selectedMonth)) return false;
      }

      // Search match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const codeMatch = doc.code.toLowerCase().includes(q);
        const partyMatch = doc.party.toLowerCase().includes(q);
        const titleMatch = doc.title.toLowerCase().includes(q);
        if (!codeMatch && !partyMatch && !titleMatch) return false;
      }

      return true;
    });
  }, [documents, activeModuleId, activeSubTabId, selectedMonth, searchQuery]);

  // Selection handlers
  const handleToggleItem = (item: FasDocumentItem) => {
    setSelectedItems((prev) => {
      const next = { ...prev };
      if (next[item.id]) {
        delete next[item.id];
      } else {
        next[item.id] = item;
      }
      return next;
    });
  };

  const selectedInCurrentTabCount = useMemo(() => {
    return filteredDocuments.filter((d) => !!selectedItems[d.id]).length;
  }, [filteredDocuments, selectedItems]);

  const isAllInTabSelected =
    filteredDocuments.length > 0 && selectedInCurrentTabCount === filteredDocuments.length;

  const handleToggleSelectAllInTab = () => {
    setSelectedItems((prev) => {
      const next = { ...prev };
      if (isAllInTabSelected) {
        // Deselect all in current filtered view
        filteredDocuments.forEach((doc) => {
          delete next[doc.id];
        });
      } else {
        // Select all in current filtered view
        filteredDocuments.forEach((doc) => {
          next[doc.id] = doc;
        });
      }
      return next;
    });
  };

  const handleClearAllSelected = () => {
    setSelectedItems({});
  };

  // Refresh trigger
  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      toast({
        title: 'Document Center Synchronized',
        description: 'Latest records and documents are up to date.',
      });
    }, 500);
  };

  // Batch ZIP Download using authentic template rendering
  const handleBatchDownload = async () => {
    const itemsToExport = Object.values(selectedItems);
    if (itemsToExport.length === 0) {
      toast({
        title: 'No Documents Selected',
        description: 'Please check one or more documents to batch download.',
        variant: 'destructive',
      });
      return;
    }

    setExportState({
      isExporting: true,
      total: itemsToExport.length,
      current: 0,
      currentName: '',
    });

    try {
      // Authentic template blob generator
      const generateAuthenticPdfBlob = async (item: FasDocumentItem): Promise<Blob> => {
        setBatchRenderItem(item);
        // Wait for React to mount the component and sub-elements
        await new Promise((r) => setTimeout(r, 120));

        if (!batchPrintRef.current) {
          throw new Error('Offscreen container not mounted');
        }

        const isLandscape = item.subTabId === 'quotations' || item.subTabId === 'invoices';
        const blob = await captureElementToPdfBlob(batchPrintRef.current, isLandscape);
        return blob;
      };

      await exportDocumentsToZip(
        itemsToExport,
        selectedMonth === 'all' ? 'All_Periods' : selectedMonth,
        generateAuthenticPdfBlob,
        (current, total, name) => {
          setExportState((prev) => ({ ...prev, current, name }));
        }
      );

      toast({
        title: 'Package Downloaded',
        description: `Successfully zipped ${itemsToExport.length} documents with authentic print templates.`,
      });
    } catch (err) {
      console.error('Batch export error:', err);
      toast({
        title: 'Export Failed',
        description: 'An error occurred while building the ZIP package.',
        variant: 'destructive',
      });
    } finally {
      setBatchRenderItem(null);
      setExportState({
        isExporting: false,
        total: 0,
        current: 0,
        currentName: '',
      });
    }
  };

  return (
    <Layout>
      <div className="space-y-4 pb-12 animate-fade-in">
        {/* Page Top Header with Title & LiveClock */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-10 rounded-full bg-gradient-to-b from-primary to-primary/20" />
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">
                Document Center
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Centralized document generation, print preview &amp; batch ZIP archiving
              </p>
            </div>
          </div>
          <LiveClock />
        </div>

        {/* Header Bar Banner (Matches Reference Image) */}
        <DocumentHeader
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          onClearMonth={() => setSelectedMonth('all')}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />

        {/* 4 Module Selection Cards */}
        <ModuleCards
          modules={FAS_MODULES_CONFIG}
          activeModuleId={activeModuleId}
          onSelectModule={handleSelectModule}
          selectedItems={selectedItems}
        />

        {/* Sub-Tabs Pill Bar + Search Input */}
        <SubTabsBar
          tabs={currentModule.tabs}
          activeSubTabId={activeSubTabId}
          onSelectSubTab={setActiveSubTabId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          documents={documents.filter((d) => d.moduleId === activeModuleId)}
          selectedItems={selectedItems}
        />

        {/* Batch Action Bar (Select All, Month Filter Tag, Green Download Package Button) */}
        <BatchActionBar
          tabRecordCount={filteredDocuments.length}
          selectedInTabCount={selectedInCurrentTabCount}
          totalSelectedCount={Object.keys(selectedItems).length}
          onSelectAllToggle={handleToggleSelectAllInTab}
          isAllInTabSelected={isAllInTabSelected}
          onClearAll={handleClearAllSelected}
          onDownloadZip={handleBatchDownload}
          selectedMonth={selectedMonth}
          isExporting={exportState.isExporting}
        />

        {/* Document Records Table */}
        <DocumentTable
          documents={filteredDocuments}
          selectedItems={selectedItems}
          onToggleItem={handleToggleItem}
          onPreview={setPreviewItem}
        />

        {/* Live Document Preview Dialog */}
        <DocumentPreviewDialog
          item={previewItem}
          isOpen={!!previewItem}
          onClose={() => setPreviewItem(null)}
        />

        {/* Hidden Offscreen Container for High-Fidelity Batch ZIP PDF Rendering */}
        {batchRenderItem && (
          <div
            style={{
              position: 'fixed',
              left: '-99999px',
              top: '0',
              opacity: 0,
              pointerEvents: 'none',
              zIndex: -1,
            }}
          >
            <div ref={batchPrintRef} style={{ width: 'fit-content', background: '#ffffff' }}>
              <DocumentTemplateRenderer item={batchRenderItem} />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

