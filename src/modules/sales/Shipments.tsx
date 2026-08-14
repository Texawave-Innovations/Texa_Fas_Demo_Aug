//Need to Fix
//1) Table items alignment is not proper

'use client';

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { RowActions } from '@/components/ui/row-actions';
import { Plus, Truck, Edit, Trash2, Download, Eye, Package, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import fas from './fas.png';

import { getRecordById, updateRecord, createRecord, getAllRecords, deleteRecord } from '@/services/firebase';
import { database } from '@/services/firebase';
import { ref, set } from 'firebase/database';
import { generateNextNumber, peekNextNumber } from '@/services/runningNumberService';

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface BoxItem {
  partCode: string;
  description: string;
  hsnCode: string;
  uom: string;
  invoiceQty: number;
  packQty: number;
}

interface Box {
  id: number;
  items: BoxItem[];
}

interface Shipment {
  id?: string;
  shipmentId: string;
  invoiceId: string;
  invoiceNumber: string;
  orderId: string;
  customerName: string;
  transporterName: string;
  vehicleNo: string;
  modeOfTransport: string;
  dispatchDate: string;
  dispatchTime: string;
  deliveryStatus: 'Pending' | 'In Transit' | 'Delivered';
  remarks?: string;
  packingBoxes?: Box[];
  createdAt?: number;
  updatedAt?: number;
}

// ─── Constants & Helpers ────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'د.إ',
};

