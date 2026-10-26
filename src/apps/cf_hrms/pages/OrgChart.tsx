import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, Chip, IconButton, Stack, Tooltip, Typography, useTheme } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ImageRounded from '@mui/icons-material/ImageRounded';
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded';
import QuestionAnswerRounded from '@mui/icons-material/QuestionAnswerRounded';
import AutoFixHighRounded from '@mui/icons-material/AutoFixHighRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import {
  ChartSkeleton,
  EmptyState,
  ErrorNotice,
  PageHeader,
  readPref,
  useToast,
  writePref,
} from '@shared/ui';
import type { OrgChartGraph } from '../api/orgchart';
import { orgChartApi } from '../api/orgchart';
import {
  buildModel,
  buildScene,
  cardIdOf,
  countRows,
  departmentOfCard,
  departmentTree,
  describeChart,
  graphForUnits,
  outerUnits,
  makeFonts,
  normaliseShow,
  openAbove,
  readPalette,
  shiftCodeOf,
  shiftNameOf,
  subtreeIds,
  type Arrange,
  type ChartShow,
  type ShiftFilter,
} from '../components/orgChartLayout';
import { OrgChartCanvas, type NavDirection } from '../components/OrgChartCanvas';
import { OrgChartToolbar, type RootOption, type UnitOption } from '../components/OrgChartToolbar';
import { unitLabel } from '../components/orgUnits';
import { OrgChartPanelViews } from '../components/OrgChartPanelViews';
import { OrgChartViewOptions } from '../components/OrgChartViewOptions';
import { OrgChartTitleStrip } from '../components/OrgChartTitleStrip';
import {
  positionView,
  roleViewOfCard,
  viewKind,
  viewTitle,
  type PanelView,
} from '../components/orgChartPanelNav';
import {
  OrgChartFloatingPanel,
  type FloatingPanelHandle,
} from '../components/OrgChartFloatingPanel';
import { useFullscreen } from '../components/useFullscreen';
import { OrgChartAsk, type AskPick } from '../components/OrgChartAsk';
import { CommandBar } from '../components/CommandBar';
import { useCan } from '../access/can';
import { useLabels, labelColour, labelFilterText, matchesLabel } from '../components/labels';
import { LabelViewOptions } from '../components/OrgChartViewOptions';
import { exportPdf, exportPng } from '../components/OrgChartExport';
import { useOrgChartEdit } from '../components/OrgChartEdit';
import { EditBanner } from '../components/OrgChartEditBanner';
import { ReportingCheckSheet } from '../components/ReportingCheck';
import { useConsistency } from '../components/useConsistency';
import { kindColours } from '../components/orgChartKindColours';
import { performanceApi, type ChartBands } from '../api/performance';

/**
 * The org chart — the screen this application exists to replace, and the one
 * the client prints and puts on a wall.
 *
 * DESIGN_SYSTEM.md §4.5 Canvas / Builder: a full-bleed canvas with solid
 * floating panels, and a keyboard alternative that is not optional: arrow keys
 * walk the chart and the text alternative describes it — §6.4.
 *
 * WHAT IS DRAWN (2026-10-10): a card per ROLE in a department, a row per
 * POSITION in it — one chair, one person, one shift. The card's headline opens
 * the role; a row opens that position.
 *
 * THE NUMBERS THIS SCREEN EXISTS FOR ARE THE VACANCIES. Vacant positions are
 * drawn as rows that say Vacant rather than omitted, and every count on the
 * page — the title strip, a closed department — comes from one
 * rule (`countPositions`), so the summary can never flatter the picture
 * beneath it: positions = filled + vacant.
 *
 * VIEW STATE IS THE VIEWER'S. Zoom, folded branches, arrangement overrides, the
 * shift filter and the attendance tint are per-person preferences in
 * localStorage. None of it is org data and there is no `chart_arrange` column
 * (spec §9, "What is NOT in the API").
 */

