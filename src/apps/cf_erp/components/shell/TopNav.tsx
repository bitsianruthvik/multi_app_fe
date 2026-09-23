import { useState } from 'react';
import { Avatar, Box, Divider, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import { NavLink, useNavigate } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';

import MenuRounded from '@mui/icons-material/MenuRounded';
import { useAuth } from '@core/contexts/AuthContext';
import { useThemePreference } from '@core/contexts/ThemeContext';
import { SECTIONS, appPath } from '../../navMeta';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { useCompanySlug } from '../../hooks/useLoad';
import { useCommandPalette } from '../commandPaletteContext';

/**
 * Row 1 of the top navigation — fab_erp's FabErpTopNav for cf_erp: the primary
 * sections with an underline on the active one, a visible search field that
 * opens the ⌘K palette, Create, theme and the account menu. There is no bell:
 * the app has no notifications, and a bell that never lights up is furniture —
 * "what needs you" is Home, which the logo and the first section both reach.
 * The one glass surface on the page (§5.3).
 */
const QUICK_CREATE: { label: string; permission: string; slug: string }[] = [
  { label: 'New order', permission: 'cf_erp_orders_manage', slug: 'orders?new=1' },
  { label: 'New item', permission: 'cf_erp_catalog_manage', slug: 'items?new=1' },
  { label: 'Receive stock', permission: 'cf_erp_inventory_manage', slug: 'stock?new=receipt' },
  { label: 'New purchase order', permission: 'cf_erp_inventory_manage', slug: 'purchase-orders?new=1' },
  { label: 'New machine', permission: 'cf_erp_production_manage', slug: 'machines?new=1' },
  { label: 'New customer', permission: 'cf_erp_parties_manage', slug: 'customers?new=1' },
];

function initials(name?: string, email?: string) {
  const src = name || email || '?';
  return src.split(/[\s.@]+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

export function TopNav({ activeSection, onOpenMobileNav, isMobile }: { activeSection: string | null; onOpenMobileNav: () => void; isMobile: boolean }) {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { resolvedMode, setPreference } = useThemePreference();
  const isPermitted = useIsPermitted();
  const palette = useCommandPalette();
  const [createAnchor, setCreateAnchor] = useState<null | HTMLElement>(null);
  const [avatarAnchor, setAvatarAnchor] = useState<null | HTMLElement>(null);
  const go = (slug: string) => { setCreateAnchor(null); setAvatarAnchor(null); navigate(appPath(company, slug)); };
  const sections = SECTIONS.filter((s) => s.screens.some((sc) => isPermitted(sc.permission)));
  const creatable = QUICK_CREATE.filter((a) => isPermitted(a.permission));

  return (
    <Box component="header" className="glass" sx={{
      display: 'flex', alignItems: 'center', gap: 1, height: 52, px: 1.5, borderBottom: '1px solid var(--glass-border)',
      position: 'sticky', top: 0, zIndex: 'var(--z-topnav)', flexShrink: 0,
    }}>
      {isMobile ? (
        <IconButton size="small" onClick={onOpenMobileNav} aria-label="Open navigation"><MenuRounded /></IconButton>
      ) : (
        <Box component={NavLink} to={appPath(company, 'home')} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.875, px: 1, mr: 0.5, textDecoration: 'none', flexShrink: 0 }}>
          <Box aria-hidden sx={{ width: 22, height: 22, borderRadius: '6px', flexShrink: 0, background: 'var(--c-primary-600)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600 }}>C</Box>
          <Box sx={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>CF ERP</Box>
        </Box>
      )}

      {!isMobile && (
        <Box component="nav" aria-label="Main" sx={{ display: 'flex', alignItems: 'center', gap: 0.25, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
          {sections.map((section) => {
            const active = activeSection === section.key;
            const first = section.screens.find((s) => isPermitted(s.permission));
            if (!first) return null;
            return (
              <Box key={section.key} component={NavLink} to={appPath(company, first.path)} aria-current={active ? 'page' : undefined} sx={{
                position: 'relative', display: 'inline-flex', alignItems: 'center', height: 52, px: 1.5, textDecoration: 'none', flexShrink: 0,
                fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap',
                color: active ? 'var(--c-text)' : 'var(--c-text-2)', transition: 'color var(--t-fast) var(--ease)', '&:hover': { color: 'var(--c-text)' },
                '&::after': { content: '""', position: 'absolute', left: 8, right: 8, bottom: -1, height: 2, borderRadius: '2px 2px 0 0', background: active ? 'var(--c-primary-500)' : 'transparent' },
              }}>
                {section.label}
              </Box>
            );
          })}
        </Box>
      )}

      <Box sx={{ flex: 1, minWidth: 8 }} />

      <Box component="button" type="button" onClick={palette.open} aria-label="Search or run a command" sx={{
        display: 'flex', alignItems: 'center', gap: 1, height: 32, px: 1.25, width: { xs: 32, sm: 200, md: 260 }, flexShrink: 0,
        borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text-3)', cursor: 'pointer',
        fontFamily: 'var(--font-ui)', fontSize: 13, transition: 'border-color var(--t-fast) var(--ease)', '&:hover': { borderColor: 'var(--c-primary-200)' },
      }}>
        <SearchRounded sx={{ fontSize: 17, flexShrink: 0 }} aria-hidden />
        <Box sx={{ display: { xs: 'none', sm: 'block' }, flex: 1, textAlign: 'left' }}>Search</Box>
        <Box sx={{ display: { xs: 'none', sm: 'block' }, fontFamily: 'var(--font-mono)', fontSize: 11, border: '1px solid var(--c-border)', borderRadius: '4px', px: 0.5, color: 'var(--c-text-3)', flexShrink: 0 }}>⌘K</Box>
      </Box>

      {creatable.length > 0 && (
        <>
          <Tooltip title="Create">
            <IconButton size="small" onClick={(e) => setCreateAnchor(e.currentTarget)} aria-label="Create" sx={{
              background: 'var(--c-primary-600)', color: '#fff', borderRadius: 'var(--r-sm)', flexShrink: 0, '&:hover': { background: 'var(--c-primary-700)' },
            }}>
              <AddRounded fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu anchorEl={createAnchor} open={!!createAnchor} onClose={() => setCreateAnchor(null)}>
            {creatable.map((a) => (
              <MenuItem key={a.slug} onClick={() => go(a.slug)} sx={{ fontSize: 13.5 }}>{a.label}</MenuItem>
            ))}
          </Menu>
        </>
      )}

      <Tooltip title={resolvedMode === 'dark' ? 'Switch to light' : 'Switch to dark'}>
        <IconButton size="small" onClick={() => setPreference(resolvedMode === 'dark' ? 'light' : 'dark')}
          aria-label={resolvedMode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} sx={{ color: 'var(--c-text-2)', flexShrink: 0 }}>
          {resolvedMode === 'dark' ? <LightModeRounded fontSize="small" /> : <DarkModeRounded fontSize="small" />}
        </IconButton>
      </Tooltip>


      <Box component="button" type="button" onClick={(e) => setAvatarAnchor(e.currentTarget)} aria-label="Account menu" sx={{
        display: 'inline-flex', alignItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer', p: 0, ml: 0.25, borderRadius: '50%', flexShrink: 0,
      }}>
        <Avatar sx={{ width: 30, height: 30, bgcolor: 'var(--c-primary-600)', fontSize: 12, fontWeight: 600 }}>{initials(user?.name, user?.email)}</Avatar>
      </Box>
      <Menu anchorEl={avatarAnchor} open={!!avatarAnchor} onClose={() => setAvatarAnchor(null)}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }} transformOrigin={{ horizontal: 'right', vertical: 'top' }}>
        <Box sx={{ px: 2, py: 1, minWidth: 180 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)' }}>{user?.name || 'User'}</Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{user?.email || user?.role || '—'}</Typography>
        </Box>
        <Divider />
        <MenuItem onClick={() => { setAvatarAnchor(null); navigate(`/${company}/apps`); }} sx={{ fontSize: 13.5 }}>Switch app</MenuItem>
        <Divider />
        <MenuItem onClick={() => { setAvatarAnchor(null); logout(); navigate(`/${company}/cf_erp/login`); }} sx={{ fontSize: 13.5, color: 'var(--c-danger-600)' }}>Sign out</MenuItem>
      </Menu>
    </Box>
  );
}
