/**
 * The pieces of REVIEWS AND ACTIONS (CF_HRMS_HIRING_SPEC.md §20.3), shared by
 * Performance › Reviews and › Actions, the review page, the plan page, My place
 * and the org chart panel — so a review, a rating and an action read the same
 * everywhere.
 *
 *   ReviewStatusBadge   Open / Person has written / Done / Cancelled
 *   DueChip             "Due 7 Jan 2027" — or "Overdue by 3 days", in the warning tone
 *   ReviewKpiTable      the plan's KPIs: target, actual, achievement and band (read-only)
 *   ActionsList         action items with Done / Change / Drop, as the server allows
 *   ActionDialog        add or change an action
 *
 * Words: "check-in", "review", "rating", "action". Never "appraisal".
 */
import { useState } from 'react';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import CheckRounded from '@mui/icons-material/CheckRounded';
import { FormDialog, PromptDialog, ToneBadge } from '@shared/ui';
import type { Action, ActionInput, OwnerOption, ReviewKpiRow, ReviewStatus } from '../../api/reviews';
import { AchievementChip, ScoreLine } from './ActualParts';
import type { Band, BasedOn } from '../../api/performance';
import { longDay } from '../jobDates';
import { REVIEW_STATUS_LABEL, REVIEW_STATUS_TONE } from './reviewWords';

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  return <ToneBadge tone={REVIEW_STATUS_TONE[status]} label={REVIEW_STATUS_LABEL[status]} />;
}

/** "Due 7 Jan 2027", or "Overdue by 3 days" — only while the thing is still open. */
export function DueChip({ dueDate, overdue, daysOverdue, open = true, bare = false }: { dueDate: string; overdue: boolean; daysOverdue: number; open?: boolean; /** Under a "Due" label: the date alone. */ bare?: boolean }) {
  if (open && overdue) return <ToneBadge tone="warning" label={`Overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}`} title={`Was due ${longDay(dueDate)}`} />;
  return <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>{open && !bare ? 'Due ' : ''}{longDay(dueDate)}</Typography>;
}

const actualText = (r: ReviewKpiRow) => {
  if (r.actual == null) return '—';
  if (typeof r.actual === 'string') return r.actual === 'YES' ? 'Met' : r.actual === 'NO' ? 'Not met' : r.actual;
  return `${Number.isInteger(r.actual) ? r.actual : r.actual.toFixed(2).replace(/\.?0+$/, '')}${r.unit && r.unit !== 'count' ? (r.unit === '%' ? '%' : ` ${r.unit}`) : ''}`;
};

/** The plan's KPIs for the review — read-only, numbers from the server (scoring.js). */
export function ReviewKpiTable({ rows, planScore, line }: {
  rows: ReviewKpiRow[];
  planScore: { score: number | null; band: Band; basedOn: BasedOn; scoreLine: string | null };
  line?: string;
}) {
  if (!rows.length) return <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-3)' }}>This plan has no KPIs.</Typography>;
  let lastKra: string | null | undefined;
  return (
    <Box data-review-kpis="">
      {line && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1 }}>{line}</Typography>}
      <Box sx={{ overflowX: 'auto' }}>
        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 560, '& th, & td': { textAlign: 'left', py: 0.75, px: 1, borderBottom: '1px solid var(--c-border)', verticalAlign: 'top' }, '& th': { fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)' } }}>
          <thead>
            <tr><th>KPI</th><th>Target</th><th>Actual</th><th>Achievement</th></tr>
          </thead>
          <tbody>
            {rows.flatMap((r) => {
              const out = [];
              if (r.kraName !== lastKra) {
                lastKra = r.kraName;
                out.push(
                  <tr key={`kra-${r.kraId ?? 'none'}`}>
                    <Box component="td" colSpan={4} sx={{ fontWeight: 600, fontSize: 12.5, color: 'var(--c-text-2)', background: 'var(--c-surface-2)' }}>{r.kraName ?? 'Not under a KRA'}</Box>
                  </tr>,
                );
              }
              out.push(
                <tr key={r.kpiId} data-review-kpi={r.kpiId}>
                  <td>
                    {r.name}
                    {r.scope === 'PERIOD' && rows.some((x) => x.scope === 'SLOT') && (
                      <Typography component="span" sx={{ display: 'block', fontSize: 12, color: 'var(--c-text-3)' }}>the whole period so far</Typography>
                    )}
                  </td>
                  <td>{r.target}</td>
                  <td>
                    {actualText(r)}
                    {r.slotCount > 1 && r.counted > 0 && (
                      <Typography component="span" sx={{ display: 'block', fontSize: 12, color: 'var(--c-text-3)' }}>{r.combineLabel.toLowerCase()} of {r.counted}</Typography>
                    )}
                  </td>
                  <td><AchievementChip achievement={r.achievement} band={r.band} /></td>
                </tr>,
              );
              return out;
            })}
          </tbody>
        </Box>
      </Box>
      <Box sx={{ mt: 1.5 }}>
        <ScoreLine score={planScore.score} band={planScore.band} line={planScore.scoreLine} label="Plan score" />
      </Box>
    </Box>
  );
}

