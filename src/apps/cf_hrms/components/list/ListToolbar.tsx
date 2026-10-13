import { useState, type ReactNode } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Drawer,
  FormControlLabel,
  IconButton,
  InputBase,
  MenuItem,
  Popover,
  Switch,
  TextField,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import SearchRounded from '@mui/icons-material/SearchRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import { Surface } from '@shared/ui';
import type { ListFilters } from './useListFilters';

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface FilterDef {
  /** The address param. */
  key: string;
  /** "Department", "Status". */
  label: string;
  /** Default 'select'. 'toggle' = a yes-only switch (value '1'). 'date' = a date input. */
  kind?: 'select' | 'toggle' | 'date';
  /** For 'select'. */
  options?: FilterOption[];
  /** For a long list (departments, roles): a searchable box instead of a plain select. */
  searchable?: boolean;
  /**
   * The value the list uses while the address has none (Employees: "working and
   * on notice"). It must be one of the options. It is shown as the select's
   * state, never as a removable chip, and choosing it clears the address key.
   * The screen sends the same value to the server — see `useListFilters` `defaults`.
   */
  defaultValue?: string;
}

function fmtCount(n: number): string {
  return n.toLocaleString();
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** What an active filter reads as in the line under the bar. */
function activeText(def: FilterDef, value: string): string {
  const kind = def.kind ?? 'select';
  if (kind === 'toggle') return def.label;
  if (kind === 'date') return `${def.label}: ${fmtDate(value)}`;
  const opt = def.options?.find((o) => o.value === value);
  return `${def.label}: ${opt?.label ?? value}`;
}

function ActiveChip({ text, onRemove }: { text: string; onRemove: () => void }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.25,
        maxWidth: '100%',
        minWidth: 0,
        pl: 1,
        pr: 0.25,
        minHeight: 24,
        borderRadius: 'var(--r-sm)',
        border: '1px solid var(--c-primary-200)',
        background: 'var(--c-primary-50)',
        color: 'var(--c-primary-700)',
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      <Box
        component="span"
        sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {text}
      </Box>
      <IconButton
        size="small"
        aria-label={`Remove filter ${text}`}
        onClick={onRemove}
        sx={{ p: 0.25, color: 'inherit', flexShrink: 0 }}
      >
        <CloseRounded sx={{ fontSize: 14 }} />
      </IconButton>
    </Box>
  );
}

function FilterControl({ def, filters }: { def: FilterDef; filters: ListFilters }) {
  const kind = def.kind ?? 'select';
  const value = filters.values[def.key] ?? '';
  const options = def.options ?? [];
  const shownValue = value || def.defaultValue || '';

  if (kind === 'toggle') {
    return (
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={value !== ''}
            onChange={(e) => filters.set(def.key, e.target.checked ? '1' : null)}
          />
        }
        label={def.label}
        sx={{ ml: 0, '& .MuiFormControlLabel-label': { fontSize: 14, ml: 1 } }}
      />
    );
  }

  if (kind === 'date') {
    return (
      <TextField
        size="small"
        fullWidth
        type="date"
        label={def.label}
        value={value}
        onChange={(e) => filters.set(def.key, e.target.value || null)}
        slotProps={{ inputLabel: { shrink: true } }}
      />
    );
  }

  if (def.searchable) {
    return (
      <Autocomplete
        size="small"
        fullWidth
        options={options}
        value={options.find((o) => o.value === shownValue) ?? null}
        onChange={(_, opt) => filters.set(def.key, opt?.value ?? null)}
        getOptionLabel={(o) => o.label}
        getOptionKey={(o) => o.value}
        isOptionEqualToValue={(a, b) => a.value === b.value}
        noOptionsText="Nothing matches"
        renderInput={(params) => <TextField {...params} label={def.label} placeholder="Any" />}
      />
    );
  }

  // A value in the address that is not in the list (a stale bookmark) still has
  // to be shown, or the select would look empty while the list is filtered.
  const unknown = shownValue !== '' && !options.some((o) => o.value === shownValue);
  return (
    <TextField
      select
      size="small"
      fullWidth
      label={def.label}
      value={shownValue}
      onChange={(e) =>
        filters.set(def.key, e.target.value && e.target.value !== def.defaultValue ? e.target.value : null)
      }
      slotProps={{
        inputLabel: { shrink: true },
        select: { displayEmpty: true },
      }}
    >
      {!def.defaultValue && <MenuItem value="">Any</MenuItem>}
      {unknown && <MenuItem value={shownValue}>{shownValue}</MenuItem>}
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value} sx={{ whiteSpace: 'normal' }}>
          {o.label}
          {o.count !== undefined && (
            <Box
              component="span"
              sx={{ ml: 1, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-text-3)' }}
            >
              {fmtCount(o.count)}
            </Box>
          )}
        </MenuItem>
      ))}
    </TextField>
  );
}

/**
 * The one toolbar every list screen uses (CF_HRMS_HIRING_SPEC.md §13.1), in the
 * same order everywhere: Search · Filters · [extra] · Add · Download Excel ·
 * Upload Excel. Under it, one quiet line: how many rows are shown, what is
 * filtering them, and a way to clear it.
 */
