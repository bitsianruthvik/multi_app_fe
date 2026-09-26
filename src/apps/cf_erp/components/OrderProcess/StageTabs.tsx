import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Box, MenuItem, TextField, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import { Link } from 'react-router-dom';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import type { CfApiError } from '../../api/client';
import type { OrderProcessLine, OrderProcessView, OrderStage } from '../../api/types';
import { useCompanySlug } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { NO_LINES_YET, STATE_WORD, WORKING_ON_HELP, lineLabel, noStagesReason, stageTabName } from '../../lib/process';
import type { DetailTab } from '../DetailLayout';
import { ErrorNotice, Mono, SkeletonBlock } from '../ui';
import { NextMark, StageStateMark } from './stageUi';

/**
 * The order's tabs, when the order follows a process: one tab per stage, in
 * the process's own sequence, joined by chevrons so the row reads as a road —
 * then a divider, then the tabs that are not stages (Stock, Details).
 *
 *   Working on: Line 10 ▾
 *   ✓ Line items › ◐ Structure › ✓ Values › … › ○ Confirm  │  Stock · Details
 *
 * Every mark is the chosen line's own state from GET /orders/:id/process —
 * drawn here, never worked out. Nothing is ever locked: a stage that is not
 * finished, or does not apply to this line, is still one click away.
 *
 * The stages scroll sideways inside their own strip when they do not fit, with
 * a fade at whichever edge has more. From a tablet up the reference tabs stay
 * put beside the strip, so Stock and Details are never scrolled out of reach;
 * on a phone that would leave the stages no room, so the whole row scrolls as
 * one. The page itself never overflows.
 */

/** A tab, as the order's other tabs draw one (DetailLayout `DetailTabs`), as a real button. */
const tabSx = (on: boolean, muted = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: 0.75, flexShrink: 0, minHeight: 40, px: 1, py: 0.75, m: 0,
  font: 'inherit', fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: 500, lineHeight: 1.4, whiteSpace: 'nowrap', cursor: 'pointer',
  background: 'transparent', border: 'none', borderRadius: 0,
  color: on ? 'var(--c-primary-700)' : muted ? 'var(--c-text-3)' : 'var(--c-text-2)',
  // The underline is drawn inside the tab, over the row's hairline, so nothing
  // hangs outside a box that has to clip for scrolling.
  boxShadow: on ? 'inset 0 -2px 0 var(--c-primary-500)' : 'none',
  transition: 'color var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease)',
  '&:hover': { color: 'var(--c-primary-700)' },
  // Inset, because the strip clips anything drawn outside its tabs.
  '&:focus-visible': { outlineOffset: '-2px' },
});

const noScrollbar = { scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } } as const;

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** Arrow keys walk the tabs (both groups, as one row); Enter or Space opens one. */
function walkTabs(e: KeyboardEvent<HTMLElement>) {
  const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
  const at = tabs.indexOf(document.activeElement as HTMLElement);
  if (at < 0 || !tabs.length) return;
  e.preventDefault();
  const to = e.key === 'Home' ? 0
    : e.key === 'End' ? tabs.length - 1
      : (at + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[to].focus();
}

function StageTab({ stage, position, of, on, next, focusable, onPick }: {
  stage: OrderStage; position: number; of: number; on: boolean; next: boolean; focusable: boolean; onPick: () => void;
}) {
  return (
    <Tooltip describeChild placement="bottom-start" enterDelay={350}
      title={<><Box component="span" sx={{ fontWeight: 600 }}>{STATE_WORD[stage.state]}</Box> — {stage.detail}</>}>
      <Box component="button" type="button" role="tab" data-tab={stage.stageKey}
        aria-selected={on} tabIndex={focusable ? 0 : -1} aria-label={stageTabName(stage, position, of, next)}
        onClick={onPick} sx={tabSx(on, stage.state === 'not_applicable')}>
        <StageStateMark state={stage.state} />
        <span>{stage.label}</span>
        {next && <NextMark title="The next stage that needs work on this line" />}
      </Box>
    </Tooltip>
  );
}

function ReferenceTab({ tab, on, focusable, onPick }: { tab: DetailTab; on: boolean; focusable: boolean; onPick: () => void }) {
  return (
    <Box component="button" type="button" role="tab" data-tab={tab.value} aria-selected={on} tabIndex={focusable ? 0 : -1}
      onClick={onPick} sx={tabSx(on)}>
      {tab.label}
      {tab.count !== undefined && (
        <Box component="span" sx={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: on ? 'var(--c-primary-600)' : 'var(--c-text-3)' }}>{tab.count}</Box>
      )}
    </Box>
  );
}

