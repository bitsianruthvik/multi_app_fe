import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Button, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import { apiFetch } from '@core/api/client';
import { base, DataCtx, loadData, resetData, useErpData, type Meta, type Runs } from './erpLoad';

/**
 * The dashboard's data: loading it (GET /v15/data, ~11 MB, sent gzipped, kept for the browser tab), and how fresh it
 * is, shown once in the top bar with Refresh (user, 2026-11-25: not on every screen).
 *
 * The ERP agent on the customer's network sends a full dataset each night at 02:00. The rest of the time (any hour,
 * every day, since 2026-11-26) it has no timer: the page asks it for today's entries (GET/POST /agent/runs, /agent/refresh) as
 * soon as it is listening and what is shown is not today's update, once per opening, and Refresh asks again. The
 * update reloads the screen when it lands; data that arrives otherwise is offered, never swapped in under the reader.
 */
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
const isToday = (iso?: string) => !!iso && new Date(iso).toDateString() === new Date().toDateString();


export function ErpDataProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Meta>(null);
  const [runs, setRuns] = useState<Runs | null>(null);
  const [asking, setAsking] = useState<'' | 'waiting' | 'failed'>('');
  const [reload, setReload] = useState(0);
  const shownAt = useRef<string | undefined>(undefined);
  const askedAt = useRef(0);

  const take = useCallback((meta: Meta) => {
    resetData();
    shownAt.current = meta?.loadedAt;
    setShown(meta);
    setReload((n) => n + 1);
  }, []);
  const check = useCallback(async () => {
    try {
      const r = await apiFetch<Runs>(`${base()}/agent/runs`, { method: 'GET' });
      setRuns(r);
      if (!shownAt.current && r.data?.loadedAt) { shownAt.current = r.data.loadedAt; setShown(r.data); }
      const newer = !!(r.data?.loadedAt && shownAt.current && r.data.loadedAt > shownAt.current);
      if (askedAt.current) {
        if (newer) { askedAt.current = 0; setAsking(''); take(r.data); }
        else if (r.job && r.job.status === 'done' && !r.job.ok) { askedAt.current = 0; setAsking('failed'); }
        else if (Date.now() - askedAt.current > 5 * 60000) { askedAt.current = 0; setAsking('failed'); }
      }
    } catch { /* the status just stays as it was */ }
  }, [take]);
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
    } catch {
      setAsking('failed');
    }
  }, []);
  const agent = runs?.agents.find((a) => a.status === 'approved');
  const listening = !!agent && agent.idle_seconds != null && agent.idle_seconds < 90;
  const freshToday = !!shown?.source?.includes('update') && isToday(shown?.loadedAt);
  const autoAsked = useRef(false);
  useEffect(() => {
    if (!runs || autoAsked.current || !listening || freshToday) return;
    autoAsked.current = true;
    refresh();
  }, [runs, listening, freshToday, refresh]);
  const showNewer = useCallback(() => { if (runs?.data) take(runs.data); }, [runs, take]);
  const value = useMemo(() => ({ reload, shown, runs, asking, refresh, showNewer }), [reload, shown, runs, asking, refresh, showNewer]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

/** Top bar: when the data was loaded, and Refresh. */
export function ErpDataStatus() {
  const c = useErpData();
  if (!c?.shown?.loadedAt) return null;
  const { shown, runs, asking } = c;
  const agent = runs?.agents.find((a) => a.status === 'approved');
  const listening = !!agent && agent.idle_seconds != null && agent.idle_seconds < 90;
  const freshToday = !!shown?.source?.includes('update') && isToday(shown?.loadedAt);
  const label = freshToday ? `Updated ${time(shown?.loadedAt)}` : isToday(shown?.loadedAt) ? `Nightly ${time(shown?.loadedAt)}` : fmt(shown?.loadedAt);
  const help = freshToday ? "Today's ERP entries, as of this time."
    : `ERP copy loaded ${fmt(shown?.loadedAt)}: entries up to the day before. ${listening ? 'Refresh gets today’s entries (about a minute).' : 'The ERP agent is not answering just now; Refresh asks it again.'}`;
  const newer = runs?.data?.loadedAt && shown?.loadedAt && runs.data.loadedAt > shown.loadedAt;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 1 }}>
      {newer && !asking && <Button size="small" onClick={c.showNewer} sx={{ textTransform: 'none' }}>Newer data: show</Button>}
      <Tooltip title={asking === 'failed' ? `The update did not arrive. ${agent?.last_message || ''}` : help} arrow>
        <Typography sx={{ fontSize: 12, color: asking === 'failed' ? 'var(--c-danger-600)' : 'var(--c-text-3)', whiteSpace: 'nowrap', cursor: 'default' }}>
          {asking === 'waiting' ? 'Getting today’s entries…' : asking === 'failed' ? 'Update failed' : label}
        </Typography>
      </Tooltip>
      {agent && (
        <Tooltip title="Refresh: get today's entries" arrow>
          <span>
            <IconButton size="small" onClick={c.refresh} disabled={asking === 'waiting'} aria-label="Refresh">
              {asking === 'waiting' ? <CircularProgress size={16} /> : <RefreshRounded sx={{ fontSize: 18 }} />}
            </IconButton>
          </span>
        </Tooltip>
      )}
    </Box>
  );
}
