import { useState } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { ErrorNotice, ListSkeleton, SectionCard } from '@shared/ui';
import { useReport } from '../api';
import type { Filters } from '../filters';
import { pct, tonnes } from '../format';

const AREAS = ['Injection', 'Assembly', 'Coating', 'Dewaxing', 'Melting', 'Fettling', 'Inspection', 'Machining inspection'];
const BY = [['finish', 'Finish code'], ['metal', 'Metal'], ['weight', 'Piece weight'], ['size', 'Line size']] as const;
type Matrix = Record<string, number | string | null> & { type: string; pouredTonnes: number; total: number | null };
interface Report { matrix: Matrix[] }

/** Colour deepens with the rejection, so the eye goes to the high cell first. */
const heat = (v: number, max: number) => (!v ? 'transparent' : `color-mix(in srgb, var(--c-danger-600) ${Math.min(70, Math.round((v / max) * 70))}%, transparent)`);

/** Rejection by stage and type of work, as % of metal poured. */
export function YieldMatrix({ filters: f }: { filters: Filters }) {
  const [by, setBy] = useState<string>('finish');
  const { data: d, error, reload } = useReport<Report>(f.ready ? `/yield${f.query({ by })}` : null);
  const maxCell = d ? Math.max(1, ...d.matrix.flatMap((r) => AREAS.map((a) => Number(r[a]) || 0))) : 1;
  return (
    <SectionCard title="By stage and type of work" subtitle="Rejected % of metal poured. Darker is higher." flush info="Rejected weight at each stage as a percentage of the metal poured for each type of work, in the selected date range. The buttons choose the type: finish code, metal, piece weight or line size. Types with under 1 t poured are left out; Total is all rejections for the type over its poured metal." actions={(
      <ToggleButtonGroup size="small" exclusive value={by} onChange={(_, v) => v && setBy(v)}>
        {BY.map(([k, l]) => <ToggleButton key={k} value={k} sx={{ textTransform: 'none', py: 0.3 }}>{l}</ToggleButton>)}
      </ToggleButtonGroup>
    )}>
      {error ? <ErrorNotice error={error} onRetry={reload} /> : !d ? <ListSkeleton rows={4} /> : (
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow><TableCell sx={{ fontWeight: 700 }}>Type</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>Poured</TableCell>{AREAS.map((a) => <TableCell key={a} align="center" sx={{ fontWeight: 700 }}>{a}</TableCell>)}<TableCell align="right" sx={{ fontWeight: 700 }}>Total</TableCell></TableRow></TableHead>
                <TableBody>
                  {d.matrix.map((r) => (
                    <TableRow key={r.type}>
                      <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.type}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{tonnes(r.pouredTonnes)}</TableCell>
                      {AREAS.map((a) => <TableCell key={a} align="center" sx={{ background: heat(Number(r[a]), maxCell), fontVariantNumeric: 'tabular-nums' }}>{Number(r[a]) ? Number(r[a]).toFixed(1) : '–'}</TableCell>)}
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{pct(r.total, 1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
      )}
    </SectionCard>
  );
}
