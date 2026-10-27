import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, TextField, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import AutorenewRounded from '@mui/icons-material/AutorenewRounded';
import PlaylistAddRounded from '@mui/icons-material/PlaylistAddRounded';
import { CfApiError } from '../api/client';
import { getReorder, raiseReorder, type ReorderRow } from '../api/stores';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useDebounced } from '../hooks/usePagedList';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { reorderBody, reorderProblems } from '../lib/stores';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader, SkeletonBlock } from '../components/ui';
import { FilterBar } from '../components/FilterBar';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FullScreenFrame, FullScreenToggle } from '../components/FullScreen';
import { useFullScreen } from '../hooks/useFullScreen';
import { useToast } from '../components/toastContext';
import { FadeIn, nudge } from '../motion';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/**
 * Stores › TO REORDER (§79, user 2026-10-18). The reorder engine (by AI) lists every catalog item bought to MIN / MAX whose
 * free stock (+ what is already coming for stock) is below its minimum — suggesting up to the maximum — and every item
 * bought PERIODICALLY whose period is over — suggesting what was used since it began. Every row starts ticked with the
 * suggestion filled in; change a quantity, untick a row, then "Raise PR" puts them on ONE purchase request for Purchase (user
 * 2026-10-27: an MR is a request TO Stores, a PR is what Stores raises TO Purchase — the MR for stock kept underneath is
 * internal, not in the MR inbox). How an item is procured is set on the item (or its definition) — the Procurement card.
 */
