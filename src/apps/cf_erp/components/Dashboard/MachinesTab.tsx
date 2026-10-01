/**
 * Dashboard › By machine. The plant first (utilisation, where the time went,
 * what came out), then "Where the shift time went" (ShiftTime.tsx: area › type ›
 * machine, each a 100 % bar of its shift), then one card per machine, worst first,
 * and a side sheet with a machine's days and its stop reasons.
 *
 * The cards stay (not folded into the drill-down): the table answers "where did the
 * time go"; a card answers "what is this machine doing now and what did it make" —
 * status, output, tonnes, pace — which a row of bars has no room for. Both use the
 * same buckets and colours (TimeBar), so a card's bar is the row's bar.
 *
 * Utilisation = run time inside the shifts ÷ shift time so far (breaks of the
 * shift pattern already off it). It is the one number a plant owner asks for,
 * and it is only as good as the log — so "not recorded" sits right beside it.
 */
import { useMemo, useState } from 'react';
import { Box, Button, Chip, Drawer, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import CloseRounded from '@mui/icons-material/CloseRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import type { DashMachine, MachinesDashboard } from '../../api/dashboard';
import {
  MACHINE_SORTS, MACHINE_STATE, type MachineSort, filterMachines, hoursText, machineNowText, pctText, periodLabel, shiftShares,
  sortMachines, tonnesText, utilisationTone, dateLabel, nothingLogged, bucketStyles, type BucketStyle,
} from '../../lib/dashboard';
import { useCompanySlug } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { EmptyState, Mono, SectionCard, Surface } from '../ui';
import { DailyBars, Legend, Pareto, ShareBar, Sparkline } from './charts';
import { Dot, EstimateTag, Tile, TileGrid } from './DashParts';
import { ShiftTimeTable, TimeBar } from './ShiftTime';
import { DownloadMenu } from './DownloadMenu';
import { machinesTables } from '../../lib/dashboardExport';

const SEG = {
  run: { color: 'var(--c-state-running)', label: 'Running in shift' },
  stop: { color: 'var(--c-state-down)', label: 'Stopped' },
  gap: { color: 'var(--c-text-3)', label: 'Not recorded', hatch: true },
  other: { color: 'var(--c-surface-3)', label: 'Break / rest of the shift' },
};

export function MachinesTab({ data, atRisk }: { data: MachinesDashboard; atRisk?: { late: number; atRisk: number } | null }) {
  const [typeId, setTypeId] = useState<number | null>(null);
  const [sort, setSort] = useState<MachineSort>('utilisation');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<DashMachine | null>(null);
  const p = data.plant;
  const shown = useMemo(() => sortMachines(filterMachines(data.machines, typeId, search), sort), [data.machines, typeId, search, sort]);
  const plantShares = shiftShares({ shiftMin: p.shiftMin, runInShiftMin: p.runInShiftMin, stopInShiftMin: data.machines.reduce((t, m) => t + m.stopInShiftMin, 0), notRecordedMin: p.notRecordedMin });
  const window = periodLabel(data.period.from, data.period.to);
  const plantBlank = nothingLogged(p);
  const styles = useMemo(() => bucketStyles(data.time?.reasons ?? []), [data.time]);

  if (!data.machines.length) {
    return <EmptyState title="No active machines" hint="Add machines and their shifts under Production › Machines; their work shows here once the machine log is used." />;
  }

  return (
    <Box data-testid="machines-tab">
      <TileGrid>
        <Tile testId="tile-utilisation" label="Utilisation" tone={p.utilisationPct == null || plantBlank ? 'default' : utilisationTone(p.utilisationPct) === 'success' ? 'success' : utilisationTone(p.utilisationPct) === 'warning' ? 'warning' : 'danger'}
          value={plantBlank ? '—' : pctText(p.utilisationPct)}
          hint="Run time inside the shifts ÷ shift time so far, all machines. Breaks in the shift pattern are already taken off the shift time."
          sub={plantBlank ? 'Nothing in the machine log for this period yet' : <>{hoursText(p.runInShiftMin)} run of {hoursText(p.shiftMin)} shift</>}>
          {data.time && data.time.plant.shiftMinutes > 0 && <Box sx={{ mt: 0.75 }}><TimeBar label="Plant shift time" shiftMinutes={data.time.plant.shiftMinutes} buckets={data.time.plant.buckets} styles={styles} height={10} /></Box>}
          {!data.time && plantShares && <Box sx={{ mt: 0.75 }}><ShareBar label="Plant shift time" segments={[
            { key: 'run', value: plantShares.run, ...SEG.run }, { key: 'stop', value: plantShares.stop, ...SEG.stop },
            { key: 'gap', value: plantShares.gap, ...SEG.gap }, { key: 'other', value: plantShares.other, ...SEG.other },
          ]} /></Box>}
        </Tile>
        <Tile testId="tile-run" label="Machine hours run" value={hoursText(p.runMin)}
          sub={<>{p.overtimeMin > 0 ? <Box component="span" sx={{ color: 'var(--c-warning-800)' }}>{hoursText(p.overtimeMin)} overtime</Box> : 'No overtime'}
            {p.performancePct != null && <> · pace {pctText(p.performancePct)} of standard</>}</>}
          hint="All machines, all run time in the period. Overtime = run outside the shifts. Pace = standard minutes of the good pieces (from the time estimates) ÷ run time." />
        <Tile testId="tile-stops" label="Stopped" tone={p.stopMin > 0 ? 'danger' : 'default'} value={hoursText(p.stopMin)}
          sub={p.topReasons.length ? p.topReasons.slice(0, 3).map((r) => `${r.label} ${hoursText(r.minutes)}`).join(' · ') : 'No stops recorded'} />
        <Tile testId="tile-recorded" label="Shift time not recorded" tone={p.recordedPct != null && p.recordedPct < 80 ? 'warning' : 'default'}
          value={hoursText(p.notRecordedMin)}
          sub={p.recordedPct == null ? 'No shifts set up' : `${pctText(p.recordedPct)} of shift time is logged`}
          hint="Shift time with neither work nor a stop in the machine log. Until the log is filled, utilisation reads low — this is how much to trust it." />
        <Tile testId="tile-output" label="Tonnes finished" value={tonnesText(p.tonnesFinished, '—')}
          sub={<>{tonnesText(p.tonnesDispatched, '—')} dispatched · {tonnesText(p.tonnesHandled, '—')} through machines</>}
          hint="Finished = a line's own piece put into finished stock in the period; dispatched = shipped out of the dispatch area. Through machines counts a piece once at every machine it passes (handled, not made)." />
        <Tile testId="tile-now" label="Machines now" value={`${p.runningNow} / ${p.machines}`}
          sub={<>running · {p.stoppedNow > 0 ? <Box component="span" sx={{ color: 'var(--c-danger-800)' }}>{p.stoppedNow} stopped</Box> : '0 stopped'} · {p.idleInShiftNow > 0 ? <Box component="span" sx={{ color: 'var(--c-warning-800)' }}>{p.idleInShiftNow} idle in shift</Box> : '0 idle'}{atRisk && (atRisk.late + atRisk.atRisk) > 0 ? ` · ${atRisk.late + atRisk.atRisk} orders late or at risk` : ''}</>} />
      </TileGrid>

      <ShiftTimeTable data={data} onOpenMachine={setOpen} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 1.5, mb: 2.5 }}>
        <SectionCard title="Where the time went, day by day" subtitle={`All machines · ${window}`}
          action={<Legend items={[{ color: 'var(--c-state-running)', label: 'Run in shift' }, { color: 'var(--c-chart-3)', label: 'Overtime' }, { color: 'var(--c-state-down)', label: 'Stopped' }, { color: 'var(--c-text-3)', label: 'Shift time', line: true }]} />}>
          <DailyBars days={p.days} />
        </SectionCard>
        <SectionCard title="Why machines stopped" subtitle={`Stop time by reason · ${window}`}>
          <Pareto rows={p.topReasons.map((r) => ({ key: r.id, label: r.label, value: r.minutes, note: `${r.count}×` }))} />
        </SectionCard>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        <Chip label="All types" size="small" color={typeId == null ? 'primary' : 'default'} variant={typeId == null ? 'filled' : 'outlined'} onClick={() => setTypeId(null)} />
        {data.types.map((t) => (
          <Chip key={t.id} label={t.name} size="small" color={typeId === t.id ? 'primary' : 'default'} variant={typeId === t.id ? 'filled' : 'outlined'} onClick={() => setTypeId(typeId === t.id ? null : t.id)} />
        ))}
        <Box sx={{ flex: 1 }} />
        <TextField size="small" placeholder="Find a machine" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ width: 180 }} inputProps={{ 'aria-label': 'Find a machine' }} />
        <TextField select size="small" value={sort} onChange={(e) => setSort(e.target.value as MachineSort)} sx={{ width: 190 }} inputProps={{ 'aria-label': 'Sort machines' }}>
          {MACHINE_SORTS.map((s) => <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>)}
        </TextField>
        <DownloadMenu tab="machines" from={data.period.from} to={data.period.to} tables={() => machinesTables(data, shown)} />
      </Box>

      {shown.length === 0
        ? <EmptyState title="No machine matches" hint="Clear the type filter or the search." />
        : (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 1.5 }}>
            {shown.map((m) => <MachineCard key={m.id} m={m} now={data.period.now} styles={styles} onOpen={() => setOpen(m)} />)}
          </Box>
        )}
      {!data.time && <Legend items={[{ ...SEG.run }, { ...SEG.stop }, { ...SEG.gap }, { color: 'var(--c-surface-3)', label: 'Break / not yet' }]} />}
      <MachineSheet m={open} period={window} now={data.period.now} styles={styles} onClose={() => setOpen(null)} />
    </Box>
  );
}

