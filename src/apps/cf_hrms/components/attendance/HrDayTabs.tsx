/**
 * Attendance › Today, Month, Requests, Penalties (CF_HRMS_HIRING_SPEC.md §28.7) — the day-to-day
 * tabs of HR's Attendance screen.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import {
  Callout, EmptyState, ErrorNotice, FormDialog, ListSkeleton, PromptDialog, SectionCard, SideSheet, StatStrip, ToneBadge, errorMessage, useToast,
} from '@shared/ui';
import { useCan } from '../../access/can';
import { saveBase64File } from '../../api/excel';
import {
  STATUS_WORDS, attendanceApi, dayLabel, hm, thisMonth, todayLocal, type AttRequest, type BoardState, type DayStatus, type MonthGrid, type Penalty, type PersonDay, type PersonMonth, type TodayBoard,
} from '../../api/attendance';
import { ScreenHeader } from '../TabbedScreen';
import { Legend, MonthPicker, MusterGrid, PenaltyRow } from './AttendanceParts';
import { PersonMonthView } from './PersonMonthView';
import { AttendanceRequestSheet, type AttSheetActions } from './AttendanceRequestSheet';

const STATE: Record<BoardState, { tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label: string }> = {
  PRESENT: { tone: 'success', label: 'Present' }, LATE: { tone: 'warning', label: 'Late' }, HALF: { tone: 'warning', label: 'Half day' }, ABSENT: { tone: 'danger', label: 'Absent' },
  LEAVE: { tone: 'info', label: 'On leave' }, OFF: { tone: 'neutral', label: 'Day off' }, NOT_PUNCHED: { tone: 'warning', label: 'Not punched' },
};

/* ══ Today ══════════════════════════════════════════════════════════════════ */
export function AttToday() {
  const can = useCan();
  const toast = useToast();
  const [date, setDate] = useState(todayLocal());
  const [data, setData] = useState<TodayBoard | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [only, setOnly] = useState<BoardState | ''>('');
  const load = useCallback(() => { attendanceApi.today({ date }).then((d) => { setData(d); setError(null); }).catch(setError); }, [date]);
  useEffect(load, [load]);
  const process = async () => {
    try { const r = await attendanceApi.process({ from: date, to: date }); toast.success(`${r.daysWritten} days processed.`); load(); } catch (e) { toast.error(errorMessage(e)); }
  };
  const c = data?.counts;
  return (
    <>
      <ScreenHeader
        title="Today"
        subtitle="Who is in, late, absent, on leave or not punched yet — by department."
        actions={(
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <TextField size="small" type="date" value={date} onChange={(e) => setDate(e.target.value)} inputProps={{ 'aria-label': 'Date' }} />
            {can.attendance.edit && <Button startIcon={<RefreshRounded />} onClick={process} data-action="process-day">Process now</Button>}
          </Box>
        )}
      />
      <ErrorNotice error={error} onRetry={load} />
      {data && !data.live && <Callout title="Attendance is not live" sx={{ mb: 2 }}>{data.liveFrom ? `It is recorded from ${dayLabel(data.liveFrom)}.` : 'Set "Attendance is live from" on the Close month tab to start.'}</Callout>}
      {!data ? <ListSkeleton rows={5} /> : (
        <>
          <StatStrip stats={[
            { label: 'People', value: c!.people },
            { label: 'Present', value: c!.present, tone: 'success' },
            { label: 'Late', value: c!.late, tone: 'warning' },
            { label: 'Absent', value: c!.absent, tone: 'danger' },
            { label: 'On leave', value: c!.leave, tone: 'info' },
            { label: 'Not punched', value: c!.notPunched, tone: 'warning' },
          ]} />
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
            {(['', 'PRESENT', 'LATE', 'HALF', 'ABSENT', 'LEAVE', 'NOT_PUNCHED', 'OFF'] as const).map((s) => (
              <Button key={s || 'all'} size="small" variant={only === s ? 'contained' : 'outlined'} onClick={() => setOnly(s)}>{s ? STATE[s].label : 'Everyone'}</Button>
            ))}
          </Box>
          <Stack spacing={2}>
            {data.departments.map((g) => {
              const people = g.people.filter((p) => !only || p.state === only);
              if (!people.length) return null;
              return (
                <SectionCard key={g.department} title={g.department} subtitle={`${g.counts.present} of ${g.counts.people} in · ${g.counts.late} late · ${g.counts.absent} absent · ${g.counts.leave} on leave · ${g.counts.notPunched} not punched`}>
                  {people.map((p) => (
                    <Box key={p.person.employeeId} data-board-person={p.person.employeeId} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', py: 0.75, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
                      <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{p.person.name}</Typography>
                        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{[p.person.positionTitle, p.shift ? `shift ${p.shift}` : null].filter(Boolean).join(' · ')}</Typography>
                      </Box>
                      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', minWidth: 110 }}>{p.inTime ? `${hm(p.inTime)} → ${hm(p.outTime) || '…'}` : ''}</Typography>
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', flex: '1 1 220px' }}>{p.why ?? ''}</Typography>
                      <ToneBadge tone={STATE[p.state].tone} label={STATE[p.state].label} />
                    </Box>
                  ))}
                </SectionCard>
              );
            })}
            {data.departments.length === 0 && <EmptyState title="Nobody to show" hint="No employees in your scope." />}
          </Stack>
        </>
      )}
    </>
  );
}

