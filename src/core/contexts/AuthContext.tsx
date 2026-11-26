/* eslint-disable @typescript-eslint/no-explicit-any, react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { API_HOST } from "@core/utils/axiosConfig";
import api from "@core/utils/axiosConfig";
import { isAdminRole } from "@core/utils/roles";
import { initRegistryRefresh } from "@core/api-builder/registry";
import {
  clearSession, companyOfPage, getAppSlug, getToken, lastCompany, setAppSlug, setToken,
} from "@core/auth/session";

interface AppRole {
  roleId: number;
  uiPermissions: string[];
}

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  company?: string;
  team?: string;
  role_id?: number;
  team_id?: number;
  company_id?: number;
  uiPermissions?: any[];
  appRoles?: Record<string, AppRole>;
  /** Company admin panel (2026-11-19): a login for someone with no email; a password an admin set; may open the panel. */
  username?: string | null;
  mustChangePassword?: boolean;
  isCompanyAdmin?: boolean;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  companySlug: string | null;
  appSlug: string | null;
  isInitialized: boolean;
  login: (token: string, userData: User, companySlug: string, appSlug?: string | null) => void;
  selectApp: (appSlug: string) => void;
  /** Signs out of this page's company only; the others stay signed in. */
  logout: () => void;
  getHomePath: () => string;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  user: null,
  companySlug: null,
  appSlug: null,
  isInitialized: false,
  login: () => {},
  selectApp: () => {},
  logout: () => {},
  getHomePath: () => "/",
});

/** What this page knows of one company's sign-in: undefined = not checked yet, user null = not signed in. */
type Known = { user: User | null; app: string | null };
const CRM_KEPT = "cf_crm:verifiedUser";

/**
 * ONE SIGN-IN PER COMPANY (2026-11-26, core/auth/session.ts). The page's company is the first part of its address
 * (/placebo/cf_erp/... → placebo); the sign-in shown is that company's. An address that names no company (/,
 * /platform/...) uses the company signed in to last. Moving to another company's address checks that company's own
 * sign-in; the others are untouched.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const company = companyOfPage(location.pathname) ?? lastCompany();
  const [known, setKnown] = useState<Record<string, Known>>({});
  const knownRef = useRef(known);
  knownRef.current = known;

  const remember = useCallback((slug: string, k: Known) => {
    setKnown((prev) => ({ ...prev, [slug]: k }));
  }, []);

  // Check this company's kept sign-in once per page load (login() fills it in directly).
  useEffect(() => {
    if (!company || knownRef.current[company] !== undefined) return;
    const token = getToken(company);
    const app = getAppSlug(company);
    if (!token) { remember(company, { user: null, app: null }); return; }
    let gone = false;
    const verify = async () => {
      try {
        // Use app-level verify when both slugs are known; company-level otherwise
        const verifyUrl = app ? `${API_HOST}/api/${company}/${app}/verify` : `${API_HOST}/api/${company}/auth/verify`;
        const response = await api.get(verifyUrl);
        if (gone) return;
        if (response.data?.user) {
          const verifiedUser: User = {
            ...response.data.user,
            appRoles: response.data.appRoles ?? response.data.user.appRoles ?? undefined,
          };
          remember(company, { user: verifiedUser, app });
          // cf_crm opens without a connection (home-screen app): remember who was signed in
          if (app === "cf_crm") {
            try { localStorage.setItem(CRM_KEPT, JSON.stringify({ company, user: verifiedUser })); } catch { /* storage full or blocked */ }
          }
          // Fire and forget — uses baked manifest as fallback if this fails
          initRegistryRefresh({ url: `${API_HOST}/api/${company}/schema/resources` });
        } else {
          remember(company, { user: null, app: null });
        }
      } catch (err: any) {
        if (gone) return;
        // cf_crm only: no answer at all (offline, server waking up) is not a
        // refused sign-in. Keep the last confirmed session for this company;
        // the CRM itself works from its own copy and re-checks once online.
        // Any real answer (401, 403 …) still signs out, as for every app.
        if (app === "cf_crm" && !err?.response) {
          try {
            const kept = JSON.parse(localStorage.getItem(CRM_KEPT) || "null");
            if (kept && String(kept.company).toLowerCase() === company && kept.user) {
              remember(company, { user: kept.user, app });
              return;
            }
          } catch { /* fall through to signing out */ }
        }
        clearSession(company);
        remember(company, { user: null, app: null });
      }
    };
    void verify();
    return () => { gone = true; };
  }, [company, remember]);

  const login = (token: string, userData: User, slug: string, app?: string | null) => {
    const c = slug.toLowerCase();
    setToken(c, token);
    setAppSlug(c, app ?? null);
    remember(c, { user: userData, app: app ?? null });
    // Fire and forget — uses baked manifest as fallback if this fails
    initRegistryRefresh({ url: `${API_HOST}/api/${c}/schema/resources` });
  };

  const selectApp = (app: string) => {
    if (!company) return;
    setAppSlug(company, app);
    const k = knownRef.current[company];
    if (k) remember(company, { ...k, app });
  };

  const logout = () => {
    if (!company) return;
    const app = knownRef.current[company]?.app ?? getAppSlug(company);
    clearSession(company);
    remember(company, { user: null, app: null });
    // Call backend to clear the HTTP-only cookie (only a fallback now: every page sends its own company's sign-in)
    const logoutUrl = app ? `${API_HOST}/api/${company}/${app}/auth/logout` : `${API_HOST}/api/${company}/auth/logout`;
    api.post(logoutUrl).catch(() => {});
  };

  const current = company ? known[company] : undefined;
  const user = current?.user ?? null;
  const isAuthenticated = !!user;
  const isInitialized = !company || current !== undefined;
  const companySlug = isAuthenticated ? company : null;
  const appSlug = current?.app ?? null;

  const getHomePath = () => {
    if (!user || !companySlug) return "/";
    if (!appSlug) return `/${companySlug}/apps`;
    if (isAdminRole(user.role)) return `/${companySlug}/${appSlug}/admin/dashboard`;
    if (user.role === 'salesmanager' && appSlug && companySlug) {
      return `/${companySlug}/${appSlug}/manager/dashboard`;
    }
    return `/${companySlug}/${appSlug}/dashboard`;
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        login,
        selectApp,
        logout,
        getHomePath,
        companySlug,
        appSlug,
        isInitialized,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
