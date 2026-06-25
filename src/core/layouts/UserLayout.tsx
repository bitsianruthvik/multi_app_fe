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
import Sidebar from '@core/components/Sidebar';
import { ErrorBoundary } from '@core/components/ErrorBoundary';
import { buildUserNavItems } from '../../config/userNav';
import { useAuth } from '@core/contexts/AuthContext';

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
        {/* Top header bar */}
        <Box
          component="header"
          sx={{
            height: '56px',
            display: 'flex',
            alignItems: 'center',
            px: 2,
            gap: 1,
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
            flexShrink: 0,
            zIndex: 10,
          }}
        >
          {isMobile && (
            <IconButton onClick={() => setMobileOpen(true)} size="small">
              <MenuIcon />
            </IconButton>
          )}
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Notifications">
            <IconButton size="small">
              <NotificationsNoneIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Main content */}
        <Box component="main" sx={{ flex: 1, overflow: 'auto', p: 3 }}>
          <ErrorBoundary level="page">{children}</ErrorBoundary>
        </Box>
      </Box>
    </Box>
  );
}
