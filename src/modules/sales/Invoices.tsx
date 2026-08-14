//Need to Fix 
//1) Table items alignment is not proper 
//2) Terms & Conditions inside the create new quotation is not proper (download pdf)
"use client"
import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { StatusBadge } from "@/components/ui/status-badge"
import { RowActions } from "@/components/ui/row-actions"
import { Download, Edit, Trash2, Plus, X, Copy, Search, Calendar, Filter, Eye, Ban } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import html2canvas from "html2canvas"
import jsPDF from "jspdf"
import { getAllRecords, deleteRecord, updateRecord } from "@/services/firebase"
import CreateInvoice from "./CreateInvoice"
import fas from "./fas.png"
import { Textarea } from "@/components/ui/textarea"
import { formatAddress } from "@/utils/addressUtils"

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "د.إ",
}

const ITEMS_FIRST_PAGE = 8
const ITEMS_OTHER_PAGES = 12

const buildInvoicePages = (items: any[]): any[][] => {
  if (items.length === 0) return [[]]
  const result: any[][] = []
  result.push(items.slice(0, ITEMS_FIRST_PAGE))
  let rest = items.slice(ITEMS_FIRST_PAGE)
  while (rest.length > 0) {
    result.push(rest.slice(0, ITEMS_OTHER_PAGES))
    rest = rest.slice(ITEMS_OTHER_PAGES)
  }
  const last = result[result.length - 1]
  if (last.length === 0 && result.length > 1) {
    const prev = result[result.length - 2]
    const moved = prev.pop()!
    result[result.length - 1] = [moved]
  }
  return result
}

