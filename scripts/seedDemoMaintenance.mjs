// scripts/seedDemoMaintenance.mjs
// Seeds demo data for the Maintenance (CMMS) module — assets, work orders,
// preventive maintenance schedules and spare parts — themed around Planys
// Technologies' underwater ROV/UUV production floor, with dates relative to
// *today* so the CMMS Dashboard (fleet uptime, open work orders, overdue PM,
// this month's labor/cost) has something to show during a live demo.
// Safe to re-run — every run adds a fresh batch (Firebase push keys are
// unique), so clear out cmms/assets, cmms/workOrders, cmms/pmSchedules and
// cmms/spareParts between demos if you don't want duplicates piling up.
//
// Run with: node scripts/seedDemoMaintenance.mjs
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
// Assets — cmms/assets, read by Assets.tsx / CMMSDashboard.tsx
// ---------------------------------------------------------------------------
const assetDefs = [
  {
    assetCode: "AST-CNC-01",
    name: "5-Axis CNC Machining Center",
    category: "Production Machine",
    location: "Machine Shop - Bay 1",
    manufacturer: "DMG Mori",
    model: "DMU 50",
    serialNumber: "DMG50-11824",
    purchaseDate: "2022-03-14",
    warrantyExpiry: "2027-03-14",
    status: "Operational",
    criticality: "High",
    meterReading: 4820,
    meterUnit: "hours",
    notes: "Machines ROV hull frames and thruster housings.",
  },
  {
    assetCode: "AST-TANK-01",
    name: "Underwater Test Tank Winch System",
    category: "Production Machine",
    location: "Test Tank Facility",
    manufacturer: "Planys In-house",
    model: "TTW-3",
    serialNumber: "TTW3-0092",
    purchaseDate: "2021-07-01",
    status: "Under Maintenance",
    criticality: "High",
    meterReading: 2140,
    meterUnit: "hours",
    notes: "Lowers ROV/UUV units for pre-delivery submersion testing. Winch cable inspection flagged an issue this week.",
  },
  {
    assetCode: "AST-CHG-01",
    name: "ROV Battery Charging Station",
    category: "Electrical",
    location: "Assembly Floor",
    manufacturer: "Planys In-house",
    model: "BCS-8",
    serialNumber: "BCS8-2201",
    purchaseDate: "2023-01-20",
    status: "Operational",
    criticality: "Medium",
    meterReading: 1360,
    meterUnit: "cycles",
    notes: "Charges subsea Li-ion battery packs before installation.",
  },
  {
    assetCode: "AST-COMP-01",
    name: "Compressed Air Compressor",
    category: "Utility",
    location: "Utility Room",
    manufacturer: "Atlas Copco",
    model: "GA 22",
    serialNumber: "GA22-77410",
    purchaseDate: "2020-11-05",
    warrantyExpiry: "2025-11-05",
    status: "Down",
    criticality: "High",
    meterReading: 9870,
    meterUnit: "hours",
    notes: "Supplies shop air for pneumatic tooling and pressure test rigs. Tripped on overheat alarm.",
  },
  {
    assetCode: "AST-HVAC-01",
    name: "Electronics Cleanroom HVAC Unit",
    category: "HVAC",
    location: "Electronics Cleanroom",
    manufacturer: "Blue Star",
    model: "CRU-500",
    serialNumber: "CRU500-3315",
    purchaseDate: "2022-09-10",
    status: "Operational",
    criticality: "Medium",
    meterReading: 6100,
    meterUnit: "hours",
    notes: "Maintains temperature/humidity for PCB assembly and payload integration.",
  },
  {
    assetCode: "AST-FLT-01",
    name: "Warehouse Forklift",
    category: "Vehicle",
    location: "Warehouse",
    manufacturer: "Godrej",
    model: "GFE 1.5T",
    serialNumber: "GFE15-5540",
    purchaseDate: "2019-05-18",
    status: "Operational",
    criticality: "Low",
    meterReading: 3420,
    meterUnit: "hours",
  },
];

