import { useState } from 'react';
import { Box, Divider, IconButton, Menu, MenuItem, Tooltip, Avatar, Typography } from '@mui/material';
import { NavLink, useNavigate } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import { useAuth } from '@core/contexts/AuthContext';
import { useThemePreference } from '@core/contexts/ThemeContext';
import { NAV_SECTIONS, type NavSection } from '../../navMeta';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { useCommandPalette } from '../commandPaletteContext';
import { useCompanySlug } from '../../hooks/useCompanySlug';

/**
 * Row 1 of the top navigation — the five primary sections plus the chrome that
 * actually does something (FAB_ERP_UX_ELEVATION_PLAN.md §2.1, §4.1).
 *
 * Replaces the 21-item left rail. The rail cost 240px of width permanently,
 * which the wide screens in this app — the Critical Chain gantt, Task Engine
 * swimlanes, Machine Timeline, the 5-column order board and 15 wide tables —
 * all wanted back.
 *
 * The search field is deliberately a visible input rather than a magnifier
 * icon: it is the clearest available signal that the app has global search, and
 * it is where a new user looks first. It opens the ⌘K palette on focus.
 */

const QUICK_CREATE: { label: string; permission: string; slug: string }[] = [
  { label: 'New order', permission: 'fab_erp_projects_manage', slug: 'orders?new=1' },
  { label: 'New item', permission: 'fab_erp_items_meta_manage', slug: 'item-catalog?new=1' },
  { label: 'Receive goods', permission: 'fab_erp_grn_manage', slug: 'grn?new=1' },
  { label: 'New customer', permission: 'fab_erp_projects_manage', slug: 'customers?new=1' },
];

function initials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

