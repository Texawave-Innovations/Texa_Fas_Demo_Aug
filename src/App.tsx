// src/App.tsx
import React, { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Sparkles, Send, X, ChevronDown, ChevronRight, CalendarClock, Receipt, FileText, Package, CheckCircle2 } from "lucide-react";
import { get } from "firebase/database";
import { parseISO, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import {
  type TableConfig as BaseTableConfig,
  type RemindersBundle,
  isOverdue, isUnpaid, isPaid, labelFor,
  gatherReminders, reminderCount, formatRemindersText, ALERT_INTENT,
} from "@/lib/reminders";

// Context & Routes
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { OrgSettingsProvider } from "@/context/OrgSettingsContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginRoute } from "@/components/LoginRoute";

// Pages
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

// Dispatch Module
import DispatchLayout from "./modules/dispatch/DispatchLayout";

// Inventory Module
import InventoryLayout      from "./modules/inventory/InventoryLayout";
import InventoryDashboard   from "./modules/inventory/InventoryDashboard";
import FinishedGoods        from "./modules/inventory/FinishedGoods";
import RawMaterialsStock    from "./modules/inventory/RawMaterialsStock";
import StockReports         from "./modules/inventory/StockReports";
import StubPage from "./pages/StubPage";
import SettingsPage from "./pages/Settings";
import AuditLog from "./modules/audit/AuditLog";
import NotFound from "./pages/NotFound";

// Services
import { getAllRecords, ref, database } from "@/services/firebase";

// HR Components
import EmployeeTimesheet from "./modules/hr/EmployeeTimesheet";
import Attendance from "./modules/hr/Attendance";

// Sales Module
import SalesLayout from "./modules/sales/SalesLayout";
import SalesDashboard from "./modules/sales/SalesDashboard";
import Customers from "./modules/sales/Customers";
import CustomerForm from "./modules/sales/CustomerForm";
import Products from "./modules/sales/Products";
import Leads from "./modules/sales/Leads";
import Quotations from "./modules/sales/Quotations";
import CreateQuotation from "./modules/sales/CreateQuotation";
import Orders from "./modules/sales/Orders";
import PackingList from "./modules/sales/PackingList";
import Invoices from "./modules/sales/Invoices";
import CreateInvoice from "./modules/sales/CreateInvoice";
import Shipments from "./modules/sales/Shipments";
import Reports from "./modules/sales/Reports";
import SalesSettings from "./modules/sales/SalesSettings";

// HR Module
import HRLayout from "./modules/hr/HRLayout";
import EmployeesList from "./modules/hr/Employees";
import EmployeeForm from "./modules/hr/EmployeeForm";
import Documents from "./modules/hr/Documents";
import Leaves from "./modules/hr/Leaves";
import Shifts from "./modules/hr/Shifts";
import Payroll from "./modules/hr/Payroll";
import HRReports from "./modules/hr/Reports";
import Loans from "./modules/hr/Loans";
import EmployeeDocumentsView from "./modules/hr/EmployeeDocumentsView";
import Holiday from "./modules/hr/Holiday";
import Holial from "./modules/hr/Holial";
import Stot from "./modules/hr/Stot";
import FullMonthPresent from "./modules/hr/FMP";
import BonusSheet from "./modules/hr/BonusSheet";
import FMA from "./modules/hr/FMA";

// Quality Module
import QualityLayout from "./modules/quality/QualityLayout";
import QualityDashboard from "./modules/quality/QualityDashboard";
import IncomingInspection from "./modules/quality/IncomingInspection";
import InspectionEntry from "./modules/quality/InspectionEntry";
import StockMapping from "./modules/quality/StockMapping";
import QualityReports from "./modules/quality/QualityReports";

// Production Module
import ProductionLayout from "./modules/production/ProductionLayout";
import SalesOrder from "./modules/production/SalesOrder";
import WorkOrder from "./modules/production/WorkOrder";
import WorkOrderStatus from "./modules/production/WorkOrderStatus";
import WorkOrderBinPrint from "./modules/production/WorkOrderBinPrint";
import ProductionQA from "./modules/production/ProductionQA";
import Packing from "./modules/production/Packing";
import Dispatch from "./modules/production/Dispatch";

// Accounts Module
import AccountsLayout from "./modules/accounts/AccountsLayout";
import AccountsDashboard from "./modules/accounts/AccountsDashboard";
import AccountsInvoicing from "./modules/accounts/AccountsInvoicing";
import Expenses from "./modules/accounts/Expenses";
import ChartOfAccounts from "./modules/accounts/ChartOfAccounts";
import Banking from "./modules/accounts/Banking";
import CurrencyAdjustments from "./modules/accounts/CurrencyAdjustments";
import ManualJournals from "./modules/accounts/ManualJournals";
import AccountsReports from "./modules/accounts/AccountsReports";
import FixedAssets from "./modules/accounts/FixedAssets";

// CMMS Module
import CMMSLayout from "./modules/cmms/CMMSLayout";
import CMMSDashboard from "./modules/cmms/CMMSDashboard";
import Assets from "./modules/cmms/Assets";
import VaultLayout from "./modules/vault/VaultLayout";
import VaultDashboard from "./modules/vault/VaultDashboard";
import VaultDocuments from "./modules/vault/VaultDocuments";
import VaultApprovals from "./modules/vault/Approvals";
import VaultAccessControl from "./modules/vault/AccessControl";
import WorkOrders from "./modules/cmms/WorkOrders";
import PreventiveMaintenance from "./modules/cmms/PreventiveMaintenance";
import SpareParts from "./modules/cmms/SpareParts";
import CMMSReports from "./modules/cmms/CMMSReports";

// Master Module
import MasterLayout from "./modules/master/MasterLayout";
import SalesMaster from "./modules/master/SalesMaster";
import CustomerMaster from "./modules/master/CustomerMaster";
import ItemMaster from "./modules/master/ItemMaster";
import BomMaster from "./modules/master/BomMaster";
import GeneralMaster from "./modules/master/GeneralMaster";
import HRMaster from "./modules/master/HRMaster";
import QualityMaster from "./modules/master/QualityMaster";
import ProductionMaster from "./modules/master/ProductionMaster";
import StoresMaster from "./modules/master/StoresMaster";
import FinanceMaster from "./modules/master/FinanceMaster";

// Other
import FMP from "./modules/hr/FMP";
import Bonus from "./modules/hr/Bonus";
import DC from "./modules/sales/DC";
import Inventory from "./modules/sales/Inventory";
import Profile from "./modules/hr/Profile";
import EmployeeProfileView from "./modules/hr/EmployeeProfileView";
import Other from "./modules/hr/Other";
import Empdash from "./modules/hr/Empdash";
import Approved from "./modules/hr/Approved";
import Ngp from "./modules/sales/Ngp";
import Gp from "./modules/sales/Gp";
import BOM from "./modules/sales/BOM";
import BomView from "./modules/sales/BomView";
import Pf from "./modules/hr/Pf";
import Esi from "./modules/hr/Esi";
import Otrate from "./modules/hr/Otrate";
import DocumentCenter from "./modules/documents/DocumentCenter";

// Projects Module
import ProjectsLayout from "./modules/projects/ProjectsLayout";
import LiveRuns from "./modules/projects/LiveRuns";
import ManualRunLog from "./modules/projects/ManualRunLog";
import WageSummary from "./modules/projects/WageSummary";
import ProjectMasters from "./modules/projects/ProjectMasters";

// Query Client
const queryClient = new QueryClient();

// =======================================================
// 🤖 AI ASSISTANT – answers natural-language questions from live ERP data
// =======================================================
type ChatMessage = {
  sender: "user" | "system";
  text: string;
};

type TableConfig = BaseTableConfig & {
  keywords: string[];
  special?: "attendance";
};

const TABLES: TableConfig[] = [
  { keywords: ["employee", "employees", "staff"], path: "hr/employees", display: "employees", nameFields: ["name"] },
  { keywords: ["attendance"], path: "hr/attendance", display: "attendance records", special: "attendance", nameFields: ["employeeName"], dateField: "date" },
  { keywords: ["customer", "customers", "client", "clients"], path: "sales/customers", display: "customers", nameFields: ["companyName", "name"] },
  { keywords: ["invoice", "invoices"], path: "sales/invoices", display: "invoices", nameFields: ["customerName", "invoiceNumber"], dateField: "invoiceDate", dueDateField: "dueDate", amountField: "grandTotal", statusField: "paymentStatus", paidStatuses: ["Paid"] },
  { keywords: ["quotation", "quotations", "quote", "quotes"], path: "sales/quotations", display: "quotations", nameFields: ["customerName"] },
  { keywords: ["order acknowledgement", "order acknowledgements", "order", "orders", "oa"], path: "sales/orderAcknowledgements", display: "order acknowledgements", nameFields: ["customerName"] },
  { keywords: ["product", "products", "stock", "item", "items"], path: "sales/products", display: "products", nameFields: ["productName", "name"] },
  { keywords: ["production job", "job", "jobs"], path: "production/jobs", display: "production jobs", nameFields: ["jobNumber", "customerName"] },
  { keywords: ["inspection", "inspections", "ndt"], path: "quality/inspections", display: "quality inspections", nameFields: ["customerName", "inspectionNumber"] },
  { keywords: ["expense", "expenses"], path: "accounts/expenses", display: "expenses", nameFields: ["vendorName", "expenseType"], dateField: "date", amountField: "totalAmount" },
  { keywords: ["vendor bill", "vendor bills", "payable", "payables", "bill", "bills"], path: "accounts/bills", display: "vendor bills", nameFields: ["vendorName", "billNumber"], dateField: "billDate", dueDateField: "dueDate", amountField: "grandTotal", statusField: "status", paidStatuses: ["Paid"] },
];

const GENERIC_STOPWORDS = new Set([
  "the", "a", "an", "of", "for", "from", "in", "on", "at", "is", "are", "me", "my", "please",
  "show", "list", "give", "get", "find", "all", "how", "many", "much", "count", "total", "this",
  "that", "which", "who", "with", "and", "or", "to", "do", "does", "did", "have", "has", "overdue",
  "due", "pending", "not", "paid", "unpaid", "month", "week", "today", "year", "value", "amount",
  "sum", "number", "info", "information", "about", "details", "us",
]);
const KEYWORD_WORDS = new Set(TABLES.flatMap((t) => t.keywords.flatMap((k) => k.split(" "))));

const money = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

const getAttendanceFlat = async (): Promise<any[]> => {
  const snapshot = await get(ref(database, "hr/attendance"));
  if (!snapshot.exists()) return [];
  const data = snapshot.val();
  const out: any[] = [];
  Object.keys(data).forEach((date) => {
    const dayMap = data[date] || {};
    Object.keys(dayMap).forEach((empId) => {
      out.push({ ...dayMap[empId], id: `${date}_${empId}` });
    });
  });
  return out;
};

const fetchTable = async (t: TableConfig): Promise<any[]> => {
  if (t.special === "attendance") return getAttendanceFlat();
  return getAllRecords(t.path);
};

const extractSearchTerm = (lowerText: string): string | null => {
  const words = lowerText.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const leftover = words.filter((w) => w.length >= 3 && !GENERIC_STOPWORDS.has(w) && !KEYWORD_WORDS.has(w));
  return leftover.length ? leftover.join(" ") : null;
};

const matchesSearchTerm = (record: any, table: TableConfig, term: string) => {
  const haystack = (table.nameFields || []).map((f) => String(record[f] ?? "")).join(" ").toLowerCase();
  return term.split(" ").some((w) => haystack.includes(w));
};

const isThisMonth = (record: any, table: TableConfig) => {
  if (!table.dateField) return true;
  const raw = record[table.dateField];
  if (!raw) return false;
  try {
    return isWithinInterval(parseISO(raw), { start: startOfMonth(new Date()), end: endOfMonth(new Date()) });
  } catch {
    return false;
  }
};

const WELCOME_TEXT =
  "Hi, I'm your FAS AI Assistant 👋 I can answer questions using your live ERP data. Try:\n" +
  "• anything due today / any alerts / low stock\n" +
  "• overdue vendor bills\n" +
  "• invoices from [customer] this month\n" +
  "• how many employees\n" +
  "• [name] salary / dob / attendance\n" +
  "• total expenses this month\n" +
  "• list quality inspections";

const FALLBACK_TEXT =
  "I couldn't match that to any data I track yet. Try things like:\n" +
  "• overdue invoices from [customer]\n" +
  "• how many vendor bills are unpaid\n" +
  "• [employee name] attendance\n" +
  "• total expenses this month\n" +
  "• list production jobs";

// Renders the chat's lightweight "**bold**" markdown as real <strong> spans;
// line breaks are handled by the parent's whitespace-pre-wrap.
function renderChatText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

type AlertItem = { id: string; title: string; subtitle: string; badge: string; critical: boolean };
type AlertSection = {
  key: string;
  title: string;
  icon: typeof CalendarClock;
  iconClass: string;
  items: AlertItem[];
  criticalCount: number;
};

// Overdue items past this many days are flagged as the more urgent "critical" tier.
const CRITICAL_OVERDUE_DAYS = 7;

const daysOverdue = (dueDate?: string): number => {
  if (!dueDate) return 0;
  try {
    return Math.max(0, Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000));
  } catch {
    return 0;
  }
};

