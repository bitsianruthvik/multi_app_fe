import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { getUnitMachines, putUnitMachine, type UnitMachineFunction, type UnitMachineOption, type UnitMachines as UnitMachinesData } from '../../api/planner';
import { machineWhatIf } from '../../lib/planner';
import type { Plan, PlannerSnapshot, PlannerUnit } from '../../lib/planner/types';
import { mins, signedMins as signed } from './model';

const weeks = (n: number | null) => (n == null ? 'cannot finish inside this plan' : `${n} ${n === 1 ? 'week' : 'weeks'}`);

/**
 * A card's MACHINES (§58). The planner books on machine types; here the card's open steps of a type
 * are put on ONE machine of it. Every machine says what the same work would take there — a machine
 * with its own chart runs at its own rate — and before anything is saved the sheet shows old → new
 * minutes and what that does to the weeks the card needs and the earliest week it can ship.
 * A machine whose chart has no answer for a piece of this card cannot be picked; it says why.
 */
export function UnitMachines({ unit, snapshot, plan, periodLabel, canEdit, onChanged }: {
  unit: PlannerUnit;
  snapshot: PlannerSnapshot;
  plan: Plan;
  periodLabel: (key: string) => string;
  canEdit: boolean;
  /** a move was saved: the page re-reads the plan */
  onChanged?: () => void;
}) {
  const [data, setData] = useState<UnitMachinesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [pick, setPick] = useState<{ fn: string; machineId: number | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null); setPick(null); setError(null); setProblems([]);
    getUnitMachines(unit.key)
      // An answer without machine types (an older backend) reads as "nothing to pick".
      .then((d) => { if (alive) setData(d && Array.isArray(d.functions) ? d : { unitKey: unit.key, released: false, sharedRow: false, functions: [] }); })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [unit.key]);

  const picked = useMemo(() => {
    if (!pick || !data) return null;
    const fn = data.functions.find((f) => f.key === pick.fn);
    if (!fn) return null;
    const option = pick.machineId == null ? null : fn.machines.find((m) => m.id === pick.machineId) ?? null;
    // Off any machine = back to the standard time.
    const change = option ? option.change ?? 0 : fn.standardMinutes - fn.minutesNow;
    return { fn, option, change, effect: machineWhatIf(snapshot, plan, unit.key, fn.key, change) };
  }, [pick, data, snapshot, plan, unit.key]);

  const save = () => {
    if (!pick) return;
    setBusy(true); setError(null); setProblems([]);
    putUnitMachine(unit.key, pick.fn, pick.machineId)
      .then((r) => { setData(r.machines); setPick(null); onChanged?.(); })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setProblems(Array.isArray((e as { problems?: string[] } | null)?.problems) ? (e as { problems: string[] }).problems : []);
      })
      .finally(() => setBusy(false));
  };

  const row = (fn: UnitMachineFunction, m: UnitMachineOption) => {
    const here = fn.machineId === m.id;
    const chosen = pick?.fn === fn.key && pick.machineId === m.id;
    return (
      <Box key={m.id} data-testid={`unit-machine-${m.id}`} data-available={m.available ? 'yes' : 'no'}
        sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, borderBottom: '1px solid var(--c-divider)', fontSize: 13, opacity: m.available ? 1 : 0.7 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{m.code}</span>
            {m.name && m.name !== m.code ? ` · ${m.name}` : ''}
            {m.ownChart && <Box component="span" data-testid={`unit-machine-own-${m.id}`} sx={{ ml: 0.75, px: 0.75, py: 0.125, borderRadius: 'var(--r-sm)', fontSize: 11.5, background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>own chart</Box>}
            {here && <Box component="span" sx={{ ml: 0.75, color: 'var(--c-text-2)' }}>— on it now</Box>}
          </Box>
          {m.available
            ? <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{mins(m.minutes ?? 0)}{m.change ? ` · ${signed(m.change)} against now` : ' · the same as now'}</Box>
            : <Box data-testid={`unit-machine-why-${m.id}`} sx={{ fontSize: 12, color: 'var(--c-danger-800)' }}>Not available for this card. {m.reason}</Box>}
        </Box>
        {canEdit && !here && (
          <Button size="small" variant={chosen ? 'contained' : 'outlined'} disabled={!m.available || busy} data-testid={`unit-machine-pick-${m.id}`}
            onClick={() => setPick(chosen ? null : { fn: fn.key, machineId: m.id })}>
            {chosen ? 'Picked' : 'Move here'}
          </Button>
        )}
      </Box>
    );
  };

  return (
    <Box data-testid="unit-machines">
      <Typography sx={{ fontWeight: 600, fontSize: 13, mt: 2, mb: 0.5 }}>Machines</Typography>
      {error && <Typography component="div" data-testid="unit-machines-error" sx={{ fontSize: 13, color: 'var(--c-danger-800)' }}>{error}{problems.map((p) => <Box key={p}>{p}</Box>)}</Typography>}
      {!data && !error && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Working out the machines…</Typography>}
      {data && !data.released && <Typography data-testid="unit-machines-note" sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{data.note ?? 'No machine to pick for this card yet.'}</Typography>}
      {data?.released && data.note && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 0.5 }}>{data.note}</Typography>}
      {data?.functions.map((fn) => (
        <Box key={fn.key} data-testid={`unit-machines-fn-${fn.key}`} sx={{ mb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, fontSize: 13, py: 0.5 }}>
            <span>{fn.name} · {fn.steps} open {fn.steps === 1 ? 'step' : 'steps'}</span>
            <span>{mins(fn.minutesNow)}{fn.machineId == null ? (fn.mixed ? ' · on several machines' : ' · standard') : ''}</span>
          </Box>
          {fn.machines.map((m) => row(fn, m))}
          {canEdit && (fn.machineId != null || fn.mixed) && (
            <Button size="small" sx={{ mt: 0.5 }} disabled={busy} data-testid={`unit-machine-clear-${fn.key}`} onClick={() => setPick({ fn: fn.key, machineId: null })}>
              Take off the machine (standard time)
            </Button>
          )}
        </Box>
      ))}
      {picked && (
        <Box data-testid="unit-machine-effect" sx={{ mt: 1, p: 1.5, borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', background: 'var(--c-surface-2)', fontSize: 13 }}>
          <Box sx={{ fontWeight: 600 }}>{picked.option ? `Move to ${picked.option.code}` : 'Back to the standard time'}</Box>
          <Box data-testid="unit-machine-minutes">{picked.fn.name}: {mins(picked.fn.minutesNow)} → {mins(picked.fn.minutesNow + picked.change)} ({picked.change ? signed(picked.change) : 'no change'})</Box>
          {picked.effect && (
            <>
              <Box data-testid="unit-machine-weeks">Shortest: {weeks(picked.effect.weeksBefore)} → {weeks(picked.effect.weeksAfter)}</Box>
              <Box data-testid="unit-machine-earliest">
                Earliest it can ship: {picked.effect.earliestBefore ? periodLabel(picked.effect.earliestBefore) : 'not inside this plan'} → {picked.effect.earliestAfter ? periodLabel(picked.effect.earliestAfter) : 'not inside this plan'}
              </Box>
            </>
          )}
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Button size="small" variant="contained" disabled={busy} onClick={save} data-testid="unit-machine-save">Save the move</Button>
            <Button size="small" disabled={busy} onClick={() => setPick(null)}>Cancel</Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}
