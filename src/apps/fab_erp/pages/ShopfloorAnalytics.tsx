/**
 * ShopfloorAnalytics.tsx — EU-16: the shop-floor analytics dashboard.
 *
 * The read-only payoff screen for the Phase 1-3 shop-floor data. Everything is
 * computed live by the backend aggregate endpoints (see
 * multi_app_be/apps/fab_erp/routes/analytics.js); this page just picks a date
 * range and renders it. Charts are hand-rolled CSS/flex bars in the same style
 * as WaitBreakdownBar (DESIGN_SYSTEM.md §7.3) — no chart library.
 *
 * Sections:
 *   1. Constraint headline (the hero) — GET /analytics/constraint.
 *   2. Per-machine time-in-state + utilization — GET /analytics/machines.
 *   3. Wait Pareto by reason — GET /analytics/wait-pareto (reuses
 *      WAIT_REASON_META so colours match the Task Queue breakdown).
 *   4. Per-project touch-vs-wait — GET /analytics/project/:orderId (optional
 *      order selector; simple ratio bars).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Chip, CircularProgress, MenuItem, Select, Typography,
} from '@mui/material';
import InsightsRounded from '@mui/icons-material/InsightsRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import HourglassBottomRounded from '@mui/icons-material/HourglassBottomRounded';

import {
  fabQuery,
  getAnalyticsMachines,
  getConstraint,
  getWaitPareto,
  getProjectAnalytics,
  type AnalyticsMachine,
  type ConstraintResponse,
  type WaitParetoResponse,
  type ProjectAnalyticsResponse,
  type MachineStateKey,
} from '../api/client';
import { PageHeader, Surface, EmptyState } from '../components';
import { WAIT_REASON_META, formatWaitMinutes } from '../components/WaitBreakdownBar';

// ── helpers ──────────────────────────────────────────────────────────────────

function errMsg(e: unknown, fallback: string): string {
  const ax = e as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.message ?? fallback;
}

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Local colours for machine states — no shared export exists in MachineBoard. */
const STATE_META: Record<MachineStateKey, { label: string; color: string }> = {
  running: { label: 'Running', color: '#16A34A' }, // success green
  idle: { label: 'Idle', color: '#8A8EA8' }, // neutral/slate (matches no_shift)
  down: { label: 'Down', color: '#E11D48' }, // rose (matches machine_down)
  off: { label: 'Off', color: '#334155' }, // dark slate
};
const STATE_ORDER: MachineStateKey[] = ['running', 'idle', 'down', 'off'];

// ── date range picker ────────────────────────────────────────────────────────

function RangePicker({
  from, to, onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const inputSx = {
    fontFamily: 'var(--font-ui)',
    fontSize: 13,
    padding: '6px 8px',
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--c-border)',
    background: 'var(--c-surface)',
    color: 'var(--c-text)',
  } as const;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box component="input" type="date" value={from} max={to}
        onChange={(e) => onChange((e.target as HTMLInputElement).value, to)} sx={inputSx} />
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>to</Typography>
      <Box component="input" type="date" value={to} min={from} max={ymd(new Date())}
        onChange={(e) => onChange(from, (e.target as HTMLInputElement).value)} sx={inputSx} />
    </Box>
  );
}

// ── constraint hero ──────────────────────────────────────────────────────────

function ConstraintHero({ data }: { data: ConstraintResponse | null }) {
  const hasConstraint = data?.constraint != null && data.constraint.score > 0;
  return (
    <Surface
      e={2}
      sx={{
        p: 3, mb: 3,
        background: hasConstraint
          ? 'linear-gradient(135deg, var(--c-primary-50), var(--c-surface))'
          : 'var(--c-surface)',
        display: 'flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap',
      }}
    >
      <Box sx={{
        width: 52, height: 52, borderRadius: 'var(--r-md)', display: 'grid', placeItems: 'center',
        background: 'var(--c-primary-600)', color: '#fff', flexShrink: 0, '& svg': { fontSize: 28 },
      }}>
        <InsightsRounded />
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Your constraint this period
        </Typography>
        {hasConstraint ? (
          <>
            <Typography sx={{ fontSize: 30, fontWeight: 700, color: 'var(--c-text)', lineHeight: 1.15 }}>
              {data!.constraint!.name}
            </Typography>
            <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)', mt: 0.5 }}>
              {data!.constraint!.reason}
            </Typography>
          </>
        ) : (
          <>
            <Typography sx={{ fontSize: 22, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1.2 }}>
              No clear constraint
            </Typography>
            <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)', mt: 0.5 }}>
              Not enough utilization or buffer telemetry in this range to flag a bottleneck.
            </Typography>
          </>
        )}
      </Box>
      {hasConstraint && (
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>score</Typography>
          <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 600, color: 'var(--c-primary-600)' }}>
            {data!.constraint!.score.toFixed(2)}
          </Typography>
        </Box>
      )}
    </Surface>
  );
}

