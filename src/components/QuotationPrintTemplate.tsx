//Need to Fix
//1) Inside the pdf the GSTIN, pan, Remarks, Comments alignment is not proper
//2) Table items alignment is not proper

// components/QuotationPrintTemplate.tsx
import { format } from "date-fns";
import fas from "../modules/sales/fas.png";

interface Address {
  label: string;
  street: string;
  area?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

interface Branch {
  id: string;
  branchName: string;
  branchCode: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isHeadOffice?: boolean;
}

interface QuotationPrintProps {
  quotation: {
    quoteNumber: string;
    quoteDate: string;
    validity: string;
    paymentTerms: string;
    modeOfDispatch: string;
    deliveryTerm: string;
    remarks: string;
    comments: string;
    yourRef?: string;
    ourRef?: string;
    verNo?: string;
    verDate?: string;
    customerName: string;
    customerGST?: string;
    customerPAN?: string;
    customerCIN?: string;
    currency: string;
    currencySymbol: string;
    billingAddress?: Address | null;
    shippingAddress?: Address | null;
    selectedBranch?: Branch | null;
    lineItems: any[];
    subtotal: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    transportCharge: number;
    transportChargeType?: "fixed" | "percent";
    cgstPercent?: number;
    sgstPercent?: number;
    igstPercent?: number;
    transportChargePercent?: number;
    grandTotal: number;
    includeGST: boolean;
    isTNCustomer?: boolean;
    isWalkIn: boolean;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatAddress = (addr: Address | null | undefined) => {
  if (!addr) return "—";
  return `${addr.street}${addr.area ? `, ${addr.area}` : ""}\n${addr.city}, ${addr.state} - ${addr.pincode}\n${addr.country}`;
};

const formatSize = (size: any) => {
  if (!size) return '';
  if (typeof size === 'string') return size;
  const parts: string[] = [];
  if (size.height) parts.push(`ID:${size.height}${size.heightUnit || ''}`);
  if (size.weight) parts.push(`OD:${size.weight}${size.weightUnit || ''}`);
  if (size.length) parts.push(`T:${size.length}${size.lengthUnit || ''}`);
  return parts.join(' × ');
};

const formatBranchAddress = (branch: Branch | null | undefined) => {
  if (!branch) return null;
  return `${branch.branchName} (${branch.branchCode})\n${branch.address}\n${branch.city}, ${branch.state} - ${branch.pincode}\n${branch.country}\nContact: ${branch.contactPerson} | ${branch.phone}`;
};

const fmt = (num: number) => Number(num || 0).toFixed(2);

const numberToWords = (num: number): string => {
  if (num === 0) return "Zero Only";
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  const teens = [
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];

  const convertLessThanThousand = (n: number): string => {
    if (n === 0) return "";
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100)
      return (
        tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "")
      );
    return (
      ones[Math.floor(n / 100)] +
      " Hundred" +
      (n % 100 !== 0 ? " " + convertLessThanThousand(n % 100) : "")
    );
  };

