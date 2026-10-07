import { useEffect, useState, type MouseEvent } from 'react';
import { Autocomplete, Box, Popover, TextField, Typography } from '@mui/material';
import ArrowDropDownRounded from '@mui/icons-material/ArrowDropDownRounded';
import { CfApiError } from '../api/client';
import { searchSectionStock, sectionSizeText, type CutRef, type SectionStockRow } from '../api/cutting';
import { useDebounced } from '../hooks/usePagedList';
import { Mono } from './ui';

/**
 * Picks the stock bar a section part is cut from (GET /section-stock?search=).
 * The list is the catalog items filed in the section stock places on Setup ›
 * Cutting, searched by size — "75 x 75 x 8", "75×75×8" and "75 75 8" all find
 * the same angle. The search waits for a pause in typing.
 */
export function SectionPicker({ value, onPick, label = 'Section', helperText, disabled, autoFocus, size = 'small' }: {
  value: CutRef | null;
  /** The chosen row, or null when the field is cleared. */
  onPick: (row: SectionStockRow | null) => void;
  label?: string;
  helperText?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  size?: 'small' | 'medium';
}) {
  const [text, setText] = useState('');
  const query = useDebounced(text, 250);
  const [rows, setRows] = useState<SectionStockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    searchSectionStock(query)
      .then((r) => { if (alive) { setRows(r); setError(null); } })
      .catch((e) => { if (alive) setError(e instanceof CfApiError ? e.message : 'The sections could not be read.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [query]);
  // The chosen section stays in the list even when the search no longer finds it, so the field keeps showing it.
  const current: SectionStockRow | null = value ? (rows.find((r) => r.id === value.id) ?? {
    id: value.id, code: value.code, name: value.name, thickness: null, width: null, depth: null, lengthMm: null, sectionArea: null, grade: null, nodeName: null,
  }) : null;
  const options = current && !rows.some((r) => r.id === current.id) ? [current, ...rows] : rows;
  return (
    <Autocomplete
      size={size}
      fullWidth
      options={options}
      value={current}
      disabled={disabled}
      loading={loading}
      openOnFocus
      filterOptions={(o) => o}
      // The field shows the chosen section itself; only what is typed is searched.
      onInputChange={(_, v, reason) => { if (reason === 'input') setText(v); else if (text !== '') setText(''); }}
      noOptionsText={error ?? 'No section matches. Try the size, like 75 x 75 x 8.'}
      getOptionLabel={(r) => [r.code, r.name].filter(Boolean).join(' · ')}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, r) => onPick(r)}
      renderOption={(props, r) => (
        <Box component="li" {...props} key={r.id} sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Mono sx={{ minWidth: 120 }}>{r.code ?? '—'}</Mono>
          <Typography sx={{ flex: 1, fontSize: 14, minWidth: 0 }}>{r.name}</Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{sectionSizeText(r)}</Typography>
        </Box>
      )}
      renderInput={(params) => (
        <TextField {...params} autoFocus={autoFocus} label={label} helperText={helperText} placeholder="Type a size, like 75 x 75 x 8"
          inputProps={{ ...params.inputProps, 'data-testid': 'section-picker' }} />
      )}
    />
  );
}

/**
 * A section part's section, ON THE ROW of the structure grid: a quiet chip that
 * names the section (or asks for one) and opens the picker in a small popover.
 */
export function SectionCell({ value, editable, why, onPick }: {
  value: CutRef | null;
  editable: boolean;
  why?: string;
  onPick: (row: SectionStockRow | null) => Promise<void> | void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const stop = (e: MouseEvent) => e.stopPropagation();
  const name = value ? (value.code ?? value.name) : null;
  const base = {
    all: 'unset', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', gap: 0.25, whiteSpace: 'nowrap',
    fontSize: 10.5, lineHeight: '16px', px: 0.75, borderRadius: 'var(--r-sm)', flexShrink: 0, maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis',
  } as const;
  const tone = value
    ? { background: 'var(--c-surface-3)', color: 'var(--c-text-2)' }
    : { background: 'var(--c-warning-200)', color: 'var(--c-warning-800)', fontWeight: 600 };
  if (!editable) {
    return (
      <Box component="span" data-testid="section-cell" title={why ?? (value ? `Cut from ${value.name}` : 'No section chosen yet.')} sx={{ ...base, ...tone }}>
        {name ? `Section: ${name}` : 'No section'}
      </Box>
    );
  }
  return (
    <>
      <Box component="button" type="button" data-testid="section-cell" onClick={(e: MouseEvent<HTMLElement>) => { e.stopPropagation(); setAnchor(e.currentTarget); }}
        onMouseDown={stop} onDoubleClick={stop} disabled={busy}
        aria-label={name ? `Section of this part: ${name}. Choose another` : 'Choose the section this part is cut from'}
        title={value ? `Cut from ${value.name}. Click to choose another.` : 'Choose the stock bar this part is cut from.'}
        sx={{ ...base, ...tone, cursor: 'pointer', '&:focus-visible': { outline: '2px solid var(--c-primary-400)' } }}>
        {name ? `Section: ${name}` : 'Choose section'}<ArrowDropDownRounded sx={{ fontSize: 14, mr: -0.5 }} />
      </Box>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ p: 1.5, width: 380, maxWidth: '90vw' }} onClick={stop} onMouseDown={stop}>
          <SectionPicker value={value} autoFocus label="Section" disabled={busy}
            helperText="The stock bar this part is cut to length from."
            onPick={async (row) => {
              setBusy(true);
              try { await onPick(row); setAnchor(null); } finally { setBusy(false); }
            }} />
        </Box>
      </Popover>
    </>
  );
}