const SHIFT_ORDER: Record<string, number> = { G: 0, D: 1, N: 2 };

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
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const can = useCan();
  const mayDoInWords = can.org.edit || can.roles.edit || can.positions.edit;
  // "Do it in words" (spec §14): open from the button, or from ⌘K (…/org-chart?words=1).
  const [wordsOpen, setWordsOpen] = useState(() => params.get('words') === '1');
  // Edit mode (spec §34.5): the same rights as "Do it in words". Off on every visit.
  const mayEdit = mayDoInWords;
  const [editing, setEditing] = useState(false);
  const [openAfterLoad, setOpenAfterLoad] = useState<number | null>(null);

  const key = (suffix: string) => prefKey(company, suffix);

  const [graph, setGraph] = useState<OrgChartGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [asOf, setAsOf] = useState<string>(() => params.get('on') || today());
  const [root, setRoot] = useState<number | ''>(() => {
    const fromUrl = Number(params.get('root'));
    return fromUrl > 0 ? fromUrl : readPref<number | ''>(key('root'), '');
  });
  // Start from ONE OR MORE org units (spec §34.2): ?start=12,40, else the viewer's last pick.
  // A unit pick and a card root (?root=) never hold at once.
  const [units, setUnits] = useState<number[]>(() => {
    const fromUrl = (params.get('start') ?? '').split(',').map(Number).filter((n) => n > 0);
    if (fromUrl.length) return fromUrl;
    if (Number(params.get('root')) > 0) return [];
    const stored = readPref<number[]>(key('startUnits'), []);
    return Array.isArray(stored) ? stored.filter((n) => Number(n) > 0) : [];
  });
  const [shift, setShift] = useState<ShiftFilter>(() => readPref<ShiftFilter>(key('shift'), 'all'));
  const [colours, setColours] = useState<boolean>(() => readPref<boolean>(key('colours'), true));
  // Labels on the chart: colour the department boxes by their label, and draw
  // positions outside the chosen label faint. The viewer's own, kept in this browser.
  const [colourBy, setColourBy] = useState<boolean>(() => readPref<boolean>(key('colourByLabel'), false) === true);
  const [labelFilter, setLabelFilter] = useState<string>(() => readPref<string>(key('labelFilter'), ''));
  // "Colour by performance" (spec §19.3): '' off · 'now' the plans whose period holds today · a period id.
  const [perfBy, setPerfBy] = useState<string>(() => readPref<string>(key('performanceBy'), ''));
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
  // The card fold above (`collapsed`) is the fold of the plain tree; with
  // departments drawn the fold is the department's and that one is not read.
  const [show, setShow] = useState<ChartShow>(() => normaliseShow(readPref<Partial<ChartShow>>(key('show'), {})));
  const [deptClosed, setDeptClosed] = useState<Set<number>>(
    () => new Set(readPref<number[]>(key('deptClosed'), [])),
  );
  const [deptFoldTouched, setDeptFoldTouched] = useState<boolean>(
    () => readPref<boolean>(key('deptFoldTouched'), false),
  );
  const [deptFoldSettled, setDeptFoldSettled] = useState(false);

  // The CARD that is ringed on the chart.
  const [selected, setSelected] = useState<number | null>(null);
  // The floating panel, as a stack of views — newest last (spec §17). Empty =
  // closed. A card's headline opens its ROLE; a row opens that POSITION on top
  // of the card's role, so Back from a position lands on the role it belongs to.
  const [views, setViews] = useState<PanelView[]>([]);
  const panelRef = useRef<FloatingPanelHandle>(null);
  // Ask (spec §21): from the header button, or from ⌘K's "Ask: …" (…/org-chart?ask=<question>).
  const [askOpen, setAskOpen] = useState(() => params.get('ask') != null);
  const [askText, setAskText] = useState(() => params.get('ask') ?? '');
  // A clicked answer: its positions drawn normally, every other card faint, until cleared.
  const [highlight, setHighlight] = useState<{ ids: Set<number>; label: string } | null>(null);
  const fullscreen = useFullscreen();

  const [exporting, setExporting] = useState(false);

  // A callback ref, not useRef: the stage only exists once the graph has
  // loaded, so an effect keyed on mount would observe nothing and the chart
  // would open at 100% instead of a readable fit.
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const stageWidth = stage.w;
  // The region = toolbar + chart. A fixed-height panel, so
  // the PAGE never scrolls and the wheel is free to zoom (spec §14).
  const [pageEl, setPageEl] = useState<HTMLDivElement | null>(null);
  const [regionEl, setRegionEl] = useState<HTMLDivElement | null>(null);
  const [regionH, setRegionH] = useState<number | null>(null);

  // ── Data ────────────────────────────────────────────────────────────────
  // `quiet`: re-read without the skeleton, for a change made from the panel —
  // the chart stays where it is and redraws with the new person in the seat.
  const load = useCallback((quiet = false) => {
    if (!quiet) setLoading(true);
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
  const refresh = useCallback(() => load(true), [load]);

  // The whole graph travels in one payload, so re-rooting is a client-side
  // filter and costs nothing — no refetch, no flash, no lost scroll position.
  useEffect(() => {
    writePref(prefKey(company, 'root'), root);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (root) next.set('root', String(root));
        else next.delete('root');
        if (units.length) next.set('start', units.join(','));
        else next.delete('start');
        // An old link's ?view= names a screen that no longer exists.
        next.delete('view');
        return next;
      },
      { replace: true },
    );
  }, [root, units, company, setParams]);
  useEffect(() => writePref(prefKey(company, 'startUnits'), units), [units, company]);

  useEffect(() => writePref(prefKey(company, 'shift'), shift), [shift, company]);
  useEffect(() => writePref(prefKey(company, 'colours'), colours), [colours, company]);
  useEffect(() => writePref(prefKey(company, 'colourByLabel'), colourBy), [colourBy, company]);
  useEffect(() => writePref(prefKey(company, 'labelFilter'), labelFilter), [labelFilter, company]);
  useEffect(() => writePref(prefKey(company, 'performanceBy'), perfBy), [perfBy, company]);
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
   * bottom padding — measured, because the title strip and the toolbar wrap to a
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
    if (!regionEl || !scrollEl || isFull) return;
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
  }, [regionEl, scrollEl, pageEl, isFull]);

  // ── Model and scene ─────────────────────────────────────────────────────
  // The whole organisation, and what is drawn: the picked org units' branches only (§34.2),
  // cut from the graph already here, so the counts and an export are of what is shown.
  const fullModel = useMemo(() => (graph ? buildModel(graph) : null), [graph]);
  const startUnits = useMemo(
    () => (fullModel ? outerUnits(fullModel.departments, units) : []),
    [fullModel, units],
  );
  const model = useMemo(
    () => (graph && fullModel ? (startUnits.length ? buildModel(graphForUnits(graph, startUnits)) : fullModel) : null),
    [graph, fullModel, startUnits],
  );
  const startWords = startUnits
    .map((id) => fullModel?.deptById.get(id))
    .filter((d): d is NonNullable<typeof d> => !!d)
    .map((d) => unitLabel(d.name, d.type))
    .join(', ');

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

  // "Start from" is a CARD. A stored or linked id may be a position's (links
  // made before 2026-10-10, or "start the chart here" on a position): it is
  // read as the card that position is drawn in.
  const rootCard: number | '' = startUnits.length ? '' : root === '' || !model ? root : (cardIdOf(model, root) ?? '');

  const visibleIds = useMemo(
    () => (model ? subtreeIds(model, rootCard) : []),
    [model, rootCard],
  );

  // The shifts positions are on, General → Day → Night — what the filter offers.
  const shiftOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const n of model?.positions.values() ?? []) {
      const code = shiftCodeOf(n);
      if (!seen.has(code)) seen.set(code, shiftNameOf(n));
    }
    return [...seen]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => (SHIFT_ORDER[a.code] ?? 3) - (SHIFT_ORDER[b.code] ?? 3) || a.name.localeCompare(b.name));
  }, [model]);
  // A stored filter for a shift this company does not have would empty the chart.
  useEffect(() => {
    if (model && shift !== 'all' && !shiftOptions.some((s) => s.code === shift)) setShift('all');
  }, [model, shift, shiftOptions]);
  const shiftLabel =
    shift === 'all' ? 'All shifts' : `${shiftOptions.find((s) => s.code === shift)?.name ?? shift} shift`;

  const counts = useMemo(
    () => (model ? countRows(model, visibleIds, shift) : null),
    [model, visibleIds, shift],
  );

  const rootNode = rootCard && model ? model.byId.get(rootCard) : null;

  // ── Labels: one per department ──────────────────────────────────────────
  const { labels: labelList } = useLabels(can.org.view || can.positions.view);
  const deptLabel = useMemo(
    () => new Map((model?.departments ?? []).map((d) => [d.id, d.labelId ?? null])),
    [model],
  );
  // ── Colour by performance (spec §19.3): only for a login with performance view ──
  const perfOn = can.performance.view && perfBy !== '';
  const [bands, setBands] = useState<ChartBands | null>(null);
  const [bandPeriods, setBandPeriods] = useState<ChartBands['periods']>([]);
  useEffect(() => {
    if (!can.performance.view) return;
    let live = true;
    performanceApi.bands(perfOn && perfBy !== 'now' ? Number(perfBy) : null)
      .then((b) => { if (live) { setBandPeriods(b.periods); setBands(perfOn ? b : null); } })
      .catch(() => { if (live) setBands(null); });
    return () => { live = false; };
  }, [can.performance.view, perfOn, perfBy]);
  const performance = useMemo(() => {
    if (!perfOn || !bands) return null;
    const cs = getComputedStyle(document.documentElement);
    const colourOf = (tone: string, fallback: string) => cs.getPropertyValue(`--c-${tone}-600`).trim() || fallback;
    const colour: Record<string, string> = { ON_TRACK: colourOf('success', '#0E9F6E'), AT_RISK: colourOf('warning', '#D97706'), BEHIND: colourOf('danger', '#E11D48') };
    const byEmployee = new Map(bands.people.map((x) => [x.employeeId, x]));
    return {
      bandOf: (employeeId: number) => {
        const b = byEmployee.get(employeeId);
        if (!b || b.band === 'NO_DATA') return null;
        return { colour: colour[b.band], word: `${b.bandLabel.toLowerCase()} (${b.score}%, ${b.periodName})` };
      },
      legend: (['ON_TRACK', 'AT_RISK', 'BEHIND'] as const).map((k) => ({ colour: colour[k], word: bands.bandWords[k] })),
    };
    // palette: re-read the colours when the theme changes
  }, [perfOn, bands, palette]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each kind's own colour, when the kinds carry one (§34.1): the box frame and tag, always.
  const ownColours = useMemo(() => kindColours(labelList, theme.palette.mode), [labelList, theme.palette.mode]);
  const labelOptions = useMemo(() => {
    const colourOf = colourBy && labelList.length
      ? {
          colours: new Map(labelList.map((l, i) => [l.id, ownColours?.get(l.id) ?? labelColour(i)])),
          names: new Map(labelList.map((l) => [l.id, l.name])),
        }
      : null;
    const inFilter = labelFilter
      ? (departmentId: number | null) => departmentId != null && matchesLabel(labelFilter, deptLabel.get(departmentId), labelList)
      : undefined;
    return { colourBy: colourOf, inFilter, performance, kindColours: ownColours };
  }, [colourBy, labelFilter, labelList, deptLabel, performance, ownColours]);
  // "Of which in Plant: …" — the same counting rule, over the cards inside the filter.
  const inLabels = useMemo(() => {
    if (!model || !labelOptions.inFilter) return null;
    const ids = visibleIds.filter((id) => labelOptions.inFilter!(model.byId.get(id)?.departmentId ?? null));
    return countRows(model, ids, shift);
  }, [model, labelOptions, visibleIds, shift]);
  const labelFilterName = labelFilter ? labelFilterText(labelFilter, labelList) : '';

  // Departments are drawn as boxes when the switch is on AND the payload has a
  // department tree (a backend older than 2026-10-10 sends none).
  const boxed = show.departments && !!model && model.departments.length > 0;
  // The box tree with nothing closed: depths for the opening fold, parents for
  // opening the boxes above a seat. Recomputed per payload / start, not per frame.
  const deptTree = useMemo(
    () =>
      model && boxed
        ? departmentTree(model, { root: rootCard, filter: shift, collapsed: new Set(), arrange: {}, fonts, show })
        : null,
    [model, boxed, rootCard, shift, fonts, show],
  );

  // Everything the drawing is made from. The SCREEN draws it without the title
  // block (that is the fixed strip above the canvas, so it neither zooms nor
  // pans); an EXPORT draws it with one, because a file has no page around it.
  const sceneOptions = useMemo(() => {
    if (!model || !counts) return null;
    return {
      root: rootCard,
      filter: shift,
      collapsed,
      arrange,
      fonts,
      palette,
      colours,
      show,
      deptClosed,
      secondaryEdges: model.secondary,
      labels: labelOptions,
      header: {
        title: startWords ? `${startWords} — and below` : rootNode ? `${rootNode.displayTitle || rootNode.title} — and below` : 'Organisation chart',
        meta: `As at ${asOf}     |     ${shiftLabel}`,
        counts:
          `Positions ${counts.positions}     Filled ${counts.filled}     Vacant ${counts.vacant}` +
          (counts.hiring ? `     Hiring ${counts.hiring}` : '') +
          (counts.joining ? `     Joining ${counts.joining}` : '') +
          (counts.onNotice ? `     On notice ${counts.onNotice}` : '') +
          (counts.present || counts.absent
            ? `     Present ${counts.present}     Absent ${counts.absent}`
            : ''),
      },
    };
  }, [model, counts, rootCard, shift, shiftLabel, collapsed, arrange, fonts, palette, colours, show, deptClosed, rootNode, asOf, labelOptions, startWords]);

  const scene = useMemo(
    () => (model && sceneOptions ? buildScene(model, { ...sceneOptions, titleBlock: false }) : null),
    [model, sceneOptions],
  );
  // An Ask answer on the chart: the cards holding its positions as they are, the rest faint.
  const shownScene = useMemo(() => {
    if (!scene || !highlight) return scene;
    return {
      ...scene,
      boxes: scene.boxes.map((b) => (b.rows.some((r) => highlight.ids.has(r.positionId)) ? b : { ...b, dimmed: true })),
    };
  }, [scene, highlight]);

  // ── Zoom ────────────────────────────────────────────────────────────────
  /** The Fit button: the whole chart, however small that has to be. */
  const fitZoom = useCallback(() => {
    if (!scene || !stage.w) return 1;
    // Both ways since §14: the chart now lives in a panel of known height.
    const byH = stage.h > 60 ? (stage.h - 28) / (scene.height - scene.top) : Infinity;
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

  // ── Edit mode (spec §34.5) ──────────────────────────────────────────────
  // A unit the edit just touched is opened on the chart (the parent of a new
  // unit, the target of a move), with every box above it.
  const openUnit = useCallback(
    (id: number) => {
      setDeptFoldTouched(true);
      setDeptClosed((prev) => {
        const next = deptTree ? openAbove(deptTree, prev, id) : new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [deptTree],
  );
  // Spec §40.5: the reporting check, in Edit mode only (a count in the banner, the list in a sheet).
  const check = useConsistency(editing && mayEdit);
  const reloadCheck = check.reload;
  const [checkOpen, setCheckOpen] = useState(false);
  const refreshAndCheck = useCallback(() => {
    refresh();
    reloadCheck();
  }, [refresh, reloadCheck]);
  const editor = useOrgChartEdit({
    active: editing && mayEdit,
    model,
    can,
    onChanged: refreshAndCheck,
    onOpenUnit: openUnit,
  });

  /** Opens every department above a card, so a card picked from a list is on the canvas. */
  const reveal = useCallback(
    (id: number) => {
      if (!model || !deptTree) return;
      setDeptClosed((prev) => openAbove(deptTree, prev, departmentOfCard(model, id)));
    },
    [model, deptTree],
  );

  const toggleCollapse = useCallback((id: number) => {
    // With departments drawn the fold belongs to the department (its title);
    // Space on a card does nothing rather than hide the card under the cursor.
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
    const model = fullModel;
    if (!model) return [];
    return subtreeIds(model, '').map((id) => {
      const n = model.byId.get(id)!;
      return {
        id,
        label: n.displayTitle || n.title,
        // A card of one position carries its code; a card of several, their department.
        code: n.positionCode ?? n.departmentName,
        depth: model.depth.get(id) ?? 0,
      };
    });
  }, [fullModel]);
  // The org units in tree order, "Name (Kind)", each in its kind's colour.
  const unitOptions: UnitOption[] = useMemo(() => {
    const deps = fullModel?.departments ?? [];
    const ids = new Set(deps.map((d) => d.id));
    const kids = new Map<number | null, typeof deps>();
    for (const d of deps) {
      const p = d.parentId != null && ids.has(d.parentId) ? d.parentId : null;
      const list = kids.get(p);
      if (list) list.push(d);
      else kids.set(p, [d]);
    }
    const out: UnitOption[] = [];
    const seen = new Set<number>();
    const walk = (p: number | null, depth: number) => {
      for (const d of kids.get(p) ?? []) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        out.push({ id: d.id, label: unitLabel(d.name, d.type), depth, colour: d.labelId != null ? ownColours?.get(d.labelId) ?? null : null });
        walk(d.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [fullModel, ownColours]);

  const doExport = async (kind: 'png' | 'pdf') => {
    if (!model || !sceneOptions) return;
    setExporting(true);
    try {
      const name = startUnits.length
        ? `Org_chart_${startUnits.map((id) => fullModel?.deptById.get(id)?.code ?? id).join('_')}`
        : rootNode ? `Org_chart_${rootNode.positionCode ?? rootNode.id}` : 'Org_chart';
      // The same drawing, WITH its title block and legend: the print carries them.
      const printed = buildScene(model, { ...sceneOptions, titleBlock: true });
      if (kind === 'png') await exportPng(printed, palette.fontUi, name);
      else await exportPdf(printed, palette.fontUi, `Organisation chart as at ${asOf}`, name);
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
  const focusPanel = () => requestAnimationFrame(() => panelRef.current?.focus());
  // The card the panel was opened on (the bottom of the stack), when it was a card.
  const base = views[0] ?? null;
  const cardId = base?.kind === 'role' ? base.cardId : null;

  /** Open a CARD's role in the panel: a click on a card's headline, a "used in" place. */
  const openCard = useCallback(
    (id: number) => {
      if (!model) return;
      reveal(id);
      setSelected(id);
      setViews([roleViewOfCard(model, id)]);
    },
    [model, reveal],
  );

  /**
   * Open a POSITION from anywhere — a row of a card, a search hit,
   * a search hit. It sits on top of its card's role, so Back shows the role and the
   * other positions beside it. One that is not on the chart opens on its own.
   */
  const openPosition = useCallback(
    (positionId: number) => {
      if (!model) return;
      const card = model.cardOf.get(positionId);
      if (card != null) {
        reveal(card);
        setSelected(card);
        setViews([roleViewOfCard(model, card), positionView(model, positionId)]);
      } else if (model.byId.has(positionId)) {
        // Already a card id (a list that speaks in cards).
        openCard(positionId);
      } else {
        setViews([positionView(model, positionId)]);
      }
    },
    [model, reveal, openCard],
  );

  // After "Do it in words" made a position: once the redrawn chart has it, open it.
  useEffect(() => {
    if (openAfterLoad == null || !model || !model.cardOf.has(openAfterLoad)) return;
    const id = openAfterLoad;
    const t = setTimeout(() => {
      setOpenAfterLoad(null);
      openPosition(id);
    }, 0);
    return () => clearTimeout(t);
  }, [model, openAfterLoad, openPosition]);

  // ?words=1 (from ⌘K) has done its job once the bar is open; keep the address clean.
  useEffect(() => {
    if (params.get('words') !== '1') return;
    const next = new URLSearchParams(params);
    next.delete('words');
    setParams(next, { replace: true });
  }, [params, setParams]);

  // ?ask=<question> (⌘K "Ask: …"): open Ask with it, then keep the address clean.
  useEffect(() => {
    const asked = params.get('ask');
    if (asked == null) return;
    setAskText(asked);
    setAskOpen(true);
    const next = new URLSearchParams(params);
    next.delete('ask');
    setParams(next, { replace: true });
  }, [params, setParams]);

  /** An Ask answer clicked: highlight its positions (opening the boxes above them) and open one. */
  const onAskPick = useCallback(
    (pick: AskPick) => {
      if (!model) return;
      setHighlight({ ids: new Set(pick.positionIds), label: pick.label });
      for (const id of pick.positionIds) {
        const card = model.cardOf.get(id);
        if (card != null) reveal(card);
      }
      if (pick.open != null) openPosition(pick.open);
    },
    [model, reveal, openPosition],
  );

  const closePanel = useCallback(() => {
    setViews([]);
    // Hand the keyboard back to the card the panel described, so Esc in the
    // panel lands the viewer where they were in the chart.
    if (cardId != null) {
      const el = document.getElementById(`orgchart-node-${cardId}`) as unknown as HTMLElement | null;
      el?.focus({ preventScroll: true });
    }
  }, [cardId]);

  // A card: Enter (or a click) opens the panel and LEAVES FOCUS ON THE CARD, so
  // the arrow keys keep walking the chart; the panel follows the selection
  // while it is open. Enter on the card the panel already shows moves focus in.
  const onCanvasOpen = useCallback(
    (id: number) => {
      if (cardId === id && views.length === 1) panelRef.current?.focus();
      else openCard(id);
    },
    [cardId, views.length, openCard],
  );
  const onCanvasSelect = useCallback(
    (id: number) => {
      setSelected(id);
      // While the panel is open it follows the selection: another card, its role.
      setViews((cur) => {
        if (!cur.length || !model) return cur;
        const b = cur[0];
        return b.kind === 'role' && b.cardId === id ? cur : [roleViewOfCard(model, id)];
      });
    },
    [model],
  );

  const topView = views[views.length - 1] ?? null;
  const panelTitle = topView ? viewTitle(model, topView) : 'Role';
  // Moving between views puts the keyboard on the panel's header, which reads
  // the new title — so a keyboard user hears where they have landed.
  const panelNav = useMemo(
    () => ({
      push: (v: PanelView) => {
        setViews((s) => [...s, v]);
        focusPanel();
      },
      back: () => {
        setViews((s) => (s.length > 1 ? s.slice(0, -1) : s));
        focusPanel();
      },
    }),
    [],
  );
  const crumbs = views.slice(Math.max(0, views.length - 3), -1).map((v) => viewTitle(model, v));
  const openRow = topView?.kind === 'position' ? topView.positionId : null;
  const panelBox = cardId != null && model && boxed ? scene?.layout.dept?.boxes.get(departmentOfCard(model, cardId)) : undefined;
  // Inside a department, a card arranges only the reports that sit in the box with it.
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
            {highlight && (
              <Chip
                size="small"
                color="primary"
                variant="outlined"
                label={`Showing: ${highlight.label}`}
                onDelete={() => setHighlight(null)}
                title="Other positions are drawn faint. Clear to see the whole chart again."
                sx={{ maxWidth: 280, alignSelf: 'center' }}
              />
            )}
            <Button size="small" startIcon={<QuestionAnswerRounded />} onClick={() => { setAskText(''); setAskOpen(true); }}>
              Ask
            </Button>
            {mayEdit && (
              <Button
                size="small"
                data-edittoggle=""
                startIcon={editing ? <CheckRounded /> : <EditRounded />}
                variant={editing ? 'contained' : 'outlined'}
                onClick={() => setEditing((v) => !v)}
                aria-pressed={editing}
              >
                {editing ? 'Done' : 'Edit'}
              </Button>
            )}
            {mayDoInWords && (
              <Button
                size="small"
                startIcon={<AutoFixHighRounded />}
                variant={wordsOpen ? 'contained' : 'text'}
                onClick={() => setWordsOpen((v) => !v)}
                aria-expanded={wordsOpen}
              >
                Do it in words
              </Button>
            )}
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

      {mayDoInWords && wordsOpen && !isFull && (
        <CommandBar
          autoFocus
          onApplied={(r) => {
            // Redraw the chart, then open what was made so it is in view.
            const made = r.created.find((c) => c.kind === 'position') ?? r.created.find((c) => c.positionId);
            setOpenAfterLoad(made ? Number(made.kind === 'position' ? made.id : made.positionId) : null);
            load(true);
          }}
        />
      )}

      {!!error && <ErrorNotice error={error} onRetry={() => load()} />}

      {editing && mayEdit && !isFull && (
        <EditBanner
          action={
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {!!check.data?.counts.total && (
                <Button size="small" variant="outlined" color="warning" data-reporting-check="" onClick={() => setCheckOpen(true)}>
                  {check.data.counts.total === 1 ? '1 thing to check in reporting' : `${check.data.counts.total} things to check in reporting`}
                </Button>
              )}
              {!boxed && model && model.departments.length > 0 && (
                <Button size="small" variant="outlined" onClick={() => setShow({ ...show, departments: true })}>
                  Show org units
                </Button>
              )}
              <Button size="small" variant="contained" startIcon={<CheckRounded />} onClick={() => setEditing(false)} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
                Done
              </Button>
            </Stack>
          }
        >
          <strong>Editing</strong> — changes save as you make them. Use the <strong>+</strong> on an org unit or a role,
          or the <strong>⋯</strong> on a position{can.org.edit ? '; drag an org unit by its name onto another to move it' : ''}.
          {!boxed && ' Org units are hidden: show them to add or move units.'}
        </EditBanner>
      )}
      <ReportingCheckSheet
        open={checkOpen && editing}
        onClose={() => setCheckOpen(false)}
        data={check.data}
        error={check.error}
        canFix={can.org.edit || can.positions.edit}
        onChanged={(next) => { check.setData(next); refresh(); }}
      />

      {/*
        THE REGION: toolbar + chart. It is a fixed-height panel filling the
        rest of the window (measured above), so the page does not scroll and
        the wheel zooms. In full screen it is fixed over the
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
            : {
                height: regionH ?? 560,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }
        }
      >
        {model && scene && (
          <Box sx={{ flexShrink: 0 }}>
            <OrgChartToolbar
              rootOptions={rootOptions}
              root={rootCard}
              onRoot={setRoot}
              unitOptions={unitOptions}
              units={startUnits}
              onUnits={setUnits}
              shift={shift}
              onShift={setShift}
              shifts={shiftOptions}
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
              labels={
                <LabelViewOptions
                  labels={labelList}
                  colourBy={colourBy}
                  onColourBy={setColourBy}
                  filter={labelFilter}
                  onFilter={setLabelFilter}
                  performance={can.performance.view ? { value: perfBy, onChange: setPerfBy, periods: bandPeriods } : undefined}
                />
              }
            />
          </Box>
        )}

        {loading && <ChartSkeleton />}

        {!loading && !error && model && model.byId.size === 0 && (
          <EmptyState
            title="No positions yet"
            hint="Import the organisation chart, or create positions, and they will appear here."
          />
        )}

        {!loading && model && scene && model.byId.size > 0 && (
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {counts && (
              <OrgChartTitleStrip
                title={startWords ? `${startWords} — and below` : rootNode ? `${rootNode.displayTitle || rootNode.title} — and below` : 'Organisation chart'}
                meta={`As at ${asOf} · ${shiftLabel}`}
                facts={[
                  { label: 'Positions', value: counts.positions },
                  { label: 'Filled', value: counts.filled },
                  // Still in their positions, so part of Filled — said beside it.
                  ...(counts.onNotice ? [{ label: 'On notice', value: counts.onNotice }] : []),
                  { label: 'Vacant', value: counts.vacant },
                  // Part of the vacant count, said quietly beside it: "149 vacant · 3 hiring".
                  ...(counts.hiring ? [{ label: 'Hiring', value: counts.hiring }] : []),
                  ...(counts.joining ? [{ label: 'Joining', value: counts.joining }] : []),
                  ...(counts.present || counts.absent
                    ? [
                        { label: 'Present', value: counts.present },
                        { label: 'Absent', value: counts.absent },
                      ]
                    : []),
                  // The label filter: how many of these are inside it (the rest are drawn faint).
                  ...(inLabels
                    ? [{ label: `of which in ${labelFilterName || 'the chosen kind'}`, value: `${inLabels.positions} (${inLabels.filled} filled, ${inLabels.vacant} vacant)` }]
                    : []),
                ]}
                legend={scene.legend}
              />
            )}
            <Box
              ref={setStageEl}
              sx={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}
            >
              <OrgChartCanvas
                  scene={shownScene ?? scene}
                  zoom={zoom ?? 1}
                  fontFamily={palette.fontUi}
                  selected={selected}
                  selectedRow={openRow}
                  onOpenRow={(_card, positionId) => openPosition(positionId)}
                  accessibleName={`Organisation chart as at ${asOf}, ${counts?.positions ?? 0} positions`}
                  textAlternative={describeChart(model, visibleIds, shift)}
                  onSelect={onCanvasSelect}
                  onOpenCard={onCanvasOpen}
                  onToggleCollapse={toggleCollapse}
                  onToggleDept={toggleDept}
                  onNavigate={navigate}
                  onZoom={setZoomClamped}
                  edit={editor.canvasEdit}
                />
            </Box>
            {/* One line, truncated: every pixel of this region's height is chart.
                The whole sentence is the title, and the keys are in the panel's
                own labels and the box's accessible name. */}
            <Typography
                title={
                  'Scroll to zoom; drag, Shift + scroll or a sideways swipe to pan. Click a card for its role, or a row in it for that position, ' +
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
                Scroll to zoom · drag to pan · click a card for its role, a row for that position
                {boxed ? ' · click an org unit name to open or close it' : ' · Space folds a branch'} · arrows walk
                the chart, Enter opens the panel
                {secondaryCount > 0 && ` · ${secondaryCount} dashed lines are non-primary reporting`}
            </Typography>
          </Box>
        )}

        {/* Inside the region so it rides into full screen with the chart. */}
        <OrgChartFloatingPanel
          ref={panelRef}
          open={views.length > 0}
          label={topView ? `${viewKind(topView)}: ${panelTitle}` : panelTitle}
          title={
            <Stack direction="row" alignItems="flex-start" spacing={0.5} data-paneltitle="">
              {views.length > 1 && (
                <Tooltip title="Back (Esc)">
                  <IconButton
                    size="small"
                    onClick={panelNav.back}
                    aria-label={`Back to ${views.length > 1 ? viewTitle(model, views[views.length - 2]) : 'the role'}`}
                    sx={{ mt: '-3px', ml: '-4px' }}
                  >
                    <ArrowBackRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 11.5,
                    color: 'var(--c-text-2)',
                    lineHeight: 1.3,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {[...crumbs, topView ? viewKind(topView) : 'Role'].join(' › ')}
                </Typography>
                <Typography sx={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
                  {panelTitle}
                </Typography>
              </Box>
            </Stack>
          }
          onClose={closePanel}
          // Esc goes back one view; from the first it closes the panel.
          onEscape={views.length > 1 ? panelNav.back : closePanel}
          // Over the chart.
          boundsEl={stageEl}
          relayout={`${isFull}`}
          storageKey={key('panelPos')}
        >
          {topView && (
            <OrgChartPanelViews
              view={topView}
              model={model}
              asOf={asOf}
              company={company}
              nav={panelNav}
              onClose={() => setViews([])}
              onChanged={refresh}
              onOpenCard={openCard}
              onStartFrom={(positionId) => {
                setUnits([]);
                setRoot(fullModel ? (cardIdOf(fullModel, positionId) ?? '') : '');
              }}
              // The viewer's own drawing options, for the card the panel was
              // opened on.
              viewOptions={(id) =>
                id === cardId ? (
                  <OrgChartViewOptions
                    teamSize={panelTeam}
                    arrange={arrange[id] || 'auto'}
                    onArrange={(a) =>
                      setArrange((prev) => {
                        const next = { ...prev };
                        if (a === 'auto') delete next[id];
                        else next[id] = a;
                        return next;
                      })
                    }
                    fold={
                      boxed
                        ? undefined
                        : { collapsed: collapsed.has(id), onToggle: () => toggleCollapse(id) }
                    }
                  />
                ) : null
              }
            />
          )}
        </OrgChartFloatingPanel>
      </Box>

      {editor.ui}

      <OrgChartAsk
        open={askOpen}
        asOf={asOf}
        initialQuestion={askText}
        departments={model?.departments ?? []}
        labels={labelList}
        onClose={() => setAskOpen(false)}
        onPick={onAskPick}
      />
    </Stack>
  );
}
