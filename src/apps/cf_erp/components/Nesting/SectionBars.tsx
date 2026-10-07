import { Box, Tooltip } from '@mui/material';
import type { Bar } from '../../api/sectionNesting';
import { mm, pieceColour } from '../../lib/nesting';
import { Mono } from '../ui';

/**
 * One stock bar, drawn to scale from its left end: the end trim, each cut piece
 * (its code and length), the saw kerf between them, the waste, and — at the far
 * end — the leftover that is kept as an offcut. `scale` is the longest bar of
 * the profile, so shorter bars read shorter.
 */

/** A readable word for what a bar is made of. */
const barSource = (b: Bar) => (b.source === 'offcut' ? 'From an offcut' : 'Bought');

export function BarDiagram({ bar, scale, kerfMm }: { bar: Bar; scale: number; kerfMm: number }) {
  const total = Math.max(scale, bar.lengthMm, 1);
  const pctOf = (v: number) => `${(Math.max(0, v) / total) * 100}%`;
  const cuts = [...bar.cuts].sort((a, b) => a.xMm - b.xMm);
  const lastEnd = cuts.length ? cuts[cuts.length - 1].xMm + cuts[cuts.length - 1].lengthMm : 0;
  const keptStart = Math.max(lastEnd, bar.lengthMm - bar.keptOffcutMm);
  const label = `${bar.itemCode ?? 'Offcut'} ${mm(bar.lengthMm)} mm: ${cuts.map((c) => `${c.code ?? 'piece'} ${mm(c.lengthMm)}`).join(', ') || 'no cuts'}`
    + `${bar.keptOffcutMm > 0 ? `; offcut ${mm(bar.keptOffcutMm)} kept` : ''}`;
  return (
    <Box role="img" aria-label={label} data-testid="section-bar"
      sx={{ position: 'relative', height: 30, width: '100%', borderRadius: 'var(--r-sm)', overflow: 'hidden', background: 'var(--c-surface-3)', border: '1px solid var(--c-border)' }}>
      {/* the bar itself: the part that is not a piece, a kept offcut or a kerf is waste */}
      <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pctOf(bar.lengthMm), background: 'var(--c-surface-3)' }} />
      {cuts.map((c) => (
        <Tooltip key={`${c.cutPieceId}-${c.xMm}`} title={`${c.code ?? 'Piece'} · ${mm(c.lengthMm)} mm · starts at ${mm(c.xMm)} mm${kerfMm ? ` · ${mm(kerfMm)} mm saw cut after` : ''}`}>
          <Box data-testid="section-cut" sx={{
            position: 'absolute', left: pctOf(c.xMm), width: pctOf(c.lengthMm), top: 0, bottom: 0, background: pieceColour(c.cutPieceId),
            color: 'var(--c-surface)', fontSize: 10.5, lineHeight: '28px', px: 0.5, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            boxShadow: 'inset -1px 0 0 var(--c-surface)',
          }}>
            {(c.lengthMm / total) > 0.07 ? `${c.code ?? ''} · ${mm(c.lengthMm)}` : ''}
          </Box>
        </Tooltip>
      ))}
      {bar.keptOffcutMm > 0 && (
        <Tooltip title={`Offcut kept: ${mm(bar.keptOffcutMm)} mm`}>
          <Box data-testid="section-kept" sx={{
            position: 'absolute', left: pctOf(keptStart), width: pctOf(bar.keptOffcutMm), top: 0, bottom: 0,
            background: 'repeating-linear-gradient(135deg, var(--c-success-100), var(--c-success-100) 4px, var(--c-success-200) 4px, var(--c-success-200) 8px)',
            borderLeft: '1px dashed var(--c-success-600)',
          }} />
        </Tooltip>
      )}
    </Box>
  );
}

/** The words under one bar: where it came from, what it holds, what is lost and what is kept. */
export function BarCaption({ bar, index }: { bar: Bar; index: number }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 12, color: 'var(--c-text-2)', minWidth: 0 }}>
      <Mono>{bar.lotNo ?? `Bar ${index + 1}`}</Mono>
      <span>{barSource(bar)}{bar.itemCode ? ' ' : ''}{bar.itemCode ? <Mono muted>{bar.itemCode}</Mono> : null}</span>
      <span>{mm(bar.lengthMm)} mm</span>
      <span>{bar.cuts.length} {bar.cuts.length === 1 ? 'cut' : 'cuts'}</span>
      <span>waste {mm(bar.wasteMm)} mm</span>
      {bar.keptOffcutMm > 0 && <span style={{ color: 'var(--c-success-700)' }}>offcut {mm(bar.keptOffcutMm)} mm kept</span>}
    </Box>
  );
}