// Turns the raw reminders bundle into the sectioned "alerts dashboard" shown when the
// widget first opens — mirrors formatRemindersText() but structured for the accordion UI.
function buildAlertSections(b: RemindersBundle): AlertSection[] {
  const sections: AlertSection[] = [];

  const dueTodayItems: AlertItem[] = [
    ...b.dueTodayInvoices.map((r: any, i: number): AlertItem => ({
      id: `dti-${i}`,
      title: r.customerName || r.invoiceNumber || "Invoice",
      subtitle: `${money(r.grandTotal)} · due today`,
      badge: "AR",
      critical: false,
    })),
    ...b.dueTodayBills.map((r: any, i: number): AlertItem => ({
      id: `dtb-${i}`,
      title: r.vendorName || r.billNumber || "Bill",
      subtitle: `${money(r.grandTotal)} · due today`,
      badge: "AP",
      critical: false,
    })),
  ];
  if (dueTodayItems.length) {
    sections.push({ key: "due-today", title: "Due Today", icon: CalendarClock, iconClass: "bg-indigo-50 text-indigo-600", items: dueTodayItems, criticalCount: 0 });
  }

  const vendorBillItems: AlertItem[] = b.overdueBills.map((r: any, i: number): AlertItem => {
    const days = daysOverdue(r.dueDate);
    return {
      id: `ob-${i}`,
      title: r.vendorName || r.billNumber || "Bill",
      subtitle: `${money(r.grandTotal)} · ${days}d overdue`,
      badge: "AP",
      critical: days > CRITICAL_OVERDUE_DAYS,
    };
  });
  if (vendorBillItems.length) {
    sections.push({
      key: "overdue-bills",
      title: "Overdue Vendor Bills",
      icon: Receipt,
      iconClass: "bg-red-50 text-red-600",
      items: vendorBillItems,
      criticalCount: vendorBillItems.filter((it) => it.critical).length,
    });
  }

  const stockItems: AlertItem[] = [...b.fgAlerts, ...b.rawAlerts]
    .sort((a, c) => (a.severity === "Critical" ? 0 : 1) - (c.severity === "Critical" ? 0 : 1))
    .map((a, i): AlertItem => ({
      id: `stock-${i}`,
      title: a.label,
      subtitle: `${a.qty}${a.uom ? ` ${a.uom}` : ""} left · ${a.severity}`,
      badge: a.uom ? "FG" : "RM",
      critical: a.severity === "Critical",
    }));
  if (stockItems.length) {
    sections.push({
      key: "low-stock",
      title: "Low Stock",
      icon: Package,
      iconClass: "bg-orange-50 text-orange-600",
      items: stockItems,
      criticalCount: stockItems.filter((it) => it.critical).length,
    });
  }

  const invoiceItems: AlertItem[] = b.overdueInvoices.map((r: any, i: number): AlertItem => {
    const days = daysOverdue(r.dueDate);
    return {
      id: `oi-${i}`,
      title: r.customerName || r.invoiceNumber || "Invoice",
      subtitle: `${money(r.grandTotal)} · ${days}d overdue`,
      badge: "AR",
      critical: days > CRITICAL_OVERDUE_DAYS,
    };
  });
  if (invoiceItems.length) {
    sections.push({
      key: "overdue-invoices",
      title: "Overdue Invoices",
      icon: FileText,
      iconClass: "bg-amber-50 text-amber-600",
      items: invoiceItems,
      criticalCount: invoiceItems.filter((it) => it.critical).length,
    });
  }

  return sections;
}

