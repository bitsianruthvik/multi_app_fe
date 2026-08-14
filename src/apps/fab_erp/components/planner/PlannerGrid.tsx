/**
 * PlannerGrid.tsx — lanes down, time across.
 *
 * One row per RESOURCE TYPE, because that is the unit a planner works in: they
 * fill the cutting lane for a day, then the welding lane. Machines appear inside
 * a lane only as capacity.
 *
 * THE THREE THINGS THE BACKGROUND SAYS
 * ------------------------------------
 * Shading behind the bars is not decoration, it is the answer to "can anyone
 * actually do this work then":
 *
 *   full-tone band   every machine in the lane is manned
 *   part-tone band   some are (3 of 4) — coverage is FRACTIONAL on a type lane
 *   bare canvas      nobody is on shift
 *   hatched          no shift calendar exists, so the engine plans it 24/7 and
 *                    the grid must say "unknown", not draw an empty lane
 *
 * Suggested bars are drawn dashed and translucent alongside real ones so the
 * planner sees the proposal in place, against the same capacity, before deciding.
 */

import { Box, Tooltip, Typography } from '@mui/material';
import PushPinRounded from '@mui/icons-material/PushPinRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';

import type { PlanLane, PlanEntry, SuggestionItem } from '../../api/planner';
import {
  buildTicks, fmtMinutes, fmtLocalTime, type Scale,
} from './plannerTime';

const LANE_H = 62;
const HEADER_W = 190;

/** A bar the grid can draw — a real entry or a suggestion, normalised. */
interface Bar {
  key: string;
  start: string;
  end: string;
  minutes: number;
  label: string;
  sub: string | null;
  taskCount: number;
  pinned: boolean;
  suggested: boolean;
  warn: boolean;
  entry?: PlanEntry;
  suggestion?: SuggestionItem;
}

function entryToBar(e: PlanEntry): Bar {
  return {
    key: `e${e.id}`,
    start: e.plannedStart,
    end: e.plannedEnd,
    minutes: e.plannedMinutes,
    label: e.label ?? e.operationName ?? 'Operation',
    sub: e.orderNumber,
    taskCount: e.tasks.length || 1,
    pinned: e.isPinned,
    suggested: false,
    // Planned to finish after the order's hard date.
    warn: !!(e.mustFinishBy && new Date(e.plannedEnd) > new Date(`${e.mustFinishBy}T23:59:59Z`)),
    entry: e,
  };
}

function suggestionToBar(s: SuggestionItem): Bar {
  return {
    key: `s${s.bundleKey}${s.plannedStart}`,
    start: s.plannedStart,
    end: s.plannedEnd,
    minutes: s.plannedMinutes,
    label: s.label,
    sub: s.orderNumber,
    taskCount: s.taskCount,
    pinned: false,
    suggested: true,
    warn: s.breachesPin,
    suggestion: s,
  };
}

