/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ThemeProvider, type Theme } from '@mui/material/styles';
import api, { API_HOST } from '@core/utils/axiosConfig';
import { useAuth } from '@core/contexts/AuthContext';
import { brandCss, cacheBrand, readCachedBrand, solidFor, type CompanyBrand } from './companyBrand';

/**
 * The signed-in company's colours and logo (core/brand/companyBrand.ts). Loaded once after sign-in from the admin
 * panel's GET /brand (any person of the company may read it), kept per company in localStorage so the next visit paints
 * right away, and dropped at sign-out. Nothing here runs on a sign-in page: no one is signed in there.
 */
type Ctx = { brand: CompanyBrand | null; refresh: () => Promise<void>; preview: (b: CompanyBrand | null) => void };
const BrandContext = createContext<Ctx>({ brand: null, refresh: async () => {}, preview: () => {} });

export const useCompanyBrand = () => useContext(BrandContext);

const STYLE_ID = 'company-brand';

export function CompanyBrandProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, companySlug, user } = useAuth();
  const slug = isAuthenticated ? (companySlug ?? (user as { company?: string } | null)?.company ?? null) : null;
  const mustChange = !!(user as { mustChangePassword?: boolean } | null)?.mustChangePassword;
  const [brand, setBrand] = useState<CompanyBrand | null>(() => readCachedBrand(slug));
  const [shown, setShown] = useState<CompanyBrand | null | undefined>(undefined); // a preview in the admin panel

  const refresh = useCallback(async () => {
    if (!slug || mustChange) return;
    try {
      const r = await api.get(`${API_HOST}/api/${encodeURIComponent(slug)}/admin-panel/brand`);
      const b: CompanyBrand = { company: r.data?.company ?? null, colors: Array.isArray(r.data?.colors) ? r.data.colors : [], logo: r.data?.logo || '' };
      cacheBrand(slug, b);
      setBrand(b);
    } catch { /* not allowed or offline: keep what we have */ }
  }, [slug, mustChange]);

  // A different company (or signed out): start from that company's cached brand, then ask the server.
  useEffect(() => {
    setBrand(readCachedBrand(slug));
    setShown(undefined);
    void refresh();
  }, [slug, refresh]);

  const active = shown !== undefined ? shown : slug ? brand : null;

  // The colours: one <style> after everything else (core/brand/companyBrand.ts brandCss).
  useEffect(() => {
    const css = active ? brandCss(active.colors) : '';
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!css) { el?.remove(); return; }
    if (!el) { el = document.createElement('style'); el.id = STYLE_ID; document.head.appendChild(el); }
    el.textContent = css;
  }, [active]);

  return <BrandContext.Provider value={{ brand: active ?? null, refresh, preview: setShown }}>{children}</BrandContext.Provider>;
}

/**
 * MUI's primary / secondary from the company's first two colours, inside whatever theme is around it. Each app theme
 * scope (shared ThemeScope, FabErpThemeScope, CfErpThemeScope, and the root) puts one inside its own ThemeProvider.
 */
export function BrandPalette({ children }: { children: ReactNode }) {
  const { brand } = useCompanyBrand();
  const colors = brand?.colors ?? [];
  if (colors.length < 3) return <>{children}</>;
  return (
    <ThemeProvider
      theme={(outer: Theme) => ({
        ...outer,
        palette: {
          ...outer.palette,
          primary: outer.palette.augmentColor({ color: { main: solidFor(colors[0]) }, name: 'primary' }),
          secondary: outer.palette.augmentColor({ color: { main: solidFor(colors[1]) }, name: 'secondary' }),
        },
      })}
    >
      {children}
    </ThemeProvider>
  );
}
