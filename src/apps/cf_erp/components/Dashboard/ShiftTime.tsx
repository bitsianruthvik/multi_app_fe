/**
 * Dashboard › By machine › "Where the shift time went". Every machine's shift time
 * cut into buckets that add up to exactly 100 % (dashboardService.accountShiftTime):
 * Running, each stop reason (planned / unplanned), the shift pattern's Break, and Not
 * recorded. Overtime (work outside the shift) sits beside the bar, never inside it.
 *
 * The hierarchy is the type tree: AREA (the planner's grouping, lib/planner/areas.ts) ›
 * machine TYPE › MACHINE. A type row opens to its machines on double-click, on Enter, or
 * with its chevron (touch / keyboard — double-click alone is not discoverable); a machine
 * row opens the machine sheet the same ways. A legend lists every reason with its hours and
 * share; clicking one highlights it on every bar.
 */
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Box, Button, ButtonBase, IconButton, Tooltip, Typography } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded';
import type { DashMachine, MachinesDashboard, TimeBucket } from '../../api/dashboard';
import { MACHINE_STATE, type BucketStyle, bucketStyles, hoursText, pctText, styleOf, timeAreas, topBucketsText } from '../../lib/dashboard';
import { Mono, SectionCard } from '../ui';
import { Dot } from './DashParts';

const GRID = { xs: '32px minmax(0, 1fr) 56px 64px', md: '32px minmax(150px, 230px) minmax(0, 1fr) 76px 80px' };
const fill = (s: BucketStyle) => (s.hatch ? `repeating-linear-gradient(135deg, ${s.color} 0 3px, transparent 3px 6px)` : s.color);

/** A full-width bar of 100 % of the shift, one segment per bucket, each with its own hover. */
export function TimeBar({ shiftMinutes, buckets, styles, highlight = null, label, height = 14 }: {
  shiftMinutes: number; buckets: TimeBucket[]; styles: Record<string, BucketStyle>; highlight?: string | null; label: string; height?: number;
}) {
  if (!shiftMinutes) {
    return <Box sx={{ height, borderRadius: 99, background: 'var(--c-surface-2)', border: '1px dashed var(--c-border)' }} title="No shift time in the period" data-testid="time-bar-empty" />;
  }
  return (
    <Box role="img" aria-label={`${label}: ${topBucketsText({ shiftMinutes, buckets }, 6)}`} data-testid="time-bar"
      sx={{ display: 'flex', height, borderRadius: 99, overflow: 'hidden', background: 'var(--c-surface-3)', width: '100%' }}>
      {buckets.filter((b) => b.minutes > 0).map((b) => {
        const st = styleOf(styles, b);
        const pct = (b.minutes / shiftMinutes) * 100;
        const dim = highlight != null && highlight !== b.key;
        return (
          <Tooltip key={b.key} disableInteractive title={(
            <Box>
              <Box sx={{ fontWeight: 600 }}>{b.label}</Box>
              <Box>{hoursText(b.minutes)} · {pct < 1 && pct > 0 ? '<1%' : pctText(pct)} of the shift</Box>
              {b.stops != null && <Box>{b.stops} stop{b.stops === 1 ? '' : 's'} · {b.kind === 'planned' ? 'planned' : 'unplanned'}</Box>}
              {b.kind === 'break' && <Box>The shift pattern's break, taken from time nothing was logged</Box>}
              {b.kind === 'unrecorded' && <Box>Shift time with neither work nor a stop in the log</Box>}
            </Box>
          )}>
            <Box data-seg={b.key} data-pct={pct.toFixed(2)} data-dim={dim ? 1 : 0} sx={{
              width: `${pct}%`, background: fill(st), opacity: dim ? 0.18 : 1, minWidth: 0,
              transition: 'opacity var(--t-fast, .15s) var(--ease, ease), width var(--t-base, .2s) var(--ease, ease)',
            }} />
          </Tooltip>
        );
      })}
    </Box>
  );
}

/** Under the bar: the highlighted bucket, or the three biggest. */
function caption(t: { shiftMinutes: number; buckets: TimeBucket[] }, hl: string | null, label: string | undefined) {
  if (!t.shiftMinutes) return '';
  if (hl) {
    const b = t.buckets.find((x) => x.key === hl);
    const m = b?.minutes ?? 0;
    return `${label ?? 'This bucket'} ${pctText((m / t.shiftMinutes) * 100)} · ${hoursText(m)}${b?.stops ? ` · ${b.stops} stop${b.stops === 1 ? '' : 's'}` : ''}`;
  }
  return topBucketsText(t);
}

function Row({ lead, name, bar, util, ot, testId, data, onDoubleClick, onEnter, tone = 'type', title }: {
  lead?: ReactNode; name: ReactNode; bar: ReactNode; util: ReactNode; ot: ReactNode; testId?: string; data?: Record<string, string>;
  onDoubleClick?: () => void; onEnter?: () => void; tone?: 'area' | 'type' | 'machine' | 'head'; title?: string;
}) {
  const interactive = !!onDoubleClick;
  return (
    <Box data-testid={testId} {...data} title={title} tabIndex={interactive ? 0 : undefined} onDoubleClick={onDoubleClick}
      onKeyDown={onEnter ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); onEnter(); } } : undefined}
      sx={{
        display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', columnGap: 1.25, rowGap: 0.5, px: 1, py: tone === 'head' ? 0.5 : 0.9,
        borderTop: tone === 'area' ? '1px solid var(--c-border)' : '1px solid var(--c-divider)',
        background: tone === 'area' ? 'var(--c-surface-2)' : tone === 'machine' ? 'var(--c-canvas)' : 'transparent',
        userSelect: interactive ? 'none' : undefined, cursor: interactive ? 'pointer' : 'default',
        '&:hover': interactive ? { background: 'var(--c-surface-2)' } : undefined,
        '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: -2 },
      }}>
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>{lead}</Box>
      <Box sx={{ minWidth: 0 }}>{name}</Box>
      <Box sx={{ minWidth: 0, gridColumn: { xs: '1 / -1', md: 'auto' }, order: { xs: 5, md: 0 }, pl: { xs: '42px', md: 0 } }}>{bar}</Box>
      <Box sx={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>{util}</Box>
      <Box sx={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>{ot}</Box>
    </Box>
  );
}

