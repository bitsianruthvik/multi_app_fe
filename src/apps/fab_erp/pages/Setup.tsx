import { useMemo, type ReactNode } from 'react';
import { Box } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import CallSplitRounded from '@mui/icons-material/CallSplitRounded';
import FactoryRounded from '@mui/icons-material/FactoryRounded';
import CategoryRounded from '@mui/icons-material/CategoryRounded';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import StackedBarChartRounded from '@mui/icons-material/StackedBarChartRounded';
import WarehouseRounded from '@mui/icons-material/WarehouseRounded';
import StraightenRounded from '@mui/icons-material/StraightenRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';

import { PageHeader, Surface } from '../components';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNavCounts } from '../hooks/useNavCounts';

/**
 * Setup readiness hub (DESIGN_SYSTEM.md §4.8 archetype).
 *
 * The Configure world used to be 11 flat rail items, which told a new user
 * nothing about what they were for or which ones still needed filling in. This
 * turns it into one question — "is my factory model ready to run?" — answered
 * by a card per area with its current count.
 *
 * Counts come from the same cached /nav-counts call the nav badges use, so
 * opening this page costs no extra round trip.
 */

interface SetupCard {
  slug: string;
  label: string;
  blurb: string;
  icon: ReactNode;
  permission?: string;
  countKey?: string;
  unit?: string;
}

/** Grouped so the page teaches the dependency order: things → how → where. */
const GROUPS: { title: string; hint: string; cards: SetupCard[] }[] = [
  {
    title: 'What you make',
    hint: 'The parts and their structure. MRP explodes these.',
    cards: [
      { slug: 'item-catalog', label: 'Items', blurb: 'Parts, raw materials and finished goods, with their taxonomy.', icon: <Inventory2Rounded />, permission: 'fab_erp_items_meta_view', countKey: 'items', unit: 'items' },
      { slug: 'item-catalog', label: 'BOMs', blurb: 'What goes into what, and in what quantity. Built per item, inside the catalog.', icon: <AccountTreeRounded />, permission: 'fab_erp_items_meta_view', countKey: 'boms', unit: 'BOMs' },
      { slug: 'item-metrics', label: 'Metrics', blurb: 'Dimensions and attributes that formulas read.', icon: <StraightenRounded />, permission: 'fab_erp_items_meta_view' },
    ],
  },
  {
    title: 'How you make it',
    hint: 'Operations and the sequence they run in. The scheduler reads these.',
    cards: [
      { slug: 'operations', label: 'Operations', blurb: 'Individual process steps and their time formulas.', icon: <PrecisionManufacturingRounded />, permission: 'fab_erp_operations_view', countKey: 'operations', unit: 'operations' },
      { slug: 'operation-flows', label: 'Flows', blurb: 'Ordered sequences of operations applied to a part.', icon: <CallSplitRounded />, permission: 'fab_erp_flows_view', countKey: 'flows', unit: 'flows' },
      { slug: 'progress-templates', label: 'Progress stages', blurb: 'Stage templates that roll task progress up to a project view.', icon: <StackedBarChartRounded />, permission: 'fab_erp_taskengine_view' },
    ],
  },
  {
    title: 'Where you make it',
    hint: 'Plants, machines and working time — the capacity the scheduler places work into.',
    cards: [
      { slug: 'plants', label: 'Plants', blurb: 'Sites and their stock locations.', icon: <FactoryRounded />, permission: 'fab_erp_resources_view' },
      { slug: 'resource-types', label: 'Resources', blurb: 'Machines and labour, grouped by resource type.', icon: <CategoryRounded />, permission: 'fab_erp_resources_view', countKey: 'machines', unit: 'resources' },
      { slug: 'shift-calendars', label: 'Calendars', blurb: 'Shifts, working days and holidays.', icon: <CalendarMonthRounded />, permission: 'fab_erp_calendars_view' },
      { slug: 'buffer-config', label: 'Buffers', blurb: 'Physical WIP stock areas between operations.', icon: <WarehouseRounded />, permission: 'fab_erp_buffer_config' },
    ],
  },
  {
    title: 'Who you deal with, and how things are named',
    hint: '',
    cards: [
      // The group was named for these two and then shipped without them —
      // Customers only ever appeared under Orders and Suppliers only in the
      // Setup sub-nav, so the readiness hub asked you to set up a factory with
      // nobody to build for and nobody to buy from.
      { slug: 'customers', label: 'Customers', blurb: 'Who the orders are for. Codes are issued automatically.', icon: <GroupsRounded />, permission: 'fab_erp_projects_view', countKey: 'customers', unit: 'customers' },
      { slug: 'suppliers', label: 'Suppliers', blurb: 'Mills and stockists you raise purchase orders against.', icon: <LocalShippingRounded />, permission: 'fab_erp_inventory_view', countKey: 'suppliers', unit: 'suppliers' },
      { slug: 'codegen-settings', label: 'Code generation', blurb: 'Prefixes and sequences for auto-generated codes.', icon: <TuneRounded />, permission: 'fab_erp_items_meta_view' },
    ],
  },
];

