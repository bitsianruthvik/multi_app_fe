import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@core/components/ErrorBoundary';
import {
  Box,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  IconButton,
  Tooltip,
  Typography,
  Chip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import Sidebar from '@core/components/Sidebar';
import { buildAdminNavItems } from '../../config/adminNav';
import { useAuth } from '@core/contexts/AuthContext';

function AdminAvatarSlot() {
  const { user, logout } = useAuth();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const getInitials = (name: string) =>
    name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

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
      onClick={(e) => setAnchorEl(e.currentTarget)}
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
        {user?.name ? getInitials(user.name) : 'A'}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <Typography sx={{ fontSize: '13px', fontWeight: 600, color: 'var(--sidebar-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user?.name || 'Admin'}
        </Typography>
        <Chip
          label="Administrator"
          size="small"
          sx={{ height: '16px', fontSize: '10px', bgcolor: 'var(--color-brand-700)', color: 'var(--sidebar-active-text)', borderRadius: '4px', mt: '2px' }}
        />
      </Box>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
      >
        <MenuItem disabled><Typography variant="body2">Profile</Typography></MenuItem>
        <MenuItem disabled><Typography variant="body2">Settings</Typography></MenuItem>
        <Divider />
        <MenuItem onClick={() => { setAnchorEl(null); logout(); }} sx={{ color: 'error.main' }}>
          Sign Out
        </MenuItem>
      </Menu>
    </Box>
  );
}

function HelpButton() {
  return (
    <Box sx={{ p: 1, display: 'flex', justifyContent: 'center' }}>
      <Tooltip title="Help & About" placement="right">
        <IconButton
          size="small"
          sx={{ color: 'var(--sidebar-text-muted)', '&:hover': { color: 'var(--sidebar-text)' } }}
          onClick={() => console.log('Help clicked')}
        >
          <HelpOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export default function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useMediaQuery(useTheme().breakpoints.down('md'));

  // Build nav items from current path slugs
  const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean);
  const companySlug = parts[0] || 'company';
  const appSlug = parts[1] || 'app';
  const adminNavItems = buildAdminNavItems(companySlug, appSlug);

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: 'background.default' }}>
      <Sidebar
        items={adminNavItems}
        avatarSlot={<AdminAvatarSlot />}
        footerSlot={<HelpButton />}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
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
        <Box component="main" sx={{ flex: 1, overflow: 'auto', p: 3, maxWidth: '1200px' }}>
          <ErrorBoundary level="page"><Outlet /></ErrorBoundary>
        </Box>
      </Box>
    </Box>
  );
}
