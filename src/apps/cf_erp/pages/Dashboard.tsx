/**
 * Production › Dashboard — management's glance (DESIGN_SYSTEM.md §4.9, the
 * analytical dashboard): work done BY MACHINE and BY ORDER, two tabs, one period.
 *
 * Reads only. Both tabs load together (two requests, each a fixed handful of
 * set-based reads on the backend), so switching tab is instant and the machine
 * tab can say how many orders are late. The period and the tab live in the URL,
 * so a link to "this month, by order" is a link.
 */
import { useEffect, useMemo, useState } from 'react';
import { Box, Button, MenuItem, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import { getMachinesDashboard, getOrdersDashboard, type MachinesDashboard, type OrdersDashboard } from '../api/dashboard';
import { CfApiError } from '../api/client';
import { PERIOD_OPTIONS, type PeriodKey, clockText, localToday, periodLabel, periodRange, MAX_PERIOD_DAYS } from '../lib/dashboard';
import { useUrlParam } from '../hooks/useUrlState';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { ErrorNotice, PageHeader, SkeletonRows, StatSkeleton } from '../components/ui';
import { MachinesTab } from '../components/Dashboard/MachinesTab';
import { OrdersTab } from '../components/Dashboard/OrdersTab';

type TabKey = 'machines' | 'orders';
/** While the period reaches today, the numbers are live: read again every few minutes. */
const REFRESH_MS = 3 * 60 * 1000;

interface Loaded<T> { data: T | null; error: CfApiError | null; loading: boolean }
const idle = <T,>(): Loaded<T> => ({ data: null, error: null, loading: false });

export default function Dashboard() {
  const isPermitted = useIsPermitted();
  const canMachines = isPermitted('cf_erp_production_view') || isPermitted('cf_erp_production_manage');
  const canOrders = canMachines || isPermitted('cf_erp_orders_view');
  const [tabParam, setTab] = useUrlParam('tab', canMachines ? 'machines' : 'orders');
  const tab: TabKey = tabParam === 'orders' || !canMachines ? 'orders' : 'machines';
  const [periodParam, setPeriod] = useUrlParam('period', 'week');
  const period = (PERIOD_OPTIONS.some((o) => o.key === periodParam) ? periodParam : 'week') as PeriodKey;
  const [fromParam, setFrom] = useUrlParam('from', '');
  const [toParam, setTo] = useUrlParam('to', '');
  const [serverToday, setServerToday] = useState<string | null>(null);
  const today = serverToday ?? localToday();
  const { from, to } = useMemo(() => periodRange(period, today, { from: fromParam, to: toParam }), [period, today, fromParam, toParam]);
  const [tick, setTick] = useState(0);
  const [machines, setMachines] = useState<Loaded<MachinesDashboard>>(idle);
  const [orders, setOrders] = useState<Loaded<OrdersDashboard>>(idle);

  useEffect(() => {
    let alive = true;
    const run = <T,>(enabled: boolean, load: () => Promise<T>, set: (f: (s: Loaded<T>) => Loaded<T>) => void, onData?: (d: T) => void) => {
      if (!enabled) return;
      set((s) => ({ ...s, loading: true }));
      load()
        .then((d) => { if (alive) { set(() => ({ data: d, error: null, loading: false })); onData?.(d); } })
        .catch((e) => { if (alive) set((s) => ({ ...s, loading: false, error: e instanceof CfApiError ? e : new CfApiError(0, String(e)) })); });
    };
    run(canMachines, () => getMachinesDashboard(from, to), setMachines, (d) => setServerToday(d.period.today));
    run(canOrders, () => getOrdersDashboard(from, to), setOrders, (d) => setServerToday(d.period.today));
    return () => { alive = false; };
  }, [from, to, tick, canMachines, canOrders]);

  const live = to >= today;
  useEffect(() => {
    if (!live) return undefined;
    const t = window.setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => window.clearInterval(t);
  }, [live]);

  const current = tab === 'machines' ? machines : orders;
  const asOf = current.data?.period.now;
  const pickPeriod = (key: PeriodKey | null) => {
    if (!key) return;
    if (key === 'custom' && period !== 'custom') { setFrom(from); setTo(to); }
    setPeriod(key);
  };

  return (
    <Box>
      <PageHeader
        title="Dashboard"
        subtitle={<>What the plant did and where every confirmed order stands · <b>{periodLabel(from, to)}</b>{asOf ? ` · as of ${clockText(asOf)}` : ''}</>}
        actions={(
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {/* A narrow screen gets a picker: five toggle buttons do not fit a phone. */}
            <TextField select size="small" value={period} onChange={(e) => pickPeriod(e.target.value as PeriodKey)} sx={{ display: { xs: 'inline-flex', md: 'none' }, minWidth: 150 }} inputProps={{ 'aria-label': 'Period' }}>
              {PERIOD_OPTIONS.map((o) => <MenuItem key={o.key} value={o.key}>{o.label}</MenuItem>)}
            </TextField>
            <ToggleButtonGroup size="small" exclusive value={period} onChange={(_, v) => pickPeriod(v)} aria-label="Period" sx={{ display: { xs: 'none', md: 'inline-flex' } }}>
              {PERIOD_OPTIONS.map((o) => <ToggleButton key={o.key} value={o.key} sx={{ textTransform: 'none', px: 1.25 }}>{o.label}</ToggleButton>)}
            </ToggleButtonGroup>
            {period === 'custom' && (
              <>
                <TextField type="date" size="small" label="From" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
                <TextField type="date" size="small" label="To" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
                  helperText={`up to ${MAX_PERIOD_DAYS} days`} />
              </>
            )}
            <Tooltip title={live ? 'Reads again every 3 minutes while the period includes today' : 'Read again'}>
              <span><Button size="small" variant="outlined" startIcon={<RefreshRounded />} onClick={() => setTick((n) => n + 1)} disabled={current.loading}>Refresh</Button></span>
            </Tooltip>
          </Box>
        )}
      />
      <Tabs value={tab} onChange={(_, v: TabKey) => setTab(v)} sx={{ mb: 2, borderBottom: '1px solid var(--c-divider)' }}>
        {canMachines && <Tab value="machines" label="By machine" sx={{ textTransform: 'none' }} data-testid="tab-machines" />}
        {canOrders && <Tab value="orders" label="By order" sx={{ textTransform: 'none' }} data-testid="tab-orders" />}
      </Tabs>
      {!canOrders && <Typography sx={{ color: 'var(--c-text-2)' }}>You need production view or orders view to see the dashboard.</Typography>}
      <ErrorNotice error={current.error} onRetry={() => setTick((n) => n + 1)} />
      {!current.data && current.loading && <><StatSkeleton count={6} /><SkeletonRows rows={5} height={140} /></>}
      {tab === 'machines' && machines.data && (
        <MachinesTab data={machines.data} atRisk={orders.data ? { late: orders.data.totals.late, atRisk: orders.data.totals.atRisk } : null} />
      )}
      {tab === 'orders' && orders.data && <OrdersTab data={orders.data} />}
    </Box>
  );
}
