// src/context/OrgSettingsContext.tsx
// Organization-level settings (currently: country). Drives currency/date
// formatting and tax terminology across the Accounts module via
// countryConfig.ts. Defaults to India so existing behavior is unaffected
// until an org actively changes it in Settings.
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { database } from '@/services/firebase';
import { ref, onValue } from 'firebase/database';
import { updateRecord } from '@/services/firebase';
import { COUNTRY_CONFIG, CountryConfig, DEFAULT_COUNTRY, getCountryConfig } from '@/lib/countryConfig';

const SETTINGS_PATH = 'settings';
const SETTINGS_KEY = 'organization';

interface OrgSettingsContextType {
  country: string;
  countryConfig: CountryConfig;
  setCountry: (code: string) => Promise<void>;
  loading: boolean;
}

const OrgSettingsContext = createContext<OrgSettingsContextType | undefined>(undefined);

export const OrgSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [country, setCountryState] = useState<string>(DEFAULT_COUNTRY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgRef = ref(database, `${SETTINGS_PATH}/${SETTINGS_KEY}`);
    const unsubscribe = onValue(orgRef, (snap) => {
      const data = snap.val();
      if (data?.country && COUNTRY_CONFIG[data.country]) {
        setCountryState(data.country);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const setCountry = async (code: string) => {
    // update() upserts — writes the node at settings/organization even if it
    // doesn't exist yet, so no separate create path is needed (see Settings.tsx
    // rolePermissions for the same pattern).
    await updateRecord(SETTINGS_PATH, SETTINGS_KEY, { country: code, updatedAt: Date.now() });
    setCountryState(code);
  };

  return (
    <OrgSettingsContext.Provider value={{ country, countryConfig: getCountryConfig(country), setCountry, loading }}>
      {children}
    </OrgSettingsContext.Provider>
  );
};

export const useOrgSettings = () => {
  const ctx = useContext(OrgSettingsContext);
  if (ctx === undefined) {
    throw new Error('useOrgSettings must be used within an OrgSettingsProvider');
  }
  return ctx;
};
