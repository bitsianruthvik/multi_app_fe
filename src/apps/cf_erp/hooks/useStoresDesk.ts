import { useCallback, useEffect, useState } from 'react';
import { getDeskSettings } from '../api/storesDesk';
import { getMdMe } from '../api/md';
import type { NavScreen } from '../navMeta';
import { useIsPermitted } from './useIsPermitted';

/**
 * Is this company on the five-screen Stores desk (cf_company_settings.stores_v2, init.sql §111)? Read once a session
 * and shared; `false` until it answers and when it cannot be read, so a company that is not switched over — or an
 * older backend — keeps the menu it had.
 */
let known: boolean | null = null;
let asking: Promise<boolean> | null = null;
const ask = () => {
  if (known != null) return Promise.resolve(known);
  asking ??= getDeskSettings().then((s) => !!s.storesV2, () => false).then((v) => { known = v; return v; });
  return asking;
};

export function useStoresV2(): boolean {
  const [v2, setV2] = useState<boolean>(known ?? false);
  useEffect(() => { let live = true; void ask().then((v) => { if (live) setV2(v); }); return () => { live = false; }; }, []);
  return v2;
}

/**
 * §113: is this person standing in for the MD right now (settings md_standin_user + md_standin_on)? Read once a
 * session; the backend lends them the MD's permissions for each request, and the menu shows them the MD's two screens.
 */
let standInKnown: boolean | null = null;
let standInAsking: Promise<boolean> | null = null;
const askStandIn = () => {
  if (standInKnown != null) return Promise.resolve(standInKnown);
  standInAsking ??= getMdMe().then((m) => !!m.standIn, () => false).then((v) => { standInKnown = v; return v; });
  return standInAsking;
};
export function useMdStandIn(): boolean {
  const [on, setOn] = useState<boolean>(standInKnown ?? false);
  useEffect(() => { let live = true; void askStandIn().then((v) => { if (live) setOn(v); }); return () => { live = false; }; }, []);
  return on;
}
const STAND_IN_SCREENS = new Set(['md-dashboard', 'approvals']);

/**
 * 2026-11-23: is the stock entry week open (setting stock_entry_until)? Read once a session, like the switches above;
 * false until it answers and when it cannot be read, so the temporary screen only shows when the server says so.
 */
let entryKnown: boolean | null = null;
let entryAsking: Promise<boolean> | null = null;
const askEntry = () => {
  if (entryKnown != null) return Promise.resolve(entryKnown);
  entryAsking ??= getDeskSettings().then((s) => !!s.stockEntryOpen, () => false).then((v) => { entryKnown = v; return v; });
  return entryAsking;
};
export function useStockEntryOpen(): boolean {
  const [on, setOn] = useState<boolean>(entryKnown ?? false);
  useEffect(() => { let live = true; void askEntry().then((v) => { if (live) setOn(v); }); return () => { live = false; }; }, []);
  return on;
}

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
