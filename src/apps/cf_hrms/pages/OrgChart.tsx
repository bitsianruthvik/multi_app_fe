import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, Stack, Typography, useTheme } from '@mui/material';
import ImageRounded from '@mui/icons-material/ImageRounded';
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded';
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
  departmentOfSeat,
  departmentTree,
  describeChart,
  makeFonts,
  normaliseShow,
  openAbove,
  readPalette,
  subtreeIds,
  type Arrange,
  type ChartShow,
  type ShiftFilter,
} from '../components/orgChartLayout';
import { OrgChartCanvas, type NavDirection } from '../components/OrgChartCanvas';
import { OrgChartTable } from '../components/OrgChartTable';
import {
  OrgChartToolbar,
  type OrgChartView,
  type RootOption,
} from '../components/OrgChartToolbar';
import { OrgChartPanel } from '../components/OrgChartPanel';
import { OrgChartCard } from '../components/OrgChartCardModal';
import {
  OrgChartFloatingPanel,
  type FloatingPanelHandle,
} from '../components/OrgChartFloatingPanel';
import { useFullscreen } from '../components/useFullscreen';
import { OpenPointsList } from '../components/OrgChartOpenPoints';
import { useOpenPoints } from '../components/useOpenPoints';
import { OrgChartDepartments } from '../components/OrgChartDepartments';
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
 *
 * FOUR VIEWS, ONE SCREEN (spec §13). Chart and Table draw the same rows under
 * the same filters. Departments answers "what is this unit accountable for"
 * from `GET /orgchart/departments`, borrowing this page's graph for titles and
 * seat counts. Doubts is the open-points list, fetched here rather than in the
 * tab so the tab can carry its count before anyone opens it.
 */

const SHIFT_NAME: Record<ShiftFilter, string> = {
  all: 'All shifts',
  D: 'Day shift',
  N: 'Night shift',
};

