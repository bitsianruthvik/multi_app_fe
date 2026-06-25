import React, { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import type { NavItem } from '@core/components/Sidebar';
import { buildPlatformAdminItems } from '@apps/audio_intelligence/index';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';

export function buildAdminNav(company: string, app: string): NavItem[] {
  return buildPlatformAdminItems(company, app);
}

export function buildUserNav(company: string, app: string, user?: { role?: string }): NavItem[] {
  const items: NavItem[] = [
    { label: 'Home', icon: React.createElement(HomeRoundedIcon), to: `/${company}/${app}/dashboard`, end: true },
  ];
  if (user?.role === 'salesmanager') {
    items.push({
      label: 'Manager Dashboard',
      icon: React.createElement(DashboardCustomizeIcon),
      to: `/${company}/${app}/manager/dashboard`,
    });
  }
  return items;
}

// Reuse the audio_intelligence user dashboard — same actions → brands → recordings flow.
const SCDashboard = lazy(() => import('@apps/audio_intelligence/pages/user/Dashboard'));

export const salesControlApp = {
  slug: 'sales_control',
  buildAdminNav,
  buildUserNav,
  Dashboard: SCDashboard,
  routes: [] as RouteObject[],
};
