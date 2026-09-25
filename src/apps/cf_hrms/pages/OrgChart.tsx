import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, Stack, Typography, useTheme } from '@mui/material';
import ImageRounded from '@mui/icons-material/ImageRounded';
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  ChartSkeleton,
  EmptyState,
  ErrorNotice,
  PageHeader,
  StatStrip,
  Surface,
  readPref,
  useIsPermitted,
  useToast,
  writePref,
} from '@shared/ui';
import type { Stat } from '@shared/ui';
import type { OrgChartGraph } from '../api/orgchart';
import { orgChartApi } from '../api/orgchart';
import {
  buildModel,
  buildScene,
  countRows,
  describeChart,
  makeFonts,
  readPalette,
  subtreeIds,
  type Arrange,
  type ShiftFilter,
} from '../components/orgChartLayout';
import { OrgChartCanvas, type NavDirection } from '../components/OrgChartCanvas';
import { OrgChartTable } from '../components/OrgChartTable';
import { OrgChartToolbar, type RootOption } from '../components/OrgChartToolbar';
import { OrgChartPanel } from '../components/OrgChartPanel';
import { OrgChartCardModal } from '../components/OrgChartCardModal';
import { OrgChartOpenPoints } from '../components/OrgChartOpenPoints';
import { OrgChartSearch } from '../components/OrgChartSearch';
import { exportPdf, exportPng } from '../components/OrgChartExport';

/**
 * The org chart — the screen this application exists to replace, and the one
 * the client prints and puts on a wall.
 *
 * DESIGN_SYSTEM.md §4.5 Canvas / Builder: a full-bleed canvas with solid
 * floating panels, and a keyboard/list alternative that is not optional. The
 * Table toggle *is* that alternative and carries the same rows under the same
 * filters — §6.4.
 *
 * THE NUMBER THIS SCREEN EXISTS FOR IS 156. Karni has 169 sanctioned seats and
 * 13 people. Every design decision here serves making that legible: vacancies
 * are drawn as empty rows rather than omitted, a day/night seat shows both its
 * shifts, and the summary strip counts exactly the rows the chart draws so it
 * can never flatter the picture beneath it.
 *
 * VIEW STATE IS THE VIEWER'S. Zoom, folded branches, arrangement overrides, the
 * shift filter and the attendance tint are per-person preferences in
 * localStorage. None of it is org data and there is no `chart_arrange` column
 * (spec §9, "What is NOT in the API").
 */

const SHIFT_NAME: Record<ShiftFilter, string> = {
  all: 'All shifts',
  D: 'Day shift',
  N: 'Night shift',
};

