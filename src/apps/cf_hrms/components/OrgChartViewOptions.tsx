import { useState } from 'react';
import { Box, Button, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
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
