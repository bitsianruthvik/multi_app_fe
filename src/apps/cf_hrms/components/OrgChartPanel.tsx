import { Box, Button, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { Arrange } from './orgChartLayout';

/**
 * The viewer's own controls for one box (spec §4 "Panel", §14).
 *
 * Until 2026-10-09 this was an inspector docked beside the chart, repeating the
 * card's facts with a button to open the card. The card now opens in the same
 * floating panel, so the facts live there once and this shrank to the part
 * that was only ever here: how this box's team is arranged, whether it is
 * folded, and starting the chart from it. All presentation, not org data —
 * kept per viewer, never sent to the server (spec §9).
 */

const ARRANGE_HELP: Record<Arrange, string> = {
  auto: 'Reports with teams of their own side by side on the next level; the rest in one column beside them.',
  side: 'Everyone side by side, individual contributors too. Wider.',
  stack: 'The whole team as an indented list under this box. Narrower; its levels stop lining up.',
};

export function OrgChartPanel({
  teamSize,
  arrange,
  onArrange,
  collapsed,
  onToggleCollapse,
}: {
  /** Direct reports in the model — the toggles are meaningless without any. */
  teamSize: number;
  arrange: Arrange;
  onArrange: (a: Arrange) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <Box
      sx={{
        p: 1.5,
        mb: 1,
        borderRadius: 'var(--r-sm)',
        background: 'var(--c-surface-2)',
        border: '1px solid var(--c-border)',
      }}
    >
      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 0.75 }}>
        Your view of this team — kept in this browser, never written to the organisation
      </Typography>
      {teamSize === 0 ? (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
          This seat has no reports to arrange or fold.
        </Typography>
      ) : (
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={arrange}
              onChange={(_, v) => v && onArrange(v as Arrange)}
              aria-label="How to arrange this team"
            >
              <ToggleButton value="auto">Automatic</ToggleButton>
              <ToggleButton value="side">Side by side</ToggleButton>
              <ToggleButton value="stack">List</ToggleButton>
            </ToggleButtonGroup>
            <Button size="small" onClick={onToggleCollapse}>
              {collapsed ? `Show this team (${teamSize})` : 'Fold this team away'}
            </Button>
          </Stack>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', lineHeight: 1.45 }}>
            {ARRANGE_HELP[arrange]}
          </Typography>
        </Stack>
      )}
    </Box>
  );
}