export function OrderStageTabs({ process, lines, stages, line, nextKey, active, onTab, onPickLine, reference }: {
  process: NonNullable<OrderProcessView['process']>;
  /** Every line of the order, each with its own stages — what the switcher offers. */
  lines: OrderProcessLine[];
  /** The stages as they stand for the chosen line — or the order's roll-up while it has no lines. */
  stages: OrderStage[];
  line: OrderProcessLine | null;
  /** The first stage still holding this line up, marked Next. Never enforced. */
  nextKey: string | null;
  active: string;
  onTab: (value: string) => void;
  onPickLine: (lineId: number) => void;
  /** The tabs that are not stages, drawn after the divider. */
  reference: DetailTab[];
}) {
  const company = useCompanySlug();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const strip = useRef<HTMLDivElement>(null);
  const road = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });

  // Which edges have more to scroll to — the only sign a hidden scrollbar leaves.
  const measure = useCallback(() => {
    const el = strip.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setFade((f) => (f.left === left && f.right === right ? f : { left, right }));
  }, []);

  useEffect(() => {
    const el = strip.current;
    if (!el) return undefined;
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (road.current) ro.observe(road.current);
    return () => ro.disconnect();
  }, [measure]);

  // The open stage is kept in sight inside the strip — sideways only, so the
  // page never jumps. It runs again when the stages arrive or change width.
  // The fades are measured straight after, not left to the scroll event: a
  // page that is not painting (a background tab) does not deliver one.
  const first = useRef(true);
  useEffect(() => {
    const el = strip.current;
    const tab = el?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(active)}"]`);
    if (!el || !tab) return undefined;
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    const pad = 36;
    let settle: number | undefined;
    if (left < el.scrollLeft + pad || right > el.scrollLeft + el.clientWidth - pad) {
      const smooth = !first.current && !prefersReducedMotion();
      el.scrollTo({ left: Math.max(0, left - (el.clientWidth - tab.offsetWidth) / 2), behavior: smooth ? 'smooth' : 'auto' });
      measure();
      if (smooth) settle = window.setTimeout(measure, 450);
    }
    first.current = false;
    return () => window.clearTimeout(settle);
  }, [active, stages, measure]);

  const values = [...stages.map((s) => s.stageKey), ...reference.map((t) => t.value)];
  const focusable = values.includes(active) ? active : values[0];
  const edge = (on: boolean, side: 'left' | 'right') => (on
    ? (side === 'left' ? 'transparent 0, #000 32px' : '#000 calc(100% - 32px), transparent 100%')
    : (side === 'left' ? '#000 0' : '#000 100%'));
  const mask = fade.left || fade.right ? `linear-gradient(to right, ${edge(fade.left, 'left')}, ${edge(fade.right, 'right')})` : undefined;

  // Stages and the tabs that are not stages, told apart by a rule, not by colour.
  const divider = <Box aria-hidden sx={{ flexShrink: 0, width: '1px', height: 22, alignSelf: 'center', mx: 0.75, background: 'var(--c-border)' }} />;
  const referenceTabs = reference.map((t) => (
    <ReferenceTab key={t.value} tab={t} on={t.value === active} focusable={t.value === focusable} onPick={() => onTab(t.value)} />
  ));

  return (
    <Box sx={{ mb: 2, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', columnGap: 1.5, rowGap: 0.75, flexWrap: 'wrap', mb: 1.25, minWidth: 0 }}>
        {lines.length > 0 ? (
          <>
            <TextField select size="small" label="Working on" value={line?.lineId ?? ''}
              onChange={(e) => onPickLine(Number(e.target.value))}
              sx={{ flex: { xs: '1 1 100%', sm: '0 1 340px' }, minWidth: 0 }}>
              {lines.map((l) => <MenuItem key={l.lineId} value={l.lineId}>{lineLabel(l)}</MenuItem>)}
            </TextField>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', flex: '1 1 180px', minWidth: 0 }}>{WORKING_ON_HELP}</Typography>
          </>
        ) : (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: '1 1 220px', minWidth: 0 }}>{NO_LINES_YET}</Typography>
        )}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap', minWidth: 0, fontSize: 12.5, color: 'var(--c-text-2)' }}>
          Process
          <Box component={Link} to={appPath(company, `processes/${process.id}`)}
            sx={{ color: 'var(--c-primary-700)', fontWeight: 500, textDecoration: 'none', overflowWrap: 'anywhere', '&:hover': { textDecoration: 'underline' } }}>
            {process.name}
          </Box>
          <Mono muted>{process.code}</Mono>
        </Box>
      </Box>

      <Box role="tablist" aria-label={`${process.name}: its stages in order, then the order's other tabs`} onKeyDown={walkTabs}
        sx={{ display: 'flex', alignItems: 'stretch', minWidth: 0, boxShadow: 'inset 0 -1px 0 var(--c-border)' }}>
        <Box ref={strip} role="presentation" onScroll={measure}
          sx={{ flex: '1 1 auto', minWidth: 0, overflowX: 'auto', overflowY: 'hidden', ...noScrollbar, maskImage: mask, WebkitMaskImage: mask }}>
          <Box ref={road} role="presentation" sx={{ position: 'relative', display: 'flex', alignItems: 'center', width: 'max-content' }}>
            {stages.map((s, i) => (
              <Fragment key={s.stageKey}>
                {i > 0 && <ChevronRightRounded aria-hidden sx={{ fontSize: 15, color: 'var(--c-text-3)', flexShrink: 0, mx: '-1px' }} />}
                <StageTab stage={s} position={i + 1} of={stages.length} on={s.stageKey === active} next={s.stageKey === nextKey}
                  focusable={s.stageKey === focusable} onPick={() => onTab(s.stageKey)} />
              </Fragment>
            ))}
            {phone && reference.length > 0 && <>{divider}{referenceTabs}</>}
          </Box>
        </Box>
        {!phone && reference.length > 0 && (
          <>
            {divider}
            <Box role="presentation" sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, maxWidth: '50%', overflowX: 'auto', overflowY: 'hidden', ...noScrollbar }}>
              {referenceTabs}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}

