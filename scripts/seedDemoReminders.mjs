// scripts/seedDemoReminders.mjs
// Seeds a handful of realistic vendor bills (payables) and customer invoices
// (receivables) with dates relative to *today*, so the Dashboard/NotificationBell/
// AI-assistant "due today" + "overdue" reminders have something to show during
// a live demo. Safe to re-run — every run adds a fresh batch (Firebase push
// keys are unique), so delete old rows from Accounts > Expenses & Bills /
// Sales > Invoices between demos if you don't want duplicates piling up.
//
// Run with: node scripts/seedDemoReminders.mjs
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, set } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBlYRmC04NUje53nm1Nt9t8Rg9945DlFnA",
  authDomain: "fluro-92c1c.firebaseapp.com",
  databaseURL: "https://fluro-92c1c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "fluro-92c1c",
  storageBucket: "fluro-92c1c.firebasestorage.app",
  messagingSenderId: "316975869540",
  appId: "1:316975869540:web:19247d407fa07b7968b971",
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const sanitize = (obj) => {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(sanitize);
  if (typeof obj === "object") {
    const clean = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] !== undefined) clean[key] = sanitize(obj[key]);
    }
    return clean;
  }
  return obj;
};

const createRecord = async (path, data) => {
  const listRef = ref(database, path);
  const newRef = push(listRef);
  await set(newRef, sanitize({ ...data, id: newRef.key, createdAt: Date.now() }));
  return newRef.key;
};

const isoDate = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

const today = isoDate(0);

// ---------------------------------------------------------------------------
// Vendor bills — payables (accounts/bills), read by Expenses.tsx / reminders.ts
// ---------------------------------------------------------------------------
const bills = [
  {
    billNumber: `BILL-${Date.now().toString().slice(-6)}1`,
    vendorName: "Chennai Subsea Components Pvt Ltd",
    vendorRef: "CSC/PO/2026-114",
    billDate: isoDate(-15),
    dueDate: today,
    currency: "IN",
    lineItems: [
      { sNo: 1, description: "Underwater Connector Assembly (SubConn MCBH8M) x4", qty: 4, rate: 18500, amount: 74000 },
      { sNo: 2, description: "ROV Tether Cable Splice & Test x2", qty: 2, rate: 27200, amount: 54400 },
    ],
    subtotal: 128400,
    taxAmount: 0,
    grandTotal: 128400,
    paidAmount: 0,
    status: "Open",
    notes: "Spares for Planys Ark UUV production line — due today.",
  },
  {
    billNumber: `BILL-${Date.now().toString().slice(-6)}2`,
    vendorName: "Marine Power Systems LLP",
    vendorRef: "MPS/INV/8842",
    billDate: isoDate(-12),
    dueDate: today,
    currency: "IN",
    lineItems: [
      { sNo: 1, description: "Subsea Li-ion Battery Pack Servicing — ROV Fleet", qty: 3, rate: 25500, amount: 76500 },
    ],
    subtotal: 76500,
    taxAmount: 0,
    grandTotal: 76500,
    paidAmount: 0,
    status: "Open",
    notes: "Due today.",
  },
  {
    billNumber: `BILL-${Date.now().toString().slice(-6)}3`,
    vendorName: "BlueDart Express",
    vendorRef: "BD/CHN/33210",
    billDate: isoDate(-20),
    dueDate: isoDate(-5),
    currency: "IN",
    lineItems: [
      { sNo: 1, description: "Courier — inspection report & certification dispatch", qty: 1, rate: 9200, amount: 9200 },
    ],
    subtotal: 9200,
    taxAmount: 0,
    grandTotal: 9200,
    paidAmount: 0,
    status: "Open",
    notes: "5 days overdue.",
  },
];

