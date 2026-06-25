import React from 'react';
import CategoryRoundedIcon        from '@mui/icons-material/CategoryRounded';
import FactoryRoundedIcon         from '@mui/icons-material/FactoryRounded';
import Inventory2RoundedIcon      from '@mui/icons-material/Inventory2Rounded';
import LocalShippingRoundedIcon   from '@mui/icons-material/LocalShippingRounded';
import ReceiptLongRoundedIcon     from '@mui/icons-material/ReceiptLongRounded';
import HandshakeRoundedIcon       from '@mui/icons-material/HandshakeRounded';
import RouteRoundedIcon           from '@mui/icons-material/RouteRounded';
import AutoGraphRoundedIcon       from '@mui/icons-material/AutoGraphRounded';
import CalendarViewWeekRoundedIcon from '@mui/icons-material/CalendarViewWeekRounded';
import AccountTreeRoundedIcon      from '@mui/icons-material/AccountTreeRounded';
import type { NavItem } from '@core/components/Sidebar';

function buildUserNav(company: string, app: string): NavItem[] {
  const base = `/${company}/${app}`;
  return [
    { label: 'Plants',              icon: React.createElement(FactoryRoundedIcon),       to: `${base}/plants`,        end: false, permission: 'fab_erp_resources_view' },
    { label: 'Item Catalog',        icon: React.createElement(Inventory2RoundedIcon),    to: `${base}/item-catalog`,  end: false, permission: 'fab_erp_items_meta_view' },
    { label: 'Resource Catalog',    icon: React.createElement(CategoryRoundedIcon),      to: `${base}/resource-types`, end: false, permission: 'fab_erp_resources_view' },
    { label: 'Orders',              icon: React.createElement(ReceiptLongRoundedIcon),      to: `${base}/orders`,        end: false, permission: 'fab_erp_projects_view' },
    { label: 'Planning Workbench',  icon: React.createElement(AccountTreeRoundedIcon),       to: `${base}/workbench`,    end: false, permission: 'fab_erp_projects_manage' },
    { label: 'Scheduler',           icon: React.createElement(CalendarViewWeekRoundedIcon), to: `${base}/scheduler`,    end: false, permission: 'fab_erp_scheduler_view' },
    { label: 'MRP',                 icon: React.createElement(AutoGraphRoundedIcon),        to: `${base}/mrp`,           end: false, permission: 'fab_erp_planning_view' },
    { label: 'Suppliers',           icon: React.createElement(HandshakeRoundedIcon),        to: `${base}/suppliers`,     end: false, permission: 'fab_erp_grn_view' },
    { label: 'Goods Receipt (GRN)', icon: React.createElement(LocalShippingRoundedIcon), to: `${base}/grn`,            end: false, permission: 'fab_erp_grn_view' },
    { label: 'Routing Plans',       icon: React.createElement(RouteRoundedIcon),          to: `${base}/routing-plans`,  end: false, permission: 'fab_erp_resources_view' },
  ];
}

export const fabErpApp = {
  slug: 'fab_erp',
  buildUserNav,
  Dashboard: null,
  routes: [],
};
