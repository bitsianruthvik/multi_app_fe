/**
 * The pieces every attendance screen shares (CF_HRMS_HIRING_SPEC.md §28.7): the day letter,
 * the muster grid, a person's month as a calendar, the day's detail, the policy's sentences,
 * a penalty row, and the "ask to correct a day" dialog.
 *
 * Colour is never the only signal: every cell carries its letter, and a late mark a dot plus
 * the words in its tooltip.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Box, Button, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { FormDialog, ToneBadge } from '@shared/ui';
import {
  KIND_WORDS, STATUS_WORDS, dayLabel, hm, minutesWord, monthLabel, shiftMonth,
  type AskBody, type Cell, type MonthGrid as Grid, type Penalty, type PersonDay, type PersonMonth, type RequestKind,
} from '../../api/attendance';

/* ── the letter of a day ─────────────────────────────────────────────── */

const LETTER_STYLE: Record<string, { bg: string; fg: string }> = {
  P: { bg: 'var(--c-success-50)', fg: 'var(--c-success-800)' },
  HD: { bg: 'var(--c-warning-50)', fg: 'var(--c-warning-800)' },
  A: { bg: 'var(--c-danger-50)', fg: 'var(--c-danger-800)' },
  L: { bg: 'var(--c-info-50)', fg: 'var(--c-info-800)' },
  WO: { bg: 'var(--c-neutral-50)', fg: 'var(--c-text-3)' },
  H: { bg: 'var(--c-neutral-50)', fg: 'var(--c-text-2)' },
  '?': { bg: 'var(--c-warning-50)', fg: 'var(--c-warning-800)' },
  '·': { bg: 'transparent', fg: 'var(--c-text-3)' },
};

export function DayLetter({ letter, late, missing, size = 30, title }: { letter: string; late?: boolean; missing?: boolean; size?: number; title?: ReactNode }) {
  const s = LETTER_STYLE[letter] ?? LETTER_STYLE['·'];
  const box = (
    <Box
      component="span"
      data-day-letter={letter}
      sx={{
        position: 'relative', display: 'inline-grid', placeItems: 'center', width: size, height: size, borderRadius: 'var(--r-sm)',
        background: s.bg, color: s.fg, fontSize: letter.length > 1 ? 10.5 : 12, fontWeight: 600, lineHeight: 1,
        outline: missing ? '1px dashed var(--c-warning-600)' : 'none',
      }}
    >
      {letter}
      {late && <Box component="span" aria-label="late" sx={{ position: 'absolute', top: 2, right: 2, width: 5, height: 5, borderRadius: '50%', background: 'var(--c-danger-600)' }} />}
    </Box>
  );
  return title ? <Tooltip title={title} arrow>{box}</Tooltip> : box;
}

export function Legend({ legend }: { legend: { letter: string; words: string }[] }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, alignItems: 'center', fontSize: 12.5, color: 'var(--c-text-2)', my: 1 }}>
      {legend.map((l) => (
        <Box key={l.letter} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><DayLetter letter={l.letter} size={22} /> {l.words}</Box>
      ))}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><DayLetter letter="P" late size={22} /> Late mark</Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><DayLetter letter="P" missing size={22} /> One punch</Box>
    </Box>
  );
}

function cellTitle(c: Cell): ReactNode {
  if (c.letter === '·') return `${dayLabel(c.date)}: not processed`;
  return (
    <Box>
      <Box sx={{ fontWeight: 600 }}>{dayLabel(c.date)} · {c.status ? STATUS_WORDS[c.status] : c.letter}</Box>
      {(c.inTime || c.outTime) && <Box>{hm(c.inTime) || '—'} → {hm(c.outTime) || '—'}</Box>}
      {c.why && <Box>{c.why}</Box>}
      {!!c.overtime && <Box>Overtime {minutesWord(c.overtime)}</Box>}
    </Box>
  );
}

/** ‹ October 2026 › */
export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <IconButton size="small" aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}><ChevronLeftRounded /></IconButton>
      <Typography sx={{ fontSize: 14.5, fontWeight: 600, minWidth: 128, textAlign: 'center' }} data-month={month}>{monthLabel(month)}</Typography>
      <IconButton size="small" aria-label="Next month" onClick={() => onChange(shiftMonth(month, 1))}><ChevronRightRounded /></IconButton>
    </Box>
  );
}

