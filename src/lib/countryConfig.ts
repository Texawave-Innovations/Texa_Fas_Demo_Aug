// src/lib/countryConfig.ts
// Drives country-aware formatting across the Accounts module: currency
// symbol/format, date format, and tax terminology/default rate. These are
// configurable reference values for display purposes only — not a legal
// compliance engine. India stays the default so existing behavior (₹, GST)
// is unaffected unless an org actively switches country.

export interface CountryConfig {
  code: string;
  name: string;
  flag: string;
  currencyCode: string;
  currencySymbol: string;
  taxLabel: string; // e.g. "GST", "VAT", "Sales Tax"
  defaultTaxRate: number; // representative rate, editable per transaction
  dateFormat: string; // date-fns format string
  locale: string;
}

export const COUNTRY_CONFIG: Record<string, CountryConfig> = {
  IN: {
    code: 'IN', name: 'India', flag: '🇮🇳',
    currencyCode: 'INR', currencySymbol: '₹',
    taxLabel: 'GST', defaultTaxRate: 18,
    dateFormat: 'dd/MM/yyyy', locale: 'en-IN',
  },
  US: {
    code: 'US', name: 'United States', flag: '🇺🇸',
    currencyCode: 'USD', currencySymbol: '$',
    taxLabel: 'Sales Tax', defaultTaxRate: 7,
    dateFormat: 'MM/dd/yyyy', locale: 'en-US',
  },
  GB: {
    code: 'GB', name: 'United Kingdom', flag: '🇬🇧',
    currencyCode: 'GBP', currencySymbol: '£',
    taxLabel: 'VAT', defaultTaxRate: 20,
    dateFormat: 'dd/MM/yyyy', locale: 'en-GB',
  },
  AE: {
    code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪',
    currencyCode: 'AED', currencySymbol: 'د.إ',
    taxLabel: 'VAT', defaultTaxRate: 5,
    dateFormat: 'dd/MM/yyyy', locale: 'en-AE',
  },
  SG: {
    code: 'SG', name: 'Singapore', flag: '🇸🇬',
    currencyCode: 'SGD', currencySymbol: 'S$',
    taxLabel: 'GST', defaultTaxRate: 9,
    dateFormat: 'dd/MM/yyyy', locale: 'en-SG',
  },
  AU: {
    code: 'AU', name: 'Australia', flag: '🇦🇺',
    currencyCode: 'AUD', currencySymbol: 'A$',
    taxLabel: 'GST', defaultTaxRate: 10,
    dateFormat: 'dd/MM/yyyy', locale: 'en-AU',
  },
  CA: {
    code: 'CA', name: 'Canada', flag: '🇨🇦',
    currencyCode: 'CAD', currencySymbol: 'C$',
    taxLabel: 'GST/HST', defaultTaxRate: 5,
    dateFormat: 'MM/dd/yyyy', locale: 'en-CA',
  },
  DE: {
    code: 'DE', name: 'Germany', flag: '🇩🇪',
    currencyCode: 'EUR', currencySymbol: '€',
    taxLabel: 'VAT (MwSt)', defaultTaxRate: 19,
    dateFormat: 'dd.MM.yyyy', locale: 'de-DE',
  },
  SA: {
    code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦',
    currencyCode: 'SAR', currencySymbol: 'ر.س',
    taxLabel: 'VAT', defaultTaxRate: 15,
    dateFormat: 'dd/MM/yyyy', locale: 'en-SA',
  },
  MY: {
    code: 'MY', name: 'Malaysia', flag: '🇲🇾',
    currencyCode: 'MYR', currencySymbol: 'RM',
    taxLabel: 'SST', defaultTaxRate: 6,
    dateFormat: 'dd/MM/yyyy', locale: 'en-MY',
  },
  ZA: {
    code: 'ZA', name: 'South Africa', flag: '🇿🇦',
    currencyCode: 'ZAR', currencySymbol: 'R',
    taxLabel: 'VAT', defaultTaxRate: 15,
    dateFormat: 'dd/MM/yyyy', locale: 'en-ZA',
  },
};

export const DEFAULT_COUNTRY = 'IN';

export const COUNTRY_LIST = Object.values(COUNTRY_CONFIG);

export function getCountryConfig(code?: string | null): CountryConfig {
  return COUNTRY_CONFIG[code || DEFAULT_COUNTRY] || COUNTRY_CONFIG[DEFAULT_COUNTRY];
}

export function formatCurrency(amount: number, countryCode?: string | null): string {
  const cfg = getCountryConfig(countryCode);
  const formatted = Number(amount || 0).toLocaleString(cfg.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${cfg.currencySymbol}${formatted}`;
}