// ---------------------------------------------------------------------------
// Spare parts — cmms/spareParts, read by SpareParts.tsx
// ---------------------------------------------------------------------------
const spareParts = [
  {
    partCode: "SP-CONN-8M",
    partName: "Underwater Connector Assembly (SubConn MCBH8M)",
    category: "Electrical",
    uom: "Nos",
    stockQty: 3,
    reorderPoint: 6,
    unitCost: 18500,
    location: "Store Rack A2",
  },
  {
    partCode: "SP-BRG-THR",
    partName: "Thruster Motor Bearing Set",
    category: "Mechanical",
    uom: "Set",
    stockQty: 4,
    reorderPoint: 5,
    unitCost: 6200,
    location: "Store Rack B1",
  },
  {
    partCode: "SP-ORING-SS",
    partName: "O-Ring Seal Kit (Subsea Grade)",
    category: "Mechanical",
    uom: "Kit",
    stockQty: 22,
    reorderPoint: 10,
    unitCost: 1450,
    location: "Store Rack A5",
  },
  {
    partCode: "SP-CELL-18650",
    partName: "Li-ion Battery Cell Module (18650 Pack)",
    category: "Electrical",
    uom: "Nos",
    stockQty: 8,
    reorderPoint: 8,
    unitCost: 9800,
    location: "Store Rack C1",
  },
  {
    partCode: "SP-FILT-AIR",
    partName: "Compressor Air Filter Element",
    category: "Consumable",
    uom: "Nos",
    stockQty: 2,
    reorderPoint: 4,
    unitCost: 1150,
    location: "Utility Room Shelf",
  },
  {
    partCode: "SP-HOSE-HYD",
    partName: "Hydraulic Hose Assembly",
    category: "Mechanical",
    uom: "Nos",
    stockQty: 12,
    reorderPoint: 6,
    unitCost: 2600,
    location: "Store Rack B3",
  },
];

