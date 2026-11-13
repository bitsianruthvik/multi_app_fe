import { useEffect, useMemo, useState } from 'react';
import { Box, Button, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import AutoFixHighRounded from '@mui/icons-material/AutoFixHighRounded';
import CampaignRounded from '@mui/icons-material/CampaignRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { getDayRoster, getPublishedRoster, saveDayRoster, dayText, type DayScreen, type RosterMachine, type RosterTask } from '../../api/planning';
import { CfApiError } from '../../api/client';
import { useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { useUrlParam } from '../../hooks/useUrlState';
import { EmptyState, ErrorNotice, InfoTip, ListSkeleton, Mono, PageHeader, StatStrip } from '../../components/ui';
import { PlanStatus } from '../../components/Planning/parts';
import { useToast } from '../../components/toastContext';

const hrs = (m: number) => Math.round((m / 60) * 10) / 10;

function Card({ t, editable, onDrag, onMinutes, onRemove }: { t: RosterTask; editable: boolean; onDrag: () => void; onMinutes: (m: number) => void; onRemove: () => void }) {
  return (
    <Box draggable={editable} onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDrag(); }} data-testid="roster-task"
      sx={{ border: '1px solid var(--c-border)', borderLeft: `3px solid ${t.source === 'manual' ? 'var(--c-warning-500)' : 'var(--c-primary-500)'}`, borderRadius: 'var(--r-sm)', p: '6px 8px', background: 'var(--c-surface, #fff)', cursor: editable ? 'grab' : 'default', display: 'grid', gap: 0.25 }}>
      <Typography noWrap sx={{ fontSize: 13, fontWeight: 600 }}><Mono>{t.unit}</Mono></Typography>
      <Typography noWrap sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{t.order ?? ''}{t.fnName ? ` · ${t.fnName}` : ''}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {editable ? (
          <TextField size="small" value={hrs(t.minutes)} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0) onMinutes(Math.round(n * 60)); }}
            inputProps={{ inputMode: 'decimal', 'aria-label': `Hours for ${t.unit}`, style: { padding: '2px 6px', width: 44, fontSize: 12.5 } }} />
        ) : <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{hrs(t.minutes)}</Typography>}
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', flex: 1 }}>h{t.finish ? ` · unit due ${dayText(t.finish)}` : ''}</Typography>
        {editable && <Tooltip title="Take off the roster"><IconButton size="small" aria-label={`Remove ${t.unit}`} onClick={onRemove}><DeleteOutlineRounded sx={{ fontSize: 16 }} /></IconButton></Tooltip>}
      </Box>
    </Box>
  );
}

/**
 * PLANNING › DAILY ROSTER (§105): tomorrow's work, suggested from today's reality and the week plan — one column per
 * machine, grouped by area. Drag a task to another machine, change its hours, take it off; publish and production
 * works to it (Production › Roster).
 */