/** Preference keys are per company: a root id from another tenant is meaningless. */
const prefKey = (company: string, suffix: string) => `orgchart:${company}:${suffix}`;

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function OrgChart() {
  const { company = '' } = useParams<{ company: string }>();
  const theme = useTheme();
  const can = useIsPermitted();
  const canManage = can('cf_hrms_org_manage');
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const key = (suffix: string) => prefKey(company, suffix);

  const [graph, setGraph] = useState<OrgChartGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [asOf, setAsOf] = useState<string>(() => params.get('on') || today());
  const [root, setRoot] = useState<number | ''>(() => {
    const fromUrl = Number(params.get('root'));
    return fromUrl > 0 ? fromUrl : readPref<number | ''>(key('root'), '');
  });
  const [shift, setShift] = useState<ShiftFilter>(() => readPref<ShiftFilter>(key('shift'), 'all'));
  const [colours, setColours] = useState<boolean>(() => readPref<boolean>(key('colours'), true));
  const [view, setView] = useState<'chart' | 'table'>(() =>
    readPref<'chart' | 'table'>(key('view'), 'chart'),
  );
  const [panelOpen, setPanelOpen] = useState<boolean>(() => readPref<boolean>(key('panel'), true));
  const [collapsed, setCollapsed] = useState<Set<number>>(
    () => new Set(readPref<number[]>(key('collapsed'), [])),
  );
  // Whether this viewer has ever folded anything here. Until they have, the
  // chart picks its own opening fold (see `useEffect` below); once they touch
  // it, their choice is theirs and nothing re-folds behind them.
  // Set once the opening fold has been decided. The opening ZOOM must not be
  // measured before it: the unfolded scene is 8,374px wide, so a zoom computed
  // against it floors at 55% and then never recomputes, leaving four boxes on a
  // 1,680px screen at half size.
  const [foldSettled, setFoldSettled] = useState(false);
  const [foldTouched, setFoldTouched] = useState<boolean>(
    () => readPref<boolean>(key('foldTouched'), false),
  );
  const [arrange, setArrange] = useState<Record<number, Arrange>>(() =>
    readPref<Record<number, Arrange>>(key('arrange'), {}),
  );
  const [zoom, setZoom] = useState<number | null>(() => readPref<number | null>(key('zoom'), null));

  const [selected, setSelected] = useState<number | null>(null);
  const [cardId, setCardId] = useState<number | null>(null);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // A callback ref, not useRef: the stage only exists once the graph has
  // loaded, so an effect keyed on mount would observe nothing and the chart
  // would open at 100% instead of a readable fit.
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [stageWidth, setStageWidth] = useState(0);

  // ── Data ────────────────────────────────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true);
    orgChartApi
      .graph({ on: asOf })
      .then((g) => {
        setGraph(g);
        setError(null);
      })
      .catch((e) => {
        setGraph(null);
        setError(e);
      })
      .finally(() => setLoading(false));
  }, [asOf]);

  useEffect(() => {
    load();
  }, [load]);

  // The whole graph travels in one payload, so re-rooting is a client-side
  // filter and costs nothing — no refetch, no flash, no lost scroll position.
  useEffect(() => {
    writePref(prefKey(company, 'root'), root);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (root) next.set('root', String(root));
        else next.delete('root');
        return next;
      },
      { replace: true },
    );
  }, [root, company, setParams]);

  useEffect(() => writePref(prefKey(company, 'shift'), shift), [shift, company]);
  useEffect(() => writePref(prefKey(company, 'colours'), colours), [colours, company]);
  useEffect(() => writePref(prefKey(company, 'view'), view), [view, company]);
  useEffect(() => writePref(prefKey(company, 'panel'), panelOpen), [panelOpen, company]);
  useEffect(() => writePref(prefKey(company, 'collapsed'), [...collapsed]), [collapsed, company]);
  useEffect(() => writePref(prefKey(company, 'foldTouched'), foldTouched), [foldTouched, company]);
  useEffect(() => writePref(prefKey(company, 'arrange'), arrange), [arrange, company]);
  useEffect(() => {
    if (zoom != null) writePref(prefKey(company, 'zoom'), zoom);
  }, [zoom, company]);

  useEffect(() => {
    if (!stageEl) return;
    setStageWidth(stageEl.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setStageWidth(stageEl.clientWidth));
    ro.observe(stageEl);
    return () => ro.disconnect();
  }, [stageEl]);

  // ── Model and scene ─────────────────────────────────────────────────────
  const model = useMemo(() => (graph ? buildModel(graph) : null), [graph]);

  // Dark mode re-tones every tint, and the SVG holds resolved colours rather
  // than var(--…) so the export can carry them into a file with no stylesheet.
  // Read after paint as well as on mount: ThemeScope sets data-ui='platform' in
  // its own effect, which runs AFTER a child's, so a first read during mount can
  // land before the tokens exist.
  const [palette, setPalette] = useState(() => readPalette());
  useEffect(() => {
    const read = () => setPalette(readPalette());
    read();
    const raf = requestAnimationFrame(read);
    return () => cancelAnimationFrame(raf);
  }, [theme.palette.mode]);
  const fonts = useMemo(() => makeFonts(palette.fontUi), [palette.fontUi]);

  const visibleIds = useMemo(
    () => (model ? subtreeIds(model, root) : []),
    [model, root],
  );

  const counts = useMemo(
    () => (model ? countRows(model, visibleIds, shift) : null),
    [model, visibleIds, shift],
  );

  const rootNode = root && model ? model.byId.get(root) : null;

  const scene = useMemo(() => {
    if (!model || !counts) return null;
    return buildScene(model, {
      root,
      filter: shift,
      collapsed,
      arrange,
      fonts,
      palette,
      colours,
      secondaryEdges: model.secondary,
      header: {
        title: rootNode ? `${rootNode.displayTitle || rootNode.title} — and below` : 'Organisation chart',
        meta: `As at ${asOf}     |     ${SHIFT_NAME[shift]}`,
        counts:
          `Positions ${counts.positions}     Seats ${counts.seats}     Filled ${counts.filled}     Vacant ${counts.vacant}` +
          (counts.present || counts.absent
            ? `     Present ${counts.present}     Absent ${counts.absent}`
            : ''),
      },
    });
  }, [model, counts, root, shift, collapsed, arrange, fonts, palette, colours, rootNode, asOf]);

  // ── Zoom ────────────────────────────────────────────────────────────────
  /** The Fit button: the whole chart, however small that has to be. */
  const fitZoom = useCallback(() => {
    if (!scene || !stageWidth) return 1;
    return Math.min(1, Math.max(0.15, (stageWidth - 28) / scene.width));
  }, [scene, stageWidth]);

  /**
   * THE CHART OPENS FOLDED, NOT FITTED.
   *
   * Measured on Karni's real chart, in a 1100px pane:
   *
   *   folded to depth 3    11 boxes     574 x  864   fits at 100%
   *   folded to depth 4    24 boxes    1822 x 1186   fits at  59%
   *   nothing folded      114 boxes    8374 x 1750   fits at  13%
   *
   * The first cut opened everything and floored the zoom at 40%, reasoning that
   * legible-and-partial beats complete-and-illegible. That was the right idea
   * and the wrong lever: 48% of a 214px box is 6px text, so it was neither
   * legible nor complete, and the only way to read anything was to zoom the
   * BROWSER — which also scales every dialog, because a dialog portals to the
   * body and knows nothing about the canvas.
   *
   * Folding is the lever that actually works. Three levels is the leadership
   * structure — the thing you want on opening — at full size, and every folded
   * box says how many people are underneath it. Expanding is one click, "Expand
   * all" is still there, and the moment the viewer folds anything themselves
   * this stops second-guessing them.
   */
  const OPENING_FOLD_DEPTH = 3;

  useEffect(() => {
    if (foldSettled) return;
    if (foldTouched || collapsed.size > 0) { setFoldSettled(true); return; }
    if (!model) return;
    const fold = new Set<number>();
    for (const [id, d] of model.depth) {
      if (d >= OPENING_FOLD_DEPTH && (model.children.get(id)?.length ?? 0) > 0) fold.add(id);
    }
    if (fold.size) setCollapsed(fold);
    setFoldSettled(true);
  }, [foldSettled, foldTouched, model, collapsed.size]);

  /**
   * Zoom follows the fold: fit what is showing, but never shrink below 55% —
   * past that the occupant rows stop being readable and the chart is decoration.
   * Panning a slightly-too-wide chart is a better trade than squinting at all of it.
   */
  useEffect(() => {
    if (zoom == null && foldSettled && scene && stageWidth) {
      setZoom(Math.min(1, Math.max(0.55, (stageWidth - 28) / scene.width)));
    }
  }, [zoom, foldSettled, scene, stageWidth]);

  const setZoomClamped = (z: number) => setZoom(Math.min(2.5, Math.max(0.15, z)));

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
      if (dir === 'down') {
        if (collapsed.has(from)) return null;
        return ok((model.children.get(from) ?? [])[0]);
      }
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

  const rootOptions: RootOption[] = useMemo(() => {
    if (!model) return [];
    return subtreeIds(model, '').map((id) => {
      const n = model.byId.get(id)!;
      return {
        id,
        label: n.displayTitle || n.title,
        code: n.positionCode,
        depth: model.depth.get(id) ?? 0,
      };
    });
  }, [model]);

  const stats: Stat[] = useMemo(() => {
    const c = counts;
    const folded = [...collapsed].filter((id) => visibleIds.includes(id)).length;
    return [
      {
        label: 'Positions',
        value: c?.positions ?? 0,
        hint: root
          ? 'Seats in the branch you started from.'
          : 'Every sanctioned seat in the organisation.',
      },
      {
        label: 'Filled',
        value: c?.filled ?? 0,
        tone: 'success',
        hint: 'Seats with somebody working in them, counted over the rows drawn.',
      },
      {
        label: 'Present',
        value: c?.present ?? 0,
        // Present and filled are separate on purpose: no attendance record for
        // the date means unmarked, and reporting that as present would invent a
        // figure the system does not hold.
        hint:
          c && c.unmarked > 0
            ? `Marked present on ${asOf}. ${c.unmarked} filled seat${c.unmarked === 1 ? ' has' : 's have'} no attendance recorded for this date.`
            : `People marked present on ${asOf}.`,
      },
      {
        label: 'Absent',
        value: c?.absent ?? 0,
        tone: 'danger',
        hint: `People marked absent on ${asOf}.`,
      },
      {
        // Deliberately toneless. 156 of 169 seats are empty; painting that red
        // every day is how a screen stops being read (statusMap.ts).
        label: 'Vacant seats',
        value: c?.vacant ?? 0,
        hint:
          `Sanctioned seats with nobody in them${shift === 'all' ? '' : `, ${SHIFT_NAME[shift].toLowerCase()} only`}. ` +
          `A day-and-night seat is counted twice, once per shift, because it is two seats.` +
          (folded ? ` Includes ${folded} folded branch${folded === 1 ? '' : 'es'}.` : ''),
      },
    ];
  }, [counts, root, asOf, shift, collapsed, visibleIds]);

  const doExport = async (kind: 'png' | 'pdf') => {
    if (!scene) return;
    setExporting(true);
    try {
      const name = rootNode ? `Org_chart_${rootNode.positionCode ?? rootNode.id}` : 'Org_chart';
      if (kind === 'png') await exportPng(scene, palette.fontUi, name);
      else await exportPdf(scene, palette.fontUi, `Organisation chart as at ${asOf}`, name);
      toast.success(kind === 'png' ? 'Image downloaded.' : 'PDF downloaded.');
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'The chart could not be exported. Try a smaller branch.',
      );
    } finally {
      setExporting(false);
    }
  };

  const secondaryCount = model?.secondary.length ?? 0;

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Org chart"
        subtitle="Positions, who is in them, and who they answer to"
        actions={
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button size="small" startIcon={<SearchRounded />} onClick={() => setSearchOpen(true)}>
              Search KRAs
            </Button>
            <Button
              size="small"
              startIcon={<HelpOutlineRounded />}
              onClick={() => setPointsOpen(true)}
            >
              Open points
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ImageRounded />}
              disabled={!scene || exporting}
              onClick={() => doExport('png')}
            >
              PNG
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<PictureAsPdfRounded />}
              disabled={!scene || exporting}
              onClick={() => doExport('pdf')}
            >
              PDF
            </Button>
          </Stack>
        }
      />

      <StatStrip stats={stats} />

      {!!error && <ErrorNotice error={error} onRetry={load} />}

      {model && scene && (
        <OrgChartToolbar
          view={view}
          onView={setView}
          rootOptions={rootOptions}
          root={root}
          onRoot={setRoot}
          shift={shift}
          onShift={setShift}
          colours={colours}
          onColours={setColours}
          zoom={zoom ?? 1}
          onZoom={setZoomClamped}
          onFit={() => setZoom(fitZoom())}
          collapsedCount={[...collapsed].filter((id) => visibleIds.includes(id)).length}
          onExpandAll={() => { setFoldTouched(true); setCollapsed(new Set()); }}
          panelOpen={panelOpen}
          onPanel={setPanelOpen}
          asOf={asOf}
          onAsOf={setAsOf}
        />
      )}

      {loading && <ChartSkeleton />}

      {!loading && !error && model && model.byId.size === 0 && (
        <EmptyState
          title="No positions yet"
          hint="Import the organisation chart, or create positions, and they will appear here."
        />
      )}

      {!loading && model && scene && model.byId.size > 0 && (
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={2}
          sx={{
            // An explicit height, and deliberately NOT `flex: 1`: a flex item's
            // basis wins over its height, so the row would grow to the chart's
            // full 2,240px and the page — not the canvas — would scroll, taking
            // the toolbar and the summary strip off screen while panning.
            height: { lg: 'calc(100vh - 330px)' },
            minHeight: { lg: 440 },
            alignItems: 'stretch',
          }}
        >
          <Box
            ref={setStageEl}
            sx={{
              // `flex: 1` only where the row is a row. In the phone layout this
              // stack is a COLUMN, and a flex item's basis beats its height, so
              // `flex: 1` there would stretch the canvas to the chart's full
              // 2,000px and put the scrollbar on the page instead of the chart.
              flex: { xs: '0 0 auto', lg: 1 },
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              minHeight: { xs: 440, lg: 0 },
              height: { xs: '68vh', lg: 'auto' },
            }}
          >
            {view === 'chart' ? (
              <OrgChartCanvas
                scene={scene}
                zoom={zoom ?? 1}
                fontFamily={palette.fontUi}
                selected={selected}
                accessibleName={`Organisation chart as at ${asOf}, ${counts?.positions ?? 0} positions`}
                textAlternative={describeChart(model, visibleIds, shift)}
                onSelect={setSelected}
                onOpenCard={setCardId}
                onToggleCollapse={toggleCollapse}
                onNavigate={navigate}
              />
            ) : (
              <OrgChartTable
                model={model}
                ids={visibleIds}
                filter={shift}
                secondaryEdges={model.secondary}
                onOpen={(id) => {
                  setSelected(id);
                  setCardId(id);
                }}
              />
            )}
            {view === 'chart' && (
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 1 }}>
                Click a box for its card, or tab into the chart and move with the arrow keys — Enter
                opens a card, Space folds a branch.
                {secondaryCount > 0 &&
                  ` ${secondaryCount} dashed line${secondaryCount === 1 ? '' : 's'} show reporting that is not the primary one; a scoped line carries its scope.`}
              </Typography>
            )}
          </Box>

          {panelOpen && (
            <Surface
              e={2}
              sx={{ width: { xs: '100%', lg: 340 }, flexShrink: 0, p: 2, overflow: 'auto' }}
            >
              <OrgChartPanel
                model={model}
                selected={selected}
                filter={shift}
                secondaryEdges={model.secondary}
                company={company}
                arrange={(selected != null && arrange[selected]) || 'auto'}
                onArrange={(a) =>
                  selected != null &&
                  setArrange((prev) => {
                    const next = { ...prev };
                    if (a === 'auto') delete next[selected];
                    else next[selected] = a;
                    return next;
                  })
                }
                collapsed={selected != null && collapsed.has(selected)}
                onToggleCollapse={() => selected != null && toggleCollapse(selected)}
                onStartFrom={() => selected != null && setRoot(selected)}
                onOpenCard={() => selected != null && setCardId(selected)}
              />
            </Surface>
          )}
        </Stack>
      )}

      <OrgChartCardModal
        positionId={cardId}
        asOf={asOf}
        company={company}
        fallbackTitle={
          cardId != null && model
            ? (model.byId.get(cardId)?.displayTitle ?? undefined)
            : undefined
        }
        onClose={() => setCardId(null)}
        onStartFrom={(id) => setRoot(id)}
      />
      <OrgChartOpenPoints
        open={pointsOpen}
        onClose={() => setPointsOpen(false)}
        canManage={canManage}
        onPick={(id) => {
          setSelected(id);
          setCardId(id);
        }}
      />
      <OrgChartSearch
        open={searchOpen}
        asOf={asOf}
        onClose={() => setSearchOpen(false)}
        onPick={(id) => {
          setSelected(id);
          setCardId(id);
        }}
      />
    </Stack>
  );
}
