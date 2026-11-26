import { useCallback, useEffect, useState } from 'react';
import { getDeskSettings } from '../api/storesDesk';
import { getMdMe } from '../api/md';
import type { NavScreen } from '../navMeta';
import { useIsPermitted } from './useIsPermitted';
import { getToken } from '@core/auth/session';

/**
 * A company switch read once per LOGIN and shared by every menu on the page. 2026-11-23 (user: "stock entry is not visible
 * in the test account"): the answer used to be kept for the whole browser session, so the answer one account got (or a
 * failed call, e.g. before login or by an account without the permission) stayed when another account logged in without a
 * reload. Now it is kept per login token, and a failed call is never kept — the next screen asks again.
 */
const loginKey = () => { try { return getToken() ?? ''; } catch { return ''; } };
function sessionSwitch(read: () => Promise<boolean>) {
  let key: string | null = null;
  let known: boolean | null = null;
  let asking: Promise<boolean> | null = null;
  const current = () => (key === loginKey() ? known : null);
  const ask = (): Promise<boolean> => {
    const k = loginKey();
    if (key !== k) { key = k; known = null; asking = null; }
    if (known != null) return Promise.resolve(known);
    asking ??= read().then(
      (v) => { if (key === k) known = v; return v; },
      () => { if (key === k) asking = null; return false; },   // not kept: asked again next time
    );
    return asking;
  };
  return function useSwitch(): boolean {
    const [on, setOn] = useState<boolean>(current() ?? false);
    useEffect(() => { let live = true; void ask().then((v) => { if (live) setOn(v); }); return () => { live = false; }; }, []);
    return on;
  };
}

/** Is this company on the Stores desk (cf_company_settings.stores_v2, init.sql §111)? false until it answers. */
export const useStoresV2 = sessionSwitch(() => getDeskSettings().then((s) => !!s.storesV2));

/**
 * §113: is this person standing in for the MD right now (settings md_standin_user + md_standin_on)? The backend lends them
 * the MD's permissions for each request, and the menu shows them the MD's two screens.
 */
export const useMdStandIn = sessionSwitch(() => getMdMe().then((m) => !!m.standIn));
const STAND_IN_SCREENS = new Set(['md-dashboard', 'approvals']);

/** 2026-11-23: is the stock entry week open (setting stock_entry_until)? The temporary screen shows only when the server says so. */
export const useStockEntryOpen = sessionSwitch(() => getDeskSettings().then((s) => !!s.stockEntryOpen));

/**
 * A menu screen is shown when the person holds its tag (and, for a temporary screen, while it is switched on).
 * 2026-11-23: there is one Stores menu — it no longer waits for the company's stores_v2 answer (a slow or failed answer
 * showed the menu from before the desk).
 */
export function useScreenVisible(): (screen: NavScreen) => boolean {
  const isPermitted = useIsPermitted();
  const standIn = useMdStandIn();
  const entryOpen = useStockEntryOpen();
  return useCallback((screen: NavScreen) => (isPermitted(screen.permission) || (standIn && STAND_IN_SCREENS.has(screen.key)))
    && (screen.when !== 'stockEntry' || entryOpen) && screen.desk !== 'v1', [isPermitted, standIn, entryOpen]);
}
