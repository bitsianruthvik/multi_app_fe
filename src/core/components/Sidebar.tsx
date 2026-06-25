import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Drawer,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { usePermission } from '@core/hooks/usePermission';
import { useAuth } from '@core/contexts/AuthContext';

export interface NavItem {
  label: string;
  icon: React.ReactNode;
  to: string;
  permission?: string;
  end?: boolean;
  /** Optional group label (e.g. "Operate", "Configure"). Items sharing a section
   *  are rendered together under one caps-label divider. Items with no section
   *  render ungrouped, exactly as before — fully backward-compatible. */
  section?: string;
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

/** Groups consecutive items sharing the same `section` so an empty section
 *  (every item inside it hidden by permission) can collapse as a whole. */
function groupBySection(items: NavItem[]): { section?: string; items: NavItem[] }[] {
  const groups: { section?: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.section === item.section) {
      last.items.push(item);
    } else {
      groups.push({ section: item.section, items: [item] });
    }
  }
  return groups;
}

/** Plain (non-hook) re-implementation of usePermission's visibility logic, so
 *  SidebarContent can decide "does this section have anything to show" without
 *  calling a hook per item (which would violate rules-of-hooks inside a loop).
 *  Pulls the same two hook results (`user`, current app slug) once at the top
 *  of the component instead. */
function isPermitted(user: ReturnType<typeof useAuth>['user'], appSlug: string, featureTag?: string): boolean {
  if (!featureTag) return true;
  const appRole = user?.appRoles?.[appSlug];
  if (appRole?.uiPermissions) {
    return appRole.uiPermissions.includes(featureTag);
  }
  const perms = user?.uiPermissions ?? [];
  if (!perms.length) return false;
  return perms.some((p: { feature_tag?: string } | string) =>
    typeof p === 'string' ? p === featureTag : p?.feature_tag === featureTag,
  );
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
  const { user } = useAuth();
  const location = useLocation();
  const appSlug = location.pathname.split('/').filter(Boolean)[1] ?? '';

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
        {groupBySection(items).map((group, gi) => {
          const hasVisibleItem = group.items.some((item) => isPermitted(user, appSlug, item.permission));
          if (!hasVisibleItem) return null;
          return (
          <React.Fragment key={gi}>
            {group.section && !collapsed && (
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--sidebar-text-muted)',
                  padding: gi === 0 ? '4px 12px 6px' : '16px 12px 6px',
                }}
              >
                {group.section}
              </div>
            )}
            {group.items.map((item) => (
              <NavItemWrapper key={item.to} item={item} collapsed={collapsed} />
            ))}
          </React.Fragment>
          );
        })}
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