function MachineCard({ m, now, onOpen, styles }: { m: DashMachine; now: string; onOpen: () => void; styles: Record<string, BucketStyle> }) {
  const st = MACHINE_STATE[m.now.state];
  const shares = shiftShares(m);
  const blank = nothingLogged(m);
  const tone = blank ? 'neutral' : utilisationTone(m.utilisationPct);
  const utilColor = tone === 'neutral' ? 'var(--c-text-3)' : `var(--c-${tone}-600)`;
  return (
    <Surface e={1} data-testid="machine-card" data-machine={m.code} onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      sx={{ p: 1.75, display: 'flex', flexDirection: 'column', gap: 1, cursor: 'pointer', transition: 'box-shadow var(--t-fast) var(--ease)', '&:hover': { boxShadow: 'var(--e-2)' }, '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 2 } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ pt: 0.6 }}><Dot color={st.color} pulse={m.now.state === 'running'} label={st.label} /></Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }}>
            <Mono sx={{ fontWeight: 600, color: 'var(--c-text)' }}>{m.code}</Mono>
            <Typography noWrap sx={{ fontSize: 13, color: 'var(--c-text-2)', minWidth: 0 }}>{m.name}</Typography>
          </Box>
          <Typography noWrap sx={{ fontSize: 12, color: m.now.state === 'stopped' ? 'var(--c-danger-800)' : m.now.state === 'idle' ? 'var(--c-warning-800)' : 'var(--c-text-3)' }} title={machineNowText(m, now)}>
            {st.label} · {machineNowText(m, now)}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography data-testid="machine-util" sx={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, lineHeight: 1, color: utilColor }}>{m.hasShifts && !blank ? pctText(m.utilisationPct) : '—'}</Typography>
          <Typography sx={{ fontSize: 10, color: 'var(--c-text-3)' }}>{!m.hasShifts ? 'no shifts' : blank ? 'nothing logged' : 'utilisation'}</Typography>
        </Box>
      </Box>
      {m.time && !m.time.noShift ? (
        <TimeBar label={`${m.code} shift time`} shiftMinutes={m.time.shiftMinutes} buckets={m.time.buckets} styles={styles} height={10} />
      ) : shares ? (
        <ShareBar label={`${m.code} shift time`} segments={[
          { key: 'run', value: shares.run, ...SEG.run }, { key: 'stop', value: shares.stop, ...SEG.stop },
          { key: 'gap', value: shares.gap, ...SEG.gap }, { key: 'other', value: shares.other, ...SEG.other },
        ]} />
      ) : <Box sx={{ height: 10, borderRadius: 99, background: 'var(--c-surface-2)', border: '1px dashed var(--c-border)' }} title="No shifts: utilisation cannot be worked out" />}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, fontSize: 12 }}>
        <Fig label="Run" value={hoursText(m.runMin)} note={m.overtimeMin ? `${hoursText(m.overtimeMin)} OT` : undefined} warn={!!m.overtimeMin} />
        <Fig label="Stopped" value={hoursText(m.stopMin)} danger={m.stopMin > 0} />
        <Fig label="Not recorded" value={hoursText(m.notRecordedMin)} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', minWidth: 0 }}>
          <Box>{m.output.operationsDone} ops done · {m.output.piecesGood} pcs{m.output.piecesScrap ? ` (+${m.output.piecesScrap} scrap)` : ''}</Box>
          <Box>{m.output.tonnes == null
            ? `${m.output.unweighedSessions} job${m.output.unweighedSessions === 1 ? '' : 's'} not weighed`
            : `${tonnesText(m.output.tonnes)}${m.output.unweighedSessions ? ` + ${m.output.unweighedSessions} not weighed` : ''}`}</Box>
        </Box>
        <Sparkline label={`${m.code} utilisation per day`} values={m.days.map((d) => (d.shift ? (d.runIn / d.shift) * 100 : null))} max={100} />
      </Box>
      {m.reasons.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {m.reasons.slice(0, 2).map((r) => (
            <Box key={r.id} component="span" sx={{ fontSize: 11, background: 'var(--c-danger-50)', color: 'var(--c-danger-800)', borderRadius: 'var(--r-sm)', px: 0.75, py: 0.2 }}>
              {r.label} {hoursText(r.minutes)}
            </Box>
          ))}
        </Box>
      )}
    </Surface>
  );
}

