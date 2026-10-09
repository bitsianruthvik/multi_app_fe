import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Box, Button, IconButton, Stack, Tooltip, Typography, useTheme } from '@mui/material';
import ZoomInRounded from '@mui/icons-material/ZoomInRounded';
import ZoomOutRounded from '@mui/icons-material/ZoomOutRounded';
import FitScreenRounded from '@mui/icons-material/FitScreenRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import FullscreenRounded from '@mui/icons-material/FullscreenRounded';
import FullscreenExitRounded from '@mui/icons-material/FullscreenExitRounded';
import MyLocationRounded from '@mui/icons-material/MyLocationRounded';
import PersonPinRounded from '@mui/icons-material/PersonPinRounded';
import {
  ChartSkeleton,
  EmptyState,
  ErrorNotice,
  PageHeader,
  Surface,
  readPref,
  writePref,
} from '@shared/ui';
import type { OrgChartGraph } from '../api/orgchart';
import { getMyOrgChart, type MyOrgChart as Slice } from '../api/self';
import {
  buildModel,
  buildScene,
  describeChart,
  makeFonts,
  readPalette,
  subtreeIds,
  type Arrange,
} from '../components/orgChartLayout';
import { OrgChartCanvas, type NavDirection } from '../components/OrgChartCanvas';
import { OrgChartPanel } from '../components/OrgChartPanel';
import {
  OrgChartFloatingPanel,
  type FloatingPanelHandle,
} from '../components/OrgChartFloatingPanel';
import { useFullscreen } from '../components/useFullscreen';
import { MyOrgChartCard } from '../components/MyOrgChartCard';

/**
 * The EMPLOYEE's org chart — their own slice of the organisation (2026-10-09).
 *
 * WHY A SEPARATE PAGE rather than a mode of OrgChart.tsx: the admin page fetches
 * `/orgchart` (the whole company), the open points, the departments rollup and
 * the position card. Every one of those is an HR endpoint. Keeping this page's
 * imports to `api/self` alone makes the boundary something you can check by
 * reading the import list: this file and `MyOrgChartCard` cannot reach any
 * other endpoint, because they import nothing that could.
 *
 * What it reuses unchanged: the layout (`buildModel` / `buildScene`), the canvas
 * (wheel zoom, pinch, drag-to-pan, keyboard walk), the floating panel, full
 * screen, and the arrange/fold controls — so it behaves exactly like the admin
 * chart. What it drops: Table / Departments / Doubts, the stat strip, the
 * "Start from" picker, KRA search, the date picker and the PNG/PDF export.
 *
 * Their own seat(s) are ringed (a CSS rule over the canvas's own node ids, so
 * the shared canvas is untouched) and the chart opens centred on them.
 */

const prefKey = (company: string, suffix: string) => `myorgchart:${company}:${suffix}`;

/**
 * The slice in the shape the shared layout reads. Every field the layout would
 * want and the slice deliberately does not carry is filled with a neutral value
 * here — no attendance, no content counts, no ids of people — so nothing on the
 * screen implies data the server did not send.
 */
function toGraph(s: Slice): OrgChartGraph {
  let synthetic = 0;
  const nodes = s.nodes.map((n) => ({
    id: n.id,
    positionCode: n.positionCode,
    title: n.title,
    displayTitle: n.displayTitle,
    roleId: null,
    roleTitle: n.roleTitle,
    departmentId: null,
    departmentName: n.departmentName,
    departmentCode: n.departmentCode ?? null,
    departmentRank: n.departmentRank ?? null,
    departmentIsRoot: Boolean(n.departmentIsRoot),
    locationId: null,
    locationName: n.locationName,
    status: '',
    sanctionedHeadcount: n.sanctionedHeadcount,
    effectiveSanctioned: n.effectiveSanctioned,
    shiftPattern: n.shiftPattern,
    defaultShift: null,
    contexts: n.contexts.map((c, i) => ({ id: i, name: c.name, contextType: c.contextType, isPrimary: c.isPrimary })),
    occupants: n.occupants.map((o) => {
      synthetic -= 1;
      return {
        employeeId: synthetic,
        employeeCode: null,
        name: o.isMe ? `${o.name} (you)` : o.name,
        assignmentId: synthetic,
        allocationPercent: null,
        shiftCode: o.shiftCode,
        attendanceStatus: null,
      };
    }),
    requirements: n.requirements.map((r) => ({ shiftId: null, shiftCode: r.shiftCode, requiredCount: r.requiredCount })),
    vacancies: Math.max(0, n.effectiveSanctioned - n.occupants.length),
    counts: { kras: 0, responsibilities: 0, kpis: 0, qualifications: 0, openPoints: 0 },
    hasContent: false,
  }));
  return {
    asOf: s.asOf,
    root: null,
    nodes,
    edges: s.edges.map((e) => ({ ...e, scopeWorkContextId: null })),
    counts: { positions: nodes.length, sanctioned: 0, filled: 0, vacant: 0, present: 0, absent: 0 },
  };
}

