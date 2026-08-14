// scripts/seedDemoVault.mjs
// Seeds demo data for the Document & Drawing Vault module — a handful of
// documents (drawings, BOM, certificate, manual, export-control paperwork),
// two of them restricted/encrypted, plus a set of access requests (pending,
// approved, denied) so the approval workflow has something to show without
// needing to role-play the request step live during a demo.
//
// Encryption uses the same AES-256-GCM scheme as the browser
// (src/lib/vaultCrypto.ts) via Node's built-in Web Crypto API, so a
// restricted document seeded here decrypts correctly when viewed in the app.
//
// Safe to re-run — clears vault/documents and vault/accessRequests first,
// then reseeds fresh (so re-running never duplicates or leaves stale ids
// that access requests point at).
//
// Run with: node scripts/seedDemoVault.mjs
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, set, remove } from "firebase/database";
import { webcrypto } from "crypto";
import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import path from "path";

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

const CLOUDINARY_CLOUD_NAME = "dpgf1rkjl";
const CLOUDINARY_UPLOAD_PRESET = "unsigned_preset";

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

// Raw-resource upload via curl (Node 16 has no global fetch/FormData) —
// mirrors src/services/cloudinary.ts's uploadRaw() for arbitrary bytes.
const uploadRaw = (buffer, filename) => {
  const tmpPath = path.join(tmpdir(), `vault-seed-${Date.now()}-${filename}`);
  writeFileSync(tmpPath, buffer);
  try {
    const out = execFileSync("curl", [
      "-s",
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`,
      "-F", `upload_preset=${CLOUDINARY_UPLOAD_PRESET}`,
      "-F", `file=@${tmpPath}`,
    ]);
    const json = JSON.parse(out.toString());
    if (!json.secure_url) throw new Error(json.error?.message || "Upload failed");
    return json.secure_url;
  } finally {
    unlinkSync(tmpPath);
  }
};

// Same AES-256-GCM scheme as src/lib/vaultCrypto.ts's encryptFile().
const toBase64 = (buf) => Buffer.from(buf).toString("base64");

const encryptText = async (text) => {
  const key = await webcrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(text);
  const ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const rawKey = await webcrypto.subtle.exportKey("raw", key);
  return { buffer: Buffer.from(ciphertext), keyB64: toBase64(rawKey), ivB64: toBase64(iv) };
};

const minutesAgo = (m) => Date.now() - m * 60 * 1000;

const run = async () => {
  console.log("Clearing existing vault data...");
  await remove(ref(database, "vault/documents"));
  await remove(ref(database, "vault/accessRequests"));

  console.log("Seeding Document & Drawing Vault demo data...\n");

  const docIds = {};

  // ---------------------------------------------------------------------
  // Standard (open) documents — plain text placeholders, uploaded as-is.
  // ---------------------------------------------------------------------
  const standardDocs = [
    {
      key: "layout",
      title: "Facility Layout Drawing — Plant A",
      category: "Drawing",
      description: "General arrangement drawing of the main production floor, showing machine cells and material flow.",
      tags: ["layout", "facility"],
      content: "Facility Layout Drawing — Plant A\nGeneral arrangement of production floor, machine cells and material flow paths.",
    },
    {
      key: "bom",
      title: "Bill of Materials — Product Line X, Rev 3",
      category: "BOM",
      description: "Full component BOM for Product Line X, revision 3 — supersedes Rev 2 pricing and supplier codes.",
      tags: ["bom", "product-line-x"],
      content: "Bill of Materials — Product Line X, Rev 3\nComponent list, supplier codes and quantities per assembly.",
    },
    {
      key: "iso",
      title: "ISO 9001:2015 Quality Certification",
      category: "Certificate",
      description: "Current quality management system certification, valid through next surveillance audit.",
      tags: ["certification", "quality"],
      content: "ISO 9001:2015 Quality Management System Certificate\nIssuing body, scope of certification and validity period.",
    },
    {
      key: "manual",
      title: "CNC-01 Maintenance & Operations Manual",
      category: "Manual",
      description: "OEM maintenance and operations manual for the primary CNC machining center.",
      tags: ["manual", "cnc"],
      content: "CNC-01 Maintenance & Operations Manual\nRoutine service intervals, safety interlocks and troubleshooting guide.",
    },
  ];

  for (const d of standardDocs) {
    const fileUrl = uploadRaw(Buffer.from(d.content, "utf-8"), `${d.key}.txt`);
    const id = await createRecord("vault/documents", {
      title: d.title,
      category: d.category,
      classification: "commercial",
      sensitivity: "standard",
      tags: d.tags,
      description: d.description,
      currentVersion: 1,
      versions: [{
        version: 1,
        fileUrl,
        fileName: `${d.key}.txt`,
        fileType: "text/plain",
        fileSize: Buffer.byteLength(d.content, "utf-8"),
        encrypted: false,
        uploadedBy: "admin",
        uploadedByName: "Admin User",
        uploadedAt: minutesAgo(60 * 24 * 3),
      }],
      status: "active",
      uploadedBy: "admin",
      uploadedByName: "Admin User",
    });
    docIds[d.key] = id;
    console.log(`  document (standard)   ${d.title} -> ${id}`);
  }

  // ---------------------------------------------------------------------
  // Restricted (encrypted, approval-gated) documents.
  // ---------------------------------------------------------------------
  const restrictedDocs = [
    {
      key: "exportControl",
      title: "Export Control Compliance Statement",
      category: "Export-Control",
      classification: "commercial",
      description: "Export classification and compliance statement required before international shipment.",
      tags: ["export-control", "compliance"],
      content: "Export Control Compliance Statement\nClassification code, destination restrictions and compliance sign-off.",
    },
    {
      key: "confidentialSpec",
      title: "Confidential Product Specification — New Product Line",
      category: "Drawing",
      classification: "defence-unit",
      description: "Pre-release specification for the new defence-facing product line — restricted to the Defence Division.",
      tags: ["confidential", "new-product-line"],
      content: "Confidential Product Specification — New Product Line\nDimensional tolerances, material spec and performance targets.",
    },
  ];

  for (const d of restrictedDocs) {
    const { buffer, keyB64, ivB64 } = await encryptText(d.content);
    const fileUrl = uploadRaw(buffer, `${d.key}.enc`);
    const id = await createRecord("vault/documents", {
      title: d.title,
      category: d.category,
      classification: d.classification,
      sensitivity: "restricted",
      tags: d.tags,
      description: d.description,
      currentVersion: 1,
      versions: [{
        version: 1,
        fileUrl,
        fileName: `${d.key}.txt`,
        fileType: "text/plain",
        fileSize: Buffer.byteLength(d.content, "utf-8"),
        encrypted: true,
        encryptedKey: keyB64,
        iv: ivB64,
        uploadedBy: "admin",
        uploadedByName: "Admin User",
        uploadedAt: minutesAgo(60 * 24 * 2),
      }],
      status: "active",
      uploadedBy: "admin",
      uploadedByName: "Admin User",
    });
    docIds[d.key] = id;
    console.log(`  document (restricted)  ${d.title} -> ${id}`);
  }

  // ---------------------------------------------------------------------
  // Access requests — vault/accessRequests, read by Approvals.tsx
  // ---------------------------------------------------------------------
  const requests = [
    {
      documentKey: "exportControl",
      requestedBy: "quality",
      requestedByName: "Quality Inspector",
      requestedByRole: "quality",
      reason: "Need to confirm export documentation before releasing this week's shipment.",
      status: "pending",
      requestedAt: minutesAgo(45),
    },
    {
      documentKey: "exportControl",
      requestedBy: "production",
      requestedByName: "Production Head",
      requestedByRole: "Production",
      reason: "Reviewing packaging compliance for the export batch.",
      status: "approved",
      requestedAt: minutesAgo(60 * 6),
      decidedBy: "maintenance",
      decidedByName: "Maintenance Engineer",
      decidedAt: minutesAgo(60 * 5),
      decisionNote: "Approved for compliance review.",
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    },
    {
      documentKey: "exportControl",
      requestedBy: "sales",
      requestedByName: "Sales Executive",
      requestedByRole: "sales",
      reason: "Curious about the export terms for an upcoming quote.",
      status: "denied",
      requestedAt: minutesAgo(60 * 30),
      decidedBy: "maintenance",
      decidedByName: "Maintenance Engineer",
      decidedAt: minutesAgo(60 * 29),
      decisionNote: "Not required for the sales function — routed through Accounts if needed.",
    },
  ];

  for (const r of requests) {
    const { documentKey, ...rest } = r;
    const docTitle = restrictedDocs.find((d) => d.key === documentKey)?.title;
    const id = await createRecord("vault/accessRequests", {
      documentId: docIds[documentKey],
      documentTitle: docTitle,
      ...rest,
    });
    console.log(`  access request (${r.status})  ${r.requestedByName} -> ${docTitle} -> ${id}`);
  }

  console.log("\nDone. Log in as 'maintenance' / maintenance123 and open Vault > Approvals to see the pending request.");
  process.exit(0);
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
