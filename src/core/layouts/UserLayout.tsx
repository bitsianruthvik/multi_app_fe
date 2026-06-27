import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  IconButton,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import Sidebar from '@core/components/Sidebar';
import { ErrorBoundary } from '@core/components/ErrorBoundary';
import { buildUserNavItems } from '../../config/userNav';
import { useAuth } from '@core/contexts/AuthContext';

// fab_erp section slug → human label (drives the top-bar breadcrumb).
const FAB_ERP_SECTIONS: Record<string, string> = {
  home: 'Home',
  orders: 'Orders',
  workbench: 'Planning Workbench',
  mrp: 'MRP',
  scheduler: 'Scheduler',
  grn: 'Goods Receipt',
  'grn-detail': 'Goods Receipt',
  plants: 'Plants',
  'item-catalog': 'Item Catalog',
  'item-batches': 'Item Batches',
  'item-metrics': 'Item Metrics',
  constants: 'Constants',
  'resource-types': 'Resource Catalog',
  'routing-plans': 'BOMs & Routings',
  'shift-calendars': 'Shift Calendars',
  suppliers: 'Suppliers',
  customers: 'Customers',
  'codegen-settings': 'Code Generation',
};

/** Top-bar breadcrumb for fab_erp: Fab ERP / Section [/ detail]. */
function FabErpBreadcrumb({ parts }: { parts: string[] }) {
  // parts = [company, 'fab_erp', section, maybeId, ...]
  const section = parts[2];
  const detail = parts[3];
  const crumbs: string[] = ['Fab ERP'];
  if (section) crumbs.push(FAB_ERP_SECTIONS[section] ?? section.replace(/-/g, ' '));
  if (detail) crumbs.push(detail);
  const lastIsDetail = !!detail;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
            {i > 0 && <ChevronRightRounded sx={{ fontSize: 16, color: 'var(--c-text-3)', flexShrink: 0 }} />}
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: isLast ? 600 : 500,
                color: isLast ? 'var(--c-text)' : 'var(--c-text-2)',
                fontFamily: isLast && lastIsDetail ? 'var(--font-mono)' : 'var(--font-ui)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {c}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// AvatarMenu — shown in the sidebar avatarSlot
// ---------------------------------------------------------------------------
function AvatarMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Derive company/app from the current URL
  const parts = location.pathname.split('/').filter(Boolean);
  const company = parts[0] ?? '';
  const app = parts[1] ?? '';

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);
  const handleLogout = () => {
    handleClose();
    logout();
  };
  const handleNavigate = (path: string) => {
    handleClose();
    navigate(path);
  };

  return (
    <Box
      sx={{
        p: '12px 16px',
        borderBottom: '1px solid var(--sidebar-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        cursor: 'pointer',
        '&:hover': { bgcolor: 'var(--sidebar-hover-bg)' },
      }}
      onClick={handleOpen}
    >
      <Avatar
        sx={{
          width: 36,
          height: 36,
          bgcolor: 'var(--color-brand-500)',
          fontSize: '13px',
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {user?.name ? getInitials(user.name) : '?'}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--sidebar-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {user?.name || 'User'}
        </Typography>
        <Typography sx={{ fontSize: '11px', color: 'var(--sidebar-text-muted)' }}>
          {user?.role || 'Sales Rep'}
        </Typography>
      </Box>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
      >
        <MenuItem onClick={() => handleNavigate(`/${company}/${app}/profile`)}>
          <Typography variant="body2">Profile</Typography>
        </MenuItem>
        <MenuItem onClick={() => handleNavigate(`/${company}/${app}/settings`)}>
          <Typography variant="body2">Settings</Typography>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
          Sign Out
        </MenuItem>
      </Menu>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// HelpButton — shown in the sidebar footerSlot
// ---------------------------------------------------------------------------
function HelpButton() {
  return (
    <Box sx={{ p: 1, display: 'flex', justifyContent: 'center' }}>
      <Tooltip title="Help & About" placement="right">
        <IconButton
          size="small"
          sx={{
            color: 'var(--sidebar-text-muted)',
            '&:hover': { color: 'var(--sidebar-text)' },
          }}
          onClick={() => console.log('Help clicked')}
        >
          <HelpOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// UserLayout
// ---------------------------------------------------------------------------
export default function UserLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean);
  const company = parts[0] ?? '';
  const app = parts[1] ?? '';
  const isFabErp = app === 'fab_erp';
  const { user } = useAuth();
  const navItems = buildUserNavItems(company, app, user ?? undefined);

  return (
    <Box
      sx={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        bgcolor: 'background.default',
      }}
    >
      <Sidebar
        items={navItems}
        avatarSlot={<AvatarMenu />}
        footerSlot={<HelpButton />}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {/* Top header bar — glass for fab_erp (the one allowed glass surface),
            solid paper for other apps. The `glass` class + --glass-* vars only
            exist under [data-app="fab_erp"]; the bgcolor fallback covers others. */}
        <Box
          component="header"
          className={isFabErp ? 'glass' : undefined}
          sx={{
            height: '56px',
            display: 'flex',
            alignItems: 'center',
            px: 2,
            gap: 1.5,
            bgcolor: isFabErp ? 'transparent' : 'background.paper',
            borderBottom: '1px solid',
            borderColor: isFabErp ? 'var(--glass-border)' : 'divider',
            flexShrink: 0,
            zIndex: 10,
          }}
        >
          {isMobile && (
            <IconButton onClick={() => setMobileOpen(true)} size="small">
              <MenuIcon />
            </IconButton>
          )}
          {isFabErp ? <FabErpBreadcrumb parts={parts} /> : null}
          <Box sx={{ flex: 1 }} />
          {isFabErp && !isMobile && (
            <Box
              component="button"
              type="button"
              onClick={() => document.dispatchEvent(new CustomEvent('fab-erp-open-palette'))}
              aria-label="Open command palette"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                height: 34,
                pl: 1.25,
                pr: 0.75,
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--c-border)',
                background: 'var(--c-surface)',
                color: 'var(--c-text-3)',
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
                fontSize: 13,
                transition: 'all var(--t-fast) var(--ease)',
                '&:hover': { borderColor: 'var(--c-primary-200)', color: 'var(--c-text-2)' },
              }}
            >
              <SearchRounded sx={{ fontSize: 16 }} />
              <Box component="span" sx={{ mr: 2 }}>Search…</Box>
              <Box
                component="kbd"
                sx={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  px: 0.75,
                  py: 0.125,
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--c-surface-2)',
                  border: '1px solid var(--c-border)',
                  color: 'var(--c-text-3)',
                }}
              >
                ⌘K
              </Box>
            </Box>
          )}
          <Tooltip title="Notifications">
            <IconButton size="small" sx={isFabErp ? { color: 'var(--c-text-2)' } : undefined}>
              <NotificationsNoneIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Main content */}
        <Box
          component="main"
          sx={{ flex: 1, overflow: 'auto', p: isFabErp ? 0 : 3, bgcolor: isFabErp ? 'var(--c-canvas)' : undefined }}
        >
          {isFabErp ? (
            <Box sx={{ p: 3, minHeight: '100%' }}>
              <ErrorBoundary level="page">{children}</ErrorBoundary>
            </Box>
          ) : (
            <ErrorBoundary level="page">{children}</ErrorBoundary>
          )}
        </Box>
      </Box>
    </Box>
  );
}
