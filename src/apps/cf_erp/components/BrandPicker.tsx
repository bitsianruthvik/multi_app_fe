import { useEffect, useState } from 'react';
import { Autocomplete, Box, Button, TextField, Typography, createFilterOptions } from '@mui/material';
import { CfApiError } from '../api/client';
import { addBrand, listBrands } from '../api/brands';
import type { BrandRef } from '../api/types';

/**
 * §117 (user, 2026-11-22): a lot's brand is PICKED from the company's one brand list — never free text — with "Unbranded"
 * first. Typing a name that is not on the list offers "Add …": the server keeps one row per brand (another spelling of the
 * same name is the same brand) and asks first when the name looks like one already there.
 * The list is read once per page and shared by every picker on it.
 */
let cache: Promise<BrandRef[]> | null = null;
const loadBrands = (fresh = false) => { if (fresh || !cache) cache = listBrands().catch((e) => { cache = null; throw e; }); return cache; };

type Opt = BrandRef & { add?: string };
const filter = createFilterOptions<Opt>({ stringify: (o) => o.name });

export function BrandPicker({ value, onChange, label = 'Brand', required = false, size = 'small', minWidth = 200, testId }: {
  value: BrandRef | null; onChange: (b: BrandRef | null) => void; label?: string; required?: boolean;
  size?: 'small' | 'medium'; minWidth?: number; testId?: string;
}) {
  const [brands, setBrands] = useState<BrandRef[]>([]);
  const [similar, setSimilar] = useState<{ name: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let live = true; loadBrands().then((b) => { if (live) setBrands(b); }).catch(() => { if (live) setError('The brand list could not be read.'); }); return () => { live = false; }; }, []);

  const add = async (name: string, confirm = false) => {
    setError(null); setSimilar(null);
    try {
      const r = await addBrand(name, confirm);
      const next = await loadBrands(true); setBrands(next);
      onChange(r.brand);
    } catch (e) {
      if (e instanceof CfApiError && e.code === 'SIMILAR') setSimilar({ name, message: e.message });
      else setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Box sx={{ minWidth }}>
      <Autocomplete<Opt, false, false, false>
        size={size}
        options={brands as Opt[]}
        value={value as Opt | null}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        getOptionLabel={(o) => o.name}
        filterOptions={(opts, state) => {
          const out = filter(opts, state);
          const typed = state.inputValue.trim();
          if (typed && !opts.some((o) => o.name.toLowerCase() === typed.toLowerCase())) out.push({ id: -1, name: `Add "${typed}" to the brand list`, unbranded: false, add: typed });
          return out;
        }}
        renderOption={(props, o) => (
          <li {...props} key={o.add ? `add-${o.add}` : o.id}>
            <Typography sx={{ fontSize: 14, fontWeight: o.unbranded ? 600 : 400, color: o.add ? 'var(--c-primary-700)' : undefined }}>{o.name}</Typography>
          </li>
        )}
        onChange={(_, o) => { if (o?.add) void add(o.add); else onChange(o ? { id: o.id, name: o.name, unbranded: o.unbranded } : null); }}
        renderInput={(p) => <TextField {...p} label={`${label}${required ? ' *' : ''}`} inputProps={{ ...p.inputProps, 'data-testid': testId }} />}
      />
      {similar && (
        <Box sx={{ mt: 0.5, fontSize: 12.5, color: 'var(--c-text-2)' }}>
          {similar.message}
          <Button size="small" sx={{ ml: 1 }} onClick={() => void add(similar.name, true)}>Add "{similar.name}" anyway</Button>
        </Box>
      )}
      {error && <Typography sx={{ mt: 0.5, fontSize: 12.5, color: 'var(--c-danger-700, #b42318)' }}>{error}</Typography>}
    </Box>
  );
}
