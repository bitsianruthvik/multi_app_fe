import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Autocomplete, Box, Button, LinearProgress, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiFetch } from '@core/api/client';
import { PageHeader } from '@shared/ui';
import { erpByPane, erpBySlug } from '../erpScreens';

/**
 * The operations dashboard (V15). Its figures are worked out by the page built from the reviewed HTML
 * (public/sumangal-v15.html, made by tools/sumangal-v15/build.mjs), shown in a frame below this screen's title.
 *
 * One screen, one scroll, one place for filters (user, 2026-11-25):
 *  - the app's menu picks the screen (one route per screen, all this page; the frame keeps running between them);
 *  - the filters are this page's bar, sticky under the title; the frame's own filter strip and date boxes are hidden
 *    and set from here. Today's screens are as of the latest ERP day (no date to pick); the period (From–To) is one
 *    for every screen that uses dates and stays when you move between them (kept for the browser tab);
 *  - the frame is as tall as its content, so only the app's page scrolls; it is told which part of it is on screen
 *    so its drill-down panel opens there.
 * The frame takes the platform's fonts, colours and light/dark theme from this page (posted as CSS variables).
 *
 * Data comes from this app's API behind the login (GET /v15/data, ~11 MB, sent gzipped) and is posted to the frame.
 * Fresh data: the ERP agent on the customer's network sends a full dataset each night at 02:00. In working hours it
 * has no timer: opening this page asks it for today's entries (once per opening, when it is listening), and so does
 * "Refresh now" (GET/POST /agent/runs, /agent/refresh); the page shows the stored data at once and reloads when the
 * update lands. Data that arrives otherwise is never swapped in under the reader: a notice offers it.
 */
type Payload = { D: unknown; S: unknown; H: unknown };
type Meta = { loadedAt?: string; end?: string; source?: string } | null;
type Runs = {
  data: Meta;
  agents: { id: number; status: string; idle_seconds: number | null; last_ok: number | null; last_message: string | null }[];
  job: { id: number; status: string; ok: number | null } | null;
};
type Opt = [string, string];
type Options = { cust: Opt[]; types: Opt[]; metals: Opt[]; end: string };
type Filters = { c: string; t: string; m: string; u: 'kg' | 'pcs'; amin: string; amax: string; from: string; to: string };
const company = () => window.location.pathname.split('/').filter(Boolean)[0] ?? '';
const base = () => `/api/${company()}/sumangal_dashboard`;
const FRAME = '/sumangal-v15.html?v=3';
const KEEP = 'sumangal.ops.filters';
const NO_FILTERS: Filters = { c: '', t: '', m: '', u: 'kg', amin: '15', amax: '45', from: '', to: '' };
let cached: Promise<Payload> | null = null;
function loadData(): Promise<Payload> {
  if (!cached) {
    cached = apiFetch<Payload>(`${base()}/v15/data`, { method: 'GET', timeout: 180000 }).catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const fmtDay = (d?: string) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const yearBefore = (d: string) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() - 364); return x.toISOString().slice(0, 10); };
function kept(): Filters {
  try { return { ...NO_FILTERS, ...JSON.parse(sessionStorage.getItem(KEEP) || '{}') }; } catch { return NO_FILTERS; }
}

/** The platform tokens the frame's styles read (tokens.css), with their current light or dark values. */
const TOKENS = ['--c-primary-50', '--c-primary-100', '--c-primary-600', '--c-primary-700', '--c-success-50', '--c-success-600', '--c-success-800', '--c-warning-50',
  '--c-warning-200', '--c-warning-600', '--c-warning-800', '--c-danger-50', '--c-danger-200', '--c-danger-600', '--c-danger-800', '--c-canvas', '--c-surface',
  '--c-surface-2', '--c-surface-3', '--c-text', '--c-text-2', '--c-text-3', '--c-border', '--c-divider', '--c-focus', '--c-chart-grid', '--c-chart-axis',
  '--c-chart-tooltip-bg', '--c-chart-tooltip-text', '--e-1', '--e-2', '--e-3', '--font-ui', '--font-mono', '--r-sm', '--r-md', '--r-lg'];
