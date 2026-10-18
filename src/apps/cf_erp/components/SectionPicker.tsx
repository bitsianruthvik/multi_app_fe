import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Autocomplete, Box, Button, Popover, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowDropDownRounded from '@mui/icons-material/ArrowDropDownRounded';
import { cfApi, CfApiError } from '../api/client';
import { nearestSectionStock, searchSectionStock, sectionSizeText, type CutRef, type SectionNearest, type SectionStockRow } from '../api/cutting';
import type { MasterRecord, ScreenTree } from '../api/types';
import { useDebounced } from '../hooks/usePagedList';
import { screenTreePath } from '../lib/classificationScreens';
import { canAddSize, nearOptions, newSizeValues, sizeLabel } from '../lib/sectionPick';
import { CreateRecordDialog } from './CreateRecordDialog';
import { Mono } from './ui';

type Option = { row: SectionStockRow; group: string | null; more: number };

/**
 * Picks the stock bar a section part is cut from (GET /section-stock?search=).
 * The list is the catalog items filed in the section stock places on Setup ›
 * Cutting, searched by size — "75 x 75 x 8", "75×75×8", "75 75 8", "L75*75*8"
 * and "ISA75" all find the same angle. The search waits for a pause in typing.
 *
 * A size the catalog does not have (walkthrough 2026-10-18 step 13: "110 x 110 x 12" found nothing) shows the NEAREST
 * sizes of the same profile instead (GET /section-stock/nearest), each group saying how it differs and whether it is
 * heavier or lighter, and offers "Add 110 × 110 × 12 to the catalog": the usual new-item form, filled in like the
 * nearest bar with the typed size; the new bar is picked once it is created.
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
  const [near, setNear] = useState<SectionNearest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    searchSectionStock(query)
      .then(async (r) => {
        // Nothing by that name: read it as a size, and offer the nearest sizes the catalog has.
        const n = !r.length && query.trim() ? await nearestSectionStock(query).catch(() => null) : null;
        if (!alive) return;
        setRows(r); setNear(n); setError(null);
      })
      .catch((e) => { if (alive) setError(e instanceof CfApiError ? e.message : 'The sections could not be read.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [query]);
  // The chosen section stays in the list even when the search no longer finds it, so the field keeps showing it.
  const current: SectionStockRow | null = useMemo(() => (value ? (rows.find((r) => r.id === value.id) ?? near?.nearest.flatMap((g) => g.bars).find((r) => r.id === value.id) ?? {
    id: value.id, code: value.code, name: value.name, thickness: null, width: null, depth: null, lengthMm: null, sectionArea: null, grade: null, nodeName: null,
  }) : null), [value, rows, near]);
  const options: Option[] = useMemo(() => {
    const list: Option[] = near
      ? [...near.exact.map((row) => ({ row, group: 'This size', more: 0 })), ...nearOptions(near.nearest).map((o) => ({ ...o, group: `Nearest: ${o.group}` }))]
      : rows.map((row) => ({ row, group: null, more: 0 }));
    return current && !list.some((o) => o.row.id === current.id) ? [{ row: current, group: list.some((o) => o.group) ? 'Chosen now' : null, more: 0 }, ...list] : list;
  }, [rows, near, current]);
  const chosen = current ? options.find((o) => o.row.id === current.id) ?? null : null;
  const addable = !!near && canAddSize(near.size, near.exact, near.like);
  const newValues = near ? newSizeValues(near.size, near.like) : {};
  const noneWords = error ?? (near?.size
    ? `No ${sizeLabel(near.size)} in the catalog, and nothing near it.`
    : 'No section matches. Try the size, like 75 x 75 x 8.');
  return (
    <>
      <Autocomplete
        size={size}
        fullWidth
        options={options}
        value={chosen}
        disabled={disabled}
        loading={loading}
        openOnFocus
        filterOptions={(o) => o}
        groupBy={(o) => o.group ?? ''}
        // The field shows the chosen section itself; only what is typed is searched.
        onInputChange={(_, v, reason) => { if (reason === 'input') setText(v); else if (text !== '') setText(''); }}
        noOptionsText={noneWords}
        getOptionLabel={(o) => [o.row.code, o.row.name].filter(Boolean).join(' · ')}
        isOptionEqualToValue={(a, b) => a.row.id === b.row.id}
        onChange={(_, o) => onPick(o?.row ?? null)}
        renderGroup={(params) => (
          <li key={params.key}>
            {params.group && (
              <Box data-testid="section-group" sx={{ position: 'sticky', top: -8, zIndex: 1, px: 1.5, py: 0.5, fontSize: 12, fontWeight: 600, background: 'var(--c-surface-2)', color: 'var(--c-text-2)' }}>{params.group}</Box>
            )}
            <Box component="ul" sx={{ p: 0 }}>{params.children}</Box>
          </li>
        )}
        renderOption={(props, o) => (
          <Box component="li" {...props} key={o.row.id} sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <Mono sx={{ minWidth: 120 }}>{o.row.code ?? '—'}</Mono>
            <Typography sx={{ flex: 1, fontSize: 14, minWidth: 0 }}>{o.row.name}</Typography>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{sectionSizeText(o.row)}</Typography>
            {o.more > 0 && <Typography sx={{ flexBasis: '100%', fontSize: 11.5, color: 'var(--c-text-3)' }}>+{o.more} more of this size — type the size to see them all</Typography>}
          </Box>
        )}
        renderInput={(params) => (
          <TextField {...params} autoFocus={autoFocus} label={label} placeholder="Type a size, like 75 x 75 x 8"
            helperText={near?.size && !near.exact.length && near.nearest.length
              ? `No ${sizeLabel(near.size)} in the catalog — the nearest sizes are listed.`
              : helperText}
            inputProps={{ ...params.inputProps, 'data-testid': 'section-picker' }} />
        )}
      />
      {addable && near && (
        <Button size="small" startIcon={<AddRounded />} onClick={() => setAdding(true)} disabled={disabled} data-testid="section-add-size" sx={{ mt: 0.5 }}>
          Add {sizeLabel(near.size)} to the catalog
        </Button>
      )}
      {adding && near?.like && (
        <AddSizeDialog like={near.like} values={newValues} onClose={() => setAdding(false)}
          onCreated={(made) => {
            setAdding(false);
            setText('');
            onPick({
              id: made.id, code: made.code ?? null, name: made.name,
              depth: Number(newValues.DEPTH) || null, width: Number(newValues.WIDTH) || null, thickness: Number(newValues.THICKNESS) || near.like?.thickness || null,
              lengthMm: near.like?.lengthMm ?? null, sectionArea: null, grade: near.like?.grade ?? null, nodeName: near.like?.nodeName ?? null,
            });
          }} />
      )}
    </>
  );
}

/** The usual new catalog item form, filled in like `like` (its place, grade, stock length…) with the new size's values. */
function AddSizeDialog({ like, values, onClose, onCreated }: { like: SectionStockRow; values: Record<string, string>; onClose: () => void; onCreated: (r: MasterRecord) => void }) {
  const [record, setRecord] = useState<MasterRecord | null>(null);
  const [tree, setTree] = useState<ScreenTree | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([cfApi.get<MasterRecord>(`/records/${like.id}`), cfApi.get<ScreenTree>(screenTreePath('items'))])
      .then(([r, t]) => { if (alive) { setRecord(r); setTree(t); } })
      .catch((e) => { if (alive) setError(e instanceof CfApiError ? e.message : 'The bar to copy could not be read.'); });
    return () => { alive = false; };
  }, [like.id]);
  if (error) return <Typography role="alert" sx={{ fontSize: 12.5, color: 'var(--c-danger-600)', mt: 0.5 }}>{error}</Typography>;
  if (!record) return null;
  return (
    <CreateRecordDialog open recordKind="item" screen="items" tree={tree} copyFrom={record} overrideValues={values}
      onClose={onClose} onCreated={onCreated} />
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