function Fig({ label, value, note, warn, danger }: { label: string; value: string; note?: string; warn?: boolean; danger?: boolean }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ fontSize: 10, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</Box>
      <Box sx={{ fontFamily: 'var(--font-mono)', color: danger ? 'var(--c-danger-800)' : 'var(--c-text)' }}>{value}</Box>
      {note && <Box sx={{ fontSize: 11, color: warn ? 'var(--c-warning-800)' : 'var(--c-text-3)' }}>{note}</Box>}
    </Box>
  );
}

/** One machine over the period: its days, why it stopped, who ran it. */
function MachineSheet({ m, period, now, onClose, styles }: { m: DashMachine | null; period: string; now: string; onClose: () => void; styles: Record<string, BucketStyle> }) {
  const company = useCompanySlug();
  return (
    <Drawer anchor="right" open={!!m} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, background: 'var(--c-canvas)' } }}>
      {m && (
        <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }} data-testid="machine-sheet">
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600 }}><Mono sx={{ fontSize: 16 }}>{m.code}</Mono> {m.name}</Typography>
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{m.type?.name ?? 'No type'} · {period}</Typography>
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Dot color={MACHINE_STATE[m.now.state].color} label={MACHINE_STATE[m.now.state].label} /> {MACHINE_STATE[m.now.state].label} · {machineNowText(m, now)}
              </Typography>
            </Box>
            <IconButton aria-label="Close" onClick={onClose}><CloseRounded /></IconButton>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
            <Tile label="Utilisation" value={m.hasShifts ? pctText(m.utilisationPct) : '—'} sub={m.hasShifts ? `${hoursText(m.runInShiftMin)} of ${hoursText(m.shiftMin)} shift` : 'No shifts set up'} />
            <Tile label="Overtime" value={m.overtimeMin == null ? '—' : hoursText(m.overtimeMin)} sub={`${hoursText(m.runMin)} run in all`} />
            <Tile label="Output" value={tonnesText(m.output.tonnes, '—')} sub={`${m.output.operationsDone} operations done · ${m.output.piecesGood} good pieces · ${m.output.stepsWorked} jobs worked`} />
            <Tile label="Pace vs standard" value={pctText(m.standard.performancePct)}
              sub={<>{hoursText(m.standard.earnedMin)} standard in {hoursText(m.runMin)} run{m.standard.coveragePct != null && m.standard.coveragePct < 100 ? ` · ${pctText(m.standard.coveragePct)} of jobs have a time` : ''}</>}
              estimate />
          </Box>
          {m.time && !m.time.noShift && (
            <SectionCard title="Where its shift time went" subtitle={`100 % = ${hoursText(m.time.shiftMinutes)} of shift${m.time.overtimeMinutes ? ` · plus ${hoursText(m.time.overtimeMinutes)} overtime` : ''}`}>
              <Box data-testid="sheet-time">
                <TimeBar label={`${m.code} shift time`} shiftMinutes={m.time.shiftMinutes} buckets={m.time.buckets} styles={styles} />
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto auto', columnGap: 1.5, rowGap: 0.4, mt: 1, fontSize: 12 }}>
                  {m.time.buckets.filter((b) => b.minutes > 0).map((b) => (
                    <Box key={b.key} sx={{ display: 'contents' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '3px', flexShrink: 0, background: styles[b.key]?.hatch ? `repeating-linear-gradient(135deg, ${styles[b.key].color} 0 2px, transparent 2px 4px)` : (styles[b.key]?.color ?? 'var(--c-text-3)') }} />
                        <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label}{b.stops ? ` · ${b.stops}×` : ''}</Box>
                      </Box>
                      <Box sx={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{hoursText(b.minutes)}</Box>
                      <Box sx={{ fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--c-text-2)' }}>{pctText((b.minutes / m.time!.shiftMinutes) * 100)}</Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            </SectionCard>
          )}
          <SectionCard title="Day by day" subtitle="Run in shift, overtime and stopped, against the shift">
            {m.days.length > 1 ? <DailyBars days={m.days} height={100} /> : (
              <Box sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                {dateLabel(m.days[0]?.date)}: shift {hoursText(m.days[0]?.shift)}, run {hoursText(m.days[0]?.run)}, stopped {hoursText(m.days[0]?.stop)}
              </Box>
            )}
          </SectionCard>
          <SectionCard title="Why it stopped" subtitle="Stop time by reason">
            <Pareto rows={m.reasons.map((r) => ({ key: r.id, label: r.label, value: r.minutes, note: `${r.count}×` }))} max={8} />
          </SectionCard>
          {m.operators.length > 0 && (
            <SectionCard title="Who ran it" subtitle="Machine time on their jobs (jobs run together count for each)">
              <Pareto rows={m.operators.map((o) => ({ key: o.id, label: o.name, value: o.minutes }))} color="var(--c-chart-1)" />
            </SectionCard>
          )}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button component={Link} to={appPath(company, `machines/${m.id}`)} variant="outlined" size="small" endIcon={<OpenInNewRounded />}>Machine and shifts</Button>
            <Tooltip title="Where each day's work and stops are entered (needs the machine log permission)">
              <Button component={Link} to={appPath(company, 'floor')} variant="text" size="small">Machine log</Button>
            </Tooltip>
            {m.standard.performancePct != null && <EstimateTag title="Standard minutes come from the time estimates copied onto each step at release." />}
          </Box>
        </Box>
      )}
    </Drawer>
  );
}