// ---------------------------------------------------------------------------
// Customer invoices — receivables (sales/invoices), read by Invoices.tsx / reminders.ts
// ---------------------------------------------------------------------------
const invoiceLine = (description, amount, igstPercent = 18) => {
  const igstAmount = Math.round(amount * (igstPercent / 100));
  return {
    sNo: 1,
    partCode: "ROV-INSP",
    description,
    hsnCode: "998719",
    qty: 1,
    uom: "Job",
    rate: amount,
    amount,
    discount: 0,
    taxableValue: amount,
    cgstPercent: 0, cgstAmount: 0,
    sgstPercent: 0, sgstAmount: 0,
    igstPercent, igstAmount,
    total: amount + igstAmount,
  };
};

const makeInvoice = ({ number, customerName, gst, pan, billingAddress, placeOfSupply, basicAmount, invoiceDate, dueDate, paymentStatus, paidAmount, remarks }) => {
  const igstAmount = Math.round(basicAmount * 0.18);
  const grandTotal = basicAmount + igstAmount;
  return {
    invoiceNumber: number,
    invoiceDate,
    orderAcknowledgementId: "",
    customerId: `demo-${customerName.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    customerName,
    customerGST: gst,
    customerPAN: pan,
    billingAddress,
    shippingAddress: billingAddress,
    transportationMode: "By Road",
    dateTimeOfSupply: invoiceDate,
    placeOfSupply,
    paymentTerms: "Net 30",
    taxIsReverseCharge: false,
    lineItems: [invoiceLine(`Underwater ROV Inspection & NDT Services — ${customerName.split(" ")[0]} Facility`, basicAmount)],
    basicAmount,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount,
    totalTax: igstAmount,
    roundOff: 0,
    grandTotal,
    totalInWords: "",
    totalTaxInWords: "",
    remarks,
    paymentStatus,
    paidAmount,
    dueDate,
    currency: "INR",
    status: "active",
  };
};

const invoices = [
  makeInvoice({
    number: `INV-${Date.now().toString().slice(-6)}1`,
    customerName: "Reliance Industries Ltd",
    gst: "27AAACR5055K1Z8",
    pan: "AAACR5055K",
    billingAddress: "Maker Chambers IV, Nariman Point, Mumbai – 400021",
    placeOfSupply: "Maharashtra",
    basicAmount: 400000,
    invoiceDate: isoDate(-30),
    dueDate: today,
    paymentStatus: "Unpaid",
    paidAmount: 0,
    remarks: "Payment due today — follow up with client's AP desk.",
  }),
  makeInvoice({
    number: `INV-${Date.now().toString().slice(-6)}2`,
    customerName: "Indian Oil Corporation Ltd",
    gst: "07AAACI1195H1ZQ",
    pan: "AAACI1195H",
    billingAddress: "IndianOil Bhavan, 1 Sri Aurobindo Marg, New Delhi – 110016",
    placeOfSupply: "Delhi",
    basicAmount: 265000,
    invoiceDate: isoDate(-30),
    dueDate: today,
    paymentStatus: "Partial",
    paidAmount: 100000,
    remarks: "Partial payment received; balance due today.",
  }),
  makeInvoice({
    number: `INV-${Date.now().toString().slice(-6)}3`,
    customerName: "Shell India Markets Pvt Ltd",
    gst: "27AABCS8842E1Z6",
    pan: "AABCS8842E",
    billingAddress: "One BKC, Bandra Kurla Complex, Mumbai – 400051",
    placeOfSupply: "Maharashtra",
    basicAmount: 572000,
    invoiceDate: isoDate(-34),
    dueDate: isoDate(-4),
    paymentStatus: "Unpaid",
    paidAmount: 0,
    remarks: "4 days overdue — escalate to client.",
  }),
];

const run = async () => {
  console.log(`Seeding demo reminders for ${today}...`);
  for (const b of bills) {
    const id = await createRecord("accounts/bills", b);
    console.log(`  bill  ${b.billNumber} (${b.vendorName}, due ${b.dueDate}) -> ${id}`);
  }
  for (const inv of invoices) {
    const id = await createRecord("sales/invoices", inv);
    console.log(`  invoice ${inv.invoiceNumber} (${inv.customerName}, due ${inv.dueDate}) -> ${id}`);
  }
  console.log("Done.");
  process.exit(0);
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
