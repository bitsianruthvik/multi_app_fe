import { useEffect, useState } from 'react';
import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import { cfApi, CfApiError, qs } from '../api/client';
import type { Kind, MasterRecord, RecordList } from '../api/types';
import { KindChip, Mono, StatusBadge } from './ui';

/**
 * Finds an item or definition by code or name, as you type. `kinds` limits
 * what it offers — a BOM line offers what its BOM may hold, an order line
 * offers catalog items and templates. Obsolete records are never offered;
 * `activeOnly` also hides drafts where only an active record would be accepted.
 */
export function RecordPicker({
  kinds, value, onChange, label = 'Item or definition', activeOnly = false, excludeIds = [], autoFocus, helperText,
}: {
  kinds: Kind[];
  value: MasterRecord | null;
  onChange: (r: MasterRecord | null) => void;
  label?: string;
  activeOnly?: boolean;
  excludeIds?: number[];
  autoFocus?: boolean;
  helperText?: string;
}) {
  const [input, setInput] = useState('');
  const [options, setOptions] = useState<MasterRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const kindKey = kinds.join(',');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = window.setTimeout(() => {
      cfApi.get<RecordList>(`/records${qs({ kinds: kindKey, search: input, limit: 30, usable: 1, status: activeOnly ? 'active' : undefined })}`)
        .then((r) => { if (alive) { setOptions(r.rows); setFailed(null); } })
        // A 403 here (no catalog view) used to read as "nothing matches", which
        // sends people looking for an item that is right there.
        .catch((e) => { if (alive) { setOptions([]); setFailed(e instanceof CfApiError ? e.message : 'The item list could not be loaded.'); } })
        .finally(() => { if (alive) setLoading(false); });
    }, 200);
    return () => { alive = false; window.clearTimeout(t); };
  }, [input, kindKey, activeOnly]);

  return (
    <Autocomplete
      size="small"
      fullWidth
      value={value}
      options={options.filter((o) => !excludeIds.includes(o.id))}
      loading={loading}
      filterOptions={(x) => x}
      getOptionLabel={(o) => `${o.code ?? '—'} · ${o.name}`}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, o) => onChange(o)}
      onInputChange={(_, v, reason) => { if (reason !== 'reset') setInput(v); }}
      noOptionsText={input ? 'Nothing matches' : 'Type a code or a name'}
      renderOption={(props, o) => (
        <Box component="li" {...props} key={o.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Mono sx={{ minWidth: 120 }}>{o.code ?? '—'}</Mono>
          <Typography sx={{ flex: 1, fontSize: 14, minWidth: 120 }}>{o.name}</Typography>
          <KindChip kind={o.kind} />
          {o.status !== 'active' && <StatusBadge status={o.status} />}
        </Box>
      )}
      renderInput={(params) => <TextField {...params} label={label} autoFocus={autoFocus} error={!!failed} helperText={failed ?? helperText} />}
    />
  );
}
