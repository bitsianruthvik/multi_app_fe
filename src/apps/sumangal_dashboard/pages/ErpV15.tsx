import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { apiFetch } from '@core/api/client';

/**
 * The ERP dashboard (V15): the page merged from V13 and the rebuild review, served as /sumangal-v15.html
 * (made by tools/sumangal-v15/build.mjs) and shown in a frame. Its data comes from this app's API behind the
 * login (GET /v15/data, ~11 MB, sent gzipped) and is handed to the frame with postMessage; the frame works every
 * figure out in the browser, exactly as the reviewed HTML did.
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

export default function ErpV15() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [shown, setShown] = useState<Meta>(null);
  const [runs, setRuns] = useState<Runs | null>(null);
  const [asking, setAsking] = useState<'' | 'waiting' | 'failed'>('');
  const shownAt = useRef<string | undefined>(undefined);
  const askedAt = useRef(0);

  const send = useCallback(async () => {
    try {
      const payload = await loadData();
      frame.current?.contentWindow?.postMessage({ type: 'sumangal-v15-data', payload }, window.location.origin);
      setState('ready');
    } catch (e) {
      setError((e as Error).message);
      setState('error');
    }
  }, []);
  /** Drops the loaded data and restarts the frame, which asks for the data again on load. */
  const showNewer = useCallback((meta: Meta) => {
    cached = null;
    shownAt.current = meta?.loadedAt;
    setShown(meta);
    setState('loading');
    if (frame.current) frame.current.src = `/sumangal-v15.html?v=1&t=${Date.now()}`;
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
    const t = window.setInterval(() => check(), askedAt.current ? 10000 : 60000);
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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 96px)', minHeight: 480 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.5, minHeight: 30, flexWrap: 'wrap' }}>
        {shown?.end && (
          <Typography variant="caption" color="text.secondary">
            ERP entries up to {fmtDay(shown.end)} · loaded {fmt(shown.loadedAt)}
            {shown.source?.includes('update') ? " (today's entries)" : shown.source?.startsWith('agent') ? ' (nightly)' : ''}
          </Typography>
        )}
        {newer && !asking && (
          <Button size="small" variant="outlined" onClick={() => showNewer(newer)}>Newer data from {fmt(newer.loadedAt)}: show it</Button>
        )}
        {agent && (
          <Button size="small" onClick={refresh} disabled={asking === 'waiting'}>
            {asking === 'waiting' ? "Getting today's entries…" : 'Refresh now'}
          </Button>
        )}
        {asking === 'waiting' && (
          <Typography variant="caption" color="text.secondary">
            {listening ? 'Usually about a minute. Meanwhile this shows the data loaded earlier; it reloads when today\'s arrives.' : 'The agent is not listening right now (outside working hours, or its PC is off). It will run when it next checks in.'}
          </Typography>
        )}
        {asking === 'failed' && <Typography variant="caption" color="error">The update did not arrive. {agent?.last_message || ''}</Typography>}
      </Stack>
      {state === 'loading' && (
        <Box sx={{ mb: 1 }}>
          <LinearProgress />
          <Typography variant="caption" color="text.secondary">Loading the ERP dashboard data (about 2 MB)…</Typography>
        </Box>
      )}
      {state === 'error' && <Alert severity="error" sx={{ mb: 1 }}>The ERP dashboard could not load its data: {error}</Alert>}
      <Box
        component="iframe"
        ref={frame}
        title="ERP dashboard (V15)"
        src="/sumangal-v15.html?v=1"
        onLoad={send}
        sx={{ flex: 1, width: '100%', border: 0, borderRadius: 1, bgcolor: '#f6f7f9' }}
      />
    </Box>
  );
}
