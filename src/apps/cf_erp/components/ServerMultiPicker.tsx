import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import { CfApiError } from '../api/client';

/**
 * The multi-select twin of ServerPicker: searches the server as you type
 * (debounced) instead of filtering a list loaded once, so a choice past the
 * first N records can still be found.
 */
export function ServerMultiPicker<T>({
  search, value, onChange, getLabel, getId, label, placeholder, helperText, size = 'small', noun = 'record', debounceMs = 250,
}: {
  search: (term: string) => Promise<T[]>;
  value: T[];
  onChange: (v: T[]) => void;
  getLabel: (v: T) => string;
  getId: (v: T) => string | number;
  label?: string;
  placeholder?: string;
  helperText?: ReactNode;
  size?: 'small' | 'medium';
  noun?: string;
  debounceMs?: number;
}) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setLoading(true);
    const t = window.setTimeout(() => {
      searchRef.current(input.trim())
        .then((r) => { if (alive) { setOptions(r); setFailed(null); } })
        .catch((e) => { if (alive) { setOptions([]); setFailed(e instanceof CfApiError ? e.message : 'The list could not be loaded.'); } })
        .finally(() => { if (alive) setLoading(false); });
    }, debounceMs);
    return () => { alive = false; window.clearTimeout(t); };
  }, [input, open, debounceMs]);

  // Chosen values stay options so the chips keep their labels.
  const shown = [...value, ...options.filter((o) => !value.some((v) => getId(v) === getId(o)))];

  return (
    <Autocomplete
      multiple
      size={size}
      fullWidth
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      value={value}
      options={shown}
      loading={loading}
      filterOptions={(x) => x}
      getOptionLabel={getLabel}
      isOptionEqualToValue={(a, b) => getId(a) === getId(b)}
      onChange={(_, v) => onChange(v)}
      onInputChange={(_, v, reason) => { if (reason === 'input' || reason === 'clear') setInput(v); }}
      noOptionsText={loading ? 'Searching…' : input ? `No ${noun} matches “${input}”` : `Type to search every ${noun}`}
      renderInput={(params) => <TextField {...params} label={label} placeholder={placeholder} error={!!failed} helperText={failed ?? helperText} />}
    />
  );
}
