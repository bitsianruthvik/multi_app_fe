/**
 * InheritedFieldsTable — what a node inherits from its taxonomy ancestors, and
 * what it will actually use.
 *
 * Existed twice with slightly different wording (`ItemCatalog.tsx`'s
 * `TaxonomyDetailDialog` and `ItemCatalogDetail.tsx`) — EU-16 item 4 unifies
 * them. Two value columns, always: "Inherited"/"Taxonomy default" is the
 * value resolved at the ancestor, before this node has any say; "Effective"
 * is what the system will actually use, which is a different number the
 * moment an override exists. A single "effective default" column here is the
 * bug this table exists to not have — it would show a value that stopped
 * being effective the instant somebody overrode it.
 */
import { Box, Button, IconButton, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { StatusBadge } from './StatusBadge';
import { Mono } from './Mono';
import {
  boolValue, BOOL_OPTIONS, displayValue, fieldValueError, parseAllowed, uiTypeOf, valuePlaceholder,
  type FieldDefRow, type FieldRowDraft, type ResolvedValue, type UiFieldType,
} from '../api/fields';

const SOURCE_LABEL: Record<string, string> = {
  category: 'Category', group: 'Group', subgroup: 'Sub-group', default: 'Field default',
};

export interface InheritedFieldRow {
  /** The field's registry key. */
  key: string;
  def: FieldDefRow | undefined;
  /** The value resolved at the ancestor — what this node inherits before any override. */
  inherited: ResolvedValue;
  /** The value resolved AT this node — already reflects an override, when one exists. */
  effective: ResolvedValue | undefined;
  /** Which rung `inherited` came from: category | group | subgroup. */
  source: string;
}

export function InheritedFieldsTable({
  rows, overrides, canEdit, levelLabel, onOverride, onPatch, onRemove,
}: {
  rows: InheritedFieldRow[];
  /** The node's own draft rows — an entry with a matching `fieldKey` means this field is overridden. */
  overrides: FieldRowDraft[];
  canEdit: boolean;
  /** "Category" / "Sub-group" / "Item" — used only in the caption. */
  levelLabel: string;
  onOverride: (row: InheritedFieldRow) => void;
  onPatch: (rowId: number, patch: Partial<FieldRowDraft>) => void;
  onRemove: (rowId: number) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <>
      <Typography variant="subtitle2" color="text.secondary">
        Inherited from parent ({rows.length} field{rows.length !== 1 ? 's' : ''})
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Inherited default is what this {levelLabel.toLowerCase()} receives; Effective is what the system will use.
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: 'action.hover' }}>
            <TableCell sx={{ fontWeight: 700 }}>Field Name</TableCell>
            <TableCell sx={{ fontWeight: 700, width: 100 }}>Type</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Inherited default</TableCell>
            <TableCell sx={{ fontWeight: 700, width: 110 }}>Source</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Effective</TableCell>
            <TableCell sx={{ fontWeight: 700, width: 180 }}>Override at this level</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((f) => {
            const row = overrides.find((d) => d.fieldKey === f.key);
            const isOverridden = !!row;
            const type: UiFieldType = f.def ? uiTypeOf(f.def) : 'text';
            const allowed = parseAllowed(f.def?.allowedValues);
            const valueErr = row ? fieldValueError(type, row.value, allowed) : null;
            const pending = isOverridden && row.value.trim() !== ''
              && row.value.trim() !== String(f.effective?.value ?? '');
            return (
              <TableRow key={f.key}>
                <TableCell>
                  <Typography variant="body2">{f.def?.label ?? f.key}</Typography>
                  <Mono sx={{ fontSize: 11, color: 'text.disabled' }}>{f.key}</Mono>
                </TableCell>
                <TableCell>
                  <Typography variant="caption">{type}</Typography>
                  {f.def?.defaultUnit && <Typography variant="caption" color="text.disabled"> · {f.def.defaultUnit}</Typography>}
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary"
                    sx={isOverridden ? { textDecoration: 'line-through', color: 'text.disabled' } : undefined}>
                    {displayValue(f.inherited)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <StatusBadge status={SOURCE_LABEL[f.source] ?? f.source} family={f.source === 'category' ? 'neutral' : 'info'} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {pending
                      ? `${row.value.trim()}${f.def?.defaultUnit ? ` ${f.def.defaultUnit}` : ''} (unsaved)`
                      : displayValue(f.effective ?? f.inherited)}
                  </Typography>
                </TableCell>
                <TableCell>
                  {isOverridden && row ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <TextField size="small"
                        select={type === 'bool' || (type === 'dropdown' && allowed.length > 0)}
                        value={type === 'bool' ? boolValue(row.value) : row.value}
                        disabled={!canEdit} sx={{ flex: 1, minWidth: 80 }}
                        placeholder={valuePlaceholder(type, f.def?.defaultUnit)}
                        error={!!valueErr} helperText={valueErr ?? undefined}
                        onChange={(e) => onPatch(row.rowId, { value: e.target.value })}>
                        {type === 'bool'
                          ? [<MenuItem key="" value="">— none —</MenuItem>,
                             ...BOOL_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)]
                          : allowed.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
                      </TextField>
                      {canEdit && (
                        <Tooltip title="Remove override">
                          <IconButton size="small" color="error" onClick={() => onRemove(row.rowId)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  ) : canEdit ? (
                    <Button size="small" variant="outlined" onClick={() => onOverride(f)}>Override</Button>
                  ) : (
                    <Typography variant="caption" color="text.disabled">—</Typography>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}