/* ══ Month — the muster ═════════════════════════════════════════════════════ */
export function AttMonth() {
  const can = useCan();
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [q, setQ] = useState('');
  const [data, setData] = useState<MonthGrid | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [person, setPerson] = useState<number | null>(null);
  const load = useCallback(() => { setData(null); attendanceApi.month({ month, q }).then((d) => { setData(d); setError(null); }).catch(setError); }, [month, q]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  return (
    <>
      <ScreenHeader
        title="Month"
        subtitle="The muster: a letter for every person and day, and the month’s totals. Open a person for their days."
        actions={(
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <MonthPicker month={month} onChange={setMonth} />
            <TextField size="small" placeholder="Name or code" value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: 170 }} />
            <Button startIcon={<DownloadRounded />} onClick={async () => { try { saveBase64File(await attendanceApi.musterRoll(month)); } catch (e) { toast.error(errorMessage(e)); } }} data-action="muster-roll">Muster roll</Button>
          </Box>
        )}
      />
      <ErrorNotice error={error} onRetry={load} />
      {data?.final && <Callout title="This month is closed" sx={{ mb: 1.5 }}>These are the numbers payroll reads. The Owner can re-open it on the Close month tab.</Callout>}
      {!data ? <ListSkeleton rows={6} /> : data.rows.length === 0 ? <EmptyState title="Nobody to show" /> : (
        <>
          <Legend legend={data.legend} />
          <MusterGrid grid={data} onPerson={setPerson} />
        </>
      )}
      <PersonSheet employeeId={person} month={month} onClose={() => setPerson(null)} canEdit={can.attendance.edit} onChanged={load} />
    </>
  );
}

