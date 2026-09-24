import { useState, type ReactNode } from 'react';
import { Avatar, Box, Divider, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import { NavLink, useNavigate } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import { useAuth } from '@core/contexts/AuthContext';
import { useThemePreference } from '@core/contexts/ThemeContext';
import { useCommandPalette } from '../commandPaletteContext';
import { useCompanySlug } from '../hooks/useCompanySlug';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { appPath, type Can, type NavSection } from '../types';

/**
 * Row 1 of the top navigation (DESIGN_SYSTEM.md §3): the app mark, the primary
 * sections, and the chrome that actually does something — search, create,
 * theme, notifications, account.
 *
 * It replaces a left rail. A rail costs ~240px of width permanently, which the
 * widest screens in a data app — a Gantt, a swimlane canvas, a board, a
 * fifteen-column table — all want back. The sections live in one thin row
 * instead, and depth moves to row 2 and the ⌘K palette.
 *
 * The search field is deliberately a visible input rather than a magnifier
 * icon: it is the clearest available signal that the app has global search, and
 * it is where a new user looks first. It opens the palette on click.
 */

export interface QuickCreate {
  label: string;
  /** Route under /:company/:appSlug/, e.g. `orders?new=1`. */
  path: string;
  permission?: string;
}

export interface BrandMark {
  /** The word next to the mark, e.g. "HRMS". */
  label: string;
  /** One or two characters in the accent tile. Defaults to the label's initial. */
  initial?: string;
}

function initials(name?: string, email?: string) {
  const src = name || email || '?';
  return src
    .split(/[\s.@]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function TopNav({
  appSlug,
  sections,
  brand,
  activeSection,
  onOpenMobileNav,
  isMobile,
  can,
  quickCreate = [],
  homePath = 'home',
  notificationsPath,
  accountItems,
  onSignOut,
}: {
  appSlug: string;
  sections: NavSection[];
  brand: BrandMark;
  /** The active section's key, or null off-nav. */
  activeSection: string | null;
  onOpenMobileNav: () => void;
  isMobile: boolean;
  can?: Can;
  quickCreate?: QuickCreate[];
  homePath?: string;
  /**
   * Where the bell goes. Omit it and no bell is drawn — a bell that never
   * lights up is furniture.
   */
  notificationsPath?: string;
  /** Extra account-menu entries, above Sign out. */
  accountItems?: ReactNode;
  /** Defaults to AuthContext's logout, then the app's login route. */
  onSignOut?: () => void;
}) {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { resolvedMode, setPreference } = useThemePreference();
  const permitted = useIsPermitted();
  const isPermitted = can ?? permitted;
  const palette = useCommandPalette();

  const [createAnchor, setCreateAnchor] = useState<null | HTMLElement>(null);
  const [avatarAnchor, setAvatarAnchor] = useState<null | HTMLElement>(null);

  const go = (path: string) => {
    setCreateAnchor(null);
    setAvatarAnchor(null);
    navigate(appPath(company, appSlug, path));
  };

  // A section shows only if the user can reach at least one screen in it.
  const visible = sections.filter((s) => s.screens.some((sc) => isPermitted(sc.permission)));
  const creatable = quickCreate.filter((a) => isPermitted(a.permission));

  const signOut = () => {
    setAvatarAnchor(null);
    if (onSignOut) onSignOut();
    else {
      logout();
      navigate(`/${company}/${appSlug}/login`);
    }
  };

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
          to={appPath(company, appSlug, homePath)}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.875,
            px: 1,
            mr: 0.5,
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <Box
            aria-hidden
            sx={{
              width: 22,
              height: 22,
              borderRadius: '6px',
              flexShrink: 0,
              background: 'var(--c-primary-600)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-ui)',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {brand.initial ?? brand.label.charAt(0).toUpperCase()}
          </Box>
          <Box
            sx={{
              fontFamily: 'var(--font-ui)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--c-text)',
            }}
          >
            {brand.label}
          </Box>
        </Box>
      )}

      {/* ── Primary sections ── */}
      {!isMobile && (
        <Box
          component="nav"
          aria-label="Main"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            minWidth: 0,
            overflowX: 'auto',
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {visible.map((section) => {
            const active = activeSection === section.key;
            // Land on the first screen the user can actually reach.
            const first = section.screens.find((s) => isPermitted(s.permission));
            if (!first) return null;
            return (
              <Box
                key={section.key}
                component={NavLink}
                to={appPath(company, appSlug, first.path)}
                aria-current={active ? 'page' : undefined}
                sx={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 52,
                  px: 1.5,
                  textDecoration: 'none',
                  flexShrink: 0,
                  fontFamily: 'var(--font-ui)',
                  fontSize: 13.5,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  color: active ? 'var(--c-text)' : 'var(--c-text-2)',
                  transition: 'color var(--t-fast) var(--ease)',
                  '&:hover': { color: 'var(--c-text)' },
                  // The underline sits on the bar's own bottom border, so the
                  // active section reads as connected to the row below it.
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    left: 8,
                    right: 8,
                    bottom: -1,
                    height: 2,
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
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          height: 32,
          px: 1.25,
          width: { xs: 32, sm: 200, md: 260 },
          flexShrink: 0,
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--c-border)',
          background: 'var(--c-surface)',
          color: 'var(--c-text-3)',
          cursor: 'pointer',
          fontFamily: 'var(--font-ui)',
          fontSize: 13,
          transition: 'border-color var(--t-fast) var(--ease)',
          '&:hover': { borderColor: 'var(--c-primary-200)' },
        }}
      >
        <SearchRounded sx={{ fontSize: 17, flexShrink: 0 }} aria-hidden />
        <Box sx={{ display: { xs: 'none', sm: 'block' }, flex: 1, textAlign: 'left' }}>Search</Box>
        <Box
          sx={{
            display: { xs: 'none', sm: 'block' },
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            border: '1px solid var(--c-border)',
            borderRadius: '4px',
            px: 0.5,
            color: 'var(--c-text-3)',
            flexShrink: 0,
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
                background: 'var(--c-primary-600)',
                color: '#fff',
                borderRadius: 'var(--r-sm)',
                flexShrink: 0,
                '&:hover': { background: 'var(--c-primary-700)' },
              }}
            >
              <AddRounded fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu anchorEl={createAnchor} open={!!createAnchor} onClose={() => setCreateAnchor(null)}>
            {creatable.map((a) => (
              <MenuItem key={a.path} onClick={() => go(a.path)} sx={{ fontSize: 13.5 }}>
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
          aria-label={
            resolvedMode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
          }
          sx={{ color: 'var(--c-text-2)', flexShrink: 0 }}
        >
          {resolvedMode === 'dark' ? (
            <LightModeRounded fontSize="small" />
          ) : (
            <DarkModeRounded fontSize="small" />
          )}
        </IconButton>
      </Tooltip>

      {notificationsPath && (
        <Tooltip title="Notifications">
          <IconButton
            size="small"
            onClick={() => go(notificationsPath)}
            aria-label="Notifications"
            sx={{ color: 'var(--c-text-2)', flexShrink: 0 }}
          >
            <NotificationsNoneRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      <Box
        component="button"
        type="button"
        onClick={(e) => setAvatarAnchor(e.currentTarget)}
        aria-label="Account menu"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          p: 0,
          ml: 0.25,
          borderRadius: '50%',
          flexShrink: 0,
        }}
      >
        <Avatar
          sx={{ width: 30, height: 30, bgcolor: 'var(--c-primary-600)', fontSize: 12, fontWeight: 600 }}
        >
          {initials(user?.name, user?.email)}
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
            {user?.email || user?.role || '—'}
          </Typography>
        </Box>
        <Divider />
        {accountItems}
        <MenuItem
          onClick={() => {
            setAvatarAnchor(null);
            navigate(`/${company}/apps`);
          }}
          sx={{ fontSize: 13.5 }}
        >
          Switch app
        </MenuItem>
        <Divider />
        <MenuItem onClick={signOut} sx={{ fontSize: 13.5, color: 'var(--c-danger-600)' }}>
          Sign out
        </MenuItem>
      </Menu>
    </Box>
  );
}
