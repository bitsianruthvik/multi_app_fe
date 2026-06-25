import React, { lazy } from 'react';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import ExtensionRoundedIcon from '@mui/icons-material/ExtensionRounded';
import VpnKeyRoundedIcon from '@mui/icons-material/VpnKeyRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import CategoryIcon from '@mui/icons-material/Category';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import type { RouteObject } from 'react-router-dom';
import type { NavItem } from '@core/components/Sidebar';

// Platform admin items (shared by all apps)
export function buildPlatformAdminItems(company: string, app: string): NavItem[] {
  const base = `/${company}/${app}/admin/dashboard`;
  return [
    { label: 'Admin Overview', icon: React.createElement(DashboardRoundedIcon), to: base, end: true },
    { label: 'Team Members',   icon: React.createElement(GroupRoundedIcon),     to: `${base}/add-user` },
    { label: 'Feature Catalog',icon: React.createElement(ExtensionRoundedIcon), to: `${base}/add-feature` },
    { label: 'Permissions',    icon: React.createElement(VpnKeyRoundedIcon),    to: `${base}/capabilities-add` },
    { label: 'Role Mapping',   icon: React.createElement(AccountTreeRoundedIcon), to: `${base}/roles-mapping` },
    { label: 'Documents',      icon: React.createElement(FolderRoundedIcon),    to: `${base}/company-documents` },
    { label: 'Error Logs',     icon: React.createElement(BugReportRoundedIcon), to: `${base}/error-logs` },
  ];
}

export function buildAdminNav(company: string, app: string): NavItem[] {
  return [
    ...buildPlatformAdminItems(company, app),
    { label: 'Actions', icon: React.createElement(CategoryIcon),
      to: `/${company}/${app}/admin/dashboard/actions` },
  ];
}

export function buildUserNav(company: string, app: string): NavItem[] {
  return [
    { label: 'Home', icon: React.createElement(HomeRoundedIcon),
      to: `/${company}/${app}/dashboard`, end: true },
  ];
}

const AIDashboard = lazy(() => import('./pages/user/Dashboard'));

export const audioIntelligenceApp = {
  slug: 'audio_intelligence',
  buildAdminNav,
  buildUserNav,
  Dashboard: AIDashboard,
  routes: [] as RouteObject[],
};