/** Preference keys are per company: a root id from another tenant is meaningless. */
const ORG_CHART_VIEWS: OrgChartView[] = ['chart', 'table', 'departments', 'doubts'];

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
  // The URL wins over the stored preference, so a link to ?view=departments
  // opens on Departments whatever this viewer last looked at.
  const [view, setView] = useState<OrgChartView>(() => {
    const wanted = params.get('view') || readPref<string>(key('view'), 'chart');
    return ORG_CHART_VIEWS.includes(wanted as OrgChartView) ? (wanted as OrgChartView) : 'chart';
  });
  const chartLike = view === 'chart' || view === 'table';
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
  // What is drawn (spec §16), and the DEPARTMENT fold that goes with boxes.
  // The seat fold above (`collapsed`) is the fold of the plain tree; with
  // departments drawn the fold is the department's and that one is not read.
  const [show, setShow] = useState<ChartShow>(() => normaliseShow(readPref<Partial<ChartShow>>(key('show'), {})));
  const [deptClosed, setDeptClosed] = useState<Set<number>>(
    () => new Set(readPref<number[]>(key('deptClosed'), [])),
  );
  const [deptFoldTouched, setDeptFoldTouched] = useState<boolean>(
    () => readPref<boolean>(key('deptFoldTouched'), false),
  );
  const [deptFoldSettled, setDeptFoldSettled] = useState(false);

  const [selected, setSelected] = useState<number | null>(null);
  // The box the floating panel shows; null = panel closed (spec §14).
  const [cardId, setCardId] = useState<number | null>(null);
  const panelRef = useRef<FloatingPanelHandle>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const fullscreen = useFullscreen();

  // Fetched on arrival, not when the tab opens: the tab shows the count.
  const points = useOpenPoints();
  const [exporting, setExporting] = useState(false);

  // A callback ref, not useRef: the stage only exists once the graph has
  // loaded, so an effect keyed on mount would observe nothing and the chart
  // would open at 100% instead of a readable fit.
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const stageWidth = stage.w;
  // The region = toolbar + chart. A fixed-height panel on Chart and Table, so
  // the PAGE never scrolls there and the wheel is free to zoom (spec §14).
  const [pageEl, setPageEl] = useState<HTMLDivElement | null>(null);
  const [regionEl, setRegionEl] = useState<HTMLDivElement | null>(null);
  const [regionH, setRegionH] = useState<number | null>(null);

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
  useEffect(() => {
    writePref(prefKey(company, 'view'), view);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (view === 'chart') next.delete('view');
        else next.set('view', view);
        return next;
      },
      { replace: true },
    );
  }, [view, company, setParams]);
  useEffect(() => writePref(prefKey(company, 'collapsed'), [...collapsed]), [collapsed, company]);
  useEffect(() => writePref(prefKey(company, 'foldTouched'), foldTouched), [foldTouched, company]);
  useEffect(() => writePref(prefKey(company, 'arrange'), arrange), [arrange, company]);
  useEffect(() => writePref(prefKey(company, 'show'), show), [show, company]);
  useEffect(() => writePref(prefKey(company, 'deptClosed'), [...deptClosed]), [deptClosed, company]);
  useEffect(() => writePref(prefKey(company, 'deptFoldTouched'), deptFoldTouched), [deptFoldTouched, company]);
  useEffect(() => {
    if (zoom != null) writePref(prefKey(company, 'zoom'), zoom);
  }, [zoom, company]);

  useEffect(() => {
    if (!stageEl) return;
    const read = () => setStage({ w: stageEl.clientWidth, h: stageEl.clientHeight });
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(stageEl);
    return () => ro.disconnect();
  }, [stageEl]);

  /*
   * THE REGION FILLS WHAT IS LEFT OF THE WINDOW (spec §14).
   *
   * The shell scrolls its <main>, not the document. So the region's height is
   * main's visible height minus everything above the region and main's own
   * bottom padding — measured, because the stat strip and the toolbar wrap to a
   * different height at every width. Re-measured whenever main or the page
   * resizes; the result does not depend on the region's own height, so setting
   * it cannot feed back into another measurement.
   *
   * A floor of the toolbar plus 360px of chart: on a phone the header, the
   * strip and a five-row toolbar take most of the screen (measured: 101px of
   * chart left at 375 x 812), and a sliver of chart is worse than a page that
   * scrolls there. Full screen is the answer on a phone, and it is in the toolbar.
   */
  const scrollEl = pageEl?.closest('main') ?? null;
  const { active: isFull, exit: exitFull } = fullscreen;
  useLayoutEffect(() => {
    // Not while full screen: the region is fixed then, and measuring it would
    // store a height for a layout it is not in.
    if (!regionEl || !scrollEl || !chartLike || isFull) return;
    const measure = () => {
      const mainRect = scrollEl.getBoundingClientRect();
      const top = regionEl.getBoundingClientRect().top - mainRect.top + scrollEl.scrollTop;
      const pad = parseFloat(getComputedStyle(scrollEl.firstElementChild ?? scrollEl).paddingBottom) || 0;
      // The toolbar is the region's first child; keep at least 360px of chart under it.
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
  }, [regionEl, scrollEl, pageEl, chartLike, isFull]);

  // Full screen belongs to Chart and Table; Departments and Doubts read as pages.
  useEffect(() => {
    if (isFull && !chartLike) exitFull();
  }, [isFull, chartLike, exitFull]);

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
    // A background tab runs no animation frames; the timer covers a chart that
    // was opened there before the token stylesheet had been applied.
    const late = window.setTimeout(read, 400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(late);
    };
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

  // Departments are drawn as boxes when the switch is on AND the payload has a
  // department tree (a backend older than 2026-10-10 sends none).
  const boxed = show.departments && !!model && model.departments.length > 0;
  // The box tree with nothing closed: depths for the opening fold, parents for
  // opening the boxes above a seat. Recomputed per payload / start, not per frame.
  const deptTree = useMemo(
    () =>
      model && boxed
        ? departmentTree(model, { root, filter: shift, collapsed: new Set(), arrange: {}, fonts, show })
        : null,
    [model, boxed, root, shift, fonts, show],
  );

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
      show,
      deptClosed,
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
  }, [model, counts, root, shift, collapsed, arrange, fonts, palette, colours, show, deptClosed, rootNode, asOf]);

  // ── Zoom ────────────────────────────────────────────────────────────────
  /** The Fit button: the whole chart, however small that has to be. */
  const fitZoom = useCallback(() => {
    if (!scene || !stage.w) return 1;
    // Both ways since §14: the chart now lives in a panel of known height.
    const byH = stage.h > 60 ? (stage.h - 28) / scene.height : Infinity;
    return Math.min(1, Math.max(0.15, Math.min((stage.w - 28) / scene.width, byH)));
  }, [scene, stage]);

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
  /*
   * The same opening, for departments (spec §16): the top box and the boxes
   * hanging straight from it open, everything deeper closed to a name and a
   * count. Depth is the BOX tree's — measured over the whole organisation, so
   * starting from a branch does not change which boxes are shut.
   */
  const OPENING_DEPT_DEPTH = 2;
  useEffect(() => {
    if (deptFoldSettled || !model) return;
    if (!model.departments.length || deptFoldTouched || deptClosed.size > 0) { setDeptFoldSettled(true); return; }
    const tree = departmentTree(model, { root: '', filter: 'all', collapsed: new Set(), arrange: {}, fonts });
    const fold = new Set<number>();
    for (const b of tree.values()) if (b.depth >= OPENING_DEPT_DEPTH && b.canToggle) fold.add(b.id);
    if (fold.size) setDeptClosed(fold);
    setDeptFoldSettled(true);
  }, [deptFoldSettled, deptFoldTouched, deptClosed.size, model, fonts]);

  useEffect(() => {
    if (zoom == null && foldSettled && deptFoldSettled && scene && stageWidth) {
      setZoom(Math.min(1, Math.max(0.55, (stageWidth - 28) / scene.width)));
    }
  }, [zoom, foldSettled, deptFoldSettled, scene, stageWidth]);

  const setZoomClamped = (z: number) => setZoom(Math.min(2.5, Math.max(0.15, z)));

  // ── Interactions ────────────────────────────────────────────────────────
  const toggleDept = useCallback((id: number) => {
    setDeptFoldTouched(true);
    setDeptClosed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Opens every box above a seat, so a seat picked from a list is on the canvas. */
  const reveal = useCallback(
    (id: number) => {
      if (!model || !deptTree) return;
      setDeptClosed((prev) => openAbove(deptTree, prev, departmentOfSeat(model, id)));
    },
    [model, deptTree],
  );

  const toggleCollapse = useCallback((id: number) => {
    // With departments drawn the fold belongs to the department (its title);
    // Space on a seat does nothing rather than hide the seat under the cursor.
    if (boxed) return;
    setFoldTouched(true);
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [boxed]);

  const navigate = useCallback(
    (from: number, dir: NavDirection): number | null => {
      if (!model || !scene) return null;
      const placed = scene.layout.placed;
      const ok = (id: number | undefined) => (id != null && placed.has(id) ? id : null);
      if (dir === 'up') return ok(model.parent.get(from));
      if (dir === 'down') {
        if (!boxed && collapsed.has(from)) return null;
        // First report that is on the canvas (one in a closed department is not).
        return ok((model.children.get(from) ?? []).find((k) => placed.has(k)));
      }
      const parentId = model.parent.get(from);
      const sibs =
        parentId != null && placed.has(parentId)
          ? (model.children.get(parentId) ?? [])
          : visibleIds.filter((id) => {
              const p = model.parent.get(id);
              return p === undefined || !placed.has(p);
            });
      const shown = sibs.filter((id) => placed.has(id));
      const i = shown.indexOf(from);
      if (i < 0) return null;
      return ok(shown[dir === 'left' ? i - 1 : i + 1]);
    },
    [model, scene, collapsed, visibleIds, boxed],
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

  // ── The floating panel (spec §14) ───────────────────────────────────────
  /** Open a position in the panel from anywhere: a box, a table row, a search hit. */
  const openCard = useCallback(
    (id: number) => {
      reveal(id);
      setSelected(id);
      setCardId(id);
    },
    [reveal],
  );

  const closePanel = useCallback(() => {
    const id = cardId;
    setCardId(null);
    // Hand the keyboard back to the box the panel described, so Esc in the
    // panel lands the viewer where they were in the chart.
    if (id != null && view === 'chart') {
      const el = document.getElementById(`orgchart-node-${id}`) as unknown as HTMLElement | null;
      el?.focus({ preventScroll: true });
    }
  }, [cardId, view]);

  // A box: Enter (or a click) opens the panel and LEAVES FOCUS ON THE BOX, so
  // the arrow keys keep walking the chart; the panel follows the selection
  // while it is open. Enter on the box the panel already shows moves focus in.
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

  const panelNode = cardId != null && model ? model.byId.get(cardId) : null;
  const panelTitle = panelNode?.displayTitle || panelNode?.title || 'Position';
  const panelBox = cardId != null && model && boxed ? scene?.layout.dept?.boxes.get(departmentOfSeat(model, cardId)) : undefined;
  // Inside a box, a seat arranges only the reports that sit in the box with it.
  const panelTeam =
    cardId != null && model
      ? (model.children.get(cardId) ?? []).filter((k) => !panelBox || panelBox.members.includes(k)).length
      : 0;
  const closedBoxes = boxed && scene?.layout.dept ? [...scene.layout.dept.boxes.values()].filter((b) => !b.open).length : 0;
  const foldedSeats = [...collapsed].filter((id) => visibleIds.includes(id)).length;
  const foldedCount = boxed ? closedBoxes : foldedSeats;
  const foldedLabel = boxed
    ? `Open all (${closedBoxes} closed)`
    : `Expand all (${foldedSeats} folded)`;

  return (
    <Stack spacing={2} ref={setPageEl}>
      <PageHeader
        title="Org chart"
        subtitle="Positions, who is in them, and who they answer to"
        actions={
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button size="small" startIcon={<SearchRounded />} onClick={() => setSearchOpen(true)}>
              Search KRAs
            </Button>
            {/* The exports draw the chart, so they belong to the views that are the chart. */}
            {chartLike && (
              <>
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
              </>
            )}
          </Stack>
        }
      />

      {chartLike && <StatStrip stats={stats} />}

      {!!error && <ErrorNotice error={error} onRetry={load} />}

      {/*
        THE REGION: toolbar + chart. On Chart and Table it is a fixed-height
        panel filling the rest of the window (measured above), so the page does
        not scroll and the wheel zooms. In full screen it is fixed over the
        whole viewport while the DOCUMENT is the browser's full-screen element
        (useFullscreen explains why not this element).
      */}
      <Box
        ref={setRegionEl}
        data-orgregion=""
        sx={
          isFull
            ? {
                position: 'fixed',
                inset: 0,
                // The page Stack's spacing is a margin-top on this child, by a
                // selector that outranks a plain sx margin.
                mt: '0 !important',
                zIndex: 'var(--z-sheet)',
                background: 'var(--c-canvas)',
                p: { xs: 1, sm: 1.5 },
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
              }
            : chartLike
              ? {
                  height: regionH ?? 560,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }
              : { display: 'flex', flexDirection: 'column', gap: 2 }
        }
      >
        {model && scene && (
          <Box sx={{ flexShrink: 0 }}>
            <OrgChartToolbar
              view={view}
              onView={setView}
              // No number until there is one: a "0" while loading, or after a failed
              // load, would say there is nothing to answer.
              doubtsCount={points.error || (points.loading && !points.groups.length) ? undefined : points.total}
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
              show={show}
              onShow={setShow}
              foldedLabel={foldedLabel}
              collapsedCount={foldedCount}
              onExpandAll={() => {
                if (boxed) { setDeptFoldTouched(true); setDeptClosed(new Set()); }
                else { setFoldTouched(true); setCollapsed(new Set()); }
              }}
              fullscreen={isFull}
              onFullscreen={(on) => (on ? fullscreen.enter() : exitFull())}
              asOf={asOf}
              onAsOf={setAsOf}
            />
          </Box>
        )}

        {loading && (chartLike || !model) && <ChartSkeleton />}

        {chartLike && !loading && !error && model && model.byId.size === 0 && (
          <EmptyState
            title="No positions yet"
            hint="Import the organisation chart, or create positions, and they will appear here."
          />
        )}

        {chartLike && !loading && model && scene && model.byId.size > 0 && (
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Box
              ref={setStageEl}
              sx={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}
            >
              {view === 'chart' ? (
                <OrgChartCanvas
                  scene={scene}
                  zoom={zoom ?? 1}
                  fontFamily={palette.fontUi}
                  selected={selected}
                  accessibleName={`Organisation chart as at ${asOf}, ${counts?.positions ?? 0} positions`}
                  textAlternative={describeChart(model, visibleIds, shift)}
                  onSelect={onCanvasSelect}
                  onOpenCard={onCanvasOpen}
                  onToggleCollapse={toggleCollapse}
                  onToggleDept={toggleDept}
                  onNavigate={navigate}
                  onZoom={setZoomClamped}
                />
              ) : (
                <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                  <OrgChartTable
                    model={model}
                    ids={visibleIds}
                    filter={shift}
                    secondaryEdges={model.secondary}
                    onOpen={openCard}
                  />
                </Box>
              )}
            </Box>
            {view === 'chart' && (
              // One line, truncated: every pixel of this region's height is chart.
              // The whole sentence is the title, and the keys are in the panel's
              // own labels and the box's accessible name.
              <Typography
                title={
                  'Scroll to zoom; drag, Shift + scroll or a sideways swipe to pan. Click a box for its details, ' +
                  'or tab into the chart and use the arrow keys: Enter opens the panel, Enter again moves into it, ' +
                  'Esc closes it, Space folds a branch.' +
                  (secondaryCount > 0
                    ? ` ${secondaryCount} dashed line${secondaryCount === 1 ? '' : 's'} show reporting that is not the primary one.`
                    : '')
                }
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
                Scroll to zoom · drag to pan · click a seat for details
                {boxed ? ' · click a department name to open or close it' : ' · Space folds a branch'} · arrows walk
                the chart, Enter opens the panel
                {secondaryCount > 0 && ` · ${secondaryCount} dashed lines are non-primary reporting`}
              </Typography>
            )}
          </Box>
        )}

        {/* Inside the region so it rides into full screen with the chart. */}
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
          // Over the chart on Chart and Table; over the app's scrolling main
          // region on Departments and Doubts, which read as ordinary pages.
          boundsEl={chartLike ? stageEl : scrollEl}
          relayout={`${isFull}:${view}`}
          storageKey={key('panelPos')}
        >
          <OrgChartCard
            positionId={cardId}
            asOf={asOf}
            company={company}
            onClose={() => setCardId(null)}
            onChanged={load}
            onStartFrom={(id) => {
              setRoot(id);
              // "Start from here" is a chart instruction; from Departments or
              // Doubts it would otherwise change nothing the viewer can see.
              if (!chartLike) setView('chart');
            }}
          >
            {view === 'chart' && cardId != null && (
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
                department={
                  panelBox
                    ? { name: panelBox.name, canClose: panelBox.canToggle, onClose: () => toggleDept(panelBox.id) }
                    : undefined
                }
              />
            )}
          </OrgChartCard>
        </OrgChartFloatingPanel>
      </Box>

      {view === 'departments' && model && (
        <OrgChartDepartments
          company={company}
          asOf={asOf}
          onAsOf={setAsOf}
          model={model}
          onOpenCard={openCard}
        />
      )}

      {view === 'doubts' && (
        <Surface e={1} sx={{ p: { xs: 1.75, sm: 2.25 } }}>
          {!points.error && !(points.loading && !points.groups.length) && points.total > 0 && (
            <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)', mb: 1.5 }}>
              {points.total} question{points.total === 1 ? '' : 's'} the chart cannot answer by itself.
            </Typography>
          )}
          <OpenPointsList
            groups={points.groups}
            loading={points.loading}
            error={points.error}
            onRetry={points.reload}
            onChanged={points.reload}
            canManage={canManage}
            onPick={openCard}
          />
        </Surface>
      )}

      <OrgChartSearch
        open={searchOpen}
        asOf={asOf}
        onClose={() => setSearchOpen(false)}
        onPick={openCard}
      />
    </Stack>
  );
}