  const convertToWords = (n: number): string => {
    if (n === 0) return "Zero";
    const crore = Math.floor(n / 10000000);
    const lakh = Math.floor((n % 10000000) / 100000);
    const thousand = Math.floor((n % 100000) / 1000);
    const remainder = n % 1000;
    let result = "";
    if (crore > 0) result += convertLessThanThousand(crore) + " Crore ";
    if (lakh > 0) result += convertLessThanThousand(lakh) + " Lakh ";
    if (thousand > 0)
      result += convertLessThanThousand(thousand) + " Thousand ";
    if (remainder > 0) result += convertLessThanThousand(remainder);
    return result.trim();
  };

  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  let words = convertToWords(rupees);
  if (paise > 0) words += " and " + convertToWords(paise) + " Paise";
  return words + " Only";
};

// ─── Dynamic Page Builder ─────────────────────────────────────────────────────
// Estimates each row's height based on description length + size presence,
// then greedily fills pages without overflowing.

const buildPages = (items: any[]): any[][] => {
  if (!items || items.length === 0) return [[]];

  const FIRST_PAGE_LIMIT = 5;
  const SUBSEQUENT_PAGE_LIMIT = 11;

  // If everything fits on the first page, return as-is (footer fits alongside items)
  if (items.length <= FIRST_PAGE_LIMIT) return [items];

  const pages: any[][] = [];
  let remaining = [...items];

  while (remaining.length > 0) {
    const isFirstPage = pages.length === 0;
    const capacity = isFirstPage ? FIRST_PAGE_LIMIT : SUBSEQUENT_PAGE_LIMIT;

    if (remaining.length <= capacity) {
      // All remaining items fit. Check if this would leave footer alone on next page.
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

export default function QuotationPrintTemplate({
  quotation,
}: QuotationPrintProps) {
  if (!quotation) return null;

  const q = quotation;
  const isWalkIn = q.isWalkIn === true;
  const isINR = q.currency === "INR";
  const symbol = q.currencySymbol || "₹";
  const showGST = q.includeGST && isINR;

  const pages = buildPages(q.lineItems);
  const totalPages = pages.length;

  // Running serial offset per page
  const pageOffsets = pages.map((_, pIdx) =>
    pages.slice(0, pIdx).reduce((sum, p) => sum + p.length, 0),
  );

  const formatDate = (dateStr: string) => {
    try {
      if (!dateStr) return "—";
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? "—" : format(d, "dd/MM/yyyy");
    } catch {
      return "—";
    }
  };

  // ── Sub-components ──────────────────────────────────────────────────────────

  const CompanyHeader = () => (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 14px",
          borderBottom: "2.5px solid #000",
          background: "#ffffff",
          gap: "10px",
        }}
      >
        <img
          src={fas}
          alt="FAS Logo"
          style={{
            width: "80px",
            height: "auto",
            flexShrink: 0,
            marginLeft: "30px",
          }}
        />
        <div
          style={{
            textAlign: "center",
            flex: 1,
            minWidth: 0,
            marginRight: "100px",
          }}
        >
          <h1
            style={{
              fontSize: "20px",
              fontWeight: "800",
              margin: 0,
              letterSpacing: "0.5px",
              color: "#000",
              lineHeight: 1.2,
            }}
          >
            Fluoro Automation Seals Pvt Ltd
          </h1>
          <p
            style={{
              fontSize: "11px",
              margin: "2px 0 0 0",
              color: "#000",
              lineHeight: 1.4,
              fontWeight: "600",
            }}
          >
            3/180, Rajiv Gandhi Road, Mettukuppam, Chennai Tamil Nadu 600097
            India
            <br />
            Phone: +91-841175097 | Email: fas@fluoroautomationseals.com
          </p>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "4px 14px",
          background: "#e5e7eb",
          borderBottom: "2.5px solid #000",
          fontSize: "11px",
          fontWeight: "800",
          gap: "40px",
        }}
      >
        {[
          ["GSTIN", "33AAECF2716M1ZO"],
          ["PAN", "AAECF2716M"],
          ["CIN", "U25209TN2020PTC138498"],
        ].map(([k, v]) => (
          <div
            key={k}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span style={{ fontWeight: "900" }}>{k}:</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </>
  );

  // ── Totals block (right column of footer) ───────────────────────────────────

  const TotalsTable = () => (
    <table style={{ marginLeft: "auto", fontSize: "11px", width: "100%" }}>
      <tbody>
        <tr>
          <td
            style={{
              textAlign: "right",
              fontWeight: "800",
              padding: "2px 10px",
            }}
          >
            Subtotal
          </td>
          <td
            style={{
              fontWeight: "900",
              padding: "2px 10px",
              width: "90px",
              textAlign: "right",
            }}
          >
            {symbol}
            {fmt(q.subtotal)}
          </td>
        </tr>

        {/* TN customer → CGST + SGST */}
        {showGST && q.isTNCustomer && (
          <>
            <tr>
              <td
                style={{
                  textAlign: "right",
                  fontWeight: "800",
                  padding: "2px 10px",
                }}
              >
                CGST @{q.cgstPercent}%
              </td>
              <td
                style={{
                  fontWeight: "900",
                  padding: "2px 10px",
                  textAlign: "right",
                }}
              >
                {symbol}
                {fmt(q.cgstAmount)}
              </td>
            </tr>
            <tr>
              <td
                style={{
                  textAlign: "right",
                  fontWeight: "800",
                  padding: "2px 10px",
                }}
              >
                SGST @{q.sgstPercent}%
              </td>
              <td
                style={{
                  fontWeight: "900",
                  padding: "2px 10px",
                  textAlign: "right",
                }}
              >
                {symbol}
                {fmt(q.sgstAmount)}
              </td>
            </tr>
          </>
        )}

        {/* Outside TN → IGST */}
        {showGST && !q.isTNCustomer && (
          <tr>
            <td
              style={{
                textAlign: "right",
                fontWeight: "800",
                padding: "2px 10px",
              }}
            >
              IGST @{q.igstPercent}%
            </td>
            <td
              style={{
                fontWeight: "900",
                padding: "2px 10px",
                textAlign: "right",
              }}
            >
              {symbol}
              {fmt(q.igstAmount)}
            </td>
          </tr>
        )}
        {q.transportCharge > 0 && (
          <tr>
            <td
              style={{
                textAlign: "right",
                fontWeight: "800",
                padding: "2px 10px",
              }}
            >
              Transport
              {q.transportChargeType === "percent"
                ? ` @${q.transportChargePercent}%`
                : ""}
            </td>
            <td
              style={{
                fontWeight: "900",
                padding: "2px 10px",
                textAlign: "right",
              }}
            >
              {symbol}
              {fmt(q.transportCharge)}
            </td>
          </tr>
        )}

        <tr style={{ borderTop: "2px solid #000" }}>
          <td
            style={{
              textAlign: "right",
              fontWeight: "900",
              fontSize: "12px",
              padding: "4px 10px",
            }}
          >
            Total Amount ({q.currency})
          </td>
          <td
            style={{
              textAlign: "right",
              fontWeight: "900",
              fontSize: "12px",
              padding: "4px 10px",
            }}
          >
            {symbol}
            {fmt(q.grandTotal)}
          </td>
        </tr>
      </tbody>
    </table>
  );

  // ── Footer (last page only) ─────────────────────────────────────────────────

  const Footer = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "10px",
        flexShrink: 0,
        marginTop: "auto",
        paddingBottom: "15px",
      }}
    >
      {/* LEFT: Remarks + Amount in Words + Bank Details */}
      <div
        style={{
          fontSize: "11px",
          borderTop: "2px solid #000",
          paddingTop: "5px",
        }}
      >
        <p
          style={{
            lineHeight: 1.4,
            margin: "0 0 2px 0",
            fontWeight: "700",
          }}
        >
          <strong style={{ fontWeight: "900" }}>Remarks:</strong>{" "}
          {q.remarks || "None"}
        </p>
        <p
          style={{
            lineHeight: 1.4,
            margin: "0 0 4px 0",
            fontWeight: "700",
          }}
        >
          <strong style={{ fontWeight: "900" }}>Comments:</strong>{" "}
          {q.comments || "Thank you for your business!"}
        </p>
        <p
          style={{
            fontStyle: "italic",
            fontSize: "11px",
            fontWeight: "700",
            margin: "0 0 5px 0",
          }}
        >
          <strong>Amount in Words:</strong> {numberToWords(q.grandTotal)}
        </p>

        {/* Bank Details */}
        <div style={{ fontSize: "11px" }}>
          <p style={{ margin: "0 0 2px 0", fontWeight: "900" }}>
            Company's Bank Details:
          </p>
          <table style={{ borderCollapse: "collapse", fontSize: "11px" }}>
            <tbody>
              {[
                ["Bank Name", "Canara Bank"],
                ["A/c No.", "9921201001078"],
                ["IFSC Code", "CNRB0002617"],
                ["Bank Branch", "Perungudi, Chennai 600096"],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td
                    style={{
                      paddingRight: "6px",
                      width: "76px",
                      fontWeight: "700",
                    }}
                  >
                    {k}
                  </td>
                  <td style={{ padding: "0 3px", fontWeight: "600" }}>:</td>
                  <td style={{ fontWeight: "700" }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT: Totals + Signature */}
      <div
        style={{
          borderTop: "2px solid #000",
          paddingTop: "5px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <TotalsTable />

        {/* Signature — pinned right */}
        <div style={{ marginTop: "10px", textAlign: "right" }}>
          <p
            style={{
              fontWeight: "900",
              fontSize: "11px",
              marginBottom: "26px",
            }}
          >
            For Fluoro Automation Seals Pvt Ltd
          </p>
          <div
            style={{
              borderTop: "1.5px solid #000",
              width: "160px",
              paddingTop: "4px",
              marginLeft: "auto",
              marginBottom: "10px",
            }}
          >
            <p style={{ fontWeight: "900", fontSize: "11px" }}>
              Authorised Signatory
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @media print { @page { size: A4 landscape; margin: 0; } 
        body { margin: 0; padding: 0; } 
        .page-break { page-break-after: always; break-after: page; } }
        * { box-sizing: border-box; }
        .quotation-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .quotation-table td, .quotation-table th {
          border: 1.5px solid #000;
          padding: 5px 4px;
          font-size: 11px;
          word-wrap: break-word;
          line-height: 1.3;
        }
        .quotation-table th {
          background: #e5e7eb;
          font-weight: 900;
          text-align: center;
        }
        .quotation-table-compact td, .quotation-table-compact th {
          padding: 3px 4px;
          font-size: 10.5px;
          line-height: 1.2;
        }
      `}</style>

      {pages.map((pageItems, pageIndex) => {
        const isLastPage = pageIndex === totalPages - 1;
        const offset = pageOffsets[pageIndex];

        return (
          <div
            key={pageIndex}
            className={pageIndex < totalPages - 1 ? "page-break" : ""}
            style={{
              width: "297mm",
              height: "210mm",
              background: "#ffffff",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                border: "2.5px solid #000",
                height: "100%",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Company Header — every page */}
              <div style={{ flexShrink: 0 }}>
                <CompanyHeader />
              </div>

              {/* Page Body */}
              <div
                style={{
                  flex: 1,
                  padding: "6px 14px 15px 14px",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* ── Page 1: Title + Customer Block ── */}
                {/* ── Page 1: Title + Customer Block ── */}
                {pageIndex === 0 && (
                  <>
                    <h2
                      style={{
                        textAlign: "center",
                        fontSize: "16px",
                        fontWeight: "900",
                        margin: "0 0 5px 0",
                      }}
                    >
                      SALES QUOTATION
                      {isWalkIn && (
                        <span
                          style={{
                            marginLeft: "10px",
                            fontSize: "10px",
                            background: "#dc2626",
                            color: "#fff",
                            padding: "2px 8px",
                            borderRadius: "4px",
                          }}
                        >
                          CASH SALE
                        </span>
                      )}
                    </h2>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1.1fr",
                        gap: "8px",
                        fontSize: "11px",
                        marginBottom: "15px",
                      }}
                    >
                      {/* Bill To */}
                      <div>
                        <p
                          style={{
                            fontWeight: "900",
                            textDecoration: "underline",
                          }}
                        >
                          Bill To:
                        </p>
                        <p
                          style={{
                            fontWeight: "900",
                            wordBreak: "break-word",
                          }}
                        >
                          {q.customerName || "—"}
                        </p>
                        {!isWalkIn && q.billingAddress && (
                          <p
                            style={{
                              whiteSpace: "pre-line",
                              fontWeight: "600",
                            }}
                          >
                            {formatAddress(q.billingAddress)}
                          </p>
                        )}
                        {!isWalkIn && (
                          <div style={{ fontWeight: "700" }}>
                            <p style={{ margin: "1px 0" }}>
                              <strong>GSTIN:</strong> {q.customerGST || "—"}
                            </p>
                            <p style={{ margin: "1px 0" }}>
                              <strong>PAN:</strong> {q.customerPAN || "—"}
                            </p>
                            <p style={{ margin: "1px 0" }}>
                              <strong>CIN:</strong> {q.customerCIN || "—"}
                            </p>
                          </div>
                        )}
                        {isWalkIn && (
                          <p
                            style={{
                              marginTop: "3px",
                              fontSize: "11px",
                              fontWeight: "900",
                              color: "#2563eb",
                            }}
                          >
                            Cash Sale — GST Applied
                          </p>
                        )}
                      </div>

                      {/* Ship To / Branch */}
                      <div style={{ overflow: "hidden" }}>
                        {!isWalkIn && q.shippingAddress && (
                          <div style={{ marginBottom: "4px" }}>
                            <p
                              style={{
                                fontWeight: "900",
                                fontSize: "11px",
                                textDecoration: "underline",
                                margin: "0 0 2px 0",
                              }}
                            >
                              Ship To:
                            </p>
                            <p
                              style={{
                                fontSize: "11px",
                                lineHeight: 1.35,
                                whiteSpace: "pre-line",
                                fontWeight: "600",
                                margin: 0,
                                wordBreak: "break-word",
                              }}
                            >
                              {formatAddress(q.shippingAddress)}
                            </p>
                          </div>
                        )}
                        {!isWalkIn && q.selectedBranch && (
                          <div
                            style={{
                              background: "#fff7ed",
                              padding: "4px",
                              borderRadius: "4px",
                              border: "1.5px solid #fb923c",
                              overflow: "hidden",
                              wordWrap: "break-word",
                            }}
                          >
                            <p
                              style={{
                                fontWeight: "900",
                                fontSize: "11px",
                                color: "#c2410c",
                                textDecoration: "underline",
                                margin: "0 0 2px 0",
                              }}
                            >
                              📍 Branch Details:
                            </p>
                            <p
                              style={{
                                fontSize: "11px",
                                lineHeight: 1.3,
                                whiteSpace: "pre-line",
                                fontWeight: "600",
                                margin: 0,
                                wordBreak: "break-word",
                              }}
                            >
                              {formatBranchAddress(q.selectedBranch)}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Quote Details */}
                      <div>
                        <table
                          style={{
                            width: "100%",
                            fontSize: "11px",
                            borderCollapse: "collapse",
                            tableLayout: "fixed",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "48%" }} />
                            <col style={{ width: "52%" }} />
                          </colgroup>
                          <tbody>
                            {(
                              [
                                ["SQ No.:", q.quoteNumber, "12px"],
                                ["SQ Date:", formatDate(q.quoteDate), null],
                                ["Currency:", `${q.currency} ${symbol}`, null],
                                [
                                  "Quote Validity:",
                                  q.validity || "30 Days",
                                  null,
                                ],
                                ...(!isWalkIn
                                  ? [
                                      ["Your Ref:", q.yourRef || "—", null],
                                      ["Our Ref:", q.ourRef || "—", null],
                                    ]
                                  : []),
                                ["Mode of Despatch:", q.modeOfDispatch, null],
                                ["Delivery Term:", q.deliveryTerm, null],
                                ["Payment Terms:", q.paymentTerms, null],
                              ] as [string, string, string | null][]
                            ).map(([label, value, fs]) => (
                              <tr key={label}>
                                <td
                                  style={{
                                    paddingRight: "6px",
                                    paddingTop: "3px",
                                    paddingBottom: "4px",
                                    verticalAlign: "top",
                                    fontWeight: "700",
                                    wordWrap: "break-word",
                                    fontSize: "11px",
                                    lineHeight: "1.2",
                                  }}
                                >
                                  {label}
                                </td>
                                <td
                                  style={{
                                    fontWeight: fs ? "900" : "800",
                                    paddingTop: "3px",
                                    paddingBottom: "4px",
                                    fontSize: fs || "11px",
                                    wordBreak: "break-word",
                                    overflowWrap: "break-word",
                                    lineHeight: "1.2",
                                  }}
                                >
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
                  <div
                    style={{
                      marginBottom: "6px",
                      paddingTop: "4px",
                      flexShrink: 0,
                      textAlign: "center",
                    }}
                  >
                    <h3
                      style={{
                        fontSize: "12px",
                        fontWeight: "900",
                        marginBottom: "2px",
                      }}
                    >
                      SALES QUOTATION — {q.quoteNumber} (Continued)
                    </h3>
                    <p style={{ fontSize: "11px", color: "#555" }}>
                      Page {pageIndex + 1} of {totalPages}
                    </p>
                  </div>
                )}

                {/* ── Items Table ── */}
                <div
                  style={{
                    flexShrink: 0,
                    marginBottom: isLastPage ? "8px" : "0",
                  }}
                >
                  <table
                    className={`quotation-table${pageIndex > 0 ? " quotation-table-compact" : ""}`}
                  >
                    <colgroup>
                      <col style={{ width: "3%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "27%" }} />
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "5%" }} />
                      <col style={{ width: "4%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "4%" }} />
                      <col style={{ width: "8%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Sr.</th>
                        <th>SKU / Code</th>
                        <th>Description</th>
                        <th>HSN</th>
                        <th>UOM</th>
                        <th>Qty</th>
                        <th>
                          Rate
                          <br />({symbol})
                        </th>
                        <th>
                          Amount
                          <br />({symbol})
                        </th>
                        <th>
                          Disc
                          <br />%
                        </th>
                        <th>
                          Net
                          <br />({symbol})
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((item: any, i: number) => (
                        <tr key={i}>
                          <td
                            style={{ textAlign: "center", fontWeight: "800" }}
                          >
                            {offset + i + 1}
                          </td>
                          <td
                            style={{
                              fontWeight: "800",
                              fontSize: "11px",
                              textAlign: "center",
                            }}
                          >
                            {item.productCode || "—"}
                          </td>
                          <td
                            className="desc-cell"
                            style={{ fontWeight: "700", fontSize: "11px" }}
                          >
                            <div
                              style={{ display: "block", lineHeight: "1.4" }}
                            >
                              {item.productDescription || "—"}
                            </div>
                            {item.size && (
                              <div
                                style={{
                                  fontSize: "10px",
                                  color: "#4b5563",
                                  marginTop: "4px",
                                  display: "block",
                                }}
                              >
                                Size: {formatSize(item.size)}
                              </div>
                            )}
                          </td>
                          <td
                            style={{
                              fontWeight: "700",
                              textAlign: "center",
                              fontSize: "11px",
                            }}
                          >
                            {item.hsnCode || "—"}
                          </td>
                          <td
                            style={{ textAlign: "center", fontWeight: "700" }}
                          >
                            {item.uom || "Nos"}
                          </td>
                          <td
                            style={{ textAlign: "center", fontWeight: "800" }}
                          >
                            {Number(item.qty || 0).toFixed(2)}
                          </td>
                          <td
                            style={{ textAlign: "center", fontWeight: "700" }}
                          >
                            {fmt(item.unitRate)}
                          </td>
                          <td
                            style={{ textAlign: "center", fontWeight: "800" }}
                          >
                            {fmt(
                              Number(item.qty || 0) *
                                Number(item.unitRate || 0),
                            )}
                          </td>
                          <td
                            style={{ textAlign: "center", fontWeight: "700" }}
                          >
                            {Number(item.discount || 0).toFixed(2)}
                          </td>
                          <td
                            style={{
                              textAlign: "center",
                              fontWeight: "900",
                              background: "#f9fafb",
                            }}
                          >
                            {fmt(item.netAmount)}
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