export default function DailyRoster() {
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_production_manage');
  const [dateParam, setDateParam] = useUrlParam('date', '');
  const screen = useLoad(() => getDayRoster(dateParam || undefined), [dateParam]);
  const [tasks, setTasks] = useState<RosterTask[]>([]);
  const [machines, setMachines] = useState<RosterMachine[]>([]);
  const [dirty, setDirty] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<number | 'none' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const s = screen.data;
  const adopt = (d: DayScreen, isDirty: boolean) => { setTasks(d.tasks); setMachines(d.machines); setDirty(isDirty); };
  useEffect(() => { if (s) adopt(s, !s.saved); }, [s]);
  const byMachine = useMemo(() => {
    const m = new Map<number | 'none', RosterTask[]>();
    for (const t of tasks) { const k = t.machineId ?? 'none'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(t); }
    return m;
  }, [tasks]);
  if (screen.error) return <ErrorNotice error={screen.error} onRetry={screen.reload} />;
  if (!s) return <ListSkeleton rows={8} />;
  const editable = canManage;
  const areas = [...new Set(machines.map((m) => m.area))];
  // Machines with work or hours that day; idle ones with no shift are left out of the board.
  const shown = machines.filter((m) => (byMachine.get(m.id)?.length ?? 0) > 0 || m.minutes > 0);
  const drop = (machineId: number | null) => {
    if (!dragId) return;
    setTasks((ts) => ts.map((t) => (t.id === dragId ? { ...t, machineId, source: 'manual' as const } : t)));
    setDirty(true); setDragId(null); setOver(null);
  };
  const save = async (publish: boolean) => {
    setBusy(publish ? 'publish' : 'save'); setError(null);
    try { const d = await saveDayRoster({ date: s.day, tasks, machines, publish }); screen.setData(d); adopt(d, false); toast.success(publish ? 'Published — production sees it under Production › Roster.' : 'Roster saved.'); }
    catch (e) { setError(e as CfApiError); } finally { setBusy(null); }
  };
  const suggest = async () => {
    setBusy('suggest'); setError(null);
    try { const d = await getDayRoster(s.day, true); adopt(d, true); toast.info('Suggested again from now. Save to keep it.'); } catch (e) { setError(e as CfApiError); } finally { setBusy(null); }
  };
  const total = tasks.reduce((t, x) => t + x.minutes, 0);
  const column = (key: number | 'none', title: React.ReactNode, sub: string, list: RosterTask[], cap: number | null) => {
    const used = list.reduce((t, x) => t + x.minutes, 0);
    const overCap = cap != null && used > cap + 1;
    return (
      <Box key={String(key)} onDragOver={(e) => { if (editable) { e.preventDefault(); setOver(key); } }} onDragLeave={() => setOver((o) => (o === key ? null : o))} onDrop={() => drop(key === 'none' ? null : key)}
        data-testid="roster-column" sx={{ width: 232, flex: '0 0 232px', display: 'grid', gridTemplateRows: 'auto 1fr', gap: 0.75, p: 1, borderRadius: 'var(--r-md)', background: over === key ? 'var(--c-primary-50)' : 'var(--c-surface-2, #f8fafc)', border: `1px solid ${over === key ? 'var(--c-primary-300)' : 'var(--c-border)'}`, minHeight: 140 }}>
        <Box>
          <Typography noWrap sx={{ fontSize: 13, fontWeight: 600 }}>{title}</Typography>
          <Typography noWrap sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{sub}</Typography>
          <Typography sx={{ fontSize: 12, color: overCap ? 'var(--c-danger-700)' : 'var(--c-text-2)', fontVariantNumeric: 'tabular-nums' }}>{hrs(used)}{cap != null ? ` of ${hrs(cap)}` : ''} h{overCap ? ' — more than its shift' : ''}</Typography>
        </Box>
        <Box sx={{ display: 'grid', gap: 0.75, alignContent: 'start' }}>
          {list.map((t) => <Card key={t.id} t={t} editable={editable} onDrag={() => setDragId(t.id)}
            onMinutes={(m) => { setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, minutes: m, source: 'manual' as const } : x))); setDirty(true); }}
            onRemove={() => { setTasks((ts) => ts.filter((x) => x.id !== t.id)); setDirty(true); }} />)}
        </Box>
      </Box>
    );
  };
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      <PageHeader title={<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>Roster · {dayText(s.day)} <PlanStatus status={dirty && s.status !== null ? 'draft' : s.status} />
        <InfoTip text="Suggested from today's reality and this week's plan: what is done, the machines as they are, the material that is in. Each task is a shipping unit's work on one operation, put on a machine of that type. Drag a task to another machine, change its hours or take it off; orange edges are your changes. Publish — production works to it." /></Box>}
        subtitle={s.status === 'published' && !dirty ? 'Published — production sees this roster.' : s.saved && !dirty ? 'Saved, not published yet.' : 'A suggestion — arrange it, save, and publish to production.'}
        actions={(
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField size="small" type="date" value={s.day} onChange={(e) => setDateParam(e.target.value)} inputProps={{ 'aria-label': 'Day' }} />
            {editable && <Button variant="outlined" startIcon={<AutoFixHighRounded />} disabled={!!busy} onClick={() => void suggest()} data-testid="roster-suggest">{busy === 'suggest' ? 'Suggesting…' : 'Suggest again'}</Button>}
            {editable && <Button variant="outlined" disabled={!!busy || !dirty} onClick={() => void save(false)} data-testid="roster-save">Save</Button>}
            {editable && <Button variant="contained" startIcon={<CampaignRounded />} disabled={!!busy || (!dirty && s.status === 'published')} onClick={() => void save(true)} data-testid="roster-publish">Publish to production</Button>}
          </Box>
        )} />
      <ErrorNotice error={error} />
      <StatStrip stats={[
        { label: 'Tasks', value: tasks.length },
        { label: 'Hours', value: Math.round(total / 60) },
        { label: 'Machines working', value: [...byMachine.keys()].filter((k) => k !== 'none').length },
        { label: 'No machine yet', value: byMachine.get('none')?.length ?? 0, tone: (byMachine.get('none')?.length ?? 0) ? 'warning' as const : undefined },
      ]} />
      {!tasks.length && !shown.length ? <EmptyState title="Nothing to roster for this day" hint="No work of the plan falls on it — or the week has no plan yet." /> : (
        <Box sx={{ display: 'grid', gap: 2 }} data-testid="roster-board">
          {(byMachine.get('none')?.length ?? 0) > 0 && (
            <Box><Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-2)', mb: 0.75 }}>No machine of the type in the plan</Typography>
              <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1 }}>{column('none', 'To place', 'Drag to a machine', byMachine.get('none') ?? [], null)}</Box></Box>
          )}
          {areas.map((area) => {
            const ms = shown.filter((m) => m.area === area);
            if (!ms.length) return null;
            return (
              <Box key={area}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-2)', mb: 0.75 }}>{area}</Typography>
                <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1 }}>
                  {ms.map((m) => column(m.id, <><Mono>{m.code}</Mono> {m.name}</>, `${m.typeName}${m.contractor ? ` · with ${m.contractor.name}` : ''}`, byMachine.get(m.id) ?? [], m.minutes))}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

/**
 * PRODUCTION › ROSTER (§105): what the planning team published for a day — per machine, the units to work on and for
 * how long. Read-only: "Let the daily plan be the output which the production team gets."
 */
export function ProductionRoster() {
  const [dateParam, setDateParam] = useUrlParam('date', '');
  const r = useLoad(() => getPublishedRoster(dateParam || undefined), [dateParam]);
  const d = r.data;
  if (r.error) return <ErrorNotice error={r.error} onRetry={r.reload} />;
  if (!d) return <ListSkeleton rows={6} />;
  const by = new Map<number | 'none', RosterTask[]>();
  for (const t of d.tasks) { const k = t.machineId ?? 'none'; if (!by.has(k)) by.set(k, []); by.get(k)!.push(t); }
  const ms = d.machines.filter((m) => by.has(m.id));
  const areas = [...new Set(ms.map((m) => m.area))];
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      <PageHeader title={`Roster · ${dayText(d.day)}`} subtitle={d.published ? `Published by Planning${d.publishedAt ? ` · ${String(d.publishedAt).slice(11, 16)}` : ''}. Work each machine's list from the top.` : 'Planning has not published a roster for this day yet.'}
        actions={<TextField size="small" type="date" value={d.day} onChange={(e) => setDateParam(e.target.value)} inputProps={{ 'aria-label': 'Day' }} />} />
      {!d.published ? <EmptyState title="No roster published for this day" hint="Planning publishes each day's roster from Planning › Daily roster." /> : (
        <Box sx={{ display: 'grid', gap: 2 }} data-testid="production-roster">
          {areas.map((area) => (
            <Box key={area}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-2)', mb: 0.75 }}>{area}</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 1.25 }}>
                {ms.filter((m) => m.area === area).map((m) => (
                  <Box key={m.id} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', p: 1.25, background: 'var(--c-surface, #fff)' }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}><Mono>{m.code}</Mono> {m.name}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 0.75 }}>{m.typeName} · {hrs((by.get(m.id) ?? []).reduce((t, x) => t + x.minutes, 0))} h</Typography>
                    {(by.get(m.id) ?? []).map((t, i) => (
                      <Box key={t.id} sx={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) auto', gap: 0.75, py: 0.5, borderTop: '1px solid var(--c-divider)', fontSize: 13 }}>
                        <Box sx={{ color: 'var(--c-text-3)' }}>{i + 1}</Box>
                        <Box sx={{ minWidth: 0 }}><Typography noWrap sx={{ fontSize: 13, fontWeight: 500 }}>{t.unit}</Typography><Typography noWrap sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{t.order}{t.note ? ` · ${t.note}` : ''}</Typography></Box>
                        <Box sx={{ fontVariantNumeric: 'tabular-nums' }}>{hrs(t.minutes)} h</Box>
                      </Box>
                    ))}
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
