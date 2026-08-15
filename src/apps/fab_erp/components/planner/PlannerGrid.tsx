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

import { useEffect, useRef, useState } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import PushPinRounded from '@mui/icons-material/PushPinRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';

import type { PlanLane, PlanEntry, SuggestionItem } from '../../api/planner';
import {
  buildTicks, fmtMinutes, fmtLocalTime, type Scale,
} from './plannerTime';

/**
 * Lane height follows how many bars actually stack in it — see `stackBars`. A
 * fixed 62px with two hard-coded rows meant a third overlapping bar was drawn
 * back on top of the first, so a busy lane silently hid its own work.
 */
const ROW_H = 26;
const LANE_PAD = 12;
const MIN_LANE_H = 56;
const HEADER_W = 150;
/** Below this a bar cannot hold readable text, so it shows as a block + tooltip. */
const LABEL_MIN_PX = 46;

/**
 * Assign each bar the lowest row where it does not overlap what is already there.
 *
 * The old rule was `i % 2` — alternate rows regardless of whether the bars
 * actually clash. Two consequences, both bad on a real day: bars that do not
 * overlap at all were pushed onto separate rows for nothing, and the third of
 * three genuinely concurrent bars landed back on row 0 underneath the first.
 */
function stackBars<T extends { start: string; end: string }>(bars: T[]): Array<T & { row: number }> {
  const rowEnds: number[] = [];
  return bars.map((b) => {
    const s = new Date(b.start).getTime();
    const e = new Date(b.end).getTime();
    let row = rowEnds.findIndex((end) => end <= s);
    if (row === -1) { row = rowEnds.length; rowEnds.push(e); } else { rowEnds[row] = e; }
    return { ...b, row };
  });
}

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
  /**
   * The track's real width, so the tick density can be chosen from it rather
   * than guessed. Measured rather than assumed because this grid is squeezed
   * between a lane header and a backlog rail, and how much room is left depends
   * on the viewport.
   */
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackPx, setTrackPx] = useState(0);
  useEffect(() => {
    const measure = () => {
      const el = trackRef.current;
      if (el) setTrackPx(el.getBoundingClientRect().width);
    };
    measure();
    // BOTH, because neither alone was enough. The ResizeObserver misses cases
    // where the element's own box is re-laid-out without the observer firing in
    // time, and a window listener misses a resize of the pane the grid sits in
    // with no window resize at all — which is how the tick density got stuck at
    // whatever it measured on mount and rendered 3-hourly labels on a wide
    // screen with room for 2.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && trackRef.current) ro.observe(trackRef.current);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, [lanes.length, scale.mode]);

  const ticks = buildTicks(scale, trackPx);

  const suggestionsByLane = new Map<number, SuggestionItem[]>();
  for (const s of suggestions) {
    if (!suggestionsByLane.has(s.resourceTypeId)) suggestionsByLane.set(s.resourceTypeId, []);
    suggestionsByLane.get(s.resourceTypeId)!.push(s);
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      {/* 880 forced an inner horizontal scrollbar on a 1280px laptop, because the
          card only gets ~810 once the backlog rail has taken its share — so the
          grid scrolled inside a page that was not itself scrolling. 640 fits,
          and the tick density adapts to whatever is actually available. */}
      <Box sx={{ minWidth: 640 }}>
        {/* ── time axis ─────────────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--c-border)' }}>
          <Box sx={{ width: HEADER_W, flexShrink: 0 }} />
          {/* The measured element is THIS one — the axis header, which renders
              once — not a lane track. A ref inside the lane map lands on
              whichever lane rendered last and stops being observed the moment
              the lanes re-render, so the tick density would freeze at whatever
              it was on mount. Same width by construction. */}
          <Box ref={trackRef} sx={{ position: 'relative', flex: 1, height: 26 }}>
            {ticks.filter((t) => t.label).map((t) => (
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
          const bars = stackBars([
            ...lane.entries.map(entryToBar),
            ...(suggestionsByLane.get(lane.resourceTypeId) ?? []).map(suggestionToBar),
          ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()));

          // The lane grows to hold its own bars rather than clipping them.
          const laneH = Math.max(MIN_LANE_H, LANE_PAD + (Math.max(...bars.map((b) => b.row), 0) + 1) * ROW_H);
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
              <Box sx={{ position: 'relative', flex: 1, height: laneH, background: 'var(--c-surface)' }}>
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
                {bars.map((bar) => {
                  const pos = scale.place(bar.start, bar.end);
                  if (!pos) return null;
                  const selected = !!bar.entry && bar.entry.id === selectedEntryId;
                  const row = bar.row;
                  // A 40-minute job on a 24-hour axis is around 20px. Text in that
                  // is a smear of clipped glyphs that reads as a rendering fault;
                  // the block plus its tooltip is the honest version.
                  const barPx = trackPx > 0 ? (trackPx * pos.widthPct) / 100 : 999;
                  const showLabel = barPx >= LABEL_MIN_PX;
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
                          // A real job is minutes wide on a 24-hour axis. Without
                          // a floor it renders as a hairline nobody can hit.
                          minWidth: 8,
                          top: 6 + row * ROW_H,
                          height: ROW_H - 4,
                          borderRadius: 'var(--r-sm)',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 0.5,
                          px: showLabel ? 0.75 : 0,
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
                        {showLabel && (<>
                          {bar.pinned && <PushPinRounded sx={{ fontSize: 12, flexShrink: 0 }} />}
                          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {bar.label}
                          </Box>
                          {bar.taskCount > 1 && (
                            <Box component="span" sx={{ opacity: 0.7, flexShrink: 0 }}>×{bar.taskCount}</Box>
                          )}
                        </>)}
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