function themeMessage() {
  const html = document.documentElement;
  const cs = getComputedStyle(html);
  const vars: Record<string, string> = {};
  for (const t of TOKENS) vars[t] = cs.getPropertyValue(t).trim();
  return { type: 'sumangal-v15-theme', vars, dark: html.getAttribute('data-theme') === 'dark' };
}

const field = { '& .MuiInputBase-root': { height: 36, fontSize: 13.5 } };

export default function ErpV15() {
  const { pathname } = useLocation();
  const screen = erpBySlug(pathname.split('/').filter(Boolean)[2]);
  const navigate = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(900);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [shown, setShown] = useState<Meta>(null);
  const [runs, setRuns] = useState<Runs | null>(null);
  const [asking, setAsking] = useState<'' | 'waiting' | 'failed'>('');
  const [opts, setOpts] = useState<Options | null>(null);
  const [f, setF] = useState<Filters>(kept);
  const shownAt = useRef<string | undefined>(undefined);
  const askedAt = useRef(0);
  const pane = useRef(screen.pane);
  pane.current = screen.pane;
  const fRef = useRef(f);
  fRef.current = f;

  const post = useCallback((msg: unknown) => frame.current?.contentWindow?.postMessage(msg, window.location.origin), []);
  const set = (patch: Partial<Filters>) => setF((old) => ({ ...old, ...patch }));
  useEffect(() => {
    try { sessionStorage.setItem(KEEP, JSON.stringify(f)); } catch { /* not kept */ }
    if (f.from && f.to) post({ type: 'sumangal-v15-filters', filters: f });
  }, [f, post]);

  const send = useCallback(async () => {
    post(themeMessage());
    post({ type: 'sumangal-v15-pane', pane: pane.current });
    if (fRef.current.from) post({ type: 'sumangal-v15-filters', filters: fRef.current });
    try {
      const payload = await loadData();
      post({ type: 'sumangal-v15-data', payload });
      setState('ready');
    } catch (e) {
      setError((e as Error).message);
      setState('error');
    }
  }, [post]);

  // the menu picks the screen; the frame keeps running between screens
  useEffect(() => { post({ type: 'sumangal-v15-pane', pane: screen.pane }); }, [screen.pane, post]);
  // what the frame says: its options, its height, a screen it opened itself (a drill-down to Trace)
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow || !e.data) return;
      const d = e.data;
      if (d.type === 'sumangal-v15-height') setHeight(Math.max(300, Math.ceil(d.h)));
      else if (d.type === 'sumangal-v15-options') {
        setOpts(d.options);
        setF((old) => {
          const ok = (v: string, list: Opt[]) => (list.some((o) => o[0] === v) ? v : '');
          const end = d.options.end as string;
          return { ...old, c: ok(old.c, d.options.cust), t: ok(old.t, d.options.types), m: ok(old.m, d.options.metals),
            from: old.from && old.from <= end ? old.from : yearBefore(end), to: old.to && old.to <= end ? old.to : end };
        });
      } else if (d.type === 'sumangal-v15-pane-changed') {
        const to = erpByPane(d.pane);
        if (to && to.pane !== pane.current) navigate(`/${company()}/sumangal_dashboard/${to.slug}`);
      }
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [navigate]);
  // light / dark follows the platform
  useEffect(() => {
    const mo = new MutationObserver(() => post(themeMessage()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    return () => mo.disconnect();
  }, [post]);
  // the part of the frame on screen, so its drill-down panel opens where the reader is
  useEffect(() => {
    const el = frame.current;
    const main = el?.closest('main');
    if (!el || !main) return;
    const tell = () => {
      const fr = el.getBoundingClientRect(), mr = main.getBoundingClientRect();
      const top = Math.max(0, Math.max(mr.top, bar.current?.getBoundingClientRect().bottom ?? mr.top) - fr.top), bottom = Math.min(fr.height, mr.bottom - fr.top);
      post({ type: 'sumangal-v15-viewport', top, h: Math.max(200, bottom - top) });
    };
    tell();
    main.addEventListener('scroll', tell, { passive: true });
    window.addEventListener('resize', tell);
    const t = window.setInterval(tell, 1000);
    return () => { main.removeEventListener('scroll', tell); window.removeEventListener('resize', tell); window.clearInterval(t); };
  }, [post, state]);

  /** Drops the loaded data and restarts the frame, which asks for the data again on load. */
  const showNewer = useCallback((meta: Meta) => {
    cached = null;
    shownAt.current = meta?.loadedAt;
    setShown(meta);
    setState('loading');
    if (frame.current) frame.current.src = `${FRAME}&t=${Date.now()}`;
  }, []);

  const check = useCallback(async () => {
    try {
      const r = await apiFetch<Runs>(`${base()}/agent/runs`, { method: 'GET' });
      setRuns(r);
      if (!shownAt.current && r.data?.loadedAt) { shownAt.current = r.data.loadedAt; setShown(r.data); }
      const newer = !!(r.data?.loadedAt && shownAt.current && r.data.loadedAt > shownAt.current);
      if (askedAt.current) {
        if (newer) { askedAt.current = 0; setAsking(''); showNewer(r.data); }
        else if (r.job && r.job.status === 'done' && !r.job.ok) { askedAt.current = 0; setAsking('failed'); }
        else if (Date.now() - askedAt.current > 5 * 60000) { askedAt.current = 0; setAsking('failed'); }
      }
    } catch { /* the status line just stays as it was */ }
  }, [showNewer]);

  useEffect(() => {
    loadData().catch(() => undefined);
    check();
    const t = window.setInterval(() => check(), 60000);
    const fast = window.setInterval(() => { if (askedAt.current) check(); }, 10000);
    return () => { window.clearInterval(t); window.clearInterval(fast); };
  }, [check]);

  const refresh = useCallback(async () => {
    try {
      await apiFetch(`${base()}/agent/refresh`, { method: 'POST', body: {} });
      askedAt.current = Date.now();
      setAsking('waiting');
    } catch (e) {
      setError((e as Error).message);
      setAsking('failed');
    }
  }, []);

  const agent = runs?.agents.find((a) => a.status === 'approved');
  const listening = !!agent && agent.idle_seconds != null && agent.idle_seconds < 90;
  // opening the page asks for today's entries (the agent has no timer in the day); only when it is listening
  const autoAsked = useRef(false);
  useEffect(() => {
    if (!runs || autoAsked.current) return;
    autoAsked.current = true;
    if (listening) refresh();
  }, [runs, listening, refresh]);
  const newer = runs?.data?.loadedAt && shown?.loadedAt && runs.data.loadedAt > shown.loadedAt ? runs.data : null;
  const custOpt = opts?.cust.filter((o) => o[0] !== '') ?? [];
  const pick = (label: string, v: string, list: Opt[] | undefined, key: 't' | 'm') => (
    <TextField select size="small" label={label} value={v} onChange={(e) => set({ [key]: e.target.value })} sx={{ ...field, minWidth: 150 }}>
      {(list ?? [['', 'All']]).map(([val, lab]) => <MenuItem key={val} value={val}>{lab}</MenuItem>)}
    </TextField>
  );
  const active = !!(f.c || f.t || f.m);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title={screen.label}
        subtitle={screen.about}
        actions={(
          <Stack alignItems="flex-end" spacing={0.25}>
            <Stack direction="row" spacing={1} alignItems="center">
              {shown?.end && (
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                  As of {fmtDay(shown.end)} · loaded {fmt(shown.loadedAt)}
                  {shown.source?.includes('update') ? " (today's entries)" : shown.source?.startsWith('agent') ? ' (nightly)' : ''}
                </Typography>
              )}
              {newer && !asking && <Button size="small" variant="outlined" onClick={() => showNewer(newer)}>Newer data from {fmt(newer.loadedAt)}: show it</Button>}
              {agent && (
                <Button size="small" variant="outlined" startIcon={<RefreshRounded />} onClick={refresh} disabled={asking === 'waiting'}>
                  {asking === 'waiting' ? "Getting today's entries…" : 'Refresh now'}
                </Button>
              )}
            </Stack>
            {asking === 'waiting' && (
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', maxWidth: 460, textAlign: 'right' }}>
                {listening ? "Usually about a minute. Meanwhile this shows the data loaded earlier; it reloads when today's arrives." : 'The agent is not listening right now (outside working hours, or its PC is off). It will run when it next checks in.'}
              </Typography>
            )}
            {asking === 'failed' && <Typography sx={{ fontSize: 12, color: 'var(--c-danger-600)' }}>The update did not arrive. {agent?.last_message || ''}</Typography>}
          </Stack>
        )}
      />
      <Stack
        ref={bar}
        direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="center"
        sx={{ position: 'sticky', top: 0, zIndex: 3, mx: { xs: -2, md: -3 }, px: { xs: 2, md: 3 }, py: 1.25, mb: 2,
          background: 'var(--c-canvas)', borderBottom: '1px solid var(--c-border)' }}
      >
        <Autocomplete
          size="small" options={custOpt} value={custOpt.find((o) => o[0] === f.c) ?? null} getOptionLabel={(o) => o[1]}
          isOptionEqualToValue={(a, b) => a[0] === b[0]} onChange={(_, v) => set({ c: v ? v[0] : '' })}
          renderInput={(p) => <TextField {...p} label="Customer" placeholder="All customers" />} sx={{ ...field, width: 280 }}
        />
        {pick('Order type', f.t, opts?.types, 't')}
        {pick('Metal type', f.m, opts?.metals, 'm')}
        <ToggleButtonGroup size="small" exclusive value={f.u} onChange={(_, v) => v && set({ u: v })} sx={{ height: 36 }}>
          <ToggleButton value="kg" sx={{ px: 1.75, textTransform: 'none' }}>kg</ToggleButton>
          <ToggleButton value="pcs" sx={{ px: 1.75, textTransform: 'none' }}>Pieces</ToggleButton>
        </ToggleButtonGroup>
        {screen.age && (
          <Stack direction="row" spacing={0.75} alignItems="center">
            <TextField size="small" type="number" label="Age from (days)" value={f.amin} onChange={(e) => set({ amin: e.target.value })} sx={{ ...field, width: 128 }} />
            <TextField size="small" type="number" label="to (days)" placeholder="any" value={f.amax} onChange={(e) => set({ amax: e.target.value })} sx={{ ...field, width: 100 }} slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
        )}
        {screen.period && (
          <Stack direction="row" spacing={0.75} alignItems="center">
            <TextField size="small" type="date" label="From" value={f.from} onChange={(e) => e.target.value && set({ from: e.target.value })}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: f.to || opts?.end } }} sx={{ ...field, width: 160 }} />
            <TextField size="small" type="date" label="To" value={f.to} onChange={(e) => e.target.value && set({ to: e.target.value })}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: f.from, max: opts?.end } }} sx={{ ...field, width: 160 }} />
          </Stack>
        )}
        {active && <Button size="small" onClick={() => set({ c: '', t: '', m: '' })} sx={{ textTransform: 'none' }}>Clear filters</Button>}
      </Stack>
      {state === 'loading' && (
        <Box sx={{ mb: 1 }}>
          <LinearProgress />
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.5 }}>Loading the ERP data (about 2 MB)…</Typography>
        </Box>
      )}
      {state === 'error' && <Alert severity="error" sx={{ mb: 1 }}>The dashboard could not load its data: {error}</Alert>}
      <Box
        component="iframe"
        ref={frame}
        title={screen.label}
        src={FRAME}
        onLoad={send}
        scrolling="no"
        sx={{ height, width: '100%', border: 0, background: 'transparent', display: 'block', colorScheme: 'normal' }}
      />
    </Box>
  );
}
