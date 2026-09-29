import { useEffect, useMemo, useState } from 'react';
import { Box, TextField, Typography } from '@mui/material';
import { getQueue } from '../../api/floor';
import type { FloorDay, FloorReason, FloorRow, FloorSession, FloorStep, FloorStop } from '../../api/types';
import { BigButton, Calm, Choice, ChoiceRow, Sheet, Stepper, TapCard, TimeField } from './floorUi';
import { addMin, at, pieceLine, dayStart, duration, errText, hhmm, lastEnd, MIN } from './floorModel';

export interface Prefill { start: Date; end: Date }

/** What a sheet is opened for: a new entry (maybe with times from a gap) or an existing one. */
export type Target =
  | { kind: 'work'; session?: FloorSession; prefill?: Prefill }
  | { kind: 'stop'; stop?: FloorStop; prefill?: Prefill; reason?: FloorReason };

interface SheetProps<T> {
  target: T | null;
  day: FloorDay | null;
  dateStr: string;
  now: Date;
  machineId: number;
  onClose: () => void;
  /** Saves; throws with a plain message to keep the sheet open. */
  onSave: (row: FloorRow) => Promise<void>;
  onDelete: (kind: 'work' | 'stop', id: number) => Promise<void>;
}


/** A default span for a new entry: from where the last one ended, an hour long, never in the future. */
function defaultSpan(day: FloorDay | null, now: Date): Prefill {
  const from = lastEnd(day, now) ?? addMin(now, -60);
  let to = addMin(from, 60);
  if (to.getTime() > now.getTime()) to = now.getTime() > from.getTime() ? now : addMin(from, 15);
  return { start: from, end: to };
}

/** From / To with −15 / +15, and one tap to start where the last entry ended. */
function TimeRange({ start, end, setStart, setEnd, day, dateStr, now, existing }: {
  start: Date; end: Date; setStart: (d: Date) => void; setEnd: (d: Date) => void; day: FloorDay | null; dateStr: string; now: Date; existing: boolean;
}) {
  const windowStart = dayStart(day, dateStr);
  const last = lastEnd(day, now);
  const showLast = !!last && !existing && last.getTime() !== start.getTime();
  const bad = end.getTime() <= start.getTime() ? 'The end must be after the start.' : end.getTime() > now.getTime() + MIN ? 'That time has not happened yet.' : null;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <TimeField label="From" value={start} onChange={setStart} windowStart={windowStart}
        extra={showLast && last ? <BigButton variant="outlined" onClick={() => setStart(last)} sx={{ fontSize: 15, px: 2 }}>From the last end ({hhmm(last)})</BigButton> : undefined} />
      <TimeField label="To" value={end} onChange={setEnd} windowStart={windowStart} />
      {bad ? <Calm tone="warning">{bad}</Calm> : <Typography sx={{ fontSize: 16, color: 'var(--c-text-2)' }}>{duration((end.getTime() - start.getTime()) / MIN)}</Typography>}
    </Box>
  );
}

const badSpan = (start: Date, end: Date, now: Date) => end.getTime() <= start.getTime() || end.getTime() > now.getTime() + MIN;

/** Save / Cancel, with Delete (asks once) for an existing entry. The problem sits here, next to the buttons, so it is never scrolled out of sight. */
function SheetFooter({ existing, busy, saveDisabled, problem, onClose, onSave, onDelete }: {
  existing: boolean; busy: boolean; saveDisabled: boolean; problem: string | null; onClose: () => void; onSave: () => void; onDelete: () => void;
}) {
  const [sure, setSure] = useState(false);
  return (
    <>
      {problem && <Box sx={{ flexBasis: '100%' }}><Calm tone="warning">{problem}</Calm></Box>}
      {sure ? (
        <>
          <BigButton variant="outlined" onClick={() => setSure(false)} disabled={busy}>Keep it</BigButton>
          <BigButton tone="warning" sx={{ flex: 1 }} onClick={onDelete} disabled={busy}>Yes, delete</BigButton>
        </>
      ) : (
        <>
          {existing && <BigButton variant="text" onClick={() => setSure(true)} disabled={busy} sx={{ color: 'var(--c-text-2)' }}>Delete</BigButton>}
          <BigButton variant="outlined" onClick={onClose} disabled={busy}>Cancel</BigButton>
          <BigButton sx={{ flex: 1 }} disabled={saveDisabled || busy} onClick={onSave}>{busy ? 'Saving…' : 'Save'}</BigButton>
        </>
      )}
    </>
  );
}

