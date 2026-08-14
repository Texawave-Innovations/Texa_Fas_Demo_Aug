//Need to Fix 
//1) Inside the pdf the GSTIN, pan, Remarks, Comments alignment is not proper
//2) Table items alignment is not proper 
//3) Signature is not proper at footer

import React from 'react';
import { format } from 'date-fns';
import fas from '../modules/sales/fas.png';

interface SalesOrder {
  id: string;
  soNumber: string;
  customerName: string;
  customerGST?: string;
  customerPAN?: string;
  customerAddress?: string;
  soDate: string;
  customerPONo?: string;
  customerPODate?: string;
  paymentTerms?: string;
  dispatchMode?: string;
  currency?: string;
  items: any[];
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  cgstPercent: number;
  sgstPercent: number;
  transportCharge: number;
  transportChargePercent: number;
  grandTotal: number;
}

interface ProformaInvoicePrintProps {
  order: SalesOrder;
  customers: any[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (num: number) => Number(num || 0).toFixed(2);

const formatSize = (size: any) => {
  if (!size) return '';
  if (typeof size === 'string') return size;
  const parts: string[] = [];
  if (size.height) parts.push(`ID:${size.height}${size.heightUnit || ''}`);
  if (size.weight) parts.push(`OD:${size.weight}${size.weightUnit || ''}`);
  if (size.length) parts.push(`T:${size.length}${size.lengthUnit || ''}`);
  return parts.join(' × ');
};

const numberToWords = (num: number): string => {
  if (num === 0) return 'Zero Only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  const convertLessThanThousand = (n: number): string => {
    if (n === 0) return '';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertLessThanThousand(n % 100) : '');
  };

  const convertToWords = (n: number): string => {
    if (n === 0) return 'Zero';
    const crore = Math.floor(n / 10000000);
    const lakh = Math.floor((n % 10000000) / 100000);
    const thousand = Math.floor((n % 100000) / 1000);
    const remainder = n % 1000;
    let result = '';
    if (crore > 0) result += convertLessThanThousand(crore) + ' Crore ';
    if (lakh > 0) result += convertLessThanThousand(lakh) + ' Lakh ';
    if (thousand > 0) result += convertLessThanThousand(thousand) + ' Thousand ';
    if (remainder > 0) result += convertLessThanThousand(remainder);
    return result.trim();
  };

  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  let words = convertToWords(rupees);
  if (paise > 0) words += ' and ' + convertToWords(paise) + ' Paise';
  return words + ' Only';
};

// ─── Dynamic Page Builder (mirrors QuotationPrintTemplate) ───────────────────

