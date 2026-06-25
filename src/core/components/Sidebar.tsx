import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Drawer,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { usePermission } from '@core/hooks/usePermission';

export interface NavItem {
  label: string;
  icon: React.ReactNode;
  to: string;
  permission?: string;
  end?: boolean;
}

interface SidebarProps {
  items: NavItem[];
  avatarSlot?: React.ReactNode;
  footerSlot?: React.ReactNode;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function NavItemWrapper({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const permitted = usePermission(item.permission ?? '');
  if (item.permission && !permitted) return null;

  const navLink = (
    <NavLink
      to={item.to}
      end={item.end}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: collapsed ? '12px 0' : '10px 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: '8px',
        textDecoration: 'none',
        color: isActive ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
        background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
        width: '100%',
        transition: 'all 140ms ease',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      })}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        if (!el.style.background.includes('var(--sidebar-active-bg)')) {
          el.style.background = 'var(--sidebar-hover-bg)';
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        if (!el.style.background.includes('var(--sidebar-active-bg)')) {
          el.style.background = 'transparent';
        }
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex', color: 'inherit' }}>{item.icon}</span>
      {!collapsed && (
        <span
          style={{
            fontSize: '14px',
            fontWeight: 500,
            opacity: collapsed ? 0 : 1,
            transition: 'opacity 140ms ease',
          }}
        >
          {item.label}
        </span>
      )}
    </NavLink>
  );

  if (collapsed) {
    return (
      <Tooltip title={item.label} placement="right">
        <span style={{ display: 'block' }}>{navLink}</span>
      </Tooltip>
    );
  }

  return navLink;
}

function SidebarContent({
  items,
  collapsed,
  setCollapsed,
  avatarSlot,
  footerSlot,
}: {
  items: NavItem[];
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  avatarSlot?: React.ReactNode;
  footerSlot?: React.ReactNode;
}) {
  return (
    <>
      {avatarSlot}
      <nav
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {items.map((item) => (
          <NavItemWrapper key={item.to} item={item} collapsed={collapsed} />
        ))}
        <button
          onClick={() => {
            const next = !collapsed;
            setCollapsed(next);
            localStorage.setItem('sidebar:collapsed', String(next));
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            width: '100%',
            padding: '10px 12px',
            background: 'transparent',
            border: 'none',
            borderTop: '1px solid var(--sidebar-border)',
            color: 'var(--sidebar-text-muted)',
            cursor: 'pointer',
            fontSize: '13px',
            marginTop: '8px',
          }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRightIcon fontSize="small" />
          ) : (
            <>
              <ChevronLeftIcon fontSize="small" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </nav>
      {footerSlot}
    </>
  );
}

export default function Sidebar({
  items,
  avatarSlot,
  footerSlot,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('sidebar:collapsed');
      return stored === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem('sidebar:collapsed', String(collapsed));
  }, [collapsed]);

  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        sx={{
          '& .MuiDrawer-paper': {
            backgroundColor: 'var(--sidebar-bg)',
            border: 'none',
            width: 'var(--sidebar-w-expanded)',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <SidebarContent
          items={items}
          collapsed={false}
          setCollapsed={setCollapsed}
          avatarSlot={avatarSlot}
          footerSlot={footerSlot}
        />
      </Drawer>
    );
  }

  return (
    <aside
      style={{
        width: collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w-expanded)',
        transition: 'width var(--sidebar-transition)',
        background: 'var(--sidebar-bg)',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        position: 'sticky',
        top: 0,
        zIndex: 'var(--z-sidebar)' as React.CSSProperties['zIndex'],
        borderRight: '1px solid var(--sidebar-border)',
      }}
    >
      <SidebarContent
        items={items}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        avatarSlot={avatarSlot}
        footerSlot={footerSlot}
      />
    </aside>
  );
}
