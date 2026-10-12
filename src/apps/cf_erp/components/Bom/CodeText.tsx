import { Box } from '@mui/material';
import { codeWithNumbers, type CodeSegment } from '../../lib/codeSegments';

/** A row's code in mono — a catalog row's position code with the item's own code beside it. */
export function CodeText({ code, itemCode, segments }: { code: string; itemCode: string | null; segments?: CodeSegment[] | null }) {
  if (!code) return null;
  const shown = codeWithNumbers(code, segments);
  // The whole code, always: it wraps after a hyphen rather than being cut, and runs under the row's buttons.
  const parts = shown.split('-').map((t, i, all) => (i < all.length - 1 ? `${t}-` : t));
  return <><Box component="span" data-testid="row-code" sx={{ fontFamily: 'var(--font-mono)', whiteSpace: 'normal', overflowWrap: 'break-word' }}>{parts.map((t, i) => <span key={i}>{t}{i < parts.length - 1 ? <wbr /> : null}</span>)}</Box>{itemCode && itemCode !== code ? <Box component="span" sx={{ fontFamily: 'var(--font-mono)' }}> · {itemCode}</Box> : null}</>;
}