/** Add or change a piece of work: the job, when, how many. */
export function WorkSheet({ target, day, dateStr, now, machineId, onClose, onSave, onDelete }: SheetProps<Extract<Target, { kind: 'work' }>>) {
  const open = !!target;
  const existing = target?.session;
  const [step, setStep] = useState<{ id: number; label: string; sub: string; left: number } | null>(null);
  const [start, setStart] = useState(now);
  const [end, setEnd] = useState(now);
  const [good, setGood] = useState<number | null>(null);
  const [scrap, setScrap] = useState(0);
  const [showScrap, setShowScrap] = useState(false);
  const [changing, setChanging] = useState(false);
  const [search, setSearch] = useState('');
  const [steps, setSteps] = useState<FloorStep[]>([]);
  const [shown, setShown] = useState(6);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);

  // A fresh open resets everything from the target (state during render, so no stale flash).
  if (open && !seen) {
    setSeen(true);
    const span = existing
      ? { start: at(existing.start), end: existing.end ? at(existing.end) : now }
      : target?.prefill ?? defaultSpan(day, now);
    setStart(span.start); setEnd(span.end);
    setStep(existing ? { id: existing.stepId, label: existing.operation || existing.pieceName, sub: existing.pieceName || existing.pieceCode, left: 0 } : null);
    setGood(existing ? existing.good ?? 0 : null); setScrap(existing?.scrap ?? 0); setShowScrap((existing?.scrap ?? 0) > 0);
    setChanging(false); setSearch(''); setShown(6); setProblem(null);
  }
  if (!open && seen) setSeen(false);

  // The picker lists what is planned for this machine, in planned order; search is the server's.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const t = window.setTimeout(() => {
      getQueue(machineId, search).then((q) => {
        if (!alive) return;
        const all = [...q.running.map((r): FloorStep => ({ ...r, id: r.stepId })), ...q.next];
        setSteps(all.filter((s, i) => all.findIndex((x) => x.id === s.id) === i));
      }).catch(() => { if (alive) setSteps([]); });
    }, search ? 300 : 0);
    return () => { alive = false; window.clearTimeout(t); };
  }, [open, machineId, search]);

  const pick = (s: FloorStep) => {
    setStep({ id: s.id, label: s.operation || s.pieceName, sub: s.pieceName || s.pieceCode, left: s.qtyLeft });
    setChanging(false);
  };
  const invalid = !step || good === null || badSpan(start, end, now);
  const listed = useMemo(() => steps.slice(0, shown), [steps, shown]);
  const submit = async () => {
    if (!step || good === null) return;
    setBusy(true); setProblem(null);
    try { await onSave({ kind: 'work', ...(existing ? { id: existing.id } : {}), stepId: step.id, start: start.toISOString(), end: end.toISOString(), good, scrap }); }
    catch (e) { setProblem(errText(e)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!existing) return;
    setBusy(true); setProblem(null);
    try { await onDelete('work', existing.id); } catch (e) { setProblem(errText(e)); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={existing ? 'Change work' : 'Add work'}
      footer={<SheetFooter existing={!!existing} busy={busy} saveDisabled={invalid} problem={problem} onClose={onClose} onSave={submit} onDelete={remove} />}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 600, color: 'var(--c-text-2)' }}>Which job?</Typography>
        {step && !changing ? (
          <TapCard selected onClick={() => setChanging(true)} ariaLabel="Change job"><Box sx={{ flex: 1, minWidth: 0 }}><Box sx={{ fontSize: 20, fontWeight: 700 }}>{step.label}</Box><Box sx={{ fontSize: 16, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{step.sub}</Box></Box><Box sx={{ color: 'var(--c-primary-700)', fontWeight: 600 }}>Change</Box></TapCard>
        ) : (
          <>
            <TextField placeholder="Search a job" value={search} onChange={(e) => { setSearch(e.target.value); setShown(6); }} inputProps={{ 'aria-label': 'Search a job', style: { fontSize: 18, height: 28 } }} />
            {listed.map((s) => (
              <TapCard key={s.id} onClick={() => pick(s)} ariaLabel={`Pick ${s.operation} ${s.pieceName}`}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ fontSize: 19, fontWeight: 700, overflowWrap: 'anywhere' }}>{s.operation || s.pieceName}</Box>
                  <Box sx={{ fontSize: 15, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{pieceLine(s)}</Box>
                </Box>
                <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700 }}>{s.qtyLeft} left</Box>
              </TapCard>
            ))}
            {steps.length === 0 && <Calm>{search ? 'No job matches.' : 'No planned jobs for this machine.'}</Calm>}
            {steps.length > shown && <BigButton variant="outlined" onClick={() => setShown((n) => n + 10)}>Show more</BigButton>}
          </>
        )}
      </Box>
      <TimeRange start={start} end={end} setStart={setStart} setEnd={setEnd} day={day} dateStr={dateStr} now={now} existing={!!existing} />
      <Stepper label="How many finished?" value={good} onChange={setGood} placeholder="?" />
      {good === null && !!step && <Typography sx={{ fontSize: 16, color: 'var(--c-text-2)', textAlign: 'center', mt: -1.5 }}>Tap + or type a number. 0 is fine.</Typography>}
      {showScrap ? <Stepper label="Scrapped" value={scrap} onChange={setScrap} />
        : <Box sx={{ textAlign: 'center' }}><BigButton variant="text" onClick={() => setShowScrap(true)}>Some scrapped?</BigButton></Box>}
    </Sheet>
  );
}

