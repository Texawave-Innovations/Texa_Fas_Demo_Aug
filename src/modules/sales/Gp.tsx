// src/modules/sales/Gp.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RowActions } from "@/components/ui/row-actions";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Edit,
  Download,
  Search,
  RefreshCw,
  Eye,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Customer } from "@/types";
import {
  createRecord,
  getAllRecords,
  getRecordById,
  updateRecord,
  deleteRecord,
} from "@/services/firebase";
import { generateNextNumber, peekNextNumber } from '@/services/runningNumberService';
import fas from "./fas.png"; // Your company logo
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// ---------------------- TYPES ----------------------

interface Address {
  id?: string;
  label?: string;
  street: string;
  area?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  type?: "billing" | "shipping";
  isDefault?: boolean;
}

interface RGPLineItem {
  id: string;
  productId?: string;
  productCode?: string;
  description: string;
  qty: number | string;
  uom?: string;
}

interface ReturnableGatePass {
  id?: string;
  rgpNumber: string;
  rgpDate: string;
  customerId: string | null;
  customerName: string;
  customerGST?: string;
  billingAddress?: Address | null;
  kindAttn?: string;
  phoneNumber?: string;
  lineItems: RGPLineItem[];
  totalQty: number;
  itemValue?: number; // optional, in Rs
  remarks?: string;
  createdAt?: number;
  updatedAt?: number;
}

// Flattened product item interface
interface FlatProductItem {
  id: string;
  productCode: string;
  category: string;
  group: string;
  hsn: string;
  stockQty: number;
  type: string;
  unit: string;
  unitPrice: number;
  parentName: string;
  parentId: string;
}

// ---------------------- SEARCHABLE COMBOBOX ----------------------

interface ComboboxProps {
  items: { value: string; label: string; sub?: string }[];
  value: string;
  onSelect: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}

