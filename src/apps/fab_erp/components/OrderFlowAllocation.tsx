import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AutoFixHighRounded from '@mui/icons-material/AutoFixHighRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';

import { fabQuery } from '../api/client';
import api, { API_HOST } from '@core/utils/axiosConfig';
import { Surface, EmptyState, useToast } from '../components';
import type { OrderReadiness } from '../api/readiness';

/**
 * Flows — stage 3 of a sales order.
 *
 * THIS IS NOW A REVIEW SCREEN, not an assignment one. Each item's flow arrives
 * with the structure, from the BOM line it was expanded from
 * (`fab_item_bom.default_flow_id`), so by the time anybody opens this tab the
 * answer is usually already right and the job is to check it and make the odd
 * exception.
 *
 * It used to drive `fab_flow_rules` — a table matching
 * (line type, level, code suffix) that somebody had to fill in separately and
 * then remember to press Apply against. The BOM says the same thing in the
 * place the structure is already described, and says it better: the line is the
 * item IN CONTEXT of its parent, so a Top Flange in a Girder Segment can differ
 * from one in a PEB member.
 *
 * The one button left re-pulls the BOM's answer for items that still have no
 * flow — for when a default was set after the order was built.
 *
 * NO FLOW MEANS NOTHING TO DO. An assembly that only groups its children
 * legitimately carries none, so a depth with no flows is reported plainly and
 * never flagged as a problem.
 */

interface LevelState {
  depth: number;
  /** What the rows at this depth are called, from the items themselves. */
  label: string;
  items: number;
  withFlow: number;
  wouldAssign: number;
  flows: Array<{ name: string; count: number }>;
}
interface FlowSummary {
  levels: LevelState[];
  wouldAssign: number;
}
interface ItemRow {
  id: number; code: string | null; name: string;
  depth: number; nodeKind: string | null; isLeaf?: number;
  flowId: number | null;
}
interface FlowOption { id: number; name: string }