// ── machine time-in-state ─────────────────────────────────────────────────────

function MachineRow({ m }: { m: AnalyticsMachine }) {
  const total = STATE_ORDER.reduce((s, k) => s + m.states[k], 0);
  return (
    <Surface e={1} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>{m.name}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {m.inputBufferPct != null && (
            <Chip size="small" label={`in-buffer ${Math.round(m.inputBufferPct)}%`}
              sx={{ fontSize: 11, height: 20 }} />
          )}
          <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--c-primary-600)' }}>
            {m.utilizationPct.toFixed(0)}% util
          </Typography>
        </Box>
      </Box>

      {total > 0 ? (
        <Box sx={{
          display: 'flex', width: '100%', height: 14, borderRadius: 'var(--r-sm)',
          overflow: 'hidden', border: '1px solid var(--c-border)',
        }}>
          {STATE_ORDER.filter((k) => m.states[k] > 0).map((k) => (
            <Box key={k}
              title={`${STATE_META[k].label}: ${formatWaitMinutes(m.states[k])}`}
              sx={{ width: `${(m.states[k] / total) * 100}%`, height: '100%', background: STATE_META[k].color }} />
          ))}
        </Box>
      ) : (
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>No state logged in this range</Typography>
      )}
    </Surface>
  );
}

// ── wait pareto ───────────────────────────────────────────────────────────────

function WaitPareto({ data }: { data: WaitParetoResponse | null }) {
  if (!data || data.byReason.length === 0) {
    return <EmptyState icon={<HourglassBottomRounded />} title="No wait time recorded"
      hint="No wait segments fall inside this date range." />;
  }
  const max = Math.max(...data.byReason.map((r) => r.minutes), 1);
  return (
    <Surface e={1} sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {data.byReason.map((r) => {
        const meta = WAIT_REASON_META[r.reason];
        const pctOfTotal = data.totalMinutes > 0 ? (r.minutes / data.totalMinutes) * 100 : 0;
        return (
          <Box key={r.reason} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box sx={{ width: 150, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text)' }} noWrap>{meta.label}</Typography>
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ height: 16, borderRadius: 'var(--r-sm)', background: meta.color,
                width: `${Math.max((r.minutes / max) * 100, 2)}%` }} />
            </Box>
            <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--c-text-2)', width: 120, textAlign: 'right', flexShrink: 0 }}>
              {formatWaitMinutes(r.minutes)} · {Math.round(pctOfTotal)}%
            </Typography>
          </Box>
        );
      })}
    </Surface>
  );
}

// ── project touch-vs-wait ─────────────────────────────────────────────────────

const TOUCH_COLOR = '#16A34A';
const WAIT_COLOR = '#D97706';

function TouchWaitBar({ touch, wait }: { touch: number; wait: number }) {
  const total = touch + wait;
  if (total <= 0) {
    return <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>No activity</Typography>;
  }
  return (
    <Box sx={{ display: 'flex', width: '100%', height: 12, borderRadius: 'var(--r-sm)', overflow: 'hidden', border: '1px solid var(--c-border)' }}>
      <Box title={`Touch: ${formatWaitMinutes(touch)}`} sx={{ width: `${(touch / total) * 100}%`, background: TOUCH_COLOR }} />
      <Box title={`Wait: ${formatWaitMinutes(wait)}`} sx={{ width: `${(wait / total) * 100}%`, background: WAIT_COLOR }} />
    </Box>
  );
}

interface OrderOption { id: number; orderNumber: string }