function SearchableCombobox({ items, value, onSelect, placeholder = "Select...", searchPlaceholder = "Search...", disabled }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    return (
      item.label.toLowerCase().includes(q) ||
      (item.sub || "").toLowerCase().includes(q) ||
      item.value.toLowerCase().includes(q)
    );
  });

  const selected = items.find((i) => i.value === value);

  return (
    <div ref={ref} className="relative">
      <div
        className={`flex items-center border rounded-md px-3 h-10 cursor-pointer bg-white ${disabled ? "opacity-60 pointer-events-none" : "hover:border-blue-400"}`}
        onClick={() => !disabled && setOpen((p) => !p)}
      >
        <span className="flex-1 text-sm truncate text-gray-700">
          {selected ? selected.label : <span className="text-gray-400">{placeholder}</span>}
        </span>
        {value && !disabled && (
          <button
            onClick={(e) => { e.stopPropagation(); onSelect(""); setSearch(""); }}
            className="text-gray-400 hover:text-red-500 mr-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-xl overflow-hidden">
          <div className="p-2 border-b bg-gray-50">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
              <input
                autoFocus
                className="w-full text-sm border rounded pl-8 pr-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-400"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          <ul className="max-h-60 overflow-y-auto">
            {filtered.map((item) => (
              <li
                key={item.value}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b last:border-0 ${value === item.value ? "bg-blue-50 font-semibold" : ""}`}
                onClick={() => { onSelect(item.value); setOpen(false); setSearch(""); }}
              >
                <div className="font-medium truncate">{item.label}</div>
                {item.sub && <div className="text-xs text-gray-400 truncate">{item.sub}</div>}
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-sm text-gray-400 text-center">No results found</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}


// ---------------------- PAGINATION HELPERS ----------------------

const ITEMS_FIRST_PAGE = 8;
const ITEMS_OTHER_PAGES = 12;

function buildRGPPages(items: RGPLineItem[]): RGPLineItem[][] {
  if (items.length === 0) return [[]];
  const result: RGPLineItem[][] = [];
  
  result.push(items.slice(0, ITEMS_FIRST_PAGE));
  let rest = items.slice(ITEMS_FIRST_PAGE);
  
  while (rest.length > 0) {
    result.push(rest.slice(0, ITEMS_OTHER_PAGES));
    rest = rest.slice(ITEMS_OTHER_PAGES);
  }
  
  // Footer-alone guard: if last page is empty, move one item from prev page
  const last = result[result.length - 1];
  if (last.length === 0 && result.length > 1) {
    const prev = result[result.length - 2];
    const moved = prev.pop()!;
    result[result.length - 1] = [moved];
  }
  
  return result;
}


// ---------------------- PRINT TEMPLATE (WHITE BACKGROUND) ----------------------

const formatAddress = (addr?: Address | null) => {
  if (!addr) return "—";
  return `${addr.street}${addr.area ? `, ${addr.area}` : ""}\n${addr.city}, ${addr.state} - ${addr.pincode}\n${addr.country}`;
};


export const RGPPrintTemplate: React.FC<{ rgp: ReturnableGatePass }> = ({ rgp }) => {
  const items = rgp.lineItems || [];
  const pages = buildRGPPages(items);
  const totalPages = pages.length;

  return (
    <>
      <style>
        {`
          @media print {
            @page { size: A4 portrait; margin: 0; }
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
            .page-break { page-break-after: always; break-after: page; }
          }
          .print-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          .print-table td, .print-table th { border: 1.5px solid #000; padding: 4px 6px; vertical-align: middle; font-size: 11px; line-height: 1.3; word-wrap: break-word; overflow-wrap: break-word; }
          .print-table th { background: #e5e7eb; font-weight: 900; text-align: center; }
        `}
      </style>
      
      <div style={{ width: "794px", minWidth: "794px", flexShrink: 0 }}>
        {pages.map((pageItems, pageIndex) => {
          const isLastPage = pageIndex === totalPages - 1;
          const offset = pageIndex === 0 ? 0 : ITEMS_FIRST_PAGE + (pageIndex - 1) * ITEMS_OTHER_PAGES;
          
          return (
            <div key={pageIndex} className={`print-page ${!isLastPage ? "page-break" : ""}`} style={{ width: "794px", height: "1123px", maxHeight: "1123px", background: "#ffffff", margin: "0 auto 40px", padding: 0, fontFamily: "Arial, sans-serif", color: "#000", position: "relative", boxSizing: "border-box", overflow: "hidden" }}>
              <div style={{ border: "2.5px solid #000", height: "100%", maxHeight: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden" }}>
                
                {/* ── Company Header ── */}
                <div style={{ flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '2.5px solid #000', background: '#ffffff', gap: '10px' }}>
                    <img src={fas} alt="FAS Logo" style={{ width: '90px', height: 'auto', flexShrink: 0 }} />
                    <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
                      <h1 style={{ fontSize: '22px', fontWeight: '900', margin: 0, letterSpacing: '0.5px', color: '#000', lineHeight: 1.2 }}>Fluoro Automation Seals Pvt Ltd</h1>
                      <p style={{ fontSize: '11px', margin: '4px 0 0 0', color: '#000', lineHeight: 1.4, fontWeight: '700' }}>3/180, Rajiv Gandhi Road, Mettukuppam, Chennai Tamil Nadu 600097 India<br />Phone: +91-9841175097 | Email: fas@fluoroautomationseals.com</p>
                    </div>
                    <div style={{ width: '90px' }}></div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px 16px', background: '#e5e7eb', borderBottom: '2.5px solid #000', fontSize: '12px', fontWeight: '800', gap: '50px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}><span style={{ fontWeight: '900' }}>GSTIN:</span><span>33AAECF2716M1ZO</span></div>
                    <div style={{ display: 'flex', gap: '4px' }}><span style={{ fontWeight: '900' }}>PAN:</span><span>AAECF2716M</span></div>
                    <div style={{ display: 'flex', gap: '4px' }}><span style={{ fontWeight: '900' }}>CIN:</span><span>U25209TN2020PTC138498</span></div>
                  </div>
                </div>

                {/* ── Body ── */}
                <div style={{ flex: 1, padding: "10px 16px 15px 16px", display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
                  {pageIndex === 0 && (
                    <>
                      <h2 style={{ textAlign: 'center', fontSize: '18px', fontWeight: '900', margin: '0 0 10px 0', letterSpacing: '2px', flexShrink: 0 }}>RETURNABLE GATE PASS</h2>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '12px', marginBottom: '15px', flexShrink: 0 }}>
                        <div style={{ overflow: 'hidden' }}>
                          <p style={{ fontWeight: '900', fontSize: '12px', textDecoration: 'underline', margin: '0 0 4px 0' }}>To:</p>
                          <p style={{ fontWeight: '900', fontSize: '13px', margin: '0 0 4px 0' }}>{rgp.customerName || '—'}</p>
                          <p style={{ whiteSpace: 'pre-line', fontSize: '12px', lineHeight: 1.4, margin: '0 0 4px 0', fontWeight: '600' }}>{formatAddress(rgp.billingAddress || null)}</p>
                          <p style={{ marginTop: '6px', fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}><strong>GSTIN:</strong> {rgp.customerGST || "—"}</p>
                        </div>
                        <div>
                          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                            <tbody>
                              <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>RGP No.:</td><td style={{ fontWeight: '900', fontSize: '13px' }}>{rgp.rgpNumber}</td></tr>
                              <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>Date:</td><td style={{ fontWeight: '800' }}>{rgp.rgpDate}</td></tr>
                              <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>Kind Attn:</td><td style={{ fontWeight: '800' }}>{rgp.kindAttn || '—'}</td></tr>
                              <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>Phone:</td><td style={{ fontWeight: '800' }}>{rgp.phoneNumber || '—'}</td></tr>
                              <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>Total Qty:</td><td style={{ fontWeight: '800' }}>{rgp.totalQty}</td></tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}

                  {pageIndex > 0 && (
                    <div style={{ marginBottom: '10px', paddingTop: '4px', flexShrink: 0, textAlign: 'center' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '900', marginBottom: '2px' }}>RETURNABLE GATE PASS — {rgp.rgpNumber} (Continued)</h3>
                      <p style={{ fontSize: '12px', color: '#555' }}>Page {pageIndex + 1} of {totalPages}</p>
                    </div>
                  )}

                  {/* ── Items Table ── */}
                  <div style={{ flexShrink: 0 }}>
                    <table className="print-table">
                       <colgroup><col style={{ width: '10%' }} /><col style={{ width: '70%' }} /><col style={{ width: '20%' }} /></colgroup>
                       <thead><tr><th>Sl. No.</th><th>PARTICULARS</th><th>QTY</th></tr></thead>
                       <tbody>
                         {pageItems.map((item, i) => (
                           <tr key={i}>
                             <td style={{ textAlign: 'center', fontWeight: '800' }}>{offset + i + 1}</td>
                             <td style={{ fontWeight: '700' }}>
                               <div style={{ display: 'block', lineHeight: '1.4' }}>{item.description || '—'}</div>
                               {item.productCode && <div style={{ fontSize: '10px', color: '#4b5563', marginTop: '2px' }}>Code: {item.productCode}</div>}
                             </td>
                             <td style={{ textAlign: 'center', fontWeight: '900' }}>{item.qty} {item.uom || 'Nos'}</td>
                           </tr>
                         ))}
                       </tbody>
                    </table>
                  </div>

                  {/* ── Footer ── */}
                  {isLastPage && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexShrink: 0, marginTop: 'auto', paddingBottom: '5px' }}>
                      <div style={{ fontSize: '11px', borderTop: '2px solid #000', paddingTop: '5px', flex: 1, marginRight: '20px' }}>
                        <p style={{ fontWeight: '900', marginBottom: '4px' }}>[We are sending the following items for sample Approval only.]</p>
                        <p style={{ fontWeight: '900', marginBottom: '8px' }}>[NOT FOR SALE]</p>
                        <p style={{ fontWeight: '900', fontSize: '12px' }}>ITEM VALUE: Rs. {rgp.itemValue?.toLocaleString() || "—"}</p>
                        {rgp.remarks && <p style={{ fontWeight: '600', fontSize: '11px', marginTop: '6px' }}><strong style={{fontWeight: '900'}}>Remarks:</strong> {rgp.remarks}</p>}
                      </div>
                      <div style={{ borderTop: '2px solid #000', paddingTop: '5px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', textAlign: 'right', width: '250px' }}>
                        <p style={{ fontWeight: '900', fontSize: '12px', marginBottom: '40px' }}>For Fluoro Automation Seals Pvt Ltd</p>
                        <div style={{ borderTop: '1.5px solid #000', width: '180px', paddingTop: '4px', marginLeft: 'auto' }}>
                          <p style={{ fontWeight: '900', fontSize: '12px' }}>Authorised Signatory</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

// --- RGP Preview Modal ---
const RGPPreviewModal = ({ rgp, onClose }: { rgp: ReturnableGatePass; onClose: () => void }) => {
  const hiddenRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const toastId = toast.loading("Generating PDF...");
      const pdf = new jsPDF("p", "mm", "a4");
      const pages = hiddenRef.current?.querySelectorAll('.print-page');
      
      if (!pages || pages.length === 0) throw new Error("No pages found");

      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i] as HTMLElement, {
          scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff", windowWidth: 794,
        });

        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, 0, 210, 297);
      }

      pdf.save(`${rgp.rgpNumber}.pdf`);
      toast.dismiss(toastId);
      toast.success("Downloaded successfully!");
    } catch (err) {
      console.error(err);
      toast.dismiss();
      toast.error("Failed to generate PDF");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <div ref={hiddenRef} style={{ position: "fixed", top: 0, left: "-9999px", width: "794px", background: "#fff", zIndex: -1 }}>
        <RGPPrintTemplate rgp={rgp} />
      </div>
      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>

      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-[900px] max-h-[95vh] p-0 flex flex-col overflow-hidden bg-gray-100">
          <DialogHeader className="p-4 bg-white border-b shrink-0 shadow-sm z-10">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold text-blue-900">Preview - {rgp.rgpNumber}</DialogTitle>
              <div className="flex gap-3">
                <Button className="bg-green-600 hover:bg-green-700 shadow-md" onClick={handleDownload} disabled={isDownloading}>
                  <Download className="h-4 w-4 mr-2" /> {isDownloading ? "Generating..." : "Download PDF"}
                </Button>
                <Button variant="outline" onClick={onClose}><X className="h-4 w-4 mr-2" /> Close</Button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar py-6 flex justify-center">
            <div className="bg-transparent overflow-visible drop-shadow-2xl" style={{ width: "210mm", flexShrink: 0 }}>
              <RGPPrintTemplate rgp={rgp} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// ---------------------- MAIN COMPONENT ----------------------

export default function RGP() {
  const [tab, setTab] = useState<"list" | "create">("list");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [flatProducts, setFlatProducts] = useState<FlatProductItem[]>([]);
  const [rgps, setRGPs] = useState<ReturnableGatePass[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Preview modal state
  const [previewRGP, setPreviewRGP] = useState<ReturnableGatePass | null>(null);

  const [isPreparingPdf, setIsPreparingPdf] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedBillingAddress, setSelectedBillingAddress] = useState<Address | null>(null);

  const [form, setForm] = useState({
    rgpNumber: '',
    rgpDate: new Date().toISOString().split("T")[0],
    kindAttn: "",
    phoneNumber: "",
    phoneCountryCode: "IN",
    itemValue: "",
    remarks: "",
  });

  // Auto-generate RGP number from master running-number config
  useEffect(() => {
    if (!editingId) {
      const fallback = `RGP25-${String(Date.now()).slice(-5)}`;
      // Use PEEK to not commit to DB until save
      peekNextNumber('rgpNo', fallback).then((num) =>
        setForm((prev) => ({ ...prev, rgpNumber: num }))
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const [lineItems, setLineItems] = useState<RGPLineItem[]>([
    {
      id: crypto.randomUUID(),
      productId: undefined,
      productCode: "",
      description: "",
      qty: 1,
      uom: "",
    },
  ]);

  const printRef = useRef<HTMLDivElement>(null);

  // Flatten products from Firebase structure
  const flattenProducts = (productsData: any[]): FlatProductItem[] => {
    const flattened: FlatProductItem[] = [];
    
    productsData.forEach((product: any) => {
      if (product.items && Array.isArray(product.items)) {
        product.items.forEach((item: any, index: number) => {
          if (item.productCode) {
            flattened.push({
              id: `${product.id}-${index}`,
              productCode: item.productCode,
              category: item.category || "",
              group: item.group || "",
              hsn: item.hsn || "",
              stockQty: item.stockQty || 0,
              type: item.type || "",
              unit: item.unit || "Nos",
              unitPrice: item.unitPrice || 0,
              parentName: product.name || "",
              parentId: product.id || "",
            });
          }
        });
      }
    });
    
    return flattened;
  };

  // Load data
  useEffect(() => {
    const load = async () => {
      try {
        const [cust, prod, rgpData] = await Promise.all([
          getAllRecords("sales/customers"),
          getAllRecords("sales/products"),
          getAllRecords("sales/rgp"),
        ]);
        
        setCustomers(cust as Customer[]);
        
        // Flatten products
        const flattenedProducts = flattenProducts(prod || []);
        setFlatProducts(flattenedProducts);
        
        setRGPs((rgpData || []).map((d: any) => ({ ...(d as ReturnableGatePass) })));
      } catch (e) {
        console.error("Load error:", e);
        toast.error("Failed to load data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const computeTotals = () => {
    const totalQty = lineItems.reduce((sum, li) => sum + (Number(li.qty) || 0), 0);
    return { totalQty };
  };

  const { totalQty } = computeTotals();

  const rgpPreview: ReturnableGatePass = {
    id: editingId || undefined,
    rgpNumber: form.rgpNumber,
    rgpDate: form.rgpDate,
    customerId: selectedCustomer?.id || null,
    customerName: selectedCustomer?.companyName || "",
    customerGST: (selectedCustomer as any)?.gst || "",
    billingAddress: selectedBillingAddress || undefined,
    kindAttn: form.kindAttn,
    phoneNumber: form.phoneNumber,
    lineItems,
    totalQty,
    itemValue: form.itemValue ? Number(form.itemValue) : undefined,
    remarks: form.remarks,
  };

  const handleDownloadPDF = async () => {
    if (!printRef.current || isPreparingPdf) return;
    setIsPreparingPdf(true);

    try {
      const toastId = toast.loading("Generating PDF...");
      const pdf = new jsPDF("p", "mm", "a4");
      
      const pages = printRef.current.querySelectorAll('.print-page');
      if (!pages || pages.length === 0) throw new Error("No pages found");

      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i] as HTMLElement, {
          scale: 2, 
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          windowWidth: 794, // EXACT PORTRAIT WIDTH
        });

        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, 0, 210, 297);
      }

      pdf.save(`${form.rgpNumber || 'Document'}.pdf`);
      toast.dismiss(toastId);
      toast.success("Downloaded successfully!");
    } catch (err) {
      console.error(err);
      toast.dismiss();
      toast.error("Failed to generate PDF");
    } finally {
      setIsPreparingPdf(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      rgpNumber: '',  // regenerated by useEffect watching editingId
      rgpDate: new Date().toISOString().split("T")[0],
      kindAttn: "",
      phoneNumber: "",
      phoneCountryCode: "IN",
      itemValue: "",
      remarks: "",
    });
    setSelectedCustomer(null);
    setSelectedBillingAddress(null);
    setLineItems([
      {
        id: crypto.randomUUID(),
        productId: undefined,
        productCode: "",
        description: "",
        qty: 1,
        uom: "",
      },
    ]);
  };

  const handleCustomerChange = (id: string) => {
    if (!id) {
       setSelectedCustomer(null);
       setSelectedBillingAddress(null);
       return;
    }
    const cust = customers.find((c) => c.id === id) || null;
    setSelectedCustomer(cust);
    const billing = cust?.addresses?.find((a: any) => a.type === "billing" && a.isDefault) ||
      cust?.addresses?.find((a: any) => a.type === "billing") || null;
    setSelectedBillingAddress(billing as Address);
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        productId: undefined,
        productCode: "",
        description: "",
        qty: 1,
        uom: "",
      },
    ]);
  };

  const removeLineItem = (id: string) => {
    setLineItems((prev) => prev.filter((li) => li.id !== id));
  };

  const updateLineItem = (id: string, field: keyof RGPLineItem, value: any) => {
    setLineItems((prev) =>
      prev.map((li) => {
        if (li.id !== id) return li;
        const updated: RGPLineItem = { ...li, [field]: value };
        
        // Handle product selection from flattened products
        if (field === "productCode") {
          const prod = flatProducts.find((p) => p.productCode === value);
          if (prod) {
            updated.productId = prod.id;
            updated.description = `${prod.category} - ${prod.parentName}`;
            updated.uom = prod.unit;
          }
        }
        
        if (field === "qty") updated.qty = value === '' ? '' : Number(value);
        return updated;
      })
    );
  };

  const handleSave = async () => {
    if (!selectedCustomer) return toast.error("Select a customer");
    if (lineItems.length === 0) return toast.error("Add at least one item");
    if (lineItems.some((li) => !li.description || !li.qty || Number(li.qty) <= 0))
      return toast.error("Complete all line items");

    setSaving(true);
    try {
      let rgpNumber = form.rgpNumber;

      const payload: ReturnableGatePass = {
        ...rgpPreview,
        rgpNumber,
        customerId: selectedCustomer.id!,
        customerName: selectedCustomer.companyName,
        customerGST: (selectedCustomer as any)?.gst || "",
        billingAddress: selectedBillingAddress || undefined,
        lineItems,
        totalQty,
        itemValue: form.itemValue ? Number(form.itemValue) : undefined,
        updatedAt: Date.now(),
        ...(editingId ? {} : { createdAt: Date.now() }),
      };

      if (editingId) {
        await updateRecord("sales/rgp", editingId, payload);
        toast.success("RGP Updated");
      } else {
        const fallback = `RGP25-${String(Date.now()).slice(-5)}`;
        // Generate actual sequential number from db
        rgpNumber = await generateNextNumber('rgpNo', fallback);
        payload.rgpNumber = rgpNumber;
        setForm((p) => ({ ...p, rgpNumber }));

        const newId = await createRecord("sales/rgp", payload);
        payload.id = newId ?? undefined;
        toast.success("RGP Created");
      }
      const fresh = await getAllRecords("sales/rgp");
      setRGPs((fresh || []).map((d: any) => ({ ...(d as ReturnableGatePass) })));
      setTab("list");
      resetForm();
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (id: string) => {
    try {
      const data: any = await getRecordById("sales/rgp", id);
      if (!data) return toast.error("RGP not found");

      setEditingId(id);
      setForm({
        rgpNumber: data.rgpNumber,
        rgpDate: data.rgpDate,
        kindAttn: data.kindAttn || "",
        phoneNumber: data.phoneNumber || "",
        phoneCountryCode: data.phoneCountryCode || "IN",
        itemValue: data.itemValue || "",
        remarks: data.remarks || "",
      });

      const cust = customers.find((c) => c.id === data.customerId) || null;
      setSelectedCustomer(cust);
      setSelectedBillingAddress(data.billingAddress || null);

      setLineItems(
        (data.lineItems || []).map((li: any) => ({
          ...li,
          id: crypto.randomUUID(),
        }))
      );

      setTab("create");
    } catch {
      toast.error("Failed to load RGP");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this RGP permanently?")) return;
    try {
      await deleteRecord("sales/rgp", id);
      setRGPs((prev) => prev.filter((d) => d.id !== id));
      toast.success("Deleted");
    } catch {
      toast.error("Delete failed");
    }
  };

  // View RGP
  const handleView = (rgp: ReturnableGatePass) => {
    setPreviewRGP(rgp);
  };

  const filteredRGPs = rgps
    .filter((rgp) => {
      const q = search.toLowerCase();
      return !q || rgp.rgpNumber.toLowerCase().includes(q) || (rgp.customerName || "").toLowerCase().includes(q);
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // Items for combobox
  const customerItems = customers.map((c) => ({
    value: c.id!,
    label: c.companyName,
    sub: (c as any).customerCode || "",
  }));

  const productItems = flatProducts.map((p) => ({
    value: p.productCode,
    label: p.productCode,
    sub: `${p.category} — ${p.parentName} (${p.stockQty} ${p.unit} in stock)`,
  }));

  if (loading) {
    return <div className="p-10 text-center text-lg">Loading Returnable Gate Passes…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-7xl mx-auto px-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-blue-900">Returnable Gate Pass</h1>
            <TabsList>
              <TabsTrigger value="list">List</TabsTrigger>
              <TabsTrigger value="create">
                {editingId ? "Edit RGP" : "Create RGP"}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* LIST TAB */}
          <TabsContent value="list">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>All Returnable Gate Passes</CardTitle>
                <div className="flex gap-2 items-center">
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-2 top-2.5 text-gray-400" />
                    <Input
                      className="pl-8 w-64"
                      placeholder="Search RGP or Customer"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={async () => {
                      const fresh = await getAllRecords("sales/rgp");
                      setRGPs((fresh || []).map((d: any) => ({ ...(d as ReturnableGatePass) })));
                      toast.success("Refreshed");
                    }}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button onClick={() => { resetForm(); setTab("create"); }}>
                    <Plus className="h-4 w-4 mr-2" /> New RGP
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {filteredRGPs.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No RGPs found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="border px-3 py-2 text-left">RGP No</th>
                          <th className="border px-3 py-2 text-left">Date</th>
                          <th className="border px-3 py-2 text-left">Customer</th>
                          <th className="border px-3 py-2 text-right">Qty</th>
                          <th className="border px-3 py-2 text-right">Value (₹)</th>
                          <th className="border px-3 py-2 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRGPs.map((rgp) => (
                          <tr key={rgp.id}>
                            <td className="border px-3 py-2">{rgp.rgpNumber}</td>
                            <td className="border px-3 py-2">{rgp.rgpDate}</td>
                            <td className="border px-3 py-2">{rgp.customerName}</td>
                            <td className="border px-3 py-2 text-right">{rgp.totalQty}</td>
                            <td className="border px-3 py-2 text-right">
                              {rgp.itemValue ? `₹${rgp.itemValue.toLocaleString()}` : "—"}
                            </td>
                            <td className="border px-3 py-2 text-center">
                              <div className="flex justify-center">
                                <RowActions
                                  actions={[
                                    { label: 'View RGP', icon: Eye, onClick: () => handleView(rgp), className: 'text-blue-600 hover:text-blue-700' },
                                    { label: 'Edit', icon: Edit, onClick: () => handleEdit(rgp.id!) },
                                    { label: 'Delete', icon: Trash2, onClick: () => handleDelete(rgp.id!), className: 'text-red-600 hover:text-red-700' },
                                  ]}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* CREATE / EDIT TAB */}
          <TabsContent value="create">
            {/* STACKED LAYOUT (NO MORE SPLIT GRID) */}
            <div className="space-y-6">
              
              {/* RGP Details */}
              <Card>
                <CardHeader><CardTitle>RGP Details</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>RGP Number</Label>
                    <Input 
                      value={form.rgpNumber} 
                      onChange={(e) => setForm(p => ({ ...p, rgpNumber: e.target.value }))}
                      readOnly={!editingId}
                      className={!editingId ? "bg-gray-100 font-bold text-blue-900" : ""}
                    />
                    {!editingId && (
                      <p className="text-xs text-gray-400 mt-1">Will be confirmed on save</p>
                    )}
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input type="date" value={form.rgpDate} onChange={(e) => setForm(p => ({ ...p, rgpDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Kind Attention</Label>
                    <Input value={form.kindAttn} onChange={(e) => setForm(p => ({ ...p, kindAttn: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Phone Number</Label>
                    <PhoneInput
                      countryCode={form.phoneCountryCode || 'IN'}
                      phone={form.phoneNumber}
                      onCountryCodeChange={(v) => setForm(p => ({ ...p, phoneCountryCode: v }))}
                      onPhoneChange={(v) => setForm(p => ({ ...p, phoneNumber: v }))}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Customer */}
              <Card>
                <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <SearchableCombobox
                    items={customerItems}
                    value={selectedCustomer?.id || ""}
                    onSelect={handleCustomerChange}
                    placeholder="Select customer..."
                    searchPlaceholder="Search by name or code..."
                  />

                  {selectedCustomer && (
                    <Select value={selectedBillingAddress?.id || ""} onValueChange={(val) => {
                      const addr = (selectedCustomer as any).addresses?.find((a: any) => a.id === val);
                      setSelectedBillingAddress(addr || null);
                    }}>
                      <SelectTrigger><SelectValue placeholder="Billing Address" /></SelectTrigger>
                      <SelectContent>
                        {(selectedCustomer as any).addresses
                          ?.filter((a: any) => a.type === "billing")
                          .map((a: any) => (
                            <SelectItem key={a.id} value={a.id}>{a.label} - {a.city}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </CardContent>
              </Card>

              {/* Line Items */}
              <Card>
                <CardHeader className="flex justify-between items-center">
                  <CardTitle>Items</CardTitle>
                  <Button size="sm" onClick={addLineItem}><Plus className="h-4 w-4 mr-2" />Add Row</Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {lineItems.map((li, i) => (
                    <div key={li.id} className="border rounded-lg p-4 bg-gradient-to-r from-blue-50 to-gray-50">
                      <div className="flex justify-between mb-3">
                        <span className="font-semibold">Item {i + 1}</span>
                        {lineItems.length > 1 && (
                          <Button size="icon" variant="ghost" onClick={() => removeLineItem(li.id)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        )}
                      </div>
                      <div className="grid md:grid-cols-2 gap-4 mb-3">
                        <div>
                          <Label>Product Code</Label>
                          {/* Searchable product combobox with deduplication filter */}
                          <SearchableCombobox
                            items={productItems}
                            value={li.productCode || ""}
                            onSelect={(v) => updateLineItem(li.id, "productCode", v)}
                            placeholder="Search product..."
                            searchPlaceholder="Search by code, category..."
                          />
                        </div>
                        <div>
                          <Label>Description</Label>
                          <Textarea rows={2} value={li.description} onChange={(e) => updateLineItem(li.id, "description", e.target.value)} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><Label>UOM</Label><Input value={li.uom || ""} onChange={(e) => updateLineItem(li.id, "uom", e.target.value)} /></div>
                        <div><Label>Qty</Label><Input type="number" value={li.qty} onChange={(e) => updateLineItem(li.id, "qty", e.target.value)} /></div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Value & Remarks */}
              <Card>
                <CardHeader><CardTitle>Value & Remarks</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Item Value (₹)</Label>
                    <Input
                      type="number"
                      value={form.itemValue}
                      onChange={(e) => setForm(p => ({ ...p, itemValue: e.target.value }))}
                      placeholder="Enter total value in Rs (optional)"
                    />
                  </div>
                  <div>
                    <Label>Remarks</Label>
                    <Textarea rows={2} value={form.remarks} onChange={(e) => setForm(p => ({ ...p, remarks: e.target.value }))} />
                  </div>
                  <div className="flex justify-between items-center pt-4">
                    <div className="font-semibold">Total Qty: {totalQty}</div>
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={resetForm} disabled={saving}>Reset</Button>
                      <Button onClick={handleSave} disabled={saving} className="bg-blue-700 hover:bg-blue-800">
                        {saving ? "Saving..." : editingId ? "Update RGP" : "Save RGP"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* LIVE PREVIEW - Placed below all fields, full width container */}
              <Card className="overflow-hidden border-2 border-blue-200">
                <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white p-4 text-center font-bold text-lg">
                  Live Preview – A4 Portrait
                  <div className="text-sm font-normal mt-1 opacity-90">
                    RGP: {rgpPreview.rgpNumber || '—'} | {rgpPreview.rgpDate}
                  </div>
                </div>
                <CardContent className="p-4 bg-gray-100">
                  <div ref={printRef} className="overflow-x-auto flex justify-center">
                    <RGPPrintTemplate rgp={rgpPreview} />
                  </div>
                </CardContent>
                <div className="p-4 border-t bg-gray-50 flex justify-end">
                  <Button size="sm" onClick={handleDownloadPDF} disabled={isPreparingPdf}>
                    {isPreparingPdf ? "Preparing..." : <><Download className="h-4 w-4 mr-2" />Download PDF</>}
                  </Button>
                </div>
              </Card>

            </div>
          </TabsContent>
        </Tabs>

        {/* Preview Modal */}
        {previewRGP && (
          <RGPPreviewModal
            rgp={previewRGP}
            onClose={() => setPreviewRGP(null)}
          />
        )}
      </div>
    </div>
  );
}
