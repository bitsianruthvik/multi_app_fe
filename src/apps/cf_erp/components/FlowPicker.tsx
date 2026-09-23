import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import { cfApi } from '../api/client';
import type { Flow } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { Mono, StatusBadge } from './ui';

/**
 * Picks an operation flow. Obsolete flows are never offered; drafts are, so a
 * flow can be named while it is still being written. Empty means "none".
 */
export function FlowPicker({ value, onChange, label = 'Flow', helperText, disabled }: {
  value: number | null;
  onChange: (id: number | null) => void;
  label?: string;
  helperText?: string;
  disabled?: boolean;
}) {
  const flows = useLoad(() => cfApi.get<Flow[]>('/flows'), []);
  const options = (flows.data ?? []).filter((f) => f.status !== 'obsolete' || f.id === value);
  const selected = options.find((f) => f.id === value) ?? null;
  return (
    <Autocomplete
      size="small"
      fullWidth
      options={options}
      value={selected}
      disabled={disabled}
      loading={flows.loading}
      getOptionLabel={(f) => `${f.code} · ${f.name}`}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, f) => onChange(f?.id ?? null)}
      renderOption={(props, f) => (
        <Box component="li" {...props} key={f.id} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Mono sx={{ minWidth: 110 }}>{f.code}</Mono>
          <Typography sx={{ flex: 1, fontSize: 14 }}>{f.name}</Typography>
          {f.status !== 'active' && <StatusBadge status={f.status} />}
        </Box>
      )}
      renderInput={(params) => <TextField {...params} label={label} helperText={helperText} placeholder="None" />}
    />
  );
}