export function FabErpTopNav({
  activeSection,
  onOpenMobileNav,
  isMobile,
}: {
  activeSection: NavSection | null;
  onOpenMobileNav: () => void;
  isMobile: boolean;
}) {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { resolvedMode, setPreference } = useThemePreference();
  const isPermitted = useIsPermitted();
  const palette = useCommandPalette();

  const [createAnchor, setCreateAnchor] = useState<null | HTMLElement>(null);
  const [avatarAnchor, setAvatarAnchor] = useState<null | HTMLElement>(null);

  const go = (slug: string) => {
    setCreateAnchor(null);
    setAvatarAnchor(null);
    navigate(`/${company}/fab_erp/${slug}`);
  };

  // A section is shown only if the user can reach at least one screen in it.
  const sections = NAV_SECTIONS.filter((s) => s.items.some((i) => isPermitted(i.permission)));
  const creatable = QUICK_CREATE.filter((a) => isPermitted(a.permission));

  return (
    <Box
      component="header"
      className="glass"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        height: 52,
        px: 1.5,
        borderBottom: '1px solid var(--glass-border)',
        position: 'sticky',
        top: 0,
        zIndex: 'var(--z-topnav)',
        flexShrink: 0,
      }}
    >
      {isMobile ? (
        <IconButton size="small" onClick={onOpenMobileNav} aria-label="Open navigation">
          <MenuRounded />
        </IconButton>
      ) : (
        <Box
          component={NavLink}
          to={`/${company}/fab_erp/home`}
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.875, px: 1, mr: 0.5,
            textDecoration: 'none', flexShrink: 0,
          }}
        >
          <Box
            sx={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
              background: 'var(--c-primary-600)', color: '#fff',
              display: 'grid', placeItems: 'center',
              fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
            }}
            aria-hidden
          >
            F
          </Box>
          <Box sx={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>
            Fab
          </Box>
        </Box>
      )}

      {/* ── Primary sections ── */}
      {!isMobile && (
        <Box component="nav" aria-label="Main" sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          {sections.map((section) => {
            const active = activeSection?.id === section.id;
            // Land on the first screen the user can actually reach.
            const first = section.items.find((i) => isPermitted(i.permission));
            if (!first) return null;
            const to = `/${company}/fab_erp/${first.slug}`;
            return (
              <Box
                key={section.id}
                component={NavLink}
                to={to}
                aria-current={active ? 'page' : undefined}
                sx={{
                  position: 'relative',
                  display: 'inline-flex', alignItems: 'center',
                  height: 52, px: 1.5,
                  textDecoration: 'none',
                  fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: 500,
                  whiteSpace: 'nowrap',
                  color: active ? 'var(--c-text)' : 'var(--c-text-2)',
                  transition: 'color var(--t-fast) var(--ease)',
                  '&:hover': { color: 'var(--c-text)' },
                  // Underline sits on the bar's own bottom border, so the active
                  // section reads as connected to the contextual row below it.
                  '&::after': {
                    content: '""',
                    position: 'absolute', left: 8, right: 8, bottom: -1, height: 2,
                    borderRadius: '2px 2px 0 0',
                    background: active ? 'var(--c-primary-500)' : 'transparent',
                  },
                }}
              >
                {section.label}
              </Box>
            );
          })}
        </Box>
      )}

      <Box sx={{ flex: 1, minWidth: 8 }} />

      {/* ── Search: opens the ⌘K palette ── */}
      <Box
        component="button"
        type="button"
        onClick={palette.open}
        aria-label="Search or run a command"
        sx={{
          display: 'flex', alignItems: 'center', gap: 1,
          height: 32, px: 1.25,
          width: { xs: 32, sm: 200, md: 260 },
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--c-border)',
          background: 'var(--c-surface)',
          color: 'var(--c-text-3)',
          cursor: 'pointer',
          fontFamily: 'var(--font-ui)', fontSize: 13,
          transition: 'border-color var(--t-fast) var(--ease)',
          '&:hover': { borderColor: 'var(--c-primary-200)' },
        }}
      >
        <SearchRounded sx={{ fontSize: 17, flexShrink: 0 }} aria-hidden />
        <Box sx={{ display: { xs: 'none', sm: 'block' }, flex: 1, textAlign: 'left' }}>Search</Box>
        <Box
          sx={{
            display: { xs: 'none', sm: 'block' },
            fontFamily: 'var(--font-mono)', fontSize: 11,
            border: '1px solid var(--c-border)', borderRadius: 4,
            px: 0.5, color: 'var(--c-text-3)', flexShrink: 0,
          }}
        >
          ⌘K
        </Box>
      </Box>

      {creatable.length > 0 && (
        <>
          <Tooltip title="Create">
            <IconButton
              size="small"
              onClick={(e) => setCreateAnchor(e.currentTarget)}
              aria-label="Create"
              sx={{
                background: 'var(--c-primary-600)', color: '#fff', borderRadius: 'var(--r-sm)',
                '&:hover': { background: 'var(--c-primary-700)' },
              }}
            >
              <AddRounded fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu anchorEl={createAnchor} open={!!createAnchor} onClose={() => setCreateAnchor(null)}>
            {creatable.map((a) => (
              <MenuItem key={a.slug} onClick={() => go(a.slug)} sx={{ fontSize: 13.5 }}>
                {a.label}
              </MenuItem>
            ))}
          </Menu>
        </>
      )}

      <Tooltip title={resolvedMode === 'dark' ? 'Switch to light' : 'Switch to dark'}>
        <IconButton
          size="small"
          onClick={() => setPreference(resolvedMode === 'dark' ? 'light' : 'dark')}
          aria-label={resolvedMode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          sx={{ color: 'var(--c-text-2)' }}
        >
          {resolvedMode === 'dark' ? <LightModeRounded fontSize="small" /> : <DarkModeRounded fontSize="small" />}
        </IconButton>
      </Tooltip>

      <Tooltip title="Exceptions">
        <IconButton
          size="small"
          onClick={() => go('home')}
          aria-label="Exceptions"
          sx={{ color: 'var(--c-text-2)' }}
        >
          <NotificationsNoneRounded fontSize="small" />
        </IconButton>
      </Tooltip>

      <Box
        component="button"
        type="button"
        onClick={(e) => setAvatarAnchor(e.currentTarget)}
        aria-label="Account menu"
        sx={{
          display: 'inline-flex', alignItems: 'center', border: 'none',
          background: 'transparent', cursor: 'pointer', p: 0, ml: 0.25,
          borderRadius: '50%',
        }}
      >
        <Avatar
          sx={{
            width: 30, height: 30, bgcolor: 'var(--c-primary-600)',
            fontSize: 12, fontWeight: 600,
          }}
        >
          {initials(user?.name)}
        </Avatar>
      </Box>
      <Menu
        anchorEl={avatarAnchor}
        open={!!avatarAnchor}
        onClose={() => setAvatarAnchor(null)}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      >
        <Box sx={{ px: 2, py: 1, minWidth: 180 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)' }}>
            {user?.name || 'User'}
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
            {user?.role || '—'}
          </Typography>
        </Box>
        <Divider />
        <MenuItem onClick={() => navigate(`/${company}/fab_erp/profile`)} sx={{ fontSize: 13.5 }}>
          Profile
        </MenuItem>
        <MenuItem onClick={() => navigate(`/${company}/fab_erp/settings`)} sx={{ fontSize: 13.5 }}>
          Settings
        </MenuItem>
        <Divider />
        <MenuItem onClick={logout} sx={{ fontSize: 13.5, color: 'var(--c-danger-600)' }}>
          Sign out
        </MenuItem>
      </Menu>
    </Box>
  );
}