/** Add or change an action: what, who, by when, a note. */
export function ActionDialog({ open, action, owners, onClose, onSubmit }: {
  open: boolean;
  /** null = a new one. */ action: Action | null;
  owners: OwnerOption[];
  onClose: () => void;
  onSubmit: (body: ActionInput) => Promise<unknown>;
}) {
  const [text, setText] = useState('');
  const [owner, setOwner] = useState<number | ''>('');
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  const [seen, setSeen] = useState<string>('');
  const key = `${open}|${action?.id ?? 'new'}`;
  if (key !== seen) {
    setSeen(key);
    setText(action?.text ?? '');
    setOwner(action?.ownerEmployeeId ?? owners.find((o) => o.relation === 'PERSON')?.employeeId ?? '');
    setDue(action?.dueDate ?? plusDays(14));
    setNote(action?.note ?? '');
  }
  const ownerList = action && !owners.some((o) => o.employeeId === action.ownerEmployeeId)
    ? [...owners, { employeeId: action.ownerEmployeeId, name: action.ownerName, employeeCode: null, relation: 'PERSON' as const, label: 'Owner now' }]
    : owners;
  return (
    <FormDialog
      open={open}
      title={action ? 'Change the action' : 'Add an action'}
      subtitle="Something to be done by a day — owned by the person, or by their manager."
      onClose={onClose}
      submitLabel={action ? 'Save' : 'Add'}
      submitDisabled={!text.trim() || owner === '' || !due}
      enterSubmits={false}
      onSubmit={() => onSubmit({ text: text.trim(), ownerEmployeeId: Number(owner), dueDate: due, note: note.trim() || null })}
    >
      <TextField label="What is to be done" value={text} onChange={(e) => setText(e.target.value)} multiline minRows={2} required autoFocus />
      <TextField select label="Owner" value={owner} onChange={(e) => setOwner(Number(e.target.value))} required>
        {ownerList.map((o) => <MenuItem key={o.employeeId} value={o.employeeId}>{o.name} — {o.label.toLowerCase()}</MenuItem>)}
      </TextField>
      <TextField type="date" label="Due" value={due} onChange={(e) => setDue(e.target.value)} required slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: action?.dueDate && action.dueDate < today() ? action.dueDate : today() } }} />
      <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={1} />
    </FormDialog>
  );
}

/**
 * Action items, overdue first (the server's order). Each row's buttons are what the
 * server says this login may do (`a.can`); `ownDone` = the person marking their own.
 */
export function ActionsList({ actions, empty = 'No actions.', showPerson = false, onDone, onChange, onDrop }: {
  actions: Action[];
  empty?: string;
  showPerson?: boolean;
  onDone?: (a: Action, note?: string) => Promise<unknown>;
  onChange?: (a: Action) => void;
  onDrop?: (a: Action, note: string) => Promise<unknown>;
}) {
  const [doneFor, setDoneFor] = useState<Action | null>(null);
  const [dropFor, setDropFor] = useState<Action | null>(null);
  if (!actions.length) return <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-3)' }}>{empty}</Typography>;
  return (
    <Box data-actions="">
      {actions.map((a) => (
        <Box
          key={a.id}
          data-action={a.id}
          sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap', py: 1, borderBottom: '1px solid var(--c-border)', '&:last-of-type': { borderBottom: 0 } }}
        >
          <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 500, textDecoration: a.status === 'DROPPED' ? 'line-through' : 'none', color: a.status === 'OPEN' ? 'inherit' : 'var(--c-text-2)' }}>{a.text}</Typography>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
              {[
                showPerson ? `${a.employeeName} · ${a.periodName}` : null,
                `Owner: ${a.ownerName}${a.owner.isThePerson ? '' : ' (manager)'}`,
                a.review ? `from the ${a.review.label.toLowerCase()}` : null,
              ].filter(Boolean).join(' · ')}
            </Typography>
            {a.note && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', fontStyle: 'italic' }}>{a.note}</Typography>}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {a.status === 'OPEN'
              ? <DueChip dueDate={a.dueDate} overdue={a.overdue} daysOverdue={a.daysOverdue} />
              : <ToneBadge tone={a.status === 'DONE' ? 'success' : 'neutral'} label={a.status === 'DONE' && a.doneOn ? `Done ${longDay(a.doneOn)}` : a.statusLabel} />}
            {a.can?.done && onDone && <Button size="small" startIcon={<CheckRounded />} onClick={() => setDoneFor(a)}>Done</Button>}
            {a.can?.edit && onChange && <Button size="small" onClick={() => onChange(a)}>Change</Button>}
            {a.can?.drop && onDrop && <Button size="small" color="inherit" onClick={() => setDropFor(a)}>Drop</Button>}
          </Box>
        </Box>
      ))}
      <PromptDialog
        open={!!doneFor}
        title="Mark this action done?"
        body={doneFor?.text}
        label="Note (optional)"
        required={false}
        confirmLabel="Done"
        onClose={() => setDoneFor(null)}
        onConfirm={async (note) => { if (doneFor && onDone) await onDone(doneFor, note.trim() || undefined); }}
      />
      <PromptDialog
        open={!!dropFor}
        title="Drop this action?"
        body="A dropped action is kept, with the reason."
        label="Why is it dropped?"
        required
        confirmLabel="Drop"
        danger
        onClose={() => setDropFor(null)}
        onConfirm={async (note) => { if (dropFor && onDrop) await onDrop(dropFor, note.trim()); }}
      />
    </Box>
  );
}

/** A small "Add an action" button row; used where a list of actions has a place to add one. */
export function AddActionButton({ onClick }: { onClick: () => void }) {
  return (
    <Stack direction="row" sx={{ mt: 1 }}>
      <Button size="small" onClick={onClick}>Add an action</Button>
    </Stack>
  );
}
