import { useState } from 'react';
import { Box, TextField, Typography } from '@mui/material';
import CheckBoxRounded from '@mui/icons-material/CheckBoxRounded';
import CheckBoxOutlineBlankRounded from '@mui/icons-material/CheckBoxOutlineBlankRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import { endStop, finishWork, pauseWork, resumeWork, startWork, stopMachine } from '../../api/floor';
import type { FloorDay, FloorMachine, FloorOperator, FloorQueue, FloorReason, FloorRunning, FloorStep, FloorStop } from '../../api/types';
import { BigButton, Calm, Choice, ChoiceRow, Sheet, Stepper, TapCard } from './floorUi';
import { useNow } from './useNow';
import { duration, errText, pieceLine, hhmm, idleSince, at, PRIMARY_H, timer } from './floorModel';
import { ReasonSheet } from './ReasonSheet';

export interface TabProps {
  machine: FloorMachine;
  operator: FloorOperator;
  reasons: FloorReason[];
  queue: FloorQueue | null;
  day: FloorDay | null;
  /** Reload the queue and the day. */
  refresh: () => Promise<void>;
  /** Say something calm, or (with a saved flash) that it worked. */
  say: (message: string) => void;
  /** A quiet "Saved" — or the note given instead ("Job reopened — 3 left"). */
  saved: (note?: string | null) => void;
}