/* ── the muster: person × day ────────────────────────────────────────── */

export function MusterGrid({ grid, onPerson }: { grid: Grid; onPerson?: (employeeId: number) => void }) {
  const head = { position: 'sticky' as const, top: 0, background: 'var(--c-surface)', zIndex: 1 };
  return (
    <Box sx={{ overflow: 'auto', maxHeight: '70vh', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)' }} data-muster>
      <Box component="table" sx={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12.5, minWidth: '100%' }}>
        <thead>
          <tr>
            <Box component="th" sx={{ ...head, left: 0, zIndex: 2, textAlign: 'left', p: 1, minWidth: 170, borderBottom: '1px solid var(--c-divider)' }}>Person</Box>
            {grid.dates.map((d) => (
              <Box component="th" key={d.date} sx={{ ...head, p: 0.25, fontWeight: 500, color: d.weekday === 'Sun' ? 'var(--c-text-3)' : 'var(--c-text-2)', borderBottom: '1px solid var(--c-divider)' }}>
                <Box sx={{ fontSize: 11 }}>{d.weekday.slice(0, 2)}</Box>{d.day}
              </Box>
            ))}
            {['P', 'A', 'L', 'Late', 'OT h', 'LOP'].map((h) => (
              <Box component="th" key={h} sx={{ ...head, p: 0.75, borderBottom: '1px solid var(--c-divider)', whiteSpace: 'nowrap' }}>{h}</Box>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((r) => (
            <tr key={r.person.employeeId} data-muster-row={r.person.employeeId}>
              <Box component="td" sx={{ position: 'sticky', left: 0, background: 'var(--c-surface)', p: 0.75, borderBottom: '1px solid var(--c-divider)', zIndex: 1 }}>
                {onPerson ? (
                  <Box component="button" type="button" onClick={() => onPerson(r.person.employeeId)} sx={{ all: 'unset', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.person.name}</Typography>
                  </Box>
                ) : <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{r.person.name}</Typography>}
                <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[r.person.employeeCode, r.person.departmentName].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
              {r.cells.map((c) => (
                <Box component="td" key={c.date} sx={{ p: '2px', textAlign: 'center', borderBottom: '1px solid var(--c-divider)' }}>
                  <DayLetter letter={c.letter} late={c.late} missing={c.missing} size={26} title={cellTitle(c)} />
                </Box>
              ))}
              {[r.totals?.present, r.totals?.absent, r.totals ? r.totals.leave.paid + r.totals.leave.unpaid : null, r.totals?.lateMarks, r.totals?.overtime.hours, r.totals?.lopDays].map((v, i) => (
                <Box component="td" key={i} sx={{ p: 0.75, textAlign: 'right', borderBottom: '1px solid var(--c-divider)', fontVariantNumeric: 'tabular-nums' }}>{v ?? '—'}</Box>
              ))}
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

/* ── a person's month as a calendar ──────────────────────────────────── */

export function MonthCalendar({ days, onDay, selected }: { days: PersonDay[]; onDay: (d: PersonDay) => void; selected?: string | null }) {
  const lead = days.length ? ((new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7) : 0;
  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.5, mb: 0.5 }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => <Typography key={w} sx={{ fontSize: 11.5, color: 'var(--c-text-3)', textAlign: 'center' }}>{w}</Typography>)}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.5 }} data-calendar>
        {Array.from({ length: lead }).map((_, i) => <Box key={`b${i}`} />)}
        {days.map((d) => {
          const s = LETTER_STYLE[d.letter] ?? LETTER_STYLE['·'];
          return (
            <Box
              key={d.date}
              component="button"
              type="button"
              onClick={() => onDay(d)}
              data-calendar-day={d.date}
              aria-label={`${d.weekday} ${dayLabel(d.date)}: ${d.status ? STATUS_WORDS[d.status] : 'nothing recorded'}${d.late ? ', late' : ''}`}
              sx={{
                all: 'unset', boxSizing: 'border-box', cursor: 'pointer', borderRadius: 'var(--r-sm)', p: 0.5, minHeight: 58,
                border: selected === d.date ? '2px solid var(--c-primary-500)' : '1px solid var(--c-divider)', background: d.future ? 'transparent' : s.bg,
                display: 'flex', flexDirection: 'column', gap: 0.25, opacity: d.future ? 0.55 : 1, position: 'relative',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)' }}>{Number(d.date.slice(8, 10))}</Typography>
                {d.late && <Box component="span" aria-label="late" sx={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-danger-600)' }} />}
              </Box>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: s.fg }}>{d.letter === '·' ? '' : d.letter}</Typography>
              {(d.inTime || d.outTime) && (
                <Typography sx={{ fontSize: 10.5, color: 'var(--c-text-2)', display: { xs: 'none', sm: 'block' } }}>{hm(d.inTime) || '—'}–{hm(d.outTime) || '—'}</Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/** The detail of one day: status, why, times, punches. */
export function DayDetail({ d, action }: { d: PersonDay; action?: ReactNode }) {
  return (
    <Box data-day-detail={d.date} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <DayLetter letter={d.letter} late={d.late} missing={d.missing} />
        <Typography sx={{ fontWeight: 600 }}>{d.weekday}, {dayLabel(d.date)}</Typography>
        {d.status && <Typography sx={{ color: 'var(--c-text-2)', fontSize: 13.5 }}>{STATUS_WORDS[d.status]}</Typography>}
        {d.shift && <Typography sx={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>Shift {d.shift}</Typography>}
        <Box sx={{ flex: 1 }} />
        {action}
      </Box>
      {d.why && <Typography sx={{ fontSize: 13.5, mt: 0.75 }}>{d.why}</Typography>}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 0.75, fontSize: 13, color: 'var(--c-text-2)' }}>
        {(d.inTime || d.outTime) && <span>In {hm(d.inTime) || '—'} · Out {hm(d.outTime) || '—'}</span>}
        {d.workedMinutes != null && <span>Worked {minutesWord(d.workedMinutes)}</span>}
        {d.lateMinutes > 0 && <span>{minutesWord(d.lateMinutes)} late</span>}
        {d.earlyMinutes > 0 && <span>Left {minutesWord(d.earlyMinutes)} early</span>}
        {d.overtimeMinutes > 0 && <span>Overtime {minutesWord(d.overtimeMinutes)}</span>}
      </Box>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 0.75 }}>
        {d.punches.length ? `Punches: ${d.punches.map((p) => `${hm(p.at)}${p.direction !== 'UNKNOWN' ? ` ${p.direction}` : ''} (${p.method.toLowerCase()})`).join(', ')}` : 'No punches.'}
      </Typography>
    </Box>
  );
}

export function PolicySentences({ line, sentences }: { line: string; sentences: string[] }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 0.5 }}>{line}</Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 13.5, '& li': { mb: 0.25 } }}>{sentences.map((s, i) => <li key={i}>{s}</li>)}</Box>
    </Box>
  );
}

const PENALTY_TONE = { APPLIED: 'warning', WAIVED: 'neutral', REVERSED: 'info' } as const;
export function PenaltyRow({ p, onWaive, showPerson = false }: { p: Penalty; onWaive?: (p: Penalty) => void; showPerson?: boolean }) {
  return (
    <Box data-penalty={p.id} sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start', py: 1.25, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
      <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
        {showPerson && <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{p.person.name} <Box component="span" sx={{ color: 'var(--c-text-3)', fontWeight: 400 }}>{p.person.employeeCode}</Box></Typography>}
        <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>
          {p.actionWords}{p.action === 'LEAVE' || p.action === 'LOP' ? ` · ${p.quantity === 0.5 ? 'half a day' : `${p.quantity} day${p.quantity === 1 ? '' : 's'}`}` : ''}{p.action === 'AMOUNT' ? ` · ₹${p.amount.toLocaleString('en-IN')}` : ''} · {dayLabel(p.date)}
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{p.reason}</Typography>
        {p.statusNote && <Typography sx={{ fontSize: 12.5, mt: 0.25 }}>“{p.statusNote}”</Typography>}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ToneBadge tone={PENALTY_TONE[p.status]} label={p.status === 'APPLIED' ? 'Applied' : p.status === 'WAIVED' ? 'Waived' : 'Reversed'} />
        {onWaive && p.status === 'APPLIED' && <Button size="small" color="inherit" onClick={() => onWaive(p)} data-action="waive">Waive</Button>}
      </Box>
    </Box>
  );
}

/* ── asking: correct a day, short permission, on duty ────────────────── */

export function AskDialog({
  open, onClose, onSubmit, date, kinds = ['CORRECTION', 'SHORT_PERMISSION', 'ON_DUTY'], shortPermission, approverWords,
}: {
  open: boolean; onClose: () => void; onSubmit: (body: AskBody) => Promise<unknown>; date: string;
  kinds?: RequestKind[]; shortPermission?: { perMonth: number; maxMinutes: number } | null; approverWords?: string;
}) {
  const [kind, setKind] = useState<RequestKind>(kinds[0]);
  const [day, setDay] = useState(date);
  const [status, setStatus] = useState<'' | 'PRESENT' | 'HALF_DAY'>('');
  const [inTime, setIn] = useState('');
  const [outTime, setOut] = useState('');
  const [minutes, setMinutes] = useState('60');
  const [reason, setReason] = useState('');
  const can = useMemo(() => reason.trim().length > 0 && (kind !== 'CORRECTION' || status || inTime || outTime), [reason, kind, status, inTime, outTime]);
  return (
    <FormDialog
      open={open}
      title="Ask about a day"
      subtitle={approverWords}
      onClose={onClose}
      submitLabel="Send for approval"
      busyLabel="Sending…"
      submitDisabled={!can}
      enterSubmits={false}
      onSubmit={() => onSubmit({
        kind, date: day, reason: reason.trim(),
        ...(kind === 'CORRECTION' ? { status: status || null, inTime: inTime || null, outTime: outTime || null } : {}),
        ...(kind === 'SHORT_PERMISSION' ? { minutes: Number(minutes) } : {}),
      })}
    >
      <Box sx={{ display: 'grid', gap: 1.5, mt: 0.5 }}>
        <TextField select size="small" label="What" value={kind} onChange={(e) => setKind(e.target.value as RequestKind)} data-field="kind">
          {kinds.map((k) => <MenuItem key={k} value={k}>{KIND_WORDS[k]}</MenuItem>)}
        </TextField>
        <TextField size="small" type="date" label="Date" value={day} onChange={(e) => setDay(e.target.value)} InputLabelProps={{ shrink: true }} data-field="date" />
        {kind === 'CORRECTION' && (
          <>
            <TextField select size="small" label="Mark the day" value={status} onChange={(e) => setStatus(e.target.value as '' | 'PRESENT' | 'HALF_DAY')} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
              <MenuItem value="">As the times say</MenuItem>
              <MenuItem value="PRESENT">Present</MenuItem>
              <MenuItem value="HALF_DAY">Half day</MenuItem>
            </TextField>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <TextField size="small" type="time" label="In" value={inTime} onChange={(e) => setIn(e.target.value)} InputLabelProps={{ shrink: true }} data-field="in" />
              <TextField size="small" type="time" label="Out" value={outTime} onChange={(e) => setOut(e.target.value)} InputLabelProps={{ shrink: true }} data-field="out" />
            </Box>
          </>
        )}
        {kind === 'SHORT_PERMISSION' && (
          <TextField size="small" type="number" label="Minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)}
            helperText={shortPermission ? `Up to ${minutesWord(shortPermission.maxMinutes)}, ${shortPermission.perMonth === 1 ? 'once' : `${shortPermission.perMonth} times`} a month.` : 'Your attendance policy decides how much.'} />
        )}
        <TextField label="Reason" required multiline minRows={3} value={reason} onChange={(e) => setReason(e.target.value)} data-field="reason" />
      </Box>
    </FormDialog>
  );
}

/** The figures of a month, one line each. */
export function MonthFigures({ m }: { m: PersonMonth['summary'] }) {
  if (!m) return null;
  const items: [string, string | number][] = [
    ['Present', m.present], ['Absent', m.absent], ['Leave', m.leave.paid + m.leave.unpaid], ['Weekly offs', m.weeklyOffs], ['Holidays', m.holidays],
    ['Late marks', m.lateMarks], ['Overtime', minutesWord(m.overtime.minutes)], ['Loss of pay', `${m.lopDays} day${m.lopDays === 1 ? '' : 's'}`],
  ];
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', sm: 'repeat(4, minmax(0,1fr))' }, gap: 1 }} data-month-figures>
      {items.map(([k, v]) => (
        <Box key={k} sx={{ border: '1px solid var(--c-divider)', borderRadius: 'var(--r-sm)', p: 1 }}>
          <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{k}</Typography>
          <Typography sx={{ fontSize: 17, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v}</Typography>
        </Box>
      ))}
    </Box>
  );
}
