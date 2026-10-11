import type { MouseEvent } from 'react';
import { Box } from '@mui/material';
import type { SourceMark } from '../../lib/valueSource';

/**
 * The corner marker of a value a formula gives (lib/valueSource): a small "ƒ" for worked out, "▱"
 * for from the drawing — and, where a person typed over the calculated value, a "✎" that is a
 * button: one click takes the typed value away and the calculated one comes back.
 *
 * It sits in SheetGrid's `mark` slot, which lets clicks through to the cell; only the button
 * takes them (SheetGrid ignores a click that lands on a button).
 */
export function ValueSourceMark({ mark, label, onGoBack }: {
  mark: SourceMark;
  /** What the value is called, for the button's name ("Weight of Top flange"). */
  label: string;
  onGoBack?: () => void;
}) {
  if (mark.canGoBack && onGoBack) {
    return (
      <Box component="button" type="button" data-testid="value-typed" data-source="typed" title={mark.title}
        aria-label={`${label}: ${mark.title}`}
        onClick={(e: MouseEvent) => { e.stopPropagation(); onGoBack(); }}
        onDoubleClick={(e: MouseEvent) => e.stopPropagation()}
        sx={{
          pointerEvents: 'auto', cursor: 'pointer', border: 0, p: '1px 3px', m: 0, borderRadius: 'var(--r-sm)', lineHeight: 1, fontSize: 10, fontFamily: 'var(--font-ui)',
          background: 'var(--c-warning-200)', color: 'var(--c-warning-800)',
          '&:hover, &:focus-visible': { background: 'var(--c-warning-800)', color: 'var(--c-surface)' },
        }}>{mark.glyph}</Box>
    );
  }
  return (
    <Box component="span" data-testid={mark.from === 'typed' ? 'value-typed' : 'value-source'} data-source={mark.from} title={mark.title} aria-label={mark.label}
      sx={{ lineHeight: 1, fontSize: 9, fontFamily: 'var(--font-ui)', color: mark.from === 'typed' ? 'var(--c-warning-800)' : 'var(--c-text-3)' }}>{mark.glyph}</Box>
  );
}
