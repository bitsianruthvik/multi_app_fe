import { useState } from 'react';
import { Box, Button, MenuItem, Popover, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import LabelOutlined from '@mui/icons-material/LabelOutlined';
import type { LabelGroup } from '../api/organisation';
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
 * The chart's label options (CF_HRMS_HIRING_SPEC.md §15.4), one compact
 * "Labels" button on the toolbar that opens:
 *
 *   Colour by   None · each label group — department boxes take a soft colour
 *               per label of that group; the key is in the strip above the chart.
 *   Show only   a label per group — positions outside are drawn faint, never
 *               removed; the strip says how many are inside.
 *
 * Yours only — kept in this browser. Nothing here moves a box.
 */
export function LabelViewOptions({
  groups,
  colourBy,
  onColourBy,
  filter,
  onFilter,
}: {
  groups: LabelGroup[];
  colourBy: number | null;
  onColourBy: (groupId: number | null) => void;
  /** The label ids chosen, comma-separated (the lists' `label` rule). */
  filter: string;
  onFilter: (value: string) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const usable = groups.filter((g) => g.labels.length > 0);
  if (!usable.length) return null;
  const chosen = new Set(filter.split(',').map((v) => Number(v)).filter((n) => n > 0));
  const set = colourBy != null || chosen.size > 0;
  const pick = (g: LabelGroup, labelId: number | '') => {
    const mine = new Set(g.labels.map((l) => l.id));
    const rest = [...chosen].filter((id) => !mine.has(id));
    onFilter([...rest, ...(labelId === '' ? [] : [labelId])].join(','));
  };
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
        Labels
      </Button>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 320, maxWidth: 'calc(100vw - 32px)', p: 2 } } }}
      >
        <Stack spacing={1.5} role="dialog" aria-label="Labels on the chart">
          <TextField
            select
            size="small"
            label="Colour by"
            value={colourBy ?? ''}
            onChange={(e) => onColourBy(e.target.value === '' ? null : Number(e.target.value))}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            helperText="Each department box takes the colour of its label in that group."
          >
            <MenuItem value="">None</MenuItem>
            {usable.map((g) => (
              <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>
            ))}
          </TextField>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>Show only</Typography>
          {usable.map((g) => {
            const value = g.labels.find((l) => chosen.has(l.id))?.id ?? '';
            return (
              <TextField
                key={g.id}
                select
                size="small"
                label={g.name}
                value={value}
                onChange={(e) => pick(g, e.target.value === '' ? '' : Number(e.target.value))}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              >
                <MenuItem value="">Any</MenuItem>
                {g.labels.map((l) => (
                  <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>
                ))}
              </TextField>
            );
          })}
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
            Positions outside the chosen labels are drawn faint, not removed. A department&apos;s own labels count — not
            the labels of the departments above it. Yours only — kept in this browser.
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button size="small" disabled={!set} onClick={() => { onColourBy(null); onFilter(''); }}>
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
