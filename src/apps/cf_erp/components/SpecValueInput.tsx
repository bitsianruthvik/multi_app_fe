import { InputAdornment, MenuItem, TextField } from '@mui/material';
import type { DataType, SpecOption } from '../api/types';

/**
 * One input for one specification value, shaped by its data type. Values are
 * kept as strings while typing; the backend checks and converts them.
 */
export function SpecValueInput({
  dataType, unit, options, value, onChange, label, disabled, size = 'small', autoFocus,
}: {
  dataType: DataType;
  unit?: string | null;
  options?: SpecOption[];
  value: string;
  onChange: (v: string) => void;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium';
  autoFocus?: boolean;
}) {
  const common = { label, size, disabled, fullWidth: true, autoFocus, value, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  switch (dataType) {
    case 'number':
      return (
        <TextField
          {...common}
          type="number"
          inputProps={{ step: 'any', style: { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' } }}
          InputProps={unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined}
        />
      );
    case 'boolean':
      return (
        <TextField {...common} select>
          <MenuItem value="">—</MenuItem>
          <MenuItem value="true">Yes</MenuItem>
          <MenuItem value="false">No</MenuItem>
        </TextField>
      );
    case 'date':
      return <TextField {...common} type="date" InputLabelProps={{ shrink: true }} />;
    case 'option':
      return (
        <TextField {...common} select>
          <MenuItem value="">—</MenuItem>
          {(options ?? []).map((o) => <MenuItem key={o.id} value={String(o.id)}>{o.label || o.value}</MenuItem>)}
        </TextField>
      );
    default:
      return <TextField {...common} inputProps={{ maxLength: 500 }} />;
  }
}
