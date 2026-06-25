/* eslint-disable @typescript-eslint/no-explicit-any, react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { API_HOST } from "@core/utils/axiosConfig";
import api from "@core/utils/axiosConfig";
import { isAdminRole } from "@core/utils/roles";
import { initRegistryRefresh } from "@core/api-builder/registry";

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
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  companySlug: string | null;
  appSlug: string | null;
  isInitialized: boolean;
  login: (token: string, userData: User, companySlug: string, appSlug?: string | null) => void;
  selectApp: (appSlug: string) => void;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [companySlug, setCompanySlug] = useState<string | null>(null);
  const [appSlug, setAppSlug] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const company = localStorage.getItem("companySlug");
    const app = localStorage.getItem("appSlug");

    const initializeAuth = async () => {
      if (token && company) {
        try {
          // Use app-level verify when both slugs are known; company-level otherwise
          const verifyUrl = app
            ? `${API_HOST}/api/${company}/${app}/verify`
            : `${API_HOST}/api/${company}/auth/verify`;
          const response = await api.get(verifyUrl);
          if (response.data?.user) {
            const verifiedUser: User = {
              ...response.data.user,
              appRoles: response.data.appRoles ?? response.data.user.appRoles ?? undefined,
            };
            setUser(verifiedUser);
            setIsAuthenticated(true);
            setCompanySlug(company);
            if (app) setAppSlug(app);
            // Fire and forget — uses baked manifest as fallback if this fails
            initRegistryRefresh({ url: `${API_HOST}/api/${company}/schema/resources` });
          }
        } catch {
          localStorage.removeItem("token");
          localStorage.removeItem("companySlug");
          localStorage.removeItem("appSlug");
          setIsAuthenticated(false);
          setUser(null);
          setCompanySlug(null);
          setAppSlug(null);
        }
      } else {
        setIsAuthenticated(false);
        setUser(null);
        setCompanySlug(null);
        setAppSlug(null);
      }
      setIsInitialized(true);
    };
    initializeAuth();
  }, []);

  const login = (
    token: string,
    userData: User,
    company: string,
    app?: string | null
  ) => {
    localStorage.setItem("token", token);
    localStorage.setItem("companySlug", company);
    if (app) {
      localStorage.setItem("appSlug", app);
      setAppSlug(app);
    } else {
      localStorage.removeItem("appSlug");
      setAppSlug(null);
    }
    setUser(userData);
    setCompanySlug(company);
    setIsAuthenticated(true);
    // Fire and forget — uses baked manifest as fallback if this fails
    initRegistryRefresh({ url: `${API_HOST}/api/${company}/schema/resources` });
  };

  const selectApp = (app: string) => {
    localStorage.setItem("appSlug", app);
    setAppSlug(app);
  };

  const logout = () => {
    const company = localStorage.getItem("companySlug");
    const app = localStorage.getItem("appSlug");
    localStorage.removeItem("token");
    localStorage.removeItem("companySlug");
    localStorage.removeItem("appSlug");
    setIsAuthenticated(false);
    setUser(null);
    setCompanySlug(null);
    setAppSlug(null);
    // Call backend to clear the HTTP-only cookie
    const logoutUrl = app
      ? `${API_HOST}/api/${company}/${app}/auth/logout`
      : company
        ? `${API_HOST}/api/${company}/auth/logout`
        : null;
    if (logoutUrl) {
      api.post(logoutUrl).catch(() => {});
    }
  };

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
