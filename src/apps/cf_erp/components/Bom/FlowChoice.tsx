import { useMemo, useState, type MouseEvent } from 'react';
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, TextField, Tooltip, Typography } from '@mui/material';
import ArrowDropDownRounded from '@mui/icons-material/ArrowDropDownRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import type { Flow, StructureNode } from '../../api/types';
import { Mono } from '../ui';
import { isMade } from './flowShown';

import type { FlowShown, FlowDefault } from './flowShown';
import { usualFromText, type BulkRow } from './flowShown';

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
export function FlowChoiceList({ flows, chosen, usual, onPick, autoFocus = true }: {
  flows: Flow[] | null | undefined;
  /** The row's own choice now (null = the default). */
  chosen: number | null;
  /** 'each': several rows at once — every row goes to its own default. */
  usual: FlowDefault | null | 'each';
  onPick: (id: number | null) => void;
  autoFocus?: boolean;
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
        <Box component="button" type="button" role="option" aria-selected={chosen == null} data-testid="flow-use-default" onClick={() => onPick(null)} sx={row(chosen == null)}>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
            {usual === 'each' ? 'Use each row’s default' : usual ? <>Use the default (<Mono>{usual.code}</Mono>)</> : 'Use the default (none set up)'}
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
            {usual === 'each' ? 'Takes the choice off each ticked row; it follows its item or template again.'
              : usual ? `${usual.name} — from ${usualFromText(usual)}` : 'The row follows its item or template, which have no flow yet.'}
          </Typography>
        </Box>
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


/** "Change flow for N rows…": tick the rows, choose one flow (or the default) for all of them. */
export function BulkFlowDialog({ open, rows, flows, shownOf, onClose, onApply }: {
  open: boolean;
  rows: BulkRow[];
  flows: Flow[] | null | undefined;
  shownOf: (node: StructureNode) => FlowShown;
  onClose: () => void;
  onApply: (keys: string[], flowId: number | null) => void;
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [choice, setChoice] = useState<{ id: number | null } | undefined>(undefined);
  const chosenRows = rows.filter((r) => ticked.has(r.key));
  const kinds = new Set(chosenRows.map((r) => (isMade(r.node) ? 'made' : 'bought')));
  const mixed = kinds.size > 1;
  const toggle = (key: string) => setTicked((t) => { const n = new Set(t); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const flowOf = (id: number | null) => (id == null ? null : (flows ?? []).find((f) => f.id === id));
  const close = () => { setTicked(new Set()); setChoice(undefined); onClose(); };
  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="md">
      <DialogTitle>Change the flow for several rows</DialogTitle>
      <DialogContent sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, pt: '8px !important' }}>
        <Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 0.5 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, flex: 1 }}>1. Tick the rows</Typography>
            <Button size="small" onClick={() => setTicked(new Set(rows.map((r) => r.key)))}>All</Button>
            <Button size="small" onClick={() => setTicked(new Set())}>None</Button>
          </Box>
          <Box data-testid="bulk-rows" sx={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)' }}>
            {rows.map((r) => {
              const s = shownOf(r.node);
              return (
                <Box key={r.key} component="label" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: r.depth * 1.5, pr: 1, borderBottom: '1px solid var(--c-border)', cursor: 'pointer' }}>
                  <Checkbox size="small" checked={ticked.has(r.key)} onChange={() => toggle(r.key)} inputProps={{ 'aria-label': `Select ${r.label}` }} />
                  <Typography sx={{ fontSize: 12.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</Typography>
                  <Typography sx={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: s.flow ? 'var(--c-text-2)' : 'var(--c-warning-800)' }}>
                    {s.flow ? `${s.flow.code}${s.tag === 'changed' ? ' (changed)' : ''}` : 'No flow'}
                  </Typography>
                </Box>
              );
            })}
            {!rows.length && <Typography sx={{ p: 1.5, fontSize: 13, color: 'var(--c-text-3)' }}>No row here can change its flow.</Typography>}
          </Box>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>2. Choose the flow</Typography>
          {open && <FlowChoiceList flows={flows} autoFocus={false} chosen={choice ? choice.id : null} usual="each"
            onPick={(id) => setChoice({ id })} />}
          {choice && (
            <Typography data-testid="bulk-choice" sx={{ mt: 1, fontSize: 12.5 }}>
              {choice.id == null ? 'Each row goes back to its own default.' : <>All ticked rows will be made by <Mono>{flowOf(choice.id)?.code}</Mono>.</>}
            </Typography>
          )}
          {mixed && <Alert severity="warning" sx={{ mt: 1 }}>The ticked rows are of different kinds (made and bought). A flow suits one kind better than the other — you can still apply it.</Alert>}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button variant="contained" disabled={!chosenRows.length || !choice} data-testid="bulk-apply"
          onClick={() => { onApply(chosenRows.map((r) => r.key), choice?.id ?? null); close(); }}>
          {chosenRows.length ? `Apply to ${chosenRows.length} ${chosenRows.length === 1 ? 'row' : 'rows'}` : 'Apply'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
