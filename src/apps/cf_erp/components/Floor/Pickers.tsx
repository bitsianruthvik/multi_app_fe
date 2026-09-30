import { useEffect, useMemo, useState } from 'react';
import { Box, TextField, Typography } from '@mui/material';
import { getMachines, getOperators } from '../../api/floor';
import type { FloorMachine, FloorOperator } from '../../api/types';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { BigButton, Calm, Choice, TapCard } from './floorUi';
import { machineFilter, type FilterLevel } from './floorModel';
import { loadMachineFilter, saveMachineFilter } from './floorStore';

/** Loading, and the calm version of failing: what happened and one button. */
export function LoadState({ loading, error, onRetry }: { loading: boolean; error: { message: string } | null; onRetry: () => void }) {
  if (error) return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, alignItems: 'flex-start' }}>
      <Calm tone="warning">Could not load this. {error.message}</Calm>
      <BigButton onClick={onRetry} variant="outlined">Try again</BigButton>
    </Box>
  );
  return loading ? <Typography sx={{ fontSize: 18, color: 'var(--c-text-2)' }}>Loading…</Typography> : null;
}

const machineNote = (m: FloorMachine) =>
  m.running > 0 ? `${m.running} running` : m.stopped ? `Stopped${m.stopReason ? `: ${m.stopReason}` : ''}` : 'Free';

/** A chip's label with its count, e.g. "Cutting 3". */
const counted = (name: string, n: number) => (
  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
    {name}<Box component="span" sx={{ fontFamily: 'var(--font-mono)', fontSize: 15, opacity: 0.75 }}>{n}</Box>
  </Box>
);

/**
 * One row of the type filter: "All" and one big chip per option, each with how
 * many machines it holds. Scrolls sideways on a phone rather than growing tall.
 */
function FilterRow({ row, onChoose }: { row: FilterLevel; onChoose: (id: number | null) => void }) {
  return (
    <Box role="group" aria-label={`Filter by ${row.level || 'type'}`} data-testid="machine-filter-row" data-level={row.index}
      sx={{ display: 'flex', gap: 1, overflowX: 'auto', flexWrap: { xs: 'nowrap', md: 'wrap' }, pb: 0.5 }}>
      <Choice selected={row.chosen == null} onClick={() => onChoose(null)} sx={{ flexShrink: 0, minHeight: 52, fontSize: 18 }}>{counted('All', row.total)}</Choice>
      {row.options.map((o) => (
        <Choice key={o.id} selected={row.chosen === o.id} onClick={() => onChoose(row.chosen === o.id ? null : o.id)} sx={{ flexShrink: 0, minHeight: 52, fontSize: 18 }}>
          {counted(o.name, o.count)}
        </Choice>
      ))}
    </Box>
  );
}

/**
 * Step 1: which machine is this tablet at? Remembered on the device, so it is
 * asked once. With many machines, the machine type's levels (Family › Subfamily
 * › Variant — e.g. Cutting › CNC › Plasma) narrow the list in taps, together
 * with the search; the choice is remembered on the device too.
 */
export function MachinePicker({ onPick }: { onPick: (m: FloorMachine) => void }) {
  const company = useCompanySlug();
  const list = useLoad(() => getMachines(), []);
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<(number | null)[]>(() => loadMachineFilter(company));
  const searched = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (list.data ?? []).filter((m) => !t || `${m.name} ${m.code} ${m.type ?? ''} ${(m.typePath ?? []).map((p) => p.name).join(' ')}`.toLowerCase().includes(t));
  }, [list.data, search]);
  const { levels, shown } = useMemo(() => machineFilter(searched, chosen), [searched, chosen]);
  const choose = (index: number, id: number | null) => {
    // A choice clears the levels under it: they belong to the old branch.
    const next = chosen.slice(0, index);
    while (next.length < index) next.push(null);
    next[index] = id;
    setChosen(next); saveMachineFilter(company, next);
  };
  const filtered = levels.some((l) => l.chosen != null);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography component="h1" sx={{ fontSize: 28, fontWeight: 700 }}>Which machine?</Typography>
      {(list.data?.length ?? 0) > 6 && (
        <TextField placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} inputProps={{ 'aria-label': 'Search machines', style: { fontSize: 20, height: 32 } }} />
      )}
      {levels.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {levels.map((row) => <FilterRow key={row.index} row={row} onChoose={(id) => choose(row.index, id)} />)}
        </Box>
      )}
      <LoadState loading={list.loading && !list.data} error={list.error} onRetry={list.reload} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
        {shown.map((m) => (
          <TapCard key={m.id} onClick={() => onPick(m)} sx={{ minHeight: 96 }}>
            <Box component="span" aria-hidden sx={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, background: m.running > 0 ? 'var(--c-success-600)' : m.stopped ? 'var(--c-warning-600)' : 'var(--c-neutral-200)' }} />
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ fontSize: 22, fontWeight: 700, overflowWrap: 'anywhere' }}>{m.name}</Box>
              <Box sx={{ fontSize: 16, color: 'var(--c-text-2)' }}>{machineNote(m)}</Box>
            </Box>
          </TapCard>
        ))}
      </Box>
      {!list.loading && !list.error && shown.length === 0 && <Typography sx={{ fontSize: 18, color: 'var(--c-text-2)' }}>{search || filtered ? 'No machine matches.' : 'No machines yet.'}</Typography>}
      {filtered && <Box><BigButton variant="outlined" onClick={() => { setChosen([]); saveMachineFilter(company, []); }}>Show all machines</BigButton></Box>}
    </Box>
  );
}

/** Step 2: who is using the tablet now. The server lists this machine's usual people first. */
export function OperatorPicker({ machine, onPick }: { machine: FloorMachine; onPick: (o: FloorOperator) => void }) {
  const list = useLoad(() => getOperators(machine.id), [machine.id]);
  const [search, setSearch] = useState('');
  useEffect(() => setSearch(''), [machine.id]);
  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (list.data ?? []).filter((o) => !t || o.name.toLowerCase().includes(t));
  }, [list.data, search]);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography component="h1" sx={{ fontSize: 28, fontWeight: 700 }}>Who are you?</Typography>
      {(list.data?.length ?? 0) > 8 && (
        <TextField placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} inputProps={{ 'aria-label': 'Search names', style: { fontSize: 20, height: 32 } }} />
      )}
      <LoadState loading={list.loading && !list.data} error={list.error} onRetry={list.reload} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
        {shown.map((o) => (
          <TapCard key={o.id} onClick={() => onPick(o)}><Box sx={{ fontSize: 22, fontWeight: 700 }}>{o.name}</Box></TapCard>
        ))}
      </Box>
      {!list.loading && !list.error && shown.length === 0 && (
        <Calm>{search ? 'No name matches.' : 'No operators yet. A manager adds them in Setup › Operators.'}</Calm>
      )}
    </Box>
  );
}
