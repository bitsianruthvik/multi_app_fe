import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { Box, Button, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import CallMergeRounded from '@mui/icons-material/CallMergeRounded';
import CallSplitRounded from '@mui/icons-material/CallSplitRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import HourglassTopRounded from '@mui/icons-material/HourglassTopRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import type { FlowStepTime } from '../api/types';
import { useCompanySlug } from '../hooks/useLoad';
import { appPath } from '../navMeta';
import { timeInWords, type FieldIndex } from '../lib/formulaBuilder';
import {
  mergeChoices, splitsAbove, timeViewOf,
  type DraftStep, type DraftWait, type FlowChanges, type FlowDraft, type FlowLayout, type Gap, type LaneBox, type StepMark,
} from '../lib/flowEdit';
import { Badge, CapsLabel, Mono, StatusBadge, Surface } from './ui';

/**
 * A flow's steps as a picture: rows top to bottom, LANES side by side. Lane 1 is the trunk; a split
 * opens a lane beside it, a merge closes it into a step of another lane, and thin lines show both.
 * A step alone in its row runs the full width; a meeting step covers the lanes that close into it.
 *
 * The same picture serves both modes of the flow page —
 *   view   the saved steps, each card with its operation's setup and time per piece;
 *   edit   the page's pending draft: a "+" in every gap of every lane (Add / Split / Merge), cards
 *          dragged or moved with the arrows within a lane and across lanes, every change marked.
 * Nothing here calls the server; each control hands the page an intent and the page keeps the draft.
 */

export const TIME_IS_SHARED = 'This is the operation’s time — every flow that uses it follows.';

export interface FlowStepsActions {
  add: (gap: Gap, beforeSplit: boolean) => void;
  split: (gap: Gap) => void;
  merge: (gap: Gap) => void;
  move: (stepKey: string, gap: Gap) => void;
  moveBy: (stepKey: string, direction: 'up' | 'down' | 'left' | 'right') => void;
  remove: (step: DraftStep) => void;
  replace: (step: DraftStep) => void;
  edit: (step: DraftStep, patch: { stepName?: string; notes?: string }) => void;
  addWait: (step: DraftStep) => void;
  removeWait: (step: DraftStep, wait: DraftWait) => void;
  removeExtra: (step: DraftStep, afterKey: string) => void;
}

const MARK: Record<StepMark['kind'], { family: 'success' | 'warning'; label: string; edge: string }> = {
  new: { family: 'success', label: 'New', edge: 'var(--c-success-600)' },
  changed: { family: 'warning', label: 'Changed', edge: 'var(--c-warning-600)' },
};
const RAIL = 44;
const COL_GAP = 12;
const COL_MIN = 236;
const LINE = 'var(--c-neutral-200)';

/** One labelled fact of the times strip, with its small edit action. */
function TimeFact({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <CapsLabel>{label}</CapsLabel>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.25, fontSize: 13.5, color: 'var(--c-text)' }}>
        <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</Box>
        {action}
      </Box>
    </Box>
  );
}

