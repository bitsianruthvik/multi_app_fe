import { useEffect, useMemo, useState } from 'react';
import { Box, TextField, Typography } from '@mui/material';
import { getMachines, getOperators } from '../../api/floor';
import type { FloorMachine, FloorOperator } from '../../api/types';
import { useLoad } from '../../hooks/useLoad';
import { BigButton, Calm, TapCard } from './floorUi';

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

/** Step 1: which machine is this tablet at? Remembered on the device, so it is asked once. */
export function MachinePicker({ onPick }: { onPick: (m: FloorMachine) => void }) {
  const list = useLoad(() => getMachines(), []);
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (list.data ?? []).filter((m) => !t || `${m.name} ${m.code} ${m.type ?? ''}`.toLowerCase().includes(t));
  }, [list.data, search]);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography component="h1" sx={{ fontSize: 28, fontWeight: 700 }}>Which machine?</Typography>
      {(list.data?.length ?? 0) > 6 && (
        <TextField placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} inputProps={{ 'aria-label': 'Search machines', style: { fontSize: 20, height: 32 } }} />
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
      {!list.loading && !list.error && shown.length === 0 && <Typography sx={{ fontSize: 18, color: 'var(--c-text-2)' }}>{search ? 'No machine matches.' : 'No machines yet.'}</Typography>}
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
