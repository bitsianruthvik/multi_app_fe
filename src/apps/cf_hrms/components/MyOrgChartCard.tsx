import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Chip, Divider, Stack, Typography } from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { FactItem, Mono } from '@shared/ui';
import type { MyOrgChart, SliceNode, SliceRelation } from '../api/self';

/**
 * The floating panel's body on the EMPLOYEE chart (pages/MyOrgChart.tsx).
 *
 * It renders from the slice payload the page already holds and from nothing
 * else: no fetch, no import of api/orgchart, api/positions or api/people, and
 * no link to an HR screen a self-only login would get a 403 from. That is the
 * point of a separate card — the admin `OrgChartCard` fetches
 * `/orgchart/positions/:id/card` and offers "Close or delete…", and reusing it
 * here would open the side door the slice endpoint exists to close.
 *
 * The caller's own seat points at My place for the full list of
 * responsibilities, which `/user/me/place` serves for them alone.
 */

const RELATION_LABEL: Record<SliceRelation, string> = {
  SELF: 'You',
  MANAGER: 'Above you',
  REPORT: 'In your team',
  DOTTED_MANAGER: 'Your dotted-line manager',
};

const SHIFT_WORDS: Record<string, string> = {
  G: 'General shift',
  D: 'Day shift',
  N: 'Night shift',
  DN: 'Day & Night shifts',
};

function seatName(n: SliceNode | undefined): string {
  if (!n) return 'A seat outside this view';
  return n.displayTitle || n.title;
}

function people(n: SliceNode | undefined): string {
  if (!n || !n.occupants.length) return 'Vacant';
  return n.occupants.map((o) => (o.isMe ? `${o.name} (you)` : o.name)).join(', ');
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography
        sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: 0.4, mb: 0.75 }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

export function MyOrgChartCard({
  slice,
  positionId,
  company,
  teamSize,
  children,
}: {
  slice: MyOrgChart;
  positionId: number | null;
  company: string;
  /** Direct reports drawn under this box. */
  teamSize: number;
  /** The viewer's own view controls (arrange, fold) — presentation only. */
  children?: ReactNode;
}) {
  const byId = new Map(slice.nodes.map((n) => [n.id, n]));
  const node = positionId == null ? undefined : byId.get(positionId);
  if (!node) return null;

  const mine = node.relation === 'SELF';
  const lines = slice.edges
    .filter((e) => e.fromPositionId === node.id)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const shift =
    node.shiftPattern === 'DN'
      ? SHIFT_WORDS.DN
      : node.defaultShift?.name ?? SHIFT_WORDS[node.shiftPattern] ?? '—';

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        {node.positionCode && <Mono sx={{ fontSize: 12.5 }}>{node.positionCode}</Mono>}
        <Chip
          size="small"
          label={RELATION_LABEL[node.relation]}
          color={mine ? 'primary' : 'default'}
          variant={mine ? 'filled' : 'outlined'}
        />
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>as at {slice.asOf}</Typography>
      </Stack>

      {mine && (
        <Box
          sx={{
            p: 1.5,
            mb: 2,
            borderRadius: 'var(--r-sm)',
            background: 'var(--c-primary-50)',
            border: '1px solid var(--c-border)',
          }}
        >
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', mb: 0.5 }}>
            This is your seat
          </Typography>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1 }}>
            Your responsibilities, KRAs and everyone you report to, in full, are on My place.
          </Typography>
          <Button
            component={RouterLink}
            to={`/${company}/cf_hrms/my-place`}
            size="small"
            variant="contained"
            endIcon={<ArrowForwardRounded />}
          >
            Open My place
          </Button>
        </Box>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: 2,
          mb: 2,
        }}
      >
        <FactItem label="Role" value={node.roleTitle ?? '—'} />
        <FactItem label="Department" value={node.departmentName ?? '—'} />
        <FactItem label="Location" value={node.locationName ?? '—'} />
        <FactItem label="Shift" value={shift} />
      </Box>

      {node.contexts.length > 0 && (
        <Section title="Works on">
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {node.contexts.map((c) => (
              <Chip key={c.name} size="small" variant="outlined" label={c.name} />
            ))}
          </Stack>
        </Section>
      )}

      <Section title={node.occupants.length === 1 ? 'Person in this seat' : 'People in this seat'}>
        {node.occupants.length ? (
          <Stack spacing={0.5}>
            {node.occupants.map((o, i) => (
              <Typography key={`${o.name}-${i}`} sx={{ fontSize: 14, color: 'var(--c-text)' }}>
                {o.name}
                {o.isMe && <Box component="span" sx={{ color: 'var(--c-primary-500)', fontWeight: 600 }}> · you</Box>}
                {node.shiftPattern === 'DN' && o.shiftCode && (
                  <Box component="span" sx={{ color: 'var(--c-text-3)' }}>
                    {' '}· {o.shiftCode === 'N' ? 'Night' : 'Day'}
                  </Box>
                )}
              </Typography>
            ))}
          </Stack>
        ) : (
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-3)', fontStyle: 'italic' }}>
            Nobody is in this seat today.
          </Typography>
        )}
      </Section>

      <Section title="Reports to">
        {lines.length ? (
          <Stack spacing={1} divider={<Divider flexItem />}>
            {lines.map((e) => {
              const mgr = byId.get(e.toPositionId);
              return (
                <Box key={`${e.toPositionId}-${e.typeCode}-${e.scopeLabel ?? ''}`}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>
                    {seatName(mgr)}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                    {people(mgr)}
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
                    {e.isPrimary || e.typeCode === 'PRIMARY_MANAGER' ? 'Main manager' : `${e.typeName} (dashed line)`}
                    {e.scopeSentence && e.scopeType !== 'GENERAL' ? ` · ${e.scopeSentence}` : ''}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
        ) : (
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-3)' }}>
            Nobody — this is the top of the organisation.
          </Typography>
        )}
      </Section>

      {teamSize > 0 && (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5 }}>
          {teamSize} seat{teamSize === 1 ? '' : 's'} report{teamSize === 1 ? 's' : ''} directly to this one in your view.
        </Typography>
      )}

      {children}
    </Box>
  );
}