/** Add or change a stop: why, and when. */
export function StopSheet({ target, day, dateStr, now, reasons, onClose, onSave, onDelete }: Omit<SheetProps<Extract<Target, { kind: 'stop' }>>, 'machineId'> & { reasons: FloorReason[] }) {
  const open = !!target;
  const existing = target?.stop;
  const [reason, setReason] = useState<FloorReason | null>(null);
  const [note, setNote] = useState('');
  const [start, setStart] = useState(now);
  const [end, setEnd] = useState(now);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);

  if (open && !seen) {
    setSeen(true);
    const span = existing
      ? { start: at(existing.start), end: existing.end ? at(existing.end) : now }
      : target?.prefill ?? defaultSpan(day, now);
    setStart(span.start); setEnd(span.end);
    setReason(existing ? reasons.find((r) => r.id === existing.reasonId) ?? null : target?.reason ?? null);
    setNote(existing?.note ?? ''); setProblem(null);
  }
  if (!open && seen) setSeen(false);

  const invalid = !reason || badSpan(start, end, now) || (reason.needsNote && !note.trim());
  const submit = async () => {
    if (!reason) return;
    setBusy(true); setProblem(null);
    try { await onSave({ kind: 'stop', ...(existing ? { id: existing.id } : {}), reasonId: reason.id, note: note.trim(), start: start.toISOString(), end: end.toISOString() }); }
    catch (e) { setProblem(errText(e)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!existing) return;
    setBusy(true); setProblem(null);
    try { await onDelete('stop', existing.id); } catch (e) { setProblem(errText(e)); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={existing ? 'Change stop' : 'Add stop'}
      footer={<SheetFooter existing={!!existing} busy={busy} saveDisabled={invalid} problem={problem} onClose={onClose} onSave={submit} onDelete={remove} />}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 600, color: 'var(--c-text-2)' }}>Why?</Typography>
        <ChoiceRow>
          {reasons.map((r) => <Choice key={r.id} selected={reason?.id === r.id} onClick={() => setReason(r)}>{r.label}</Choice>)}
        </ChoiceRow>
        {reason?.needsNote && <TextField multiline minRows={2} label="What happened?" value={note} onChange={(e) => setNote(e.target.value)} inputProps={{ style: { fontSize: 18 } }} />}
      </Box>
      <TimeRange start={start} end={end} setStart={setStart} setEnd={setEnd} day={day} dateStr={dateStr} now={now} existing={!!existing} />
    </Sheet>
  );
}
