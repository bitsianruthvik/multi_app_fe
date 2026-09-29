import { Box, Tooltip } from '@mui/material';
import { WASTE_COLOUR, WASTE_HELP, kg, pct, type WastePart } from '../../lib/nesting';

/**
 * A plate split by cause, as one stacked bar and a legend underneath:
 * Parts, Kerf, Sequence gaps, Rim, Offcut, Wastage — kg and %. Only the last
 * one is really wasted; the rest is what cutting costs, or plate kept for later.
 */
export function WasteBar({ parts, compact = false }: { parts: WastePart[]; compact?: boolean }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75, minWidth: 0 }}>
      <Box role="img" aria-label={parts.map((p) => `${p.label} ${kg(p.kg)} kg, ${pct(p.pct)}`).join('; ')}
        sx={{ display: 'flex', height: compact ? 10 : 14, borderRadius: 'var(--r-sm)', overflow: 'hidden', background: 'var(--c-surface-3)' }}>
        {parts.filter((p) => p.pct > 0).map((p) => (
          <Tooltip key={p.key} title={`${p.label}: ${kg(p.kg)} kg · ${pct(p.pct)}`}>
            <Box sx={{ width: `${p.pct}%`, minWidth: 2, background: WASTE_COLOUR[p.key] }} />
          </Tooltip>
        ))}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1.75, rowGap: 0.5, minWidth: 0 }}>
        {parts.map((p) => (
          <Tooltip key={p.key} title={WASTE_HELP[p.key]}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, fontSize: 12, color: 'var(--c-text-2)', minWidth: 0 }}>
              <Box sx={{ width: 9, height: 9, borderRadius: '2px', background: WASTE_COLOUR[p.key], flexShrink: 0 }} />
              <span>{p.label}</span>
              <Box component="span" sx={{ color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>
                {`${kg(p.kg)} kg · ${pct(p.pct)}`}
              </Box>
            </Box>
          </Tooltip>
        ))}
      </Box>
    </Box>
  );
}