export function ListToolbar({
  filters,
  searchPlaceholder = 'Search…',
  defs,
  shown,
  total,
  noun,
  add,
  excel,
  extra,
}: {
  /** From `useListFilters`. */
  filters: ListFilters;
  searchPlaceholder?: string;
  /** Omit for a screen with search only. */
  defs?: FilterDef[];
  /** "38 of 220": rows shown after filtering, and the total. Omit `total` to show just the count. */
  shown: number;
  total?: number;
  /** What the rows are, for the count line: ['position', 'positions']. */
  noun: [string, string];
  /** The Add button. Rendered only when given (the caller applies the right). */
  add?: { label: string; onClick: () => void };
  /** The Excel buttons (`<ExcelButtons …/>`) — rendered after Add. */
  excel?: ReactNode;
  /** Anything screen-specific that must sit in the toolbar — rendered before Add, kept short. */
  extra?: ReactNode;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const list = defs ?? [];
  const active = list.filter((d) => {
    const v = filters.values[d.key] ?? '';
    return v !== '' && v !== d.defaultValue;
  });
  const search = filters.q.trim();

  const word = (n: number) => (n === 1 ? noun[0] : noun[1]);
  const countLine =
    filters.isFiltered && total !== undefined
      ? `${fmtCount(shown)} of ${fmtCount(total)} ${word(total)}`
      : filters.isFiltered
        ? `${fmtCount(shown)} ${word(shown)}`
        : `${fmtCount(total ?? shown)} ${word(total ?? shown)}`;

  const panel = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ fontWeight: 600, fontSize: 14, color: 'var(--c-text)', flex: 1 }}>Filters</Box>
        <IconButton
          size="small"
          aria-label="Close filters"
          onClick={() => setAnchor(null)}
          sx={{ color: 'var(--c-text-2)' }}
        >
          <CloseRounded fontSize="small" />
        </IconButton>
      </Box>
      {list.map((d) => (
        <FilterControl key={d.key} def={d} filters={filters} />
      ))}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Button
          size="small"
          disabled={filters.activeCount === 0}
          onClick={() => {
            const patch: Record<string, null> = {};
            for (const d of list) patch[d.key] = null;
            filters.setMany(patch);
          }}
        >
          Clear filters
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="contained" onClick={() => setAnchor(null)}>
          Done
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ mb: 2, minWidth: 0 }}>
      <Surface
        e={1}
        sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.25,
            height: 36,
            flex: { xs: '1 1 100%', sm: '1 1 220px' },
            minWidth: { xs: 0, sm: 180 },
            borderRadius: 'var(--r-sm)',
            background: 'var(--c-surface-2)',
            border: '1px solid var(--c-border)',
          }}
        >
          <SearchRounded sx={{ fontSize: 18, color: 'var(--c-text-3)' }} aria-hidden />
          <InputBase
            value={filters.q}
            onChange={(e) => filters.setQ(e.target.value)}
            // Escape clears the box rather than closing whatever is behind it.
            onKeyDown={(e) => {
              if (e.key === 'Escape' && filters.q) {
                e.stopPropagation();
                filters.setQ('');
              }
            }}
            placeholder={searchPlaceholder}
            inputProps={{ 'aria-label': searchPlaceholder, type: 'search' }}
            sx={{
              flex: 1,
              minWidth: 0,
              fontFamily: 'var(--font-ui)',
              fontSize: 14,
              color: 'var(--c-text)',
              '& input::-webkit-search-cancel-button': { display: 'none' },
            }}
          />
          {!!filters.q && (
            <IconButton
              size="small"
              aria-label="Clear search"
              onClick={() => filters.setQ('')}
              sx={{ p: 0.25, color: 'var(--c-text-3)' }}
            >
              <CloseRounded sx={{ fontSize: 16 }} />
            </IconButton>
          )}
        </Box>

        {list.length > 0 && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<TuneRounded />}
            aria-haspopup="dialog"
            aria-expanded={anchor ? true : undefined}
            aria-label={
              filters.activeCount > 0 ? `Filters, ${filters.activeCount} set` : 'Filters'
            }
            onClick={(e) => setAnchor(e.currentTarget)}
            sx={{ height: 36, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {filters.activeCount > 0 ? `Filters · ${filters.activeCount}` : 'Filters'}
          </Button>
        )}

        {extra}

        {add && (
          <Button
            variant="contained"
            size="small"
            startIcon={<AddRounded />}
            onClick={add.onClick}
            sx={{ height: 36, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {add.label}
          </Button>
        )}

        {excel}
      </Surface>

      {list.length > 0 &&
        (phone ? (
          <Drawer
            anchor="bottom"
            open={!!anchor}
            onClose={() => setAnchor(null)}
            slotProps={{
              paper: {
                sx: {
                  maxHeight: '85vh',
                  borderTopLeftRadius: 'var(--r-md)',
                  borderTopRightRadius: 'var(--r-md)',
                },
              },
            }}
          >
            <Box role="dialog" aria-label="Filters">
              {panel}
            </Box>
          </Drawer>
        ) : (
          <Popover
            open={!!anchor}
            anchorEl={anchor}
            onClose={() => setAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{ paper: { sx: { width: 340, maxWidth: 'calc(100vw - 32px)', mt: 0.5 } } }}
          >
            <Box role="dialog" aria-label="Filters">
              {panel}
            </Box>
          </Popover>
        ))}

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 0.75,
          mt: 1,
          px: 0.5,
          minWidth: 0,
          fontSize: 13,
          color: 'var(--c-text-2)',
        }}
      >
        <Box component="span" aria-live="polite" sx={{ whiteSpace: 'nowrap' }}>
          {countLine}
        </Box>
        {search !== '' && (
          <ActiveChip text={`Search: ${search}`} onRemove={() => filters.setQ('')} />
        )}
        {active.map((d) => (
          <ActiveChip
            key={d.key}
            text={activeText(d, filters.values[d.key])}
            onRemove={() => filters.set(d.key, null)}
          />
        ))}
        {filters.isFiltered && (
          <Button
            size="small"
            onClick={filters.clear}
            sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: 13 }}
          >
            Clear
          </Button>
        )}
      </Box>
    </Box>
  );
}