const run = async () => {
  console.log(`Seeding demo maintenance data for ${today}...`);

  const assetIds = {};
  for (const a of assetDefs) {
    const id = await createRecord("cmms/assets", a);
    assetIds[a.assetCode] = { id, name: a.name };
    console.log(`  asset  ${a.assetCode} (${a.name}) -> ${id}`);
  }

  // -------------------------------------------------------------------------
  // Work orders — cmms/workOrders, read by WorkOrders.tsx / CMMSDashboard.tsx
  // -------------------------------------------------------------------------
  const woDefs = [
    {
      code: "AST-COMP-01",
      title: "Compressor overheat trip — investigate & repair",
      description: "Unit tripped on high temperature alarm; shop air pressure test rigs offline until repaired.",
      type: "Corrective",
      priority: "Critical",
      status: "Open",
      assignedTo: "Ravi Kumar",
      requestedBy: "Shop Floor Supervisor",
      scheduledDate: today,
      notes: "Blocking pressure testing for Ark UUV batch.",
    },
    {
      code: "AST-TANK-01",
      title: "Test tank winch cable — emergency inspection",
      description: "Frayed strand noticed on winch cable during pre-dive checklist; tank offline until cleared.",
      type: "Emergency",
      priority: "Critical",
      status: "In Progress",
      assignedTo: "Suresh Nair",
      requestedBy: "QA Test Engineer",
      scheduledDate: isoDate(-1),
      notes: "Replacement cable ordered; ETA today.",
    },
    {
      code: "AST-HVAC-01",
      title: "Quarterly cleanroom HVAC inspection",
      description: "Check filters, humidity control and duct seals ahead of next payload integration run.",
      type: "Inspection",
      priority: "Low",
      status: "Assigned",
      assignedTo: "Facilities Team",
      requestedBy: "Electronics Lead",
      scheduledDate: isoDate(2),
    },
    {
      code: "AST-CHG-01",
      title: "Charging station — intermittent fault on bay 3",
      description: "Bay 3 charging port cuts out mid-cycle; suspect loose terminal.",
      type: "Corrective",
      priority: "Medium",
      status: "On Hold",
      assignedTo: "Ravi Kumar",
      requestedBy: "Assembly Lead",
      scheduledDate: isoDate(1),
      notes: "Waiting on replacement terminal block from stores.",
    },
    {
      code: "AST-CNC-01",
      title: "Monthly lubrication & spindle check",
      description: "Checklist:\nCheck oil level\nInspect spindle bearings\nClean coolant filters",
      type: "Preventive",
      priority: "Medium",
      status: "Completed",
      assignedTo: "Suresh Nair",
      requestedBy: "Maintenance Planner",
      scheduledDate: isoDate(-6),
      completedDate: isoDate(-5),
      laborHours: 3.5,
      cost: 2800,
      notes: "Completed on schedule, no issues found.",
    },
    {
      code: "AST-FLT-01",
      title: "Forklift — annual safety inspection",
      description: "Statutory annual safety and load-test inspection.",
      type: "Inspection",
      priority: "Medium",
      status: "Completed",
      assignedTo: "Facilities Team",
      requestedBy: "Safety Officer",
      scheduledDate: isoDate(-10),
      completedDate: isoDate(-9),
      laborHours: 2,
      cost: 1500,
    },
  ];

  for (const w of woDefs) {
    const asset = assetIds[w.code];
    const woNumber = `WO-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 10)}`;
    const { code, ...rest } = w;
    const id = await createRecord("cmms/workOrders", {
      woNumber,
      assetId: asset.id,
      assetName: asset.name,
      partsUsed: [],
      ...rest,
    });
    console.log(`  work order ${woNumber} (${w.title}) -> ${id}`);
  }

  // -------------------------------------------------------------------------
  // Preventive maintenance schedules — cmms/pmSchedules
  // -------------------------------------------------------------------------
  const pmDefs = [
    {
      code: "AST-CNC-01",
      name: "Monthly Lubrication & Spindle Check",
      triggerType: "Time",
      frequencyDays: 30,
      lastServiceDate: isoDate(-5),
      nextDueDate: isoDate(25),
      taskChecklist: ["Check oil level", "Inspect spindle bearings", "Clean coolant filters"],
      assignedTo: "Suresh Nair",
      status: "Active",
    },
    {
      code: "AST-CHG-01",
      name: "Quarterly Charging Station Calibration",
      triggerType: "Time",
      frequencyDays: 90,
      lastServiceDate: isoDate(-95),
      nextDueDate: isoDate(-5),
      taskChecklist: ["Calibrate voltage output", "Inspect terminal contacts", "Test safety cutoffs"],
      assignedTo: "Ravi Kumar",
      status: "Active",
    },
    {
      code: "AST-COMP-01",
      name: "Compressor Service — Meter Based",
      triggerType: "Meter",
      meterInterval: 500,
      lastServiceMeter: 9500,
      nextDueMeter: 10000,
      taskChecklist: ["Replace air filter", "Check belt tension", "Drain condensate trap"],
      assignedTo: "Ravi Kumar",
      status: "Active",
    },
    {
      code: "AST-HVAC-01",
      name: "Cleanroom HVAC Filter Replacement",
      triggerType: "Time",
      frequencyDays: 60,
      lastServiceDate: isoDate(-70),
      nextDueDate: isoDate(-10),
      taskChecklist: ["Replace HEPA filters", "Check humidity sensor calibration"],
      assignedTo: "Facilities Team",
      status: "Active",
    },
  ];

  for (const p of pmDefs) {
    const asset = assetIds[p.code];
    const { code, ...rest } = p;
    const id = await createRecord("cmms/pmSchedules", {
      assetId: asset.id,
      assetName: asset.name,
      ...rest,
    });
    console.log(`  PM schedule ${p.name} (${asset.name}) -> ${id}`);
  }

  // -------------------------------------------------------------------------
  // Spare parts
  // -------------------------------------------------------------------------
  for (const sp of spareParts) {
    const id = await createRecord("cmms/spareParts", sp);
    console.log(`  spare part ${sp.partCode} (${sp.partName}, stock ${sp.stockQty}/${sp.reorderPoint}) -> ${id}`);
  }

  console.log("Done.");
  process.exit(0);
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
