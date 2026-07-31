import { Box } from '@mui/material';

/**
 * Table/detail cell primitives (DESIGN_SYSTEM.md §5.4).
 *
 * These exist so the "numbers are mono, tabular and right-aligned" rule is
 * enforced in one place instead of being re-declared as an `sx` prop on every
 * numeric column of every screen. Right-alignment matters: it is what lets a
 * reader compare magnitudes down a column at a glance, and it is the single
 * cheapest thing that separates a considered data table from a web page with
 * numbers in it.
 */

const MONO = {
  fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums' as const,
};

/**
 * Coerce a value that *should* be numeric into a number, or null.
 *
 * MySQL returns DECIMAL columns as **strings** through mysql2 (to avoid
 * precision loss), so a `const_value` of 7850 arrives as `"7850.000000"`.
 * Without this, `String.prototype.toLocaleString()` silently returns the raw
 * string and the cell renders "7850.000000" instead of "7,850". Every numeric
 * cell must go through here — do not assume the API gave you a number.
 */
function toNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** A plain number. `dp` fixes decimal places; nullish renders an em dash. */
export function NumberCell({
  value,
  dp,
  tone,
}: {
  value: number | string | null | undefined;
  dp?: number;
  tone?: 'default' | 'muted' | 'success' | 'warning' | 'danger';
}) {
  const color =
    tone === 'muted' ? 'var(--c-text-3)'
    : tone === 'success' ? 'var(--c-success-600)'
    : tone === 'warning' ? 'var(--c-warning-600)'
    : tone === 'danger' ? 'var(--c-danger-600)'
    : 'var(--c-text)';
  const n = toNumber(value);
  if (n === null) {
    return <Box component="span" sx={{ ...MONO, color: 'var(--c-text-3)' }}>—</Box>;
  }
  return (
    <Box component="span" sx={{ ...MONO, color }}>
      {dp == null
        // Trailing DECIMAL zeros are noise: 7850.000000 → "7,850", 2.50 → "2.5".
        ? n.toLocaleString(undefined, { maximumFractionDigits: 6 })
        : n.toFixed(dp)}
    </Box>
  );
}

/**
 * A quantity with its unit. The unit is rendered in the muted secondary colour
 * at a smaller size so a column of quantities still scans as a column of
 * numbers rather than a column of strings.
 */
export function QtyCell({
  value,
  uom,
  dp = 2,
}: {
  value: number | string | null | undefined;
  uom?: string | null;
  dp?: number;
}) {
  const n = toNumber(value);
  if (n === null) {
    return <Box component="span" sx={{ ...MONO, color: 'var(--c-text-3)' }}>—</Box>;
  }
  // Drop trailing zeros so 5.00 reads as 5 but 5.25 keeps its precision.
  const text = Number.isInteger(n) ? String(n) : n.toFixed(dp).replace(/\.?0+$/, '');
  return (
    <Box component="span" sx={{ ...MONO, color: 'var(--c-text)', whiteSpace: 'nowrap' }}>
      {text}
      {uom && (
        <Box component="span" sx={{ ml: 0.5, fontSize: 11, color: 'var(--c-text-3)' }}>
          {uom}
        </Box>
      )}
    </Box>
  );
}

/**
 * An ISO date or datetime, rendered mono so dates align down a column.
 * `withTime` shows HH:MM. Bad/missing input renders an em dash rather than
 * "Invalid Date" — a table should never surface a parse failure as data.
 */
export function DateCell({
  value,
  withTime = false,
}: {
  value: string | Date | null | undefined;
  withTime?: boolean;
}) {
  if (!value) {
    return <Box component="span" sx={{ ...MONO, color: 'var(--c-text-3)' }}>—</Box>;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return <Box component="span" sx={{ ...MONO, color: 'var(--c-text-3)' }}>—</Box>;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return (
    <Box component="span" sx={{ ...MONO, color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>
      {date}
      {withTime && (
        <Box component="span" sx={{ ml: 0.75, color: 'var(--c-text-3)' }}>
          {pad(d.getHours())}:{pad(d.getMinutes())}
        </Box>
      )}
    </Box>
  );
}