export default function Setup() {
  const navigate = useNavigate();
  const { company } = useParams<{ company: string }>();
  const isPermitted = useIsPermitted();
  const { counts } = useNavCounts();

  const groups = useMemo(
    () =>
      GROUPS.map((g) => ({ ...g, cards: g.cards.filter((c) => isPermitted(c.permission)) }))
        .filter((g) => g.cards.length > 0),
    [isPermitted],
  );

  return (
    <Box>
      <PageHeader
        title="Setup"
        subtitle="The factory model that orders, MRP and the scheduler all run on."
      />

      {groups.length === 0 ? (
        <Surface e={1} sx={{ p: 4, textAlign: 'center', color: 'var(--c-text-2)', fontSize: 14 }}>
          You don’t have access to any setup areas. Ask an administrator if you need to
          change the factory model.
        </Surface>
      ) : (
        groups.map((group) => (
          <Box key={group.title} sx={{ mb: 4 }}>
            <Box
              sx={{
                fontSize: 11, fontWeight: 600, letterSpacing: '.06em',
                textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.5,
              }}
            >
              {group.title}
            </Box>
            {group.hint && (
              <Box sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5 }}>{group.hint}</Box>
            )}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 1.5,
              }}
            >
              {group.cards.map((card) => {
                const count = card.countKey ? counts[card.countKey] : undefined;
                return (
                  <Surface
                    key={card.slug}
                    e={1}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/${company}/fab_erp/${card.slug}`)}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/${company}/fab_erp/${card.slug}`);
                      }
                    }}
                    sx={{
                      p: 2,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                      transition: 'box-shadow var(--t-fast) var(--ease), transform var(--t-fast) var(--ease)',
                      '&:hover': { boxShadow: 'var(--e-hover)', transform: 'translateY(-1px)' },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                      <Box
                        sx={{
                          width: 34, height: 34, flexShrink: 0,
                          borderRadius: 'var(--r-sm)',
                          display: 'grid', placeItems: 'center',
                          background: 'var(--c-primary-50)', color: 'var(--c-primary-600)',
                          '& svg': { fontSize: 19 },
                        }}
                      >
                        {card.icon}
                      </Box>
                      <Box sx={{ fontSize: 14.5, fontWeight: 600, color: 'var(--c-text)', flex: 1 }}>
                        {card.label}
                      </Box>
                      {count !== undefined && (
                        <Box
                          sx={{
                            fontFamily: 'var(--font-mono)',
                            fontVariantNumeric: 'tabular-nums',
                            fontSize: 17, fontWeight: 600,
                            color: count > 0 ? 'var(--c-text)' : 'var(--c-text-3)',
                          }}
                        >
                          {count}
                        </Box>
                      )}
                    </Box>
                    <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5 }}>
                      {card.blurb}
                    </Box>
                    {count === 0 && (
                      <Box sx={{ fontSize: 12, color: 'var(--c-warning-800)', fontWeight: 500 }}>
                        Nothing defined yet
                      </Box>
                    )}
                  </Surface>
                );
              })}
            </Box>
          </Box>
        ))
      )}
    </Box>
  );
}
