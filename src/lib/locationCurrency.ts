// src/lib/locationCurrency.ts
// Best-effort "what currency is this login probably in" detection, purely for
// an on-dashboard indicator that nudges the Accounts team to check FX —
// never used for anything financial/authoritative. IP geolocation is tried
// first (real signal, e.g. actually shows Chennai when accessed from there);
// if it's blocked, rate-limited or slow, we fall back to the browser's IANA
// timezone so the indicator never just breaks.
import { COUNTRY_CONFIG, DEFAULT_COUNTRY, getCountryConfig } from '@/lib/countryConfig';

export type DetectedLocation = {
  countryCode: string | null; // matches a key in COUNTRY_CONFIG, or null if we can't map it
  countryName: string;
  city?: string;
  currencyCode: string;
  source: 'ip' | 'timezone';
};

const TIMEZONE_COUNTRY: Record<string, string> = {
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Anchorage': 'US',
  'Europe/London': 'GB',
  'Asia/Dubai': 'AE',
  'Asia/Singapore': 'SG',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA',
  'Europe/Berlin': 'DE',
  'Asia/Riyadh': 'SA',
  'Asia/Kuala_Lumpur': 'MY',
  'Africa/Johannesburg': 'ZA',
};

function detectByTimezone(): DetectedLocation {
  let tz = '';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    // Intl unavailable — fall through to default below
  }
  const code = TIMEZONE_COUNTRY[tz] || DEFAULT_COUNTRY;
  const cfg = getCountryConfig(code);
  return { countryCode: code, countryName: cfg.name, currencyCode: cfg.currencyCode, source: 'timezone' };
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// IP geolocation with a graceful, silent fallback — never throws.
export async function detectLocation(timeoutMs = 3000): Promise<DetectedLocation> {
  try {
    const res = await fetchWithTimeout('https://ipapi.co/json/', timeoutMs);
    if (!res.ok) throw new Error(`ipapi ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.reason || 'ipapi error');
    const code: string = (data.country_code || '').toUpperCase();
    const cfg = COUNTRY_CONFIG[code];
    return {
      countryCode: cfg ? code : null,
      countryName: cfg?.name || data.country_name || 'Unknown',
      city: data.city || undefined,
      currencyCode: cfg?.currencyCode || data.currency || getCountryConfig().currencyCode,
      source: 'ip',
    };
  } catch {
    return detectByTimezone();
  }
}

// Indicative live FX rate — display-only, not booked anywhere automatically.
// open.er-api.com is free and keyless; returns null (not a thrown error) on
// any failure so callers can just hide the rate line.
export async function fetchExchangeRate(from: string, to: string, timeoutMs = 3000): Promise<number | null> {
  if (from === to) return 1;
  try {
    const res = await fetchWithTimeout(`https://open.er-api.com/v6/latest/${from}`, timeoutMs);
    if (!res.ok) throw new Error(`fx ${res.status}`);
    const data = await res.json();
    const rate = data?.rates?.[to];
    return typeof rate === 'number' ? rate : null;
  } catch {
    return null;
  }
}
