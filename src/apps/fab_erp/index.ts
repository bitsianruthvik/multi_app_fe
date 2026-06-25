import React from 'react';
import HomeRoundedIcon            from '@mui/icons-material/HomeRounded';
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
  const OPERATE = 'Operate';
  const CONFIGURE = 'Configure';
  return [
    // ── Home: cockpit landing (no permission gate — every role sees their own queues) ──
    { label: 'Home',                icon: React.createElement(HomeRoundedIcon),             to: `${base}/home`,         end: false },

    // ── Operate: daily transactional flow (orders → plan → schedule → receive) ──
    { label: 'Orders',              icon: React.createElement(ReceiptLongRoundedIcon),      to: `${base}/orders`,       end: false, permission: 'fab_erp_projects_view',   section: OPERATE },
    { label: 'Planning Workbench',  icon: React.createElement(AccountTreeRoundedIcon),      to: `${base}/workbench`,    end: false, permission: 'fab_erp_projects_manage', section: OPERATE },
    { label: 'MRP',                 icon: React.createElement(AutoGraphRoundedIcon),        to: `${base}/mrp`,          end: false, permission: 'fab_erp_planning_view',   section: OPERATE },
    { label: 'Scheduler',           icon: React.createElement(CalendarViewWeekRoundedIcon), to: `${base}/scheduler`,    end: false, permission: 'fab_erp_scheduler_view',  section: OPERATE },
    { label: 'Goods Receipt (GRN)', icon: React.createElement(LocalShippingRoundedIcon),    to: `${base}/grn`,          end: false, permission: 'fab_erp_grn_view',        section: OPERATE },

    // ── Configure: the factory model (plants, items, BOMs, routings, resources) ──
    { label: 'Plants',              icon: React.createElement(FactoryRoundedIcon),          to: `${base}/plants`,         end: false, permission: 'fab_erp_resources_view',  section: CONFIGURE },
    { label: 'Item Catalog',        icon: React.createElement(Inventory2RoundedIcon),       to: `${base}/item-catalog`,   end: false, permission: 'fab_erp_items_meta_view', section: CONFIGURE },
    { label: 'Resource Catalog',    icon: React.createElement(CategoryRoundedIcon),         to: `${base}/resource-types`, end: false, permission: 'fab_erp_resources_view',  section: CONFIGURE },
    { label: 'Routing Plans',       icon: React.createElement(RouteRoundedIcon),            to: `${base}/routing-plans`,  end: false, permission: 'fab_erp_resources_view',  section: CONFIGURE },
    { label: 'Suppliers',           icon: React.createElement(HandshakeRoundedIcon),        to: `${base}/suppliers`,      end: false, permission: 'fab_erp_grn_view',        section: CONFIGURE },
  ];
}

export const fabErpApp = {
  slug: 'fab_erp',
  buildUserNav,
  Dashboard: null,
  routes: [],
};
