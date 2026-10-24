import { useState } from 'react';
import { Box, Button, FormControlLabel, MenuItem, Popover, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import LabelOutlined from '@mui/icons-material/LabelOutlined';
import type { DepartmentLabel } from '../api/organisation';
import type { Arrange } from './orgChartLayout';

/**
 * The viewer's own drawing options for one box — a closed disclosure at the
 * very bottom of the panel (spec §17).
 *
 * Until 2026-10-10 this was an open block near the top ("Your view of this
 * team… Close Production…"). The client called it meaningless there, and it
 * was: closing a department is done on the chart, by clicking its name. What
 * is left is only what still DOES something for this box —
 *   - how the positions reporting to it are arranged (works with department
 *     boxes on or off; inside a box it arranges the reports in that box);
 *   - folding its team away, which exists only in the plain tree (with
 *     department boxes drawn, the fold is the department's).
 * A box nobody reports to has neither, so the disclosure is not drawn at all.
 * All of it is per viewer, kept in this browser, never sent to the server.
 *
 * (`OrgChartPanel.tsx` — the old block — is still what the EMPLOYEE chart
 * uses; that panel is not part of this redesign.)
 */
export function OrgChartViewOptions({
  teamSize,
  arrange,
  onArrange,
  fold,
}: {
  /** Reports this option arranges. 0 = nothing to offer. */
  teamSize: number;
  arrange: Arrange;
  onArrange: (a: Arrange) => void;
  /** Only in the plain tree. */
  fold?: { collapsed: boolean; onToggle: () => void };
}) {
  const [open, setOpen] = useState(false);
  if (teamSize === 0) return null;
  return (
    <Box sx={{ mt: 2, borderTop: '1px solid var(--c-divider)', pt: 0.5 }} data-viewoptions="">
      <Button
        size="small"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        startIcon={open ? <ExpandMoreRounded /> : <ChevronRightRounded />}
        sx={{ textTransform: 'none', color: 'var(--c-text-2)' }}
      >
        View options
      </Button>
      {open && (
        <Stack spacing={0.75} sx={{ pl: 0.5, pb: 0.5 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={arrange}
              onChange={(_, v) => v && onArrange(v as Arrange)}
              aria-label={`How the ${teamSize} position${teamSize === 1 ? '' : 's'} reporting here are arranged`}
            >
              <ToggleButton value="auto">Automatic</ToggleButton>
              <ToggleButton value="side">Side by side</ToggleButton>
              <ToggleButton value="stack">List</ToggleButton>
            </ToggleButtonGroup>
            {fold && (
              <Button size="small" onClick={fold.onToggle}>
                {fold.collapsed ? `Show this team (${teamSize})` : 'Fold this team away'}
              </Button>
            )}
          </Stack>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
            How the chart draws the {teamSize} position{teamSize === 1 ? '' : 's'} reporting here. Yours only — kept in
            this browser.
          </Typography>
        </Stack>
      )}
    </Box>
  );
}

export default OrgChartViewOptions;

/**
 * The chart's label options, one compact "Labels" button on the toolbar that
 * opens (one label per department since 2026-10-16):
 *
 *   Colour by label   on / off — department boxes take a soft colour per label;
 *                     the key is in the strip above the chart.
 *   Show only         one label — positions outside are drawn faint, never
 *                     removed; the strip says how many are inside.
 *
 * Yours only — kept in this browser. Nothing here moves a box.
 */
export function LabelViewOptions({
  labels,
  colourBy,
  onColourBy,
  filter,
  onFilter,
  performance,
}: {
  labels: DepartmentLabel[];
  colourBy: boolean;
  onColourBy: (on: boolean) => void;
  /** The label id chosen (the lists' `label` rule); '' = any. */
  filter: string;
  onFilter: (value: string) => void;
  /**
   * "Colour by performance" (spec §19.3) — only for a login with performance view.
   * '' off · 'now' the plans whose period holds today · a period id.
   */
  performance?: { value: string; onChange: (v: string) => void; periods: { id: number; name: string; status: string }[] };
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!labels.length && !performance) return null;
  const chosen = labels.find((l) => String(l.id) === filter.split(',')[0]?.trim())?.id ?? '';
  const set = colourBy || chosen !== '' || !!performance?.value;
  return (
    <>
      <Button
        size="small"
        variant={set ? 'contained' : 'outlined'}
        startIcon={<LabelOutlined />}
        aria-haspopup="dialog"
        aria-expanded={anchor ? true : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        {performance ? 'Colour and kinds' : 'Kinds'}
      </Button>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 320, maxWidth: 'calc(100vw - 32px)', p: 2 } } }}
      >
        <Stack spacing={1.5} role="dialog" aria-label="Kinds of org unit on the chart">
          {performance && (
            <TextField
              select
              size="small"
              label="Colour by performance"
              value={performance.value}
              onChange={(e) => performance.onChange(e.target.value)}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              helperText="A dot on each person's row: on track, at risk or behind. People without a plan show nothing."
            >
              <MenuItem value="">Off</MenuItem>
              <MenuItem value="now">The plans running today</MenuItem>
              {performance.periods.map((p) => (
                <MenuItem key={p.id} value={String(p.id)}>{p.name}{p.status === 'CLOSED' ? ' (closed)' : ''}</MenuItem>
              ))}
            </TextField>
          )}
          {labels.length > 0 && (<>
          <Box>
            <FormControlLabel
              control={<Switch size="small" checked={colourBy} onChange={(e) => onColourBy(e.target.checked)} />}
              label={<Typography sx={{ fontSize: 14 }}>Colour by kind</Typography>}
              sx={{ ml: 0 }}
            />
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>Each org unit box takes the colour of its kind.</Typography>
          </Box>
          <TextField
            select
            size="small"
            label="Show only"
            value={chosen}
            onChange={(e) => onFilter(e.target.value === '' ? '' : String(e.target.value))}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value="">Any kind</MenuItem>
            {labels.map((l) => (
              <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>
            ))}
          </TextField>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
            Positions outside the chosen kind are drawn faint, not removed. An org unit&apos;s own kind counts — not
            the kind of the units above it. Yours only — kept in this browser.
          </Typography>
          </>)}
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button size="small" disabled={!set} onClick={() => { onColourBy(false); onFilter(''); performance?.onChange(''); }}>
              Clear
            </Button>
            <Button size="small" variant="contained" onClick={() => setAnchor(null)}>
              Done
            </Button>
          </Box>
        </Stack>
      </Popover>
    </>
  );
}
