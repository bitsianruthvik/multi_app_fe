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
  setToken: (token: string) => void;
  onAuthLost: () => void;
  logout: () => void;
  leave: () => void;
  onBrand: (b: { appName: string; color: string }) => void;
  /** a link from a tapped alert (?open=lead:ID), read once by the app */
  initialLink?: string | null;
  /** set by the app: shows a link (lead:ID, chat:ID, followups …) */
  openLinkHandler?: (link: string) => void;
  /**
   * Signed in at another company of the SAME customer (one network)? Go to
   * that company's address and say true; otherwise false.
   */
  toOwnCompany: () => Promise<boolean>;
};
declare global {
  interface Window { __CF_CRM_ENV__?: CfCrmEnv }
}

/**
 * Home screen and offline: the service worker (public/crm-sw.js, handles CRM
 * requests only) and the customer's install manifest
 * (public/cf_crm/m/<customer>.webmanifest, when there is one).
 */
function useInstallable(company: string) {
  useLayoutEffect(() => {
    try { localStorage.setItem('cf_crm:lastCompany', company); } catch { /* storage blocked */ }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/crm-sw.js', { scope: '/' }).catch(() => {});
    const added: Element[] = [];
    let live = true;
    fetch(`${API_HOST}/api/${encodeURIComponent(company)}/cf_crm/public-brand`, { credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (j) => {
        const slug = j && typeof j.customer === 'string' && /^[a-z0-9_-]+$/i.test(j.customer) ? j.customer : '';
        if (!live || !slug) return;
        // the static host answers a missing file with the app page, so check it is a manifest
        const m = await fetch(`/cf_crm/m/${slug}.webmanifest`).catch(() => null);
        if (!live || !m || !m.ok || /html/i.test(m.headers.get('content-type') || '')) return;
        const add = (tag: string, attrs: Record<string, string>) => {
          const el = document.createElement(tag);
          Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
          document.head.appendChild(el);
          added.push(el);
        };
        add('link', { rel: 'manifest', href: `/cf_crm/m/${slug}.webmanifest` });
        add('link', { rel: 'apple-touch-icon', href: `/cf_crm/m/${slug}-192.png` });
        add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
        add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
        add('meta', { name: 'apple-mobile-web-app-title', content: (j.brand && j.brand.appName) || 'CRM' });
      })
      .catch(() => {});
    return () => { live = false; added.forEach((el) => el.remove()); };
  }, [company]);
}

export default function CfCrmFrame() {
  const { company = '' } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [ready, setReady] = useState(false);
  useInstallable(company);

  // a tapped alert: ?open=<link> on the first load, or a message from the
  // service worker when this window was already open
  useLayoutEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const link = e.data && typeof e.data.cfCrmOpen === 'string' ? e.data.cfCrmOpen : '';
      if (link) window.__CF_CRM_ENV__?.openLinkHandler?.(link);
    };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, []);

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
    const params = new URLSearchParams(window.location.search);
    const open = params.get('open');
    const initialLink = open && /^[a-z]+(:[A-Za-z0-9_:-]{1,80})?$/.test(open) ? open : null;
    if (open) {
      params.delete('open');
      const qs = params.toString();
      window.history.replaceState(window.history.state, '', window.location.pathname + (qs ? '?' + qs : ''));
    }
    window.__CF_CRM_ENV__ = {
      apiHost: API_HOST,
      company,
      initialLink,
      getToken: () => localStorage.getItem('token'),
      // after a password change or a two-step code the server issues a new
      // token (the old sign-ins are ended); the platform reads it from here too
      setToken: (token: string) => {
        if (typeof token === 'string' && token.split('.').length === 3) localStorage.setItem('token', token);
      },
      onAuthLost: toLogin,
      logout: toLogin,
      leave: () => live.current.navigate(`/${company}/apps`),
      toOwnCompany: async () => {
        const mine = localStorage.getItem('companySlug') || '';
        if (!mine || mine === company || !/^[a-z0-9_-]+$/i.test(mine)) return false;
        const customerOf = (slug: string) => fetch(`${API_HOST}/api/${encodeURIComponent(slug)}/cf_crm/public-brand`, { credentials: 'omit' })
          .then((r) => (r.ok ? r.json() : null)).then((j) => (j && j.customer) || '').catch(() => '');
        const [here, theirs] = await Promise.all([customerOf(company), customerOf(mine)]);
        if (!here || here !== theirs) return false;
        window.location.replace(`/${mine}/cf_crm`);
        return true;
      },
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
