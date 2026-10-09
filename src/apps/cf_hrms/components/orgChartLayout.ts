import type {
  OrgChartEdge,
  OrgChartGraph,
  OrgChartNode,
  OrgChartOccupant,
} from '../api/orgchart';

/**
 * The org chart's layout engine — a faithful port of `Org_Chart_V12.html`'s
 * `rowsOf` / `boxInfo` / `layout` / `buildSVG`, which is the part of the
 * client's existing tool that is genuinely worth keeping.
 *
 * WHY NOT A TIDY-TREE LIBRARY. The single most important line in here is the
 * `auto` arrangement rule in `size()`: a node whose children are *all* leaves
 * lays them out as an indented **list**, everything else goes side by side.
 * Karni is 114 positions, 8 deep, with a fan-out of 9 under Plant Head Unit 2.
 * A generic tidy tree renders that thousands of pixels wide and nobody reads
 * it; the list rule keeps it to a readable column. Every published layout
 * algorithm optimises for symmetry, and symmetry is not what is wanted here.
 *
 * WHY A DRAW LIST INSTEAD OF AN SVG STRING. The screen draws inline SVG and the
 * export draws the identical geometry to a canvas. Going via
 * `new Image(); img.src = 'data:image/svg+xml,…'` — which is what the source
 * file does — cannot load the Geist webfont, so exported text would be laid out
 * with Geist metrics and *painted* with a fallback face, overflowing boxes that
 * measured fine on screen. One scene, two renderers, identical metrics.
 *
 * Nothing here imports React or reads the DOM beyond a measuring canvas and the
 * resolved token values handed in as a `ChartPalette`.
 */

// ── Constants (px). These are the source file's, unchanged. ─────────────────
export const W = 214;
export const PAD = 8;
export const TLH = 16;
export const CAPH = 13;
export const ROWH = 19;
export const ROWG = 2;
export const HG = 26;
export const VG = 52;
export const IND = 24;

export const SV = 14;
export const SG = 10;
export const M = 36;
export const HEAD = 84;
/** Not in the source file: it had no work-context chips because machines were nodes. */
export const CHIPH = 18;
/** Process boxes (spec §15): inner padding, title-chip height, top of the first member. */
export const PB = 10;
export const PCH = 16;
export const PT = PB + PCH + 8;

export type ShiftFilter = 'all' | 'D' | 'N';
export type Arrange = 'auto' | 'side' | 'stack';

// ── Colour: every value resolved from tokens.css, never written here ────────

export interface ChartPalette {
  ink: string;
  muted: string;
  faint: string;
  surface: string;
  surface2: string;
  canvas: string;
  border: string;
  divider: string;
  accent: string;
  accentFill: string;
  accentText: string;
  present: string;
  presentFill: string;
  presentText: string;
  absent: string;
  absentFill: string;
  absentText: string;
  vacant: string;
  vacantFill: string;
  vacantText: string;
  fontUi: string;
}

const TOKEN_MAP: Record<keyof Omit<ChartPalette, 'fontUi'>, string> = {
  ink: '--c-text',
  muted: '--c-text-2',
  faint: '--c-text-3',
  surface: '--c-surface',
  surface2: '--c-surface-2',
  canvas: '--c-canvas',
  border: '--c-border',
  divider: '--c-divider',
  accent: '--c-primary-500',
  accentFill: '--c-primary-50',
  accentText: '--c-primary-900',
  present: '--c-success-600',
  presentFill: '--c-success-50',
  presentText: '--c-success-800',
  absent: '--c-danger-600',
  absentFill: '--c-danger-50',
  absentText: '--c-danger-800',
  // A vacancy is a fact, not an alarm (statusMap.ts): 156 of Karni's 169 seats
  // are empty, and a chart that paints that red every day stops being read.
  vacant: '--c-neutral-600',
  vacantFill: '--c-neutral-50',
  vacantText: '--c-neutral-800',
};

/**
 * Resolves the design tokens to concrete colour strings.
 *
 * SVG presentation attributes and canvas fills both need a real colour, and the
 * export path has no stylesheet at all, so the tokens are read once per render
 * instead of referenced as `var(--…)`. The values still come from tokens.css
 * and nothing else — change a token and the chart and its PNG both follow,
 * including dark mode, which re-tones every tint.
 */
export function readPalette(el?: Element | null): ChartPalette {
  const cs = getComputedStyle(el ?? document.documentElement);
  const read = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  const out = { fontUi: read('--font-ui', 'system-ui, sans-serif') } as ChartPalette;
  const fallbacks: Record<string, string> = {
    '--c-text': '#1A1C2E',
    '--c-surface': '#FFFFFF',
    '--c-canvas': '#F6F7FB',
  };
  (Object.keys(TOKEN_MAP) as (keyof typeof TOKEN_MAP)[]).forEach((k) => {
    out[k] = read(TOKEN_MAP[k], fallbacks[TOKEN_MAP[k]] ?? '#888888');
  });
  return out;
}

// ── Text measuring. Estimated text wraps wrong; measured text does not. ─────

let measureCtx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();

function ctx2d(): CanvasRenderingContext2D | null {
  if (!measureCtx) {
    try {
      measureCtx = document.createElement('canvas').getContext('2d');
    } catch {
      measureCtx = null;
    }
  }
  return measureCtx;
}

