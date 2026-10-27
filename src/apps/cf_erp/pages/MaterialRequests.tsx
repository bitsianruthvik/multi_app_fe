import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import PlaylistAddCheckRounded from '@mui/icons-material/PlaylistAddCheckRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import ShoppingCartCheckoutRounded from '@mui/icons-material/ShoppingCartCheckoutRounded';
import { listMaterialRequests, MR_FOR_LABEL, type MrFor, type MrRow } from '../api/purchaseRequests';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useDebounced } from '../hooks/usePagedList';
import { useUrlParam } from '../hooks/useUrlState';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { appPath } from '../navMeta';
import { mrForWords } from '../lib/stores';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader, SkeletonBlock } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { DataTable, type DataColumn } from '../components/DataTable';
import { PrStatusBadge } from '../components/Purchase/purchaseFlowUi';
import { NewMrDialog } from '../components/Stores/NewMrDialog';
import { useToast } from '../components/toastContext';
import { FadeIn, FlashOnChange } from '../motion';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };
const FOR_CHIPS: (MrFor | 'all')[] = ['all', 'sales_order', 'maintenance_order', 'stock', 'general'];

/**
 * Stores › MR INBOX (§79, user 2026-10-18 — was Purchase › Material requests). An MR is a REQUEST TO STORES (user
 * 2026-10-27): a sales order's (raised from its Material request step), a maintenance order's, or a department's "New MR".
 * Filter by "For". Open one to take what is in stock; the rest goes on its purchase request for Purchase.
 * Stores' OWN purchases are no requests to Stores: "New PR" (and To reorder › Raise PR) go straight to a PR — the MR under
 * them is internal and the server leaves it out of this list (it stays reachable from its PR).
 */