const formatAmount = (amount: number, currency: string = 'INR') => {
  if (currency === 'INR') {
    return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ─── Searchable Combobox ────────────────────────────────────────────────────

interface ComboboxProps {
  items: { value: string; label: string; sub?: string }[];
  value: string;
  onSelect: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}

function SearchableCombobox({ items, value, onSelect, placeholder = 'Select...', searchPlaceholder = 'Search...', disabled }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    return (
      item.label.toLowerCase().includes(q) ||
      (item.sub || '').toLowerCase().includes(q) ||
      item.value.toLowerCase().includes(q)
    );
  });

  const selected = items.find((i) => i.value === value);

  return (
    <div ref={ref} className="relative">
      <div
        className={`flex items-center border rounded-md px-3 h-10 cursor-pointer bg-white ${disabled ? 'opacity-60 pointer-events-none' : 'hover:border-blue-400'}`}
        onClick={() => !disabled && setOpen((p) => !p)}
      >
        <span className="flex-1 text-sm truncate text-gray-700">
          {selected ? (
            <div className="flex items-center gap-2">
              <span className="font-medium">{selected.label}</span>
              {selected.sub && <span className="text-gray-400">({selected.sub})</span>}
            </div>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </span>
        {value && !disabled && (
          <button
            onClick={(e) => { e.stopPropagation(); onSelect(''); setSearch(''); }}
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
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b last:border-0 ${value === item.value ? 'bg-blue-50 font-semibold' : ''}`}
                onClick={() => { onSelect(item.value); setOpen(false); setSearch(''); }}
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

// ─── Legacy Packing List Print Template (no boxes) ──────────────────────────

const ITEMS_FIRST_PAGE = 8;
const ITEMS_OTHER_PAGES = 13;

const PackingListPrintTemplate: React.FC<{ shipment: Shipment; invoice: any }> = ({ shipment, invoice }) => {
  const invCurrency = invoice?.currency || 'INR';
  const invSymbol = CURRENCY_SYMBOLS[invCurrency] || '₹';

  const items = invoice?.lineItems || [];
  let pages: any[][] = [];
  if (items.length === 0) {
    pages = [[]];
  } else {
    pages.push(items.slice(0, ITEMS_FIRST_PAGE));
    let rest = items.slice(ITEMS_FIRST_PAGE);
    while (rest.length > 0) {
      pages.push(rest.slice(0, ITEMS_OTHER_PAGES));
      rest = rest.slice(ITEMS_OTHER_PAGES);
    }
    const lastPage = pages[pages.length - 1];
    if (pages.length > 1 && lastPage.length === ITEMS_OTHER_PAGES) {
      const movedItem = lastPage.pop()!;
      pages.push([movedItem]);
    }
  }
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
          .print-table td, .print-table th {
            border: 1.5px solid #000; padding: 4px 6px; vertical-align: middle;
            font-size: 11px; line-height: 1.3; word-wrap: break-word; overflow-wrap: break-word;
          }
          .print-table th { background: #e5e7eb; font-weight: 900; text-align: center; }
        `}
      </style>

      <div style={{ width: '794px', minWidth: '794px', flexShrink: 0 }}>
        {pages.map((pageItems, pageIndex) => {
          const isLastPage = pageIndex === totalPages - 1;
          const offset = pageIndex === 0 ? 0 : ITEMS_FIRST_PAGE + (pageIndex - 1) * ITEMS_OTHER_PAGES;

          return (
            <div
              key={pageIndex}
              className={`print-page ${!isLastPage ? 'page-break' : ''}`}
              style={{
                width: '794px', height: '1123px', maxHeight: '1123px',
                background: '#ffffff', margin: '0 auto 40px', padding: 0,
                fontFamily: 'Arial, sans-serif', color: '#000',
                position: 'relative', boxSizing: 'border-box', overflow: 'hidden',
              }}
            >
              <div style={{ border: '2.5px solid #000', height: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden' }}>

                {/* Company Header */}
                <div style={{ flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '2.5px solid #000', background: '#ffffff', gap: '10px' }}>
                    <img src={fas} alt="FAS Logo" style={{ width: '90px', height: 'auto', flexShrink: 0 }} />
                    <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
                      <h1 style={{ fontSize: '22px', fontWeight: '900', margin: 0, letterSpacing: '0.5px', color: '#000', lineHeight: 1.2 }}>
                        Fluoro Automation Seals Pvt Ltd
                      </h1>
                      <p style={{ fontSize: '11px', margin: '4px 0 0 0', color: '#000', lineHeight: 1.4, fontWeight: '700' }}>
                        3/180, Rajiv Gandhi Road, Mettukuppam, Chennai Tamil Nadu 600097 India<br />
                        Phone: +91-9841175097 | Email: dispatch@fluoroautomationseals.com
                      </p>
                    </div>
                    <div style={{ width: '90px' }}></div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px 16px', background: '#e5e7eb', borderBottom: '2.5px solid #000', fontSize: '12px', fontWeight: '800', gap: '50px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}><span style={{ fontWeight: '900' }}>GSTIN:</span><span>33AAECF2716M1ZO</span></div>
                    <div style={{ display: 'flex', gap: '4px' }}><span style={{ fontWeight: '900' }}>PAN:</span><span>AAECF2716M</span></div>
                    <div style={{ display: 'flex', gap: '4px' }}><span style={{ fontWeight: '900' }}>CIN:</span><span>U25209TN2020PTC138498</span></div>
                  </div>
                </div>

                {/* Page Body */}
                <div style={{ flex: 1, padding: '10px 16px 15px 16px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

                  {pageIndex === 0 && (
                    <>
                      <h2 style={{ textAlign: 'center', fontSize: '18px', fontWeight: '900', margin: '0 0 10px 0', letterSpacing: '2px', flexShrink: 0 }}>
                        PACKING LIST
                      </h2>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '12px', marginBottom: '15px', flexShrink: 0 }}>
                        <div>
                          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                            <tbody>
                              <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>PL No.:</td><td style={{ fontWeight: '900', fontSize: '13px', color: '#1d4ed8' }}>{shipment.shipmentId}</td></tr>
                              <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>Date:</td><td style={{ fontWeight: '800' }}>{shipment.dispatchDate ? format(new Date(shipment.dispatchDate), 'dd/MM/yyyy') : '—'}</td></tr>
                              <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>Time:</td><td style={{ fontWeight: '800' }}>{shipment.dispatchTime}</td></tr>
                              <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>Transporter:</td><td style={{ fontWeight: '800' }}>{shipment.transporterName || 'Self'}</td></tr>
                              <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>Vehicle No:</td><td style={{ fontWeight: '900', fontSize: '11px' }}>{shipment.vehicleNo || '—'}</td></tr>
                              <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>Mode:</td><td style={{ fontWeight: '800' }}>{shipment.modeOfTransport}</td></tr>
                            </tbody>
                          </table>
                        </div>
                        <div>
                          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                            <tbody>
                              <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>Invoice No:</td><td style={{ fontWeight: '900', fontSize: '11px' }}>{shipment.invoiceNumber}</td></tr>
                              <tr><td style={{ fontWeight: '700', padding: '3px 0', verticalAlign: 'top' }}>Consignee:</td><td style={{ fontWeight: '800' }}>{shipment.customerName}</td></tr>
                              <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>Total Value:</td><td style={{ fontWeight: '900', fontSize: '12px' }}>{invSymbol}{formatAmount(invoice?.grandTotal || 0, invCurrency)}</td></tr>
                              <tr>
                                <td style={{ fontWeight: '700', padding: '3px 0' }}>Status:</td>
                                <td style={{ padding: '3px 0' }}>
                                  <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '800', border: '1px solid #93c5fd', backgroundColor: '#dbeafe', color: '#1e40af' }}>
                                    {shipment.deliveryStatus}
                                  </span>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}

                  {pageIndex > 0 && (
                    <div style={{ marginBottom: '10px', paddingTop: '4px', flexShrink: 0, textAlign: 'center' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '900', marginBottom: '2px' }}>PACKING LIST — {shipment.shipmentId} (Continued)</h3>
                      <p style={{ fontSize: '12px', color: '#555' }}>Page {pageIndex + 1} of {totalPages}</p>
                    </div>
                  )}

                  {/* Items Table */}
                  <div style={{ flexShrink: 0 }}>
                    <table className="print-table">
                      <colgroup>
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '42%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '10%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Sr.</th>
                          <th>Part Code</th>
                          <th>Description</th>
                          <th>HSN</th>
                          <th>Qty</th>
                          <th>UOM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageItems.map((item: any, i: number) => (
                          <tr key={i}>
                            <td style={{ textAlign: 'center', fontWeight: '800' }}>{offset + i + 1}</td>
                            <td style={{ fontWeight: '800', textAlign: 'center', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{item.partCode}</td>
                            <td style={{ fontWeight: '700' }}>
                              <div style={{ display: 'block', lineHeight: '1.4', wordBreak: 'break-word', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.description || '—'}</div>
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: '700' }}>{item.hsnCode || '—'}</td>
                            <td style={{ textAlign: 'center', fontWeight: '900', color: '#059669' }}>{item.qty}</td>
                            <td style={{ textAlign: 'center', fontWeight: '700' }}>{item.uom || 'Nos'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer (last page only) */}
                  {isLastPage && (
                    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, marginTop: 'auto', paddingBottom: '10px' }}>
                      {shipment.remarks && (
                        <div style={{ fontSize: '11px', border: '1.5px solid #fcd34d', backgroundColor: '#fffbeb', padding: '8px', borderRadius: '4px', marginBottom: '15px' }}>
                          <p style={{ lineHeight: 1.4, margin: '0', fontWeight: '700' }}><strong style={{ fontWeight: '900' }}>Remarks:</strong> {shipment.remarks}</p>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', borderTop: '2px solid #000', paddingTop: '15px' }}>
                        <div>
                          <p style={{ fontWeight: '900', fontSize: '12px', marginBottom: '40px' }}>Receiver&apos;s Signature</p>
                          <div style={{ borderTop: '1.5px solid #000', width: '180px', paddingTop: '4px' }}>
                            <p style={{ fontWeight: '900', fontSize: '12px' }}>Name &amp; Stamp</p>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontWeight: '900', fontSize: '12px', marginBottom: '40px' }}>For Fluoro Automation Seals Pvt Ltd</p>
                          <div style={{ borderTop: '1.5px solid #000', width: '180px', paddingTop: '4px', marginLeft: 'auto' }}>
                            <p style={{ fontWeight: '900', fontSize: '12px' }}>Authorised Signatory</p>
                          </div>
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

// ─── Box Packing Print Template (1 box = 1 A4 page) ────────────────────────

const BoxPackingPrintTemplate: React.FC<{ shipment: Shipment; invoice: any; boxes: Box[] }> = ({ shipment, invoice, boxes }) => {
  const invCurrency = invoice?.currency || 'INR';
  const invSymbol = CURRENCY_SYMBOLS[invCurrency] || '₹';
  const totalBoxes = boxes.length;

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
          .print-table td, .print-table th {
            border: 1.5px solid #000; padding: 4px 6px; vertical-align: middle;
            font-size: 11px; line-height: 1.3; word-wrap: break-word; overflow-wrap: break-word;
          }
          .print-table th { background: #e5e7eb; font-weight: 900; text-align: center; }
        `}
      </style>

      <div style={{ width: '794px', minWidth: '794px', flexShrink: 0 }}>
        {boxes.map((box, boxIndex) => {
          const isLastBox = boxIndex === totalBoxes - 1;

          return (
            <div
              key={box.id}
              className={`print-page ${!isLastBox ? 'page-break' : ''}`}
              style={{
                width: '794px', height: '1123px', maxHeight: '1123px',
                background: '#ffffff', margin: '0 auto 40px', padding: 0,
                fontFamily: 'Arial, sans-serif', color: '#000',
                position: 'relative', boxSizing: 'border-box', overflow: 'hidden',
              }}
            >
              <div style={{ border: '2.5px solid #000', height: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden' }}>

                {/* Company Header */}
                <div style={{ flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '2.5px solid #000', background: '#ffffff', gap: '10px' }}>
                    <img src={fas} alt="FAS Logo" style={{ width: '90px', height: 'auto', flexShrink: 0 }} />
                    <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
                      <h1 style={{ fontSize: '22px', fontWeight: '900', margin: 0, letterSpacing: '0.5px', color: '#000', lineHeight: 1.2 }}>
                        Fluoro Automation Seals Pvt Ltd
                      </h1>
                      <p style={{ fontSize: '11px', margin: '4px 0 0 0', color: '#000', lineHeight: 1.4, fontWeight: '700' }}>
                        3/180, Rajiv Gandhi Road, Mettukuppam, Chennai Tamil Nadu 600097 India<br />
                        Phone: +91-9841175097 | Email: dispatch@fluoroautomationseals.com
                      </p>
                    </div>
                    <div style={{ width: '90px' }}></div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px 16px', background: '#e5e7eb', borderBottom: '2.5px solid #000', fontSize: '12px', fontWeight: '800', gap: '50px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}><span style={{ fontWeight: '900' }}>GSTIN:</span><span>33AAECF2716M1ZO</span></div>
                    <div style={{ display: 'flex', gap: '4px' }}><span style={{ fontWeight: '900' }}>PAN:</span><span>AAECF2716M</span></div>
                    <div style={{ display: 'flex', gap: '4px' }}><span style={{ fontWeight: '900' }}>CIN:</span><span>U25209TN2020PTC138498</span></div>
                  </div>
                </div>

                {/* Page Body */}
                <div style={{ flex: 1, padding: '10px 16px 15px 16px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

                  {/* Box Title */}
                  <h2 style={{ textAlign: 'center', fontSize: '16px', fontWeight: '900', margin: '0 0 8px 0', letterSpacing: '2px', flexShrink: 0 }}>
                    PACKING LIST — BOX {box.id} OF {totalBoxes}
                  </h2>

                  {/* Shipment Meta (every page) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '12px', marginBottom: '12px', flexShrink: 0 }}>
                    <div>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <tbody>
                          <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>PL No.:</td><td style={{ fontWeight: '900', fontSize: '13px', color: '#1d4ed8' }}>{shipment.shipmentId}</td></tr>
                          <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>Date:</td><td style={{ fontWeight: '800' }}>{shipment.dispatchDate ? format(new Date(shipment.dispatchDate), 'dd/MM/yyyy') : '—'}</td></tr>
                          <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>Time:</td><td style={{ fontWeight: '800' }}>{shipment.dispatchTime}</td></tr>
                          <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>Transporter:</td><td style={{ fontWeight: '800' }}>{shipment.transporterName || 'Self'}</td></tr>
                          <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>Vehicle No:</td><td style={{ fontWeight: '900', fontSize: '11px' }}>{shipment.vehicleNo || '—'}</td></tr>
                          <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>Mode:</td><td style={{ fontWeight: '800' }}>{shipment.modeOfTransport}</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <tbody>
                          <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>Invoice No:</td><td style={{ fontWeight: '900', fontSize: '11px' }}>{shipment.invoiceNumber}</td></tr>
                          <tr><td style={{ fontWeight: '700', padding: '3px 0', verticalAlign: 'top' }}>Consignee:</td><td style={{ fontWeight: '800' }}>{shipment.customerName}</td></tr>
                          <tr><td style={{ fontWeight: '700', padding: '3px 0' }}>Total Value:</td><td style={{ fontWeight: '900', fontSize: '12px' }}>{invSymbol}{formatAmount(invoice?.grandTotal || 0, invCurrency)}</td></tr>
                          <tr>
                            <td style={{ fontWeight: '700', padding: '3px 0' }}>Status:</td>
                            <td style={{ padding: '3px 0' }}>
                              <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '800', border: '1px solid #93c5fd', backgroundColor: '#dbeafe', color: '#1e40af' }}>
                                {shipment.deliveryStatus}
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div style={{ flexShrink: 0 }}>
                    <table className="print-table">
                      <colgroup>
                        <col style={{ width: '7%' }} />
                        <col style={{ width: '18%' }} />
                        <col style={{ width: '43%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '10%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Sr.</th>
                          <th>Part Code</th>
                          <th>Description</th>
                          <th>HSN</th>
                          <th>Qty Packed</th>
                          <th>UOM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {box.items
                          .filter(item => item.packQty > 0)
                          .map((item, i) => (
                            <tr key={i}>
                              <td style={{ textAlign: 'center', fontWeight: '800' }}>{i + 1}</td>
                              <td style={{ fontWeight: '800', textAlign: 'center', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{item.partCode}</td>
                              <td style={{ fontWeight: '700' }}>
                                <div style={{ display: 'block', lineHeight: '1.4', wordBreak: 'break-word', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.description || '—'}</div>
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: '700' }}>{item.hsnCode || '—'}</td>
                              <td style={{ textAlign: 'center', fontWeight: '900', color: '#059669' }}>{item.packQty}</td>
                              <td style={{ textAlign: 'center', fontWeight: '700' }}>{item.uom || 'Nos'}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer — last box only */}
                  {isLastBox && (
                    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, marginTop: 'auto', paddingBottom: '10px' }}>
                      {shipment.remarks && (
                        <div style={{ fontSize: '11px', border: '1.5px solid #fcd34d', backgroundColor: '#fffbeb', padding: '8px', borderRadius: '4px', marginBottom: '15px' }}>
                          <p style={{ lineHeight: 1.4, margin: '0', fontWeight: '700' }}><strong style={{ fontWeight: '900' }}>Remarks:</strong> {shipment.remarks}</p>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', borderTop: '2px solid #000', paddingTop: '15px' }}>
                        <div>
                          <p style={{ fontWeight: '900', fontSize: '12px', marginBottom: '40px' }}>Receiver&apos;s Signature</p>
                          <div style={{ borderTop: '1.5px solid #000', width: '180px', paddingTop: '4px' }}>
                            <p style={{ fontWeight: '900', fontSize: '12px' }}>Name &amp; Stamp</p>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontWeight: '900', fontSize: '12px', marginBottom: '40px' }}>For Fluoro Automation Seals Pvt Ltd</p>
                          <div style={{ borderTop: '1.5px solid #000', width: '180px', paddingTop: '4px', marginLeft: 'auto' }}>
                            <p style={{ fontWeight: '900', fontSize: '12px' }}>Authorised Signatory</p>
                          </div>
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

// ─── Packing List Preview Modal ─────────────────────────────────────────────

const PackingListPreviewModal = ({
  shipment,
  invoice,
  boxes,
  onClose,
}: {
  shipment: Shipment;
  invoice: any;
  boxes: Box[];
  onClose: () => void;
}) => {
  const hiddenRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const hasBoxes = boxes && boxes.length > 0;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const toastId = toast.loading('Generating PDF...');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pages = hiddenRef.current?.querySelectorAll('.print-page');

      if (!pages || pages.length === 0) throw new Error('No pages found');

      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i] as HTMLElement, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: 794,
        });
        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      }

      pdf.save(`${shipment.shipmentId}.pdf`);
      toast.dismiss(toastId);
      toast.success('Downloaded successfully!');
    } catch (err) {
      console.error(err);
      toast.dismiss();
      toast.error('Failed to generate PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <div ref={hiddenRef} style={{ position: 'fixed', top: 0, left: '-9999px', width: '794px', background: '#fff', zIndex: -1 }}>
        {hasBoxes
          ? <BoxPackingPrintTemplate shipment={shipment} invoice={invoice} boxes={boxes} />
          : <PackingListPrintTemplate shipment={shipment} invoice={invoice} />
        }
      </div>
      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>

      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-[900px] max-h-[95vh] p-0 flex flex-col overflow-hidden bg-gray-100">
          <DialogHeader className="p-4 bg-white border-b shrink-0 shadow-sm z-10">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold text-blue-900">
                Preview — {shipment.shipmentId}
                {hasBoxes && <span className="ml-2 text-sm font-normal text-indigo-600">({boxes.length} box{boxes.length > 1 ? 'es' : ''})</span>}
              </DialogTitle>
              <div className="flex gap-3">
                <Button className="bg-green-600 hover:bg-green-700 shadow-md" onClick={handleDownload} disabled={isDownloading}>
                  <Download className="h-4 w-4 mr-2" /> {isDownloading ? 'Generating...' : 'Download PDF'}
                </Button>
                <Button variant="outline" onClick={onClose}><X className="h-4 w-4 mr-2" /> Close</Button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar py-6 flex justify-center">
            <div className="bg-transparent overflow-visible drop-shadow-2xl" style={{ width: '210mm', flexShrink: 0 }}>
              {hasBoxes
                ? <BoxPackingPrintTemplate shipment={shipment} invoice={invoice} boxes={boxes} />
                : <PackingListPrintTemplate shipment={shipment} invoice={invoice} />
              }
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// ─── Main Shipments Component ────────────────────────────────────────────────

export default function Shipments() {
  const navigate = useNavigate();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [filteredShipments, setFilteredShipments] = useState<Shipment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [viewLROpen, setViewLROpen] = useState(false);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [peekedShipmentId, setPeekedShipmentId] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    invoiceId: '',
    transporterName: '',
    dispatchDate: new Date().toISOString().split('T')[0],
    dispatchTime: new Date().toTimeString().slice(0, 5),
    deliveryStatus: 'Pending' as Shipment['deliveryStatus'],
    remarks: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (dialogOpen && !editingKey && !peekedShipmentId) {
      const fallback = `SHIP-${String(shipments.length + 1001).padStart(4, '0')}`;
      peekNextNumber('shipmentId', fallback).then(setPeekedShipmentId);
    }
  }, [dialogOpen, editingKey, peekedShipmentId, shipments.length]);

  const loadData = async () => {
    try {
      const [shipData, invData] = await Promise.all([
        getAllRecords('sales/shipments'),
        getAllRecords('sales/invoices'),
      ]);
      const shipmentsWithId = (shipData as any[])
        .map((s: any) => ({ ...s, id: s.id || Object.keys(s)[0] }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      setShipments(shipmentsWithId);
      setFilteredShipments(shipmentsWithId);
      setInvoices(invData as any[]);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load data');
    }
  };

  // Search filter
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredShipments(shipments);
      return;
    }
    const query = searchQuery.toLowerCase();
    setFilteredShipments(
      shipments.filter((s) =>
        (s.shipmentId || '').toLowerCase().startsWith(query) ||
        (s.invoiceNumber || '').toLowerCase().startsWith(query) ||
        (s.customerName || '').toLowerCase().startsWith(query)
      )
    );
  }, [searchQuery, shipments]);

  const usedInvoiceIds = shipments.filter(s => s.id !== editingKey).map(s => s.invoiceId);
  const selectedInvoice = invoices.find(i => i.id === formData.invoiceId);
  const currency = selectedInvoice?.currency || 'INR';
  const symbol = CURRENCY_SYMBOLS[currency];

  // ── Invoice Change ──────────────────────────────────────────────────────────

  const handleInvoiceChange = (invoiceId: string) => {
    setFormData(prev => ({ ...prev, invoiceId }));
    setBoxes([]); // reset boxes when invoice changes
  };

  // ── Box Packing Helpers ─────────────────────────────────────────────────────

  /** Qty available to pack in this box for this item (invoice qty minus what was packed in ALL previous boxes, matched by partCode) */
  const getAvailableQty = (boxIndex: number, itemIndex: number): number => {
    const currentItem = boxes[boxIndex]?.items[itemIndex];
    if (!currentItem) return 0;
    const { invoiceQty, partCode } = currentItem;
    let alreadyPacked = 0;
    for (let b = 0; b < boxIndex; b++) {
      // Match by partCode — box items may be a subset of invoice items
      const match = boxes[b]?.items.find(i => i.partCode === partCode);
      alreadyPacked += match?.packQty ?? 0;
    }
    return invoiceQty - alreadyPacked;
  };

  /** Remaining after this box's pack qty */
  const getRemaining = (boxIndex: number, itemIndex: number): number => {
    return getAvailableQty(boxIndex, itemIndex) - (boxes[boxIndex]?.items[itemIndex]?.packQty ?? 0);
  };

  const addBox = () => {
    if (!selectedInvoice) return;
    // Only include items that still have remaining qty (not yet fully packed)
    const currentBoxes = boxes;
    const newItems: BoxItem[] = selectedInvoice.lineItems
      .map((item: any, idx: number) => {
        const invoiceQty = Number(item.qty) || 0;
        const alreadyPacked = currentBoxes.reduce(
          (sum, box) => {
            // Match by partCode — NOT by array index (boxes may have different item subsets)
            const match = box.items.find(i => i.partCode === (item.partCode || ''));
            return sum + (match?.packQty ?? 0);
          },
          0
        );
        return {
          partCode: item.partCode || '',
          description: item.description || '',
          hsnCode: item.hsnCode || '',
          uom: item.uom || 'Nos',
          invoiceQty,
          packQty: 0,
          _remainingQty: invoiceQty - alreadyPacked,
        };
      })
      .filter(item => item._remainingQty > 0)
      .map(({ _remainingQty, ...item }) => item);

    if (newItems.length === 0) {
      toast.info('All items are fully packed. No new box needed.');
      return;
    }
    setBoxes(prev => [...prev, { id: prev.length + 1, items: newItems }]);
  };

  const removeBox = (boxIndex: number) => {
    setBoxes(prev => {
      const updated = prev.filter((_, i) => i !== boxIndex);
      return updated.map((box, i) => ({ ...box, id: i + 1 }));
    });
  };

  const updatePackQty = (boxIndex: number, itemIndex: number, value: string) => {
    const parsed = Math.max(0, Number(value) || 0);
    const available = getAvailableQty(boxIndex, itemIndex);
    const clamped = Math.min(parsed, available);
    setBoxes(prev =>
      prev.map((box, bi) => {
        if (bi !== boxIndex) return box;
        return {
          ...box,
          items: box.items.map((item, ii) =>
            ii !== itemIndex ? item : { ...item, packQty: clamped }
          ),
        };
      })
    );
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!formData.invoiceId || !selectedInvoice) {
      toast.error('Please select a valid invoice');
      return;
    }

    // Validate box packing completeness
    if (boxes.length > 0) {
      const lineItems = selectedInvoice.lineItems;
      for (const lineItem of lineItems) {
        const invoiceQty = Number(lineItem.qty) || 0;
        const partCode = lineItem.partCode || '';
        // Match by partCode across boxes (boxes may have different item subsets)
        const totalPacked = boxes.reduce((sum, box) => {
          const match = box.items.find(i => i.partCode === partCode);
          return sum + (match?.packQty ?? 0);
        }, 0);
        if (totalPacked !== invoiceQty) {
          toast.error(`"${partCode}" not fully packed — Packed: ${totalPacked} / Required: ${invoiceQty}`);
          return;
        }
      }
    }

    let shipmentId = editingKey
      ? (shipments.find(s => s.id === editingKey)?.shipmentId || `SHIP-${Date.now()}`)
      : peekedShipmentId || `SHIP-${String(shipments.length + 1001).padStart(4, '0')}`;

    if (!editingKey) {
      shipmentId = await generateNextNumber('shipmentId', shipmentId);
    }

    const payload: Shipment = {
      shipmentId,
      invoiceId: formData.invoiceId,
      invoiceNumber: selectedInvoice.invoiceNumber,
      orderId: selectedInvoice.orderId || '',
      customerName: selectedInvoice.customerName,
      transporterName: formData.transporterName || 'Self',
      vehicleNo: selectedInvoice.vehicleNo || '',
      modeOfTransport: selectedInvoice.transportMode || 'Courier',
      dispatchDate: formData.dispatchDate,
      dispatchTime: formData.dispatchTime,
      deliveryStatus: formData.deliveryStatus,
      remarks: formData.remarks,
      packingBoxes: boxes.length > 0 ? boxes : undefined,
      updatedAt: Date.now(),
    };

    try {
      if (editingKey) {
        await updateRecord('sales/shipments', editingKey, payload);
        toast.success('Shipment updated successfully');
      } else {
        payload.createdAt = Date.now();
        await createRecord('sales/shipments', payload);
        toast.success('Shipment created successfully');
      }
      setDialogOpen(false);
      resetForm();
      loadData();
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error('Failed to save: ' + (err.message || 'Unknown error'));
    }
  };

  const handleEdit = (shipment: Shipment) => {
    if (!shipment.id) return;
    setEditingKey(shipment.id);
    setBoxes(shipment.packingBoxes || []);
    setFormData({
      invoiceId: shipment.invoiceId,
      transporterName: shipment.transporterName || '',
      dispatchDate: shipment.dispatchDate,
      dispatchTime: shipment.dispatchTime || '',
      deliveryStatus: shipment.deliveryStatus,
      remarks: shipment.remarks || '',
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingKey(null);
    setBoxes([]);
    setFormData({
      invoiceId: '',
      transporterName: '',
      dispatchDate: new Date().toISOString().split('T')[0],
      dispatchTime: new Date().toTimeString().slice(0, 5),
      deliveryStatus: 'Pending',
      remarks: '',
    });
    setPeekedShipmentId('');
  };

  const handleDelete = async (firebaseKey: string) => {
    if (!confirm('Delete this shipment permanently?')) return;
    try {
      await deleteRecord('sales/shipments', firebaseKey);
      toast.success('Shipment deleted');
      loadData();
    } catch {
      toast.error('Delete failed');
    }
  };

  const openLRView = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    setViewLROpen(true);
  };

  const clearSearch = () => setSearchQuery('');

  const handleMoveToPacking = async (s: Shipment) => {
    try {
      // Fetch invoice fresh from Firebase to guarantee we have lineItems
      let lineItems: any[] = [];
      if (s.invoiceId) {
        const invRecord = await getRecordById('sales/invoices', s.invoiceId);
        lineItems = (invRecord as any)?.lineItems || [];
      }

      const baseEntry = {
        soNumber:     s.invoiceNumber || '',
        customerName: s.customerName  || '',
        shipmentId:   s.shipmentId    || '',
        status:       'packing_pending',
        dispatched:   false,
        createdAt:    Date.now(),
      };

      const writes =
        lineItems.length > 0
          ? lineItems.map((item: any, idx: number) =>
              set(ref(database, `dispatch/packingQueue/${s.id}_item_${idx}`), {
                ...baseEntry,
                productCode:    item.partCode    || '',
                productName:    item.description || '',
                totalAllocated: String(item.invoicedQty || item.qty || 0),
                quantity:       item.invoicedQty  || item.qty || 0,
                uom:            item.uom          || 'NOS',
              })
            )
          : [
              // Fallback: no line items found — write one entry for the shipment itself
              set(ref(database, `dispatch/packingQueue/${s.id}_item_0`), {
                ...baseEntry,
                productCode:    '',
                productName:    `Shipment ${s.shipmentId}`,
                totalAllocated: '1',
                quantity:       1,
                uom:            'NOS',
              }),
            ];

      await Promise.all(writes);
      toast.success(`${s.shipmentId} moved to Packing queue`);
      navigate('/dispatch/packing');
    } catch (err) {
      console.error('Move to packing error:', err);
      toast.error('Failed to move to packing');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3 text-blue-900">
              <Truck className="h-10 w-10 md:h-12 md:w-12 text-blue-600" />
              Shipments &amp; Dispatch
            </h1>
            <p className="text-muted-foreground mt-2 text-sm md:text-base">
              Create and manage material dispatches from invoices
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="lg" className="bg-blue-700 hover:bg-blue-800 w-full md:w-auto">
                <Plus className="h-5 w-5 mr-2" /> Create Shipment
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-[95vw] md:max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl md:text-2xl font-bold">
                  {editingKey ? 'Edit Shipment' : 'Create New Shipment'}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-6 py-4">

                {/* Invoice Select */}
                <div>
                  <Label className="text-base md:text-lg font-semibold">Select Invoice *</Label>
                  <div className="mt-2">
                    <SearchableCombobox
                      items={invoices
                        .filter(inv => !usedInvoiceIds.includes(inv.id) || inv.id === formData.invoiceId)
                        .map(inv => ({
                          value: inv.id,
                          label: inv.invoiceNumber,
                          sub: `${inv.customerName} • ${CURRENCY_SYMBOLS[inv.currency] || '₹'}${formatAmount(inv.grandTotal || 0, inv.currency)}`,
                        }))}
                      value={formData.invoiceId}
                      onSelect={handleInvoiceChange}
                      placeholder="Choose invoice..."
                      searchPlaceholder="Search invoice..."
                      disabled={!!editingKey}
                    />
                  </div>
                </div>

                {/* Invoice Items (read-only) */}
                {selectedInvoice && (
                  <Card className="bg-blue-50 border-blue-200">
                    <CardHeader>
                      <CardTitle className="text-base md:text-lg flex items-center gap-2">
                        <Package className="h-5 w-5" /> Invoice Items ({selectedInvoice.lineItems.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <div className="min-w-full">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[50px]">S.No</TableHead>
                              <TableHead className="w-[120px] md:w-[150px]">Part Code</TableHead>
                              <TableHead className="min-w-[200px] md:min-w-[300px]">Description</TableHead>
                              <TableHead className="w-[80px] md:w-[100px]">HSN</TableHead>
                              <TableHead className="text-center w-[60px] md:w-[80px]">Qty</TableHead>
                              <TableHead className="w-[60px] md:w-[80px]">UOM</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedInvoice.lineItems.map((item: any, i: number) => (
                              <TableRow key={i}>
                                <TableCell className="align-top">{i + 1}</TableCell>
                                <TableCell className="font-mono text-xs md:text-sm align-top break-all">{item.partCode}</TableCell>
                                <TableCell className="text-xs md:text-sm align-top break-words whitespace-normal max-w-[200px] md:max-w-[400px]">
                                  {item.description}
                                </TableCell>
                                <TableCell className="text-xs md:text-sm align-top">{item.hsnCode}</TableCell>
                                <TableCell className="text-center font-bold text-green-700 align-top">{item.qty}</TableCell>
                                <TableCell className="align-top">{item.uom}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* ── Packaging / Box Details ── */}
                {selectedInvoice && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-base md:text-lg font-semibold text-gray-800 flex items-center gap-2">
                          <Package className="h-5 w-5 text-indigo-600" />
                          Packaging / Box Details
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Pack items into boxes. All quantities must be fully packed before saving.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-indigo-400 text-indigo-700 hover:bg-indigo-50 gap-2 shrink-0"
                        onClick={addBox}
                      >
                        <Plus className="h-4 w-4" /> Add Box
                      </Button>
                    </div>

                    {boxes.length === 0 && (
                      <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg text-gray-400">
                        <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">No boxes added yet. Click &quot;+ Add Box&quot; to start packing.</p>
                      </div>
                    )}

                    {boxes.map((box, boxIndex) => (
                      <Card key={box.id} className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white shadow-sm">
                        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
                          <CardTitle className="text-base font-bold text-indigo-800 flex items-center gap-2">
                            <span className="bg-indigo-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm font-black">
                              {box.id}
                            </span>
                            Box {box.id}
                          </CardTitle>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8"
                            onClick={() => removeBox(boxIndex)}
                          >
                            <Trash2 className="h-4 w-4 mr-1" /> Remove
                          </Button>
                        </CardHeader>

                        <CardContent className="px-4 pb-4 overflow-x-auto">
                          <table className="w-full text-xs border-collapse min-w-[640px]">
                            <thead>
                              <tr className="bg-indigo-100">
                                <th className="border border-indigo-200 px-2 py-2 text-left w-10">S.No</th>
                                <th className="border border-indigo-200 px-2 py-2 text-left w-28">Part Code</th>
                                <th className="border border-indigo-200 px-2 py-2 text-left">Description</th>
                                <th className="border border-indigo-200 px-2 py-2 text-center w-20">HSN</th>
                                <th className="border border-indigo-200 px-2 py-2 text-center w-24">Available</th>
                                <th className="border border-indigo-200 px-2 py-2 text-center w-28">Pack Qty</th>
                                <th className="border border-indigo-200 px-2 py-2 text-center w-24">Remaining</th>
                                <th className="border border-indigo-200 px-2 py-2 text-center w-16">UOM</th>
                              </tr>
                            </thead>
                            <tbody>
                              {box.items.map((item, itemIndex) => {
                                const available = getAvailableQty(boxIndex, itemIndex);
                                // Skip items fully packed in previous boxes (available = 0)
                                if (available <= 0) return null;
                                const remaining = getRemaining(boxIndex, itemIndex);
                                const isFullyPacked = remaining === 0 && item.packQty > 0;
                                return (
                                  <tr
                                    key={itemIndex}
                                    className={isFullyPacked ? 'bg-green-50' : 'bg-white hover:bg-gray-50'}
                                  >
                                    <td className="border border-indigo-100 px-2 py-1.5 text-center text-gray-500">{itemIndex + 1}</td>
                                    <td className="border border-indigo-100 px-2 py-1.5 font-mono font-semibold text-blue-700 break-all">{item.partCode}</td>
                                    <td className="border border-indigo-100 px-2 py-1.5 text-gray-700">{item.description}</td>
                                    <td className="border border-indigo-100 px-2 py-1.5 text-center text-gray-600">{item.hsnCode || '—'}</td>
                                    <td className="border border-indigo-100 px-2 py-1.5 text-center font-bold text-gray-800">{available}</td>
                                    <td className="border border-indigo-100 px-2 py-1.5 text-center">
                                      <Input
                                        type="number"
                                        min={0}
                                        max={available}
                                        value={item.packQty === 0 ? '' : item.packQty}
                                        onChange={e => updatePackQty(boxIndex, itemIndex, e.target.value)}
                                        placeholder="0"
                                        className="h-7 text-center text-xs w-full px-1 focus:ring-indigo-400"
                                      />
                                    </td>
                                    <td className={`border border-indigo-100 px-2 py-1.5 text-center font-bold ${
                                      remaining === 0 ? 'text-green-600' : remaining < 0 ? 'text-red-600' : 'text-amber-600'
                                    }`}>
                                      {remaining}
                                    </td>
                                    <td className="border border-indigo-100 px-2 py-1.5 text-center text-gray-600">{item.uom}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Transport / Date Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  <div>
                    <Label>Shipment ID</Label>
                    <Input 
                      value={editingKey ? (shipments.find(s => s.id === editingKey)?.shipmentId || '') : peekedShipmentId} 
                      disabled 
                      className="bg-gray-100 font-mono text-blue-700 font-bold" 
                    />
                  </div>
                  <div>
                    <Label>Transport Mode</Label>
                    <Input value={selectedInvoice?.transportMode || 'Courier'} disabled className="bg-gray-100" />
                  </div>
                  <div>
                    <Label>Vehicle Number</Label>
                    <Input value={selectedInvoice?.vehicleNo || ''} disabled className="bg-gray-100" />
                  </div>

                  <div>
                    <Label>Transporter Name</Label>
                    <Input
                      value={formData.transporterName}
                      onChange={e => setFormData(p => ({ ...p, transporterName: e.target.value }))}
                      placeholder="e.g. VRL Logistics"
                    />
                  </div>

                  <div>
                    <Label>Dispatch Date</Label>
                    <Input type="date" value={formData.dispatchDate} onChange={e => setFormData(p => ({ ...p, dispatchDate: e.target.value }))} />
                  </div>

                  <div>
                    <Label>Dispatch Time</Label>
                    <Input type="time" value={formData.dispatchTime} onChange={e => setFormData(p => ({ ...p, dispatchTime: e.target.value }))} />
                  </div>

                  <div>
                    <Label>Delivery Status</Label>
                    <Select value={formData.deliveryStatus} onValueChange={v => setFormData(p => ({ ...p, deliveryStatus: v as any }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="In Transit">In Transit</SelectItem>
                        <SelectItem value="Delivered">Delivered</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="md:col-span-2">
                    <Label>Remarks (Optional)</Label>
                    <Textarea rows={3} value={formData.remarks} onChange={e => setFormData(p => ({ ...p, remarks: e.target.value }))} />
                  </div>
                </div>

                <div className="flex flex-col md:flex-row justify-end gap-3 md:gap-4">
                  <Button variant="outline" size="lg" onClick={() => setDialogOpen(false)} className="w-full md:w-auto">
                    Cancel
                  </Button>
                  <Button onClick={handleSubmit} size="lg" className="bg-blue-700 hover:bg-blue-800 w-full md:w-auto">
                    {editingKey ? 'Update' : 'Create'} Shipment
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative max-w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              type="text"
              placeholder="Search by shipment ID, invoice, or customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 py-5 md:py-6 text-sm md:text-base border-2 border-gray-300 focus:border-blue-500 rounded-lg shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Clear search"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="mt-2 text-sm text-gray-600">
              Found {filteredShipments.length} result{filteredShipments.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Shipments Table */}
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl md:text-2xl font-bold">
              All Shipments ({filteredShipments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-blue-50">
                  <TableHead className="font-bold">Shipment ID</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden md:table-cell">Vehicle</TableHead>
                  <TableHead className="hidden lg:table-cell">Dispatched</TableHead>
                  <TableHead>Boxes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredShipments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 md:py-16 text-gray-500">
                      {searchQuery ? (
                        <>
                          <p className="font-medium mb-2">No shipments match your search</p>
                          <p className="text-sm mb-4">Try a different search term or</p>
                          <Button variant="outline" onClick={clearSearch}>Clear Search</Button>
                        </>
                      ) : (
                        'No shipments created yet'
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredShipments.map(s => {
                    const inv = invoices.find(i => i.id === s.invoiceId);
                    const invCurrency = inv?.currency || 'INR';
                    const invSymbol = CURRENCY_SYMBOLS[invCurrency];
                    const boxCount = s.packingBoxes?.length ?? 0;
                    return (
                      <TableRow key={s.id} className="hover:bg-blue-50/50">
                        <TableCell className="font-bold text-blue-700">{s.shipmentId}</TableCell>
                        <TableCell className="font-medium">{s.invoiceNumber}</TableCell>
                        <TableCell>{s.customerName}</TableCell>
                        <TableCell className="font-mono hidden md:table-cell">{s.vehicleNo || '—'}</TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {(() => {
                            try {
                              if (!s.dispatchDate) return '—';
                              const d = new Date(s.dispatchDate);
                              return isNaN(d.getTime()) ? 'Invalid Date' : format(d, 'dd MMM yyyy');
                            } catch { return '—'; }
                          })()}
                        </TableCell>
                        <TableCell>
                          {boxCount > 0
                            ? <Badge className="bg-indigo-100 text-indigo-800 border border-indigo-300 text-xs">{boxCount} box{boxCount > 1 ? 'es' : ''}</Badge>
                            : <span className="text-gray-400 text-xs">—</span>
                          }
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={s.deliveryStatus} />
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-center">
                            <RowActions
                              actions={[
                                { label: 'View', icon: Eye, onClick: () => openLRView(s) },
                                { label: 'Edit', icon: Edit, onClick: () => handleEdit(s) },
                                { label: 'Delete', icon: Trash2, onClick: () => s.id && handleDelete(s.id), className: 'text-red-600 hover:text-red-700' },
                                { label: 'Move to Packing', icon: Package, onClick: () => handleMoveToPacking(s), className: 'text-blue-600 hover:text-blue-700' },
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
          </CardContent>
        </Card>

        {/* Packing List Preview Modal */}
        {viewLROpen && selectedShipment && (
          <PackingListPreviewModal
            shipment={selectedShipment}
            invoice={invoices.find((i) => i.id === selectedShipment.invoiceId)}
            boxes={selectedShipment.packingBoxes || []}
            onClose={() => {
              setViewLROpen(false);
              setSelectedShipment(null);
            }}
          />
        )}
      </div>
    </div>
  );
}