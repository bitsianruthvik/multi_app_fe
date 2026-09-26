import { Box, Checkbox, FormControlLabel, TextField } from '@mui/material';

/**
 * The short name, with its third state (masterRecordService.readShortName):
 *   a value   — printed wherever a coding rule asks for the short name
 *   empty     — not set yet: codes fall back to the template's short name, then
 *               to the first word of the name
 *   NONE      — set on purpose: codes print nothing where the short name goes.
 *               A girder segment set to none reads …-G1-1 under the one part
 *               rule, with no coding rule of its own (user, 2026-09-26).
 * "None" is a switch, never an empty box: a box left empty means "not set".
 */
export function ShortNameField({ value, none, onChange, helperText }: {
  value: string;
  none: boolean;
  onChange: (next: { value: string; none: boolean }) => void;
  helperText: string;
}) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.25, minWidth: 0 }}>
      <TextField label="Short name" value={none ? '' : value} disabled={none} placeholder={none ? 'none' : 'WEB'}
        onChange={(e) => onChange({ value: e.target.value, none: false })}
        helperText={none ? 'None: codes print nothing where the short name goes — a segment reads …-G1-1.' : helperText}
        inputProps={{ style: { fontFamily: 'var(--font-mono)', textTransform: 'uppercase' } }} />
      <FormControlLabel sx={{ ml: 0, '& .MuiFormControlLabel-label': { fontSize: 13, color: 'var(--c-text-2)' } }}
        control={<Checkbox size="small" checked={none} onChange={(e) => onChange({ value: e.target.checked ? '' : value, none: e.target.checked })} />}
        label="None — print nothing in codes" />
    </Box>
  );
}

