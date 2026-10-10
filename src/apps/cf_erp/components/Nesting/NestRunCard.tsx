import { useEffect, useRef, useState } from 'react';
import { Box, Button, Collapse, LinearProgress, Typography } from '@mui/material';
import type { NestRunSnapshot } from '../../api/types';
import type { RunCurvePoint, RunV2 } from '../../api/nesting';
import { RUN_CARRIES_ON, agoWords, clock, logTime, pct as pctText, phaseWords, resumedLine, startedLine } from '../../lib/nesting';
import { SectionCard } from '../ui';

/**
 * THE RUN, AS THE SERVER REPORTS IT. A nesting run belongs to the server, not to
 * this page: the card shows where it has got to (and the log it keeps), and the
 * panel polls for the next snapshot. Leaving the page does not stop the run.
 */

/** The log: monospace, ~10 lines tall, scrolled to the newest line. */
export function NestRunLog({ log }: { log: NestRunSnapshot['log'] }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);
  return (
    <Box ref={box} data-testid="nest-run-log" role="log" aria-label="Run log" sx={{
      fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 12, lineHeight: 1.5, minWidth: 0,
      height: '15em', overflowY: 'auto', p: 1, borderRadius: 'var(--r-md)',
      background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)',
    }}>
      {log.length === 0
        ? <Box>Waiting for the first line…</Box>
        : log.map((l, i) => (
          <Box key={`${l.at}-${i}`} sx={{ display: 'flex', gap: 1, minWidth: 0 }}>
            <Box component="span" sx={{ color: 'var(--c-text-3)', flexShrink: 0 }}>{logTime(l.at)}</Box>
            <Box component="span" sx={{ overflowWrap: 'anywhere', minWidth: 0 }}>{l.text}</Box>
          </Box>
        ))}
    </Box>
  );
}

/**
 * The prominent card at the top of the nesting stage while a run is going.
 * `receivedAt` is when the snapshot arrived, so the clock ticks between polls.
 */
/** The improvement curve: waste % falling as the search goes on. One path, no per-point elements. */
export function Sparkline({ curve }: { curve: RunCurvePoint[] }) {
  const pts = curve.filter((c) => c.wastePct != null && Number.isFinite(c.atMs));
  if (pts.length < 2) return null;
  const w = 160;
  const h = 34;
  const x0 = pts[0].atMs;
  const x1 = Math.max(pts[pts.length - 1].atMs, x0 + 1);
  const ys = pts.map((c) => c.wastePct as number);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys, lo + 0.001);
  const d = pts.map((c, i) => `${i ? 'L' : 'M'}${(((c.atMs - x0) / (x1 - x0)) * (w - 4) + 2).toFixed(1)},${(h - 3 - (((c.wastePct as number) - lo) / (hi - lo)) * (h - 6)).toFixed(1)}`).join('');
  return (
    <svg data-testid="nest-run-spark" role="img" width={w} height={h} viewBox={`0 0 ${w} ${h}`}
      aria-label={`Waste fell from ${pctText(ys[0])} to ${pctText(ys[ys.length - 1])} as the search went on`}>
      <path d={d} fill="none" stroke="var(--c-primary-600)" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

export function NestRunCard({ run: base, receivedAt, onStop, onCancel, busy = false }: {
  run: NestRunSnapshot; receivedAt: number;
  /** "Stop and use this". Present = the button shows. */
  onStop?: () => void;
  onCancel?: () => void;
  busy?: boolean;
}) {
  const run = base as RunV2;
  const [details, setDetails] = useState(false);
  const resumed = resumedLine(run.progress.resumes, run.resumed);
  const savedAgo = agoWords(run.progress.checkpointAgeMs);
  const ka = run.progress.keepAwake && run.progress.keepAwake.configured !== false ? run.progress.keepAwake : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const elapsed = (run.elapsedMs + Math.max(0, now - receivedAt)) / 1000;
  const pct = Math.max(0, Math.min(100, run.progress.pct));
  const upTo = run.budgetMs ? ` of ${clock(run.budgetMs / 1000)}` : '';
  const best = run.progress.best ?? null;
  const curve = run.progress.curve ?? [];
  return (
    <SectionCard title="Nesting is running" subtitle={RUN_CARRIES_ON}>
      <Box data-testid="nest-run-card" role="status" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.25, minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <Box sx={{ fontSize: 14, fontWeight: 600 }}>{phaseWords(run)}</Box>
          <Box sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            {`${clock(elapsed)}${upTo} used`}
          </Box>
        </Box>
        <LinearProgress variant="determinate" value={pct} aria-label="Nesting progress" sx={{ height: 8, borderRadius: 4 }} />
        <Box data-testid="nest-run-best" sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', fontSize: 13.5 }}>
          {best
            ? <span>{`Best so far: ${best.plates} ${best.plates === 1 ? 'plate' : 'plates'} · ${pctText(best.wastePct)} waste${best.unplaced ? ` · ${best.unplaced} not placed` : ''}`}</span>
            : <span style={{ color: 'var(--c-text-3)' }}>Looking for the first layout…</span>}
          <Sparkline curve={curve} />
        </Box>
        {resumed && <Typography data-testid="nest-run-resumed" sx={{ fontSize: 13 }}>{resumed}</Typography>}
        {savedAgo && <Typography data-testid="nest-run-checkpoint" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{`Last saved ${savedAgo}`}</Typography>}
        {run.stopRequested && <Typography data-testid="nest-run-stopping" sx={{ fontSize: 13 }}>Stopping. It will finish with the best layout so far.</Typography>}
        {(onStop || onCancel) && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {onStop && <Button variant="contained" size="small" onClick={onStop} disabled={busy || (run.canStop === false && !run.resumed && !run.elsewhere) || !!run.stopRequested}>Stop and use this</Button>}
            {onCancel && <Button size="small" onClick={onCancel} disabled={busy}>Cancel</Button>}
          </Box>
        )}
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{startedLine(run)}</Typography>
        {ka && (
          <Box>
            <Button size="small" data-testid="nest-run-details-toggle" onClick={() => setDetails((d) => !d)}>{details ? 'Hide details' : 'Details'}</Button>
            <Collapse in={details} unmountOnExit>
              <Box data-testid="nest-run-details" component="ul" sx={{ m: 0, pl: 2.5, fontSize: 12.5, color: 'var(--c-text-2)', display: 'grid', gap: 0.3 }}>
                <li>{`Keeping the server awake: ${ka.on ? 'on' : 'off'}`}</li>
                {ka.lastOkAt && <li>{`Last answered ${agoWords(Date.now() - new Date(ka.lastOkAt).getTime())}`}</li>}
                {(ka.failures ?? 0) > 0 && <li>{`${ka.failures} failed ${ka.failures === 1 ? 'ping' : 'pings'}${ka.lastError ? `: ${ka.lastError}` : ''}`}</li>}
              </Box>
            </Collapse>
          </Box>
        )}
        <NestRunLog log={run.log} />
      </Box>
    </SectionCard>
  );
}