function ProjectSection() {
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [orderId, setOrderId] = useState<number | ''>('');
  const [data, setData] = useState<ProjectAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fabQuery<{ data: OrderOption[] }>('fabErpOrder', {
      fields: ['id', 'orderNumber'],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
      pagination: { limit: 500 },
    })
      .then((res) => setOrders(res.data ?? []))
      .catch(() => setOrders([]));
  }, []);

  useEffect(() => {
    if (orderId === '') { setData(null); return; }
    let alive = true;
    setLoading(true);
    getProjectAnalytics(orderId)
      .then((res) => { if (alive) setData(res); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [orderId]);

  return (
    <Surface e={1} sx={{ p: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Order</Typography>
        <Select
          size="small"
          value={orderId}
          displayEmpty
          onChange={(e) => setOrderId(e.target.value === '' ? '' : Number(e.target.value))}
          sx={{ minWidth: 220, fontSize: 13 }}
        >
          <MenuItem value=""><em>Select an order…</em></MenuItem>
          {orders.map((o) => (
            <MenuItem key={o.id} value={o.id} sx={{ fontSize: 13 }}>{o.orderNumber}</MenuItem>
          ))}
        </Select>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 'auto' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: 2, background: TOUCH_COLOR }} />
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>Touch</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: 2, background: WAIT_COLOR }} />
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>Wait</Typography>
          </Box>
        </Box>
      </Box>

      {orderId === '' ? (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>
          Pick an order to compare value-add (touch) time against wait time.
        </Typography>
      ) : loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={22} /></Box>
      ) : !data || data.items.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No touch or wait activity for this order in range.</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>
                {data.order.orderNumber} — whole order
              </Typography>
              <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--c-text-2)' }}>
                {formatWaitMinutes(data.order.touchMinutes)} touch · {formatWaitMinutes(data.order.waitMinutes)} wait
              </Typography>
            </Box>
            <TouchWaitBar touch={data.order.touchMinutes} wait={data.order.waitMinutes} />
          </Box>
          <Box sx={{ height: 1, background: 'var(--c-border)', my: 0.5 }} />
          {data.items.map((it) => (
            <Box key={it.itemId} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text)' }} noWrap>{it.name}</Typography>
                <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--c-text-2)', flexShrink: 0 }}>
                  {formatWaitMinutes(it.touchMinutes)} / {formatWaitMinutes(it.waitMinutes)}
                </Typography>
              </Box>
              <TouchWaitBar touch={it.touchMinutes} wait={it.waitMinutes} />
            </Box>
          ))}
        </Box>
      )}
    </Surface>
  );
}

// ── section heading ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)', mt: 3, mb: 1.5 }}>
      {children}
    </Typography>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function ShopfloorAnalytics() {
  const defaults = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 86400000);
    return { from: ymd(from), to: ymd(now) };
  }, []);

  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const [constraint, setConstraint] = useState<ConstraintResponse | null>(null);
  const [machines, setMachines] = useState<AnalyticsMachine[]>([]);
  const [pareto, setPareto] = useState<WaitParetoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (rFrom: string, rTo: string) => {
    setLoading(true);
    setError('');
    try {
      const range = { from: rFrom, to: rTo };
      const [c, m, p] = await Promise.all([
        getConstraint(range),
        getAnalyticsMachines(range),
        getWaitPareto(range),
      ]);
      setConstraint(c);
      setMachines(m.machines ?? []);
      setPareto(p);
    } catch (e) {
      setError(errMsg(e, 'Failed to load analytics.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(from, to); }, [from, to, load]);

  const onRangeChange = useCallback((f: string, t: string) => {
    if (f) setFrom(f);
    if (t) setTo(t);
  }, []);

  const sortedMachines = useMemo(
    () => [...machines].sort((a, b) => b.utilizationPct - a.utilizationPct),
    [machines],
  );

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
      <PageHeader
        title="Shop-floor Analytics"
        subtitle="Where time goes on the floor — your constraint, machine utilization, and where work waits."
        actions={<RangePicker from={from} to={to} onChange={onRangeChange} />}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Surface e={1} sx={{ p: 5, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Surface>
      ) : (
        <>
          <ConstraintHero data={constraint} />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PrecisionManufacturingRounded sx={{ fontSize: 18, color: 'var(--c-text-2)' }} />
            <SectionTitle>Machine utilization &amp; time-in-state</SectionTitle>
          </Box>
          {sortedMachines.length === 0 ? (
            <EmptyState icon={<PrecisionManufacturingRounded />} title="No machines"
              hint="No resources with logged state in this range." />
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 1.5 }}>
              {sortedMachines.map((m) => <MachineRow key={m.resourceId} m={m} />)}
            </Box>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1.25 }}>
            {STATE_ORDER.map((k) => (
              <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: STATE_META[k].color }} />
                <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>{STATE_META[k].label}</Typography>
              </Box>
            ))}
          </Box>

          <SectionTitle>Wait Pareto — where work waits</SectionTitle>
          <WaitPareto data={pareto} />

          <SectionTitle>Touch vs wait by project</SectionTitle>
          <ProjectSection />
        </>
      )}
    </Box>
  );
}