const buildPages = (items: any[]): any[][] => {
  if (!items || items.length === 0) return [[]];

  const FIRST_PAGE_LIMIT = 5;
  const SUBSEQUENT_PAGE_LIMIT = 12;

  // If everything fits on the first page, return as-is (footer fits alongside items)
  if (items.length <= FIRST_PAGE_LIMIT) return [items];

  const pages: any[][] = [];
  let remaining = [...items];

  while (remaining.length > 0) {
    const isFirstPage = pages.length === 0;
    const capacity = isFirstPage ? FIRST_PAGE_LIMIT : SUBSEQUENT_PAGE_LIMIT;

    if (remaining.length <= capacity) {
      // All remaining items fit. This page will be the last page and will have the footer.
      // Footer is on the LAST page, so this page IS the last page — always safe.
      pages.push(remaining);
      remaining = [];
    } else {
      // More items than capacity. Fill this page.
      // But check if the very last overflow creates a situation where the next page
      // would have exactly 0 items left only footer. That can't happen since
      // we only push `capacity` items when remaining > capacity.
      // Special guard: if remaining.length === capacity + 1, filling `capacity` items
      // leaves 1 item + footer on the last page — which is fine (1 item >= 1).
      pages.push(remaining.splice(0, capacity));
    }
  }

  return pages;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProformaInvoicePrintTemplate({ order, customers }: ProformaInvoicePrintProps) {
  if (!order) return null;

  const isINR   = order.currency === 'INR';
  const symbol  = isINR ? '₹' : (order.currency === 'USD' ? '$' : order.currency || '');
  const showGST = isINR;

  const pages      = buildPages(order.items || []);
  const totalPages = pages.length;

  const pageOffsets = pages.map((_, pIdx) =>
    pages.slice(0, pIdx).reduce((sum, p) => sum + p.length, 0)
  );

  const safeFormatDate = (value?: any) => {
    try {
      if (!value) return '—';
      const d = new Date(value);
      return isNaN(d.getTime()) ? '—' : format(d, 'dd/MM/yyyy');
    } catch { return '—'; }
  };

  // ── Sub-components ──────────────────────────────────────────────────────────

  const CompanyHeader = () => (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 14px', borderBottom: '2.5px solid #000',
        background: '#ffffff', gap: '10px',
      }}>
        <img src={fas} alt="FAS Logo" style={{ width: '80px', height: 'auto', flexShrink: 0, marginLeft: '30px' }} />
        <div style={{ textAlign: 'center', flex: 1, minWidth: 0, marginRight: '100px' }}>
          <h1 style={{
            fontSize: '20px', fontWeight: '800', margin: 0,
            letterSpacing: '0.5px', color: '#000', lineHeight: 1.2, whiteSpace: 'normal',
          }}>
            Fluoro Automation Seals Pvt Ltd
          </h1>
          <p style={{ fontSize: '11px', margin: '2px 0 0 0', color: '#000', lineHeight: 1.4, fontWeight: '600' }}>
            3/180, Rajiv Gandhi Road, Mettukuppam, Chennai Tamil Nadu 600097 India<br />
            Phone: +91-841175097 | Email: fas@fluoroautomationseals.com
          </p>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '4px 14px', background: '#e5e7eb',
        borderBottom: '2.5px solid #000',
        fontSize: '11px', fontWeight: '800', gap: '40px',
        flexWrap: 'nowrap', overflow: 'hidden',
      }}>
        {[
          ['GSTIN', '33AAECF2716M1ZO'],
          ['PAN',   'AAECF2716M'],
          ['CIN',   'U25209TN2020PTC138498'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: '900' }}>{k}:</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </>
  );

  // ── Totals block ────────────────────────────────────────────────────────────

  const TotalsTable = () => (
    <table style={{ marginLeft: 'auto', fontSize: '11px', width: '100%' }}>
      <tbody>
        <tr>
          <td style={{ paddingRight: '10px', paddingTop: '2px', paddingBottom: '2px', textAlign: 'right', fontWeight: '800' }}>Subtotal</td>
          <td style={{ fontWeight: '900', paddingLeft: '10px', width: '90px', textAlign: 'right', paddingTop: '2px', paddingBottom: '2px' }}>
            {symbol}{fmt(order.subtotal)}
          </td>
        </tr>

        {showGST && order.cgstAmount > 0 && (
          <>
            <tr>
              <td style={{ paddingRight: '10px', paddingTop: '2px', paddingBottom: '2px', textAlign: 'right', fontWeight: '800' }}>CGST @{order.cgstPercent}%</td>
              <td style={{ fontWeight: '900', paddingLeft: '10px', textAlign: 'right', paddingTop: '2px', paddingBottom: '2px' }}>{symbol}{fmt(order.cgstAmount)}</td>
            </tr>
            <tr>
              <td style={{ paddingRight: '10px', paddingTop: '2px', paddingBottom: '2px', textAlign: 'right', fontWeight: '800' }}>SGST @{order.sgstPercent}%</td>
              <td style={{ fontWeight: '900', paddingLeft: '10px', textAlign: 'right', paddingTop: '2px', paddingBottom: '2px' }}>{symbol}{fmt(order.sgstAmount)}</td>
            </tr>
          </>
        )}

        {order.transportCharge > 0 && (
          <tr>
            <td style={{ paddingRight: '10px', paddingTop: '2px', paddingBottom: '2px', textAlign: 'right', fontWeight: '800' }}>
              Transport{order.transportChargePercent ? ` @${order.transportChargePercent}%` : ''}
            </td>
            <td style={{ fontWeight: '900', paddingLeft: '10px', textAlign: 'right', paddingTop: '2px', paddingBottom: '2px' }}>
              {symbol}{fmt(order.transportCharge)}
            </td>
          </tr>
        )}

        <tr style={{ borderTop: '2px solid #000' }}>
          <td style={{ paddingRight: '10px', paddingTop: '4px', paddingBottom: '4px', fontSize: '12px', fontWeight: '900', textAlign: 'right' }}>
            Total PI Amount ({order.currency})
          </td>
          <td style={{ fontSize: '12px', fontWeight: '900', paddingLeft: '10px', textAlign: 'right', paddingTop: '4px', paddingBottom: '4px' }}>
            {symbol}{fmt(order.grandTotal)}
          </td>
        </tr>
      </tbody>
    </table>
  );

  // ── Footer (last page only) ─────────────────────────────────────────────────

  const Footer = () => (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      gap: '10px', flexShrink: 0, marginTop: 'auto',
      paddingBottom: '15px',
    }}>
      {/* LEFT: Bank Details for Payment + Amount in Words */}
      <div style={{
        fontSize: '11px', borderTop: '2px solid #000',
        paddingTop: '5px', paddingBottom: '4px', minWidth: 0,
      }}>
        <p style={{ margin: '0 0 4px 0', fontWeight: '900' }}>Bank Details for Payment:</p>
        <table style={{ borderCollapse: 'collapse', fontSize: '11px', marginBottom: '6px' }}>
          <tbody>
            {[
              ['Bank',    'HDFC Bank'],
              ['A/C No.', '50200012345678'],
              ['IFSC',    'HDFC0001234'],
              ['Branch',  'Chennai Main'],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{ paddingRight: '6px', width: '60px', fontWeight: '700' }}>{k}</td>
                <td style={{ padding: '0 3px', fontWeight: '600' }}>:</td>
                <td style={{ fontWeight: '700' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{ fontStyle: 'italic', fontSize: '11px', fontWeight: '700', margin: '0', wordBreak: 'break-word' }}>
          <strong>Amount in Words:</strong> {numberToWords(order.grandTotal)}
        </p>
      </div>

      {/* RIGHT: Totals + Signature */}
      <div style={{
        borderTop: '2px solid #000', paddingTop: '5px',
        minWidth: 0, display: 'flex',
        flexDirection: 'column', justifyContent: 'space-between',
      }}>
        <TotalsTable />

        <div style={{ marginTop: '10px', textAlign: 'right' }}>
          <p style={{ fontWeight: '900', fontSize: '11px', marginBottom: '26px' }}>
            For Fluoro Automation Seals Pvt Ltd
          </p>
          <div style={{
            borderTop: '1.5px solid #000',
            width: '160px',
            paddingTop: '4px',
            marginLeft: 'auto',
            marginBottom: '10px',
          }}>
            <p style={{ fontWeight: '900', fontSize: '11px' }}>Authorised Signatory</p>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
          .pi-page-break { page-break-after: always; break-after: page; }
        }
        * { box-sizing: border-box; }
      `}</style>

      {pages.map((pageItems, pageIndex) => {
        const isLastPage = pageIndex === totalPages - 1;
        const offset     = pageOffsets[pageIndex];
        const isCompact  = pageIndex > 0;
        const cellPad    = isCompact ? '3px 4px' : '5px 5px';
        const cellFs     = isCompact ? '10.5px' : '11px';
        const cellLh     = isCompact ? '1.2' : '1.4';

        const thStyle: React.CSSProperties = {
          border: '1.5px solid #000',
          padding: cellPad,
          verticalAlign: 'middle',
          fontSize: cellFs,
          lineHeight: cellLh,
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          background: '#e5e7eb',
          fontWeight: 900,
          textAlign: 'center',
        };

        const tdBase: React.CSSProperties = {
          border: '1.5px solid #000',
          padding: cellPad,
          verticalAlign: 'middle',
          fontSize: cellFs,
          lineHeight: cellLh,
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
        };

        return (
          <div
            key={pageIndex}
            className={!isLastPage ? 'pi-page-break' : ''}
            style={{
              width: '297mm', height: '210mm', maxHeight: '210mm',
              background: '#ffffff', margin: 0, padding: 0,
              fontFamily: 'Arial, sans-serif', color: '#000',
              position: 'relative', boxSizing: 'border-box', overflow: 'hidden',
            }}
          >
            <div style={{
              border: '2.5px solid #000', height: '100%', maxHeight: '100%',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>

              {/* Company Header — every page */}
              <div style={{ flexShrink: 0 }}>
                <CompanyHeader />
              </div>

              {/* Page Body */}
              <div style={{
                flex: 1, padding: '6px 14px 15px 14px',
                display: 'flex', flexDirection: 'column',
                minHeight: 0, overflow: 'hidden',
              }}>

                {/* ── Page 1: Title + Customer Block ── */}
                {pageIndex === 0 && (
                  <>
                    <h2 style={{
                      textAlign: 'center', fontSize: '16px', fontWeight: '900',
                      margin: '0 0 5px 0', letterSpacing: '1.5px', flexShrink: 0,
                    }}>
                      PROFORMA INVOICE
                    </h2>

                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr 1.1fr',
                      gap: '8px', fontSize: '11px',
                      marginBottom: '15px', flexShrink: 0,
                    }}>
                      {/* Customer */}
                      <div style={{ minWidth: 0, paddingBottom: '4px' }}>
                        <p style={{ fontWeight: '900', fontSize: '11px', textDecoration: 'underline', margin: '0 0 2px 0' }}>Customer:</p>
                        <p style={{ fontWeight: '900', fontSize: '11px', margin: '0 0 2px 0', wordBreak: 'break-word' }}>
                          {order.customerName || '—'}
                        </p>
                        <p style={{ whiteSpace: 'pre-line', fontSize: '11px', lineHeight: 1.35, margin: '0 0 2px 0', fontWeight: '600', wordBreak: 'break-word' }}>
                          {order.customerAddress || '—'}
                        </p>
                        <div style={{ fontSize: '11px', fontWeight: '700' }}>
                          <p style={{ margin: '1px 0' }}><strong>GSTIN:</strong> {order.customerGST || '—'}</p>
                          <p style={{ margin: '1px 0' }}><strong>PAN:</strong>   {order.customerPAN  || '—'}</p>
                        </div>
                      </div>

                      {/* Logistics & Billing */}
                      <div style={{ minWidth: 0, paddingBottom: '4px' }}>
                        <p style={{ fontWeight: '900', fontSize: '11px', textDecoration: 'underline', margin: '0 0 2px 0' }}>Logistics & Billing:</p>
                        <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                          <colgroup>
                            <col style={{ width: '50%' }} />
                            <col style={{ width: '50%' }} />
                          </colgroup>
                          <tbody>
                            {([
                              ['Payment Terms:', order.paymentTerms || '—'],
                              ['Dispatch Mode:', order.dispatchMode || '—'],
                              ['Currency:',      `${order.currency} ${symbol}`],
                            ] as [string, string][]).map(([label, value]) => (
                              <tr key={label}>
                                <td style={{ paddingRight: '6px', paddingTop: '3px', paddingBottom: '4px', verticalAlign: 'top', fontWeight: '700', fontSize: '11px', lineHeight: '1.2' }}>
                                  {label}
                                </td>
                                <td style={{ fontWeight: '800', paddingTop: '3px', paddingBottom: '4px', fontSize: '11px', wordBreak: 'break-word', lineHeight: '1.2' }}>
                                  {value}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* PI Details */}
                      <div>
                        <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                          <colgroup>
                            <col style={{ width: '48%' }} />
                            <col style={{ width: '52%' }} />
                          </colgroup>
                          <tbody>
                            {([
                              ['PI No.:',      `PI-${order.soNumber}`,              '12px'],
                              ['PI Date:',     safeFormatDate(order.soDate),         null],
                              ['PO No.:',      order.customerPONo || '—',            null],
                              ['PO Date:',     safeFormatDate(order.customerPODate), null],
                              ['Ref SO No.:',  order.soNumber,                       null],
                            ] as [string, string, string | null][]).map(([label, value, fs]) => (
                              <tr key={label}>
                                <td style={{ paddingRight: '6px', paddingTop: '3px', paddingBottom: '4px', verticalAlign: 'top', fontWeight: '700', wordWrap: 'break-word', fontSize: '11px', lineHeight: '1.2' }}>
                                  {label}
                                </td>
                                <td style={{ fontWeight: fs ? '900' : '800', paddingTop: '3px', paddingBottom: '4px', fontSize: fs || '11px', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.2' }}>
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

                {/* ── Pages 2+: Continuation Header ── */}
                {pageIndex > 0 && (
                  <div style={{ marginBottom: '6px', paddingTop: '4px', flexShrink: 0, textAlign: 'center' }}>
                    <h3 style={{ fontSize: '12px', fontWeight: '900', marginBottom: '2px' }}>
                      PROFORMA INVOICE — PI-{order.soNumber} (Continued)
                    </h3>
                    <p style={{ fontSize: '11px', color: '#555' }}>
                      Page {pageIndex + 1} of {totalPages}
                    </p>
                  </div>
                )}

                {/* ── Items Table ── */}
                <div style={{ flexShrink: 0, marginBottom: isLastPage ? '8px' : '0' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '4%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '32%' }} />
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '18%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={thStyle}>Sr.</th>
                        <th style={thStyle}>SKU / Code</th>
                        <th style={{ ...thStyle, textAlign: 'left' }}>Description</th>
                        <th style={thStyle}>HSN</th>
                        <th style={thStyle}>Qty</th>
                        <th style={thStyle}>Rate<br />({symbol})</th>
                        <th style={thStyle}>Net Amount<br />({symbol})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((item: any, i: number) => (
                        <tr key={i}>
                          <td style={{ ...tdBase, textAlign: 'center', fontWeight: 800 }}>
                            {offset + i + 1}
                          </td>
                          <td style={{ ...tdBase, fontWeight: 800, textAlign: 'center' }}>
                            {item.productCode || '—'}
                          </td>
                          <td className="desc-cell" style={{ ...tdBase, fontWeight: 700, fontSize: '11px' }}>
                            <div style={{ display: 'block', lineHeight: '1.4' }}>
                              {item.productDescription || '—'}
                            </div>
                            {item.size && (
                              <div style={{ fontSize: '10px', color: '#4b5563', marginTop: '4px', display: 'block' }}>
                                Size: {formatSize(item.size)}
                              </div>
                            )}
                          </td>
                          <td style={{ ...tdBase, fontWeight: 700, textAlign: 'center' }}>
                            {item.hsnCode || '—'}
                          </td>
                          <td style={{ ...tdBase, textAlign: 'center', fontWeight: 800 }}>
                            {fmt(item.qty || item.quantity)} {item.unit || 'Nos'}
                          </td>
                          <td style={{ ...tdBase, textAlign: 'center', fontWeight: 700 }}>
                            {fmt(item.unitRate || item.rate)}
                          </td>
                          <td style={{ ...tdBase, textAlign: 'center', fontWeight: 900, background: '#f9fafb' }}>
                            {fmt(item.netAmount || (item.qty * item.unitRate))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ── Footer (last page only) ── */}
                {isLastPage && <Footer />}

              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}