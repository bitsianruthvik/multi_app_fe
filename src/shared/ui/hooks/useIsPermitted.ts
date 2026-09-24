import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@core/contexts/AuthContext';
import type { Can } from '../types';

type Permission = { feature_tag?: string } | string;

/**
 * A permission *predicate*, not a permission hook.
 *
 * `usePermission(tag)` is a hook, so it cannot be called inside a loop — which
 * is exactly what the nav, the command palette and a setup hub need to do (they
 * filter a list of N screens by N different tags). This resolves the permission
 * set once and hands back a plain function.
 *
 * Resolution is intentionally identical to `@core/hooks/usePermission`: the
 * app's own `appRoles[slug].uiPermissions` first, then the legacy flat array.
 * If that hook's rules change, change them here too. An ungated screen
 * (`permission` undefined) is always visible.
 */
export function useIsPermitted(): Can {
  const { user } = useAuth();
  const location = useLocation();
  const appSlug = location.pathname.split('/').filter(Boolean)[1] ?? '';

  return useCallback(
    (featureTag?: string) => {
      if (!featureTag) return true;

      const appRole = user?.appRoles?.[appSlug];
      if (appRole?.uiPermissions) {
        return (appRole.uiPermissions as string[]).includes(featureTag);
      }

      const perms = (user?.uiPermissions as Permission[] | undefined) ?? [];
      if (!perms.length) return false;
      return perms.some((p) =>
        typeof p === 'string' ? p === featureTag : p?.feature_tag === featureTag,
      );
    },
    [user, appSlug],
  );
}
