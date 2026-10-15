import { useEffect, useState } from 'react';
import { API_HOST } from '@core/utils/axiosConfig';

export type PublicBrand = { appName: string; logo: string; colors: { accent: string; accent2: string; bg: string } };

/**
 * The customer's name, logo and main colours for the sign-in page of cf_crm
 * (read before anyone is signed in; the endpoint returns nothing else).
 * null for every other app, and while loading.
 */
export function usePublicBrand(company?: string, app?: string): PublicBrand | null {
  const [brand, setBrand] = useState<PublicBrand | null>(null);
  useEffect(() => {
    if (!company || app !== 'cf_crm') { setBrand(null); return; }
    let live = true;
    fetch(`${API_HOST}/api/${encodeURIComponent(company)}/cf_crm/public-brand`, { credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j && j.brand) setBrand(j.brand); })
      .catch(() => {});
    return () => { live = false; };
  }, [company, app]);
  return brand;
}
