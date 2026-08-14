/**
 * RawMaterialSelect — "what is this part cut from", asked the same way everywhere.
 *
 * The BOQ wizard (twice) and the BOM template editor all ask this question, and
 * all three had hand-rolled the same filter-then-pin-the-selection mapping over
 * bare <MenuItem>s. Three copies of one rule is three chances to drift, and all
 * three showed the same too-little: the code alone, with no name and no
 * thickness, so "RM-0037" and "RM-0038" read identically in the list.
 *
 * Two things it does that a plain list cannot:
 *
 *   GROUPS. Exact-thickness plate first under its own heading, then sections,
 *   then anything with no thickness recorded. A picker that concatenates all
 *   three silently claims every option is an equally good match for the part's
 *   thickness, which is the complaint that produced this file.
 *
 *   PINS THE SELECTION. A row already set to 20mm plate whose thickness later
 *   reads 12 would otherwise match no option, and MUI renders that as an EMPTY
 *   field while the state underneath still holds — and still submits — the
 *   material. The field would say "not set" and mean "20mm plate".
 *
 * The value is whatever `valueOf` returns, because the two callers genuinely
 * differ: the BOQ sheet round-trips material CODES (that is what a person types
 * into the spreadsheet column), while BOM templates store a catalog item id.
 */

import { ListSubheader, MenuItem, TextField, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';

import {
  materialGroups, materialLabel, thicknessLabel, type RawMaterial,
} from '../api/rawMaterials';

export interface RawMaterialSelectProps {
  /** Every material this company can cut from, unfiltered. */
  materials: RawMaterial[];
  /** The part's thickness. Blank or unparseable means "do not filter". */
  thickness: string | number | null | undefined;
  /** Current value — matched against `valueOf`. */
  value: string | number;
  onChange: (value: string) => void;
  /** How a material maps to this field's stored value. */
  valueOf: (m: RawMaterial) => string | number;
  label?: string;
  disabled?: boolean;
  sx?: SxProps<Theme>;
}

/** One option row: code — name, with its thickness pushed to the right. */
function materialOption(m: RawMaterial, valueOf: (m: RawMaterial) => string | number) {
  const t = thicknessLabel(m);
  return (
    <MenuItem key={m.id} value={valueOf(m)} sx={{ display: 'flex', gap: 1 }}>
      <span style={{ flex: 1, minWidth: 0 }}>{materialLabel(m)}</span>
      {t && (
        <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', fontFamily: 'var(--font-mono)' }}>
          {t}
        </Typography>
      )}
    </MenuItem>
  );
}

const subheader = (text: string) => (
  <ListSubheader
    key={`hdr-${text}`}
    sx={{
      fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
      color: 'var(--c-text-3)', lineHeight: '28px', background: 'var(--c-surface)',
    }}
  >
    {text}
  </ListSubheader>
);

export default function RawMaterialSelect({
  materials, thickness, value, onChange, valueOf,
  label = 'Raw material', disabled, sx,
}: RawMaterialSelectProps) {
  const g = materialGroups(materials, thickness);
  const shown = [...g.plates, ...g.sections, ...g.unclassified];

  // The current value, if the filter excluded it. Rendered as its own group so
  // the field shows what the row is actually set to, and can still be changed.
  const selected = value === '' || value == null
    ? undefined
    : materials.find((m) => valueOf(m) === value && !shown.some((s) => s.id === m.id));

  const t = Number(thickness);
  const filtering = !g.unfiltered && Number.isFinite(t);

  const options = [
    <MenuItem key="__none" value="">— not set —</MenuItem>,
    ...(selected ? [subheader('Currently set'), materialOption(selected, valueOf)] : []),
    ...(g.plates.length
      ? [subheader(filtering ? `Plate — ${t} mm` : 'Plate'), ...g.plates.map((m) => materialOption(m, valueOf))]
      : []),
    ...(g.sections.length
      ? [subheader('Sections — any thickness'), ...g.sections.map((m) => materialOption(m, valueOf))]
      : []),
    // Only ever populated when nothing matched exactly (see materialGroups), so
    // this heading appears as an explicit fallback rather than as filler.
    ...(g.unclassified.length
      ? [subheader('No thickness recorded'), ...g.unclassified.map((m) => materialOption(m, valueOf))]
      : []),
  ];

  const nothingAtThickness = filtering && g.plates.length === 0;

  return (
    <TextField
      select size="small" label={label} value={value} disabled={disabled} sx={sx}
      onChange={(e) => onChange(e.target.value)}
      helperText={nothingAtThickness
        ? `Nothing stocked at ${t} mm — showing sections and untyped material`
        : ' '}
    >
      {options}
    </TextField>
  );
}
