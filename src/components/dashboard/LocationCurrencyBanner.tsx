// src/components/dashboard/LocationCurrencyBanner.tsx
// Dashboard indicator (Accounts-visible only): detects the currency implied
// by the login's location and flags it against the org's configured base
// currency, so Accounts knows at a glance whether an FX adjustment is worth
// reviewing today. Purely an indication — never posts anything automatically.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Globe2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useOrgSettings } from '@/context/OrgSettingsContext';
import { detectLocation, fetchExchangeRate, type DetectedLocation } from '@/lib/locationCurrency';

export const LocationCurrencyBanner = () => {
  const navigate = useNavigate();
  const { countryConfig } = useOrgSettings();
  const [loc, setLoc] = useState<DetectedLocation | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    detectLocation().then(async (l) => {
      if (cancelled) return;
      setLoc(l);
      setLoading(false);
      if (l.currencyCode !== countryConfig.currencyCode) {
        const r = await fetchExchangeRate(l.currencyCode, countryConfig.currencyCode);
        if (!cancelled) setRate(r);
      }
    });
    return () => { cancelled = true; };
  }, [countryConfig.currencyCode]);

  if (loading || !loc) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-3.5 px-4 flex items-center gap-2.5 text-sm text-muted-foreground">
          <Globe2 className="h-4 w-4 animate-pulse" />
          Detecting login location for currency check…
        </CardContent>
      </Card>
    );
  }

  const mismatch = loc.currencyCode !== countryConfig.currencyCode;
  const where = [loc.city, loc.countryName].filter(Boolean).join(', ');

  if (!mismatch) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/60">
        <CardContent className="py-3.5 px-4 flex items-center gap-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-900">
            Login detected from <span className="font-medium">{where || loc.countryName}</span> — currency matches base ({countryConfig.currencyCode}). No FX adjustment indicated.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50/60">
      <CardContent className="py-4 px-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
          <Globe2 className="h-4 w-4 text-amber-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-950">
            Detected login from {where || loc.countryName} ({loc.currencyCode}) — base currency is {countryConfig.currencyCode}
          </p>
          <p className="text-xs text-amber-800/80 mt-0.5">
            {rate != null
              ? `Indicative rate: 1 ${loc.currencyCode} ≈ ${rate.toFixed(4)} ${countryConfig.currencyCode} — review before booking today's transactions.`
              : 'Consider reviewing today\'s exchange rate before booking transactions in this currency.'}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-amber-300 text-amber-900 hover:bg-amber-100 shrink-0"
          onClick={() => navigate('/finance/currency-adjustments', { state: { presetCurrency: loc.currencyCode, presetRate: rate ?? undefined } })}
        >
          Review Adjustment
          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      </CardContent>
    </Card>
  );
};