/** HR's view of one person's month, in a sheet: set a day by hand, waive a penalty. */
function PersonSheet({ employeeId, month, onClose, canEdit, onChanged }: { employeeId: number | null; month: string; onClose: () => void; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<PersonMonth | null>(null);
  const [setting, setSetting] = useState<PersonDay | null>(null);
  const [waiving, setWaiving] = useState<Penalty | null>(null);
  const load = useCallback(() => { if (employeeId) attendanceApi.person(employeeId, month).then(setData).catch((e) => toast.error(errorMessage(e))); }, [employeeId, month, toast]);
  useEffect(() => { setData(null); load(); }, [load]);
  return (
    <SideSheet open={employeeId != null} onClose={onClose} width={980} title={data?.person?.name ?? 'Attendance'} subtitle={data ? `${data.label} · ${data.policy.line}` : undefined}>
      {!data ? <ListSkeleton rows={6} /> : (
        <PersonMonthView
          data={data}
          dayAction={canEdit ? (d) => (!d.future ? <Button size="small" variant="outlined" onClick={() => setSetting(d)} data-action="set-day">Set this day</Button> : null) : undefined}
          onWaive={canEdit ? setWaiving : undefined}
        />
      )}
      {setting && data?.person && <SetDayDialog day={setting} employeeId={data.person.employeeId} onClose={() => setSetting(null)} onDone={() => { setSetting(null); load(); onChanged(); }} />}
      {waiving && (
        <PromptDialog open title="Waive this penalty?" body={`${waiving.reason}${waiving.action === 'LEAVE' ? ' The leave it took goes back to the balance.' : ''}`} label="Why it is waived" confirmLabel="Waive"
          onClose={() => setWaiving(null)} onConfirm={async (note) => { await attendanceApi.waive(waiving.id, note); toast.success('Penalty waived.'); setWaiving(null); load(); }} />
      )}
    </SideSheet>
  );
}

function SetDayDialog({ day, employeeId, onClose, onDone }: { day: PersonDay; employeeId: number; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState<DayStatus | ''>(day.status && day.status !== 'UNKNOWN' ? day.status : 'PRESENT');
  const [inTime, setIn] = useState(hm(day.inTime));
  const [outTime, setOut] = useState(hm(day.outTime));
  const [note, setNote] = useState('');
  return (
    <FormDialog open title={`Set ${dayLabel(day.date)} by hand`} subtitle="Processing keeps a day set by hand. Leave it to the punches again with “Back to the punches”." onClose={onClose} submitLabel="Save" submitDisabled={!!status && !note.trim()} enterSubmits={false}
      extraActions={day.source === 'MANUAL' ? <Button onClick={async () => { await attendanceApi.setDay({ employeeId, date: day.date, status: null }); onDone(); }}>Back to the punches</Button> : undefined}
      onSubmit={async () => { await attendanceApi.setDay({ employeeId, date: day.date, status: status || null, inTime: inTime || null, outTime: outTime || null, note }); onDone(); }}>
      <Box sx={{ display: 'grid', gap: 1.5, mt: 0.5 }}>
        <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value as DayStatus)}>
          {(['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE', 'WEEKLY_OFF', 'HOLIDAY'] as DayStatus[]).map((s) => <MenuItem key={s} value={s}>{STATUS_WORDS[s]}</MenuItem>)}
        </TextField>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
          <TextField size="small" type="time" label="In" value={inTime} onChange={(e) => setIn(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" type="time" label="Out" value={outTime} onChange={(e) => setOut(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Box>
        <TextField label="Why" required multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Box>
    </FormDialog>
  );
}

/* ══ Requests ═══════════════════════════════════════════════════════════════ */
const HR_ACTIONS: AttSheetActions = { load: attendanceApi.request, approve: attendanceApi.approve, reject: attendanceApi.reject };
export function AttRequests() {
  const [status, setStatus] = useState('PENDING');
  const [items, setItems] = useState<AttRequest[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<number | null>(null);
  const load = useCallback(() => { setItems(null); attendanceApi.requests({ status }).then((x) => { setItems(x); setError(null); }).catch(setError); }, [status]);
  useEffect(load, [load]);
  return (
    <>
      <ScreenHeader title="Requests" subtitle="Corrections, short permissions and on-duty days. A manager decides them in Approvals; HR can decide any."
        actions={(
          <TextField select size="small" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 150 }} inputProps={{ 'aria-label': 'Status' }}>
            {[['PENDING', 'Waiting'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected'], ['CANCELLED', 'Cancelled'], ['', 'All']].map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
        )} />
      <ErrorNotice error={error} onRetry={load} />
      {!items ? <ListSkeleton rows={4} /> : items.length === 0 ? <EmptyState title="No requests" hint="When someone asks to correct a day, it shows here." /> : (
        <SectionCard flush>
          {items.map((r) => (
            <Box key={r.id} component="button" type="button" onClick={() => setOpen(r.id)} data-att-request-row={r.id}
              sx={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', width: '100%', display: 'flex', gap: 1.5, flexWrap: 'wrap', px: 2, py: 1.25, borderBottom: '1px solid var(--c-divider)', '&:hover': { background: 'var(--c-surface-2)' } }}>
              <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{r.person.name} <Box component="span" sx={{ fontWeight: 400, color: 'var(--c-text-3)', fontSize: 12.5 }}>{r.person.departmentName}</Box></Typography>
                <Typography sx={{ fontSize: 13.5 }}>{r.title} · {dayLabel(r.date)}</Typography>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</Typography>
              </Box>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{r.approver ? `With ${r.approver.name}` : 'With HR'}</Typography>
              <ToneBadge tone={r.status === 'PENDING' ? 'warning' : r.status === 'APPROVED' ? 'success' : 'neutral'} label={r.status.charAt(0) + r.status.slice(1).toLowerCase()} />
            </Box>
          ))}
        </SectionCard>
      )}
      <AttendanceRequestSheet id={open} onClose={() => setOpen(null)} actions={HR_ACTIONS} onChanged={load} />
    </>
  );
}

/* ══ Penalties ══════════════════════════════════════════════════════════════ */
export function AttPenalties() {
  const can = useCan();
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [status, setStatus] = useState('');
  const [items, setItems] = useState<Penalty[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [waiving, setWaiving] = useState<Penalty | null>(null);
  const load = useCallback(() => { setItems(null); attendanceApi.penalties({ month, status }).then((x) => { setItems(x); setError(null); }).catch(setError); }, [month, status]);
  useEffect(load, [load]);
  const totals = useMemo(() => {
    const a = (items ?? []).filter((p) => p.status === 'APPLIED');
    return { n: a.length, leave: a.filter((p) => p.action === 'LEAVE').reduce((s, p) => s + p.quantity, 0), lop: a.filter((p) => p.action === 'LOP').reduce((s, p) => s + p.quantity, 0), amount: a.reduce((s, p) => s + p.amount, 0) };
  }, [items]);
  return (
    <>
      <ScreenHeader title="Penalties" subtitle="What the attendance rules took. Waive one with a reason; a fixed day (an approved correction) reverses it by itself."
        actions={(
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <MonthPicker month={month} onChange={setMonth} />
            <TextField select size="small" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 130 }} SelectProps={{ displayEmpty: true }} inputProps={{ 'aria-label': 'Status' }}>
              {[['', 'All'], ['APPLIED', 'Applied'], ['WAIVED', 'Waived'], ['REVERSED', 'Reversed']].map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
            </TextField>
          </Box>
        )} />
      <ErrorNotice error={error} onRetry={load} />
      {items && <StatStrip stats={[{ label: 'Applied', value: totals.n }, { label: 'Leave days taken', value: totals.leave, tone: 'info' }, { label: 'Days without pay', value: totals.lop, tone: 'danger' }, { label: 'Amount (₹)', value: totals.amount }]} />}
      {!items ? <ListSkeleton rows={4} /> : items.length === 0 ? <EmptyState title="No penalties this month" /> : (
        <SectionCard>{items.map((p) => <PenaltyRow key={p.id} p={p} showPerson onWaive={can.attendance.edit ? setWaiving : undefined} />)}</SectionCard>
      )}
      {waiving && (
        <PromptDialog open title="Waive this penalty?" body={`${waiving.person.name}: ${waiving.reason}${waiving.action === 'LEAVE' ? ' The leave it took goes back to the balance.' : ''}`} label="Why it is waived" confirmLabel="Waive"
          onClose={() => setWaiving(null)} onConfirm={async (note) => { await attendanceApi.waive(waiving.id, note); toast.success('Penalty waived.'); setWaiving(null); load(); }} />
      )}
    </>
  );
}
