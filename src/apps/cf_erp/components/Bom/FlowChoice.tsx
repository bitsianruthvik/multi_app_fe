import { useMemo, useState, type MouseEvent } from 'react';
import { Box, InputAdornment, TextField, Tooltip, Typography } from '@mui/material';
import ArrowDropDownRounded from '@mui/icons-material/ArrowDropDownRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import type { Flow } from '../../api/types';
import { Mono } from '../ui';

import type { FlowShown, FlowDefault, FlowRef } from './flowShown';
import { takeAgainNote, usualFromText } from './flowShown';

const stepsOf = (f: Flow) => (f.steps ?? []).slice().sort((a, b) => a.sequence - b.sequence).map((s) => s.operation.name);

/** The clear control under a row's name: flow, ▾, and whether it is the default or changed here. */
export function FlowChip({ shown, made, disabled, label, onClick, tooltip }: {
  shown: FlowShown; made: boolean; disabled?: boolean; label: string; tooltip: string;
  onClick: (e: MouseEvent<HTMLElement>) => void;
}) {
  const none = !shown.flow;
  const changed = shown.tag === 'changed';
  const amber = none && made;
  return (
    <Tooltip title={tooltip}>
      <Box component="button" type="button" disabled={disabled} onClick={onClick} data-testid="flow-chip" data-flow-tag={shown.tag ?? 'none'} aria-label={label}
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.5, pl: 0.75, pr: 0.25, py: 0.125, borderRadius: 'var(--r-sm)', cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: 11.5, whiteSpace: 'nowrap', '& > svg': { fontSize: 13 },
          border: `1px ${none ? 'dashed' : 'solid'} ${changed ? 'var(--c-primary-400)' : amber ? 'var(--c-warning-600)' : 'var(--c-border)'}`,
          background: changed ? 'var(--c-primary-50)' : amber ? 'var(--c-warning-50)' : 'var(--c-surface-2)',
          color: changed ? 'var(--c-primary-700)' : amber ? 'var(--c-warning-800)' : none ? 'var(--c-text-3)' : 'var(--c-text-2)',
          '&:hover:not(:disabled)': { borderColor: 'var(--c-primary-400)' },
        }}>
        <RouteRounded />{none ? 'No flow' : shown.flow?.code}
        {shown.tag && (
          <Box component="span" sx={{
            fontFamily: 'var(--font-sans, inherit)', fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, px: 0.5, borderRadius: 'var(--r-sm)',
            background: changed ? 'var(--c-primary-600)' : 'var(--c-border)', color: changed ? '#fff' : 'var(--c-text-2)',
          }}>{shown.tag}</Box>
        )}
        {shown.unsaved && <Box component="span" aria-hidden sx={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-warning-600)' }} />}
        <ArrowDropDownRounded sx={{ fontSize: '18px !important', ml: -0.25 }} />
      </Box>
    </Tooltip>
  );
}

/**
 * The list under a row's picker: a search box, "Use the default" first, then
 * each flow with its steps in order. Obsolete flows are never offered.
 */
export function FlowChoiceList({ flows, chosen, usual, onPick, autoFocus = true, takeAgain, onTakeAgain }: {
  flows: Flow[] | null | undefined;
  /** The row's own choice now (null = the default). With `usual: 'own'`: the row's own flow. */
  chosen: number | null;
  /**
   * 'own': the TOP row of an order line — no BOM line holds it, so the flow picked IS the row's own and there is no default to go back to.
   */
  usual: FlowDefault | null | 'own';
  onPick: (id: number | null) => void;
  autoFocus?: boolean;
  /** The definition's flow of today, when it is not the flow the row is made by: one extra entry at the top. */
  takeAgain?: FlowRef | null;
  onTakeAgain?: () => void;
}) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (flows ?? []).filter((f) => (f.status !== 'obsolete' || f.id === chosen)
      && (!t || `${f.code} ${f.name} ${stepsOf(f).join(' ')}`.toLowerCase().includes(t)));
  }, [flows, q, chosen]);
  const row = (selected: boolean) => ({
    display: 'block', width: '100%', textAlign: 'left' as const, p: 1, border: 0, borderBottom: '1px solid var(--c-border)', cursor: 'pointer', font: 'inherit',
    background: selected ? 'var(--c-primary-50)' : 'transparent', color: 'var(--c-text)', '&:hover': { background: 'var(--c-surface-2)' },
  });
  return (
    <Box>
      <TextField size="small" fullWidth autoFocus={autoFocus} placeholder="Search flows or steps" value={q} onChange={(e) => setQ(e.target.value)}
        inputProps={{ 'aria-label': 'Search flows' }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }} />
      <Box role="listbox" aria-label="Flows" sx={{ mt: 1, maxHeight: 320, overflowY: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)' }}>
        {takeAgain && onTakeAgain && (
          <Box component="button" type="button" role="option" aria-selected={false} data-testid="flow-take-again" onClick={onTakeAgain} sx={row(false)}>
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Take the definition’s flow again — <Mono>{takeAgain.code}</Mono></Typography>
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{takeAgainNote(takeAgain)}</Typography>
          </Box>
        )}
        {usual !== 'own' && (
          <Box component="button" type="button" role="option" aria-selected={chosen == null} data-testid="flow-use-default" onClick={() => onPick(null)} sx={row(chosen == null)}>
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
              {usual ? <>Use the default (<Mono>{usual.code}</Mono>)</> : 'Use the default (none set up)'}
            </Typography>
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
              {usual ? `${usual.name} — from ${usualFromText(usual)}` : 'The row has no flow of its own yet.'}
            </Typography>
          </Box>
        )}
        {shown.map((f) => {
          const steps = stepsOf(f);
          return (
            <Box key={f.id} component="button" type="button" role="option" aria-selected={f.id === chosen} data-testid="flow-option" onClick={() => onPick(f.id)} sx={row(f.id === chosen)}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
                <Mono>{f.code}</Mono>
                <Typography sx={{ fontSize: 13, flex: 1 }}>{f.name}</Typography>
                {f.status !== 'active' && <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>{f.status}</Typography>}
              </Box>
              <Typography title={steps.join(' › ')} sx={{ fontSize: 11.5, color: 'var(--c-text-3)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{steps.length ? steps.join(' › ') : 'No steps yet'}</Typography>
            </Box>
          );
        })}
        {!shown.length && <Typography sx={{ p: 1.5, fontSize: 13, color: 'var(--c-text-3)' }}>{flows ? 'No flow matches' : 'Reading the flows…'}</Typography>}
      </Box>
    </Box>
  );
}