export function fontString(size: number, weight: number, family: string, italic = false): string {
  return `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
}

export function textWidth(text: string, font: string): number {
  const key = `${font}|${text}`;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  const c = ctx2d();
  let w: number;
  if (c) {
    c.font = font;
    w = c.measureText(text).width;
  } else {
    // No canvas (a test runner, a locked-down browser): approximate rather than
    // crash. The chart is wrong by a few pixels, not absent.
    w = text.length * (parseFloat(font) || 12) * 0.52;
  }
  if (widthCache.size > 20000) widthCache.clear();
  widthCache.set(key, w);
  return w;
}

/** Truncate with a real ellipsis so a long name never bleeds out of its box. */
export function fitText(text: string, font: string, max: number): string {
  let t = String(text ?? '');
  if (textWidth(t, font) <= max) return t;
  while (t.length > 1 && textWidth(`${t}…`, font) > max) t = t.slice(0, -1);
  return `${t}…`;
}

export function wrapText(text: string, font: string, max: number): string[] {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return ['Untitled'];
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (textWidth(t, font) <= max || !cur) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.map((l) => fitText(l, font, max));
}

// ── Fonts used by the chart, built from the token family ────────────────────

export interface ChartFonts {
  title: string;
  caption: string;
  row: string;
  rowSmall: string;
  chip: string;
  headTitle: string;
  headMeta: string;
  badge: string;
}

export function makeFonts(family: string): ChartFonts {
  return {
    title: fontString(13.5, 600, family),
    caption: fontString(11, 400, family, true),
    row: fontString(12.5, 400, family),
    rowSmall: fontString(11, 400, family),
    chip: fontString(11, 500, family),
    headTitle: fontString(20, 600, family),
    headMeta: fontString(13, 400, family),
    badge: fontString(10, 600, family),
  };
}

// ── The graph, turned into a tree ───────────────────────────────────────────

export const PRIMARY = 'PRIMARY_MANAGER';

export interface ChartModel {
  byId: Map<number, OrgChartNode>;
  /** Child ids in payload order, so the chart is stable between loads. */
  children: Map<number, number[]>;
  parent: Map<number, number>;
  roots: number[];
  depth: Map<number, number>;
  /** Everything that is not PRIMARY_MANAGER — dotted, functional, project, … */
  secondary: OrgChartEdge[];
  /** Edges dropped to keep the tree a tree, reported rather than hidden. */
  droppedPrimary: OrgChartEdge[];
  order: number[];
}

/**
 * Picks the PRIMARY_MANAGER edges as the drawn tree and keeps everything else
 * as a secondary link. This is a *rendering* choice over a many-to-many table,
 * not a claim that a position has one manager (plan §2 rule 9) — which is why
 * the card modal shows the resolved set and the chart draws the rest dashed.
 */
export function buildModel(graph: OrgChartGraph): ChartModel {
  const byId = new Map<number, OrgChartNode>();
  const order: number[] = [];
  for (const n of graph.nodes) {
    byId.set(n.id, n);
    order.push(n.id);
  }

  const parent = new Map<number, number>();
  const secondary: OrgChartEdge[] = [];
  const droppedPrimary: OrgChartEdge[] = [];

  for (const e of graph.edges) {
    if (e.typeCode !== PRIMARY) {
      if (byId.has(e.fromPositionId) && byId.has(e.toPositionId)) secondary.push(e);
      continue;
    }
    const child = e.fromPositionId;
    const mgr = e.toPositionId;
    if (!byId.has(child) || !byId.has(mgr) || child === mgr) {
      droppedPrimary.push(e);
      continue;
    }
    if (parent.has(child)) {
      // Two primary managers on one seat. The tree can draw one; the other is
      // still real, so it falls through to the secondary set and is drawn
      // dashed rather than deleted.
      droppedPrimary.push(e);
      secondary.push(e);
      continue;
    }
    parent.set(child, mgr);
  }

  // Cycle guard, 50 iterations like the source file: imported data has already
  // produced a loop once, and a hang is worse than a detached branch.
  for (const id of order) {
    const seen = new Set<number>([id]);
    let cur = parent.get(id);
    let guard = 0;
    while (cur !== undefined && guard++ < 50) {
      if (seen.has(cur)) {
        parent.delete(id);
        break;
      }
      seen.add(cur);
      cur = parent.get(cur);
    }
  }

  const children = new Map<number, number[]>();
  const roots: number[] = [];
  for (const id of order) {
    const p = parent.get(id);
    if (p === undefined) {
      roots.push(id);
      continue;
    }
    const list = children.get(p);
    if (list) list.push(id);
    else children.set(p, [id]);
  }

  const depth = new Map<number, number>();
  const walk = (id: number, d: number) => {
    depth.set(id, d);
    for (const k of children.get(id) ?? []) walk(k, d + 1);
  };
  roots.forEach((r) => walk(r, 0));

  return { byId, children, parent, roots, depth, secondary, droppedPrimary, order };
}

/** Every id in a subtree, root included — depth first, siblings in payload order. */
export function subtreeIds(model: ChartModel, rootId: number | ''): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const walk = (id: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
    (model.children.get(id) ?? []).forEach(walk);
  };
  if (rootId === '' || !model.byId.has(rootId)) model.roots.forEach(walk);
  else walk(rootId);
  return out;
}

export function descendantCount(model: ChartModel, id: number): number {
  let n = 0;
  const stack = [...(model.children.get(id) ?? [])];
  while (stack.length) {
    const c = stack.pop()!;
    n += 1;
    stack.push(...(model.children.get(c) ?? []));
  }
  return n;
}

// ── Work processes (spec §15) ───────────────────────────────────────────────

/**
 * A position's work process is its unit's NAME, case- and whitespace-
 * normalised, so same-named units merge: Karni's three machine-level
 * "Slitting" sections fold into Slitting, the two "BFL" units into one, the
 * four sibling "Sales & Marketing" units into one. Known limit: two unrelated
 * units sharing a name in some other company would merge too. '' = no unit.
 */
export function processKey(n: OrgChartNode): string {
  return (n.departmentName ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

interface ProcessIndex {
  /** Every unit code seen for a process — a unit's code is its head seat's code. */
  heads: Map<string, Set<string>>;
  /** Every unit code of every process: a seat whose code is here heads SOME process. */
  allHeads: Set<string>;
  /** Processes with a ROOT unit (no parent) among the units merged into them — leadership. */
  roots: Set<string>;
  /** The display name: the one on the best-ranked unit carrying it. */
  label: Map<string, string>;
}

const processCache = new WeakMap<ChartModel, ProcessIndex>();

function processIndex(model: ChartModel): ProcessIndex {
  const hit = processCache.get(model);
  if (hit) return hit;
  const heads = new Map<string, Set<string>>();
  const allHeads = new Set<string>();
  const roots = new Set<string>();
  const label = new Map<string, string>();
  const labelRank = new Map<string, number>();
  for (const n of model.byId.values()) {
    const k = processKey(n);
    if (!k) continue;
    if (!heads.has(k)) heads.set(k, new Set());
    const code = (n.departmentCode ?? '').trim();
    if (code) {
      heads.get(k)!.add(code);
      allHeads.add(code);
    }
    if (n.departmentIsRoot) roots.add(k);
    const r = n.departmentRank ?? Number.POSITIVE_INFINITY;
    if (!label.has(k) || r < labelRank.get(k)!) {
      label.set(k, (n.departmentName ?? '').trim().replace(/\s+/g, ' '));
      labelRank.set(k, r);
    }
  }
  const out = { heads, allHeads, roots, label };
  processCache.set(model, out);
  return out;
}

/**
 * True when this seat HEADS its process: its position code is the code of its
 * own unit or of any unit merged into the same process. Production Manager
 * (P020) heads Production (unit P020); a Printing operator does not.
 */
export function headsProcess(model: ChartModel, n: OrgChartNode): boolean {
  const code = (n.positionCode ?? '').trim();
  const k = processKey(n);
  if (!code || !k) return false;
  return processIndex(model).heads.get(k)?.has(code) ?? false;
}

/** True when this seat heads ANY process (its code is some unit's code). */
export function headsAnyProcess(model: ChartModel, n: OrgChartNode): boolean {
  const code = (n.positionCode ?? '').trim();
  return Boolean(code) && processIndex(model).allHeads.has(code);
}

/** The seat sits in a leadership unit — a root of the unit tree, after merging. */
export function inRootProcess(model: ChartModel, n: OrgChartNode): boolean {
  const k = processKey(n);
  return Boolean(k) && processIndex(model).roots.has(k);
}

export interface ProcessGroup {
  key: string;
  /** '' for the unlabelled "no unit" group. */
  label: string;
  ids: number[];
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A team split by work process, in a stable order: the manager's own process
 * first, then the unit tree's order (best rank among the group's members), the
 * no-unit group last. People keep payload order inside a group.
 */
export function groupByProcess(model: ChartModel, managerId: number, kids: number[]): ProcessGroup[] {
  const idx = processIndex(model);
  const own = processKey(model.byId.get(managerId)!);
  const groups = new Map<string, { ids: number[]; rank: number }>();
  for (const k of kids) {
    const n = model.byId.get(k)!;
    const key = processKey(n);
    const g = groups.get(key) ?? { ids: [], rank: Number.POSITIVE_INFINITY };
    g.ids.push(k);
    g.rank = Math.min(g.rank, n.departmentRank ?? Number.POSITIVE_INFINITY);
    groups.set(key, g);
  }
  const weight = (key: string) => (key === '' ? 2 : key === own ? 0 : 1);
  return [...groups.entries()]
    .sort(([a, ga], [b, gb]) => weight(a) - weight(b) || ga.rank - gb.rank || a.localeCompare(b))
    .map(([key, g]) => ({ key, label: key ? (idx.label.get(key) ?? key) : '', ids: g.ids, x: 0, y: 0, w: 0, h: 0 }));
}

// ── Rows inside a box ───────────────────────────────────────────────────────

export interface BoxRow {
  shift: 'G' | 'D' | 'N';
  occupant: OrgChartOccupant | null;
}

function occupantShift(o: OrgChartOccupant): 'D' | 'N' {
  return o.shiftCode === 'N' ? 'N' : 'D';
}

function requiredFor(n: OrgChartNode, shift: 'D' | 'N'): number {
  const req = n.requirements?.find((r) => r.shiftCode === shift);
  if (req) return Math.max(0, req.requiredCount);
  // No requirement row for that shift: split the effective count across the two
  // shifts rather than falling back to sanctionedHeadcount, which means ONE seat
  // and would halve a DN position's rows.
  const eff = n.effectiveSanctioned ?? n.sanctionedHeadcount;
  return Math.max(0, Math.round(eff / 2));
}

/**
 * How many rows the box has to show.
 *
 * `sanctionedHeadcount` is ONE SEAT and stays 1 on a day/night position, so it
 * is the wrong number to pad from: 78 vacancies instead of 156 across Karni.
 * `effectiveSanctioned` is the server's derived answer — headcount for a
 * single-shift seat, Σ(requiredCount) for a DN one — and is what this uses.
 */
function effectiveSeats(n: OrgChartNode): number {
  return Math.max(0, n.effectiveSanctioned ?? n.sanctionedHeadcount);
}

/**
 * Occupant rows, then vacancy rows padding to the sanctioned count.
 *
 * THE DAY/NIGHT RULE. A `DN` position is sanctioned *per shift*: its rows are
 * grouped into a Day set and a Night set and **each group pads to its own
 * required count independently**, so a `DN` seat requiring 1 shows two rows.
 * 55 of Karni's 114 positions are DN; treating the pattern as one pool halves
 * the visible vacancies — 101 instead of 156 — which is precisely the number
 * this screen was built to communicate.
 *
 * A vacancy is a rendered empty slot, never an omitted row. Seeing the hole is
 * the point.
 */
export function rowsOf(n: OrgChartNode, filter: ShiftFilter): BoxRow[] {
  const rows: BoxRow[] = [];
  if (n.shiftPattern === 'DN') {
    (['D', 'N'] as const)
      .filter((s) => filter === 'all' || filter === s)
      .forEach((s) => {
        const req = requiredFor(n, s);
        const people = (n.occupants ?? []).filter((o) => occupantShift(o) === s);
        people.forEach((o) => rows.push({ shift: s, occupant: o }));
        for (let i = people.length; i < req; i += 1) rows.push({ shift: s, occupant: null });
      });
    return rows;
  }
  const group: 'G' | 'D' | 'N' =
    n.shiftPattern === 'D' || n.shiftPattern === 'N' ? n.shiftPattern : 'G';
  // A general-shift seat belongs to neither day nor night, so the shift filter
  // leaves it alone; a seat explicitly sanctioned for one shift respects it.
  if (group !== 'G' && filter !== 'all' && filter !== group) return [];
  const req = effectiveSeats(n);
  (n.occupants ?? []).forEach((o) => rows.push({ shift: group, occupant: o }));
  for (let i = (n.occupants ?? []).length; i < req; i += 1) rows.push({ shift: group, occupant: null });
  return rows;
}

export interface VisibleCounts {
  positions: number;
  seats: number;
  filled: number;
  present: number;
  absent: number;
  /** Someone is in the seat but the day has no attendance record. */
  unmarked: number;
  vacant: number;
}

/**
 * Counted over exactly the rows the chart draws, so the summary strip cannot
 * disagree with the picture under it.
 *
 * "Filled" and "present" are kept apart deliberately. Karni's only attendance
 * is 2026-09-10, so on any other date all 13 occupied seats are *unmarked* —
 * folding those into "present" would report an attendance figure the system
 * does not have.
 */
export function countRows(model: ChartModel, ids: number[], filter: ShiftFilter): VisibleCounts {
  let present = 0;
  let absent = 0;
  let unmarked = 0;
  let vacant = 0;
  let seats = 0;
  for (const id of ids) {
    const n = model.byId.get(id);
    if (!n) continue;
    for (const r of rowsOf(n, filter)) {
      seats += 1;
      if (!r.occupant) vacant += 1;
      else if (r.occupant.attendanceStatus === 'ABSENT') absent += 1;
      else if (r.occupant.attendanceStatus === 'PRESENT') present += 1;
      else unmarked += 1;
    }
  }
  return {
    positions: ids.length,
    seats,
    filled: seats - vacant,
    present,
    absent,
    unmarked,
    vacant,
  };
}

// ── Box anatomy (spec §2) ───────────────────────────────────────────────────

export interface BoxInfo {
  titleLines: string[];
  captions: string[];
  /** Work contexts shown as chips — never as parent nodes (spec §1). */
  chips: string[];
  rows: BoxRow[];
  h: number;
}

export function boxInfo(n: OrgChartNode, filter: ShiftFilter, fonts: ChartFonts): BoxInfo {
  const badge = n.hasContent ? 18 : 0;
  const titleLines = wrapText(n.displayTitle || n.title, fonts.title, W - 2 * PAD - badge);
  const rows = rowsOf(n, filter);
  const captions: string[] = [];
  const chips: string[] = [];

  const contexts = n.contexts ?? [];
  if (contexts.length === 1) {
    // One context reads best as the thing it is: a chip on the box saying where
    // this work happens. The four seats on Pelican Machine hang under Printing
    // Incharge and carry "Pelican Machine" here — the machine is not a manager.
    chips.push(fitText(contexts[0].name, fonts.chip, W - 2 * PAD - 12));
  }
  if (n.shiftPattern === 'DN') captions.push('Day & Night shift');
  if (contexts.length > 1) {
    wrapText(`Shared across: ${contexts.map((c) => c.name).join(', ')}`, fonts.caption, W - 2 * PAD)
      .forEach((l) => captions.push(l));
  }
  if (n.status && n.status !== 'ACTIVE') captions.push(`${n.status.charAt(0)}${n.status.slice(1).toLowerCase()} position`);

  let h = PAD + titleLines.length * TLH + captions.length * CAPH + chips.length * CHIPH;
  if (rows.length) h += 7 + rows.length * (ROWH + ROWG) - ROWG;
  h += PAD + 2;
  return { titleLines, captions, chips, rows, h };
}

// ── Layout: two passes ──────────────────────────────────────────────────────

export interface PlacedNode {
  id: number;
  node: OrgChartNode;
  info: BoxInfo;
  x: number;
  y: number;
  h: number;
  mode: 'leaf' | 'stack' | 'side' | 'mixed' | 'groups';
  /**
   * `groups` only (spec §15): the team split by work process, one labelled
   * box per process. `across` when this seat heads its process (boxes side by
   * side), `down` otherwise (boxes stacked under it, indented).
   */
  groups?: ProcessGroup[];
  orient?: 'across' | 'down';
  /**
   * `mixed` only (spec §14): the reports that have teams of their own, side by
   * side on the next level's line, and the ones that do not, in ONE column
   * placed after them. Both in payload order; together they are `kids`.
   */
  row?: number[];
  column?: number[];
  /** Subtree width. */
  sw: number;
  /** Children actually drawn (empty when collapsed). */
  kids: number[];
  collapsed: boolean;
  hidden: number;
  depth: number;
}

export interface LayoutResult {
  placed: Map<number, PlacedNode>;
  order: number[];
  width: number;
  height: number;
}

export interface LayoutOptions {
  root: number | '';
  filter: ShiftFilter;
  collapsed: Set<number>;
  arrange: Record<number, Arrange>;
  fonts: ChartFonts;
}

/**
 * Pass 1 sizes bottom-up and picks each node's arrangement; pass 2 places
 * top-down. Both are the source file's, line for line.
 */
export function layoutChart(model: ChartModel, opts: LayoutOptions): LayoutResult {
  const { collapsed, arrange, filter, fonts } = opts;
  const placed = new Map<number, PlacedNode>();
  const order: number[] = [];

  const realKids = (id: number) => model.children.get(id) ?? [];

  const size = (id: number, depth: number): number => {
    const node = model.byId.get(id)!;
    const isCollapsed = collapsed.has(id);
    const kids = isCollapsed ? [] : realKids(id);
    const p: PlacedNode = {
      id,
      node,
      info: boxInfo(node, filter, fonts),
      x: 0,
      y: 0,
      h: 0,
      mode: 'leaf',
      sw: W,
      kids,
      collapsed: isCollapsed,
      hidden: isCollapsed ? descendantCount(model, id) : 0,
      depth,
    };
    p.h = p.info.h;
    placed.set(id, p);
    order.push(id);
    if (!kids.length) return W;

    // ── THE `auto` RULE (spec §14, since 2026-10-09) ─────────────────────
    // The client: "all people in one level should be on one horizontal line",
    // then "if there are only individuals reporting in, we can make it
    // vertical. That way all ICs won't take up the width." So:
    //
    //   every report has a team of its own   side by side, however many
    //   every report is a leaf               one column under the manager
    //   some of each                         `mixed`: the managers side by
    //                                        side on the next level's line,
    //                                        the leaves in ONE column AFTER
    //                                        them (to the right), starting
    //                                        on that same line
    //
    // Managers set the width; individual contributors add one column per team
    // at most. A collapsed manager still counts as a manager — it has a team,
    // folded.
    //
    // This replaced the September rule, which also stacked any team over five
    // (`WIDE_ROW`): narrow (1,678 x 6,522 for Karni's 114 boxes, against 8,374
    // x 1,750 fully side by side) but its levels did not line up, which is
    // what the client could not read.
    //
    // A per-node override still wins: `side` puts every report on the line,
    // leaves too; `stack` makes the whole team an indented list.
    const pref = arrange[id] ?? 'auto';
    const managers = kids.filter((k) => realKids(k).length > 0);
    // ── WORK PROCESSES FIRST (spec §15) ──────────────────────────────────
    // A team spanning two or more processes is drawn as one labelled box per
    // process, its people stacked inside. The boxes go side by side when this
    // seat heads its process, and stack under it otherwise. A team that is all
    // one process has no box and falls through to the rule below. An override
    // (`side` / `stack`) means exactly what it says and skips the boxes.
    // Leadership stays a plain tree: a seat in a ROOT unit (Management, for
    // Karni) never boxes its team, so the Directors read as an ordinary tree
    // and the boxes begin where the reports split into departments.
    const groups = pref === 'auto' && !inRootProcess(model, node) ? groupByProcess(model, id, kids) : [];
    p.mode =
      groups.length > 1
        ? 'groups'
        : pref === 'side'
          ? 'side'
          : pref === 'stack' || managers.length === 0
            ? 'stack'
            : managers.length === kids.length
              ? 'side'
              : 'mixed';

    const sizes = kids.map((k) => size(k, depth + 1));
    if (p.mode === 'groups') {
      p.groups = groups;
      // Side by side when this seat heads its process, OR when any box holds a
      // seat that heads a process (that person has a department under them).
      // Stacked boxes remain only for small cross-process teams with no head.
      p.orient =
        headsProcess(model, node) || kids.some((k) => headsAnyProcess(model, model.byId.get(k)!))
          ? 'across'
          : 'down';
      for (const g of groups) {
        const inner = Math.max(...g.ids.map((k) => placed.get(k)!.sw));
        const chip = g.label ? textWidth(g.label, fonts.chip) + 16 : 0;
        g.w = PB + IND + Math.max(inner, chip) + PB;
      }
      p.sw =
        p.orient === 'across'
          ? Math.max(W, groups.reduce((a, g) => a + g.w, 0) + HG * (groups.length - 1))
          : Math.max(W, IND + Math.max(...groups.map((g) => g.w)));
      return p.sw;
    }
    if (p.mode === 'mixed') {
      p.row = managers;
      p.column = kids.filter((k) => realKids(k).length === 0);
      const rowW = managers.reduce((a, k) => a + placed.get(k)!.sw, 0) + HG * (managers.length - 1);
      p.sw = Math.max(W, rowW + HG + IND + W);
      return p.sw;
    }
    p.sw =
      p.mode === 'stack'
        ? IND + Math.max(...sizes)
        : Math.max(W, sizes.reduce((a, b) => a + b, 0) + HG * (sizes.length - 1));
    return p.sw;
  };

  // ── Level bands (spec §14) ──────────────────────────────────────────────
  // A box is ON THE GRID when every ancestor up to the start lays its team out
  // side by side (or is `mixed` and the box is one of its managers). Grid boxes
  // take their level's y whatever branch they are in, and a level's band is as
  // tall as its tallest GRID box.
  //
  // Columns and lists do NOT stretch the band. They hang below their own
  // manager and may run down beside the next level's line — that is the point
  // of the column. They cannot collide with it: every subtree owns a disjoint
  // x-range (`sw`), a column lives inside its manager's range, and nothing else
  // in that range is placed below it.
  const levelTop: number[] = [];

  const place = (id: number, left: number, top: number, grid = false): number => {
    const p = placed.get(id)!;
    p.y = grid ? levelTop[p.depth] : top;
    let bottom = p.y + p.info.h;
    if (!p.kids.length) {
      p.x = left;
      return bottom;
    }
    if (p.mode === 'groups') {
      // Inside a box the people stack, each with its own team below them; a
      // member's subtree is laid out by the same rules, so a member whose team
      // spans processes gets boxes of its own.
      const fill = (g: ProcessGroup, gx: number, gy: number) => {
        g.x = gx;
        g.y = gy;
        let my = gy + PT;
        let last = my;
        for (const k of g.ids) {
          last = place(k, gx + PB + IND, my);
          my = last + SG;
        }
        g.h = last + PB - gy;
        return gy + g.h;
      };
      const groups = p.groups!;
      if (p.orient === 'across') {
        // On the next level's line when this box is on the grid, so a split
        // team still starts where its cousins' teams start.
        const next = levelTop[p.depth + 1];
        const below = p.y + p.info.h + VG;
        const gy = grid && next !== undefined ? Math.max(next, below) : below;
        const total = groups.reduce((a, g) => a + g.w, 0) + HG * (groups.length - 1);
        let gx = left + (p.sw - total) / 2;
        for (const g of groups) {
          bottom = Math.max(bottom, fill(g, gx, gy));
          gx += g.w + HG;
        }
        const lastG = groups[groups.length - 1];
        const mid = (groups[0].x + lastG.x + lastG.w) / 2 - W / 2;
        p.x = Math.min(Math.max(mid, left), left + p.sw - W);
      } else {
        p.x = left;
        let gy = bottom + SV;
        for (const g of groups) {
          bottom = fill(g, left + IND, gy);
          gy = bottom + SG;
        }
      }
      return bottom;
    }
    if (p.mode === 'stack') {
      p.x = left;
      let cy = bottom + SV;
      for (const k of p.kids) {
        bottom = place(k, left + IND, cy);
        cy = bottom + SG;
      }
      return bottom;
    }
    const row = p.mode === 'mixed' ? p.row! : p.kids;
    const column = p.mode === 'mixed' ? p.column! : [];
    const colW = column.length ? HG + IND + W : 0;
    const total =
      row.reduce((a, k) => a + placed.get(k)!.sw, 0) + HG * (row.length - 1) + colW;
    let cx = left + (p.sw - total) / 2;
    const cy = grid ? levelTop[p.depth + 1] : p.y + p.info.h + VG;
    for (const k of row) {
      bottom = Math.max(bottom, place(k, cx, cy, grid));
      cx += placed.get(k)!.sw + HG;
    }
    // The leaf column starts on the managers' line, indented from its spine.
    let ly = cy;
    for (const k of column) {
      const b = place(k, cx + IND, ly);
      bottom = Math.max(bottom, b);
      ly = b + SG;
    }
    const first = placed.get(row[0])!;
    const lastX = column.length ? cx + IND : placed.get(row[row.length - 1])!.x;
    const mid = (first.x + lastX) / 2;
    // Centre over the children, but clamped inside this node's own subtree band
    // so a wide branch never pushes a parent over its neighbour.
    p.x = Math.min(Math.max(mid, left), left + p.sw - W);
    return bottom;
  };

  const roots =
    opts.root === ''
      ? model.roots
      : model.byId.has(opts.root)
        ? [opts.root]
        : model.roots;

  for (const r of roots) size(r, 0);

  const band: number[] = [];
  const onGrid = (id: number) => {
    const p = placed.get(id)!;
    band[p.depth] = Math.max(band[p.depth] ?? 0, p.info.h);
    if (p.mode === 'side') p.kids.forEach(onGrid);
    else if (p.mode === 'mixed') p.row!.forEach(onGrid);
  };
  roots.forEach(onGrid);
  let t = M + HEAD;
  band.forEach((h, d) => {
    levelTop[d] = t;
    t += h + VG;
  });

  let x = M;
  let bottom = M + HEAD;
  for (const r of roots) {
    bottom = Math.max(bottom, place(r, x, M + HEAD, true));
    x += placed.get(r)!.sw + HG * 2;
  }

  return {
    placed,
    order,
    width: Math.max(600, x - HG * 2 + M),
    height: bottom + M,
  };
}

// ── The draw list ───────────────────────────────────────────────────────────

export type Prim =
  | {
      k: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      r?: number;
      fill?: string;
      stroke?: string;
      sw?: number;
      dash?: number[];
    }
  | { k: 'path'; d: string; stroke: string; sw?: number; dash?: number[]; fill?: string }
  | { k: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number }
  | {
      k: 'text';
      x: number;
      y: number;
      text: string;
      size: number;
      weight: number;
      italic?: boolean;
      fill: string;
      anchor?: 'start' | 'middle' | 'end';
    };

export interface BoxRender {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  prims: Prim[];
  /** What a screen reader says when the box takes focus. */
  label: string;
  toggle: { cx: number; cy: number; w: number; collapsed: boolean; hidden: number; prims: Prim[] } | null;
}

export interface SceneHeader {
  title: string;
  meta: string;
  counts: string;
}

export interface ChartScene {
  width: number;
  height: number;
  background: string;
  header: Prim[];
  /** Work-process boxes (spec §15), outer before inner; drawn under the edges. */
  groups: Prim[];
  edges: Prim[];
  secondary: Prim[];
  boxes: BoxRender[];
  layout: LayoutResult;
}

export interface SceneOptions extends LayoutOptions {
  palette: ChartPalette;
  colours: boolean;
  header: SceneHeader;
  /** Suppresses the selection ring and keeps every collapse pill for print. */
  forExport?: boolean;
  secondaryEdges: OrgChartEdge[];
}

function rowTone(
  r: BoxRow,
  p: ChartPalette,
): { bar: string; fill: string; text: string; status: string } {
  if (!r.occupant) return { bar: p.vacant, fill: p.vacantFill, text: p.vacantText, status: '' };
  if (r.occupant.attendanceStatus === 'ABSENT')
    return { bar: p.absent, fill: p.absentFill, text: p.absentText, status: 'Absent' };
  if (r.occupant.attendanceStatus === 'PRESENT')
    return { bar: p.present, fill: p.presentFill, text: p.presentText, status: 'Present' };
  return { bar: p.faint, fill: p.surface2, text: p.ink, status: '' };
}

const SHIFT_NAME: Record<'G' | 'D' | 'N', string> = { G: 'General', D: 'Day', N: 'Night' };

function boxLabel(p: PlacedNode, filter: ShiftFilter): string {
  const n = p.node;
  const rows = p.info.rows;
  const filled = rows.filter((r) => r.occupant).length;
  const bits = [n.displayTitle || n.title];
  if (n.positionCode) bits.push(n.positionCode);
  bits.push(`${filled} of ${rows.length} seats filled`);
  if (rows.length - filled > 0) bits.push(`${rows.length - filled} vacant`);
  if (n.shiftPattern === 'DN') bits.push('day and night shift');
  if (n.contexts?.length) bits.push(`work context ${n.contexts.map((c) => c.name).join(', ')}`);
  const kids = p.kids.length + p.hidden;
  if (kids) bits.push(p.collapsed ? `${p.hidden} reports hidden` : `${p.kids.length} direct reports`);
  if (filter !== 'all') bits.push(`${SHIFT_NAME[filter]} shift only`);
  return bits.join('. ');
}

/** Builds every primitive the chart draws, once, for both renderers. */
export function buildScene(model: ChartModel, opts: SceneOptions): ChartScene {
  const lay = layoutChart(model, opts);
  const p = opts.palette;
  const f = opts.fonts;
  const edges: Prim[] = [];
  const secondary: Prim[] = [];
  const boxes: BoxRender[] = [];

  const linePath: string[] = [];
  for (const id of lay.order) {
    const n = lay.placed.get(id)!;
    if (!n.kids.length) continue;
    if (n.mode === 'groups') {
      // Each process box has its own spine just inside its left edge, fed by
      // ONE line from the manager, with a tick to every member — so a report
      // reaches its manager visibly across the box's border.
      const pb = n.y + n.info.h;
      const spineX = (g: ProcessGroup) => g.x + PB + IND / 2;
      const inner = (g: ProcessGroup, fromY: number) => {
        const ix = spineX(g);
        let last = fromY;
        for (const k of g.ids) {
          const c = lay.placed.get(k)!;
          last = c.y + Math.min(c.info.h / 2, 17);
          linePath.push(`M${ix} ${last}H${c.x}`);
        }
        linePath.push(`M${ix} ${fromY}V${last}`);
      };
      if (n.orient === 'across') {
        const px = n.x + W / 2;
        const my = Math.min(...n.groups!.map((g) => g.y)) - VG / 2;
        const xs = n.groups!.map(spineX);
        linePath.push(`M${px} ${pb}V${my}`);
        linePath.push(`M${Math.min(px, ...xs)} ${my}H${Math.max(px, ...xs)}`);
        n.groups!.forEach((g) => inner(g, my));
      } else {
        const sx = n.x + IND / 2;
        let lastFeed = pb;
        for (const g of n.groups!) {
          lastFeed = g.y + PB + PCH / 2;
          linePath.push(`M${sx} ${lastFeed}H${spineX(g)}`);
          inner(g, lastFeed);
        }
        linePath.push(`M${sx} ${pb}V${lastFeed}`);
      }
      continue;
    }
    if (n.mode === 'stack') {
      const sx = n.x + IND / 2;
      let last = n.y + n.info.h;
      for (const k of n.kids) {
        const c = lay.placed.get(k)!;
        const cy = c.y + Math.min(c.info.h / 2, 17);
        linePath.push(`M${sx} ${cy}H${c.x}`);
        last = cy;
      }
      linePath.push(`M${sx} ${n.y + n.info.h}V${last}`);
    } else {
      const px = n.x + W / 2;
      const pb = n.y + n.info.h;
      // The bus runs half a gap above the children rather than half a gap below
      // the parent: a short parent sits in a band sized by a taller neighbour,
      // and every bus on one level must share a y or the picture stops
      // reading as levels.
      const row = n.mode === 'mixed' ? n.row! : n.kids;
      const column = n.mode === 'mixed' ? n.column! : [];
      const my = Math.min(...n.kids.map((k) => lay.placed.get(k)!.y)) - VG / 2;
      const cxs = row.map((k) => lay.placed.get(k)!.x + W / 2);
      // A `mixed` team's leaf column hangs off the same bus by a spine down its
      // left side, the way an indented list hangs off its manager.
      const spine = column.length ? lay.placed.get(column[0])!.x - IND / 2 : null;
      if (spine != null) cxs.push(spine);
      linePath.push(`M${px} ${pb}V${my}`);
      linePath.push(`M${Math.min(px, ...cxs)} ${my}H${Math.max(px, ...cxs)}`);
      for (const k of row) {
        const c = lay.placed.get(k)!;
        linePath.push(`M${c.x + W / 2} ${my}V${c.y}`);
      }
      if (spine != null) {
        let last = my;
        for (const k of column) {
          const c = lay.placed.get(k)!;
          last = c.y + Math.min(c.info.h / 2, 17);
          linePath.push(`M${spine} ${last}H${c.x}`);
        }
        linePath.push(`M${spine} ${my}V${last}`);
      }
    }
  }
  if (linePath.length) edges.push({ k: 'path', d: linePath.join(''), stroke: p.faint, sw: 1.2 });

  // ── Secondary links. A dashed line with no words on it is exactly what made
  // this client invent fake roles to explain who else they answer to, so a
  // scoped edge is labelled with its scope. ────────────────────────────────
  const dashPath: string[] = [];
  for (const e of opts.secondaryEdges) {
    const s = lay.placed.get(e.fromPositionId);
    const t = lay.placed.get(e.toPositionId);
    if (!s || !t) continue;
    const tb = t.y + t.info.h;
    let labelAt: { x: number; y: number } | null = null;
    if (tb + 10 < s.y) {
      const laneY = tb + Math.round(VG * 0.22);
      const obstacles = [...lay.placed.values()].filter(
        (b) => b !== s && b !== t && b.y < s.y && b.y + b.info.h > laneY,
      );
      const hit = (x: number) => obstacles.some((b) => x > b.x - 6 && x < b.x + W + 6);
      let lx = s.x + W + HG / 2;
      let sideX = s.x + W;
      if (hit(lx)) {
        const alt = s.x - HG / 2;
        if (!hit(alt)) {
          lx = alt;
          sideX = s.x;
        }
      }
      const tx = lx > t.x + W / 2 ? t.x + W * 0.74 : t.x + W * 0.26;
      dashPath.push(`M${sideX} ${s.y + 14}H${lx}V${laneY}H${tx}V${tb}`);
      labelAt = { x: (lx + tx) / 2, y: laneY - 4 };
    } else {
      dashPath.push(`M${s.x + W / 2} ${s.y}L${t.x + W / 2} ${tb}`);
      labelAt = { x: (s.x + t.x) / 2 + W / 2, y: (s.y + tb) / 2 - 4 };
    }
    const label =
      e.scopeType && e.scopeType !== 'GENERAL' && e.scopeLabel
        ? `${e.typeName}: ${e.scopeLabel}`
        : e.typeCode !== 'DOTTED_LINE'
          ? e.typeName
          : '';
    if (label && labelAt) {
      const txt = fitText(label, f.rowSmall, 180);
      const wPx = textWidth(txt, f.rowSmall) + 10;
      secondary.push({
        k: 'rect',
        x: labelAt.x - wPx / 2,
        y: labelAt.y - 11,
        w: wPx,
        h: 14,
        r: 4,
        fill: p.surface,
        stroke: p.border,
        sw: 0.8,
      });
      secondary.push({
        k: 'text',
        x: labelAt.x,
        y: labelAt.y,
        text: txt,
        size: 11,
        weight: 500,
        fill: p.muted,
        anchor: 'middle',
      });
    }
  }
  if (dashPath.length)
    secondary.unshift({ k: 'path', d: dashPath.join(''), stroke: p.muted, sw: 1.4, dash: [6, 4] });

  // ── Work-process boxes (spec §15). A grouping, not a person: no fill of a
  // person's box, a larger radius, a hairline in the faint text tone (the
  // border token vanishes on the dark surface) and a small title chip. ─────
  const groups: Prim[] = [];
  for (const id of lay.order) {
    const n = lay.placed.get(id)!;
    if (n.mode !== 'groups' || !n.kids.length) continue;
    for (const g of n.groups!) {
      groups.push({ k: 'rect', x: g.x, y: g.y, w: g.w, h: g.h, r: 12, fill: p.canvas, stroke: p.faint, sw: 0.9 });
      if (!g.label) continue;
      const txt = fitText(g.label, f.chip, g.w - 2 * PB - IND - 16);
      const cw = textWidth(txt, f.chip) + 16;
      const cx = g.x + PB + IND;
      groups.push({ k: 'rect', x: cx, y: g.y + PB, w: cw, h: PCH, r: PCH / 2, fill: p.surface, stroke: p.faint, sw: 0.8 });
      groups.push({ k: 'text', x: cx + 8, y: g.y + PB + 12, text: txt, size: 11, weight: 600, fill: p.muted });
    }
  }

  // ── Boxes ────────────────────────────────────────────────────────────────
  for (const id of lay.order) {
    const n = lay.placed.get(id)!;
    const I = n.info;
    const x = n.x;
    const y = n.y;
    // The selection ring is NOT drawn here. It is an overlay in the canvas
    // component, so moving the selection with the arrow keys does not rebuild
    // every primitive in the chart on each keystroke.
    const stroke = p.border;
    const prims: Prim[] = [];

    prims.push({
      k: 'rect',
      x,
      y,
      w: W,
      h: I.h,
      r: 8,
      fill: p.surface,
      stroke,
      sw: 1.1,
    });

    if (n.node.hasContent) {
      const open = n.node.counts?.openPoints ?? 0;
      prims.push({
        k: 'circle',
        cx: x + W - 13,
        cy: y + 13,
        r: 7.5,
        fill: open ? p.absentFill : p.accentFill,
        stroke: open ? p.absent : p.accent,
        sw: 1,
      });
      prims.push({
        k: 'text',
        x: x + W - 13,
        y: y + 17,
        text: open ? '?' : 'K',
        size: 10,
        weight: 600,
        fill: open ? p.absentText : p.accentText,
        anchor: 'middle',
      });
    }

    let ty = y + PAD + 12;
    for (const line of I.titleLines) {
      prims.push({
        k: 'text',
        x: x + W / 2,
        y: ty,
        text: line,
        size: 13.5,
        weight: 600,
        fill: p.ink,
        anchor: 'middle',
      });
      ty += TLH;
    }

    let cy = y + PAD + I.titleLines.length * TLH;
    for (const c of I.captions) {
      prims.push({
        k: 'text',
        x: x + W / 2,
        y: cy + 9.5,
        text: c,
        size: 11,
        weight: 400,
        italic: true,
        fill: p.muted,
        anchor: 'middle',
      });
      cy += CAPH;
    }
    for (const chip of I.chips) {
      const cw = textWidth(chip, f.chip) + 16;
      prims.push({
        k: 'rect',
        x: x + (W - cw) / 2,
        y: cy + 1,
        w: cw,
        h: 15,
        r: 7.5,
        fill: p.accentFill,
        stroke: p.border,
        sw: 0.8,
      });
      prims.push({
        k: 'text',
        x: x + W / 2,
        y: cy + 12,
        text: chip,
        size: 11,
        weight: 500,
        fill: p.accentText,
        anchor: 'middle',
      });
      cy += CHIPH;
    }

    if (I.rows.length) {
      cy += 3;
      prims.push({
        k: 'path',
        d: `M${x + PAD} ${cy}H${x + W - PAD}`,
        stroke: p.divider,
        sw: 1,
      });
      cy += 4;
      for (const r of I.rows) {
        const tone = rowTone(r, p);
        const rx = x + PAD;
        const rw = W - 2 * PAD;
        const base = cy + 13.5;
        if (opts.colours) {
          prims.push({ k: 'rect', x: rx, y: cy, w: rw, h: ROWH, r: 4, fill: tone.fill });
          prims.push({ k: 'rect', x: rx, y: cy, w: 3.5, h: ROWH, fill: tone.bar });
        } else {
          prims.push({
            k: 'rect',
            x: rx,
            y: cy,
            w: rw,
            h: ROWH,
            r: 4,
            fill: r.occupant ? p.surface2 : 'none',
            stroke: r.occupant ? undefined : p.border,
            sw: r.occupant ? undefined : 0.8,
            dash: r.occupant ? undefined : [3, 3],
          });
        }
        let tx = rx + 8;
        if (r.shift !== 'G' && opts.filter === 'all') {
          prims.push({
            k: 'text',
            x: tx,
            y: base,
            text: SHIFT_NAME[r.shift],
            size: 11,
            weight: 400,
            fill: p.faint,
          });
          tx += 36;
        }
        const name = r.occupant ? r.occupant.name?.trim() || 'Name not recorded' : 'Vacant';
        const statusW = tone.status ? 48 : 4;
        prims.push({
          k: 'text',
          x: tx,
          y: base,
          text: fitText(name, f.row, rx + rw - tx - statusW),
          size: 12.5,
          weight: 400,
          italic: !r.occupant,
          fill: opts.colours ? tone.text : r.occupant ? p.ink : p.faint,
        });
        if (tone.status) {
          prims.push({
            k: 'text',
            x: rx + rw - 5,
            y: base,
            text: tone.status,
            size: 11,
            weight: 500,
            fill: opts.colours ? tone.text : p.muted,
            anchor: 'end',
          });
        }
        cy += ROWH + ROWG;
      }
    }

    // Collapse affordance: always shows the hidden count, so a folded branch
    // never reads as an empty one.
    const realKidCount = (model.children.get(id) ?? []).length;
    let toggle: BoxRender['toggle'] = null;
    if (realKidCount && (!opts.forExport || n.collapsed)) {
      const label = n.collapsed ? `+${n.hidden}` : '−';
      const bw = n.collapsed ? Math.max(28, textWidth(label, f.badge) + 16) : 20;
      const bx = x + W - 16;
      const by = y + I.h;
      const tprims: Prim[] = [
        {
          k: 'rect',
          x: bx - bw / 2,
          y: by - 8,
          w: bw,
          h: 16,
          r: 8,
          fill: p.surface,
          stroke: p.border,
          sw: 1,
        },
        {
          k: 'text',
          x: bx,
          y: by + 4,
          text: label,
          size: 10.5,
          weight: 600,
          fill: p.muted,
          anchor: 'middle',
        },
      ];
      toggle = { cx: bx, cy: by, w: bw, collapsed: n.collapsed, hidden: n.hidden, prims: tprims };
    }

    boxes.push({
      id,
      x,
      y,
      w: W,
      h: I.h,
      prims,
      label: boxLabel(n, opts.filter),
      toggle,
    });
  }

  // ── Header: drawn into the chart because the client prints it ────────────
  const legend: { swatch?: string; fill?: string; line?: 'solid' | 'dash'; text: string }[] = [];
  if (opts.colours) {
    legend.push({ swatch: p.present, fill: p.presentFill, text: 'Present' });
    legend.push({ swatch: p.absent, fill: p.absentFill, text: 'Absent' });
    legend.push({ swatch: p.vacant, fill: p.vacantFill, text: 'Vacant' });
  }
  legend.push({ line: 'solid', text: 'Reports to' });
  if (groups.length) legend.push({ swatch: p.faint, fill: p.canvas, text: 'Work process' });
  if (opts.secondaryEdges.length) legend.push({ line: 'dash', text: 'Other reporting line' });

  let lw = 0;
  const legendWidths = legend.map((g) => {
    const w = (g.line ? 34 : 22) + textWidth(g.text, f.headMeta) + 18;
    lw += w;
    return w;
  });
  // A narrow chart (a folded opening, a small branch) is widened until the
  // title and the legend share their line without overprinting.
  const width = Math.max(lay.width, Math.ceil(M + textWidth(opts.header.title, f.headTitle) + 32 + lw + M));

  const header: Prim[] = [];
  header.push({
    k: 'text',
    x: M,
    y: M + 18,
    text: fitText(opts.header.title, f.headTitle, width - 2 * M),
    size: 20,
    weight: 600,
    fill: p.ink,
  });
  header.push({
    k: 'text',
    x: M,
    y: M + 40,
    text: opts.header.meta,
    size: 13,
    weight: 400,
    fill: p.muted,
  });
  header.push({
    k: 'text',
    x: M,
    y: M + 58,
    text: opts.header.counts,
    size: 13,
    weight: 400,
    fill: p.muted,
  });

  const legendX = Math.max(M, width - M - lw);
  let gx = legendX;
  legend.forEach((g, i) => {
    const gy = M + 16;
    if (g.line) {
      header.push({
        k: 'path',
        d: `M${gx} ${gy - 4}H${gx + 28}`,
        stroke: g.line === 'dash' ? p.muted : p.faint,
        sw: 1.4,
        dash: g.line === 'dash' ? [6, 4] : undefined,
      });
      header.push({
        k: 'text',
        x: gx + 34,
        y: gy,
        text: g.text,
        size: 13,
        weight: 400,
        fill: p.muted,
      });
    } else {
      header.push({
        k: 'rect',
        x: gx,
        y: gy - 11,
        w: 16,
        h: 13,
        r: 3,
        fill: g.fill,
        stroke: g.swatch,
        sw: 1,
      });
      header.push({
        k: 'text',
        x: gx + 22,
        y: gy,
        text: g.text,
        size: 13,
        weight: 400,
        fill: p.muted,
      });
    }
    gx += legendWidths[i];
  });
  header.push({
    k: 'path',
    d: `M${M} ${M + 70}H${width - M}`,
    stroke: p.border,
    sw: 1,
  });

  return {
    width,
    height: lay.height,
    background: p.surface,
    header,
    groups,
    edges,
    secondary,
    boxes,
    layout: lay,
  };
}

/**
 * The chart, described in words — the SVG's text alternative.
 *
 * A screen reader given a picture of 114 boxes needs a sentence that says what
 * the picture is *for*, and a route to the same facts. Both are here: the shape
 * and the totals, then the fact that the table view carries every row.
 */
export function describeChart(model: ChartModel, ids: number[], filter: ShiftFilter): string {
  const inView = new Set(ids);
  const topIds = ids.filter((id) => {
    const p = model.parent.get(id);
    return p === undefined || !inView.has(p);
  });
  const tops = topIds
    .slice(0, 3)
    .map((id) => {
      const n = model.byId.get(id);
      if (!n) return '';
      const kids = (model.children.get(id) ?? []).length;
      return `${n.displayTitle || n.title} with ${kids} direct reports`;
    })
    .filter(Boolean);
  const c = countRows(model, ids, filter);
  return (
    `A reporting chart of ${c.positions} positions holding ${c.seats} sanctioned seats, ` +
    `${c.seats - c.vacant} filled and ${c.vacant} vacant` +
    (filter === 'all' ? '' : `, showing ${filter === 'D' ? 'day' : 'night'} shift seats only`) +
    '. ' +
    (tops.length ? `It starts at ${tops.join('; ')}. ` : '') +
    'Primary reporting lines are solid; every other reporting relationship is dashed and labelled with its scope. ' +
    'A machine or area is shown as a chip on the box, never as a manager. ' +
    'Each box is focusable: use the arrow keys to move between a manager, its reports and its siblings, ' +
    'Enter to open the position card, and Space to fold a branch. ' +
    'The Table view carries the same positions and the same filters in a keyboard-operable list.'
  );
}
