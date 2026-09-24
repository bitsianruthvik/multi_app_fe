import { Box, Button, Chip, Divider, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { CrossLink, EmptyState, FactItem, Mono, StatusBadge, Surface } from '@shared/ui';
import type { OrgChartEdge } from '../api/orgchart';
import { rowsOf, type Arrange, type ChartModel, type ShiftFilter } from './orgChartLayout';

/**
 * The inspector for whatever box is selected (spec §4, "Panel").
 *
 * It is where the *view* preferences that belong to one node live — how its
 * children are arranged, whether its branch is folded. Both are presentation,
 * not org data, so they are stored per viewer and never sent to the server
 * (spec §9). Everything else here is a summary with a way through to the real
 * record, so the panel never becomes a second place to read the same facts.
 */

const ARRANGE_HELP: Record<Arrange, string> = {
  auto: 'Side by side when a report has its own team, an indented list when they are all leaves. This is what keeps the chart narrow.',
  side: 'Always side by side. Wider, but the levels line up.',
  stack: 'Always an indented list. Narrow, and long.',
};

export function OrgChartPanel({
  model,
  selected,
  filter,
  secondaryEdges,
  company,
  arrange,
  onArrange,
  collapsed,
  onToggleCollapse,
  onStartFrom,
  onOpenCard,
}: {
  model: ChartModel;
  selected: number | null;
  filter: ShiftFilter;
  secondaryEdges: OrgChartEdge[];
  company: string;
  arrange: Arrange;
  onArrange: (a: Arrange) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onStartFrom: () => void;
  onOpenCard: () => void;
}) {
  const node = selected == null ? null : model.byId.get(selected);
  if (!node) {
    return (
      <EmptyState
        title="Nothing selected"
        hint="Click a box, or tab into the chart and move with the arrow keys."
      />
    );
  }

  const seats = rowsOf(node, filter);
  const filled = seats.filter((r) => r.occupant).length;
  const kids = model.children.get(node.id) ?? [];
  const parentId = model.parent.get(node.id);
  const parent = parentId != null ? model.byId.get(parentId) : null;
  const others = secondaryEdges.filter((e) => e.fromPositionId === node.id);

  return (
    <Stack spacing={2}>
      <Box>
        <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
          {node.displayTitle || node.title}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
          {node.positionCode && <Mono sx={{ fontSize: 12.5 }}>{node.positionCode}</Mono>}
          <StatusBadge status={node.status} />
        </Stack>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
        <FactItem label="Seats" value={String(seats.length)} />
        <FactItem label="Filled" value={String(filled)} />
        <FactItem label="Vacant" value={String(seats.length - filled)} />
        <FactItem label="Direct reports" value={String(kids.length)} />
        <FactItem label="Department" value={node.departmentName ?? '—'} />
        <FactItem label="Location" value={node.locationName ?? '—'} />
      </Box>

      {(node.contexts ?? []).length > 0 && (
        <Box>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 0.5 }}>
            Works on — a context, never a manager
          </Typography>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {node.contexts.map((c) => (
              <Chip key={c.id} size="small" label={c.name} />
            ))}
          </Stack>
        </Box>
      )}

      <Box>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 0.5 }}>Reports to</Typography>
        {parent ? (
          <CrossLink
            label={parent.displayTitle || parent.title}
            to={`/${company}/cf_hrms/positions/${parent.id}`}
          />
        ) : (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>
            Top of the chart.
          </Typography>
        )}
        {others.length > 0 && (
          <Stack spacing={0.5} sx={{ mt: 1 }}>
            {others.map((e, i) => {
              const to = model.byId.get(e.toPositionId);
              return (
                <Typography key={i} sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                  {e.typeName} → {to ? to.displayTitle || to.title : `#${e.toPositionId}`}
                  {e.scopeType && e.scopeType !== 'GENERAL' && e.scopeLabel
                    ? ` — for ${e.scopeLabel}`
                    : ''}
                </Typography>
              );
            })}
          </Stack>
        )}
      </Box>

      <Divider />

      <Box>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 0.5 }}>
          Show this team as
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          fullWidth
          value={arrange}
          onChange={(_, v) => v && onArrange(v as Arrange)}
          aria-label="How to arrange this team"
          disabled={kids.length === 0}
        >
          <ToggleButton value="auto">Automatic</ToggleButton>
          <ToggleButton value="side">Side by side</ToggleButton>
          <ToggleButton value="stack">List</ToggleButton>
        </ToggleButtonGroup>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.75, lineHeight: 1.45 }}>
          {kids.length === 0 ? 'This seat has no reports to arrange.' : ARRANGE_HELP[arrange]}
        </Typography>
      </Box>

      <Surface e={0} sx={{ p: 1.5, background: 'var(--c-surface-2)' }}>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', lineHeight: 1.45 }}>
          Arrangement, folding, zoom and the shift filter are yours alone. They are kept in this
          browser and never written to the organisation.
        </Typography>
      </Surface>

      <Stack spacing={1}>
        <Button variant="contained" size="small" onClick={onOpenCard}>
          Open the card
        </Button>
        <Button size="small" variant="outlined" onClick={onStartFrom}>
          Start the chart here
        </Button>
        <Button size="small" onClick={onToggleCollapse} disabled={kids.length === 0}>
          {collapsed ? 'Show this team' : 'Fold this team away'}
        </Button>
        <CrossLink
          label="Open the full position record"
          to={`/${company}/cf_hrms/positions/${node.id}`}
        />
      </Stack>
    </Stack>
  );
}