export default function MaterialRequests() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const permitted = useIsPermitted();
  // New MR: whoever asks Stores (as POST /requisitions: Stores, inventory manage, maintenance, orders manage).
  const canRaise = permitted('cf_erp_stores') || permitted('cf_erp_inventory_manage') || permitted('cf_erp_maintenance') || permitted('cf_erp_orders_manage');
  // New PR: Stores' own purchase (as POST /stores/purchase-requests: Stores or inventory manage).
  const canRaisePr = permitted('cf_erp_stores') || permitted('cf_erp_inventory_manage');
  const canPickMaintenance = permitted('cf_erp_maintenance') || permitted('cf_erp_production_view');
  const [scope, setScope] = useUrlParam('scope', 'open');
  const [forType, setForType] = useUrlParam('for', 'all');
  const [orderParam] = useUrlParam('order', '');
  const [search, setSearch] = useState('');
  const [raising, setRaising] = useState(false);
  const [raisingPr, setRaisingPr] = useState(false);
  const term = useDebounced(search.trim());
  const load = useLoad(() => listMaterialRequests({
    search: term, open: scope !== 'all', forType: forType === 'all' ? null : (forType as MrFor), orderId: orderParam ? Number(orderParam) : null,
  }), [term, scope, forType, orderParam]);
  const rows = load.data?.rows ?? [];

  const columns: DataColumn<MrRow>[] = [
    { key: 'code', header: 'MR', alwaysVisible: true, sortValue: (r) => r.code, render: (r) => <Mono chip><Box component={Link} to={appPath(company, `material-requests/${r.id}`)} sx={linkSx}>{r.code}</Box></Mono> },
    { key: 'for', header: 'For', sortValue: (r) => r.forType, render: (r) => <Badge family={r.forType === 'sales_order' ? 'info' : r.forType === 'stock' ? 'success' : 'neutral'} noIcon label={r.forLabel ?? MR_FOR_LABEL[r.forType]} /> },
    {
      key: 'order', header: 'Order / what', sortValue: (r) => r.order?.code ?? r.forType,
      render: (r) => (
        <Box>
          <Mono>{mrForWords(r)}</Mono>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'normal' }}>{r.line ? r.line.name : r.notes ?? '—'}</Typography>
        </Box>
      ),
    },
    { key: 'customer', header: 'Customer', defaultHidden: true, sortValue: (r) => r.order?.customer?.name ?? '', render: (r) => <>{r.order?.customer?.name ?? '—'}</> },
    { key: 'supply', header: 'Material', defaultHidden: true, render: (r) => (r.supply === 'customer' ? <Badge family="info" label="Customer supplies" /> : <Typography component="span" sx={{ fontSize: 13 }}>We buy</Typography>) },
    { key: 'locked', header: 'Locked', sortValue: (r) => (r.materials ? r.lockedLines / r.materials : 1), render: (r) => (r.heldForAcceptance ? <Mono muted>Waits for the customer&rsquo;s acceptance</Mono> : <Mono muted={r.lockedLines < r.materials}>{r.lockedWords}</Mono>) },
    { key: 'pr', header: 'Purchase request', render: (r) => (r.purchaseRequest
      ? <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}><Mono chip><Box component={Link} to={appPath(company, `purchase-requests/${r.purchaseRequest.id}`)} sx={linkSx}>{r.purchaseRequest.code}</Box></Mono><FlashOnChange value={r.purchaseRequest.status}><PrStatusBadge status={r.purchaseRequest.status} /></FlashOnChange></Box>
      : <Mono muted>{r.supply === 'customer' ? 'The customer sends it' : 'Not made yet'}</Mono>) },
  ];

  return (
    <Box>
      <PageHeader title="MR inbox"
        subtitle="Requests to Stores — from sales orders, maintenance orders and departments. Open one, take what is in stock, and the rest goes on its purchase request for Purchase. Stores' own purchases go straight to a PR with New PR."
        actions={(canRaise || canRaisePr) && <>
          {canRaisePr && <Button variant="outlined" startIcon={<ShoppingCartCheckoutRounded />} onClick={() => setRaisingPr(true)} data-testid="new-pr">New PR</Button>}
          {canRaise && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setRaising(true)} data-testid="new-mr">New MR</Button>}
        </>} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search MR, order, customer or note">
        {FOR_CHIPS.map((f) => <FacetChip key={f} label={f === 'all' ? 'All' : MR_FOR_LABEL[f]} active={forType === f} onClick={() => setForType(f)} />)}
        <Box sx={{ width: 12 }} />
        <FacetChip label="Open" active={scope !== 'all'} onClick={() => setScope('open')} />
        <FacetChip label="Closed too" active={scope === 'all'} onClick={() => setScope('all')} />
      </FilterBar>
      <ErrorNotice error={load.error} onRetry={load.reload} />
      {!load.data && !load.error && <SkeletonBlock h={240} r={8} />}
      {/* Motion: the inbox rises in once when it first arrives (not on every re-read). */}
      {load.data && (
        <FadeIn variant="rise">
        <DataTable rows={rows} columns={columns} getRowId={(r) => r.id} storageKey="material-requests" exportName="material-requests"
          onRowClick={(r) => navigate(appPath(company, `material-requests/${r.id}`))}
          empty={<EmptyState icon={<PlaylistAddCheckRounded />} title={term ? 'No MR matches' : 'No material requests here'}
            hint={term ? 'Clear the search.' : 'A sales order raises its MR in its Material request step, a maintenance order from its own screen; "New MR" asks Stores for anything else.'} />} />
        </FadeIn>
      )}
      <NewMrDialog open={raising} onClose={() => setRaising(false)} onRaised={(mr) => navigate(appPath(company, `material-requests/${mr.id}`))} />
      <NewMrDialog kind="pr" defaultFor="stock" canPickMaintenance={canPickMaintenance} open={raisingPr} onClose={() => setRaisingPr(false)}
        onRaised={(p) => { toast.success(`${p.code} raised for Purchase.`); navigate(appPath(company, `purchase-requests/${p.id}`)); }} />
    </Box>
  );
}