export default function OrderFlowAllocation({ orderId, canManage = false, onStageChanged }: {
  orderId: number; canManage?: boolean;
  /**
   * Tell the order page a stage moved, so the strip above follows along.
   * Pass the readiness an endpoint already returned to save a round-trip.
   */
  onStageChanged?: (next?: OrderReadiness | null) => void;
}) {
  const { toast } = useToast();
  const [summary, setSummary] = useState<FlowSummary | null>(null);
  const [flows, setFlows] = useState<FlowOption[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  /**
   * `'leaf'` rather than a depth: the rows that carry fabrication work are the
   * leaves, wherever they turn out to be. The old default of 'part' assumed
   * they were always at rung four.
   */
  const [levelFilter, setLevelFilter] = useState<string>('leaf');
  const [search, setSearch] = useState('');
  const [onlyNoFlow, setOnlyNoFlow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const base = useCallback(
    () => `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp`,
    [],
  );

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [s, f, i] = await Promise.all([
        api.get<FlowSummary>(`${base()}/orders/${orderId}/flows/summary`).then((r) => r.data),
        fabQuery<{ data: FlowOption[] }>('fabErpOperationFlow', {
          filters: { active: 1 }, orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 200 },
        }).then((r) => r.data ?? []).catch(() => []),
        fabQuery<{ data: ItemRow[] }>('fabErpItem', {
          filters: { orderId }, orderBy: [{ field: 'code', direction: 'asc' }], pagination: { limit: 1000 },
        }).then((r) => r.data ?? []).catch(() => []),
      ]);
      setSummary(s); setFlows(f); setItems(i);
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.message ?? 'Failed to load flow allocation');
    } finally { setLoading(false); }
  }, [base, orderId]);

  useEffect(() => { load(); }, [load]);

  async function apply(reassign: boolean) {
    setBusy(true); setError('');
    try {
      const res = await api.post<{
        assigned: number; unchanged: number; noRule: number; message?: string;
        readiness?: OrderReadiness | null;
      }>(`${base()}/orders/${orderId}/flows/apply`, { reassign });
      await load();
      onStageChanged?.(res.data.readiness);
      toast(res.data.message
        ?? (res.data.assigned > 0
          ? `${res.data.assigned} item(s) given a flow`
          : 'Nothing to pull in — every item already has the flow its BOM line gives.'),
      res.data.assigned > 0 ? 'success' : 'info');
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.message ?? 'Could not pull the flows from the BOM');
    } finally { setBusy(false); }
  }

  async function setFlow(item: ItemRow, flowId: number | '') {
    try {
      await api.post(`${base()}/items/${item.id}/flow`, { flowId: flowId === '' ? null : flowId });
      setItems((prev) => prev.map((x) => (x.id === item.id
        ? { ...x, flowId: flowId === '' ? null : flowId }
        : x)));
      // The per-level counts move with it — and so may the last exception on the
      // order, which is what completes the stage.
      api.get<FlowSummary>(`${base()}/orders/${orderId}/flows/summary`)
        .then((r) => setSummary(r.data)).catch(() => {});
      onStageChanged?.();
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.message ?? 'Could not set the flow');
    }
  }

  if (loading) {
    return <Surface e={1} sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Surface>;
  }

  const visible = items.filter((i) => {
    if (i.nodeKind === 'material') return false;
    if (levelFilter === 'leaf' && !Number(i.isLeaf)) return false;
    if (levelFilter !== 'all' && levelFilter !== 'leaf' && `d${i.depth}` !== levelFilter) return false;
    if (onlyNoFlow && i.flowId) return false;
    const q = search.trim().toLowerCase();
    if (q && !(`${i.code ?? ''} ${i.name}`.toLowerCase().includes(q))) return false;
    return true;
  });

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Per depth, named from the items sitting at it. */}
      <Surface e={1} sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>
            Where flows stand
          </Typography>
          <Box sx={{ flex: 1 }} />
          {canManage && (
            <>
              <Tooltip title="Pulls in the default flow from the BOM for items that still have none. Anything you set by hand is left alone.">
                <span>
                  <Button variant="contained" size="small" disabled={busy || !(summary?.wouldAssign)}
                    startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <AutoFixHighRounded />}
                    onClick={() => apply(false)}>
                    Pull from BOM{summary?.wouldAssign ? ` (${summary.wouldAssign})` : ''}
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title="Re-reads the BOM for every item, replacing flows set by hand as well.">
                <span>
                  <Button size="small" disabled={busy} onClick={() => apply(true)}>Reset all to BOM</Button>
                </span>
              </Tooltip>
            </>
          )}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 1.5 }}>
          {(summary?.levels ?? []).filter((l) => l.items > 0).map((l) => (
            <Box key={l.depth} sx={{ p: 1.25, border: '0.5px solid var(--c-divider)', borderRadius: 1 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)' }}>
                {l.label || `Level ${l.depth + 1}`}
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                {l.withFlow} of {l.items} have a flow
              </Typography>
              {l.flows.map((f) => (
                <Typography key={f.name} sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                  {f.name} × {f.count}
                </Typography>
              ))}
              {l.withFlow === 0 && l.wouldAssign === 0 && (
                <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', fontStyle: 'italic' }}>
                  nothing to do at this level
                </Typography>
              )}
              {l.wouldAssign > 0 && (
                <Typography sx={{ fontSize: 11.5, color: 'var(--c-primary-700)' }}>
                  {l.wouldAssign} would be assigned
                </Typography>
              )}
            </Box>
          ))}
        </Box>

        {(summary?.levels.some((l) => l.withFlow > 0) ?? false) ? (
          <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 1.5 }}>
            Each flow came from its BOM line. Change one below to make an exception for this order,
            or set the default on the item&rsquo;s BOM to change it for every future order.
          </Typography>
        ) : (
          <Alert severity="info" sx={{ mt: 1.5 }}>
            Nothing on this order has a flow yet. Flows come from the BOM — open the item in the
            catalogue and set a <strong>default flow</strong> on each of its BOM lines, then press
            Pull from BOM.
          </Alert>
        )}
      </Surface>

      {/* Exceptions. The only genuinely per-item decision. */}
      <Surface e={1} sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField select size="small" label="Level" value={levelFilter} sx={{ width: 160 }}
            onChange={(e) => setLevelFilter(e.target.value)}>
            <MenuItem value="all">All</MenuItem>
            {/* The rows that carry fabrication work, wherever they sit. */}
            <MenuItem value="leaf">Made items</MenuItem>
            {(summary?.levels ?? []).map((l) => (
              <MenuItem key={l.depth} value={`d${l.depth}`}>{l.label || `Level ${l.depth + 1}`}</MenuItem>
            ))}
          </TextField>
          <TextField size="small" label="Find" placeholder="code or name" value={search} sx={{ flex: '1 1 220px' }}
            onChange={(e) => setSearch(e.target.value)} />
          <Button size="small" variant={onlyNoFlow ? 'contained' : 'outlined'}
            onClick={() => setOnlyNoFlow((v) => !v)}>
            No flow only
          </Button>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{visible.length} shown</Typography>
        </Box>

        {visible.length === 0 ? (
          <EmptyState icon={<RouteRounded />} title="Nothing matches" hint="Widen the filter to see more items." />
        ) : (
          <Box sx={{ maxHeight: 460, overflowY: 'auto' }}>
            {visible.slice(0, 300).map((i) => (
              <Box key={i.id} sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, py: 0.6, flexWrap: 'wrap',
                borderBottom: '0.5px solid var(--c-divider)',
              }}>
                <Typography sx={{ fontSize: 13, color: 'var(--c-text)', flex: '1 1 160px' }}>{i.name}</Typography>
                {i.code && (
                  <Tooltip title={i.code}>
                    <Typography sx={{
                      fontFamily: 'monospace', fontSize: 11.5, color: 'var(--c-text-3)',
                      maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{i.code}</Typography>
                  </Tooltip>
                )}
                <Chip
                  size="small"
                  variant="outlined"
                  label={summary?.levels.find((l) => l.depth === i.depth)?.label || `Level ${i.depth + 1}`}
                />
                <TextField select size="small" variant="standard" value={i.flowId ?? ''} sx={{ width: 210 }}
                  disabled={!canManage}
                  onChange={(e) => setFlow(i, e.target.value === '' ? '' : Number(e.target.value))}>
                  <MenuItem value="">— nothing to do —</MenuItem>
                  {flows.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
                </TextField>
              </Box>
            ))}
            {visible.length > 300 && (
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', pt: 1 }}>
                Showing the first 300 of {visible.length} — narrow the filter to reach the rest.
              </Typography>
            )}
          </Box>
        )}
      </Surface>
    </Box>
  );
}