function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{ sender: "system", text: WELCOME_TEXT }]);

  // Preloaded once so quick "name + field" questions (e.g. "arun salary") resolve instantly.
  const [employees, setEmployees] = useState<any[]>([]);
  // Badge count on the launcher button + data backing the alerts dashboard shown on open.
  const [alertCount, setAlertCount] = useState(0);
  const [remindersBundle, setRemindersBundle] = useState<RemindersBundle | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAllRecords("hr/employees")
      .then(setEmployees)
      .catch((err) => console.error("Failed to load employees for chat:", err));
    gatherReminders()
      .then((b) => {
        setRemindersBundle(b);
        setAlertCount(reminderCount(b));
      })
      .catch((err) => console.error("Failed to load alert count:", err));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking, open]);

  const toggleOpen = () => setOpen((o) => !o);

  const answerForEmployee = (employee: any): string => {
    const name = employee.name;
    return `**${name}**\nEmployee ID: ${employee.employeeId || "N/A"}\nDepartment: ${employee.department || "N/A"}\nJoining Date: ${employee.joiningDate || "N/A"}\nMonthly Salary: ₹${employee.salary?.monthlySalary || "N/A"}\nDOB: ${employee.dob || "N/A"}`;
  };

  const answerForEmployeeAttendance = async (employee: any): Promise<string> => {
    const all = await getAttendanceFlat();
    const empRecords = all
      .filter((r: any) => r.employeeId === employee.id)
      .sort((a: any, b: any) => (a.date || "").localeCompare(b.date || ""));
    if (!empRecords.length) return `No attendance records for ${employee.name}.`;
    let reply = `**${employee.name} — Attendance** (${empRecords.length} records)\n\n`;
    empRecords.slice(-15).forEach((r: any) => {
      reply += `${r.date} – ${r.status} (${r.totalHours || 0} hrs)\n`;
    });
    if (empRecords.length > 15) reply += `\n...and ${empRecords.length - 15} more`;
    return reply;
  };

  const composeReply = async (userText: string): Promise<string> => {
    const lowerText = userText.toLowerCase();

    if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(lowerText.trim())) {
      return "Hello! Ask me about employees, customers, invoices, vendor bills, expenses, production jobs or quality inspections — e.g. \"overdue vendor bills\" or \"how many customers\".";
    }

    if (ALERT_INTENT.test(lowerText)) {
      try {
        return formatRemindersText(await gatherReminders());
      } catch {
        return "Sorry, I couldn't load alerts right now.";
      }
    }

    // Named-employee questions (checked first so "<name> attendance" doesn't get swallowed by the generic table below)
    const employee = employees.find((emp) => emp.name && lowerText.includes(emp.name.toLowerCase()));
    if (employee) {
      if (lowerText.includes("attendance")) return answerForEmployeeAttendance(employee);
      if (lowerText.includes("dob") || lowerText.includes("birth")) return `${employee.name} — Date of Birth: ${employee.dob || "Not available"}`;
      if (lowerText.includes("salary") || lowerText.includes("gross") || lowerText.includes("pay") || lowerText.includes("ctc")) {
        const sal = employee.salary || {};
        return `**${employee.name} — Salary**\nMonthly Salary: ₹${sal.monthlySalary || sal.grossMonthly || "N/A"}\nGross Monthly: ₹${sal.grossMonthly || "N/A"}\nBasic: ₹${sal.basic || "N/A"}`;
      }
      if (lowerText.includes("joining") || lowerText.includes("joined")) return `${employee.name} — Joining Date: ${employee.joiningDate || "Not available"}`;
      if (lowerText.includes("department")) return `${employee.name} — Department: ${employee.department || "Not available"}`;
      if (lowerText.includes("phone") || lowerText.includes("mobile")) return `${employee.name} — Phone: ${employee.phone || "Not available"}`;
      return answerForEmployee(employee);
    }

    const table = TABLES.find((t) => t.keywords.some((k) => lowerText.includes(k)));
    if (!table) return FALLBACK_TEXT;

    let records: any[];
    try {
      records = await fetchTable(table);
    } catch {
      return `Sorry, I couldn't load ${table.display} right now.`;
    }

    let filtered = records;
    const wantsOverdue = lowerText.includes("overdue");
    const wantsUnpaid = !wantsOverdue && /\bunpaid\b|\bnot paid\b|\bpending\b/.test(lowerText);
    const wantsPaid = !wantsOverdue && !wantsUnpaid && /\bpaid\b/.test(lowerText);
    const wantsThisMonth = lowerText.includes("this month");

    if (wantsOverdue && table.statusField) filtered = filtered.filter((r) => isOverdue(r, table));
    else if (wantsUnpaid && table.statusField) filtered = filtered.filter((r) => isUnpaid(r, table));
    else if (wantsPaid && table.statusField) filtered = filtered.filter((r) => isPaid(r, table));

    if (wantsThisMonth) filtered = filtered.filter((r) => isThisMonth(r, table));

    const term = extractSearchTerm(lowerText);
    if (term) filtered = filtered.filter((r) => matchesSearchTerm(r, table, term));

    const isAggregate = !!table.amountField && /(how much|total value|total amount|sum of|amount of|value of)/.test(lowerText);
    const isCount = !isAggregate && /(how many|count|^total\b|\btotal\b)/.test(lowerText);
    const qualifiers = [wantsOverdue && "overdue", wantsUnpaid && "unpaid", wantsPaid && "paid", wantsThisMonth && "this month"]
      .filter(Boolean)
      .join(", ");

    if (isAggregate) {
      const sum = filtered.reduce((s, r) => s + Number(r[table.amountField!] || 0), 0);
      return `Total ${table.display}${term ? ` matching "${term}"` : ""}${qualifiers ? ` (${qualifiers})` : ""}: ${money(sum)} across ${filtered.length} record${filtered.length === 1 ? "" : "s"}.`;
    }

    if (isCount) {
      return `${filtered.length} ${table.display}${term ? ` matching "${term}"` : ""}${qualifiers ? ` (${qualifiers})` : ""}.`;
    }

    if (!filtered.length) {
      return `No ${table.display} found${term ? ` matching "${term}"` : ""}${qualifiers ? ` (${qualifiers})` : ""}.`;
    }
    let reply = `**${table.display.charAt(0).toUpperCase() + table.display.slice(1)}**${term ? ` — "${term}"` : ""}${qualifiers ? ` (${qualifiers})` : ""}: ${filtered.length}\n\n`;
    filtered.slice(0, 10).forEach((r: any, i: number) => {
      reply += `${i + 1}. ${labelFor(r, table)}\n`;
    });
    if (filtered.length > 10) reply += `\n...and ${filtered.length - 10} more`;
    return reply;
  };

  const handleSend = async () => {
    if (!input.trim() || thinking) return;
    const userText = input.trim();
    setMessages((m) => [...m, { sender: "user", text: userText }]);
    setInput("");
    setThinking(true);
    try {
      // Small delay so the reply reads as the assistant actually working the query, not an instant lookup.
      const [reply] = await Promise.all([
        composeReply(userText),
        new Promise((resolve) => setTimeout(resolve, 450 + Math.random() * 350)),
      ]);
      setMessages((m) => [...m, { sender: "system", text: reply }]);
    } catch {
      setMessages((m) => [...m, { sender: "system", text: "Something went wrong answering that — please try again." }]);
    } finally {
      setThinking(false);
    }
  };

  const suggestions = ["Due today", "Any alerts?", "Overdue vendor bills", "How many employees"];
  const askSuggestion = (text: string) => {
    if (thinking) return;
    setInput(text);
    // Fire on the next tick so the input value is committed before send reads it.
    setTimeout(() => {
      setMessages((m) => [...m, { sender: "user", text }]);
      setInput("");
      setThinking(true);
      composeReply(text)
        .then((reply) => setMessages((m) => [...m, { sender: "system", text: reply }]))
        .catch(() => setMessages((m) => [...m, { sender: "system", text: "Something went wrong answering that — please try again." }]))
        .finally(() => setThinking(false));
    }, 0);
  };

  // The alerts dashboard replaces the welcome bubble until the user actually starts chatting.
  const showDashboard = messages.length <= 1;
  const alertSections = remindersBundle ? buildAlertSections(remindersBundle) : [];
  const totalAlertItems = alertSections.reduce((s, sec) => s + sec.items.length, 0);
  const criticalAlertItems = alertSections.reduce((s, sec) => s + sec.criticalCount, 0);

  return (
    <>
      {/* Floating Chat Button */}
      <div className="fixed bottom-6 right-6 z-50">
        {alertCount > 0 && !open && (
          <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />
        )}
        <Button
          onClick={toggleOpen}
          className="relative rounded-full w-14 h-14 shadow-xl bg-gradient-to-br from-primary to-indigo-600 hover:from-primary hover:to-indigo-700 transition-transform hover:scale-105"
        >
          {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
          {alertCount > 0 && !open && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-white">
              {alertCount > 9 ? "9+" : alertCount}
            </span>
          )}
        </Button>
      </div>

      {/* Chat Window */}
      {open && (
        <div className="fixed bottom-24 right-6 w-96 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <Card className="shadow-2xl border-border/60 overflow-hidden py-0 gap-0">
            <CardHeader className="flex flex-row justify-between items-center bg-gradient-to-r from-primary to-indigo-600 py-3.5 px-4 gap-0">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center ring-1 ring-white/30">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-white leading-tight">FAS AI Assistant</CardTitle>
                  <p className="text-[11px] text-white/75 flex items-center gap-1 leading-tight mt-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Live on your ERP data
                  </p>
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/15" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-0 p-0">
              <div className="h-[26rem] overflow-y-auto bg-muted/30 p-3 text-sm">
                {showDashboard ? (
                  remindersBundle === null ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-xs">Loading your alerts…</div>
                  ) : totalAlertItems === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-2 px-6">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                      <p className="text-sm font-medium text-gray-900">All caught up</p>
                      <p className="text-xs text-muted-foreground">Stock levels and payments all look healthy.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3.5 flex items-start gap-3">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                          <Sparkles className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 leading-tight">
                            Heads up — {totalAlertItems} item{totalAlertItems === 1 ? "" : "s"} need attention
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {criticalAlertItems} critical · across {alertSections.length} area{alertSections.length === 1 ? "" : "s"} · synced just now
                          </p>
                        </div>
                      </div>

                      {alertSections.map((section) => {
                        const isExpanded = expandedSection === section.key;
                        const Icon = section.icon;
                        return (
                          <div key={section.key} className="rounded-2xl bg-white border border-border/60 overflow-hidden">
                            <button
                              onClick={() => setExpandedSection(isExpanded ? null : section.key)}
                              className="w-full flex items-center gap-3 p-3 text-left"
                            >
                              <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${section.iconClass}`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 leading-tight">{section.title}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {section.items.length} item{section.items.length === 1 ? "" : "s"}
                                  {section.criticalCount > 0 ? ` · ${section.criticalCount} critical` : ""}
                                </p>
                              </div>
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                            </button>
                            {isExpanded && (
                              <div className="border-t border-border/60 divide-y divide-border/60">
                                {section.items.map((item) => (
                                  <div key={item.id} className="flex items-center gap-3 px-3.5 py-2.5">
                                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${item.critical ? "bg-red-500" : "bg-amber-500"}`} />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-gray-900 truncate">{item.title}</p>
                                      <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                                    </div>
                                    <span
                                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                                        item.critical ? "bg-red-50 text-red-600" : "bg-primary/10 text-primary"
                                      }`}
                                    >
                                      {item.badge}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="space-y-3">
                    {messages.map((m, i) => (
                      <div key={i} className={`flex items-end gap-2 ${m.sender === "user" ? "flex-row-reverse" : ""}`}>
                        {m.sender === "system" && (
                          <div className="h-6 w-6 shrink-0 rounded-full bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center">
                            <Sparkles className="h-3 w-3 text-white" />
                          </div>
                        )}
                        <div
                          className={`px-3.5 py-2.5 max-w-[85%] whitespace-pre-wrap leading-relaxed shadow-sm ${
                            m.sender === "user"
                              ? "bg-gradient-to-br from-primary to-indigo-600 text-white rounded-2xl rounded-br-sm"
                              : "bg-white text-gray-800 border border-border/60 rounded-2xl rounded-bl-sm"
                          }`}
                        >
                          {renderChatText(m.text)}
                        </div>
                      </div>
                    ))}
                    {thinking && (
                      <div className="flex items-end gap-2">
                        <div className="h-6 w-6 shrink-0 rounded-full bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center">
                          <Sparkles className="h-3 w-3 text-white" />
                        </div>
                        <div className="px-3.5 py-3 rounded-2xl rounded-bl-sm bg-white border border-border/60 flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.3s]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.15s]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {messages.length <= 1 && (
                <div className="flex flex-wrap gap-1.5 px-3 py-2 border-t border-border/60 bg-white">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => askSuggestion(s)}
                      disabled={thinking}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2 p-3 bg-white border-t border-border/60">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Ask me anything..."
                  className="flex-1 rounded-full bg-muted/50 border-border/60 focus-visible:ring-primary/40"
                  disabled={thinking}
                />
                <Button
                  onClick={handleSend}
                  disabled={thinking || !input.trim()}
                  size="icon"
                  className="rounded-full shrink-0 bg-gradient-to-br from-primary to-indigo-600 hover:from-primary hover:to-indigo-700"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

// =====================
// APP ROOT – UNCHANGED
// =====================
function GlobalChatWidget() {
  const { user } = useAuth();
  if (!user) return null;
  return <ChatWidget />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <OrgSettingsProvider>
          <BrowserRouter>
            <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />

              <Route
                path="/login"
                element={
                  <LoginRoute>
                    <Login />
                  </LoginRoute>
                }
              />

              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />

              {/* SALES MODULE */}
              <Route
                path="/sales"
                element={
                  <ProtectedRoute module="sales">
                    <SalesLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<SalesDashboard />} />
                <Route path="leads" element={<Leads />} />
                <Route path="quotations">
                  <Route index element={<Quotations />} />
                  <Route path="create" element={<CreateQuotation />} />
                  <Route path="edit/:id" element={<CreateQuotation />} />
                </Route>
                <Route path="orders" element={<Orders />} />
                <Route path="packing" element={<PackingList />} />
                <Route path="invoices">
                  <Route index element={<Invoices />} />
                  <Route path="create" element={<CreateInvoice />} />
                  <Route path="edit/:id" element={<CreateInvoice />} />
                </Route>
                <Route path="shipments" element={<Shipments />} />
                <Route path="ngp" element={<Ngp />} />
                <Route path="gp" element={<Gp />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="challan" element={<DC />} />
                <Route path="reports" element={<Reports />} />
                <Route path="settings" element={<SalesSettings />} />
              </Route>

              {/* HR MODULE */}
              <Route
                path="/hr"
                element={
                  <ProtectedRoute module="hr">
                    <HRLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="dashboard" element={<Empdash />} />
                <Route index element={<Navigate to="employees" replace />} />
                <Route path="employees">
                  <Route index element={<EmployeesList />} />
                  <Route path="new" element={<EmployeeForm />} />
                  <Route path="edit/:id" element={<EmployeeForm />} />
                </Route>
                <Route path="attendance" element={<Attendance />} />
                        <Route path="pf" element={<Pf />} />
                                <Route path="esi" element={<Esi />} />
                <Route path="holidays" element={<Holiday />} />
                <Route path="holial" element={<Holial />} />
                <Route path="profile" element={<Profile />} />
                <Route path="employees/profile/:id" element={<EmployeeProfileView />} />
                <Route path="stot" element={<Stot />} />
                           <Route path="ot-rate" element={<Otrate />} />
                <Route path="approval-attendance" element={<Approved />} />
                <Route path="full-month-present" element={<FullMonthPresent />} />
                <Route path="full-month-absent" element={<FMA />} />
                <Route path="bonus" element={<Bonus />} />
                <Route path="bonus-sheet/:employeeId/:month" element={<BonusSheet />} />
                <Route path="leaves" element={<Leaves />} />
                <Route path="shifts" element={<Shifts />} />
                <Route path="documents">
                  <Route index element={<Documents />} />
                  <Route path=":id" element={<EmployeeDocumentsView />} />
                </Route>
                <Route path="other-documents" element={<Other />} />
                <Route path="payroll" element={<Payroll />} />
                <Route path="loans" element={<Loans />} />
                <Route path="reports" element={<HRReports />} />
              </Route>

              <Route
                path="/hr/attendance/:employeeId/:month?"
                element={
                  <ProtectedRoute module="hr">
                    <EmployeeTimesheet />
                  </ProtectedRoute>
                }
              />

              {/* QUALITY MODULE */}
              <Route
                path="/quality"
                element={
                  <ProtectedRoute module="quality">
                    <QualityLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<QualityDashboard />} />
                <Route path="incoming" element={<IncomingInspection />} />
                <Route path="inspection-entry/:inspectionId" element={<InspectionEntry />} />
                <Route path="stock-mapping" element={<StockMapping />} />
                <Route path="reports" element={<QualityReports />} />
              </Route>

              {/* PRODUCTION MODULE */}
              <Route
                path="/production"
                element={
                  <ProtectedRoute module="production">
                    <ProductionLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="sales-order" replace />} />
                <Route path="sales-order"       element={<SalesOrder />} />
                <Route path="work-order"        element={<WorkOrder />} />
                <Route path="work-order-status" element={<WorkOrderStatus />} />
                <Route path="bin-print"         element={<WorkOrderBinPrint />} />
                <Route path="qa"                element={<ProductionQA />} />
              </Route>

              {/* MASTER MODULE */}
              <Route
                path="/master"
                element={
                  <ProtectedRoute module="master">
                    <MasterLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="sales" replace />} />
                <Route path="sales" element={<SalesMaster />}>
                  <Route index element={<Navigate to="customer" replace />} />
                  <Route path="customer" element={<CustomerMaster />} />
                  <Route path="customer/new" element={<CustomerForm />} />
                  <Route path="customer/edit/:id" element={<CustomerForm />} />
                  <Route path="item" element={<ItemMaster />} />
                  <Route path="bom" element={<BomMaster />} />
                  <Route path="bom/:id" element={<BomView />} />
                  <Route path="general" element={<GeneralMaster />} />
                </Route>
                <Route path="hr" element={<HRMaster />} />
                <Route path="quality" element={<QualityMaster />} />
                <Route path="production" element={<ProductionMaster />} />
                <Route path="stores" element={<StoresMaster />} />
                <Route path="finance" element={<FinanceMaster />} />
              </Route>

              {/* DISPATCH MODULE */}
              <Route
                path="/dispatch"
                element={
                  <ProtectedRoute module="dispatch">
                    <DispatchLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="packing" replace />} />
                <Route path="packing"  element={<Packing />} />
                <Route path="dispatch" element={<Dispatch />} />
              </Route>

              {/* INVENTORY MODULE */}
              <Route
                path="/inventory"
                element={
                  <ProtectedRoute module="inventory">
                    <InventoryLayout />
                  </ProtectedRoute>
                }
              >
                <Route index                  element={<InventoryDashboard />} />
                <Route path="finished-goods"  element={<FinishedGoods />} />
                <Route path="raw-materials"   element={<RawMaterialsStock />} />
                <Route path="reports"         element={<StockReports />} />
              </Route>

              {/* ACCOUNTS MODULE */}
              <Route
                path="/finance"
                element={
                  <ProtectedRoute module="finance">
                    <AccountsLayout />
                  </ProtectedRoute>
                }
              >
                <Route index                       element={<AccountsDashboard />} />
                <Route path="invoicing"             element={<AccountsInvoicing />} />
                <Route path="expenses"              element={<Expenses />} />
                <Route path="chart-of-accounts"     element={<ChartOfAccounts />} />
                <Route path="fixed-assets"          element={<FixedAssets />} />
                <Route path="banking"               element={<Banking />} />
                <Route path="currency-adjustments"  element={<CurrencyAdjustments />} />
                <Route path="journals"              element={<ManualJournals />} />
                <Route path="reports"               element={<AccountsReports />} />
              </Route>

              {/* CMMS MODULE */}
              <Route
                path="/cmms"
                element={
                  <ProtectedRoute module="cmms">
                    <CMMSLayout />
                  </ProtectedRoute>
                }
              >
                <Route index                          element={<CMMSDashboard />} />
                <Route path="assets"                  element={<Assets />} />
                <Route path="work-orders"              element={<WorkOrders />} />
                <Route path="preventive-maintenance"  element={<PreventiveMaintenance />} />
                <Route path="spare-parts"             element={<SpareParts />} />
                <Route path="reports"                 element={<CMMSReports />} />
              </Route>

              {/* DOCUMENT & DRAWING VAULT MODULE */}
              <Route
                path="/vault"
                element={
                  <ProtectedRoute module="vault">
                    <VaultLayout />
                  </ProtectedRoute>
                }
              >
                <Route index               element={<VaultDashboard />} />
                <Route path="documents"    element={<VaultDocuments />} />
                <Route path="approvals"    element={<VaultApprovals />} />
                <Route path="access"       element={<VaultAccessControl />} />
              </Route>

              {/* DOCUMENT CENTER MODULE */}
              <Route
                path="/documents"
                element={
                  <ProtectedRoute module="documents">
                    <DocumentCenter />
                  </ProtectedRoute>
                }
              />

              {/* PROJECTS & MACHINE COSTING MODULE */}
              <Route
                path="/projects"
                element={
                  <ProtectedRoute module="projects">
                    <ProjectsLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<LiveRuns />} />
                <Route path="manual-log" element={<ManualRunLog />} />
                <Route path="summary" element={<WageSummary />} />
                <Route path="masters" element={<ProjectMasters />} />
              </Route>
              <Route
                path="/settings"
                element={
                  <ProtectedRoute module="settings">
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/audit"
                element={
                  <ProtectedRoute module="audit">
                    <AuditLog />
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<NotFound />} />
            </Routes>

            {/* Global Chat Widget */}
            <GlobalChatWidget />
            </ErrorBoundary>
          </BrowserRouter>
          </OrgSettingsProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
