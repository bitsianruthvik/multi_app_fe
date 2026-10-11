import { useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Chip, Divider, Stack, Typography } from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { FactItem, Mono } from '@shared/ui';
import { SeatJobContentEditor } from './SeatJobContentEditor';
import { TeamShiftControl } from './TeamShiftControl';
import type { MyOrgChart, SliceNode, SliceRelation } from '../api/self';

/**
 * The floating panel's body on the EMPLOYEE chart (pages/MyOrgChart.tsx).
 *
 * It renders from the slice payload the page already holds and from nothing
 * else: no fetch, no import of api/orgchart, api/positions or api/people, and
 * no link to an HR screen a self-only login would get a 403 from. That is the
 * point of a separate card — the admin panel fetches
 * `/orgchart/positions/:id/card` and offers "Close or delete…", and reusing it
 * here would open the side door the slice endpoint exists to close.
 *
 * ONE VIEW FOR A CARD (2026-10-10): the role, and its positions as rows — the
 * person or Vacant, the shift, the code. A click on a row of the chart opens
 * the same view with that row marked. There is nothing to edit here, so there
 * is no separate position view.
 *
 * The caller's own position points at My place for the full list of
 * responsibilities, which `/user/me/place` serves for them alone.
 */

const RELATION_LABEL: Record<SliceRelation, string> = {
  SELF: 'You',
  SAME_CARD: 'Same role as you',
  MANAGER: 'Above you',
  REPORT: 'In your team',
  DOTTED_MANAGER: 'Your dotted-line manager',
};
const RELATION_RANK: SliceRelation[] = ['SELF', 'SAME_CARD', 'MANAGER', 'DOTTED_MANAGER', 'REPORT'];

const SHIFT_WORDS: Record<string, string> = { G: 'General', D: 'Day', N: 'Night' };

function shiftOf(n: SliceNode): string {
  const name = n.defaultShift?.name?.trim();
  if (name) return name.replace(/\s+shift$/i, '') || name;
  return SHIFT_WORDS[n.shiftPattern] ?? n.shiftPattern ?? '';
}

function roleName(n: SliceNode | undefined): string {
  if (!n) return 'A position outside this view';
  return n.displayTitle || n.title;
}

