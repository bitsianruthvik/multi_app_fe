import { useEffect, useRef, useState } from 'react';
import { Box, LinearProgress, Typography } from '@mui/material';
import type { NestRunSnapshot } from '../../api/types';
import { RUN_CARRIES_ON, clock, logTime, phaseWords, startedLine } from '../../lib/nesting';
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
export function NestRunCard({ run, receivedAt }: { run: NestRunSnapshot; receivedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const elapsed = (run.elapsedMs + Math.max(0, now - receivedAt)) / 1000;
  const pct = Math.max(0, Math.min(100, run.progress.pct));
  const upTo = run.budgetMs ? `up to ${Math.max(1, Math.round(run.budgetMs / 60000))} min` : null;
  return (
    <SectionCard title="Nesting is running" subtitle={RUN_CARRIES_ON}>
      <Box data-testid="nest-run-card" role="status" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.25, minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <Box sx={{ fontSize: 14, fontWeight: 600 }}>{phaseWords(run)}</Box>
          <Box sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            {`${Math.round(pct)}% · ${clock(elapsed)} elapsed${upTo ? ` · ${upTo}` : ''}`}
          </Box>
        </Box>
        <LinearProgress variant="determinate" value={pct} aria-label="Nesting progress" sx={{ height: 8, borderRadius: 4 }} />
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{startedLine(run)}</Typography>
        <NestRunLog log={run.log} />
      </Box>
    </SectionCard>
  );
}
