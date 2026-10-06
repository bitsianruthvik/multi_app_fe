import { useMemo } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { SideSheet } from '@shared/ui';
import { fastest } from '../../lib/planner';
import type { Evaluation, Plan, PlannerSnapshot, PlannerUnit } from '../../lib/planner/types';
import { WorkBar } from './WorkBar';
import { copyText, mins, shortDate, splitAction, tonnes } from './model';

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.5, fontSize: 13, borderBottom: '1px solid var(--c-divider)' }}>
    <span style={{ color: 'var(--c-text-2)' }}>{k}</span><span style={{ textAlign: 'right' }}>{children}</span>
  </Box>
);

const weeks = (n: number) => `${n} ${n === 1 ? 'week' : 'weeks'}`;

/** One card in detail: when its work runs, what is in it, how long each function needs, what material it waits for. */
export function UnitSheet({ unit, snapshot, evaluation, plan, periodLabel, canEdit, busy, buyListPath, onClose, onUnplan, onPin, onStretch, onEarliest, onSplit }: {
  unit: PlannerUnit | null;
  snapshot: PlannerSnapshot;
  evaluation: Evaluation;
  /** the plan on the page (for "as early as possible") */
  plan: Plan;
  periodLabel: (key: string) => string;
  canEdit: boolean;
  /** a split / join is being saved */
  busy: boolean;
  buyListPath: string;
  onClose: () => void;
  onUnplan: (key: string) => void;
  onPin: (key: string, pinned: boolean) => void;
  /** start week (period key) of a stretched bar; null = back to the shortest */
  onStretch: (key: string, start: string | null) => void;
  /** place it in the earliest week it can ship */
  onEarliest: (key: string, week: string) => void;
  onSplit: (target: PlannerUnit, split: boolean) => void;
}) {
  const ev = unit ? evaluation.units[unit.key] : undefined;
  const fns = snapshot.functions.map((f) => ({ f, m: unit?.work[f.key] ?? 0 })).filter((x) => x.m > 0);
  const earliest = useMemo(() => (unit && canEdit ? fastest(snapshot, plan, unit.key) : null), [unit, canEdit, snapshot, plan]);
  const orderCode = (u: PlannerUnit) => snapshot.orders.find((o) => String(o.id) === String(u.orderId))?.code;
  const split = unit ? splitAction(snapshot.units, unit, orderCode(unit)) : null;
  const copy = unit ? copyText(snapshot.units, unit) : null;
  return (
    <SideSheet open={!!unit} onClose={onClose} title={unit?.code ?? ''} subtitle={unit?.name}
      actions={unit && canEdit ? (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {ev?.period && <Button variant="outlined" onClick={() => { onUnplan(unit.key); onClose(); }}>Unplan</Button>}
          {ev?.period && <Button variant="contained" onClick={() => onPin(unit.key, !ev.pinned)}>{ev.pinned ? 'Unpin' : 'Pin here'}</Button>}
        </Box>
      ) : undefined}>
      {unit && (
        <Box>
          <Row k="Ships">{ev?.period ? periodLabel(ev.period) : 'Not planned'}{ev?.pinned ? ' (pinned)' : ''}</Row>
          {ev?.period && ev.leadStart && <Row k="Work">{periodLabel(ev.leadStart)} → {periodLabel(ev.period)} · {weeks(Math.max(1, ev.lead))}</Row>}
          <Row k="Shortest">{ev?.minWeeks != null ? weeks(ev.minWeeks) : 'Cannot finish inside this plan'}</Row>
          {ev?.start != null && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, py: 0.5, fontSize: 13, borderBottom: '1px solid var(--c-divider)' }}>
              <span>Stretched from {periodLabel(ev.start)}</span>
              {canEdit && <Button size="small" onClick={() => onStretch(unit.key, null)}>Back to shortest</Button>}
            </Box>
          )}
          <Row k="Weight">{tonnes(unit.tonnes)} t</Row>
          <Row k="Holds">{unit.marks > 0 ? `${unit.marks} ${unit.marks === 1 ? 'shipping piece' : 'shipping pieces'}` : 'The whole item'}{copy ? ` · ${copy}` : ''}</Row>
          {unit.committedDate && <Row k="Promised">{shortDate(unit.committedDate)}{ev?.late ? ' — after this date' : ''}</Row>}
          {unit.progress > 0 && <Row k="Done">{Math.round(unit.progress * 100)}%</Row>}
          {ev?.blocked && <Typography sx={{ mt: 1, fontSize: 13, color: 'var(--c-danger-800)' }}>
            {ev.blocked}{ev.blockedKind === 'not_ordered' && <> — <Link to={buyListPath}>open Purchase</Link></>}
          </Typography>}

          {canEdit && (
            <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.75 }}>
              <Button size="small" variant="outlined" disabled={earliest == null} onClick={() => earliest && onEarliest(unit.key, earliest)}>Plan as early as possible</Button>
              {earliest == null && (
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                  {ev?.blocked ?? 'No week fits: its material is not here in time, or the shop has no hours left.'}
                </Typography>
              )}
              {split && <Button size="small" variant="outlined" disabled={busy} onClick={() => onSplit(split.target, split.split)}>{split.label}</Button>}
            </Box>
          )}

          <Typography sx={{ fontWeight: 600, fontSize: 13, mt: 2, mb: 0.5 }}>Time needed</Typography>
          {fns.length === 0 ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No times set.</Typography> : fns.map((x) => <Row key={x.f.key} k={x.f.name}>{mins(x.m)}</Row>)}
          <WorkBar unit={unit} fns={snapshot.functions} height={6} />
          {unit.noRate > 0 && <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)', mt: 0.5 }}>{unit.noRate} {unit.noRate === 1 ? 'step has' : 'steps have'} no time set.</Typography>}

          <Typography sx={{ fontWeight: 600, fontSize: 13, mt: 2, mb: 0.5 }}>Material</Typography>
          {unit.materials.length === 0 ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>None needed.</Typography> : unit.materials.map((m) => {
            const item = snapshot.supply[String(m.itemId)];
            return (
              <Box key={String(m.itemId)} sx={{ py: 0.5, borderBottom: '1px solid var(--c-divider)', fontSize: 13 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                  <span>{item?.name ?? `Item ${m.itemId}`}</span><span>{Math.round(m.qty * 100) / 100} {item?.uom ?? ''}</span>
                </Box>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                  {item && item.lots.length ? item.lots.map((l) => (l.source === 'stock' ? 'In stock' : `${l.source} ${shortDate(l.date)}${l.received ? ' (received)' : ''}`)).join(' · ') : 'Not ordered'}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </SideSheet>
  );
}
