import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@core/contexts/AuthContext';

type Permission = { feature_tag?: string } | string;

/**
 * A permission predicate for filtering lists (nav, palette) — the same
 * resolution as @core/hooks/usePermission: the app's own uiPermissions first,
 * then the legacy flat array. With no signed-in user (only outside the app's
 * ProtectedRoute) nothing is hidden. Tags joined by "|" pass when any one of
 * them does (a screen two roles use — Plate changes: the MD or the buyer).
 */
export function useIsPermitted(): (featureTag?: string) => boolean {
  const { user } = useAuth();
  const location = useLocation();
  const appSlug = location.pathname.split('/').filter(Boolean)[1] ?? '';
  return useCallback((featureTag?: string): boolean => {
    if (!featureTag || !user) return true;
    const appRole = user.appRoles?.[appSlug];
    const perms = (user.uiPermissions as Permission[] | undefined) ?? [];
    const one = (tag: string) => (appRole?.uiPermissions
      ? (appRole.uiPermissions as string[]).includes(tag)
      : perms.some((p) => (typeof p === 'string' ? p === tag : p?.feature_tag === tag)));
    return featureTag.split('|').some((t) => one(t.trim()));
  }, [user, appSlug]);
}
