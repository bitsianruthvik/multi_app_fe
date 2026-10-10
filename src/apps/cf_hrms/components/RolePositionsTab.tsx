import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Stack, Typography } from '@mui/material';
import { EmptyState, ErrorNotice, ListSkeleton, Mono, SectionCard, Surface, ToneBadge } from '@shared/ui';
import { positionsApi, type PositionRow } from '../api/positions';

const isVacant = (p: PositionRow) => p.occupant === null || (p.occupant === undefined && p.filledCount === 0);

/** The positions that hold a role: one row per position — a person or "Vacant", the shift, the code, the department. */
export function RolePositionsTab({ roleId, company }: { roleId: number; company: string }) {
  const [rows, setRows] = useState<PositionRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    positionsApi.list({ roleId })
      .then((r) => setRows(r.items))
      .catch((e) => { setError(e); setRows([]); });
  }, [roleId]);
  useEffect(() => { load(); }, [load]);

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
                {isVacant(p) ? 'Vacant' : p.occupant?.name ?? 'Filled'}
              </Box>
              <Mono sx={{ fontSize: 12.5 }}>{p.positionCode ?? `#${p.id}`}</Mono>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', flex: 1 }}>
                {[p.departmentName, p.locationName].filter(Boolean).join(' · ')}
              </Typography>
              {(p.shift?.name ?? p.shiftName) && <ToneBadge tone="neutral" noIcon label={p.shift?.name ?? p.shiftName ?? ''} />}
            </Surface>
          ))}
        </Stack>
      )}
    </SectionCard>
  );
}