/** The operation's setup and time per piece in words, and the machine type they are set for. */
function StepTimes({ step, time, idx, canEditTime, onEditTime }: {
  step: DraftStep; time: FlowStepTime | undefined; idx: FieldIndex | null; canEditTime: boolean;
  onEditTime: (step: DraftStep, which: 'setup' | 'work', anchor: HTMLElement) => void;
}) {
  const company = useCompanySlug();
  const setup = timeViewOf(time?.setup);
  const work = timeViewOf(time?.work);
  const keptOut = time?.eligible === false;
  const subject = time?.subject ?? null;
  const pencil = (which: 'setup' | 'work') => canEditTime && !keptOut && (
    <Tooltip title={`Edit the formula. ${TIME_IS_SHARED}`}>
      <IconButton size="small" data-testid={`step-${which}-${step.key}`} aria-label={`Edit the ${which === 'setup' ? 'setup time' : 'time per piece'} of ${step.operation.code}`}
        onClick={(e) => onEditTime(step, which, e.currentTarget)} sx={{ p: 0.25, mt: '-1px', color: 'var(--c-text-3)', '&:hover': { color: 'var(--c-primary-700)' } }}>
        <EditRounded sx={{ fontSize: 15 }} />
      </IconButton>
    </Tooltip>
  );
  return (
    <Box data-testid={`step-times-${step.key}`} sx={{ mt: 1, px: 1.25, py: 1, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)', border: '1px solid var(--c-divider)',
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', columnGap: 2, rowGap: 1 }}>
      <TimeFact label="Setup" action={pencil('setup')}>
        {keptOut ? <Box component="span" sx={{ color: 'var(--c-text-3)' }}>—</Box>
          : setup ? timeInWords(setup, 'setup', idx) : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>No setup</Box>}
      </TimeFact>
      <TimeFact label="Time per piece" action={pencil('work')}>
        {keptOut ? <Box component="span" sx={{ color: 'var(--c-text-3)' }}>—</Box>
          : work ? timeInWords(work, 'work', idx) : <Box component="span" sx={{ color: 'var(--c-warning-800)', fontWeight: 500 }}>No time yet</Box>}
      </TimeFact>
      <TimeFact label="Runs on">
        {subject
          ? <>{subject.type === 'machine' ? `${subject.code ?? subject.name ?? 'One machine'} (one machine)` : subject.name ?? subject.code ?? '—'}{keptOut && <Box component="span" sx={{ ml: 0.75, color: 'var(--c-danger-800)', fontSize: 12 }}>kept out</Box>}</>
          : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>No machine type yet</Box>}
        {(time?.rules ?? 0) > 1 && (
          <Box sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
            Main rule of {time?.rules} — <Link to={appPath(company, `operations/${step.operation.id}`)}>see all</Link>
          </Box>
        )}
      </TimeFact>
    </Box>
  );
}

interface CardProps {
  step: DraftStep; draft: FlowDraft; number: number | string; editing: boolean; mark: StepMark | undefined; moved: boolean; time: FlowStepTime | undefined; idx: FieldIndex | null;
  canEditTime: boolean; onEditTime: (step: DraftStep, which: 'setup' | 'work', anchor: HTMLElement) => void; actions: FlowStepsActions;
  /** Which of up / down / left / right it can move. */
  can: { up: boolean; down: boolean; left: boolean; right: boolean };
  /** "Lane 2 meets here", "Lane 3 splits off after this step" — what the lines beside the card mean, in words. */
  notes: string[];
  onDragStart: (e: DragEvent<HTMLElement>) => void; onDragEnd: () => void;
}

function StepCard({ step, draft, number, editing, mark, moved, time, idx, canEditTime, onEditTime, actions, can, notes, onDragStart, onDragEnd }: CardProps) {
  const company = useCompanySlug();
  const m = mark ? MARK[mark.kind] : null;
  const code = step.operation.code;
  const arrow = (direction: 'up' | 'down' | 'left' | 'right', icon: ReactNode, label: string, on: boolean) => (
    <IconButton size="small" aria-label={`Move step ${code} ${label}`} disabled={!on} onClick={() => actions.moveBy(step.key, direction)} sx={{ p: 0.25 }}>{icon}</IconButton>
  );
  return (
    <Surface e={1} data-testid={`step-card-${step.key}`} data-mark={mark?.kind ?? 'saved'} sx={{ p: 1.5, minWidth: 0, height: '100%', ...(m ? { borderLeft: `3px solid ${m.edge}` } : {}) }}>
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start' }}>
        {editing && (
          <Tooltip title="Drag to another place — in this lane or another">
            <Box draggable role="img" aria-label={`Drag step ${code}`} data-testid={`drag-${step.key}`} onDragStart={onDragStart} onDragEnd={onDragEnd}
              sx={{ display: 'grid', placeItems: 'center', width: 22, height: 24, ml: -0.75, flexShrink: 0, cursor: 'grab', color: 'var(--c-text-3)', borderRadius: 'var(--r-sm)', '&:hover': { color: 'var(--c-primary-700)', background: 'var(--c-primary-50)' }, '&:active': { cursor: 'grabbing' } }}>
              <DragIndicatorRounded fontSize="small" />
            </Box>
          </Tooltip>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontWeight: 500, display: 'flex', alignItems: 'center', columnGap: 0.75, rowGap: 0.25, flexWrap: 'wrap' }}>
            {/* In edit mode the name is not a link: a stray click would leave the page and its pending changes. */}
            {editing ? <span>{step.operation.name}</span> : <Link to={appPath(company, `operations/${step.operation.id}`)}>{step.operation.name}</Link>}
            <Mono muted>{code}</Mono>
            {step.operation.status !== 'active' && <StatusBadge status="inactive" />}
            {m && <Badge family={m.family} label={m.label} title={mark?.what.join(' · ')} noIcon />}
            {moved && <Badge family="info" label="Moved" title="Its place in the order changed" noIcon />}
          </Box>
          {!editing && step.stepName && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{step.stepName}</Typography>}
          {!editing && step.notes && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', whiteSpace: 'pre-wrap' }}>{step.notes}</Typography>}
        </Box>
        {editing && (
          <Box sx={{ display: 'flex', flexShrink: 0 }}>
            <Tooltip title="Replace the operation"><IconButton size="small" aria-label={`Replace operation of step ${code}`} onClick={() => actions.replace(step)}><SwapHorizRounded fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="Remove this step"><IconButton size="small" aria-label={`Remove step ${code}`} onClick={() => actions.remove(step)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
          </Box>
        )}
      </Box>

      {editing && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mt: 0.25, color: 'var(--c-text-3)', fontSize: 12 }}>
          <Box component="span" sx={{ mr: 0.5 }}>Move</Box>
          {arrow('up', <ArrowUpwardRounded sx={{ fontSize: 16 }} />, 'up', can.up)}
          {arrow('down', <ArrowDownwardRounded sx={{ fontSize: 16 }} />, 'down', can.down)}
          {arrow('left', <ArrowBackRounded sx={{ fontSize: 16 }} />, 'to the lane on its left', can.left)}
          {arrow('right', <ArrowForwardRounded sx={{ fontSize: 16 }} />, 'to the lane on its right', can.right)}
        </Box>
      )}

      {(notes.length > 0 || step.extra.length > 0) && (
        <Box sx={{ mt: 0.5, display: 'grid', gap: 0.25, fontSize: 12.5, color: 'var(--c-text-2)' }}>
          {notes.map((n) => <Box key={n}>{n}</Box>)}
          {step.extra.filter((k) => draft.steps[k]).map((k) => (
            <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <span>Also starts after {draft.steps[k].operation.name} ({draft.steps[k].operation.code}).</span>
              {editing && <IconButton size="small" aria-label={`${code} no longer waits for ${draft.steps[k].operation.code}`} onClick={() => actions.removeExtra(step, k)} sx={{ p: 0.125 }}><CloseRounded sx={{ fontSize: 14 }} /></IconButton>}
            </Box>
          ))}
        </Box>
      )}

      {editing && (
        <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1 }}>
          <TextField size="small" label="Step name (optional)" value={step.stepName} onChange={(e) => actions.edit(step, { stepName: e.target.value })}
            inputProps={{ maxLength: 100, 'aria-label': `Step name of ${code}` }} placeholder="e.g. Drill splice holes" />
          <TextField size="small" label="Notes (optional)" value={step.notes} onChange={(e) => actions.edit(step, { notes: e.target.value })} inputProps={{ 'aria-label': `Notes of ${code}` }} />
        </Box>
      )}

      <StepTimes step={step} time={time} idx={idx} canEditTime={canEditTime} onEditTime={onEditTime} />

      {(step.waits.length > 0 || editing) && (
        <Box sx={{ mt: 1, display: 'grid', gap: 0.5 }}>
          {step.waits.map((w) => (
            <Box key={w.key} sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start', fontSize: 13, p: 0.75, borderRadius: 'var(--r-sm)', background: 'var(--c-warning-50)', border: '1px solid var(--c-warning-200)' }}>
              <HourglassTopRounded sx={{ fontSize: 16, color: 'var(--c-warning-800)', mt: 0.125 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box>{w.text}</Box>
                {w.notes && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{w.notes}</Typography>}
              </Box>
              {editing && w.id == null && <Badge family="success" label="New" noIcon />}
              {editing && <IconButton size="small" aria-label={`Remove this wait of ${code}`} onClick={() => actions.removeWait(step, w)} sx={{ p: 0.25 }}><CloseRounded sx={{ fontSize: 16 }} /></IconButton>}
            </Box>
          ))}
          {editing && <Button size="small" startIcon={<HourglassTopRounded />} onClick={() => actions.addWait(step)} sx={{ justifySelf: 'start' }} aria-label={`Add a wait to step ${number} ${code}`}>Add a wait</Button>}
        </Box>
      )}
    </Surface>
  );
}

