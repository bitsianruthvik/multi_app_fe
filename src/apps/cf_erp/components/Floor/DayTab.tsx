import { useMemo, useState } from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { saveDay } from '../../api/floor';
import type { FloorDay, FloorRow } from '../../api/types';
import type { TabProps } from './NowTab';
import { BigButton, Choice, ChoiceRow } from './floorUi';
import { useNow } from './useNow';
import { assignLanes, at, barWindow, dateKey, dayItems, duration, hhmm, reopenNote, span, TOUCH } from './floorModel';
import { StopSheet, WorkSheet, type Target } from './EntrySheets';


/** Today / Yesterday / "Mon 29 Sep". */
function dayLabel(dateStr: string, now: Date): string {
  const today = dateKey(now);
  const yesterday = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * The shift as one bar: work green, stops amber, not recorded grey. Jobs run
 * together stack as lanes, so overlap is visible instead of hidden.
 */
function ShiftBar({ day, now }: { day: FloorDay; now: Date }) {
  const win = barWindow(day, now);
  const total = win.to - win.from;
  const pct = (t: number) => `${Math.max(0, Math.min(100, ((t - win.from) / total) * 100))}%`;
  const work = day.sessions.map((s) => ({ start: at(s.start).getTime(), end: (s.end ? at(s.end) : now).getTime() }));
  const { lanes, count } = assignLanes(work);
  const height = Math.max(44, count * 22);
  const block = (start: number, end: number, color: string, extra: object = {}) => ({
    position: 'absolute' as const, left: pct(start), width: `calc(${pct(end)} - ${pct(start)})`, minWidth: 3, background: color, borderRadius: 4, ...extra,
  });
  return (
    <Box>
      <Box data-testid="shift-bar" role="img" aria-label="The shift: work green, stops amber, not recorded grey" sx={{ position: 'relative', height, background: 'var(--c-surface-3)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
        {day.notRecorded.map((g, i) => <Box key={`g${i}`} data-seg="gap" sx={block(at(g.start).getTime(), at(g.end).getTime(), 'var(--c-neutral-200)', { top: 0, bottom: 0, borderRadius: 0 })} />)}
        {day.stops.map((s) => <Box key={`s${s.id}`} data-seg="stop" sx={block(at(s.start).getTime(), (s.end ? at(s.end) : now).getTime(), 'var(--c-warning-600)', { top: 0, bottom: 0, borderRadius: 0 })} />)}
        {day.sessions.map((s, i) => (
          <Box key={`w${s.id}`} data-seg="work" data-lane={lanes[i]} sx={block(work[i].start, work[i].end, 'var(--c-success-600)', { top: `${(lanes[i] / count) * 100}%`, height: `calc(${100 / count}% - 2px)`, marginTop: '1px' })} />
        ))}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--c-text-2)', mt: 0.5 }}>
        <span>{hhmm(new Date(win.from))}</span><span>{hhmm(new Date(win.to))}</span>
      </Box>
    </Box>
  );
}

function Total({ label, minutes, color }: { label: string; minutes: number; color: string }) {
  return (
    <Box sx={{ flex: 1, minWidth: 100 }}>
      <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color, lineHeight: 1.1 }}>{duration(minutes)}</Box>
      <Box sx={{ fontSize: 15, color: 'var(--c-text-2)' }}>{label}</Box>
    </Box>
  );
}

function RowShell({ tone, onClick, ariaLabel, children }: { tone: 'work' | 'stop'; onClick: () => void; ariaLabel: string; children: React.ReactNode }) {
  const color = tone === 'work' ? 'var(--c-success-600)' : 'var(--c-warning-600)';
  return (
    <ButtonBase onClick={onClick} aria-label={ariaLabel} sx={{ width: '100%', minHeight: 72, p: 2, gap: 2, justifyContent: 'flex-start', textAlign: 'left', border: '1px solid var(--c-border)', borderLeft: `8px solid ${color}`, borderRadius: 'var(--r-md)', background: 'var(--c-surface)' }}>
      {children}
    </ButtonBase>
  );
}

/** A quiet "Saved" (or the note a save brought back, e.g. "Job reopened — 3 left") that fades on its own. */
export function SavedNote({ show, text }: { show: boolean; text?: string | null }) {
  return <Box role="status" aria-live="polite" sx={{ fontSize: 15, color: 'var(--c-success-800)', minHeight: 22, opacity: show ? 1 : 0, transition: 'opacity 300ms' }}>{show ? text || 'Saved' : ''}</Box>;
}