/** The job on a running card: what it is and how many are left. */
function JobTitle({ step }: { step: FloorStep }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{step.operation || step.pieceName}</Box>
      <Box sx={{ fontSize: 17, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{pieceLine(step)}</Box>
    </Box>
  );
}

function RunningCard({ job, busy, onPause, onDone }: { job: FloorRunning; busy: boolean; onPause: () => void; onDone: () => void }) {
  const now = useNow(1000);
  return (
    <Box data-testid="running-card" sx={{ border: '2px solid var(--c-success-600)', background: 'var(--c-success-50)', borderRadius: 'var(--r-md)', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
        <JobTitle step={job} />
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Box aria-label="Running for" sx={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: 'var(--c-success-800)', lineHeight: 1.1 }}>{timer(job.startedAt, now)}</Box>
          <Box sx={{ fontSize: 17, fontWeight: 600, color: 'var(--c-text-2)' }}>{job.qtyLeft} left</Box>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <BigButton variant="outlined" startIcon={<PauseRounded />} onClick={onPause} disabled={busy} fullWidth label={`Pause ${job.operation} ${job.pieceName}`}>Pause</BigButton>
        <BigButton tone="success" startIcon={<CheckRounded />} onClick={onDone} disabled={busy} fullWidth label={`Done ${job.operation} ${job.pieceName}`}>Done</BigButton>
      </Box>
    </Box>
  );
}

/** "How many finished?" — prefilled with what is left, so the common case is one tap. */
function FinishSheet({ job, onClose, onSubmit }: { job: FloorRunning | null; onClose: () => void; onSubmit: (good: number, scrap: number, done: boolean) => Promise<void> }) {
  const [good, setGood] = useState(0);
  const [scrap, setScrap] = useState(0);
  const [showScrap, setShowScrap] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openFor, setOpenFor] = useState<number | null>(null);
  // Reset when a different job opens (state during render, not an effect, so there is no stale flash).
  if (job && openFor !== job.sessionId) { setOpenFor(job.sessionId); setGood(Math.max(0, job.qtyLeft)); setScrap(0); setShowScrap(false); }
  if (!job && openFor !== null) setOpenFor(null);
  const left = job ? job.qtyLeft : 0;
  const complete = good + scrap >= left;
  return (
    <Sheet open={!!job} onClose={onClose} title="How many finished?"
      footer={<>
        <BigButton variant="outlined" onClick={onClose} disabled={busy}>Cancel</BigButton>
        <BigButton tone="success" disabled={busy} sx={{ flex: 1 }} onClick={async () => { setBusy(true); try { await onSubmit(good, scrap, complete); } finally { setBusy(false); } }}>Done</BigButton>
      </>}>
      {job && <JobTitle step={job} />}
      <Stepper label="Finished" value={good} onChange={setGood} />
      {!complete && <Typography sx={{ fontSize: 16, color: 'var(--c-text-2)', textAlign: 'center' }}>{Math.max(0, left - good - scrap)} still to do — the job stays open.</Typography>}
      {showScrap
        ? <Stepper label="Scrapped" value={scrap} onChange={setScrap} />
        : <Box sx={{ textAlign: 'center' }}><BigButton variant="text" onClick={() => setShowScrap(true)}>Some scrapped?</BigButton></Box>}
    </Sheet>
  );
}

function StopCard({ stop, busy, onBack }: { stop: FloorStop; busy: boolean; onBack: () => void }) {
  const now = useNow(30_000);
  return (
    <Box data-testid="stop-card" sx={{ border: '2px solid var(--c-warning-600)', background: 'var(--c-warning-50)', borderRadius: 'var(--r-md)', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box>
        <Box sx={{ fontSize: 24, fontWeight: 700 }}>Stopped: {stop.reason}</Box>
        <Box sx={{ fontSize: 18, color: 'var(--c-text-2)' }}>since {hhmm(at(stop.start))} · {duration((now.getTime() - at(stop.start).getTime()) / 60_000)}{stop.note ? ` · ${stop.note}` : ''}</Box>
      </Box>
      <BigButton onClick={onBack} disabled={busy} startIcon={<PlayArrowRounded />} fullWidth>Back to work</BigButton>
    </Box>
  );
}

/** Now: what is running, what is next, and whether the machine is standing idle. */
export function NowTab({ machine, operator, reasons, queue, day, refresh, say, saved, search, setSearch }: TabProps & { search: string; setSearch: (s: string) => void }) {
  const clock = useNow(15_000);
  const [selected, setSelected] = useState<number[]>([]);
  const [shown, setShown] = useState(5);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState<FloorRunning | null>(null);
  const [reasonSheet, setReasonSheet] = useState<{ since: Date | null; initial: FloorReason | null } | null>(null);

  const running = queue?.running ?? [];
  const next = queue?.next ?? [];
  const queueTotal = (queue as { total?: number } | null)?.total ?? next.length;
  const openStop = queue?.stop ?? day?.stops.find((s) => !s.end) ?? null;
  const idle = idleSince(day, running, !!openStop, clock);

  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    try { await fn(); saved(); after?.(); } catch (e) { say(errText(e)); } finally { setBusy(false); await refresh(); }
  };

  const start = () => act(async () => {
    const picked = next.filter((s) => selected.includes(s.id));
    const paused = picked.filter((s) => s.pausedSessionId != null);
    const fresh = picked.filter((s) => s.pausedSessionId == null);
    if (paused.length) await resumeWork(paused.map((s) => s.pausedSessionId as number));
    if (fresh.length) await startWork(machine.id, operator.id, fresh.map((s) => s.id));
  }, () => setSelected([]));

  const toggle = (id: number) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const stopWith = (reason: FloorReason, note: string, since: Date | null) =>
    act(() => stopMachine(machine.id, operator.id, reason.id, note || undefined, since?.toISOString()), () => setReasonSheet(null));

  const visible = next.slice(0, shown);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {idle && (
        <Box data-testid="idle-banner" sx={{ border: '2px solid var(--c-warning-600)', background: 'var(--c-warning-50)', borderRadius: 'var(--r-md)', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ fontSize: 22, fontWeight: 700 }}>Machine stopped since {hhmm(idle)} — why?</Box>
          <ChoiceRow>
            {reasons.map((r) => (
              <Choice key={r.id} onClick={() => (r.needsNote ? setReasonSheet({ since: idle, initial: r }) : stopWith(r, '', idle))}>{r.label}</Choice>
            ))}
          </ChoiceRow>
        </Box>
      )}

      {openStop && <StopCard stop={openStop} busy={busy} onBack={() => act(() => endStop(openStop.id))} />}

      {running.map((job) => (
        <RunningCard key={job.sessionId} job={job} busy={busy} onPause={() => act(() => pauseWork([job.sessionId]))} onDone={() => setFinishing(job)} />
      ))}

      {!openStop && running.length === 0 && !idle && (
        <Box><BigButton variant="outlined" tone="warning" onClick={() => setReasonSheet({ since: null, initial: null })} disabled={busy}>Machine stopped?</BigButton></Box>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Typography component="h2" sx={{ fontSize: 22, fontWeight: 700 }}>Up next</Typography>
        <TextField placeholder="Search a job" value={search} onChange={(e) => { setSearch(e.target.value); setShown(5); }} inputProps={{ 'aria-label': 'Search a job', style: { fontSize: 18, height: 28 } }} />
        {visible.map((s) => {
          const on = selected.includes(s.id);
          return (
            <TapCard key={s.id} checked={on} selected={on} onClick={() => toggle(s.id)} ariaLabel={`${s.operation} ${s.pieceName}`}>
              {on ? <CheckBoxRounded sx={{ fontSize: 32, color: 'var(--c-primary-600)' }} /> : <CheckBoxOutlineBlankRounded sx={{ fontSize: 32, color: 'var(--c-text-3)' }} />}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ fontSize: 20, fontWeight: 700, overflowWrap: 'anywhere' }}>{s.operation || s.pieceName}</Box>
                <Box sx={{ fontSize: 16, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{pieceLine(s)}</Box>
                {s.pausedSessionId != null && <Box sx={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text-2)' }}>Paused — tap to continue</Box>}
                {!s.ready && s.pausedSessionId == null && <Box sx={{ fontSize: 15, color: 'var(--c-warning-800)' }}>Not ready yet</Box>}
              </Box>
              <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{s.qtyLeft}</Box>
                <Box sx={{ fontSize: 15, color: 'var(--c-text-2)' }}>left</Box>
              </Box>
            </TapCard>
          );
        })}
        {queue && next.length === 0 && <Calm>{search ? 'No job matches.' : 'Nothing waiting for this machine.'}</Calm>}
        {next.length > shown && <BigButton variant="outlined" onClick={() => setShown((n) => n + 10)}>Show more</BigButton>}
        {/* The server sends the first 100 in planned order but searches them all. */}
        {next.length <= shown && queueTotal > next.length && <Calm>{queueTotal - next.length} more waiting — search to find one.</Calm>}
      </Box>

      {selected.length > 0 && (
        <Box sx={{ position: 'sticky', bottom: 0, py: 1.5, background: 'var(--c-canvas)', display: 'flex', gap: 1.5 }}>
          <BigButton variant="outlined" onClick={() => setSelected([])} disabled={busy}>Clear</BigButton>
          <BigButton sx={{ flex: 1, minHeight: PRIMARY_H }} onClick={start} disabled={busy} startIcon={<PlayArrowRounded />}>
            {busy ? 'Starting…' : selected.length === 1 ? 'Start' : `Start ${selected.length} together`}
          </BigButton>
        </Box>
      )}

      <FinishSheet job={finishing} onClose={() => setFinishing(null)}
        onSubmit={async (good, scrap, done) => { const job = finishing; if (!job) return; await act(() => finishWork(job.sessionId, good, scrap, done), () => setFinishing(null)); }} />
      <ReasonSheet open={!!reasonSheet} reasons={reasons} initial={reasonSheet?.initial ?? null} title="Why did it stop?" onClose={() => setReasonSheet(null)}
        onPick={(reason, note) => stopWith(reason, note, reasonSheet?.since ?? null)} />
    </Box>
  );
}
