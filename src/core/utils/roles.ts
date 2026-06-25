const ADMIN_ROLE_NAMES = ['admin', 'administrator', 'superadmin', 'owner'];

export function isAdminRole(roleName: string | null | undefined): boolean {
  if (!roleName) return false;
  const lower = roleName.toLowerCase();
  return ADMIN_ROLE_NAMES.some(r => lower.includes(r));
}