function BarCell({ t, styles, hl, hlLabel, label, height }: { t: { shiftMinutes: number; buckets: TimeBucket[] }; styles: Record<string, BucketStyle>; hl: string | null; hlLabel?: string; label: string; height?: number }) {
  return (
    <Box>
      <TimeBar shiftMinutes={t.shiftMinutes} buckets={t.buckets} styles={styles} highlight={hl} label={label} height={height} />
      <Typography data-testid="time-caption" sx={{ fontSize: 11.5, color: 'var(--c-text-2)', mt: 0.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {caption(t, hl, hlLabel)}
      </Typography>
    </Box>
  );
}

const otText = (m: number) => (m > 0 ? <Box component="span" sx={{ color: 'var(--c-warning-800)' }}>{hoursText(m)}</Box> : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>—</Box>);

export function ShiftTimeTable({ data, onOpenMachine }: { data: MachinesDashboard; onOpenMachine: (m: DashMachine) => void }) {
  const time = data.time;
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [hl, setHl] = useState<string | null>(null);
  const styles = useMemo(() => bucketStyles(time?.reasons ?? []), [time]);
  const areas = useMemo(() => timeAreas(time?.types ?? []), [time]);
  const byId = useMemo(() => new Map(data.machines.map((m) => [m.id, m])), [data.machines]);
  if (!time) return null;
  const plant = time.plant;
  const keyOf = (id: number | null) => String(id ?? 'none');
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const hlLabel = hl ? styles[hl]?.label : undefined;

  // Legend: Running, planned reasons, Break, unplanned reasons, Not recorded — each with its hours and share.
  const legend = [
    { key: 'run', minutes: plant.buckets.find((b) => b.key === 'run')?.minutes ?? 0, stops: undefined as number | undefined },
    ...time.reasons.filter((r) => r.kind === 'planned').map((r) => ({ key: r.key, minutes: r.minutes, stops: r.stops })),
    { key: 'break', minutes: plant.buckets.find((b) => b.key === 'break')?.minutes ?? 0, stops: undefined },
    ...time.reasons.filter((r) => r.kind !== 'planned').map((r) => ({ key: r.key, minutes: r.minutes, stops: r.stops })),
    { key: 'unrecorded', minutes: plant.buckets.find((b) => b.key === 'unrecorded')?.minutes ?? 0, stops: undefined },
  ];

  return (
    <SectionCard
      title="Where the shift time went"
      subtitle={`100 % = every machine's shift time so far in the period. Overtime is work outside the shift, shown apart. Double-click a type for its machines, a machine for its days.`}
      action={open.size > 0 ? <Button size="small" onClick={() => setOpen(new Set())} data-testid="time-collapse-all">Collapse all</Button> : undefined}
      sx={{ mb: 2.5 }}
    >
      <Box data-testid="shift-time" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box data-testid="time-legend" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {legend.map((it) => {
            const st = styles[it.key];
            if (!st) return null;
            const on = hl === it.key;
            const pct = plant.shiftMinutes ? (it.minutes / plant.shiftMinutes) * 100 : 0;
            return (
              <ButtonBase key={it.key} data-testid="time-legend-item" data-key={it.key} aria-pressed={on} onClick={() => setHl(on ? null : it.key)}
                title={`${st.label}: ${hoursText(it.minutes)}, ${pctText(pct)} of all shift time${it.stops != null ? ` · ${it.stops} stops` : ''}. Click to highlight it on every bar.`}
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.4, borderRadius: 'var(--r-sm)', fontSize: 12,
                  border: `1px solid ${on ? 'var(--c-primary-500)' : 'var(--c-border)'}`, background: on ? 'var(--c-primary-50)' : 'var(--c-surface)',
                  color: it.minutes > 0 ? 'var(--c-text)' : 'var(--c-text-3)', opacity: hl && !on ? 0.65 : 1,
                }}>
                <Box component="span" sx={{ width: 11, height: 11, borderRadius: '3px', background: fill(st), border: st.hatch ? `1px solid ${st.color}` : 'none', flexShrink: 0 }} />
                <span>{st.label}</span>
                <Box component="span" sx={{ fontFamily: 'var(--font-mono)', color: 'var(--c-text-2)' }}>{hoursText(it.minutes)} · {it.minutes > 0 && pct < 1 ? '<1%' : pctText(pct)}</Box>
                {st.kind === 'planned' && <Box component="span" sx={{ fontSize: 10, color: 'var(--c-text-3)' }}>planned</Box>}
              </ButtonBase>
            );
          })}
          {hl && <Button size="small" onClick={() => setHl(null)}>Clear highlight</Button>}
        </Box>

        <Box sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
          <Row tone="head" name={<Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Area › type</Typography>}
            bar={<Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: { xs: 'none', md: 'block' } }}>Shift time, 100 %</Typography>}
            util={<Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }} title="Running ÷ shift time net of the pattern's break">Util.</Typography>}
            ot={<Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }} title="Work outside the shift — not in the 100 %">Overtime</Typography>} />
          <Row tone="area" testId="time-plant-row"
            name={<Typography sx={{ fontSize: 13, fontWeight: 600 }}>All machines <Box component="span" sx={{ fontWeight: 400, color: 'var(--c-text-3)' }}>· {plant.machines - plant.noShiftMachines}</Box></Typography>}
            bar={<BarCell t={plant} styles={styles} hl={hl} hlLabel={hlLabel} label="All machines" />}
            util={pctText(plant.utilisationPct)} ot={otText(plant.overtimeMinutes)} />
          {areas.map((a) => (
            <Fragment key={a.key}>
              {areas.length > 1 && (
                <Row tone="area" testId="time-area-row" data={{ 'data-area': a.name }}
                  name={<Typography sx={{ fontSize: 13, fontWeight: 600 }} noWrap title={`${a.level}: ${a.name}`}>{a.name} <Box component="span" sx={{ fontWeight: 400, color: 'var(--c-text-3)' }}>· {a.machines}</Box></Typography>}
                  bar={<BarCell t={a} styles={styles} hl={hl} hlLabel={hlLabel} label={a.name} height={10} />}
                  util={pctText(a.utilisationPct)} ot={otText(a.overtimeMinutes)} />
              )}
              {a.types.map((t) => {
                const k = keyOf(t.id);
                const isOpen = open.has(k);
                const ms = t.machineIds.map((id) => byId.get(id)).filter((m): m is DashMachine => !!m).sort((x, y) => x.code.localeCompare(y.code));
                return (
                  <Fragment key={k}>
                    <Row testId="time-type-row" data={{ 'data-type': t.name, 'aria-expanded': String(isOpen) }} onDoubleClick={() => toggle(k)} onEnter={() => toggle(k)}
                      title="Double-click (or Enter) for its machines"
                      lead={(
                        <IconButton size="small" data-testid="time-expand" aria-expanded={isOpen} aria-label={`${isOpen ? 'Hide' : 'Show'} the machines of ${t.name}`}
                          onClick={(e) => { e.stopPropagation(); toggle(k); }} onDoubleClick={(e) => e.stopPropagation()}>
                          {isOpen ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />}
                        </IconButton>
                      )}
                      name={(
                        <Box sx={{ minWidth: 0 }}>
                          <Typography noWrap sx={{ fontSize: 13 }} title={t.path.map((p) => p.name).join(' › ')}>{t.name}</Typography>
                          <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                            {t.machines} machine{t.machines === 1 ? '' : 's'}{t.noShiftMachines ? ` · ${t.noShiftMachines} no shift` : ''}
                          </Typography>
                        </Box>
                      )}
                      bar={t.shiftMinutes ? <BarCell t={t} styles={styles} hl={hl} hlLabel={hlLabel} label={t.name} /> : <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>No shift in the period{t.noShiftRunMinutes ? ` · ${hoursText(t.noShiftRunMinutes)} of work logged` : ''}</Typography>}
                      util={pctText(t.utilisationPct)} ot={otText(t.overtimeMinutes)} />
                    {isOpen && (
                      <Box data-testid="time-machines" data-type={t.name} sx={{ borderLeft: '3px solid var(--c-primary-400)' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, background: 'var(--c-canvas)', borderTop: '1px solid var(--c-divider)' }}>
                          <Typography data-testid="time-breadcrumb" sx={{ fontSize: 12, color: 'var(--c-text-2)', flex: 1, minWidth: 0 }} noWrap>
                            All machines{areas.length > 1 ? ` › ${a.name}` : ''} › <b>{t.name}</b>
                          </Typography>
                          <Button size="small" onClick={() => toggle(k)} data-testid="time-collapse">Collapse</Button>
                        </Box>
                        {ms.map((m) => {
                          const mt = m.time;
                          const st = MACHINE_STATE[m.now.state];
                          return (
                            <Row key={m.id} tone="machine" testId="time-machine-row" data={{ 'data-machine': m.code }}
                              onDoubleClick={() => onOpenMachine(m)} onEnter={() => onOpenMachine(m)} title="Double-click (or Enter) for its days and stop reasons"
                              lead={(
                                <IconButton size="small" data-testid="time-open-machine" aria-label={`Open ${m.code}`} onClick={(e) => { e.stopPropagation(); onOpenMachine(m); }}
                                  onDoubleClick={(e) => e.stopPropagation()}>
                                  <OpenInFullRounded sx={{ fontSize: 15 }} />
                                </IconButton>
                              )}
                              name={(
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                                  <Dot color={st.color} label={st.label} pulse={m.now.state === 'running'} />
                                  <Mono sx={{ fontSize: 12.5, fontWeight: 600 }}>{m.code}</Mono>
                                  <Typography noWrap sx={{ fontSize: 12, color: 'var(--c-text-2)', minWidth: 0 }}>{m.name}</Typography>
                                </Box>
                              )}
                              bar={!mt || mt.noShift
                                ? <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }} data-testid="time-machine-no-shift">No shift in the period{mt?.overtimeMinutes ? ` · ${hoursText(mt.overtimeMinutes)} of work logged` : ''}</Typography>
                                : <BarCell t={mt} styles={styles} hl={hl} hlLabel={hlLabel} label={m.code} height={11} />}
                              util={mt && !mt.noShift ? pctText(mt.utilisationPct) : '—'} ot={otText(mt && !mt.noShift ? mt.overtimeMinutes : 0)} />
                          );
                        })}
                      </Box>
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </Box>
        {time.noShift.length > 0 && (
          <Typography data-testid="time-no-shift" sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
            <b>No shift in the period</b> (not in any bar): {time.noShift.map((m) => `${m.code}${m.runMinutes ? ` (${hoursText(m.runMinutes)} of work)` : ''}`).join(', ')}
          </Typography>
        )}
        {plant.stopOutsideShiftMinutes > 0 && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
            Also {hoursText(plant.stopOutsideShiftMinutes)} of stops logged outside the shifts — outside the 100 %, like overtime.
          </Typography>
        )}
      </Box>
    </SectionCard>
  );
}
