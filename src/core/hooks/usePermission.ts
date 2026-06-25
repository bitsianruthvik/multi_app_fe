import { useAuth } from "@core/contexts/AuthContext";
import { useLocation } from "react-router-dom";

type Permission = { feature_tag?: string } | string;

export function usePermission(featureTag: string): boolean {
  const { user } = useAuth();
  const location = useLocation();
  const parts = location.pathname.split("/").filter(Boolean);
  const appSlug = parts[1];

  // Per-app permissions (Wave 3): check appRoles keyed by app slug first
  const appRole = user?.appRoles?.[appSlug];
  if (appRole?.uiPermissions) {
    return (appRole.uiPermissions as string[]).includes(featureTag);
  }

  // Legacy fallback — flat uiPermissions array on user
  const perms = (user?.uiPermissions as Permission[] | undefined) ?? [];
  if (!perms.length) return false;
  return perms.some((p) =>
    typeof p === "string" ? p === featureTag : p?.feature_tag === featureTag,
  );
}

export function useHasAnyPermission(tags: string[]): boolean {
  const { user } = useAuth();
  const location = useLocation();
  const parts = location.pathname.split("/").filter(Boolean);
  const appSlug = parts[1];

  // Per-app permissions (Wave 3)
  const appRole = user?.appRoles?.[appSlug];
  if (appRole?.uiPermissions) {
    const set = new Set<string>(appRole.uiPermissions);
    return tags.some((t) => set.has(t));
  }

  // Legacy fallback
  const perms = (user?.uiPermissions as Permission[] | undefined) ?? [];
  if (!perms.length) return false;
  const set = new Set(
    perms.map((p) => (typeof p === "string" ? p : p?.feature_tag ?? "")),
  );
  return tags.some((t) => set.has(t));
}
