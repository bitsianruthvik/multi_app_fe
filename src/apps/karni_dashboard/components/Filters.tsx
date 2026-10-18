import { useState } from 'react';
import { Button, Menu, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Divider } from '@mui/material';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import { useReport } from '../api';
import { RANGE_LABEL, type RangeKey } from '../filters';

/** All units / Unit 1 / Unit 2 … (the business places SAP knows). */
export function UnitSwitch({ value, onChange }: { value: string; onChange: (u: string) => void }) {
  const { data } = useReport<{ units: string[] }>('/units', false);
  const units = data?.units ?? [];
  if (units.length < 2) return null;
  return (
    <ToggleButtonGroup size="small" exclusive value={value} onChange={(_, v) => v !== null && onChange(v)} aria-label="Unit">
      <ToggleButton value="" sx={{ px: 1.5, textTransform: 'none' }}>All units</ToggleButton>
      {units.map((u) => <ToggleButton key={u} value={u} sx={{ px: 1.5, textTransform: 'none' }}>{u}</ToggleButton>)}
    </ToggleButtonGroup>
  );
}

const PRESETS: RangeKey[] = ['today', '7d', '30d', 'month', 'lastMonth', 'fy', 'lastFy'];

/** Period picker: presets plus a custom from–to. */
export function RangePicker({ range, from, to, onChange }: {
  range: RangeKey; from: string; to: string; onChange: (r: RangeKey, from?: string, to?: string) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const label = range === 'custom' ? `${from} → ${to}` : RANGE_LABEL[range];
  return (
    <>
      <Button size="small" variant="outlined" startIcon={<CalendarMonthRounded />} onClick={(e) => { setF(from); setT(to); setAnchor(e.currentTarget); }}
        sx={{ textTransform: 'none' }}>
        {label}
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {PRESETS.map((p) => (
          <MenuItem key={p} selected={p === range} onClick={() => { onChange(p); setAnchor(null); }}>{RANGE_LABEL[p]}</MenuItem>
        ))}
        <Divider />
        <Stack direction="row" spacing={1} sx={{ px: 2, py: 1 }} alignItems="center">
          <TextField size="small" type="date" label="From" value={f} onChange={(e) => setF(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" type="date" label="To" value={t} onChange={(e) => setT(e.target.value)} InputLabelProps={{ shrink: true }} />
          <Button size="small" variant="contained" disabled={!f || !t || f > t} onClick={() => { onChange('custom', f, t); setAnchor(null); }}>Apply</Button>
        </Stack>
      </Menu>
    </>
  );
}
