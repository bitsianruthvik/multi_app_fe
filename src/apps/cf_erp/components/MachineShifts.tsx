import { useState } from 'react';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import { cfApi, qs } from '../api/client';
import type { CalendarDay, CalendarException, Machine, MachineCalendar, MachineShift } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { daysText, hoursText } from '../lib/inventory';
import { minutesText } from '../lib/production';
import { ErrorNotice, Mono, SectionCard, SkeletonRows } from './ui';
import { ConfirmDialog } from './ConfirmDialog';
import { DataTable, type DataColumn } from './DataTable';
import { EntityList, EntityRow } from './EntityList';
import { CopyShiftsDialog, ExceptionDialog, ShiftDialog } from './ShiftDialogs';
import { useToast } from './toastContext';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const SPAN = 30 * 60; // the track runs to 06:00 the next morning, where night shifts end
const minutesOn = (date: string, stamp: string) => {
  const [d, t] = stamp.split('T');
  const [h, m] = t.split(':').map(Number);
  return (d === date ? 0 : 1440) + h * 60 + m;
};

function DayTrack({ day }: { day: CalendarDay }) {
  const label = new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr) 56px', gap: 1, alignItems: 'center', py: 0.5 }}>
      <Typography sx={{ fontSize: 12.5, color: day.minutes ? 'var(--c-text)' : 'var(--c-text-3)' }}>{label}</Typography>
      <Box sx={{ position: 'relative', height: 22, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)', overflow: 'hidden' }}
        aria-label={`${label}: ${day.windows.map((w) => `${w.label} ${w.start.slice(11)}–${w.end.slice(11)}`).join(', ') || 'not working'}`}>
        {day.windows.map((w) => {
          const a = minutesOn(day.date, w.start);
          const b = Math.min(minutesOn(day.date, w.end), SPAN);
          return (
            <Tooltip key={w.start} title={`${w.label}: ${w.start.slice(11)}–${w.end.slice(11)} · ${minutesText(w.minutes)}`}>
              <Box sx={{
                position: 'absolute', top: 3, bottom: 3, left: `${(a / SPAN) * 100}%`, width: `${Math.max(((b - a) / SPAN) * 100, 0.6)}%`, borderRadius: '3px',
                background: w.source === 'extra' ? 'var(--c-success-200)' : 'var(--c-primary-200)',
              }} />
            </Tooltip>
          );
        })}
        <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `${(1440 / SPAN) * 100}%`, width: '1px', background: 'var(--c-text-3)', opacity: 0.5 }} />
      </Box>
      <Mono sx={{ textAlign: 'right', color: day.minutes ? 'var(--c-text)' : 'var(--c-text-3)' }}>{day.minutes ? hoursText(day.minutes) : '—'}</Mono>
      {day.exceptions.length > 0 && (
        <Typography sx={{ gridColumn: '2 / 4', fontSize: 12, color: 'var(--c-warning-800)', mt: -0.25 }}>
          {day.exceptions.map((e) => `${e.text}${e.reason ? ` — ${e.reason}` : ''}`).join(' · ')}
        </Typography>
      )}
    </Box>
  );
}

