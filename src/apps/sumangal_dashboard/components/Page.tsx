import type { ReactNode } from 'react';
import { Autocomplete, Box, Button, Chip, Menu, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useState } from 'react';
import AddRounded from '@mui/icons-material/AddRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import { ErrorNotice, ListSkeleton, PageHeader, StatSkeleton } from '@shared/ui';
import { FILTER_KEYS, FILTER_LABEL, useMeta, type Filters, type FilterKey } from '../filters';
import { dateLabel } from '../format';

/** What a filter's options mean, where the name alone isn't enough. */
const OPTION_HELP: Partial<Record<FilterKey, string>> = {
  finish: 'The codes on the ERP’s order lines. “No code” means the line has none.',
};

/** Add a filter: choose what to filter by, then the value. Only what's chosen stays on screen. */
function AddFilter({ filters, keys }: { filters: Filters; keys: readonly FilterKey[] }) {
  const meta = useMeta();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const free = keys.filter((k) => !filters.values[k]);
  const [picking, setPicking] = useState<FilterKey | null>(null);
  const close = () => { setAnchor(null); setPicking(null); };
  if (!meta || !free.length) return null;
  const opts = picking && picking !== 'customer' ? meta.options[picking] : [];
  return (
    <>
      <Button size="small" variant="outlined" startIcon={<AddRounded />} onClick={(e) => setAnchor(e.currentTarget)} sx={{ textTransform: 'none' }}>Filter</Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={close} slotProps={{ paper: { sx: { minWidth: 240 } } }}>
        {!picking && free.map((k) => <MenuItem key={k} onClick={() => setPicking(k)}>{FILTER_LABEL[k]}</MenuItem>)}
        {picking && picking !== 'customer' && [
          OPTION_HELP[picking] && <Typography key="help" sx={{ px: 2, py: 1, fontSize: 12, color: 'var(--c-text-3)', maxWidth: 280 }}>{OPTION_HELP[picking]}</Typography>,
          ...opts.map((o) => <MenuItem key={o} onClick={() => { filters.setValue(picking, o); close(); }}>{o}</MenuItem>),
        ]}
        {picking === 'customer' && (
          <Box sx={{ px: 1.5, py: 1, width: 300 }}>
            <Autocomplete size="small" autoFocus options={meta.options.customers} getOptionLabel={(o) => o.name}
              onChange={(_, v) => { if (v) { filters.setValue('customer', String(v.id)); close(); } }}
              renderInput={(p) => <TextField {...p} autoFocus label="Customer" />} />
          </Box>
        )}
      </Menu>
    </>
  );
}

/** Any From and To date within the data. Empty means the whole data. */
function DateRange({ filters }: { filters: Filters }) {
  const meta = useMeta();
  if (!meta) return null;
  const { from, to } = filters.dates;
  return (
    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" aria-label="Date range">
      <TextField size="small" type="date" label="From" value={from} sx={{ width: 160 }}
        slotProps={{ htmlInput: { min: meta.from, max: to || meta.asOf } }}
        onChange={(e) => filters.setRange(e.target.value, to)} />
      <TextField size="small" type="date" label="To" value={to} sx={{ width: 160 }}
        slotProps={{ htmlInput: { min: from || meta.from, max: meta.asOf } }}
        onChange={(e) => filters.setRange(from, e.target.value)} />
      {filters.rangeSet && <Button size="small" onClick={() => filters.setRange('', '')} sx={{ textTransform: 'none' }}>All dates</Button>}
    </Stack>
  );
}

/** Date range and filters. The same strip, in the same place, on every screen. */
export function FilterStrip({ filters, keys = FILTER_KEYS, period = true }: { filters: Filters; keys?: readonly FilterKey[]; period?: boolean }) {
  const meta = useMeta();
  const shown = (k: FilterKey) => (k === 'customer' ? meta?.options.customers.find((c) => String(c.id) === filters.values.customer)?.name ?? filters.values.customer : filters.values[k]);
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
      {period && <DateRange filters={filters} />}
      <AddFilter filters={filters} keys={keys} />
      {filters.active.filter((k) => keys.includes(k)).map((k) => <Chip key={k} size="small" color="primary" variant="outlined" label={`${FILTER_LABEL[k]}: ${shown(k)}`} onDelete={() => filters.setValue(k, '')} />)}
      {(filters.active.length > 1 || (period && filters.rangeSet)) && <Button size="small" onClick={filters.clear} sx={{ textTransform: 'none' }}>Clear all</Button>}
    </Stack>
  );
}

/** A word with its meaning one hover away. */
export function Term({ children, help }: { children: ReactNode; help: string }) {
  return (
    <Tooltip title={help} arrow>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, cursor: 'help' }}>
        {children}
        <HelpOutlineRounded sx={{ fontSize: 14, color: 'var(--c-text-3)' }} />
      </Box>
    </Tooltip>
  );
}

/** The frame every screen shares: title, filters, takeaways, loading and error states. */
export function Page({ title, question, filters, filterKeys, period = true, loading, error, reload, hasData, footnote, children }: {
  title: string;
  question: string;
  filters: Filters;
  filterKeys?: readonly FilterKey[];
  period?: boolean;
  loading: boolean;
  error: unknown;
  reload: () => void;
  hasData: boolean;
  footnote?: ReactNode;
  children: ReactNode;
}) {
  const meta = useMeta();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.25 }}>
      <PageHeader title={title} subtitle={question} />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ md: 'center' }}>
        <FilterStrip filters={filters} keys={filterKeys} period={period} />
        {meta && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', flexShrink: 0 }}>Snapshot of the ERP · data to {dateLabel(meta.asOf)}</Typography>}
      </Stack>
      {error ? <ErrorNotice error={error} onRetry={reload} /> : !hasData ? (
        <Box sx={{ display: 'grid', gap: 2 }}><StatSkeleton /><ListSkeleton rows={6} /></Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.25, opacity: loading ? 0.55 : 1, transition: 'opacity .15s' }}>
          {children}
          {footnote && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', lineHeight: 1.5 }}>{footnote}</Typography>}
        </Box>
      )}
    </Box>
  );
}

export const ON_TIME_HELP = 'Lines with a delivery date in this period whose dispatched quantity reached the ordered quantity by that date. Short-closed lines are left out.';
