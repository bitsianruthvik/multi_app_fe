import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@core/contexts/AuthContext';
import { API_HOST } from '@core/utils/axiosConfig';

/**
 * cf_crm's whole screen. The app itself is the NorthEast Network single-page
 * app, kept as the customer chose it: public/cf_crm/app.html + app.js +
 * app.css, shown here full-screen in a same-origin iframe so its own global
 * styles and listeners never touch the platform's.
 *
 * The iframe reads `window.parent.__CF_CRM_ENV__` on its first line and will
 * not run without it: the API host and company (never taken from its own
 * URL, so a crafted link cannot send the token elsewhere), the token, and the
 * hooks for signing out, a lost session and leaving the app. The iframe is
 * only rendered once that object is in place.
 */
type CfCrmEnv = {
  apiHost: string;
  company: string;
  getToken: () => string | null;
  onAuthLost: () => void;
  logout: () => void;
  leave: () => void;
  onBrand: (b: { appName: string; color: string }) => void;
};
declare global {
  interface Window { __CF_CRM_ENV__?: CfCrmEnv }
}

export default function CfCrmFrame() {
  const { company = '' } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [ready, setReady] = useState(false);

  // the latest router / auth functions, for hooks the iframe calls later
  const live = useRef({ navigate, logout });
  live.current = { navigate, logout };

  useLayoutEffect(() => {
    // ProtectedRoute sends a signed-out visitor to /:company as soon as the
    // state changes, and this page is gone by then (its navigate no longer
    // works), so this app's sign-in is opened as a fresh page load.
    const toLogin = () => {
      live.current.logout();
      window.location.replace(`/${company}/cf_crm/login`);
    };
    window.__CF_CRM_ENV__ = {
      apiHost: API_HOST,
      company,
      getToken: () => localStorage.getItem('token'),
      onAuthLost: toLogin,
      logout: toLogin,
      leave: () => live.current.navigate(`/${company}/apps`),
      onBrand: ({ appName, color }) => {
        if (appName) document.title = appName;
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta && color) meta.setAttribute('content', color);
      },
    };
    const prevOverflow = document.body.style.overflow;
    const prevTitle = document.title;
    document.body.style.overflow = 'hidden';
    setReady(true);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.title = prevTitle;
      delete window.__CF_CRM_ENV__;
      setReady(false);
    };
  }, [company]);

  if (!ready) return null;
  return (
    <iframe
      key={company}
      title="CRM"
      src="/cf_crm/app.html"
      allow="microphone; clipboard-write"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100dvh', border: 0, display: 'block', background: 'transparent' }}
    />
  );
}
