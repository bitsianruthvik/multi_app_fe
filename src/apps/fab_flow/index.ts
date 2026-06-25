import React from 'react';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import FactoryIcon           from '@mui/icons-material/Factory';
import type { NavItem } from '@core/components/Sidebar';

function buildUserNav(company: string, app: string): NavItem[] {
  return [
    { label: 'Plans',    icon: React.createElement(AssignmentRoundedIcon), to: `/${company}/${app}/plans`,    end: false },
    { label: 'Capacity', icon: React.createElement(FactoryIcon),           to: `/${company}/${app}/capacity`, end: false },
  ];
}

export const fabFlowApp = {
  slug: 'fab_flow',
  buildUserNav,
  Dashboard: null,
  routes: [],
};