/** My day: the whole shift at a glance, and the way to add what happened, from paper notes or memory. */
export function DayTab({ machine, operator, reasons, day, refresh, saved, date, setDate, setDay }: TabProps & { date: string; setDate: (d: string) => void; setDay: (d: FloorDay) => void }) {
  const now = useNow(30_000);
  const [target, setTarget] = useState<Target | null>(null);
  const items = useMemo(() => (day ? dayItems(day) : []), [day]);
  const isToday = date === dateKey(now);

  const shift = (n: number) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); setDate(dateKey(d)); };
  const write = async (rows: FloorRow[], deleted: { kind: 'work' | 'stop'; id: number }[] = []) => {
    const d = await saveDay(machine.id, date, operator.id, rows, deleted);
    setDay(d); saved(reopenNote(d.reopened)); void refresh();
  };
  const closeAfter = (fn: () => Promise<void>) => async () => { await fn(); setTarget(null); };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <ButtonBase onClick={() => shift(-1)} aria-label="Day before" sx={{ width: TOUCH, height: TOUCH, borderRadius: '50%', border: '2px solid var(--c-border)' }}><ChevronLeftRounded /></ButtonBase>
        <Typography component="h2" sx={{ fontSize: 22, fontWeight: 700 }}>{dayLabel(date, now)}</Typography>
        <ButtonBase onClick={() => shift(1)} disabled={isToday} aria-label="Day after" sx={{ width: TOUCH, height: TOUCH, borderRadius: '50%', border: '2px solid var(--c-border)', opacity: isToday ? 0.3 : 1 }}><ChevronRightRounded /></ButtonBase>
      </Box>

      {day && (
        <>
          <ShiftBar day={day} now={now} />
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Total label="Work" minutes={day.totals.work} color="var(--c-success-800)" />
            <Total label="Stopped" minutes={day.totals.stopped} color="var(--c-warning-800)" />
            <Total label="Not recorded" minutes={day.totals.notRecorded} color="var(--c-text-2)" />
          </Box>
        </>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {items.map((item) => {
          if (item.kind === 'work') {
            const s = item.session;
            return (
              <RowShell key={`w${s.id}`} tone="work" onClick={() => setTarget({ kind: 'work', session: s })} ariaLabel={`Work ${s.operation} ${s.pieceName} ${span(item.start, item.end)}`}>
                <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 600, minWidth: 120 }}>{span(item.start, item.end, date)}</Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ fontSize: 19, fontWeight: 700, overflowWrap: 'anywhere' }}>{s.operation || s.pieceName}</Box>
                  <Box sx={{ fontSize: 15, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{s.pieceName || s.pieceCode}</Box>
                </Box>
                {!!s.good && <Box sx={{ textAlign: 'right', flexShrink: 0 }}><Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{s.good}</Box><Box sx={{ fontSize: 15, color: 'var(--c-text-2)' }}>done</Box></Box>}
              </RowShell>
            );
          }
          if (item.kind === 'stop') {
            const s = item.stop;
            return (
              <RowShell key={`s${s.id}`} tone="stop" onClick={() => setTarget({ kind: 'stop', stop: s })} ariaLabel={`Stop ${s.reason} ${span(item.start, item.end)}`}>
                <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 600, minWidth: 120 }}>{span(item.start, item.end, date)}</Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ fontSize: 19, fontWeight: 700 }}>{s.reason}</Box>
                  {s.note && <Box sx={{ fontSize: 15, color: 'var(--c-text-2)' }}>{s.note}</Box>}
                </Box>
              </RowShell>
            );
          }
          return (
            <Box key={`g${item.start.getTime()}`} data-testid="gap-row" sx={{ p: 2, borderRadius: 'var(--r-md)', background: 'var(--c-neutral-50)', border: '2px dashed var(--c-neutral-200)', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              <Box sx={{ fontSize: 18, fontWeight: 700, color: 'var(--c-text-2)' }}>Not recorded · <span style={{ fontFamily: 'var(--font-mono)' }}>{span(item.start, item.end, date)}</span> · {duration(item.gap.minutes)}</Box>
              <ChoiceRow>
                <Choice onClick={() => setTarget({ kind: 'work', prefill: { start: item.start, end: item.end } })} sx={{ minHeight: TOUCH, fontSize: 16, borderColor: 'var(--c-success-600)', color: 'var(--c-success-800)' }}>It was work</Choice>
                <Choice onClick={() => setTarget({ kind: 'stop', prefill: { start: item.start, end: item.end } })} sx={{ minHeight: TOUCH, fontSize: 16, borderColor: 'var(--c-warning-600)', color: 'var(--c-warning-800)' }}>It was a stop</Choice>
              </ChoiceRow>
            </Box>
          );
        })}
        {day && items.length === 0 && <Typography sx={{ fontSize: 18, color: 'var(--c-text-2)' }}>Nothing recorded for this day yet.</Typography>}
      </Box>

      <Box sx={{ position: 'sticky', bottom: 0, py: 1.5, background: 'var(--c-canvas)', display: 'flex', gap: 1.5 }}>
        <BigButton sx={{ flex: 1 }} startIcon={<AddRounded />} onClick={() => setTarget({ kind: 'work' })}>Add work</BigButton>
        <BigButton sx={{ flex: 1 }} tone="warning" startIcon={<AddRounded />} onClick={() => setTarget({ kind: 'stop' })}>Add stop</BigButton>
      </Box>

      <WorkSheet target={target?.kind === 'work' ? target : null} day={day} dateStr={date} now={now} machineId={machine.id} onClose={() => setTarget(null)}
        onSave={(row) => closeAfter(() => write([row]))()} onDelete={(kind, id) => closeAfter(() => write([], [{ kind, id }]))()} />
      <StopSheet target={target?.kind === 'stop' ? target : null} day={day} dateStr={date} now={now} reasons={reasons} onClose={() => setTarget(null)}
        onSave={(row) => closeAfter(() => write([row]))()} onDelete={(kind, id) => closeAfter(() => write([], [{ kind, id }]))()} />
    </Box>
  );
}
