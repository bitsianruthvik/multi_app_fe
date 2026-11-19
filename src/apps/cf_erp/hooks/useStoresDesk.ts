import { useCallback, useEffect, useState } from 'react';
import { getDeskSettings } from '../api/storesDesk';
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

/** A menu screen is shown when the person holds its tag AND it belongs to the Stores menu this company uses. */
export function useScreenVisible(): (screen: NavScreen) => boolean {
  const isPermitted = useIsPermitted();
  const v2 = useStoresV2();
  return useCallback((screen: NavScreen) => isPermitted(screen.permission) && (!screen.desk || (screen.desk === 'v2') === v2), [isPermitted, v2]);
}
