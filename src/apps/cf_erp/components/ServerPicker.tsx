import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import { CfApiError } from '../api/client';
import { searchOrders, searchParties } from '../api/pickers';
import type { Party, PartyRole, SalesOrder } from '../api/types';
import { Mono } from './ui';

/**
 * A picker that SEARCHES THE SERVER as you type (debounced) — so any record can
 * be found, not only the first N a list endpoint happens to return (pickers
 * used to load `/parties` once, silently capped at 200; ARCHITECTURE.md §13).
 *
 * `search(term)` returns the options for a term; the empty term gives the first
 * few, so the list is not blank on open.
 */
export function ServerPicker<T>({
  search, value, onChange, getLabel, getId, renderOption, label, placeholder, disabled, autoFocus, helperText, error,
  size = 'small', sx, noun = 'record', debounceMs = 250,
}: {
  search: (term: string) => Promise<T[]>;
  value: T | null;
  onChange: (v: T | null) => void;
  getLabel: (v: T) => string;
  getId: (v: T) => string | number;
  renderOption?: (v: T) => ReactNode;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  helperText?: ReactNode;
  error?: boolean;
  size?: 'small' | 'medium';
  sx?: object;
  /** "customer", "order" … for the empty-list words. */
  noun?: string;
  debounceMs?: number;
}) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // `search` is usually an inline arrow; the latest one is read at fetch time.
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

  // The chosen value is always an option, so MUI can show it.
  const shown = value && !options.some((o) => getId(o) === getId(value)) ? [value, ...options] : options;

  return (
    <Autocomplete
      size={size}
      fullWidth
      sx={sx}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      disabled={disabled}
      value={value}
      options={shown}
      loading={loading}
      filterOptions={(x) => x}
      getOptionLabel={getLabel}
      isOptionEqualToValue={(a, b) => getId(a) === getId(b)}
      onChange={(_, o) => onChange(o)}
      onInputChange={(_, v, reason) => { if (reason === 'input' || reason === 'clear') setInput(v); }}
      noOptionsText={loading ? 'Searching…' : input ? `No ${noun} matches “${input}”` : `Type to search every ${noun}`}
      renderOption={(props, o) => (
        <Box component="li" {...props} key={getId(o)}>
          {renderOption ? renderOption(o) : getLabel(o)}
        </Box>
      )}
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder={placeholder} autoFocus={autoFocus}
          error={error || !!failed} helperText={failed ?? helperText} />
      )}
    />
  );
}

export function PartyPicker({
  role, activeOnly = true, ...rest
}: {
  role?: PartyRole;
  activeOnly?: boolean;
  value: Party | null;
  onChange: (p: Party | null) => void;
  label?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  helperText?: ReactNode;
  error?: boolean;
  size?: 'small' | 'medium';
  sx?: object;
}) {
  const noun = role === 'supplier' ? 'supplier' : role === 'subcontractor' ? 'contractor' : role === 'customer' ? 'customer' : 'party';
  return (
    <ServerPicker<Party>
      {...rest}
      label={rest.label ?? noun[0].toUpperCase() + noun.slice(1)}
      noun={noun}
      search={(t) => searchParties(t, { role, status: activeOnly ? 'active' : undefined })}
      getId={(p) => p.id}
      getLabel={(p) => `${p.code} · ${p.name}`}
      renderOption={(p) => (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', minWidth: 0 }}>
          <Mono sx={{ minWidth: 90 }}>{p.code}</Mono>
          <Typography sx={{ fontSize: 14 }} noWrap>{p.name}</Typography>
        </Box>
      )}
    />
  );
}

export function OrderPicker({
  openOnly = true, ...rest
}: {
  openOnly?: boolean;
  value: SalesOrder | null;
  onChange: (o: SalesOrder | null) => void;
  label?: string;
  disabled?: boolean;
  helperText?: ReactNode;
  size?: 'small' | 'medium';
  sx?: object;
}) {
  return (
    <ServerPicker<SalesOrder>
      {...rest}
      label={rest.label ?? 'Order'}
      noun="order"
      search={(t) => searchOrders(t, { open: openOnly })}
      getId={(o) => o.id}
      getLabel={(o) => `${o.code}${o.title ? ` · ${o.title}` : ''}`}
      renderOption={(o) => (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', minWidth: 0 }}>
          <Mono sx={{ minWidth: 140 }}>{o.code}</Mono>
          <Typography sx={{ fontSize: 14 }} noWrap>{o.title ?? o.customer?.name ?? 'For stock'}</Typography>
        </Box>
      )}
    />
  );
}