/** A machine's Shifts tab: its weekly shifts, the next two weeks as they will run, and one-day changes. */
export function MachineShifts({ machine }: { machine: Machine }) {
  const toast = useToast();
  const from = iso(new Date());
  const to = iso(new Date(Date.now() + 13 * 86400000));
  const shifts = useLoad(() => cfApi.get<MachineShift[]>(`/machines/${machine.id}/shifts`), [machine.id]);
  const cal = useLoad(() => cfApi.get<MachineCalendar>(`/machines/${machine.id}/calendar${qs({ from, to })}`), [machine.id]);
  const exc = useLoad(() => cfApi.get<CalendarException[]>(`/machines/${machine.id}/exceptions`), [machine.id]);
  const [editing, setEditing] = useState<{ open: boolean; shift: MachineShift | null }>({ open: false, shift: null });
  const [removing, setRemoving] = useState<MachineShift | null>(null);
  const [copying, setCopying] = useState(false);
  const [adding, setAdding] = useState(false);
  const canManage = useIsPermitted()('cf_erp_production_manage');
  const refresh = () => { shifts.reload(); cal.reload(); exc.reload(); invalidateNavCounts(); };
  const list = shifts.data ?? [];
  const columns: DataColumn<MachineShift>[] = [
    { key: 'name', header: 'Shift', alwaysVisible: true, render: (s) => <Box sx={{ fontWeight: 500 }}>{s.name}</Box> },
    { key: 'days', header: 'Days', alwaysVisible: true, render: (s) => daysText(s.weekdays) },
    { key: 'time', header: 'Time', alwaysVisible: true, render: (s) => <><Mono>{s.startTime}–{s.endTime}</Mono>{s.crossesMidnight && <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}> next day</Typography>}</> },
    { key: 'break', header: 'Break', numeric: true, alwaysVisible: true, render: (s) => (s.breakMinutes ? `${s.breakMinutes} min` : '—') },
    { key: 'working', header: 'Working', numeric: true, alwaysVisible: true, render: (s) => hoursText(s.minutes) },
    { key: 'valid', header: 'Valid', alwaysVisible: true, render: (s) => <Mono muted>{s.effectiveFrom || s.effectiveTo ? `${s.effectiveFrom ?? '…'} → ${s.effectiveTo ?? '…'}` : 'always'}</Mono> },
  ];
  const weekMinutes = list.reduce((t, s) => t + s.minutes * s.weekdays.length, 0);

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      <SectionCard flush title="Shifts" subtitle={`When ${machine.code} works, week by week. A night shift belongs to the day it starts.${list.length ? ` About ${hoursText(weekMinutes)} a week.` : ''}`}
        actions={canManage && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button startIcon={<ContentCopyRounded />} onClick={() => setCopying(true)}>Copy from…</Button>
            <Button startIcon={<AddRounded />} onClick={() => setEditing({ open: true, shift: null })}>Add shift</Button>
          </Box>
        )}>
        {shifts.error && <Box sx={{ p: 2 }}><ErrorNotice error={shifts.error} onRetry={shifts.reload} /></Box>}
        <DataTable bare rows={list} columns={columns} getRowId={(s) => s.id} loading={shifts.loading && !shifts.data}
          empty={<Typography sx={{ color: 'var(--c-text-3)', p: 2 }}>No shifts yet — until it has some, nothing can be planned on it.</Typography>}
          rowActions={canManage ? (s) => (
            <>
              <Tooltip title="Edit"><IconButton size="small" aria-label={`Edit ${s.name}`} onClick={() => setEditing({ open: true, shift: s })}><EditRounded fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Delete"><IconButton size="small" aria-label={`Delete ${s.name}`} onClick={() => setRemoving(s)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
            </>
          ) : undefined} />
      </SectionCard>

      <SectionCard title="The next two weeks" subtitle={`As it will run, day exceptions included${cal.data ? ` — ${hoursText(cal.data.minutes)} in all` : ''}. The line marks midnight; a night shift runs on past it.`}>
        <ErrorNotice error={cal.error} onRetry={cal.reload} />
        {cal.loading && !cal.data ? <SkeletonRows rows={4} height={24} /> : (cal.data?.days ?? []).map((d) => <DayTrack key={d.date} day={d} />)}
      </SectionCard>

      <SectionCard title="Day exceptions" subtitle="Holidays, breakdowns, a shift off, overtime — each changes one day."
        actions={canManage && <Button startIcon={<EventBusyRounded />} onClick={() => setAdding(true)}>Change a day</Button>}>
        <ErrorNotice error={exc.error} onRetry={exc.reload} />
        {(exc.data ?? []).length === 0 ? <Typography sx={{ color: 'var(--c-text-3)', fontSize: 13 }}>None.</Typography> : (
          <EntityList>
            {(exc.data ?? []).map((e) => (
              <EntityRow key={e.id} code={<Mono chip>{e.date}</Mono>}
                primary={<Box component="span" sx={{ color: e.kind === 'extra' ? 'var(--c-success-800)' : 'var(--c-warning-800)' }}>{e.text}</Box>}
                secondary={e.reason ?? undefined}
                actions={canManage && (
                  <Tooltip title="Remove">
                    <IconButton size="small" aria-label={`Remove the exception on ${e.date}`}
                      onClick={async () => { await cfApi.del(`/machine-exceptions/${e.id}`); toast.success('Removed.'); refresh(); }}><DeleteOutlineRounded fontSize="small" /></IconButton>
                  </Tooltip>
                )} />
            ))}
          </EntityList>
        )}
      </SectionCard>

      <ShiftDialog open={editing.open} machineId={machine.id} existing={editing.shift} onClose={() => setEditing({ open: false, shift: null })} onSaved={() => { toast.success('Shift saved.'); refresh(); }} />
      <CopyShiftsDialog open={copying} machine={machine} current={list.length} onClose={() => setCopying(false)} onSaved={() => { toast.success('Shifts copied.'); refresh(); }} />
      <ExceptionDialog open={adding} machineId={machine.id} shifts={list} onClose={() => setAdding(false)} onSaved={() => { toast.success('Day changed.'); refresh(); }} />
      <ConfirmDialog open={!!removing} danger confirmLabel="Delete shift" title="Delete this shift?" entityName={removing ? `${removing.name} · ${daysText(removing.weekdays)} ${removing.startTime}–${removing.endTime}` : undefined}
        body="Day exceptions that name it go with it." onClose={() => setRemoving(null)}
        onConfirm={async () => { await cfApi.del(`/machine-shifts/${removing?.id}`); toast.success('Shift deleted.'); refresh(); }} />
    </Box>
  );
}