export function PlannerGrid({
  lanes,
  scale,
  suggestions,
  selectedEntryId,
  onSelectEntry,
  onSelectSuggestion,
}: {
  lanes: PlanLane[];
  scale: Scale;
  suggestions: SuggestionItem[];
  selectedEntryId: number | null;
  onSelectEntry: (entry: PlanEntry) => void;
  onSelectSuggestion: (s: SuggestionItem) => void;
}) {
  const ticks = buildTicks(scale);

  const suggestionsByLane = new Map<number, SuggestionItem[]>();
  for (const s of suggestions) {
    if (!suggestionsByLane.has(s.resourceTypeId)) suggestionsByLane.set(s.resourceTypeId, []);
    suggestionsByLane.get(s.resourceTypeId)!.push(s);
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box sx={{ minWidth: 880 }}>
        {/* ── time axis ─────────────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--c-border)' }}>
          <Box sx={{ width: HEADER_W, flexShrink: 0 }} />
          <Box sx={{ position: 'relative', flex: 1, height: 26 }}>
            {ticks.map((t) => (
              <Typography
                key={t.label + t.leftPct}
                sx={{
                  position: 'absolute',
                  left: `${t.leftPct}%`,
                  top: 4,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: t.major ? 'var(--c-text-2)' : 'var(--c-text-3)',
                  fontWeight: t.major ? 600 : 400,
                  transform: 'translateX(-2px)',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.label}
              </Typography>
            ))}
          </Box>
        </Box>

        {/* ── lanes ─────────────────────────────────────────────────────── */}
        {lanes.map((lane) => {
          const bars: Bar[] = [
            ...lane.entries.map(entryToBar),
            ...(suggestionsByLane.get(lane.resourceTypeId) ?? []).map(suggestionToBar),
          ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

          const overDays = lane.days.filter((d) => d.overAllocated);
          const laneMinutes = lane.days.reduce((n, d) => n + d.plannedMinutes, 0);

          return (
            <Box
              key={lane.resourceTypeId}
              sx={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--c-divider)' }}
            >
              {/* lane header */}
              <Box
                sx={{
                  width: HEADER_W, flexShrink: 0, px: 1.5, py: 1,
                  borderRight: '1px solid var(--c-border)',
                  background: 'var(--c-surface-2)',
                  display: 'flex', flexDirection: 'column', justifyContent: 'center',
                }}
              >
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1.25 }}>
                  {lane.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                  <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                    {lane.totalUnits} unit{lane.totalUnits === 1 ? '' : 's'} · {fmtMinutes(laneMinutes)}
                  </Typography>
                  {overDays.length > 0 && (
                    <Tooltip
                      title={overDays
                        .map((d) => `${d.date}: ${fmtMinutes(d.plannedMinutes)} planned vs ${fmtMinutes(d.capacityMinutes)} manned — over by ${fmtMinutes(d.overBy)}`)
                        .join('\n')}
                    >
                      <WarningAmberRounded sx={{ fontSize: 14, color: 'var(--c-amber-600, #D97706)' }} />
                    </Tooltip>
                  )}
                </Box>
              </Box>

              {/* lane track */}
              <Box sx={{ position: 'relative', flex: 1, height: LANE_H, background: 'var(--c-surface)' }}>
                {/* no calendar at all — say so rather than shading it dead */}
                {lane.unbounded && (
                  <Tooltip title="No shift calendar on this lane, so the engine plans it around the clock. Set one up in Setup › Calendars.">
                    <Box
                      sx={{
                        position: 'absolute', inset: 0,
                        backgroundImage:
                          'repeating-linear-gradient(45deg, var(--c-surface-2) 0 6px, transparent 6px 12px)',
                      }}
                    />
                  </Tooltip>
                )}

                {/* crew / shift coverage */}
                {!lane.unbounded && lane.coverage.map((seg, i) => {
                  const pos = scale.place(seg.start, seg.end);
                  if (!pos) return null;
                  const ratio = lane.totalUnits > 0 ? seg.coveredUnits / lane.totalUnits : 0;
                  return (
                    <Tooltip
                      key={`${seg.start}-${i}`}
                      title={`${seg.coveredUnits} of ${lane.totalUnits} manned · ${fmtLocalTime(seg.start, scale.timeZone)}–${fmtLocalTime(seg.end, scale.timeZone)}`}
                    >
                      <Box
                        sx={{
                          position: 'absolute', top: 0, bottom: 0,
                          left: `${pos.leftPct}%`, width: `${pos.widthPct}%`,
                          // Opacity carries the fraction: a fully crewed lane is a
                          // solid band, a half-crewed one visibly thinner in tone.
                          background: 'var(--c-primary-50)',
                          opacity: 0.35 + 0.65 * ratio,
                          borderLeft: '1px solid var(--c-primary-200)',
                        }}
                      />
                    </Tooltip>
                  );
                })}

                {/* hour / day gridlines */}
                {ticks.map((t) => (
                  <Box
                    key={`g${t.leftPct}`}
                    sx={{
                      position: 'absolute', top: 0, bottom: 0, left: `${t.leftPct}%`, width: '1px',
                      background: t.major ? 'var(--c-border)' : 'var(--c-divider)',
                    }}
                  />
                ))}

                {/* bars */}
                {bars.map((bar, i) => {
                  const pos = scale.place(bar.start, bar.end);
                  if (!pos) return null;
                  const selected = !!bar.entry && bar.entry.id === selectedEntryId;
                  // Stagger overlapping bars so a lane running 3 units in parallel
                  // shows three bars rather than one on top of two others.
                  const row = i % 2;
                  return (
                    <Tooltip
                      key={bar.key}
                      title={
                        <Box>
                          <div>{bar.label}</div>
                          <div>
                            {fmtLocalTime(bar.start, scale.timeZone)}–{fmtLocalTime(bar.end, scale.timeZone)} · {fmtMinutes(bar.minutes)}
                          </div>
                          {bar.sub && <div>{bar.sub}</div>}
                          {bar.taskCount > 1 && <div>{bar.taskCount} tasks bundled</div>}
                          {bar.suggestion && <div>{bar.suggestion.reason}</div>}
                          {bar.warn && <div>Finishes after the order&apos;s must-finish-by date</div>}
                        </Box>
                      }
                    >
                      <Box
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (bar.entry) onSelectEntry(bar.entry);
                          else if (bar.suggestion) onSelectSuggestion(bar.suggestion);
                        }}
                        onKeyDown={(ev) => {
                          if (ev.key !== 'Enter' && ev.key !== ' ') return;
                          ev.preventDefault();
                          if (bar.entry) onSelectEntry(bar.entry);
                          else if (bar.suggestion) onSelectSuggestion(bar.suggestion);
                        }}
                        sx={{
                          position: 'absolute',
                          left: `${pos.leftPct}%`,
                          width: `${pos.widthPct}%`,
                          top: 6 + row * 26,
                          height: 22,
                          borderRadius: 'var(--r-sm)',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 0.5,
                          px: 0.75,
                          overflow: 'hidden',
                          fontSize: 11,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          background: bar.suggested
                            ? 'transparent'
                            : (bar.warn ? 'var(--c-rose-50, #FCE9EC)' : 'var(--c-primary-100)'),
                          border: bar.suggested
                            ? '1px dashed var(--c-primary-400)'
                            : `1px solid ${bar.warn ? 'var(--c-rose-600, #E11D48)' : 'var(--c-primary-200)'}`,
                          color: bar.warn ? 'var(--c-rose-700, #8A1230)' : 'var(--c-primary-900)',
                          outline: selected ? '2px solid var(--c-primary-500)' : 'none',
                          outlineOffset: 1,
                          '&:hover': { boxShadow: 'var(--e-2)' },
                        }}
                      >
                        {bar.pinned && <PushPinRounded sx={{ fontSize: 12, flexShrink: 0 }} />}
                        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {bar.label}
                        </Box>
                        {bar.taskCount > 1 && (
                          <Box component="span" sx={{ opacity: 0.7, flexShrink: 0 }}>×{bar.taskCount}</Box>
                        )}
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