export default function MyOrgChart() {
  const { company = '' } = useParams<{ company: string }>();
  const theme = useTheme();
  const key = useCallback((suffix: string) => prefKey(company, suffix), [company]);

  const [slice, setSlice] = useState<Slice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [collapsed, setCollapsed] = useState<Set<number>>(
    () => new Set(readPref<number[]>(prefKey(company, 'collapsed'), [])),
  );
  const [foldTouched, setFoldTouched] = useState<boolean>(() => readPref<boolean>(prefKey(company, 'foldTouched'), false));
  const [foldSettled, setFoldSettled] = useState(false);
  const [arrange, setArrange] = useState<Record<number, Arrange>>(() =>
    readPref<Record<number, Arrange>>(prefKey(company, 'arrange'), {}),
  );
  const [zoom, setZoom] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [cardId, setCardId] = useState<number | null>(null);
  const centred = useRef(false);
  const panelRef = useRef<FloatingPanelHandle>(null);
  const fullscreen = useFullscreen();
  const { active: isFull, exit: exitFull } = fullscreen;

  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [pageEl, setPageEl] = useState<HTMLDivElement | null>(null);
  const [regionEl, setRegionEl] = useState<HTMLDivElement | null>(null);
  const [regionH, setRegionH] = useState<number | null>(null);

  // ── Data: one call, the slice, nothing else ─────────────────────────────
  const load = useCallback(() => {
    setLoading(true);
    getMyOrgChart()
      .then((s) => {
        setSlice(s);
        setError(null);
      })
      .catch((e) => {
        setSlice(null);
        setError(e);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => writePref(key('collapsed'), [...collapsed]), [collapsed, key]);
  useEffect(() => writePref(key('foldTouched'), foldTouched), [foldTouched, key]);
  useEffect(() => writePref(key('arrange'), arrange), [arrange, key]);

  useEffect(() => {
    if (!stageEl) return;
    const read = () => setStage({ w: stageEl.clientWidth, h: stageEl.clientHeight });
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(stageEl);
    return () => ro.disconnect();
  }, [stageEl]);

  // The region fills what is left of the window — the same measurement as the
  // admin chart (spec §14), so the page does not scroll and the wheel zooms.
  const scrollEl = pageEl?.closest('main') ?? null;
  useLayoutEffect(() => {
    if (!regionEl || !scrollEl || isFull) return;
    const measure = () => {
      const mainRect = scrollEl.getBoundingClientRect();
      const top = regionEl.getBoundingClientRect().top - mainRect.top + scrollEl.scrollTop;
      const pad = parseFloat(getComputedStyle(scrollEl.firstElementChild ?? scrollEl).paddingBottom) || 0;
      const bar = (regionEl.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0;
      setRegionH(Math.max(bar + 16 + 360, Math.floor(scrollEl.clientHeight - top - pad)));
    };
    measure();
    window.addEventListener('resize', measure);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && pageEl) {
      ro = new ResizeObserver(measure);
      ro.observe(scrollEl);
      ro.observe(pageEl);
    }
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [regionEl, scrollEl, pageEl, isFull]);

  // ── Model and scene, from the shared layout ─────────────────────────────
  const model = useMemo(() => (slice ? buildModel(toGraph(slice)) : null), [slice]);
  const mySeats = useMemo(() => slice?.mySeatIds ?? [], [slice]);

  const [palette, setPalette] = useState(() => readPalette());
  useEffect(() => {
    const read = () => setPalette(readPalette());
    read();
    const raf = requestAnimationFrame(read);
    return () => cancelAnimationFrame(raf);
  }, [theme.palette.mode]);
  const fonts = useMemo(() => makeFonts(palette.fontUi), [palette.fontUi]);
  const visibleIds = useMemo(() => (model ? subtreeIds(model, '') : []), [model]);

  /*
   * The opening fold. A manager of managers can have a hundred seats below
   * them; open with their reports and their reports' reports showing and fold
   * anything deeper. Nothing above them is folded — the chain IS the point.
   */
  useEffect(() => {
    if (foldSettled || !model || !slice) return;
    if (foldTouched || collapsed.size > 0) { setFoldSettled(true); return; }
    const myDepth = Math.min(...mySeats.map((id) => model.depth.get(id) ?? 0));
    const fold = new Set<number>();
    for (const n of slice.nodes) {
      if (n.relation !== 'REPORT') continue;
      if ((model.depth.get(n.id) ?? 0) >= myDepth + 2 && (model.children.get(n.id)?.length ?? 0) > 0) fold.add(n.id);
    }
    if (fold.size) setCollapsed(fold);
    setFoldSettled(true);
  }, [foldSettled, foldTouched, model, slice, collapsed.size, mySeats]);

  const scene = useMemo(() => {
    if (!model || !slice) return null;
    const c = slice.counts;
    return buildScene(model, {
      root: '',
      filter: 'all',
      collapsed,
      arrange,
      fonts,
      palette,
      colours: false,
      secondaryEdges: model.secondary,
      header: {
        // No big title: a slice is often one box wide, and the legend that sits on
        // the title's line (right-aligned to the chart) would run into it.
        title: '',
        meta: `Your place in the organisation, as at ${slice.asOf}`,
        counts:
          `${c.managers} above you     ${c.reports} in your team` +
          (c.dotted ? `     ${c.dotted} dotted-line manager${c.dotted === 1 ? '' : 's'}` : ''),
      },
    });
  }, [model, slice, collapsed, arrange, fonts, palette]);

  // ── Zoom, then centre on me ─────────────────────────────────────────────
  const fitZoom = useCallback(() => {
    if (!scene || !stage.w) return 1;
    const byH = stage.h > 60 ? (stage.h - 28) / scene.height : Infinity;
    return Math.min(1, Math.max(0.15, Math.min((stage.w - 28) / scene.width, byH)));
  }, [scene, stage]);

  useEffect(() => {
    if (zoom == null && foldSettled && scene && stage.w) {
      setZoom(Math.min(1, Math.max(0.55, (stage.w - 28) / scene.width)));
    }
  }, [zoom, foldSettled, scene, stage.w]);

  const setZoomClamped = (z: number) => setZoom(Math.min(2.5, Math.max(0.15, z)));

  /*
   * Centre my seat in the chart. Scrolled directly rather than through the
   * canvas's smooth scrollIntoView: on opening, the region's height is still
   * settling (it is measured after the header paints) and a smooth scroll in
   * flight is cancelled by that resize, leaving the chart at its top-left.
   */
  const centreOn = useCallback(
    (id: number) => {
      const wrap = stageEl?.firstElementChild as HTMLElement | null;
      const el = document.querySelector(`[data-orgnode="${id}"]`);
      if (!wrap || !el) return;
      const a = el.getBoundingClientRect();
      const b = wrap.getBoundingClientRect();
      wrap.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2);
      wrap.scrollTop += a.top + a.height / 2 - (b.top + b.height / 2);
    },
    [stageEl],
  );
  const findMe = useCallback(() => {
    const id = mySeats[0];
    if (id == null) return;
    setSelected(id);
    centreOn(id);
  }, [mySeats, centreOn]);
  // On opening: once the zoom is set and the stage has stopped resizing.
  useEffect(() => {
    if (centred.current || zoom == null || !scene || !mySeats.length || !stage.w) return;
    const t = window.setTimeout(() => {
      centred.current = true;
      findMe();
    }, 250);
    return () => window.clearTimeout(t);
  }, [zoom, scene, mySeats, findMe, stage.w, stage.h]);

  // ── Interactions ────────────────────────────────────────────────────────
  const toggleCollapse = useCallback((id: number) => {
    setFoldTouched(true);
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const navigate = useCallback(
    (from: number, dir: NavDirection): number | null => {
      if (!model || !scene) return null;
      const placed = scene.layout.placed;
      const ok = (id: number | undefined) => (id != null && placed.has(id) ? id : null);
      if (dir === 'up') return ok(model.parent.get(from));
      if (dir === 'down') return collapsed.has(from) ? null : ok((model.children.get(from) ?? [])[0]);
      const parentId = model.parent.get(from);
      const sibs =
        parentId != null && placed.has(parentId)
          ? (model.children.get(parentId) ?? [])
          : visibleIds.filter((id) => {
              const p = model.parent.get(id);
              return p === undefined || !placed.has(p);
            });
      const i = sibs.indexOf(from);
      if (i < 0) return null;
      return ok(sibs[dir === 'left' ? i - 1 : i + 1]);
    },
    [model, scene, collapsed, visibleIds],
  );

  const openCard = useCallback((id: number) => {
    setSelected(id);
    setCardId(id);
  }, []);
  const closePanel = useCallback(() => {
    const id = cardId;
    setCardId(null);
    if (id != null) {
      const el = document.getElementById(`orgchart-node-${id}`) as unknown as HTMLElement | null;
      el?.focus({ preventScroll: true });
    }
  }, [cardId]);
  const onCanvasOpen = useCallback(
    (id: number) => {
      if (cardId === id) panelRef.current?.focus();
      else openCard(id);
    },
    [cardId, openCard],
  );
  const onCanvasSelect = useCallback((id: number) => {
    setSelected(id);
    setCardId((open) => (open == null ? open : id));
  }, []);

  const zoomNow = zoom ?? 1;
  const panelNode = cardId != null && model ? model.byId.get(cardId) : null;
  const panelTitle = panelNode?.displayTitle || panelNode?.title || 'Position';
  const panelTeam = cardId != null && model ? (model.children.get(cardId)?.length ?? 0) : 0;
  const collapsedCount = [...collapsed].filter((id) => model?.byId.has(id)).length;
  const secondaryCount = model?.secondary.length ?? 0;

  // My own boxes, ringed. A CSS rule over the canvas's node ids — the shared
  // canvas draws a plain border and is not changed for this.
  const highlight = useMemo(() => {
    const sx: Record<string, object> = {};
    for (const id of mySeats) {
      sx[`& [data-orgnode="${id}"] > rect:first-of-type`] = {
        stroke: 'var(--c-primary-500)',
        strokeWidth: 3,
        fill: 'var(--c-primary-50)',
      };
    }
    return sx;
  }, [mySeats]);

  const c = slice?.counts;
  const subtitle = !slice
    ? 'Where you sit, who you report to, and your team'
    : slice.linked && c
      ? `${c.managers} above you · ${c.reports} in your team${c.dotted ? ` · ${c.dotted} dotted-line` : ''}. Other teams are not shown.`
      : 'Where you sit, who you report to, and your team';

  return (
    <Stack spacing={2} ref={setPageEl}>
      <PageHeader
        title="Org chart"
        subtitle={subtitle}
        actions={
          <Button
            size="small"
            variant="outlined"
            component={RouterLink}
            to={`/${company}/cf_hrms/my-place`}
            startIcon={<PersonPinRounded />}
          >
            My place
          </Button>
        }
      />

      {!!error && <ErrorNotice error={error} onRetry={load} />}

      <Box
        ref={setRegionEl}
        sx={
          isFull
            ? {
                position: 'fixed',
                inset: 0,
                mt: '0 !important',
                zIndex: 'var(--z-sheet)',
                background: 'var(--c-canvas)',
                p: { xs: 1, sm: 1.5 },
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
              }
            : { height: regionH ?? 560, display: 'flex', flexDirection: 'column', gap: 2 }
        }
      >
        {model && scene && (
          <Surface e={1} sx={{ flexShrink: 0 }}>
            <Box sx={{ p: 1.25, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
              <Button size="small" startIcon={<MyLocationRounded />} onClick={findMe}>
                Find me
              </Button>
              <Box sx={{ flex: 1 }} />
              {collapsedCount > 0 && (
                <Button
                  size="small"
                  startIcon={<UnfoldMoreRounded />}
                  onClick={() => { setFoldTouched(true); setCollapsed(new Set()); }}
                >
                  {collapsedCount} folded — expand all
                </Button>
              )}
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Tooltip title="Zoom out">
                  <IconButton size="small" onClick={() => setZoomClamped(zoomNow / 1.2)} aria-label="Zoom out">
                    <ZoomOutRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Typography
                  sx={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, minWidth: 46, textAlign: 'center', color: 'var(--c-text-2)' }}
                  aria-live="polite"
                >
                  {Math.round(zoomNow * 100)}%
                </Typography>
                <Tooltip title="Zoom in">
                  <IconButton size="small" onClick={() => setZoomClamped(zoomNow * 1.2)} aria-label="Zoom in">
                    <ZoomInRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Fit the whole chart">
                  <IconButton size="small" onClick={() => setZoom(fitZoom())} aria-label="Fit the chart to the window">
                    <FitScreenRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
              {isFull ? (
                <Button size="small" variant="contained" startIcon={<FullscreenExitRounded />} onClick={exitFull}>
                  Exit full screen
                </Button>
              ) : (
                <Tooltip title="Full screen (Esc to leave)">
                  <IconButton size="small" onClick={fullscreen.enter} aria-label="Show the chart full screen">
                    <FullscreenRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </Surface>
        )}

        {loading && !slice && <ChartSkeleton />}

        {!loading && slice && !slice.linked && (
          <EmptyState title="No place to show yet" hint={slice.reason ?? ''} />
        )}

        {slice && slice.linked && model && scene && (
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Box
              ref={setStageEl}
              sx={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', ...highlight }}
            >
              <OrgChartCanvas
                scene={scene}
                zoom={zoomNow}
                fontFamily={palette.fontUi}
                selected={selected}
                accessibleName={`Your place in the organisation as at ${slice.asOf}, ${slice.counts.positions} positions`}
                textAlternative={describeChart(model, visibleIds, 'all')}
                onSelect={onCanvasSelect}
                onOpenCard={onCanvasOpen}
                onToggleCollapse={toggleCollapse}
                onNavigate={navigate}
                onZoom={setZoomClamped}
              />
            </Box>
            <Typography
              title="Scroll to zoom; drag to pan. Click a box for its details. Your own seat is outlined."
              sx={{
                fontSize: 12,
                color: 'var(--c-text-3)',
                mt: 0.5,
                flexShrink: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Your seat is outlined · scroll to zoom · drag to pan · click a box for details
              {secondaryCount > 0 && ' · dashed lines are non-primary reporting'}
            </Typography>
          </Box>
        )}

        <OrgChartFloatingPanel
          ref={panelRef}
          open={cardId != null}
          label={panelTitle}
          title={
            <Typography sx={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
              {panelTitle}
            </Typography>
          }
          onClose={closePanel}
          boundsEl={stageEl}
          relayout={String(isFull)}
          storageKey={key('panelPos')}
        >
          {slice && (
            <MyOrgChartCard slice={slice} positionId={cardId} company={company} teamSize={panelTeam}>
              {cardId != null && panelTeam > 0 && (
                <OrgChartPanel
                  teamSize={panelTeam}
                  arrange={arrange[cardId] || 'auto'}
                  onArrange={(a) =>
                    setArrange((prev) => {
                      const next = { ...prev };
                      if (a === 'auto') delete next[cardId];
                      else next[cardId] = a;
                      return next;
                    })
                  }
                  collapsed={collapsed.has(cardId)}
                  onToggleCollapse={() => toggleCollapse(cardId)}
                />
              )}
            </MyOrgChartCard>
          )}
        </OrgChartFloatingPanel>
      </Box>
    </Stack>
  );
}
