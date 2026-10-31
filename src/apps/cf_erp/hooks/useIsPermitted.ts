import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@core/contexts/AuthContext';

type Permission = { feature_tag?: string } | string;

const hasToken = () => { try { return !!localStorage.getItem('token'); } catch { return false; } };

/**
 * A permission predicate for filtering lists (nav, palette) — the same
 * resolution as @core/hooks/usePermission: the app's own uiPermissions first,
 * then the legacy flat array. With no signed-in user (only outside the app's
 * ProtectedRoute, and no token) nothing is hidden. Tags joined by "|" pass when any one of
 * them does (a screen two roles use — Plate changes: the MD or the buyer); inside one of those, tags joined by
 * "&" pass when all of them do (navMeta bothOf: Management › Dashboard = production view with an approval tag).
 */
export function useIsPermitted(): (featureTag?: string) => boolean {
  const { user } = useAuth();
  const location = useLocation();
  const appSlug = location.pathname.split('/').filter(Boolean)[1] ?? '';
  return useCallback((featureTag?: string): boolean => {
    if (!featureTag) return true;
    // A reloaded page holds only the token until /verify answers: hide gated entries meanwhile, rather than flash every
    // section of the app at a person whose role sees a few (2026-10-31).
    if (!user) return !hasToken();
    const appRole = user.appRoles?.[appSlug];
    const perms = (user.uiPermissions as Permission[] | undefined) ?? [];
    const one = (tag: string) => (appRole?.uiPermissions
      ? (appRole.uiPermissions as string[]).includes(tag)
      : perms.some((p) => (typeof p === 'string' ? p === tag : p?.feature_tag === tag)));
    return featureTag.split('|').some((alt) => alt.split('&').every((t) => one(t.trim())));
  }, [user, appSlug]);
}
