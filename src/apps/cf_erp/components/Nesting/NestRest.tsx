import { useMemo, useState } from 'react';
import { Box, Button, Collapse } from '@mui/material';
import type { Nest } from '../../api/types';
import { additionsOf, pieceCounts, restLine, restOf, type NestAddition } from '../../lib/nesting';
import type { NestingPlan } from '../../api/types';
import { Badge, CapsLabel, Mono, SectionCard } from '../ui';
import { PlateDiagram } from './PlateDiagram';

/**
 * "NEST THE REST", said in words: which left-over pieces went onto the
 * customer's plates, and which onto new ones. The pieces added to a customer's
 * plate are drawn on that plate, paler with a dashed edge, so they cannot be
 * mistaken for the customer's own.
 */

/** The one-line summary, and per cut plate where its pieces went. */
export function RestSummary({ plan }: { plan: NestingPlan }) {
  const rest = restOf(plan);
  const [open, setOpen] = useState(false);
  const line = restLine(rest);
  if (!rest || !line) return null;
  return (
    <Box data-testid="nest-rest" sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
      <Box sx={{ fontSize: 13.5, fontWeight: 500 }}>{line}</Box>
      <Box>
        <Button size="small" onClick={() => setOpen((o) => !o)}>{open ? 'Hide where each piece goes' : 'Where each piece goes'}</Button>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.3, fontSize: 12.5, overflowWrap: 'anywhere' }}>
          {rest.pieces.map((p) => (
            <li key={p.cutPlateId}>
              <Mono>{p.cutPlateCode}</Mono>{` ×${p.qty}: `}
              {[
                ...p.onExisting.map((x) => `${x.qty} on the customer's ${x.lotNo}`),
                ...p.onNew.map((x) => `${x.qty} on new plate ${x.lotNo}`),
                ...(p.unplaced ? [`${p.unplaced} not placed`] : []),
              ].join(', ')}
            </li>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

function AdditionRow({ add, base }: { add: NestAddition; base: Nest | undefined }) {
  const [open, setOpen] = useState(false);
  const merged = useMemo(() => (base
    ? ({ ...base, pieces: [...base.pieces.filter((p) => (p as { placedBy?: string }).placedBy !== 'ours'), ...add.pieces] } as Nest)
    : null), [base, add]);
  const counts = pieceCounts(add.pieces);
  return (
    <Box data-testid="nest-addition" sx={{ py: 1, borderBottom: '1px solid var(--c-divider)', display: 'grid', gap: 0.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Mono chip>{add.lotNo}</Mono>
        <Box sx={{ fontSize: 13.5, fontWeight: 500 }}>{add.plateCode}</Box>
        <Badge family="info" noIcon label="Gets more pieces" title="The customer's layout stays. Ours go in the space they left." />
        <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
          {`+${add.pieces.length}: ${counts.map((c) => `${c.code} ×${c.qty}`).join(', ')}`}
        </Box>
        {merged && <Button size="small" sx={{ ml: 'auto' }} onClick={() => setOpen((o) => !o)}>{open ? 'Hide the plate' : 'Show the plate'}</Button>}
      </Box>
      {merged && <Collapse in={open} unmountOnExit><PlateDiagram nest={merged} kerfMm={add.kerfMm ?? 0} title={`${add.lotNo} with our additions`} /></Collapse>}
    </Box>
  );
}

/** The customer's plates the proposal adds to, each with its new pieces. */
export function Additions({ plan, saved }: { plan: NestingPlan; saved: NestingPlan | null }) {
  const adds = additionsOf(plan);
  if (!adds.length) return null;
  const nests = saved?.groups.flatMap((g) => g.nests) ?? [];
  return (
    <SectionCard title={`Added to the customer's plates (${adds.length})`}
      subtitle="Nothing the customer drew moves. These pieces go in the space they left.">
      <Box sx={{ minWidth: 0 }}>
        <CapsLabel>Plates that get more pieces</CapsLabel>
        {adds.map((a) => <AdditionRow key={a.lotId} add={a} base={nests.find((n) => n.id === a.lotId)} />)}
      </Box>
    </SectionCard>
  );
}
