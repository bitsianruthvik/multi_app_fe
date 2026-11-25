import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '@core/api/client';
import { PageHeader } from '@shared/ui';
import { erpByPane, erpBySlug } from '../erpScreens';

/**
 * The operations dashboard (V15). Its figures are worked out by the page built from the reviewed HTML
 * (public/sumangal-v15.html, made by tools/sumangal-v15/build.mjs), shown in a frame below this screen's title.
 * The app's menu picks the screen (route erp/:screen); the frame has no header or tabs of its own and takes the
 * platform's fonts, colours and light/dark theme from this page (posted as CSS variables).
 * Data comes from this app's API behind the login (GET /v15/data, ~11 MB, sent gzipped) and is posted to the frame.
 *
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
const company = () => window.location.pathname.split('/').filter(Boolean)[0] ?? '';
const base = () => `/api/${company()}/sumangal_dashboard`;
const FRAME = '/sumangal-v15.html?v=2';
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

export default function ErpV15() {
  const { screen: slug } = useParams();
  const screen = erpBySlug(slug);
  const navigate = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(600);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [shown, setShown] = useState<Meta>(null);
  const [runs, setRuns] = useState<Runs | null>(null);
  const [asking, setAsking] = useState<'' | 'waiting' | 'failed'>('');
  const shownAt = useRef<string | undefined>(undefined);
  const askedAt = useRef(0);
  const pane = useRef(screen.pane);
  pane.current = screen.pane;

  const post = useCallback((msg: unknown) => frame.current?.contentWindow?.postMessage(msg, window.location.origin), []);
  const send = useCallback(async () => {
    post(themeMessage());
    post({ type: 'sumangal-v15-pane', pane: pane.current });
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
  // a screen opened from inside the frame (a drill-down to Trace) moves the menu with it
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow || e.data?.type !== 'sumangal-v15-pane-changed') return;
      const to = erpByPane(e.data.pane);
      if (to && to.pane !== pane.current) navigate(`/${company()}/sumangal_dashboard/erp/${to.slug}`);
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
  // the frame fills the screen below the title
  useLayoutEffect(() => {
    const fit = () => { const top = frame.current?.getBoundingClientRect().top ?? 200; setHeight(Math.max(420, window.innerHeight - top - 16)); };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [shown, state, asking]);

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
                  ERP entries to {fmtDay(shown.end)} · loaded {fmt(shown.loadedAt)}
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
        sx={{ height, width: '100%', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', bgcolor: 'var(--c-canvas)', display: 'block' }}
      />
    </Box>
  );
}