// Professional Invoice Template - A4 Portrait, Tally-style format
const FullInvoiceTemplate = ({ invoice }: { invoice: any }) => {
  const currency = invoice.currency || "INR";
  const symbol = CURRENCY_SYMBOLS[currency] || "₹";

  const numberToWords = (num: number): string => {
    if (currency !== "INR") return "";
    const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
    const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    const integerPart = Math.floor(num);
    if (integerPart === 0) return "Zero Rupees Only";

    function convertTwoDigit(n: number): string {
      if (n < 10) return units[n];
      if (n >= 10 && n < 20) return teens[n - 10];
      return tens[Math.floor(n / 10)] + (n % 10 > 0 ? " " + units[n % 10] : "");
    }

    let word = "";
    let part = Math.floor(integerPart / 10000000); if (part > 0) { word += convertTwoDigit(part) + " Crore "; }
    part = Math.floor(integerPart / 100000) % 100; if (part > 0) { word += convertTwoDigit(part) + " Lakh "; }
    part = Math.floor(integerPart / 1000) % 100; if (part > 0) { word += convertTwoDigit(part) + " Thousand "; }
    part = Math.floor(integerPart / 100) % 10; if (part > 0) { word += units[part] + " Hundred "; }
    part = integerPart % 100; if (part > 0) { word += convertTwoDigit(part) + " "; }
    return word.trim() + " Rupees Only";
  };

  const formatAmount = (n: number) =>
    Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const amountInWords = numberToWords(invoice.grandTotal || 0);
  const taxableAmountValue = invoice.taxableAmount || invoice.lineItems?.reduce((sum: number, item: any) => sum + (item.taxableValue || item.taxable || 0), 0) || 0;

  const items = invoice.lineItems || [];
  const pages = buildInvoicePages(items);
  const totalPages = pages.length;

  const bankDetails = {
    bankName: "Canara Bank",
    accountNo: "9921201001078",
    ifscCode: "CNRB0002617",
    branch: "Perungudi, Chennai 600096.",
  };

  return (
    <>
      <style>
        {`
          @media print {
            @page { size: A4 landscape; margin: 0; }
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
            .page-break { page-break-after: always; break-after: page; }
          }
          .invoice-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          .invoice-table td, .invoice-table th {
            border: 1.5px solid #000;
            padding: 3px 4px;
            vertical-align: middle;
            font-size: 11px;
            line-height: 1.3;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          .invoice-table th {
            background: #e5e7eb;
            font-weight: 900;
            text-align: center;
          }
          .footer-left {
            font-size: 11px;
            border-top: 2px solid #000;
            padding-top: 5px;
            display: flex;
            flex-direction: column;
            overflow: visible;
          }
          .terms-block {
            font-size: 11px;
            border-top: 1px solid #e5e7eb;
            padding-top: 4px;
            margin-top: 4px;
            overflow: visible;
          }
          .terms-text {
            white-space: pre-wrap;
            line-height: 1.35;
            margin: 0;
            font-weight: 900;
            word-break: break-word;
            overflow: visible;
          }
        `}
      </style>

      <div>
        {pages.map((pageItems, pageIndex) => {
          const isLastPage = pageIndex === totalPages - 1;
          const offset = pageIndex === 0
            ? 0
            : ITEMS_FIRST_PAGE + (pageIndex - 1) * ITEMS_OTHER_PAGES;

          return (
            <div
              key={pageIndex}
              className={`invoice-page ${!isLastPage ? "page-break" : ""}`}
              style={{
                width: "297mm",
                height: "210mm",
                maxHeight: "210mm",
                background: "#ffffff",
                margin: "0 auto 40px",
                padding: 0,
                fontFamily: "Arial, sans-serif",
                color: "#000",
                position: "relative",
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  border: "2.5px solid #000",
                  height: "100%",
                  maxHeight: "100%",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  boxSizing: "border-box",
                }}
              >
                {/* ── Company Header ── */}
                <div style={{ flexShrink: 0 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 14px', borderBottom: '2.5px solid #000',
                    background: '#ffffff', gap: '10px',
                  }}>
                    <img src={fas} alt="FAS Logo" style={{ width: '80px', height: 'auto', flexShrink: 0 }} />
                    <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
                      <h1 style={{
                        fontSize: '20px', fontWeight: '800', margin: 0, letterSpacing: '0.5px', color: '#000',
                        lineHeight: 1.2, whiteSpace: 'normal',
                      }}>
                        Fluoro Automation Seals Pvt Ltd
                      </h1>
                      <p style={{ fontSize: '11px', margin: '2px 0 0 0', color: '#000', lineHeight: 1.4, fontWeight: '600' }}>
                        3/180, Rajiv Gandhi Road, Mettukuppam, Chennai Tamil Nadu 600097 India<br />
                        Phone: +91-9841175097 | Email: fas@fluoroautomationseals.com
                      </p>
                    </div>
                    <div style={{ width: '80px' }}></div>
                  </div>

                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '4px 14px', background: '#e5e7eb', borderBottom: '2.5px solid #000',
                    fontSize: '11px', fontWeight: '800', gap: '40px', flexWrap: 'nowrap', overflow: 'hidden',
                  }}>
                    <div style={{ display: 'flex', gap: '4px' }}><span style={{ fontWeight: '900' }}>GSTIN:</span><span>33AAECF2716M1ZO</span></div>
                    <div style={{ display: 'flex', gap: '4px' }}><span style={{ fontWeight: '900' }}>PAN:</span><span>AAECF2716M</span></div>
                    <div style={{ display: 'flex', gap: '4px' }}><span style={{ fontWeight: '900' }}>CIN:</span><span>U25209TN2020PTC138498</span></div>
                  </div>
                </div>

                {/* ── Page Body ── */}
                <div style={{ flex: 1, padding: "6px 14px 25px 14px", display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>

                  {/* Page 1: Title + Customer Block */}
                  {pageIndex === 0 && (
                    <>
                      <h2 style={{ textAlign: 'center', fontSize: '16px', fontWeight: '900', margin: '0 0 5px 0', letterSpacing: '1.5px', flexShrink: 0 }}>
                        TAX INVOICE
                      </h2>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.1fr', gap: '8px', fontSize: '11px', marginBottom: '15px', flexShrink: 0 }}>
                        {/* Bill To */}
                        <div style={{ overflow: 'hidden' }}>
                          <p style={{ fontWeight: '900', fontSize: '11px', textDecoration: 'underline', margin: '0 0 2px 0' }}>Bill To:</p>
                          <p style={{ fontWeight: '900', fontSize: '11px', margin: '0 0 2px 0', wordBreak: 'break-word' }}>
                            {invoice.customerName || '—'}
                          </p>
                          <p style={{ whiteSpace: 'pre-line', fontSize: '11px', lineHeight: 1.35, margin: '0 0 2px 0', fontWeight: '600', wordBreak: 'break-word' }}>
                            {formatAddress(invoice.billingAddress)}
                          </p>
                        </div>

                        {/* Ship To */}
                        <div style={{ overflow: 'hidden' }}>
                          <p style={{ fontWeight: '900', fontSize: '11px', textDecoration: 'underline', margin: '0 0 2px 0' }}>Ship To:</p>
                          <p style={{ fontSize: '11px', lineHeight: 1.35, whiteSpace: 'pre-line', fontWeight: '600', margin: 0, wordBreak: 'break-word' }}>
                            {formatAddress(invoice.shippingAddress || invoice.billingAddress)}
                          </p>
                          <p style={{ marginTop: '4px', fontSize: '11px', fontWeight: '700' }}>
                            <strong>Place of Supply:</strong> {invoice.placeOfSupply || "Tamil Nadu"}
                          </p>
                        </div>

                        {/* Invoice Details */}
                        <div>
                          <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                            <colgroup>
                              <col style={{ width: '48%' }} />
                              <col style={{ width: '52%' }} />
                            </colgroup>
                            <tbody>
                              {[
                                ['Invoice No.:', invoice.invoiceNumber, '12px'],
                                ['Invoice Date:', invoice.invoiceDate ? format(new Date(invoice.invoiceDate), "dd/MM/yyyy") : '—', null],
                                ['Payment Terms:', invoice.paymentTerms, null],
                                ['Transporter:', invoice.transporterName || '—', null],
                                ['E-Way Bill No.:', invoice.eWayBillNo || '—', null],
                                ['Cust PO No.:', invoice.customerPONo || '—', null],
                                ['Cust PO Date:', invoice.customerPODate ? format(new Date(invoice.customerPODate), "dd/MM/yyyy") : '—', null],
                              ].map(([label, value, fs]) => (
                                <tr key={label}>
                                  <td style={{ paddingRight: '6px', paddingTop: '2px', paddingBottom: '2px', verticalAlign: 'top', fontWeight: '700', fontSize: '11px', lineHeight: '1.2' }}>
                                    {label}
                                  </td>
                                  <td style={{ fontWeight: fs ? '900' : '800', paddingTop: '2px', paddingBottom: '2px', fontSize: fs || '11px', wordBreak: 'break-word', lineHeight: '1.2' }}>
                                    {value}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Pages 2+: Continuation Header */}
                  {pageIndex > 0 && (
                    <div style={{ marginBottom: '6px', paddingTop: '4px', flexShrink: 0, textAlign: 'center' }}>
                      <h3 style={{ fontSize: '12px', fontWeight: '900', marginBottom: '2px' }}>
                        TAX INVOICE — {invoice.invoiceNumber} (Continued)
                      </h3>
                      <p style={{ fontSize: '11px', color: '#555' }}>
                        Page {pageIndex + 1} of {totalPages}
                      </p>
                    </div>
                  )}

                  {/* ── Items Table (Updated UI) ── */}
                  <div style={{ flexShrink: 0, marginBottom: isLastPage ? '8px' : '0' }}>
                    <table className="invoice-table">
                      <colgroup>
                        <col style={{ width: '4%' }} />
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '31%' }} />
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '6%' }} />
                        <col style={{ width: '6%' }} />
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '5%' }} />
                        <col style={{ width: '8%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Sr.</th>
                          <th>SKU / Code</th>
                          <th>Description</th>
                          <th>HSN</th>
                          <th>UOM</th>
                          <th>Qty</th>
                          <th>Rate<br />({symbol})</th>
                          <th>Amount<br />({symbol})</th>
                          <th>Disc<br />%</th>
                          <th>Net<br />({symbol})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageItems.map((item, i) => {
                          const qty = item.qty || item.invoicedQty || 0;
                          const rate = item.rate || item.unitRate || 0;
                          const amount = qty * rate;
                          const taxableValue = item.taxableValue || item.taxable || amount - (item.discount || 0);

                          return (
                            <tr key={i}>
                              <td style={{ textAlign: 'center', fontWeight: '800' }}>{offset + i + 1}</td>
                              <td style={{ fontWeight: '800', textAlign: 'center' }}>{item.partCode || item.productCode || ""}</td>
                              <td style={{ fontWeight: '700' }}>
                                <div style={{ display: 'block', lineHeight: '1.4', paddingBottom: '7px' }}>
                                  {item.description || item.productDescription || ""}
                                </div>
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: '700', paddingBottom: '7px' }}>{item.hsnCode || item.hsn || ""}</td>
                              <td style={{ textAlign: 'center', fontWeight: '700', paddingBottom: '7px' }}>{item.uom || "NOS"}</td>
                              <td style={{ textAlign: 'center', fontWeight: '800', paddingBottom: '7px' }}>{Number(qty).toFixed(2)}</td>
                              <td style={{ textAlign: 'right', fontWeight: '700', paddingBottom: '7px' }}>{formatAmount(rate)}</td>
                              <td style={{ textAlign: 'right', fontWeight: '800', paddingBottom: '7px' }}>{formatAmount(amount)}</td>
                              <td style={{ textAlign: 'center', fontWeight: '700', paddingBottom: '7px' }}>{formatAmount(item.discount || 0)}</td>
                              <td style={{ textAlign: 'right', fontWeight: '900', background: '#f9fafb', paddingBottom: '7px' }}>{formatAmount(taxableValue)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* ── Footer (last page only) ── */}
                  {isLastPage && (
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1.15fr 0.85fr',
                      gap: '10px', flexShrink: 0, marginTop: 'auto'
                    }}>
                      {/* LEFT: Remarks + Bank Details + Terms */}
                      <div className='footer-left'>
                        <p style={{ lineHeight: 1.4, margin: '0 0 2px 0', fontWeight: '700', wordBreak: 'break-word' }}>
                          <strong style={{ fontWeight: '900' }}>Remarks:</strong> {invoice.remarks || 'None'}
                        </p>
                        <p style={{ fontStyle: 'italic', fontSize: '11px', fontWeight: '700', margin: '0 0 5px 0', wordBreak: 'break-word' }}>
                          <strong>Amount in Words:</strong> {amountInWords}
                        </p>

                        {/* Bank Details */}
                        <div style={{ fontSize: '11px', marginBottom: '8px' }}>
                          <p style={{ margin: '0 0 2px 0', fontWeight: '900' }}>Company's Bank Details:</p>
                          <table style={{ borderCollapse: 'collapse', fontSize: '11px' }}>
                            <tbody>
                              {[
                                ['Bank Name', bankDetails.bankName],
                                ['A/c No.', bankDetails.accountNo],
                                ['IFSC Code', bankDetails.ifscCode],
                                ['Bank Branch', bankDetails.branch],
                              ].map(([k, v]) => (
                                <tr key={k}>
                                  <td style={{ paddingRight: '6px', width: '76px', fontWeight: '700' }}>{k}</td>
                                  <td style={{ padding: '0 3px', fontWeight: '600' }}>:</td>
                                  <td style={{ fontWeight: '700' }}>{v}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="terms-block">
                          <p style={{ margin: '0 0 2px 0', fontWeight: '900' }}>Terms & Conditions:</p>
                          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.3, margin: 0, fontWeight: '600' }}>{invoice.terms || "Certified that the Particulars given above are true and correct"}</p>
                        </div>
                      </div>

                      {/* RIGHT: Totals + Signature */}
                      <div style={{ borderTop: '2px solid #000', paddingTop: '5px', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>

                        {/* Totals Section */}
                        <table style={{ marginLeft: 'auto', fontSize: '11px', width: '100%' }}>
                          <tbody>
                            <tr>
                              <td style={{ paddingRight: '10px', paddingTop: '2px', paddingBottom: '2px', textAlign: 'right', fontWeight: '800' }}>Subtotal</td>
                              <td style={{ fontWeight: '900', paddingLeft: '10px', width: '90px', textAlign: 'right', paddingTop: '2px', paddingBottom: '2px' }}>{symbol}{formatAmount(taxableAmountValue)}</td>
                            </tr>
                            {(invoice.cgstAmount > 0 || invoice.applyCGST) && (
                              <tr>
                                <td style={{ paddingRight: '10px', paddingTop: '2px', paddingBottom: '2px', textAlign: 'right', fontWeight: '800' }}>CGST @{invoice.cgstPercent || 9}%</td>
                                <td style={{ fontWeight: '900', paddingLeft: '10px', textAlign: 'right', paddingTop: '2px', paddingBottom: '2px' }}>{symbol}{formatAmount(invoice.cgstAmount || 0)}</td>
                              </tr>
                            )}
                            {(invoice.sgstAmount > 0 || invoice.applySGST) && (
                              <tr>
                                <td style={{ paddingRight: '10px', paddingTop: '2px', paddingBottom: '2px', textAlign: 'right', fontWeight: '800' }}>SGST @{invoice.sgstPercent || 9}%</td>
                                <td style={{ fontWeight: '900', paddingLeft: '10px', textAlign: 'right', paddingTop: '2px', paddingBottom: '2px' }}>{symbol}{formatAmount(invoice.sgstAmount || 0)}</td>
                              </tr>
                            )}
                            {(invoice.igstAmount > 0 || invoice.applyIGST) && (
                              <tr>
                                <td style={{ paddingRight: '10px', paddingTop: '2px', paddingBottom: '2px', textAlign: 'right', fontWeight: '800' }}>IGST @{invoice.igstPercent || 18}%</td>
                                <td style={{ fontWeight: '900', paddingLeft: '10px', textAlign: 'right', paddingTop: '2px', paddingBottom: '2px' }}>{symbol}{formatAmount(invoice.igstAmount || 0)}</td>
                              </tr>
                            )}
                            {(invoice.transportCharge > 0) && (
                              <tr>
                                <td style={{ paddingRight: '10px', paddingTop: '2px', paddingBottom: '2px', textAlign: 'right', fontWeight: '800' }}>Transport Charge</td>
                                <td style={{ fontWeight: '900', paddingLeft: '10px', textAlign: 'right', paddingTop: '2px', paddingBottom: '2px' }}>{symbol}{formatAmount(invoice.transportCharge)}</td>
                              </tr>
                            )}
                            <tr>
                              <td style={{ paddingRight: '10px', paddingTop: '2px', paddingBottom: '2px', textAlign: 'right', fontWeight: '800' }}>Round Off</td>
                              <td style={{ fontWeight: '900', paddingLeft: '10px', textAlign: 'right', paddingTop: '2px', paddingBottom: '2px' }}>{symbol}{formatAmount(Math.round(invoice.grandTotal || 0) - (invoice.grandTotal || 0))}</td>
                            </tr>
                            <tr style={{ borderTop: '2px solid #000' }}>
                              <td style={{ paddingRight: '10px', paddingTop: '4px', paddingBottom: '4px', fontSize: '12px', fontWeight: '900', textAlign: 'right' }}>
                                Total Amount ({currency})
                              </td>
                              <td style={{ fontSize: '13px', fontWeight: '900', paddingLeft: '10px', textAlign: 'right', paddingTop: '4px', paddingBottom: '4px' }}>
                                {symbol}{formatAmount(Math.round(invoice.grandTotal || 0))}
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        {/* Signature — pinned right */}
                        <div style={{ marginTop: '10px', textAlign: 'right' }}>
                          <p style={{ fontWeight: '900', fontSize: '11px', marginBottom: '26px' }}>
                            For Fluoro Automation Seals Pvt Ltd
                          </p>
                          <div style={{ borderTop: '1.5px solid #000', width: '160px', paddingTop: '4px', marginLeft: 'auto', marginBottom: '10px' }}>
                            <p style={{ fontWeight: '900', fontSize: '11px' }}>Authorised Signatory</p>
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



// Modal Preview with Download
// Modal Preview with Download
const InvoicePreviewModal = ({ invoice, onClose }: { invoice: any; onClose: () => void }) => {
  const hiddenRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // FIXED FOR EXACT LANDSCAPE A4 SCALING WITHOUT SQUISHING
  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const toastId = toast.loading("Generating PDF...");
      const pdf = new jsPDF("l", "mm", "a4");

      const pages = hiddenRef.current?.querySelectorAll('.invoice-page');

      if (!pages || pages.length === 0) throw new Error("No pages found");

      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i] as HTMLElement, {
          scale: 2, // High resolution
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          windowWidth: 1123, // Force exact width for accurate aspect ratio
        });

        const imgData = canvas.toDataURL("image/jpeg", 1.0);

        if (i > 0) pdf.addPage();
        // A4 landscape is exactly 297mm x 210mm
        pdf.addImage(imgData, "JPEG", 0, 0, 297, 210);
      }

      pdf.save(`${invoice.invoiceNumber}.pdf`);
      toast.dismiss(toastId);
      toast.success("Invoice downloaded successfully!");
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.dismiss();
      toast.error("Failed to download PDF");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      {/* Hidden element for PDF capture - FORCED WIDTH PREVENTS SQUISHING */}
      <div
        ref={hiddenRef}
        style={{
          position: "fixed",
          top: 0,
          left: "-9999px",
          width: "1123px", // Exactly 297mm at standard DPI
          background: "#fff",
          zIndex: -1,
        }}
      >
        <FullInvoiceTemplate invoice={invoice} />
      </div>

      {/* Hide ugly default browser scrollbars for clean UI */}
      <style>
        {`
          .no-scrollbar::-webkit-scrollbar {
            display: none;
          }
          .no-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        `}
      </style>

      <Dialog open={true} onOpenChange={onClose}>
        {/* Widened Modal (1200px) so horizontal scrolling is completely eliminated */}
        <DialogContent className="max-w-[1200px] max-h-[95vh] p-0 flex flex-col overflow-hidden bg-gray-100">

          <DialogHeader className="p-4 bg-white border-b shrink-0 shadow-sm z-10">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold text-blue-900">
                Invoice Preview - {invoice.invoiceNumber}
              </DialogTitle>
              <div className="flex gap-3">
                <Button
                  className="bg-green-600 hover:bg-green-700 shadow-md"
                  onClick={handleDownload}
                  disabled={isDownloading}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {isDownloading ? "Generating..." : "Download PDF"}
                </Button>
                <Button variant="outline" onClick={onClose}>
                  <X className="h-4 w-4 mr-2" />
                  Close
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Wrapper with no scrollbar class - looks clean like an image */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar py-6 flex justify-center">
            <div
              className="bg-transparent overflow-visible drop-shadow-2xl"
              style={{ width: "297mm", flexShrink: 0 }}
            >
              <FullInvoiceTemplate invoice={invoice} />
            </div>
          </div>

        </DialogContent>
      </Dialog>
    </>
  );
};

const generateYearOptions = () => {
  const currentYear = new Date().getFullYear()
  const years: number[] = []
  for (let y = currentYear - 5; y <= currentYear + 1; y++) {
    years.push(y)
  }
  return years.sort((a, b) => b - a)
}

const monthOptions = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
]

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [filteredInvoices, setFilteredInvoices] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>("")
  const navigate = useNavigate()
  // ── Searchable customer filter states ──────────────────────────────────
  const [customerFilterSearch, setCustomerFilterSearch] = useState("")
  const [customerFilterOpen, setCustomerFilterOpen] = useState(false)
  const customerFilterRef = useRef<HTMLDivElement>(null)
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancellingInvoice, setCancellingInvoice] = useState<any | null>(null);
  const [cancelRemark, setCancelRemark] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // ── Click-outside: close customer filter dropdown ──────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerFilterRef.current && !customerFilterRef.current.contains(e.target as Node))
        setCustomerFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openCancelInvoice = (inv: any) => {
    setCancellingInvoice(inv);
    setCancelRemark('');
    setIsCancelOpen(true);
  };

  const handleCancelInvoice = async () => {
    if (!cancellingInvoice) return;
    if (!cancelRemark.trim()) {
      toast.error('Please enter a cancellation remark');
      return;
    }
    setIsCancelling(true);
    try {
      const now = Date.now();

      // 1. Mark invoice as cancelled
      await updateRecord('sales/invoices', cancellingInvoice.id, {
        status: 'cancelled',
        cancelledAt: now,
        cancelRemark: cancelRemark.trim(),
        updatedAt: now,
      });

      // 2. Unlock the linked sales order (set back to Confirmed so it can be re-invoiced)
      if (cancellingInvoice.orderId) {
        await updateRecord('sales/orderAcknowledgements', cancellingInvoice.orderId, {
          invoiceStatus: 'notgenerated',
          updatedAt: now,
        });
      }

      toast.success(`Invoice ${cancellingInvoice.invoiceNumber} cancelled. Linked order unlocked.`);

      // Update local state
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === cancellingInvoice.id
            ? { ...inv, status: 'cancelled', cancelledAt: now, cancelRemark: cancelRemark.trim() }
            : inv
        )
      );

      setIsCancelOpen(false);
      setCancellingInvoice(null);
      setCancelRemark('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to cancel invoice');
    } finally {
      setIsCancelling(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const [invoiceData, customerData] = await Promise.all([
          getAllRecords("sales/invoices"),
          getAllRecords("sales/customers"),
        ])

        const sortedInvoices = (invoiceData as any[]).sort(
          (a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0)
        )
        setInvoices(sortedInvoices)
        setFilteredInvoices(sortedInvoices)

        const sortedCustomers = (customerData as any[]).sort((a: any, b: any) =>
          a.companyName.localeCompare(b.companyName)
        )
        setCustomers(sortedCustomers)
      } catch (err) {
        toast.error("Failed to load data")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  useEffect(() => {
    let result = [...invoices]

    if (selectedCustomerId !== "all") {
      result = result.filter((inv: any) => inv.customerId === selectedCustomerId)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter((inv: any) => {
        const invoiceNumber = (inv.invoiceNumber || "").toLowerCase()
        const customerName = (inv.customerName || "").toLowerCase()
        return invoiceNumber.startsWith(query) || customerName.startsWith(query)
      })
    }

    if (selectedDate) {
      result = result.filter((inv: any) => {
        const invDate = new Date(inv.invoiceDate).toISOString().split("T")[0]
        return invDate === selectedDate
      })
    }

    setFilteredInvoices(result)
  }, [selectedCustomerId, searchQuery, invoices, selectedDate])

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this invoice permanently?")) return

    try {
      await deleteRecord("sales/invoices", id)
      toast.success("Invoice deleted")
      setInvoices((prev) => prev.filter((inv) => inv.id !== id))
      setFilteredInvoices((prev) => prev.filter((inv) => inv.id !== id))
    } catch (err) {
      toast.error("Delete failed")
    }
  }

  const handleDuplicate = (id: string) => {
    navigate(`/sales/invoices/edit/${id}?duplicate=true`)
    toast.info("Duplicating invoice - a new invoice number will be generated.")
  }

  const handleViewInvoice = (invoice: any) => {
    setSelectedInvoice(invoice)
  }

  const clearSearch = () => {
    setSearchQuery("")
  }

  const clearFilters = () => {
    setSearchQuery("")
    setSelectedCustomerId("all")
    setSelectedDate("")
  }

  const hasActiveFilters = searchQuery || selectedCustomerId !== "all" || selectedDate
  const totalAmount = filteredInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0)

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-blue-900">GST Invoices</h1>
            <p className="text-sm text-gray-600 mt-1">
              {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? "s" : ""} · Total: ₹
              {totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </p>
          </div>
          <Button onClick={() => navigate("/sales/invoices/create")}>
            <Plus className="h-5 w-5 mr-2" />
            Create New Invoice
          </Button>
        </div>

        <Tabs defaultValue="list" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="list">All Invoices</TabsTrigger>
            <TabsTrigger value="create">Create / Edit</TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            <Card className="mb-6">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-5 w-5 text-blue-600" />
                  <CardTitle className="text-lg">Filters</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4 items-end flex-wrap">
                  <div className="relative flex-1 min-w-[280px]">
                    <Label className="text-sm font-medium mb-2 block">Search</Label>
                    <Search className="absolute left-3 top-10 h-5 w-5 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Search by invoice number or customer name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 pr-10"
                    />
                    {searchQuery && (
                      <button
                        onClick={clearSearch}
                        className="absolute right-3 top-10 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    )}
                  </div>

                  <div className="relative w-[200px]">
                    <Label className="text-sm font-medium mb-2 block">Date</Label>
                    <Calendar className="absolute left-3 top-10 h-5 w-5 text-gray-400" />
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="pl-10 pr-10"
                    />
                    {selectedDate && (
                      <button
                        onClick={() => setSelectedDate("")}
                        className="absolute right-3 top-10 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    )}
                  </div>

                  <div className="w-[280px]">
                    <Label className="text-sm font-medium mb-2 block">Customer</Label>
                    {/* Searchable Customer Filter Combobox */}
                    <div className="relative" ref={customerFilterRef}>
                      <div
                        className="flex items-center border rounded-md px-3 h-10 cursor-pointer bg-white hover:border-blue-400"
                        onClick={() => setCustomerFilterOpen((p) => !p)}
                      >
                        <span className="flex-1 text-sm truncate">
                          {selectedCustomerId === 'all'
                            ? 'All Customers'
                            : customers.find((c) => c.id === selectedCustomerId)?.companyName || 'All Customers'}
                        </span>
                        {selectedCustomerId !== 'all' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedCustomerId('all'); setCustomerFilterSearch(''); }}
                            className="text-gray-400 hover:text-gray-600 mr-1"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                      {customerFilterOpen && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg">
                          <div className="p-2 border-b">
                            <input
                              autoFocus
                              className="w-full text-sm border rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-400"
                              placeholder="Search by name or code..."
                              value={customerFilterSearch}
                              onChange={(e) => setCustomerFilterSearch(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <ul className="max-h-60 overflow-y-auto">
                            <li
                              className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 font-medium text-gray-600"
                              onClick={() => { setSelectedCustomerId('all'); setCustomerFilterOpen(false); setCustomerFilterSearch(''); }}
                            >
                              All Customers
                            </li>
                            {customers
                              .filter((c) => {
                                const q = customerFilterSearch.toLowerCase()
                                return (
                                  (c.companyName || '').toLowerCase().includes(q) ||
                                  (c.customerCode || '').toLowerCase().includes(q)
                                )
                              })
                              .map((c) => (
                                <li
                                  key={c.id}
                                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 ${
                                    selectedCustomerId === c.id ? 'bg-blue-50 font-semibold' : ''
                                  }`}
                                  onClick={() => {
                                    setSelectedCustomerId(c.id)
                                    setCustomerFilterOpen(false)
                                    setCustomerFilterSearch('')
                                  }}
                                >
                                  <span className="font-medium">{c.companyName}</span>
                                  <span className="text-gray-400 ml-2 text-xs">({c.customerCode})</span>
                                </li>
                              ))}
                            {customers.filter((c) => {
                              const q = customerFilterSearch.toLowerCase()
                              return (c.companyName || '').toLowerCase().includes(q) || (c.customerCode || '').toLowerCase().includes(q)
                            }).length === 0 && (
                              <li className="px-3 py-3 text-sm text-gray-400 text-center">No customers match</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {hasActiveFilters && (
                  <div className="flex justify-end pt-2">
                    <Button variant="outline" onClick={clearFilters}>
                      <X className="h-4 w-4 mr-2" />
                      Clear All Filters
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {hasActiveFilters && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900 font-medium">
                  Found {filteredInvoices.length} result{filteredInvoices.length !== 1 ? "s" : ""}
                  {searchQuery && ` matching "${searchQuery}"`}
                  {selectedCustomerId !== "all" &&
                    ` for ${customers.find((c) => c.id === selectedCustomerId)?.companyName}`}
                  {selectedDate && ` on ${format(new Date(selectedDate), "dd-MM-yyyy")}`}
                </p>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>All Generated Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-center py-8">Loading invoices...</p>
                ) : filteredInvoices.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    {hasActiveFilters ? (
                      <>
                        <p className="text-lg font-medium mb-2">No invoices found</p>
                        <p className="text-sm mb-4">No results match your current filters.</p>
                        <Button variant="outline" onClick={clearFilters}>
                          Clear All Filters
                        </Button>
                      </>
                    ) : (
                      <p>No invoices generated yet. Click "Create New Invoice" to get started.</p>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice No</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Cancel Remark</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInvoices.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell className="font-mono font-semibold">
                              {inv.invoiceNumber}
                            </TableCell>
                            <TableCell>
                              {(() => {
                                try {
                                  if (!inv.invoiceDate) return "—";
                                  const d = new Date(inv.invoiceDate);
                                  return isNaN(d.getTime()) ? "Invalid Date" : format(d, "dd-MM-yyyy");
                                } catch (e) {
                                  return "—";
                                }
                              })()}
                            </TableCell>
                            <TableCell>
                              {inv.customerName ||
                                customers.find((c: any) => c.id === inv.customerId)?.companyName ||
                                '—'}
                            </TableCell>
                            <TableCell className="font-medium">
                              ₹{Number(inv.grandTotal || 0).toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={inv.status === 'cancelled' ? 'Cancelled' : 'Generated'} />
                            </TableCell>

                            <TableCell className="max-w-[200px]">
                              {inv.status === 'cancelled' && inv.cancelRemark ? (
                                <div className="flex items-start gap-1.5">
                                  <Ban className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                                  <span
                                    className="text-xs text-red-700 line-clamp-2"
                                    title={inv.cancelRemark}
                                  >
                                    {inv.cancelRemark}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-center">
                                <RowActions
                                  actions={[
                                    { label: 'View', icon: Eye, onClick: () => handleViewInvoice(inv), className: 'text-blue-600 hover:text-blue-700' },
                                    { label: 'Duplicate', icon: Copy, onClick: () => handleDuplicate(inv.id), className: 'text-blue-600 hover:text-blue-700' },
                                    {
                                      label: inv.status === 'cancelled' ? 'Cannot edit a cancelled invoice' : 'Edit',
                                      icon: Edit,
                                      onClick: () => navigate(`/sales/invoices/edit/${inv.id}`),
                                      disabled: inv.status === 'cancelled',
                                    },
                                    { label: 'Cancel Invoice', icon: Ban, onClick: () => openCancelInvoice(inv), className: 'text-red-600 hover:text-red-700', hidden: inv.status === 'cancelled' },
                                  ]}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="create">
            <CreateInvoice />
          </TabsContent>
        </Tabs>

        {selectedInvoice && (
          <InvoicePreviewModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
        )}
        {/* Cancel Invoice Dialog */}
        {isCancelOpen && cancellingInvoice && (
          <Dialog open={isCancelOpen} onOpenChange={(open) => { if (!open) { setIsCancelOpen(false); setCancelRemark(''); } }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-700">
                  <Ban className="h-5 w-5" />
                  Cancel Invoice — {cancellingInvoice.invoiceNumber}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  Cancelling this invoice will mark it as <strong>Cancelled</strong> and unlock the linked sales order for re-invoicing. This action is recorded and cannot be undone.
                </p>
                <div>
                  <Label>Cancellation Remark <span className="text-red-500">*</span></Label>
                  <Textarea
                    value={cancelRemark}
                    onChange={(e) => setCancelRemark(e.target.value)}
                    placeholder="e.g. Wrong quantity, customer dispute, billing error..."
                    rows={3}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-2">
                <Button variant="outline" onClick={() => { setIsCancelOpen(false); setCancelRemark(''); }}>
                  Keep Invoice
                </Button>
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleCancelInvoice}
                  disabled={!cancelRemark.trim() || isCancelling}
                >
                  <Ban className="h-4 w-4 mr-1" />
                  {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div >
  )
}