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
 * Flow allocation — stage 3 of a sales order.
 *
 * Assigning flows is not a per-item job. On a real order every girder segment
 * gets the same assembly flow and every part gets the same fabrication flow bar
 * the drilled ones, so this screen is mostly one button. What it shows is the
 * state per LEVEL, because that is the unit the decision is actually made in.
 *
 * NO FLOW MEANS NOTHING TO DO. Spans and girders are groupings and legitimately
 * carry no flow, so a level with none is reported plainly and never flagged as
 * a problem.
 */

interface LevelState {
  level: string;
  items: number;
  withFlow: number;
  wouldAssign: number;
  flows: Array<{ name: string; count: number }>;
}
interface RuleView {
  id: number; lineType: string | null; level: string;
  suffix: string | null; flowId: number; flowName: string;
}
interface FlowSummary {
  lineType: string | null;
  rules: RuleView[];
  levels: LevelState[];
  wouldAssign: number;
}
interface ItemRow {
  id: number; code: string | null; name: string;
  levelKind: string | null; flowId: number | null; flowSource?: string | null;
}
interface FlowOption { id: number; name: string }

const LEVEL_LABEL: Record<string, string> = {
  span: 'Span', girder: 'Girder', segment: 'Segment', part: 'Part',
};

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
  const [levelFilter, setLevelFilter] = useState('part');
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
          : 'Nothing to assign — everything already matches the rules.'),
      res.data.assigned > 0 ? 'success' : 'info');
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.message ?? 'Could not apply the flow rules');
    } finally { setBusy(false); }
  }

  async function setFlow(item: ItemRow, flowId: number | '') {
    try {
      await api.post(`${base()}/items/${item.id}/flow`, { flowId: flowId === '' ? null : flowId });
      setItems((prev) => prev.map((x) => (x.id === item.id
        ? { ...x, flowId: flowId === '' ? null : flowId, flowSource: flowId === '' ? null : 'manual' }
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
    if (!i.levelKind || i.levelKind === 'material') return false;
    if (levelFilter !== 'all' && i.levelKind !== levelFilter) return false;
    if (onlyNoFlow && i.flowId) return false;
    const q = search.trim().toLowerCase();
    if (q && !(`${i.code ?? ''} ${i.name}`.toLowerCase().includes(q))) return false;
    return true;
  });

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Per level, because that is the unit the decision is made in. */}
      <Surface e={1} sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>
            Where flows stand
          </Typography>
          {summary?.lineType && <Chip size="small" label={summary.lineType} variant="outlined" />}
          <Box sx={{ flex: 1 }} />
          {canManage && (
            <>
              <Tooltip title="Fills every item that has no flow yet, using the rules below. Anything you set by hand is left alone.">
                <span>
                  <Button variant="contained" size="small" disabled={busy || !(summary?.wouldAssign)}
                    startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <AutoFixHighRounded />}
                    onClick={() => apply(false)}>
                    Apply rules{summary?.wouldAssign ? ` (${summary.wouldAssign})` : ''}
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title="Re-runs the rules over everything, replacing flows set by hand as well.">
                <span>
                  <Button size="small" disabled={busy} onClick={() => apply(true)}>Re-apply to all</Button>
                </span>
              </Tooltip>
            </>
          )}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 1.5 }}>
          {(summary?.levels ?? []).filter((l) => l.items > 0).map((l) => (
            <Box key={l.level} sx={{ p: 1.25, border: '0.5px solid var(--c-divider)', borderRadius: 1 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)' }}>
                {LEVEL_LABEL[l.level] ?? l.level}
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

        {(summary?.rules.length ?? 0) > 0 ? (
          <Box sx={{ mt: 1.5 }}>
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mb: 0.5 }}>
              Rules in play — a rule with no suffix is that level&rsquo;s default:
            </Typography>
            {summary!.rules.map((r) => (
              <Typography key={r.id} sx={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--c-text-2)' }}>
                {(r.lineType ?? 'any type').padEnd(18)} · {LEVEL_LABEL[r.level] ?? r.level}
                {r.suffix ? ` · code ends ${r.suffix}` : ' · default'} → {r.flowName}
              </Typography>
            ))}
          </Box>
        ) : (
          <Alert severity="info" sx={{ mt: 1.5 }}>
            No flow rules are set up yet. Add them under Operations › Flow rules — one per level, plus
            one per code suffix such as <strong>/D</strong> for drilled parts.
          </Alert>
        )}
      </Surface>

      {/* Exceptions. The only genuinely per-item decision. */}
      <Surface e={1} sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField select size="small" label="Level" value={levelFilter} sx={{ width: 140 }}
            onChange={(e) => setLevelFilter(e.target.value)}>
            <MenuItem value="all">All</MenuItem>
            {Object.entries(LEVEL_LABEL).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
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
                <Chip size="small" variant="outlined" label={LEVEL_LABEL[i.levelKind ?? ''] ?? i.levelKind} />
                {i.flowSource === 'manual' && (
                  <Tooltip title="Set by hand — Apply rules will not change it">
                    <Chip size="small" color="info" variant="outlined" label="manual" />
                  </Tooltip>
                )}
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
