import { useState } from 'react';
import { Box, Popover, Typography } from '@mui/material';
import { CfApiError } from '../../api/client';
import type { ReadyReason, ReadyState } from '../../api/requisitions';
import { byReadyRank, readyLabel, readyTone, shortDate } from '../../lib/requisition';
import { qtyText } from '../../lib/inventory';
import { Badge, Mono } from '../ui';

/**
 * "Can production start?" for one unit of work, in the server's words: Ready · Ready from 14 Oct · Waiting for stock ·
 * Late since 20 Oct. Click it for the reasons — material by material: what is needed, what covers it, what is short.
 * The state is only coloured here, never worked out. Reasons come with the chip, or are fetched when it is opened.
 */
export function MaterialReadyChip({ state, date, text, reasons, load, testId = 'material-ready' }: {
  state: ReadyState | null;
  date: string | null;
  /** The server's sentence for the whole unit. */
  text?: string | null;
  reasons?: ReadyReason[];
  /** Fetches the reasons when the chip is opened (a line-level read). */
  load?: () => Promise<ReadyReason[]>;
  testId?: string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [loaded, setLoaded] = useState<ReadyReason[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = readyLabel(state, date);
  const list = reasons ?? loaded;
  const open = (el: HTMLElement) => {
    setAnchor(el);
    if (!reasons && load && !loaded) load().then(setLoaded).catch((e) => setError(e instanceof CfApiError ? e.message : 'The reasons could not be loaded.'));
  };
  return (
    <>
      <Box component="button" type="button" data-testid={testId} data-state={state ?? 'unknown'} title={text ?? label} aria-haspopup="dialog"
        onClick={(e) => open(e.currentTarget)}
        sx={{ border: 0, background: 'none', p: 0, cursor: 'pointer', font: 'inherit', display: 'inline-flex' }}>
        <Badge family={readyTone(state)} label={label} />
      </Box>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box data-testid="material-ready-reasons" sx={{ p: 1.5, maxWidth: 460, display: 'grid', gap: 1 }}>
          {text && <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{text}</Typography>}
          {!list && !error && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Looking at the material…</Typography>}
          {error && <Typography sx={{ fontSize: 12.5, color: 'var(--c-danger-700)' }}>{error}</Typography>}
          {list && list.length === 0 && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>This needs no material.</Typography>}
          {list && [...list].sort(byReadyRank).map((r, i) => <ReasonRow key={`${r.item.id}-${i}`} r={r} />)}
        </Box>
      </Popover>
    </>
  );
}

function coverWords(r: ReadyReason): string {
  const parts = r.cover.map((c) => {
    const q = qtyText(c.qty);
    switch (c.kind) {
      case 'held': return `${q} held`;
      case 'issued': return `${q} issued`;
      case 'reserved': return `${q} reserved`;
      case 'free': return `${q} free in stock`;
      case 'po': return `${q} on ${c.poCode ?? 'a PO'}${c.status === 'dated' && c.date ? ` due ${shortDate(c.date)}` : c.status === 'undated' ? ' (no date)' : c.status === 'asked' ? ' (asked for)' : ''}${c.pooled ? ' (bought for stock)' : ''}`;
      default: return `${q} not covered`;
    }
  });
  return parts.join(' · ');
}

function ReasonRow({ r }: { r: ReadyReason }) {
  return (
    <Box data-testid="ready-reason" data-state={r.state} sx={{ display: 'grid', gap: 0.25, pb: 0.75, borderBottom: '1px solid var(--c-divider)' }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <Mono>{r.item.code ?? r.item.name}</Mono>
        <Mono muted>needs {qtyText(r.need)} {r.item.uom}</Mono>
        {r.short > 0 && <Mono sx={{ color: 'var(--c-danger-700)' }}>short {qtyText(r.short)}</Mono>}
        <Badge family={readyTone(r.state)} label={r.state === 'waiting' ? (r.skipped ? 'Skipped — waits' : 'Waiting') : readyLabel(r.state, r.date)} noIcon />
      </Box>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{r.text}</Typography>
      {r.cover.length > 0 && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{coverWords(r)}</Typography>}
    </Box>
  );
}
