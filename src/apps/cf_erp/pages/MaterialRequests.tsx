import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import PlaylistAddCheckRounded from '@mui/icons-material/PlaylistAddCheckRounded';
import { listMaterialRequests, type MrRow } from '../api/purchaseRequests';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useDebounced } from '../hooks/usePagedList';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader, SkeletonBlock } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { DataTable, type DataColumn } from '../components/DataTable';
import { PrStatusBadge } from '../components/Purchase/purchaseFlowUi';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/**
 * Purchase › Material requests (§71): every MR raised from a sales order. Open one to take what you can from stock and
 * put the rest on its purchase request.
 */
export default function MaterialRequests() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const [scope, setScope] = useUrlParam('scope', 'open');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  const load = useLoad(() => listMaterialRequests({ search: term, open: scope !== 'all' }), [term, scope]);
  const rows = load.data?.rows ?? [];

  const columns: DataColumn<MrRow>[] = [
    { key: 'code', header: 'MR', alwaysVisible: true, sortValue: (r) => r.code, render: (r) => <Mono chip><Box component={Link} to={appPath(company, `material-requests/${r.id}`)} sx={linkSx}>{r.code}</Box></Mono> },
    { key: 'order', header: 'Sales order', sortValue: (r) => r.order.code, render: (r) => <Box><Mono>{r.order.code}</Mono><Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'normal' }}>Line {r.line.lineNo} · {r.line.name}</Typography></Box> },
    { key: 'customer', header: 'Customer', defaultHidden: true, sortValue: (r) => r.order.customer?.name ?? '', render: (r) => <>{r.order.customer?.name ?? '—'}</> },
    { key: 'supply', header: 'Material', render: (r) => (r.supply === 'customer' ? <Badge family="info" label="Customer supplies" /> : <Typography component="span" sx={{ fontSize: 13 }}>We buy</Typography>) },
    { key: 'locked', header: 'Locked for this order', sortValue: (r) => (r.materials ? r.lockedLines / r.materials : 1), render: (r) => (r.heldForAcceptance ? <Mono muted>Waits for the customer&rsquo;s acceptance</Mono> : <Mono muted={r.lockedLines < r.materials}>{r.lockedWords}</Mono>) },
    { key: 'pr', header: 'Purchase request', render: (r) => (r.purchaseRequest
      ? <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}><Mono chip><Box component={Link} to={appPath(company, `purchase-requests/${r.purchaseRequest.id}`)} sx={linkSx}>{r.purchaseRequest.code}</Box></Mono><PrStatusBadge status={r.purchaseRequest.status} /></Box>
      : <Mono muted>{r.supply === 'customer' ? 'The customer sends it' : 'Not made yet'}</Mono>) },
  ];

  return (
    <Box>
      <PageHeader title="Material requests" subtitle="Each MR is raised from a sales order. Open one to take what you can from stock; the rest goes on its purchase request." />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search MR, order or customer">
        <FacetChip label="Open orders" active={scope !== 'all'} onClick={() => setScope('open')} />
        <FacetChip label="All" active={scope === 'all'} onClick={() => setScope('all')} />
      </FilterBar>
      <ErrorNotice error={load.error} onRetry={load.reload} />
      {!load.data && !load.error && <SkeletonBlock h={240} r={8} />}
      {load.data && (
        <DataTable rows={rows} columns={columns} getRowId={(r) => r.id} storageKey="material-requests" exportName="material-requests"
          onRowClick={(r) => navigate(appPath(company, `material-requests/${r.id}`))}
          empty={<EmptyState icon={<PlaylistAddCheckRounded />} title={term ? 'No MR matches' : 'No material requests yet'}
            hint={term ? 'Clear the search.' : 'Raise one from a sales order’s Material request stage.'} />} />
      )}
    </Box>
  );
}
