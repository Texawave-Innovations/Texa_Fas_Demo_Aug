// src/services/tallyExportService.ts
// Tally XML Voucher Exporter:
// Generates standard TallyPrime / Tally ERP 9 XML envelope for:
// - Sales Invoices
// - Purchase / Vendor Bills
// - Payments & Receipts
// - Journal Vouchers
// With configurable ledger name mapping and export batch logging.

import { createRecord, logAudit } from '@/services/firebase';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import type { TallyExportBatch, UnifiedVoucher } from '@/types/accounts';

export interface TallyLedgerMapping {
  fcsCode: string;
  fcsName: string;
  tallyLedgerName: string;
}

export const DEFAULT_TALLY_MAPPINGS: Record<string, string> = {
  '1000': 'Cash',
  '1010': 'Bank Accounts',
  '1200': 'Sundry Debtors',
  '1300': 'Advances to Suppliers',
  '1400': 'Stock-in-Hand',
  '1500': 'Fixed Assets',
  '1510': 'Accumulated Depreciation',
  '2000': 'Sundry Creditors',
  '2100': 'Duties & Taxes',
  '2200': 'Outstanding Expenses',
  '3000': 'Capital Account',
  '3100': 'Reserves & Surplus',
  '4000': 'Sales Accounts',
  '4100': 'Direct Incomes',
  '5000': 'Purchase Accounts',
  '5100': 'Indirect Expenses',
  '5200': 'Salaries & Wages',
  '5300': 'Rent Rates & Taxes',
  '5400': 'Power & Fuel',
  '5500': 'Depreciation',
};

/**
 * Escapes XML special characters.
 */
const escapeXml = (unsafe: string | number | undefined | null): string => {
  if (unsafe === undefined || unsafe === null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

/**
 * Formats a Date to Tally format (YYYYMMDD).
 */
const formatTallyDate = (dateStr: string): string => {
  try {
    const clean = dateStr.replace(/[^0-9]/g, '');
    if (clean.length === 8) return clean;
    const d = new Date(dateStr);
    return format(d, 'yyyyMMdd');
  } catch {
    return format(new Date(), 'yyyyMMdd');
  }
};

/**
 * Maps an FCS account code / name to a Tally ledger name.
 */
export const resolveTallyLedger = (
  codeOrName: string,
  customMap: Record<string, string> = {},
): string => {
  const code = (codeOrName || '').trim();
  if (customMap[code]) return customMap[code];
  if (DEFAULT_TALLY_MAPPINGS[code]) return DEFAULT_TALLY_MAPPINGS[code];
  return codeOrName; // fallback to verbatim
};

/**
 * Generates XML string for a collection of Unified Vouchers.
 */
export const generateTallyXmlString = (
  vouchers: UnifiedVoucher[],
  companyName = 'FCS ERP Manufacturing',
  customMap: Record<string, string> = {},
): string => {
  const tallyMessages: string[] = [];

  for (const v of vouchers) {
    const tallyDate = formatTallyDate(v.date);
    const voucherType = v.voucherType || 'Journal';
    const vNum = escapeXml(v.voucherNumber);
    const narration = escapeXml(v.narration || `${voucherType} Voucher`);

    const ledgerEntriesXml: string[] = [];

    for (const line of v.lines || []) {
      const isDebit = (line.debit || 0) > 0;
      const amount = isDebit ? -(line.debit || 0) : (line.credit || 0); // In Tally XML: Debits are negative!
      const ledgerName = escapeXml(resolveTallyLedger(line.accountId || line.accountName, customMap));

      ledgerEntriesXml.push(`
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${ledgerName}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
              <AMOUNT>${amount.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`);
    }

    tallyMessages.push(`
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="${escapeXml(voucherType)}" ACTION="Create">
            <DATE>${tallyDate}</DATE>
            <VOUCHERTYPENAME>${escapeXml(voucherType)}</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${vNum}</VOUCHERNUMBER>
            <REFERENCE>${escapeXml(v.referenceNumber || v.sourceNumber || v.voucherNumber)}</REFERENCE>
            <NARRATION>${narration}</NARRATION>
            ${ledgerEntriesXml.join('')}
          </VOUCHER>
        </TALLYMESSAGE>`);
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${tallyMessages.join('')}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
};

/**
 * Triggers browser download of Tally XML file and logs the export batch.
 */
export const exportVouchersToTallyXml = async (params: {
  vouchers: UnifiedVoucher[];
  fromDate: string;
  toDate: string;
  voucherTypes: string[];
  companyName?: string;
  customMap?: Record<string, string>;
  userName?: string;
}): Promise<TallyExportBatch> => {
  const {
    vouchers,
    fromDate,
    toDate,
    voucherTypes,
    companyName = 'FCS ERP Manufacturing',
    customMap = {},
    userName = 'Accounts User',
  } = params;

  if (vouchers.length === 0) {
    throw new Error('No vouchers found to export for the selected filters.');
  }

  const xml = generateTallyXmlString(vouchers, companyName, customMap);
  const fileName = `Tally_Vouchers_${fromDate}_to_${toDate}.xml`;

  // Download XML file
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
  saveAs(blob, fileName);

  const batchNumber = `TLX-${Date.now()}`;
  const batch: TallyExportBatch = {
    id: `tb_${Date.now()}`,
    batchNumber,
    exportDate: format(new Date(), 'yyyy-MM-dd HH:mm'),
    fromDate,
    toDate,
    voucherTypes,
    voucherCount: vouchers.length,
    xmlPayloadLength: xml.length,
    fileName,
    status: 'Exported',
    createdAt: Date.now(),
  };

  await createRecord('accounts/tallyExports', batch);
  await logAudit('accounts/tallyExports', batch.id, 'create', `Exported ${vouchers.length} vouchers to Tally XML (${fileName})`);

  return batch;
};

