import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import { EmptyState, ErrorNotice, ListSkeleton, Mono, SectionCard, Surface, ToneBadge } from '@shared/ui';
import { useCan } from '../access/can';
import { NoAccessNote } from '../access/Guard';
import { positionsApi, type PositionRow } from '../api/positions';
import { vacantLabel } from '../api/hiring';
import { NoticeChip } from './Leaving';
import { usePositionRemoval } from './usePositionRemoval';

const isVacant = (p: PositionRow) => p.occupant === null || (p.occupant === undefined && p.filledCount === 0);

/** The positions that hold a role: one row per position — a person or "Vacant", the shift, the code, the department. */
export function RolePositionsTab({ roleId, company }: { roleId: number; company: string }) {
  const [rows, setRows] = useState<PositionRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const can = useCan();
  // Positions are another area: listed and linked only with positions.view; removing one is positions.remove.
  const seePositions = can.positions.view;
  const canRemove = can.positions.remove;

  const load = useCallback(() => {
    if (!seePositions) return;
    setError(null);
    positionsApi.list({ roleId })
      .then((r) => setRows(r.items))
      .catch((e) => { setError(e); setRows([]); });
  }, [roleId, seePositions]);
  useEffect(() => { load(); }, [load]);
  // Remove goes through the one dialog, which reads what it would do before it offers anything.
  const removal = usePositionRemoval({ onDone: () => load() });

  if (!seePositions) return <NoAccessNote>You do not have access to positions.</NoAccessNote>;
  if (rows === null) return <ListSkeleton rows={4} />;
  const vacant = rows.filter(isVacant).length;
  const plural = (n: number) => `${n} position${n === 1 ? '' : 's'}`;

  return (
    <SectionCard
      title="Positions"
      subtitle={rows.length ? `${plural(rows.length)} · ${vacant} vacant` : 'Where this role is held.'}
    >
      {error ? <ErrorNotice error={error} onRetry={load} /> : null}
      {rows.length === 0 && !error ? (
        <EmptyState title="No positions hold this role" hint="A position is one chair for one person, on one shift." />
      ) : (
        <Stack spacing={1}>
          {rows.map((p) => (
            <Surface key={p.id} e={1} bordered sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Box component={Link} to={`/${company}/cf_hrms/positions/${p.id}`} sx={{ color: 'var(--c-primary-700)', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
                {isVacant(p) ? (vacantLabel(p) ?? 'Vacant') : p.occupant?.name ?? 'Filled'}
              </Box>
              <Mono sx={{ fontSize: 12.5 }}>{p.positionCode ?? `#${p.id}`}</Mono>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', flex: 1 }}>
                {[p.departmentName, p.locationName].filter(Boolean).join(' · ')}
              </Typography>
              {p.occupant?.notice && <NoticeChip notice={p.occupant.notice} />}
              {(p.shift?.name ?? p.shiftName) && <ToneBadge tone="neutral" noIcon label={p.shift?.name ?? p.shiftName ?? ''} />}
              {canRemove && (
                <Button
                  size="small"
                  color="inherit"
                  data-removeposition={p.id}
                  disabled={removal.busyId === p.id}
                  aria-label={`Remove position ${p.positionCode ?? p.displayTitle}`}
                  onClick={() => void removal.start(p.id)}
                  sx={{ color: 'var(--c-text-2)' }}
                >
                  Remove
                </Button>
              )}
            </Surface>
          ))}
        </Stack>
      )}
      {removal.dialog}
    </SectionCard>
  );
}