function person(n: SliceNode | undefined): string {
  const o = n?.occupants[0];
  if (!o) return 'Vacant';
  return o.isMe ? `${o.name} (you)` : o.name;
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
  positionIds,
  currentId,
  company,
  teamSize,
  onChanged,
  children,
}: {
  slice: MyOrgChart;
  /** The positions of the card that was opened, in the card's row order. */
  positionIds: number[];
  /** The row that was clicked, if it was a row. */
  currentId?: number | null;
  company: string;
  /** Cards drawn directly under this one. */
  teamSize: number;
  /** After a team position's shift was changed here: read the chart again. */
  onChanged?: () => void;
  /** The viewer's own view controls (arrange, fold) — presentation only. */
  children?: ReactNode;
}) {
  /** Which of the card's editable positions is open below. */
  const [pickedId, setPickedId] = useState<number | null>(null);
  const byId = new Map(slice.nodes.map((n) => [n.id, n]));
  const rows = positionIds.map((id) => byId.get(id)).filter((n): n is SliceNode => !!n);
  const first = rows[0];
  if (!first) return null;

  const mine = rows.some((n) => n.relation === 'SELF');
  const relation = RELATION_RANK.find((r) => rows.some((n) => n.relation === r)) ?? first.relation;
  const inCard = new Set(positionIds);
  // The card's reporting lines: each distinct manager once, primary first.
  const seen = new Set<string>();
  const lines = slice.edges
    .filter((e) => inCard.has(e.fromPositionId))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    .filter((e) => {
      const key = `${e.toPositionId}|${e.typeCode}|${e.scopeLabel ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const contexts = [...new Set(rows.flatMap((n) => n.contexts.map((c) => c.name)))];
  const vacant = rows.filter((n) => !n.occupants.length).length;
  // The positions of this card the signed-in person may change (the server says which: only ones BELOW them).
  // Any other card — their own, a card-mate's, a manager's — has none, and then nothing about editing is drawn at all.
  const editable = rows.filter((n) => n.canEdit === true);
  const picked = editable.find((n) => n.id === pickedId) ?? editable.find((n) => n.id === currentId) ?? editable[0] ?? null;

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <Chip
          size="small"
          label={RELATION_LABEL[relation]}
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
            This is your role
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
        <FactItem label="Role" value={first.roleTitle ?? '—'} />
        <FactItem label="Department" value={first.departmentName ?? '—'} />
        <FactItem label="Location" value={first.locationName ?? '—'} />
      </Box>

      <Section
        title={`Positions · ${rows.length}${vacant ? ` · ${vacant} vacant` : ''}`}
      >
        <Stack spacing={0.5} data-mypositions="">
          {rows.map((n) => {
            const o = n.occupants[0];
            const current = currentId === n.id;
            return (
              <Box
                key={n.id}
                aria-current={current ? 'true' : undefined}
                sx={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 1,
                  px: 1,
                  py: 0.6,
                  border: '1px solid var(--c-border)',
                  borderStyle: o ? 'solid' : 'dashed',
                  borderColor: current ? 'var(--c-primary-500)' : 'var(--c-border)',
                  borderRadius: 'var(--r-sm)',
                  background: o ? 'var(--c-surface)' : 'var(--c-surface-2)',
                }}
              >
                <Typography
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 14,
                    overflowWrap: 'anywhere',
                    color: o ? 'var(--c-text)' : 'var(--c-text-2)',
                    fontStyle: o ? 'normal' : 'italic',
                  }}
                >
                  {o ? o.name : 'Vacant'}
                  {o?.isMe && <Box component="span" sx={{ color: 'var(--c-primary-500)', fontWeight: 600 }}> · you</Box>}
                </Typography>
                <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', flexShrink: 0 }}>{shiftOf(n)}</Box>
                {n.positionCode && <Mono sx={{ fontSize: 11.5, flexShrink: 0 }}>{n.positionCode}</Mono>}
              </Box>
            );
          })}
        </Stack>
      </Section>

      {contexts.length > 0 && (
        <Section title="Works on">
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {contexts.map((c) => (
              <Chip key={c} size="small" variant="outlined" label={c} />
            ))}
          </Stack>
        </Section>
      )}

      <Section title="Reports to">
        {lines.length ? (
          <Stack spacing={1} divider={<Divider flexItem />}>
            {lines.map((e) => {
              const mgr = byId.get(e.toPositionId);
              return (
                <Box key={`${e.toPositionId}-${e.typeCode}-${e.scopeLabel ?? ''}`}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>
                    {person(mgr)}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                    {roleName(mgr)}
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

      {picked && (
        <Section title="Your team">
          <Typography data-teamnote="" sx={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.5, mb: 1 }}>
            You can change responsibilities, KPIs and the shift for your team.
          </Typography>
          {editable.length > 1 && (
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1 }} role="group" aria-label="Which position">
              {editable.map((n) => (
                <Chip
                  key={n.id}
                  size="small"
                  clickable
                  color={n.id === picked.id ? 'primary' : 'default'}
                  variant={n.id === picked.id ? 'filled' : 'outlined'}
                  label={[n.occupants[0]?.name ?? 'Vacant', shiftOf(n), n.positionCode].filter(Boolean).join(' · ')}
                  onClick={() => setPickedId(n.id)}
                />
              ))}
            </Stack>
          )}
          <Box data-teamposition={picked.id}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.5 }}>
              {picked.occupants[0]?.name ?? 'Vacant'}
              {picked.positionCode ? <> · <Mono sx={{ fontSize: 12 }}>{picked.positionCode}</Mono></> : null}
            </Typography>
            <Box sx={{ fontSize: 13.5, mb: 1.25 }}>
              <Box component="span" sx={{ color: 'var(--c-text-2)', mr: 0.75 }}>Shift</Box>
              <TeamShiftControl
                key={picked.id}
                positionId={picked.id}
                shift={picked.defaultShift ?? null}
                shiftName={shiftOf(picked)}
                occupantName={picked.occupants[0]?.name ?? null}
                onChanged={() => onChanged?.()}
              />
            </Box>
            <SeatJobContentEditor key={picked.id} positionId={picked.id} company={company} canManage embedded scope="team" />
          </Box>
        </Section>
      )}

      {teamSize > 0 && (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5 }}>
          {teamSize} role{teamSize === 1 ? '' : 's'} report{teamSize === 1 ? 's' : ''} directly to this one in your view.
        </Typography>
      )}

      {children}
    </Box>
  );
}