/** A horizontal connector across grid columns `from`…`to`, from the middle of the first to the middle of the last. */
function Bar({ row, from, to, at }: { row: number; from: number; to: number; at: 'top' | 'bottom' }) {
  const lo = Math.min(from, to), hi = Math.max(from, to);
  const n = hi - lo + 1;
  const inset = `calc((100% - ${(n - 1) * COL_GAP}px) / ${2 * n})`;
  return (
    <Box aria-hidden sx={{ gridRow: row, gridColumn: `${lo + 2} / ${hi + 3}`, position: 'relative', pointerEvents: 'none' }}>
      <Box sx={{ position: 'absolute', left: inset, right: inset, [at]: 0, height: '2px', background: LINE, borderRadius: 1 }} />
    </Box>
  );
}

export function FlowSteps({ draft, layout, numberOf, editing, changes, timeOf, idx, canEditTime, onEditTime, actions }: {
  draft: FlowDraft;
  layout: FlowLayout;
  /** The number shown on a row: the saved sequence in view mode, the number it WILL have in edit mode. */
  numberOf: (row: number) => number | string;
  editing: boolean;
  changes: FlowChanges | null;
  timeOf: (operationId: number) => FlowStepTime | undefined;
  idx: FieldIndex | null;
  canEditTime: boolean;
  onEditTime: (step: DraftStep, which: 'setup' | 'work', anchor: HTMLElement) => void;
  actions: FlowStepsActions;
}) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overGap, setOverGap] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; gap: Gap } | null>(null);
  const dragging = dragKey != null;
  const endDrag = () => { setDragKey(null); setOverGap(null); };
  const gapId = (g: Gap) => `${g.lane}:${g.index}`;
  const over = (g: Gap) => (e: DragEvent) => { if (!dragging) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overGap !== gapId(g)) setOverGap(gapId(g)); };
  const drop = (g: Gap) => (e: DragEvent) => { if (!dragKey) return; e.preventDefault(); actions.move(dragKey, g); endDrag(); };

  const { row, rows, cols, lanes, span } = layout;
  const rowOf = (k: string | null | undefined) => (k ? row.get(k) ?? 0 : 0);
  const boxOf = useMemo(() => new Map(lanes.flatMap((b) => b.lane.steps.map((k) => [k, b] as const))), [lanes]);
  const colOf = (k: string | null | undefined) => (k ? boxOf.get(k)?.col ?? 0 : 0);
  const lastRow = (b: LaneBox) => (b.lane.steps.length ? rowOf(b.lane.steps[b.lane.steps.length - 1]) : 0);
  const firstRow = (b: LaneBox) => (b.lane.steps.length ? rowOf(b.lane.steps[0]) : 0);
  // Grid rows: 1 = the lane labels; band β (the gap above row β) = 2β; step row r = 2r + 1.
  const bandRow = (band: number) => 2 * band;
  const stepRow = (r: number) => 2 * r + 1;
  const hasAbove = (b: LaneBox, band: number) => (b.lane.from != null && draft.steps[b.lane.from] != null) || (b.lane.steps.length > 0 && band > firstRow(b));
  const hasBelow = (b: LaneBox, band: number) => b.lane.steps.some((k) => rowOf(k) >= band) || (b.lane.into != null && band <= rowOf(b.lane.into));

  const cells: ReactNode[] = [];
  // Lane labels, once there is more than one.
  if (cols > 1) {
    for (let c = 0; c < cols; c++) cells.push(<Box key={`lane-${c}`} sx={{ gridRow: 1, gridColumn: c + 2, pb: 0.5 }}><CapsLabel>{c === 0 ? 'Lane 1 · trunk' : `Lane ${c + 1}`}</CapsLabel></Box>);
  }
  // Row numbers.
  for (let r = 1; r <= rows; r++) {
    cells.push(
      <Box key={`n-${r}`} sx={{ gridRow: stepRow(r), gridColumn: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
        <Box data-testid={`row-number-${r}`} sx={{ width: 40, height: 28, borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 13,
          background: 'var(--c-primary-50)', color: 'var(--c-primary-900)', border: '1px solid var(--c-primary-200)' }}>{numberOf(r)}</Box>
      </Box>,
    );
  }
  lanes.forEach((b, laneIndex) => {
    const { lane } = b;
    const number = b.col + 1;
    // The bands this lane passes through: from where it opens to where it closes (or, while editing, the gap under its last step).
    const firstBand = laneIndex === 0 ? 1 : b.start;
    const bottomGap = lane.steps.length ? lastRow(b) + 1 : firstBand;
    const lastBand = lane.into ? rowOf(lane.into) : editing ? bottomGap : lastRow(b);
    for (let band = firstBand; band <= lastBand; band++) {
      const index = lane.steps.findIndex((k) => rowOf(k) === band);
      const gap: Gap | null = !editing ? null : index >= 0 ? { lane: lane.key, index } : band === bottomGap ? { lane: lane.key, index: lane.steps.length } : null;
      const line = hasAbove(b, band) && hasBelow(b, band);
      if (!gap && !line) continue;
      const dropping = !!gap && dragging && overGap === gapId(gap);
      const where = gap == null ? '' : lane.steps.length === 0 ? 'Add the first step' : gap.index === 0 ? `before ${draft.steps[lane.steps[0]].operation.code}`
        : gap.index === lane.steps.length ? `after ${draft.steps[lane.steps[gap.index - 1]].operation.code}`
          : `between ${draft.steps[lane.steps[gap.index - 1]].operation.code} and ${draft.steps[lane.steps[gap.index]].operation.code}`;
      cells.push(
        <Box key={`band-${lane.key}-${band}`} onDragOver={gap ? over(gap) : undefined} onDrop={gap ? drop(gap) : undefined}
          sx={{ gridRow: bandRow(band), gridColumn: b.col + 2, position: 'relative', minHeight: editing ? 28 : 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
            '& .gap-add': { opacity: 0, transition: 'opacity 120ms' }, '&:hover .gap-add, &:focus-within .gap-add': { opacity: dragging ? 0 : 1 },
            '@media (hover: none)': { '& .gap-add': { opacity: dragging ? 0 : 1 } } }}>
          {line && <Box aria-hidden sx={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', ml: '-1px', background: LINE }} />}
          {dropping && <Box aria-hidden sx={{ position: 'absolute', left: 0, right: 0, top: '50%', height: '3px', mt: '-1.5px', borderRadius: 1, background: 'var(--c-primary-500)' }} />}
          {gap && (
            <Tooltip title="Add, split or merge here">
              <Box component="button" type="button" className="gap-add" data-testid={`gap-${gapId(gap)}`}
                aria-label={lane.steps.length === 0 ? 'Add the first step' : `Lane ${number}: add, split or merge ${where}`}
                onClick={(e: React.MouseEvent<HTMLElement>) => setMenu({ anchor: e.currentTarget, gap })}
                sx={{ position: 'relative', width: 22, height: 22, display: 'grid', placeItems: 'center', p: 0, cursor: 'pointer', borderRadius: '50%',
                  border: '1px solid var(--c-primary-200)', background: 'var(--c-surface)', color: 'var(--c-primary-700)',
                  '&:hover, &:focus-visible': { background: 'var(--c-primary-50)', borderColor: 'var(--c-primary-500)' } }}>
                <AddRounded sx={{ fontSize: 16 }} />
              </Box>
            </Tooltip>
          )}
        </Box>,
      );
    }
    // A lane with nothing in a row it runs through: the line simply passes.
    for (let r = b.start; r <= b.end; r++) {
      if (lane.steps.some((k) => rowOf(k) === r)) continue;
      const above = (lane.from != null && draft.steps[lane.from] != null) || lane.steps.some((k) => rowOf(k) < r);
      const below = lane.steps.some((k) => rowOf(k) > r) || (lane.into != null && rowOf(lane.into) > r);
      if (above && below) {
        cells.push(<Box key={`pass-${lane.key}-${r}`} aria-hidden sx={{ gridRow: stepRow(r), gridColumn: b.col + 2, position: 'relative', minHeight: 24 }}>
          <Box sx={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', ml: '-1px', background: LINE }} />
        </Box>);
      }
    }
    // Where it splits off, and where it meets.
    if (laneIndex > 0 && lane.from && draft.steps[lane.from]) cells.push(<Bar key={`split-${lane.key}`} row={bandRow(b.start)} from={colOf(lane.from)} to={b.col} at="top" />);
    if (lane.into && draft.steps[lane.into]) cells.push(<Bar key={`merge-${lane.key}`} row={bandRow(rowOf(lane.into))} from={colOf(lane.into)} to={b.col} at="bottom" />);
    // Its steps.
    lane.steps.forEach((k, i) => {
      const step = draft.steps[k];
      const r = rowOf(k);
      const [lo, hi] = span.get(k) ?? [b.col, b.col];
      const beside = (left: boolean) => lanes.some((o) => o !== b && (left ? o.col < b.col : o.col > b.col) && o.start <= r && r <= o.end + 1);
      const meets = lanes.filter((o) => o.lane.into === k).map((o) => o.col + 1);
      const splits = lanes.filter((o) => o.lane.from === k).map((o) => o.col + 1);
      const list = (ns: number[]) => (ns.length === 1 ? `Lane ${ns[0]}` : `Lanes ${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`);
      const notes = [
        meets.length ? `${list(meets)} ${meets.length === 1 ? 'meets' : 'meet'} here — this step waits for ${meets.length === 1 ? 'its last step' : 'their last steps'} too.` : '',
        splits.length ? `${list(splits)} ${splits.length === 1 ? 'splits' : 'split'} off after this step.` : '',
      ].filter(Boolean);
      cells.push(
        <Box key={k} data-testid={`flow-cell-${k}`} data-lane={number} data-row={r}
          onDragOver={editing ? (e: DragEvent) => { const box = e.currentTarget.getBoundingClientRect(); over({ lane: lane.key, index: e.clientY < box.top + box.height / 2 ? i : i + 1 })(e); } : undefined}
          onDrop={editing ? (e: DragEvent) => { const box = e.currentTarget.getBoundingClientRect(); drop({ lane: lane.key, index: e.clientY < box.top + box.height / 2 ? i : i + 1 })(e); } : undefined}
          sx={{ gridRow: stepRow(r), gridColumn: `${lo + 2} / ${hi + 3}`, minWidth: 0, opacity: dragKey === k ? 0.45 : 1 }}>
          <StepCard step={step} draft={draft} number={numberOf(r)} editing={editing} mark={changes?.steps.get(k)} moved={!!changes?.moved.has(k)} time={timeOf(step.operation.id)} idx={idx}
            canEditTime={canEditTime} onEditTime={onEditTime} actions={actions} notes={notes}
            can={{ up: i > 0, down: i < lane.steps.length - 1, left: beside(true), right: beside(false) }}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', k); // Firefox starts no drag without data
              const card = e.currentTarget.closest('[data-testid^="flow-cell-"]');
              if (card) e.dataTransfer.setDragImage(card, 24, 16);
              setDragKey(k);
            }}
            onDragEnd={endDrag} />
        </Box>,
      );
    });
  });

  const choices = menu ? mergeChoices(draft, menu.gap) : null;
  const underSplit = menu ? splitsAbove(draft, menu.gap) : false;
  const pick = (fn: (gap: Gap) => void) => () => { if (menu) { const { gap } = menu; setMenu(null); fn(gap); } };
  return (
    <Box sx={{ overflowX: 'auto', pb: 0.5 }}>
      <Box data-testid="flow-steps" data-lanes={cols} role="group" aria-label="The steps of the flow, in lanes"
        sx={{ display: 'grid', gridTemplateColumns: `${RAIL}px repeat(${cols}, minmax(${cols > 1 ? COL_MIN : 0}px, 1fr))`, columnGap: `${COL_GAP}px`, minWidth: cols > 1 ? RAIL + cols * (COL_MIN + COL_GAP) : undefined }}>
        {cells}
      </Box>
      <Menu open={!!menu} anchorEl={menu?.anchor} onClose={() => setMenu(null)}>
        <MenuItem onClick={pick((gap) => actions.add(gap, false))} data-testid="gap-add">
          <ListItemIcon><AddRounded fontSize="small" /></ListItemIcon>
          <ListItemText primary="Add a step here" secondary={underSplit ? 'In this lane, beside the lanes that split off' : undefined} />
        </MenuItem>
        {underSplit && (
          <MenuItem onClick={pick((gap) => actions.add(gap, true))} data-testid="gap-add-before">
            <ListItemIcon><AddRounded fontSize="small" /></ListItemIcon>
            <ListItemText primary="Add a step before the split" secondary="The lanes then split off after it" />
          </MenuItem>
        )}
        <MenuItem onClick={pick(actions.split)} data-testid="gap-split">
          <ListItemIcon><CallSplitRounded fontSize="small" /></ListItemIcon>
          <ListItemText primary="Split" secondary="Open a lane beside this point" />
        </MenuItem>
        {choices?.available && (
          <MenuItem onClick={pick(actions.merge)} data-testid="gap-merge">
            <ListItemIcon><CallMergeRounded fontSize="small" /></ListItemIcon>
            <ListItemText primary="Merge" secondary="Lanes meet here and go on as one" />
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}
