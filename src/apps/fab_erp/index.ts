import React from 'react';
import HomeRoundedIcon            from '@mui/icons-material/HomeRounded';
import CategoryRoundedIcon        from '@mui/icons-material/CategoryRounded';
import FactoryRoundedIcon         from '@mui/icons-material/FactoryRounded';
import Inventory2RoundedIcon      from '@mui/icons-material/Inventory2Rounded';
import LocalShippingRoundedIcon   from '@mui/icons-material/LocalShippingRounded';
import ReceiptLongRoundedIcon     from '@mui/icons-material/ReceiptLongRounded';
import HandshakeRoundedIcon       from '@mui/icons-material/HandshakeRounded';
import PeopleAltRoundedIcon       from '@mui/icons-material/PeopleAltRounded';
import TuneRoundedIcon            from '@mui/icons-material/TuneRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import CallSplitRounded           from '@mui/icons-material/CallSplitRounded';
import ListAltRoundedIcon         from '@mui/icons-material/ListAltRounded';
import PlaylistPlayRoundedIcon    from '@mui/icons-material/PlaylistPlayRounded';
import AccountTreeRoundedIcon     from '@mui/icons-material/AccountTreeRounded';
import BuildCircleRoundedIcon     from '@mui/icons-material/BuildCircleRounded';
import ViewTimelineRoundedIcon    from '@mui/icons-material/ViewTimelineRounded';
import FactCheckRoundedIcon       from '@mui/icons-material/FactCheckRounded';
import WarehouseRoundedIcon       from '@mui/icons-material/WarehouseRounded';
import InsightsRounded            from '@mui/icons-material/InsightsRounded';
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
    { label: 'Task Queue',          icon: React.createElement(PlaylistPlayRoundedIcon),     to: `${base}/task-queue`,  end: false, permission: 'fab_erp_taskqueue_view', section: OPERATE },
    { label: 'Task Engine',         icon: React.createElement(AccountTreeRoundedIcon),      to: `${base}/task-engine`, end: false, permission: 'fab_erp_taskengine_view', section: OPERATE },
    { label: 'Machine Board',       icon: React.createElement(BuildCircleRoundedIcon),      to: `${base}/machine-board`, end: false, permission: 'fab_erp_machine_state_manage', section: OPERATE },
    { label: 'Machine Timeline',    icon: React.createElement(ViewTimelineRoundedIcon),     to: `${base}/machine-timeline`, end: false, permission: 'fab_erp_time_backfill', section: OPERATE },
    { label: 'Reconciliation',      icon: React.createElement(FactCheckRoundedIcon),        to: `${base}/reconciliation`, end: false, permission: 'fab_erp_machine_state_manage', section: OPERATE },
    { label: 'Analytics',           icon: React.createElement(InsightsRounded),             to: `${base}/analytics`,      end: false, permission: 'fab_erp_shopfloor_analytics_view', section: OPERATE },
    { label: 'Goods Receipt (GRN)', icon: React.createElement(LocalShippingRoundedIcon),    to: `${base}/grn`,          end: false, permission: 'fab_erp_grn_view',        section: OPERATE },
    { label: 'Item Batches',        icon: React.createElement(Inventory2RoundedIcon),       to: `${base}/item-batches`, end: false, permission: 'fab_erp_inventory_view',  section: OPERATE },

    // ── Configure: the factory model (plants, items, BOMs, routings, resources) ──
    { label: 'Plants',              icon: React.createElement(FactoryRoundedIcon),          to: `${base}/plants`,         end: false, permission: 'fab_erp_resources_view',  section: CONFIGURE },
    { label: 'Item Catalog',        icon: React.createElement(Inventory2RoundedIcon),       to: `${base}/item-catalog`,   end: false, permission: 'fab_erp_items_meta_view', section: CONFIGURE },
    { label: 'Resource Catalog',    icon: React.createElement(CategoryRoundedIcon),         to: `${base}/resource-types`, end: false, permission: 'fab_erp_resources_view',  section: CONFIGURE },
    { label: 'BOM Templates',       icon: React.createElement(ListAltRoundedIcon),          to: `${base}/bom-templates`,  end: false, permission: 'fab_erp_bomtemplate_view', section: CONFIGURE },
    { label: 'Operations',          icon: React.createElement(PrecisionManufacturingRounded), to: `${base}/operations`,     end: false, permission: 'fab_erp_operations_view', section: CONFIGURE },
    { label: 'Operation Flows',     icon: React.createElement(CallSplitRounded),            to: `${base}/operation-flows`, end: false, permission: 'fab_erp_flows_view',    section: CONFIGURE },
    { label: 'Suppliers',           icon: React.createElement(HandshakeRoundedIcon),        to: `${base}/suppliers`,      end: false, permission: 'fab_erp_grn_view',        section: CONFIGURE },
    { label: 'Customers',           icon: React.createElement(PeopleAltRoundedIcon),        to: `${base}/customers`,      end: false, permission: 'fab_erp_projects_view',   section: CONFIGURE },
    { label: 'Code Generation',     icon: React.createElement(TuneRoundedIcon),             to: `${base}/codegen-settings`, end: false, permission: 'fab_erp_items_meta_view', section: CONFIGURE },
    { label: 'Buffer Config',       icon: React.createElement(WarehouseRoundedIcon),        to: `${base}/buffer-config`,  end: false, permission: 'fab_erp_buffer_config',   section: CONFIGURE },
  ];
}

export const fabErpApp = {
  slug: 'fab_erp',
  buildUserNav,
  Dashboard: null,
  routes: [],
};
