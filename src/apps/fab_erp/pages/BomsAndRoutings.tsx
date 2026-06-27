/**
 * BomsAndRoutings — Configure landing for the BOM + Routing Plan model.
 * Tabs: BOMs (flat list across all items) | Routing Plans (existing list).
 * Both support search + category/group facet filters.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Stack, Tab, Tabs, Typography } from '@mui/material';
import StarRounded from '@mui/icons-material/StarRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';

import { fabGet } from '../api/client';
import type { FabRoutingPlan } from '../types';
import InfoTooltip, { type InfoContent } from '@shared/components/InfoTooltip';
import {
  PageHeader, FilterBar, FacetChip, EntityList, EntityRow, Mono, StatusBadge,
  EmptyState, ListSkeleton, type SortableField,
} from '../components';
import { statusFamily } from '../statusMap';

interface BomListRow {
  id: number;
  bom_name: string;
  is_default: number;
  base_qty: number;
  base_unit: string | null;
  catalog_item_id: number;
  catalog_item_name: string;
  catalog_item_code: string;
  category_name: string | null;
  group_name: string | null;
  item_count: number;
}

const INFO_BOMS: InfoContent = [
  {
    heading: 'What it is',
    items: [
      'Every Bill of Materials defined across the item catalog, in one place.',
      'A BOM lists the components/co-products that go into producing one item.',
    ],
  },
  {
    heading: 'How to use',
    items: [
      'Click a row to open that item’s BOM editor.',
      'Filter by category/group, or search by BOM name, item name, or item code.',
      'The star marks the default BOM used when none is explicitly selected.',
    ],
  },
];

const BOM_SORT_FIELDS: SortableField<BomListRow>[] = [
  { key: 'bom_name', label: 'BOM name' },
  { key: 'catalog_item_name', label: 'Item' },
  { key: 'category_name', label: 'Category' },
  { key: 'item_count', label: 'Item count' },
];

const ROUTING_PLAN_SORT_FIELDS: SortableField<FabRoutingPlan>[] = [
  { key: 'name', label: 'Name' },
  { key: 'catalogItemName', label: 'Item' },
  { key: 'bomName', label: 'BOM' },
  { key: 'status', label: 'Status' },
  { key: 'updatedAt', label: 'Updated' },
];

export default function BomsAndRoutings() {
  const { company } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);

  const [boms, setBoms] = useState<BomListRow[]>([]);
  const [plans, setPlans] = useState<FabRoutingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [bomsRes, plansRes] = await Promise.all([
        fabGet<{ data: BomListRow[] }>('routing/boms'),
        fabGet<{ data: FabRoutingPlan[] }>('routing/plans'),
      ]);
      setBoms(bomsRes.data ?? []);
      setPlans(plansRes.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Distinct categories present across BOMs — drives the facet chips for both tabs.
  const categories = useMemo(() => {
    const set = new Set<string>();
    boms.forEach((b) => { if (b.category_name) set.add(b.category_name); });
    return Array.from(set).sort();
  }, [boms]);

  const filteredBoms = useMemo(() => boms.filter((b) => {
    const s = search.trim().toLowerCase();
    const matchSearch = !s
      || b.bom_name.toLowerCase().includes(s)
      || b.catalog_item_name.toLowerCase().includes(s)
      || b.catalog_item_code.toLowerCase().includes(s);
    const matchCategory = !categoryFilter || b.category_name === categoryFilter;
    return matchSearch && matchCategory;
  }), [boms, search, categoryFilter]);

  const filteredPlans = useMemo(() => plans.filter((p) => {
    const s = search.trim().toLowerCase();
    const matchSearch = !s
      || p.name.toLowerCase().includes(s)
      || (p.catalogItemName ?? '').toLowerCase().includes(s)
      || (p.bomName ?? '').toLowerCase().includes(s);
    const bomForPlan = boms.find((b) => b.catalog_item_id === p.catalogItemId);
    const matchCategory = !categoryFilter || bomForPlan?.category_name === categoryFilter;
    return matchSearch && matchCategory;
  }), [plans, boms, search, categoryFilter]);

  return (
    <Box>
      <PageHeader
        title="BOMs & Routings"
        subtitle="The factory model that order planning and scheduling run against"
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: '1px solid var(--c-divider)' }}>
        <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>BOMs<InfoTooltip content={INFO_BOMS} placement="bottom" /></Box>} />
        <Tab label="Routing Plans" />
      </Tabs>

      <FilterBar search={search} onSearch={setSearch} placeholder="Search by name, item, or code…">
        <FacetChip label="All categories" active={!categoryFilter} onClick={() => setCategoryFilter(null)} />
        {categories.map((c) => (
          <FacetChip key={c} label={c} active={categoryFilter === c} onClick={() => setCategoryFilter(c)} />
        ))}
      </FilterBar>

      {loading ? (
        <ListSkeleton rows={6} />
      ) : tab === 0 ? (
        filteredBoms.length === 0 ? (
          <EmptyState icon={<AccountTreeRounded />} title="No BOMs match" hint="Try clearing the search or category filter." />
        ) : (
          <EntityList
            rows={filteredBoms}
            sortableFields={BOM_SORT_FIELDS}
            defaultSortKey="catalog_item_name"
            renderRow={(b) => (
              <EntityRow
                key={b.id}
                primary={
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    {!!b.is_default && <StarRounded sx={{ fontSize: 16, color: 'var(--c-warning-600)' }} />}
                    {b.bom_name}
                  </Stack>
                }
                secondary={
                  <Box component="span" sx={{ display: 'inline-flex', gap: 1.5, flexWrap: 'wrap' }}>
                    <span>{b.catalog_item_name} ({b.catalog_item_code})</span>
                    {b.category_name && <span>{b.category_name}{b.group_name ? ` / ${b.group_name}` : ''}</span>}
                  </Box>
                }
                trailing={<Mono chip>{b.item_count} item{b.item_count === 1 ? '' : 's'}</Mono>}
                onClick={() => navigate(`/${company}/fab_erp/item-catalog/${b.catalog_item_id}`)}
                actions={<ChevronRightRounded fontSize="small" sx={{ color: 'var(--c-text-3)' }} />}
              />
            )}
          />
        )
      ) : filteredPlans.length === 0 ? (
        <EmptyState icon={<RouteRounded />} title="No routing plans match" hint="Try clearing the search or category filter." />
      ) : (
        <EntityList
          rows={filteredPlans}
          sortableFields={ROUTING_PLAN_SORT_FIELDS}
          defaultSortKey="name"
          renderRow={(p) => (
            <EntityRow
              key={p.id}
              primary={p.name}
              secondary={
                <Box component="span" sx={{ display: 'inline-flex', gap: 1.5, flexWrap: 'wrap' }}>
                  <span>{p.catalogItemName} ({p.catalogItemCode})</span>
                  <span>BOM: {p.bomName}</span>
                  <span>v{p.versionNo}</span>
                  <span>Updated {new Date(p.updatedAt).toLocaleDateString()}</span>
                </Box>
              }
              trailing={<>
                <Mono chip>{p.stepCount ?? 0} steps</Mono>
                <StatusBadge status={p.status} family={statusFamily(p.status)} />
              </>}
              onClick={() => navigate(`/${company}/fab_erp/routing-plans/${p.id}`)}
              actions={<ChevronRightRounded fontSize="small" sx={{ color: 'var(--c-text-3)' }} />}
            />
          )}
        />
      )}

      {!loading && tab === 1 && filteredPlans.length === 0 && plans.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Create a routing plan from inside an item's BOM editor.
        </Typography>
      )}
    </Box>
  );
}