export default function ToReorder() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const permitted = useIsPermitted();
  const canRaise = permitted('cf_erp_stores') || permitted('cf_erp_inventory_manage');
  const full = useFullScreen('to-reorder');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  const load = useLoad(() => getReorder(term), [term]);
  const rows = useMemo(() => load.data?.rows ?? [], [load.data]);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [qty, setQty] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<CfApiError | null>(null);
  const raiseRef = useRef<HTMLButtonElement>(null);
  // Prefilled: every row ticked, the suggestion typed in.
  useEffect(() => {
    setTicked(new Set(rows.map((r) => r.item.id)));
    setQty(Object.fromEntries(rows.map((r) => [r.item.id, String(r.suggest)])));
  }, [rows]);
  const problems = reorderProblems(rows, ticked, qty);

  const raise = async () => {
    if (problems.length || busy) return;
    setBusy(true); setRefusal(null);
    try {
      const out = await raiseReorder(reorderBody(rows, ticked, qty));
      invalidateNavCounts();
      toast.success(out.purchaseRequest ? `${out.purchaseRequest.code} raised for stock — with Purchase.` : 'Nothing to buy.');
      navigate(appPath(company, out.purchaseRequest ? `purchase-requests/${out.purchaseRequest.id}` : `material-requests/${out.requisition.id}`));
    } catch (e) { setRefusal(e instanceof CfApiError ? e : new CfApiError(0, e instanceof Error ? e.message : String(e))); nudge(raiseRef.current); } finally { setBusy(false); }
  };

  const toggle = (id: number) => setTicked((t) => { const n = new Set(t); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const columns: DataColumn<ReorderRow>[] = [
    {
      key: 'tick', header: '', alwaysVisible: true,
      render: (r) => <Checkbox size="small" checked={ticked.has(r.item.id)} onChange={() => toggle(r.item.id)} onClick={(e) => e.stopPropagation()} inputProps={{ 'aria-label': `Reorder ${r.item.code ?? r.item.name}` }} data-testid="reorder-tick" />,
    },
    {
      key: 'item', header: 'Item', alwaysVisible: true, sortValue: (r) => r.item.code ?? r.item.name,
      render: (r) => (
        <Box sx={{ py: 0.5 }}>
          <Mono><Box component={Link} to={appPath(company, `items/${r.item.id}`)} sx={linkSx}>{r.item.code ?? '—'}</Box></Mono>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'normal' }}>{r.item.name}</Typography>
        </Box>
      ),
    },
    { key: 'method', header: 'How', sortValue: (r) => r.method, render: (r) => <Badge family={r.method === 'buy_min_max' ? 'info' : 'neutral'} noIcon label={r.methodLabel} /> },
    { key: 'free', header: 'Free', numeric: true, sortValue: (r) => r.free, render: (r) => <Mono>{qtyText(r.free)}</Mono> },
    { key: 'coming', header: 'Coming', numeric: true, sortValue: (r) => r.coming, render: (r) => <Mono muted={!r.coming}>{qtyText(r.coming)}</Mono> },
    { key: 'why', header: 'Why (by AI)', render: (r) => <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal', maxWidth: 420 }}>{r.why}</Typography> },
    {
      key: 'qty', header: 'Order', alwaysVisible: true, sortValue: (r) => r.suggest,
      render: (r) => (
        <TextField size="small" value={qty[r.item.id] ?? ''} onChange={(e) => setQty((q) => ({ ...q, [r.item.id]: e.target.value }))} onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void raise(); } }}
          disabled={!ticked.has(r.item.id) || !canRaise} sx={{ width: 130 }}
          inputProps={{ inputMode: 'decimal', 'aria-label': `Quantity of ${r.item.code ?? r.item.name}`, 'data-testid': 'reorder-qty' }}
          InputProps={{ endAdornment: <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', ml: 0.5 }}>{r.item.uom ?? ''}</Typography> }} />
      ),
    },
    { key: 'lead', header: 'Lead time', numeric: true, defaultHidden: true, sortValue: (r) => r.leadTimeDays ?? -1, render: (r) => <Mono muted={r.leadTimeDays == null}>{r.leadTimeDays == null ? '—' : `${r.leadTimeDays} d`}</Mono> },
    { key: 'vendors', header: 'Preferred vendors', defaultHidden: true, render: (r) => <>{r.preferredVendors.map((v) => v.name).join(', ') || '—'}</> },
  ];

  return (
    <FullScreenFrame on={full.on} onExit={() => full.set(false)}>
      <Box>
        <PageHeader title="To reorder"
          subtitle="Suggested by AI from each item's procurement method: min / max items below their minimum, periodic items whose period is over. Tick, adjust, raise ONE purchase request for stock — it goes straight to Purchase."
          actions={<>
            {canRaise && <Button ref={raiseRef} variant="contained" startIcon={<PlaylistAddRounded />} disabled={busy || !rows.length || problems.length > 0} onClick={() => void raise()} data-testid="reorder-raise">
              Raise PR{ticked.size ? ` for ${ticked.size} item${ticked.size === 1 ? '' : 's'}` : ''}
            </Button>}
            <FullScreenToggle on={full.on} onToggle={full.toggle} />
          </>} />
        <FilterBar search={search} onSearch={setSearch} placeholder="Search item code or name" />
        <ErrorNotice error={load.error} onRetry={load.reload} />
        {refusal && (
          <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setRefusal(null)} data-testid="reorder-refusal">
            <Box>{refusal.message}</Box>
            {refusal.problems.filter((p) => p !== refusal.message).map((p) => <Box key={p} sx={{ fontSize: 12.5 }}>{p}</Box>)}
          </Alert>
        )}
        {!load.data && !load.error && <SkeletonBlock h={240} r={8} />}
        {load.data && (
          <FadeIn variant="rise">
          <DataTable rows={rows} columns={columns} getRowId={(r) => r.item.id} storageKey="to-reorder" exportName="to-reorder"
            onRowClick={(r) => toggle(r.item.id)}
            empty={<EmptyState icon={<AutorenewRounded />} title={term ? 'Nothing matches' : 'Nothing to reorder'}
              hint={term ? 'Clear the search.' : 'Items bought to min / max or periodically appear here when they need buying. Set the method on an item’s Procurement card.'} />} />
          </FadeIn>
        )}
      </Box>
    </FullScreenFrame>
  );
}
