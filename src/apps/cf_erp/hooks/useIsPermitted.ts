import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@core/contexts/AuthContext';

type Permission = { feature_tag?: string } | string;

/**
 * A permission predicate for filtering lists (nav, palette) — the same
 * resolution as @core/hooks/usePermission: the app's own uiPermissions first,
 * then the legacy flat array. With no signed-in user (only outside the app's
 * ProtectedRoute) nothing is hidden.
 */
export function useIsPermitted(): (featureTag?: string) => boolean {
  const { user } = useAuth();
  const location = useLocation();
  const appSlug = location.pathname.split('/').filter(Boolean)[1] ?? '';
  return useCallback((featureTag?: string) => {
    if (!featureTag || !user) return true;
    const appRole = user.appRoles?.[appSlug];
    if (appRole?.uiPermissions) return (appRole.uiPermissions as string[]).includes(featureTag);
    const perms = (user.uiPermissions as Permission[] | undefined) ?? [];
    return perms.some((p) => (typeof p === 'string' ? p === featureTag : p?.feature_tag === featureTag));
  }, [user, appSlug]);
}
