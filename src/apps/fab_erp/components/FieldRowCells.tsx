/**
 * FieldRowCells — one editable custom-field row: name, type, unit-or-options,
 * value. Existed twice (`ItemCatalog.tsx` and, re-implemented inline, in
 * `ItemCatalogDetail.tsx`) — EU-16 item 4 pulls it out so both edit exactly
 * the same control.
 *
 * A standard field is locked apart from its value — its key is what feature
 * code is written against, and its type and unit are what those features
 * assume, so retyping it here would break them silently.
 */
import { IconButton, ListSubheader, MenuItem, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  boolValue, BOOL_OPTIONS, fieldValueError, unitsByDimension, UI_FIELD_TYPES, valuePlaceholder,
  type FieldRowDraft, type UiFieldType,
} from '../api/fields';

export function FieldRowCells({ row, canEdit, unitGroups, onPatch, onRemove }: {
  row: FieldRowDraft;
  canEdit: boolean;
  unitGroups: ReturnType<typeof unitsByDimension>;
  onPatch: (patch: Partial<FieldRowDraft>) => void;
  onRemove?: () => void;
}) {
  const allowed = row.options.split(',').map((s) => s.trim()).filter(Boolean);
  const valueErr = fieldValueError(row.type, row.value, allowed);
  const locked = !canEdit || row.isStandard;
  return (
    <>
      <TableCell sx={{ py: 0.5 }}>
        <TextField size="small" fullWidth value={row.label} disabled={locked}
          placeholder="e.g. Material Grade"
          helperText={row.fieldKey || undefined}
          onChange={(e) => onPatch({ label: e.target.value })} />
      </TableCell>
      <TableCell sx={{ py: 0.5 }}>
        <Tooltip title={row.isStandard ? 'Standard field — features are written against its type and unit' : ''}>
          <TextField select size="small" fullWidth value={row.type} disabled={locked}
            onChange={(e) => onPatch({ type: e.target.value as UiFieldType })}>
            {UI_FIELD_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
          </TextField>
        </Tooltip>
      </TableCell>
      <TableCell sx={{ py: 0.5 }}>
        {row.type === 'number' ? (
          // Picked, never typed. Two people typing "m2" and "m²" make two units
          // for one thing; the list comes from fab_units, which also carries the
          // conversion factor that makes 6 m and 6000 mm the same length.
          <TextField select size="small" fullWidth value={row.unit} disabled={locked}
            onChange={(e) => onPatch({ unit: e.target.value })}>
            <MenuItem value="">— no unit —</MenuItem>
            {unitGroups.flatMap((g) => [
              <ListSubheader key={`h-${g.group}`} sx={{ fontSize: 11, lineHeight: '26px' }}>{g.group}</ListSubheader>,
              ...g.units.map((u) => <MenuItem key={u.code} value={u.code}>{u.code}</MenuItem>),
            ])}
          </TextField>
        ) : row.type === 'dropdown' ? (
          <TextField size="small" fullWidth value={row.options} disabled={locked}
            placeholder="Option1, Option2, …" onChange={(e) => onPatch({ options: e.target.value })} />
        ) : (
          <Typography variant="caption" color="text.disabled">—</Typography>
        )}
      </TableCell>
      <TableCell sx={{ py: 0.5 }}>
        {row.type === 'bool' ? (
          <TextField select size="small" fullWidth value={boolValue(row.value)} disabled={!canEdit}
            onChange={(e) => onPatch({ value: e.target.value })}>
            <MenuItem value="">— none —</MenuItem>
            {BOOL_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
        ) : row.type === 'dropdown' && allowed.length ? (
          <TextField select size="small" fullWidth value={allowed.includes(row.value) ? row.value : ''} disabled={!canEdit}
            onChange={(e) => onPatch({ value: e.target.value })}>
            <MenuItem value="">— none —</MenuItem>
            {allowed.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
          </TextField>
        ) : (
          <TextField size="small" fullWidth value={row.value} disabled={!canEdit}
            // Type-aware: a steel grade is not a placeholder for a number.
            placeholder={valuePlaceholder(row.type, row.unit)}
            error={!!valueErr} helperText={valueErr ?? undefined}
            onChange={(e) => onPatch({ value: e.target.value })} />
        )}
      </TableCell>
      {canEdit && onRemove && (
        <TableCell sx={{ py: 0.5 }}>
          <IconButton size="small" color="error" onClick={onRemove}><DeleteIcon fontSize="small" /></IconButton>
        </TableCell>
      )}
    </>
  );
}

const FIELD_HEAD_SX = { fontWeight: 700 } as const;

/** The table header that matches FieldRowCells. */
export function FieldTableHead({ valueLabel, canEdit }: { valueLabel: string; canEdit: boolean }) {
  return (
    <TableHead>
      <TableRow sx={{ bgcolor: 'action.hover' }}>
        <TableCell sx={FIELD_HEAD_SX}>Field Name</TableCell>
        <TableCell sx={{ ...FIELD_HEAD_SX, width: 120 }}>Type</TableCell>
        {/* One column for the two things that qualify a value: a unit for a
            number, the option list for a dropdown. A number with no unit is how
            stock came to hold the string "2000 mm" — the figure and its unit
            fused together, so nothing could compare, convert or sum them. */}
        <TableCell sx={{ ...FIELD_HEAD_SX, width: 150 }}>Unit / options</TableCell>
        <TableCell sx={FIELD_HEAD_SX}>{valueLabel}</TableCell>
        {canEdit && <TableCell sx={{ width: 48 }} />}
      </TableRow>
    </TableHead>
  );
}