/** The tab row while the process is still being read: its shape, so nothing jumps when it lands. */
export function StageTabsSkeleton() {
  return (
    <Box sx={{ mb: 2 }} aria-busy="true" aria-label="Loading the stages">
      <Box sx={{ mb: 1.25 }}><SkeletonBlock w={260} h={40} r={8} /></Box>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', py: 1, overflow: 'hidden', boxShadow: 'inset 0 -1px 0 var(--c-border)' }}>
        {[88, 92, 70, 96, 80, 74].map((w, i) => <Box key={i} sx={{ flexShrink: 0 }}><SkeletonBlock w={w} h={22} r={6} /></Box>)}
      </Box>
    </Box>
  );
}

function Explain({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <Box sx={{
      mb: 2, px: 1.5, py: 1.25, display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap',
      borderRadius: 'var(--r-md)', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)', fontSize: 13,
    }}>
      <InfoOutlined sx={{ fontSize: 17, mt: '1px', flexShrink: 0 }} aria-hidden />
      <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>{children}</Box>
      {action}
    </Box>
  );
}

/**
 * Above the plain tabs, when there are no stages to draw: why, in the API's own
 * words. Drawing invented stages over an order nobody configured is the kind of
 * wrong nobody notices for a month.
 */
export function ProcessAbsentNote({ view, error, onRetry }: { view: OrderProcessView | null; error: CfApiError | null; onRetry: () => void }) {
  const company = useCompanySlug();
  if (!view) return error ? <ErrorNotice error={error} onRetry={onRetry} /> : null;
  const linkSx = { fontSize: 13, color: 'var(--c-primary-700)', flexShrink: 0 };
  if (view.process) {
    return (
      <Explain action={<Box component={Link} to={appPath(company, `processes/${view.process.id}`)} sx={linkSx}>Open {view.process.code}</Box>}>
        {noStagesReason(view.process)}
      </Explain>
    );
  }
  return (
    <Explain action={<Box component={Link} to={appPath(company, 'processes')} sx={linkSx}>Set up processes</Box>}>
      {view.reason ?? 'This order follows no process.'}
    </Explain>
  );
}
