import type {
  OrgChartDepartment,
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
export type ShiftFilter = 'all' | 'D' | 'N';
export type Arrange = 'auto' | 'side' | 'stack';

/**
 * What is DRAWN (spec §16) — three switches over the same data. At least one
 * is always on (`normaliseShow`), so the canvas is never empty.
 *   departments  boxes around their people; off = the plain reporting tree
 *   roles        the seat's title
 *   people       the names (and the vacancy rows) in the seat
 */
export interface ChartShow {
  departments: boolean;
  roles: boolean;
  people: boolean;
}
export const SHOW_ALL: ChartShow = { departments: true, roles: true, people: true };

/** A stored value made safe: unknown keys dropped, all-off turned back to all-on. */
export function normaliseShow(v: Partial<ChartShow> | null | undefined): ChartShow {
  const s = {
    departments: v?.departments !== false,
    roles: v?.roles !== false,
    people: v?.people !== false,
  };
  return s.departments || s.roles || s.people ? s : { ...SHOW_ALL };
}

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
  dept: string;
  deptMeta: string;
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
    dept: fontString(13.5, 700, family),
    deptMeta: fontString(11, 400, family),
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
  /** The department tree, in rank order (empty for a payload that predates it). */
  departments: OrgChartDepartment[];
  deptById: Map<number, OrgChartDepartment>;
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

  const departments = [...(graph.departments ?? [])].sort((a, b) => a.rank - b.rank || a.id - b.id);
  const deptById = new Map(departments.map((d) => [d.id, d]));

  return { byId, children, parent, roots, depth, secondary, droppedPrimary, order, departments, deptById };
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

/** One position's seats on the chart's terms. */
export interface SeatCount {
  seats: number;
  filled: number;
  vacant: number;
  /** More people than seats. Counted as its seats, no vacancy, every person filled. */
  overFilled: boolean;
  /** The people counted (those of the filtered shift, on a day-and-night seat). */
  occupants: OrgChartOccupant[];
}

/**
 * THE seat rule on the frontend — the mirror of the backend's
 * `services/seatCount.js`, and the only place this app's screens may get
 * seats, filled and vacant from for a chart node.
 *
 *   seats   = `effectiveSanctioned` (the server's answer: headcount for a
 *             single-shift seat, Σ required_count for a day-and-night one)
 *   filled  = the people in the seat
 *   vacant  = max(0, seats − filled) — the server's `vacancies`; never negative
 *
 * AN OVER-FILLED SEAT (seven day operators on a seat sanctioned 1 + 1) is its
 * sanctioned seats, all its people filled, and NO vacancy — the surplus on day
 * is not a vacancy on night. So Σ seats − Σ filled is NOT Σ vacant: Karni is
 * 202 seats, 71 filled, 149 vacant (the six over-filled seats hold 18 more
 * people than they have seats for).
 *
 * Until 2026-10-10 the header, the stat strip and the box counts counted the
 * ROWS DRAWN instead (`rowsOf`), which pads each shift on its own and counts
 * every surplus person as a seat: 234 seats / 163 vacant against the server's
 * 202 / 149. `rowsOf` is still what a box DRAWS — a row per person, an empty
 * row per unfilled shift — but it is no longer what anything counts.
 *
 * With a shift filter there is no server number, so the same rule is applied
 * to that shift alone: its required count, its people, the difference floored
 * at zero. A general-shift seat belongs to neither and is counted either way.
 */
export function seatCount(n: OrgChartNode, filter: ShiftFilter = 'all'): SeatCount {
  const all = n.occupants ?? [];
  if (filter === 'all' || n.shiftPattern !== 'DN') {
    const fixed = n.shiftPattern === 'D' || n.shiftPattern === 'N' ? n.shiftPattern : null;
    if (filter !== 'all' && fixed && fixed !== filter) {
      return { seats: 0, filled: 0, vacant: 0, overFilled: false, occupants: [] };
    }
    const seats = effectiveSeats(n);
    const vacant = Math.max(0, n.vacancies ?? seats - all.length);
    return { seats, filled: all.length, vacant, overFilled: all.length > seats, occupants: all };
  }
  const seats = requiredFor(n, filter);
  const people = all.filter((o) => occupantShift(o) === filter);
  return {
    seats,
    filled: people.length,
    vacant: Math.max(0, seats - people.length),
    overFilled: people.length > seats,
    occupants: people,
  };
}

/**
 * Totals over a set of positions, by `seatCount` — so the header, the stat
 * strip, a closed department's count and the table cannot disagree with each
 * other or with the server's `counts`.
 *
 * "Filled" and "present" are kept apart deliberately: on a date with no
 * attendance every person is *unmarked*, and folding those into "present"
 * would report an attendance figure the system does not have.
 */
export function countRows(model: ChartModel, ids: number[], filter: ShiftFilter): VisibleCounts {
  let present = 0;
  let absent = 0;
  let unmarked = 0;
  let vacant = 0;
  let seats = 0;
  let filled = 0;
  for (const id of ids) {
    const n = model.byId.get(id);
    if (!n) continue;
    const c = seatCount(n, filter);
    seats += c.seats;
    filled += c.filled;
    vacant += c.vacant;
    for (const o of c.occupants) {
      if (o.attendanceStatus === 'ABSENT') absent += 1;
      else if (o.attendanceStatus === 'PRESENT') present += 1;
      else unmarked += 1;
    }
  }
  return { positions: ids.length, seats, filled, present, absent, unmarked, vacant };
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

export function boxInfo(
  n: OrgChartNode,
  filter: ShiftFilter,
  fonts: ChartFonts,
  show: ChartShow = SHOW_ALL,
): BoxInfo {
  const badge = n.hasContent ? 18 : 0;
  const titleLines = show.roles
    ? wrapText(n.displayTitle || n.title, fonts.title, W - 2 * PAD - badge)
    : [];
  // PEOPLE OFF: the seat is its role — no names and no vacancy rows.
  // ROLES OFF: names only. A vacancy row says "this role is unfilled", and with
  // the role hidden it says nothing, so vacancy rows go; a seat with nobody in
  // it keeps ONE muted "Vacant seat" row so the reporting shape stays whole.
  let rows = show.people ? rowsOf(n, filter) : [];
  if (show.people && !show.roles) {
    rows = rows.filter((r) => r.occupant);
    if (!rows.length) rows = [{ shift: 'G', occupant: null }];
  }
  const captions: string[] = [];
  const chips: string[] = [];

  const contexts = n.contexts ?? [];
  if (contexts.length === 1) {
    // One context reads best as the thing it is: a chip on the box saying where
    // this work happens. The four seats on Pelican Machine hang under Printing
    // Incharge and carry "Pelican Machine" here — the machine is not a manager.
    chips.push(fitText(contexts[0].name, fonts.chip, W - 2 * PAD - 12));
  }
  if (n.shiftPattern === 'DN' && show.roles) captions.push('Day & Night shift');
  if (contexts.length > 1) {
    wrapText(`Shared across: ${contexts.map((c) => c.name).join(', ')}`, fonts.caption, W - 2 * PAD)
      .forEach((l) => captions.push(l));
  }
  if (n.status && n.status !== 'ACTIVE' && show.roles) captions.push(`${n.status.charAt(0)}${n.status.slice(1).toLowerCase()} position`);

  let h = PAD + titleLines.length * TLH + captions.length * CAPH + chips.length * CHIPH;
  const top = titleLines.length + captions.length + chips.length > 0;
  if (rows.length) h += (top ? 7 : 0) + rows.length * (ROWH + ROWG) - ROWG;
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
  mode: 'leaf' | 'stack' | 'side' | 'mixed';
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
  /** Set when departments are drawn as boxes (spec §16). */
  dept?: DeptLayout;
}

export interface LayoutOptions {
  root: number | '';
  filter: ShiftFilter;
  collapsed: Set<number>;
  arrange: Record<number, Arrange>;
  fonts: ChartFonts;
  /** What is drawn. Default: everything. */
  show?: ChartShow;
  /** Department ids folded shut (only read when departments are drawn). */
  deptClosed?: Set<number>;
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
      info: boxInfo(node, filter, fonts, opts.show),
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
    p.mode =
      pref === 'side'
        ? 'side'
        : pref === 'stack' || managers.length === 0
          ? 'stack'
          : managers.length === kids.length
            ? 'side'
            : 'mixed';

    const sizes = kids.map((k) => size(k, depth + 1));
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

// ── Departments as boxes, the reporting chart laid over them (spec §16) ─────
//
// A department is a BOX that holds its people. The box hangs under the PERSON
// its top people report to (one roll-up line per department, not one per
// person); with no people of its own it hangs under its parent department's
// box. So the picture is a tree of boxes whose lines end on people, with the
// in-box reporting chain drawn inside each box by the §14 rule.
//
// Nothing in here reads a department's NAME or TYPE: everything comes from
// `parentId`, `isShared`, `serves` and the primary reporting edges.

/** Box padding, and the gaps between boxes. */
export const BP = 12;
export const BGAP = 28;
export const BVG = 46;
export const BSG = 14;
/** One routing lane: a bus level under a box, a spine beside a column, a gutter beside a box. */
export const LANE = 9;
/** Inside a box: level gap and sibling gap (tighter than the plain tree's VG / HG). */
export const IVG = 34;
export const IHG = 16;
/** A column of leaf boxes is split once it would be taller than this. */
export const COLCAP = 620;
/** Department title metrics. */
const DTP = 9;
const DTL = 17;
const DNL = 15;
/** The id of the box that holds seats with no department. */
export const NO_DEPT = 0;

export type DeptAttach = { person: number; box: number } | { box: number } | null;

export interface DeptBox {
  id: number;
  name: string;
  type: string | null;
  shared: boolean;
  serves: number[];
  open: boolean;
  /** Visible seats of this department, payload order. */
  members: number[];
  /** The seats drawn as cards (none when closed, or with roles and people both off). */
  drawn: number[];
  /** What the box hangs from: a person (in another box), a box, or nothing (a top box). */
  attach: DeptAttach;
  parent: number | null;
  depth: number;
  /** Child boxes drawn under this one (none when closed). */
  kids: number[];
  /** Every box below this one in the tree, drawn or folded. */
  below: number;
  /** Seats counted by the app's rule: its own, plus everything folded into it when closed. */
  counts: VisibleCounts;
  /** The one seat that heads the box: the only top seat, with reports inside. */
  head: number | null;
  /** Top seats whose manager is neither the roll-up person nor in the box (rule 4). */
  exceptions: number[];
  titleLines: string[];
  /** Small lines under the title: the count of a closed box, who works an empty one. */
  notes: string[];
  canToggle: boolean;
  titleH: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DeptLayout {
  boxes: Map<number, DeptBox>;
  /** Draw order: a parent before its children. */
  order: number[];
  /** Reporting lines: roll-ups, buses, spines and the in-box chains. */
  solid: string[];
  /** "Serves" links routed in the open (never under a box). */
  serves: string[];
  /** "Serves" links that pass behind boxes on the way (drawn under everything). */
  servesUnder: string[];
  /** Arrowheads of the serves links: tip, and the direction the arrow points. */
  arrows: { x: number; y: number; dir: 'l' | 'r' | 'u' | 'd'; under: boolean }[];
  /** Rule 4: primary edges that leave a box for someone other than its roll-up person. */
  exceptions: { from: number; to: number }[];
}

interface Inner {
  pos: Map<number, { x: number; y: number }>;
  w: number;
  h: number;
  lines: string[];
}

/**
 * The people of ONE box: its in-box reporting forest laid out by the §14 rule
 * (managers side by side, leaf seats in one column), coordinates relative to
 * the box's content corner.
 *
 * Lines are drawn only when the chain is more than "everyone reports to the
 * head" (rule 3): one head over leaves, or a box of leaves, is a plain stack
 * with no lines and no indent.
 */
function innerLayout(
  roots: number[],
  kidsIn: (id: number) => number[],
  hOf: (id: number) => number,
  arrange: Record<number, Arrange>,
): Inner {
  const pos = new Map<number, { x: number; y: number }>();
  const lines: string[] = [];
  if (!roots.length) return { pos, w: 0, h: 0, lines };
  const isMgr = (id: number) => kidsIn(id).length > 0;
  const lined = !(
    roots.every((r) => !isMgr(r)) ||
    (roots.length === 1 && kidsIn(roots[0]).every((k) => !isMgr(k)))
  );
  const ind = lined ? IND : 0;
  interface N { mode: 'leaf' | 'stack' | 'side' | 'mixed'; sw: number; row: number[]; col: number[] }
  const info = new Map<number, N>();

  const size = (id: number): number => {
    const kids = kidsIn(id);
    if (!kids.length) {
      info.set(id, { mode: 'leaf', sw: W, row: [], col: [] });
      return W;
    }
    const sizes = kids.map(size);
    const pref = arrange[id] ?? 'auto';
    const managers = kids.filter(isMgr);
    const mode: N['mode'] =
      pref === 'side'
        ? 'side'
        : pref === 'stack' || managers.length === 0
          ? 'stack'
          : managers.length === kids.length
            ? 'side'
            : 'mixed';
    let sw: number;
    let row = kids;
    let col: number[] = [];
    if (mode === 'stack') {
      sw = Math.max(W, ind + Math.max(...sizes));
      row = [];
      col = kids;
    } else if (mode === 'side') {
      sw = Math.max(W, sizes.reduce((a, b) => a + b, 0) + IHG * (sizes.length - 1));
    } else {
      row = managers;
      col = kids.filter((k) => !isMgr(k));
      const rowW = row.reduce((a, k) => a + info.get(k)!.sw, 0) + IHG * (row.length - 1);
      sw = Math.max(W, rowW + IHG + ind + W);
    }
    info.set(id, { mode, sw, row, col });
    return sw;
  };

  const place = (id: number, left: number, top: number): number => {
    const n = info.get(id)!;
    const h = hOf(id);
    let bottom = top + h;
    if (n.mode === 'leaf') {
      pos.set(id, { x: left, y: top });
      return bottom;
    }
    if (n.mode === 'stack') {
      pos.set(id, { x: left, y: top });
      let cy = bottom + SG;
      for (const k of n.col) {
        bottom = place(k, left + ind, cy);
        cy = bottom + SG;
      }
      if (lined) {
        const sx = left + ind / 2;
        let last = top + h;
        for (const k of n.col) {
          const c = pos.get(k)!;
          last = c.y + Math.min(hOf(k) / 2, 17);
          lines.push(`M${sx} ${last}H${c.x}`);
        }
        lines.push(`M${sx} ${top + h}V${last}`);
      }
      return bottom;
    }
    const colW = n.col.length ? IHG + ind + W : 0;
    const total = n.row.reduce((a, k) => a + info.get(k)!.sw, 0) + IHG * (n.row.length - 1) + colW;
    let cx = left + (n.sw - total) / 2;
    const cy = top + h + IVG;
    for (const k of n.row) {
      bottom = Math.max(bottom, place(k, cx, cy));
      cx += info.get(k)!.sw + IHG;
    }
    let ly = cy;
    for (const k of n.col) {
      const b = place(k, cx + ind, ly);
      bottom = Math.max(bottom, b);
      ly = b + SG;
    }
    const first = pos.get(n.row[0])!;
    const lastX = n.col.length ? cx + ind : pos.get(n.row[n.row.length - 1])!.x;
    const x = Math.min(Math.max((first.x + lastX) / 2, left), left + n.sw - W);
    pos.set(id, { x, y: top });
    // The whole in-box tree is drawn once any of it is needed.
    const px = x + W / 2;
    const my = cy - IVG / 2;
    const cxs = n.row.map((k) => pos.get(k)!.x + W / 2);
    const spine = n.col.length ? pos.get(n.col[0])!.x - ind / 2 : null;
    if (spine != null) cxs.push(spine);
    lines.push(`M${px} ${top + h}V${my}`);
    lines.push(`M${Math.min(px, ...cxs)} ${my}H${Math.max(px, ...cxs)}`);
    for (const k of n.row) lines.push(`M${pos.get(k)!.x + W / 2} ${my}V${cy}`);
    if (spine != null) {
      let last = my;
      for (const k of n.col) {
        const c = pos.get(k)!;
        last = c.y + Math.min(hOf(k) / 2, 17);
        lines.push(`M${spine} ${last}H${c.x}`);
      }
      lines.push(`M${spine} ${my}V${last}`);
    }
    return bottom;
  };

  roots.forEach(size);
  let w = 0;
  let h = 0;
  if (roots.length === 1) {
    h = place(roots[0], 0, 0);
  } else {
    // Several top seats: the ones with a chain side by side, the rest in one
    // column after them — the same rule, with no line joining them (their
    // common manager is outside the box; the box's roll-up line says so).
    const mgrs = roots.filter(isMgr);
    let cx = 0;
    for (const r of mgrs) {
      h = Math.max(h, place(r, cx, 0));
      cx += info.get(r)!.sw + IHG;
    }
    let ly = 0;
    for (const r of roots.filter((x) => !isMgr(x))) {
      const b = place(r, cx, ly);
      h = Math.max(h, b);
      ly = b + SG;
    }
  }
  for (const q of pos.values()) w = Math.max(w, q.x + W);
  return { pos, w, h, lines: lined ? lines : [] };
}

/** Splits boxes into order-preserving columns of about equal height, none much over `cap`. */
function packColumns<T>(items: T[], hOf: (t: T) => number, gap: number, cap: number): T[][] {
  if (!items.length) return [];
  const total = items.reduce((a, t) => a + hOf(t), 0) + gap * (items.length - 1);
  const n = Math.min(items.length, Math.max(1, Math.ceil(total / cap)));
  const target = total / n;
  const cols: T[][] = [[]];
  let cur = 0;
  for (const t of items) {
    const h = hOf(t);
    const col = cols[cols.length - 1];
    if (col.length && cols.length < n && cur + h / 2 > target) {
      cols.push([t]);
      cur = h + gap;
    } else {
      col.push(t);
      cur += h + gap;
    }
  }
  return cols;
}

export function layoutDepartments(model: ChartModel, opts: LayoutOptions): LayoutResult {
  const { filter, fonts, arrange } = opts;
  const show = opts.show ?? SHOW_ALL;
  const closed = opts.deptClosed ?? new Set<number>();
  const cards = show.roles || show.people;

  // ── 1. Who is in view, and in which department ───────────────────────────
  const visible = subtreeIds(model, opts.root);
  const inView = new Set(visible);
  const deptOf = (id: number): number => {
    const d = model.byId.get(id)?.departmentId;
    return d != null && model.deptById.has(d) ? d : NO_DEPT;
  };
  const members = new Map<number, number[]>();
  for (const id of visible) {
    const d = deptOf(id);
    const list = members.get(d);
    if (list) list.push(id);
    else members.set(d, [id]);
  }
  const staffed = new Set<number>();
  for (const id of model.byId.keys()) staffed.add(deptOf(id));

  const defs = new Map<number, OrgChartDepartment>(model.deptById);
  if (members.has(NO_DEPT))
    defs.set(NO_DEPT, {
      id: NO_DEPT, code: null, name: 'No department', parentId: null, type: null,
      isShared: false, serves: [], rank: Number.MAX_SAFE_INTEGER,
    });
  const rankOf = (d: number) => defs.get(d)?.rank ?? Number.MAX_SAFE_INTEGER;
  const byRank = (a: number, b: number) => rankOf(a) - rankOf(b) || a - b;
  const treeKids = new Map<number, number[]>();
  for (const d of defs.values()) {
    if (d.parentId == null || !defs.has(d.parentId)) continue;
    const list = treeKids.get(d.parentId);
    if (list) list.push(d.id);
    else treeKids.set(d.parentId, [d.id]);
  }

  // ── 2. Which departments are drawn ───────────────────────────────────────
  // One with seats in view, always. One with no seats at all — a heading over
  // sub-departments, or a machine worked only by a shared crew — when the whole
  // organisation is shown, or when something drawn hangs from it or serves it.
  const drawn = new Set<number>();
  for (const d of defs.keys()) {
    if (members.has(d) || (!staffed.has(d) && opts.root === '')) drawn.add(d);
  }
  for (let changed = true, guard = 0; changed && guard < 60; guard += 1) {
    changed = false;
    for (const d of defs.values()) {
      if (drawn.has(d.id) || staffed.has(d.id)) continue;
      const need =
        (treeKids.get(d.id) ?? []).some((k) => drawn.has(k)) ||
        [...drawn].some((s) => defs.get(s)!.isShared && defs.get(s)!.serves.includes(d.id));
      if (need) {
        drawn.add(d.id);
        changed = true;
      }
    }
  }
  const ids = [...drawn].sort(byRank);
  /** The nearest DRAWN department above, in the department tree. */
  const treeParent = (d: number): number | null => {
    let cur = defs.get(d)?.parentId ?? null;
    for (let g = 0; cur != null && g < 60; g += 1) {
      if (drawn.has(cur)) return cur;
      cur = defs.get(cur)?.parentId ?? null;
    }
    return null;
  };

  // ── 3. The roll-up person, and what each box hangs from ──────────────────
  const rollup = new Map<number, number>();
  const exceptionsOf = new Map<number, number[]>();
  const mgrOf = (id: number) => {
    const m = model.parent.get(id);
    return m != null && inView.has(m) ? m : null;
  };
  const mostCommon = (xs: number[]): number | null => {
    const tally = new Map<number, number>();
    for (const x of xs) tally.set(x, (tally.get(x) ?? 0) + 1);
    let best: number | null = null;
    for (const [k, c] of tally) if (best == null || c > tally.get(best)!) best = k;
    return best;
  };
  for (const d of ids) {
    const own = members.get(d) ?? [];
    const outside = own
      .map((id) => ({ id, m: mgrOf(id) }))
      .filter((e): e is { id: number; m: number } => e.m != null && deptOf(e.m) !== d);
    const r = mostCommon(outside.map((e) => e.m));
    if (r != null) rollup.set(d, r);
    exceptionsOf.set(d, outside.filter((e) => e.m !== r).map((e) => e.id));
  }
  // A department with no seats in view rolls up where its sub-departments do.
  for (const d of [...ids].reverse()) {
    if (rollup.has(d) || members.has(d)) continue;
    const r = mostCommon(
      (treeKids.get(d) ?? [])
        .filter((k) => drawn.has(k) && rollup.has(k))
        .map((k) => rollup.get(k)!),
    );
    if (r != null && deptOf(r) !== d) rollup.set(d, r);
  }
  const attach = new Map<number, DeptAttach>();
  for (const d of ids) {
    const tp = treeParent(d);
    const r = rollup.get(d);
    // Rule 5: under a department with no people, the line is box to box.
    if (tp != null && !members.has(tp)) attach.set(d, { box: tp });
    else if (r != null && cards) attach.set(d, { person: r, box: deptOf(r) });
    else if (r != null) attach.set(d, { box: deptOf(r) });
    else attach.set(d, tp != null ? { box: tp } : null);
  }
  // A loop in the data must cost a detached box, not a hang.
  for (const d of ids) {
    const seen = new Set<number>([d]);
    let cur = attach.get(d)?.box;
    for (let g = 0; cur != null && g < 80; g += 1) {
      if (seen.has(cur)) {
        const tp = treeParent(d);
        attach.set(d, tp != null && !seen.has(tp) ? { box: tp } : null);
        break;
      }
      seen.add(cur);
      cur = attach.get(cur)?.box;
    }
  }
  const allKids = new Map<number, number[]>();
  const tops: number[] = [];
  for (const d of ids) {
    const a = attach.get(d);
    if (!a) tops.push(d);
    else {
      const list = allKids.get(a.box);
      if (list) list.push(d);
      else allKids.set(a.box, [d]);
    }
  }

  // ── 4. Boxes, folds and counts ───────────────────────────────────────────
  const boxes = new Map<number, DeptBox>();
  const order: number[] = [];
  const placed = new Map<number, PlacedNode>();
  const cardOrder: number[] = [];
  const inners = new Map<number, Inner>();
  const subtreeSeats = (d: number, out: number[]): number => {
    out.push(...(members.get(d) ?? []));
    let n = 0;
    for (const k of allKids.get(d) ?? []) n += 1 + subtreeSeats(k, out);
    return n;
  };
  const servedBy = (d: number) =>
    ids.filter((s) => defs.get(s)!.isShared && defs.get(s)!.serves.includes(d)).length;

  const make = (d: number, depth: number, parent: number | null) => {
    const def = defs.get(d)!;
    const own = members.get(d) ?? [];
    const kidsAll = allKids.get(d) ?? [];
    // A top box is always open: closing it would leave nothing on the canvas,
    // and a chart started from a branch must not open on one shut box.
    const canToggle = depth > 0 && (own.length > 0 || kidsAll.length > 0);
    const open = !canToggle || !closed.has(d);
    const seatIds: number[] = [];
    const below = subtreeSeats(d, seatIds);
    const counts = countRows(model, open ? own : seatIds, filter);
    const drawnCards = open && cards ? own : [];
    const ownSet = new Set(own);
    const tops0 = own.filter((id) => {
      const m = model.parent.get(id);
      return m == null || !ownSet.has(m);
    });
    const kidsIn = (id: number) => (model.children.get(id) ?? []).filter((k) => ownSet.has(k));
    for (const id of drawnCards) {
      const node = model.byId.get(id)!;
      const info = boxInfo(node, filter, fonts, show);
      placed.set(id, {
        id, node, info, x: 0, y: 0, h: info.h, mode: 'leaf', sw: W, kids: [],
        collapsed: false, hidden: 0, depth: model.depth.get(id) ?? 0,
      });
    }
    const inner = innerLayout(drawnCards.length ? tops0 : [], kidsIn, (id) => placed.get(id)!.h, arrange);
    inners.set(d, inner);

    const seatWord = (n: number) => `${n} seat${n === 1 ? '' : 's'}`;
    const notes: string[] = [];
    if (!own.length && !kidsAll.length) {
      const by = servedBy(d);
      // The arrows say WHICH crew; the words only say why the box is empty.
      notes.push(by === 1 ? 'Worked by a shared crew' : by ? `Worked by ${by} shared crews` : 'No seats of its own');
    } else if (!open || !cards) {
      notes.push(counts.seats ? `${seatWord(counts.seats)}, ${counts.vacant} vacant` : 'No seats of its own');
      if (!open && below) notes.push(`${below} department${below === 1 ? '' : 's'} inside`);
    }
    const contentW = Math.max(W, inner.w);
    const w = contentW + 2 * BP;
    const titleLines = wrapText(def.name, fonts.dept, w - 2 * BP - (canToggle ? 30 : 0));
    const titleH = DTP + titleLines.length * DTL + (def.type ? DNL : 0) + notes.length * DNL + 7;
    const box: DeptBox = {
      id: d, name: def.name, type: def.type || null, shared: def.isShared, serves: def.serves,
      open, members: own, drawn: drawnCards, attach: attach.get(d) ?? null, parent, depth,
      kids: open ? kidsAll : [], below, counts,
      head: tops0.length === 1 && kidsIn(tops0[0]).length > 0 ? tops0[0] : null,
      exceptions: exceptionsOf.get(d) ?? [],
      titleLines, notes: notes.map((t) => fitText(t, fonts.deptMeta, w - 2 * BP)),
      canToggle, titleH, x: 0, y: 0, w, h: titleH + (drawnCards.length ? inner.h + BP : 0),
    };
    boxes.set(d, box);
    order.push(d);
    cardOrder.push(...drawnCards);
    for (const k of box.kids) make(k, depth + 1, d);
  };
  tops.forEach((d) => make(d, 0, null));

  // ── 5. Where a roll-up line leaves the box of the person it ends on ──────
  // Straight down from the person when nothing in the box is under them;
  // otherwise out of the side of their card to a gutter beside the box.
  interface Exit {
    key: string;
    side: 'bottom' | 'right' | 'left' | 'box';
    lane: number;
    ex: number;
    ey: number;
  }
  const keyOf = (a: DeptAttach) => (a && 'person' in a && placed.has(a.person) ? `p${a.person}` : 'box');
  const exitsOf = new Map<number, Exit[]>();
  const gutters = new Map<number, { l: number; r: number }>();
  const contentX = (b: DeptBox) => BP + (b.w - 2 * BP - inners.get(b.id)!.w) / 2;
  for (const d of order) {
    const b = boxes.get(d)!;
    const inner = inners.get(d)!;
    const ox = contentX(b);
    const exits: Exit[] = [];
    for (const k of b.kids) {
      const key = keyOf(boxes.get(k)!.attach);
      if (exits.some((e) => e.key === key)) continue;
      const me = key === 'box' ? undefined : inner.pos.get(Number(key.slice(1)));
      if (!me) {
        if (!exits.some((e) => e.side === 'box')) exits.push({ key: 'box', side: 'box', lane: 0, ex: b.w / 2, ey: b.h });
        continue;
      }
      const pid = Number(key.slice(1));
      const h = placed.get(pid)!.h;
      const ey = me.y + Math.min(h / 2, 17);
      const cx = me.x + W / 2;
      let below = false;
      let right = false;
      let left = false;
      for (const [id, q] of inner.pos) {
        if (id === pid) continue;
        const qh = placed.get(id)!.h;
        if (q.y > me.y && cx > q.x - 6 && cx < q.x + W + 6) below = true;
        if (ey > q.y - 6 && ey < q.y + qh + 6) {
          if (q.x > me.x) right = true;
          else if (q.x < me.x) left = true;
        }
      }
      const side = !below ? 'bottom' : !right ? 'right' : !left ? 'left' : 'right';
      exits.push({
        key, side, lane: 0,
        ex: ox + (side === 'bottom' ? cx : side === 'right' ? me.x + W : me.x),
        ey: b.titleH + (side === 'bottom' ? me.y + h : ey),
      });
    }
    // The lowest person takes the lane nearest the box, so no exit crosses another.
    for (const side of ['right', 'left'] as const) {
      exits.filter((e) => e.side === side).sort((a, c) => c.ey - a.ey).forEach((e, i) => { e.lane = i; });
    }
    // A box-to-box line shares the bottom edge with any person leaving straight down.
    const boxExit = exits.find((e) => e.side === 'box');
    if (boxExit) {
      const taken = exits.filter((e) => e.side === 'bottom').map((e) => e.ex);
      while (taken.some((x) => Math.abs(x - boxExit.ex) < 14) && boxExit.ex < b.w - 16) boxExit.ex += 16;
    }
    exitsOf.set(d, exits);
    const nr = exits.filter((e) => e.side === 'right').length;
    const nl = exits.filter((e) => e.side === 'left').length;
    gutters.set(d, { l: nl ? nl * LANE + 6 : 0, r: nr ? nr * LANE + 6 : 0 });
  }
  /** The lane a child's line runs in under its parent box. */
  const laneKey = (parent: number, child: number) => {
    const key = keyOf(boxes.get(child)!.attach);
    return exitsOf.get(parent)!.some((e) => e.key === key) ? key : 'box';
  };

  // ── 6. The tree of boxes ─────────────────────────────────────────────────
  // Under a box: the children that have boxes of their own side by side; the
  // leaf boxes in columns (the §14 rule, for boxes). A shared box and the leaf
  // siblings it serves form a CLUSTER: the served boxes in one column, the
  // shared boxes in the next, so every "serves" line is a short hop across the
  // gutter between them and crosses nothing.
  interface Column { boxes: number[]; keys: string[]; indent: number; w: number; h: number }
  type Unit =
    | { kind: 'row'; id: number; w: number; h: number; first: number }
    | { kind: 'col'; col: Column; w: number; h: number; first: number }
    | { kind: 'cluster'; a: Column; b: Column; gutter: number; w: number; h: number; first: number };
  const unitsOf = new Map<number, Unit[]>();
  const sw = new Map<number, number>();
  const sh = new Map<number, number>();
  const fw = (d: number) => boxes.get(d)!.w + gutters.get(d)!.l + gutters.get(d)!.r;
  const gapUnder = (d: number) => BVG + (Math.max(1, exitsOf.get(d)!.length) - 1) * LANE;
  const column = (parent: number, list: number[]): Column => {
    const keys: string[] = [];
    for (const k of list) {
      const key = laneKey(parent, k);
      if (!keys.includes(key)) keys.push(key);
    }
    const indent = 15 + keys.length * LANE;
    return {
      boxes: list, keys, indent,
      w: indent + Math.max(...list.map(fw)),
      h: list.reduce((a, k) => a + boxes.get(k)!.h, 0) + BSG * (list.length - 1),
    };
  };

  const size = (d: number) => {
    const b = boxes.get(d)!;
    b.kids.forEach(size);
    if (!b.kids.length) {
      sw.set(d, fw(d));
      sh.set(d, b.h);
      unitsOf.set(d, []);
      return;
    }
    const at = new Map(b.kids.map((k, i) => [k, i]));
    // An only child hangs straight under its parent — a column of one would
    // add a spine and a jog for nothing.
    const inRow = (k: number) => boxes.get(k)!.kids.length > 0 || b.kids.length === 1;
    const rows = b.kids.filter(inRow);
    const leaves = b.kids.filter((k) => !inRow(k));
    const units: Unit[] = rows.map((k) => ({ kind: 'row', id: k, w: sw.get(k)!, h: sh.get(k)!, first: at.get(k)! }));

    // Clusters: union the shared leaf boxes with the leaf siblings they serve.
    const group = new Map<number, number>();
    const find = (x: number): number => {
      let r = x;
      while (group.get(r) !== r) r = group.get(r)!;
      return r;
    };
    const leafSet = new Set(leaves);
    for (const k of leaves) group.set(k, k);
    const touched = new Set<number>();
    for (const s of leaves) {
      const sb = boxes.get(s)!;
      if (!sb.shared) continue;
      for (const t of sb.serves) {
        if (!leafSet.has(t) || t === s) continue;
        group.set(find(t), find(s));
        touched.add(s);
        touched.add(t);
      }
    }
    const clusters = new Map<number, number[]>();
    for (const k of leaves) {
      if (!touched.has(k)) continue;
      const r = find(k);
      const list = clusters.get(r);
      if (list) list.push(k);
      else clusters.set(r, [k]);
    }
    const clustered = new Set<number>();
    for (const list of clusters.values()) {
      const sharedIn = (k: number) =>
        boxes.get(k)!.shared && boxes.get(k)!.serves.some((t) => list.includes(t) && t !== k);
      const left = list.filter((k) => !sharedIn(k));
      const right = list.filter(sharedIn);
      // Shared boxes that only serve each other have no plain column to face.
      if (!left.length || !right.length) continue;
      const a = column(d, left);
      const bcol = column(d, right);
      const gutter = 12 + bcol.boxes.length * LANE + 6;
      list.forEach((k) => clustered.add(k));
      units.push({
        kind: 'cluster', a, b: bcol, gutter,
        w: a.w + gutter + bcol.w, h: Math.max(a.h, bcol.h),
        first: Math.min(...list.map((k) => at.get(k)!)),
      });
    }
    const loose = leaves.filter((k) => !clustered.has(k));
    const cap = Math.max(COLCAP, ...units.map((u) => u.h));
    for (const list of packColumns(loose, (k) => boxes.get(k)!.h, BSG, cap)) {
      const col = column(d, list);
      units.push({ kind: 'col', col, w: col.w, h: col.h, first: at.get(list[0])! });
    }
    units.sort((x, y) => x.first - y.first);
    unitsOf.set(d, units);
    const total = units.reduce((acc, u) => acc + u.w, 0) + BGAP * (units.length - 1);
    sw.set(d, Math.max(fw(d), total));
    sh.set(d, b.h + gapUnder(d) + Math.max(...units.map((u) => u.h)));
  };

  const solid: string[] = [];
  const serves: string[] = [];
  const servesUnder: string[] = [];
  const arrows: DeptLayout['arrows'] = [];
  const servedDone = new Set<string>();

  const place = (d: number, left: number, top: number) => {
    const b = boxes.get(d)!;
    const units = unitsOf.get(d)!;
    const g = gutters.get(d)!;
    b.y = top;
    if (!units.length) {
      b.x = left + g.l;
      return;
    }
    const total = units.reduce((acc, u) => acc + u.w, 0) + BGAP * (units.length - 1);
    const width = sw.get(d)!;
    const cy = top + b.h + gapUnder(d);
    let ux = left + (width - total) / 2;
    b.x = Math.min(Math.max(ux + total / 2 - fw(d) / 2, left), left + width - fw(d)) + g.l;

    // Where each child's line arrives: a point on top of a box in the row, or a
    // spine down the left of a column with a tick into each box.
    const drops = new Map<string, number[]>();
    const drop = (key: string, x: number) => {
      const v = drops.get(key);
      if (v) v.push(x);
      else drops.set(key, [x]);
    };
    const exits = exitsOf.get(d)!;
    const laneY = (key: string) => cy - 16 - Math.max(0, exits.findIndex((e) => e.key === key)) * LANE;
    const putColumn = (col: Column, x: number) => {
      let y = cy;
      const ticks = new Map<string, number>();
      for (const k of col.boxes) {
        place(k, x + col.indent, y);
        const kb = boxes.get(k)!;
        const key = laneKey(d, k);
        const sx = x + 8 + col.keys.indexOf(key) * LANE;
        const ty = kb.y + 16;
        solid.push(`M${sx} ${ty}H${kb.x}`);
        ticks.set(key, ty);
        y += kb.h + BSG;
      }
      for (const [key, ty] of ticks) {
        const sx = x + 8 + col.keys.indexOf(key) * LANE;
        solid.push(`M${sx} ${laneY(key)}V${ty}`);
        drop(key, sx);
      }
    };
    for (const u of units) {
      if (u.kind === 'row') {
        place(u.id, ux, cy);
        const kb = boxes.get(u.id)!;
        const key = laneKey(d, u.id);
        const x = kb.x + kb.w / 2;
        solid.push(`M${x} ${laneY(key)}V${kb.y}`);
        drop(key, x);
      } else if (u.kind === 'col') {
        putColumn(u.col, ux);
      } else {
        putColumn(u.a, ux);
        putColumn(u.b, ux + u.a.w + u.gutter);
        // The serves links: out of the shared box's left edge, along its own
        // lane in the gutter, a tick with an arrowhead into each box it serves.
        const aRight = ux + u.a.w;
        u.b.boxes.forEach((s, i) => {
          const sb = boxes.get(s)!;
          const lx = aRight + 12 + i * LANE;
          const sy = sb.y + Math.min(sb.h - 8, 34);
          const ys = [sy];
          for (const t of sb.serves) {
            if (!u.a.boxes.includes(t)) continue;
            const tb = boxes.get(t)!;
            const ty = tb.y + Math.min(tb.h - 6, 12 + i * LANE);
            serves.push(`M${lx} ${ty}H${tb.x + tb.w + 3}`);
            arrows.push({ x: tb.x + tb.w + 1, y: ty, dir: 'l', under: false });
            ys.push(ty);
            servedDone.add(`${s}>${t}`);
          }
          serves.push(`M${sb.x} ${sy}H${lx}`, `M${lx} ${Math.min(...ys)}V${Math.max(...ys)}`);
        });
      }
      ux += u.w + BGAP;
    }

    for (const e of exits) {
      const xs = drops.get(e.key);
      if (!xs) continue;
      const ly = laneY(e.key);
      const bx = b.x + e.ex;
      const by = b.y + e.ey;
      let x = bx;
      if (e.side === 'right' || e.side === 'left') {
        x = e.side === 'right' ? b.x + b.w + 6 + e.lane * LANE : b.x - 6 - e.lane * LANE;
        solid.push(`M${bx} ${by}H${x}V${ly}`);
      } else {
        solid.push(`M${bx} ${by}V${ly}`);
      }
      const lo = Math.min(x, ...xs);
      const hi = Math.max(x, ...xs);
      if (hi - lo > 0.5) solid.push(`M${lo} ${ly}H${hi}`);
    }
  };

  tops.forEach(size);
  let x = M;
  let bottom = M + HEAD;
  for (const d of tops) {
    place(d, x, M + HEAD);
    bottom = Math.max(bottom, M + HEAD + sh.get(d)!);
    x += sw.get(d)! + BGAP * 2;
  }

  // ── 7. Cards to chart coordinates; in-box chains ─────────────────────────
  for (const d of order) {
    const b = boxes.get(d)!;
    const inner = inners.get(d)!;
    const ox = b.x + contentX(b);
    const oy = b.y + b.titleH;
    for (const [id, q] of inner.pos) {
      const p = placed.get(id)!;
      p.x = ox + q.x;
      p.y = oy + q.y;
    }
    // The in-box paths use only M / H / V with absolute numbers, so moving them
    // into chart coordinates is a matter of re-reading each command.
    for (const seg of inner.lines) {
      solid.push(
        seg.replace(/([MHV])(-?[\d.]+)(?: (-?[\d.]+))?/g, (_m, c: string, a: string, b2?: string) =>
          c === 'M'
            ? `M${Number(a) + ox} ${Number(b2) + oy}`
            : c === 'H'
              ? `H${Number(a) + ox}`
              : `V${Number(a) + oy}`,
        ),
      );
    }
  }

  // ── 8. Serves links that are not a hop across a cluster's gutter ─────────
  // An elbow through the gap beside the served box. Where it has to pass other
  // boxes it is drawn UNDER them: it disappears behind a box and comes out the
  // other side, and can never run through anyone's text.
  for (const d of order) {
    const s = boxes.get(d)!;
    if (!s.shared) continue;
    let n = 0;
    for (const t of s.serves) {
      const tb = boxes.get(t);
      if (!tb || t === d || servedDone.has(`${d}>${t}`)) continue;
      const x1 = s.x + s.w * 0.72 + n * LANE;
      n += 1;
      if (tb.y + tb.h <= s.y) {
        const ly = tb.y + tb.h + 9;
        const x2 = Math.min(Math.max(x1, tb.x + 14), tb.x + tb.w - 14);
        servesUnder.push(`M${x1} ${s.y}V${ly}H${x2}V${tb.y + tb.h + 3}`);
        arrows.push({ x: x2, y: tb.y + tb.h + 1, dir: 'u', under: true });
      } else if (tb.y >= s.y + s.h) {
        const ly = tb.y - 9;
        const x2 = Math.min(Math.max(x1, tb.x + 14), tb.x + tb.w - 14);
        servesUnder.push(`M${x1} ${s.y + s.h}V${ly}H${x2}V${tb.y - 3}`);
        arrows.push({ x: x2, y: tb.y - 1, dir: 'd', under: true });
      } else {
        const toRight = tb.x > s.x;
        const sx = toRight ? s.x + s.w : s.x;
        const tx = toRight ? tb.x - 3 : tb.x + tb.w + 3;
        const sy = s.y + Math.min(s.h - 8, 34);
        const ty = tb.y + Math.min(tb.h - 6, 14);
        const mx = (sx + tx) / 2;
        servesUnder.push(`M${sx} ${sy}H${mx}V${ty}H${tx}`);
        arrows.push({ x: toRight ? tb.x - 1 : tb.x + tb.w + 1, y: ty, dir: toRight ? 'r' : 'l', under: true });
      }
    }
  }

  const exceptions: DeptLayout['exceptions'] = [];
  for (const d of order) {
    for (const id of boxes.get(d)!.exceptions) {
      const m = model.parent.get(id);
      if (m != null && placed.has(id) && placed.has(m)) exceptions.push({ from: id, to: m });
    }
  }

  return {
    placed,
    order: cardOrder,
    width: Math.max(600, x - BGAP * 2 + M),
    height: bottom + M,
    dept: { boxes, order, solid, serves, servesUnder, arrows, exceptions },
  };
}

/**
 * The box tree with every department open — what the pages need to work out
 * the opening fold (by depth) and to open the boxes above a seat. Geometry is
 * computed and thrown away; it is one extra layout per payload, not per frame.
 */
export function departmentTree(model: ChartModel, opts: LayoutOptions): Map<number, DeptBox> {
  if (!model.departments.length) return new Map();
  return layoutDepartments(model, { ...opts, deptClosed: new Set() }).dept!.boxes;
}

/** The department box a seat is drawn in. */
export function departmentOfSeat(model: ChartModel, id: number): number {
  const d = model.byId.get(id)?.departmentId;
  return d != null && model.deptById.has(d) ? d : NO_DEPT;
}

/** `closed` with every box from this seat's department up to the top opened. */
export function openAbove(tree: Map<number, DeptBox>, closed: Set<number>, dept: number): Set<number> {
  let next = closed;
  let cur: number | null = dept;
  for (let g = 0; cur != null && g < 80; g += 1) {
    if (next.has(cur)) {
      if (next === closed) next = new Set(closed);
      next.delete(cur);
    }
    cur = tree.get(cur)?.parent ?? null;
  }
  return next;
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

/** One entry of the legend, with its colours resolved — drawn in the scene (export) or in HTML (screen). */
export interface SceneLegendItem {
  /** A tinted swatch (attendance), or a sample of a line. */
  swatch?: string;
  fill?: string;
  line?: 'solid' | 'dash' | 'serves' | 'thin' | 'same';
  /** The line's stroke, width and dash as the chart draws that kind of line. */
  stroke?: string;
  sw?: number;
  dash?: number[];
  /** The ring the "same person" connector ends in. */
  ring?: { fill: string; stroke: string };
  text: string;
}

export interface ChartScene {
  width: number;
  height: number;
  /**
   * Where the drawing starts. 0 when the title block is in the scene (an
   * export); `HEAD` when it is not (the screen, where the title is a fixed
   * strip above the canvas), so the canvas can crop the band it would have used.
   */
  top: number;
  background: string;
  /** The title block and legend as primitives. Empty when `titleBlock` is off. */
  header: Prim[];
  /** The same legend as data, for a screen that draws it outside the canvas. */
  legend: SceneLegendItem[];
  /**
   * Draw order, bottom to top (spec §16): `under` (serves links that pass
   * behind boxes) · `depts` · `edges` · `links` (serves, exceptions, the
   * one-person-two-seats connector) · `secondary` · `boxes`.
   */
  under: Prim[];
  depts: DeptRender[];
  edges: Prim[];
  links: Prim[];
  secondary: Prim[];
  boxes: BoxRender[];
  layout: LayoutResult;
}

/** A department box: its frame and title, and whether a click folds it. */
export interface DeptRender {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The title band — the click target. */
  titleH: number;
  prims: Prim[];
  label: string;
  open: boolean;
  canToggle: boolean;
}

export interface SceneOptions extends LayoutOptions {
  palette: ChartPalette;
  colours: boolean;
  header: SceneHeader;
  /**
   * Draw the title, the counts and the legend INTO the scene. On for an export
   * (the client prints it, and a file has no page around it); off on screen
   * since 2026-10-10, where they are a fixed strip above the canvas — drawn in
   * the scene they zoomed and panned away with the chart. Default on.
   */
  titleBlock?: boolean;
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
  const c = seatCount(n, filter);
  const bits = [n.displayTitle || n.title];
  if (n.positionCode) bits.push(n.positionCode);
  bits.push(`${c.seats} seat${c.seats === 1 ? '' : 's'}, ${c.filled} filled`);
  if (c.vacant > 0) bits.push(`${c.vacant} vacant`);
  if (c.overFilled) bits.push('more people than seats');
  if (n.shiftPattern === 'DN') bits.push('day and night shift');
  if (n.contexts?.length) bits.push(`work context ${n.contexts.map((c) => c.name).join(', ')}`);
  const kids = p.kids.length + p.hidden;
  if (kids) bits.push(p.collapsed ? `${p.hidden} reports hidden` : `${p.kids.length} direct reports`);
  if (filter !== 'all') bits.push(`${SHIFT_NAME[filter]} shift only`);
  return bits.join('. ');
}

/** Builds every primitive the chart draws, once, for both renderers. */
export function buildScene(model: ChartModel, opts: SceneOptions): ChartScene {
  const show = opts.show ?? SHOW_ALL;
  // A payload with no department tree (a client cached before 2026-10-10) has
  // nothing to box; it gets the plain tree rather than one giant box.
  const boxed = show.departments && model.departments.length > 0;
  const lay = boxed ? layoutDepartments(model, opts) : layoutChart(model, opts);
  const dl = lay.dept;
  const p = opts.palette;
  const f = opts.fonts;
  const edges: Prim[] = [];
  const secondary: Prim[] = [];
  const boxes: BoxRender[] = [];

  const linePath: string[] = [];
  for (const id of lay.order) {
    const n = lay.placed.get(id)!;
    if (!n.kids.length) continue;
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
  if (dl) linePath.push(...dl.solid);
  if (linePath.length) edges.push({ k: 'path', d: linePath.join(''), stroke: p.faint, sw: 1.2 });

  // ── Secondary links. A dashed line with no words on it is exactly what made
  // this client invent fake roles to explain who else they answer to, so a
  // scoped edge is labelled with its scope. ────────────────────────────────
  /** A line from one seat up to another that is not its drawn parent, round whatever is between. */
  const route = (s: PlacedNode, t: PlacedNode): { d: string; at: { x: number; y: number } } => {
    const tb = t.y + t.info.h;
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
      return {
        d: `M${sideX} ${s.y + 14}H${lx}V${laneY}H${tx}V${tb}`,
        at: { x: (lx + tx) / 2, y: laneY - 4 },
      };
    }
    return {
      d: `M${s.x + W / 2} ${s.y}L${t.x + W / 2} ${tb}`,
      at: { x: (s.x + t.x) / 2 + W / 2, y: (s.y + tb) / 2 - 4 },
    };
  };

  /*
   * The same, between seats in two DIFFERENT department boxes (spec §16). The
   * plain router runs its lane just under the target seat, which inside a box
   * is where the next seat is. So: out of the side of the seat to just outside
   * its box, along a lane in the clear band under (or over) the target's box,
   * and in through the side of the target's box to the seat.
   *
   * `out` is the part outside the boxes and is drawn UNDER them: where it has
   * to pass another box it goes behind it, never through its text. `stubs` are
   * the two short runs inside the boxes and are drawn on top.
   */
  const boxOfSeat = new Map<number, DeptBox>();
  if (dl) for (const b of dl.boxes.values()) for (const id of b.drawn) boxOfSeat.set(id, b);
  const routeBoxed = (
    s: PlacedNode,
    t: PlacedNode,
    sb: DeptBox,
    tb: DeptBox,
    // The same-person connector uses its own heights (the two rows), its own
    // gutter and lane (so it never lies on a dotted line) and rounded corners.
    o: { sy?: number; ty?: number; gutter?: number; lane?: number; round?: number } = {},
  ): { out: string; stubs: string; at: { x: number; y: number }; ends: [number, number][] } => {
    const sy = o.sy ?? s.y + Math.min(s.info.h - 6, 14);
    const ty = o.ty ?? t.y + Math.min(t.info.h - 6, 26);
    const gut = o.gutter ?? 10.5;
    const lane = o.lane ?? 11;
    // The run from a seat to the edge of its box must not cross a neighbour in
    // the box: take the wanted side when it is clear, the other when only that is.
    const side = (n: PlacedNode, b: DeptBox, y: number, wantRight: boolean) => {
      const blocked = (toRight: boolean) =>
        b.drawn.some((id) => {
          const q = lay.placed.get(id)!;
          return q !== n && y > q.y - 3 && y < q.y + q.info.h + 3 && (toRight ? q.x > n.x : q.x < n.x);
        });
      return blocked(wantRight) && !blocked(!wantRight) ? !wantRight : wantRight;
    };
    const right = side(s, sb, sy, t.x + W / 2 >= s.x + W / 2);
    const sEdge = right ? sb.x + sb.w : sb.x;
    const sOut = right ? sEdge + gut : sEdge - gut - 1;
    // Into the target from the side the line comes from.
    const fromRight = side(t, tb, ty, sOut >= tb.x + tb.w / 2);
    const tEdge = fromRight ? tb.x + tb.w : tb.x;
    const tOut = fromRight ? tEdge + gut : tEdge - gut - 1;
    const laneY =
      tb.y + tb.h <= sb.y ? tb.y + tb.h + lane : tb.y >= sb.y + sb.h ? tb.y - lane : Math.min(sb.y, tb.y) - lane;
    // Two boxes standing next to each other, facing: straight across the gap
    // between them — no trip over the top.
    const beside = !(tb.y + tb.h <= sb.y) && !(tb.y >= sb.y + sb.h);
    const gap = right ? tEdge - sEdge : sEdge - tEdge;
    const facing = beside && right !== fromRight && gap > 4 && gap < 70;
    const mid = (sEdge + tEdge) / 2;
    const pts: [number, number][] = facing
      ? [[sEdge, sy], [mid, sy], [mid, ty], [tEdge, ty]]
      : [[sEdge, sy], [sOut, sy], [sOut, laneY], [tOut, laneY], [tOut, ty], [tEdge, ty]];
    // Corners rounded with a quadratic through each elbow, when asked.
    let out = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i += 1) {
      const [x, y] = pts[i];
      const next = pts[i + 1];
      const prev = pts[i - 1];
      const r = next
        ? Math.min(o.round ?? 0, Math.hypot(x - prev[0], y - prev[1]) / 2, Math.hypot(next[0] - x, next[1] - y) / 2)
        : 0;
      if (r < 1 || !next) {
        out += `L${x} ${y}`;
        continue;
      }
      const inX = x - Math.sign(x - prev[0]) * r;
      const inY = y - Math.sign(y - prev[1]) * r;
      const outX = x + Math.sign(next[0] - x) * r;
      const outY = y + Math.sign(next[1] - y) * r;
      out += `L${inX} ${inY}Q${x} ${y} ${outX} ${outY}`;
    }
    const sSeat = right ? s.x + W : s.x;
    const tSeat = fromRight ? t.x + W : t.x;
    return {
      out,
      stubs: `M${sSeat} ${sy}H${sEdge}M${tEdge} ${ty}H${tSeat}`,
      at: facing ? { x: mid, y: (sy + ty) / 2 - 4 } : { x: (sOut + tOut) / 2, y: laneY - 4 },
      ends: [[sSeat, sy], [tSeat, ty]],
    };
  };
  const dashUnder: string[] = [];

  const dashPath: string[] = [];
  for (const e of opts.secondaryEdges) {
    const s = lay.placed.get(e.fromPositionId);
    const t = lay.placed.get(e.toPositionId);
    if (!s || !t) continue;
    const sb = boxOfSeat.get(s.id);
    const tb = boxOfSeat.get(t.id);
    let r: { d: string; at: { x: number; y: number } };
    if (sb && tb && sb !== tb) {
      const b = routeBoxed(s, t, sb, tb);
      dashUnder.push(b.out);
      r = { d: b.stubs, at: b.at };
    } else r = route(s, t);
    dashPath.push(r.d);
    const labelAt: { x: number; y: number } | null = r.at;
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
  const under: Prim[] = [];
  if (dashUnder.length) under.push({ k: 'path', d: dashUnder.join(''), stroke: p.muted, sw: 1.4, dash: [6, 4] });

  // ── Departments (spec §16) ───────────────────────────────────────────────
  const links: Prim[] = [];
  const depts: DeptRender[] = [];
  const heads = new Set<number>();
  let servesDrawn = 0;
  let exceptionsDrawn = 0;
  if (dl) {
    for (const d of dl.order) {
      const b = dl.boxes.get(d)!;
      if (b.head != null) heads.add(b.head);
      const prims: Prim[] = [];
      // The frame is thin and uses --c-text-3: --c-border disappears in dark.
      // A shared department's frame is dashed — it belongs to no one branch.
      prims.push({
        k: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, r: 10,
        fill: p.canvas, stroke: p.faint, sw: 1, dash: b.shared ? [6, 4] : undefined,
      });
      let ty = b.y + 9 + 12.5;
      for (const line of b.titleLines) {
        prims.push({ k: 'text', x: b.x + BP, y: ty, text: line, size: 13.5, weight: 700, fill: p.accentText });
        ty += 17;
      }
      if (b.type) {
        prims.push({
          k: 'text', x: b.x + BP, y: ty - 2, size: 11, weight: 400, fill: p.muted,
          text: fitText(b.type, f.deptMeta, b.w - 2 * BP),
        });
        ty += 15;
      }
      for (const note of b.notes) {
        prims.push({ k: 'text', x: b.x + BP, y: ty - 2, text: note, size: 11, weight: 500, fill: p.muted });
        ty += 15;
      }
      if (b.canToggle && !opts.forExport) {
        const bx = b.x + b.w - BP - 9;
        const by = b.y + 9 + 8;
        prims.push({ k: 'rect', x: bx - 10, y: by - 8, w: 20, h: 16, r: 8, fill: p.surface, stroke: p.faint, sw: 0.8 });
        prims.push({
          k: 'text', x: bx, y: by + 4, text: b.open ? '−' : '+', size: 11, weight: 600,
          fill: p.muted, anchor: 'middle',
        });
      }
      const c = b.counts;
      depts.push({
        id: d, x: b.x, y: b.y, w: b.w, h: b.h, titleH: b.titleH, prims,
        label:
          `${b.name}${b.type ? `, ${b.type}` : ''}. ` +
          (c.seats ? `${c.seats} seat${c.seats === 1 ? '' : 's'}, ${c.vacant} vacant. ` : 'No seats of its own. ') +
          (b.canToggle ? (b.open ? 'Open.' : `Closed${b.below ? `, ${b.below} departments inside` : ''}.`) : ''),
        open: b.open,
        canToggle: b.canToggle,
      });
    }
    // "Serves": dashed in the accent colour with an arrowhead — a shared crew
    // WORKS FOR these boxes; it does not report to them.
    const serveStyle = { stroke: p.accent, sw: 1.5, dash: [5, 3] };
    if (dl.servesUnder.length) under.push({ k: 'path', d: dl.servesUnder.join(''), ...serveStyle });
    if (dl.serves.length) links.push({ k: 'path', d: dl.serves.join(''), ...serveStyle });
    for (const a of dl.arrows) {
      const { x, y } = a;
      const d =
        a.dir === 'l'
          ? `M${x} ${y}L${x + 7} ${y - 4}L${x + 7} ${y + 4}Z`
          : a.dir === 'r'
            ? `M${x} ${y}L${x - 7} ${y - 4}L${x - 7} ${y + 4}Z`
            : a.dir === 'u'
              ? `M${x} ${y}L${x - 4} ${y + 7}L${x + 4} ${y + 7}Z`
              : `M${x} ${y}L${x - 4} ${y - 7}L${x + 4} ${y - 7}Z`;
      (a.under ? under : links).push({ k: 'path', d, stroke: p.accent, sw: 1, fill: p.accent });
    }
    servesDrawn = dl.arrows.length;
    // Rule 4: a seat whose manager is neither the box's roll-up person nor in
    // the box keeps its own line — thin and dashed, so it reads as the exception.
    const exc: string[] = [];
    const excUnder: string[] = [];
    for (const e of dl.exceptions) {
      const s = lay.placed.get(e.from);
      const t = lay.placed.get(e.to);
      const sb = boxOfSeat.get(e.from);
      const tb = boxOfSeat.get(e.to);
      if (!s || !t || !sb || !tb) continue;
      const r = routeBoxed(s, t, sb, tb);
      exc.push(r.stubs);
      excUnder.push(r.out);
    }
    exceptionsDrawn = exc.length;
    const thin = { stroke: p.faint, sw: 1, dash: [3, 3] };
    if (exc.length) links.push({ k: 'path', d: exc.join(''), ...thin });
    if (excUnder.length) under.push({ k: 'path', d: excUnder.join(''), ...thin });
  }

  // ── Boxes ────────────────────────────────────────────────────────────────
  /** Where each person's row sits, to join one person drawn in two seats. */
  const rowsOfPerson = new Map<string, { id: number; x: number; y: number }[]>();
  for (const id of lay.order) {
    const n = lay.placed.get(id)!;
    const I = n.info;
    const x = n.x;
    const y = n.y;
    // The selection ring is NOT drawn here. It is an overlay in the canvas
    // component, so moving the selection with the arrow keys does not rebuild
    // every primitive in the chart on each keystroke.
    // The head of a department is slightly emphasised (rule 3).
    const isHead = heads.has(id);
    const stroke = isHead ? p.accent : p.border;
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
      sw: isHead ? 1.6 : 1.1,
    });

    if (n.node.hasContent && show.roles) {
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
      if (I.titleLines.length + I.captions.length + I.chips.length > 0) {
        cy += 3;
        prims.push({
          k: 'path',
          d: `M${x + PAD} ${cy}H${x + W - PAD}`,
          stroke: p.divider,
          sw: 1,
        });
        cy += 4;
      }
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
        const name = r.occupant
          ? r.occupant.name?.trim() || 'Name not recorded'
          : show.roles
            ? 'Vacant'
            : 'Vacant seat';
        if (r.occupant) {
          const who = r.occupant.sameAs ?? (r.occupant.employeeId > 0 ? `e${r.occupant.employeeId}` : null);
          if (who) {
            const at = { id, x, y: cy + ROWH / 2 };
            const list = rowsOfPerson.get(who);
            if (list) list.push(at);
            else rowsOfPerson.set(who, [at]);
          }
        }
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
    // With departments drawn the fold is the DEPARTMENT's (one mechanism, not
  // two): a seat has no pill of its own.
    if (!dl && realKidCount && (!opts.forExport || n.collapsed)) {
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

  // ── One person in two seats (rule 7): shown in both, and the two rows joined
  // by an accent connector ringed at both ends.
  //
  //   in two different boxes   out of the side of each seat's row to the edge
  //                            of its box (drawn ON TOP, so both ends show),
  //                            then round the boxes in its own gutter and lane
  //                            with rounded corners — that part is drawn UNDER
  //                            the boxes, so where it has to pass one it goes
  //                            behind it. It can never cross a department's
  //                            title or a seat.
  //   in the same box, or      a curve between the two rows, under the cards.
  //   with departments off     In a box it is kept inside the gap beside the
  //                            box, below every title.
  let sameDrawn = 0;
  const same = { stroke: p.accent, sw: 1.6 };
  for (const list of rowsOfPerson.values()) {
    for (let i = 1; i < list.length; i += 1) {
      const a = list[i - 1];
      const b = list[i];
      const [l, r] = a.x <= b.x ? [a, b] : [b, a];
      const lb = boxOfSeat.get(l.id);
      const rb = boxOfSeat.get(r.id);
      let ends: [number, number][];
      if (lb && rb && lb !== rb) {
        const route = routeBoxed(lay.placed.get(l.id)!, lay.placed.get(r.id)!, lb, rb, {
          sy: l.y, ty: r.y, gutter: 19.5, lane: 20, round: 8,
        });
        under.push({ k: 'path', d: route.out, ...same });
        links.push({ k: 'path', d: route.stubs, ...same });
        ends = route.ends;
      } else if (r.x - l.x < W + 8) {
        // Same column: loop out to the right of both.
        const x1 = l.x + W;
        const x2 = r.x + W;
        let out = Math.max(x1, x2) + 34 + Math.min(40, Math.abs(l.y - r.y) / 6);
        if (lb) out = Math.max(Math.max(x1, x2) + 16, Math.min(out, lb.x + lb.w + 12));
        links.push({ k: 'path', d: `M${x1} ${l.y}C${out} ${l.y} ${out} ${r.y} ${x2} ${r.y}`, ...same });
        ends = [[x1, l.y], [x2, r.y]];
      } else {
        const x1 = l.x + W;
        const x2 = r.x;
        const bend = Math.max(40, (x2 - x1) / 2);
        links.push({ k: 'path', d: `M${x1} ${l.y}C${x1 + bend} ${l.y} ${x2 - bend} ${r.y} ${x2} ${r.y}`, ...same });
        ends = [[x1, l.y], [x2, r.y]];
      }
      for (const [ex, ey] of ends) links.push({ k: 'circle', cx: ex, cy: ey, r: 3.5, fill: p.surface, stroke: p.accent, sw: 1.6 });
      sameDrawn += 1;
    }
  }

  // ── Header: drawn into the chart because the client prints it ────────────
  const legend: SceneLegendItem[] = [];
  if (opts.colours) {
    legend.push({ swatch: p.present, fill: p.presentFill, text: 'Present' });
    legend.push({ swatch: p.absent, fill: p.absentFill, text: 'Absent' });
    legend.push({ swatch: p.vacant, fill: p.vacantFill, text: 'Vacant' });
  }
  legend.push({ line: 'solid', text: 'Reports to' });
  if (opts.secondaryEdges.length) legend.push({ line: 'dash', text: 'Other reporting line' });
  if (exceptionsDrawn) legend.push({ line: 'thin', text: 'Reports outside the department' });
  if (servesDrawn) legend.push({ line: 'serves', text: 'Serves' });
  if (sameDrawn) legend.push({ line: 'same', text: 'Same person' });
  for (const g of legend) {
    if (!g.line) continue;
    g.stroke = g.line === 'dash' ? p.muted : g.line === 'serves' || g.line === 'same' ? p.accent : p.faint;
    g.sw = g.line === 'thin' ? 1 : 1.4;
    g.dash = g.line === 'dash' ? [6, 4] : g.line === 'serves' ? [5, 3] : g.line === 'thin' ? [3, 3] : undefined;
    if (g.line === 'same') g.ring = { fill: p.surface, stroke: p.accent };
  }
  const titleBlock = opts.titleBlock !== false;

  let lw = 0;
  const legendWidths = legend.map((g) => {
    const w = (g.line ? 34 : 22) + textWidth(g.text, f.headMeta) + 18;
    lw += w;
    return w;
  });
  // A narrow chart (a folded opening, a small branch) is widened until the
  // title and the legend share their line without overprinting.
  const width = titleBlock
    ? Math.max(lay.width, Math.ceil(M + textWidth(opts.header.title, f.headTitle) + 32 + lw + M))
    : lay.width;

  const header: Prim[] = [];
  if (titleBlock) {
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
        stroke: g.stroke!,
        sw: g.sw,
        dash: g.dash,
      });
      if (g.line === 'same') {
        header.push({ k: 'circle', cx: gx + 3, cy: gy - 4, r: 3, fill: p.surface, stroke: p.accent, sw: 1.4 });
        header.push({ k: 'circle', cx: gx + 25, cy: gy - 4, r: 3, fill: p.surface, stroke: p.accent, sw: 1.4 });
      }
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
  }

  return {
    width,
    height: lay.height,
    top: titleBlock ? 0 : HEAD,
    background: p.surface,
    header,
    legend,
    under,
    depts,
    edges,
    links,
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
    `${c.filled} people in them and ${c.vacant} vacant` +
    (filter === 'all' ? '' : `, showing ${filter === 'D' ? 'day' : 'night'} shift seats only`) +
    '. ' +
    (tops.length ? `It starts at ${tops.join('; ')}. ` : '') +
    'Primary reporting lines are solid; every other reporting relationship is dashed and labelled with its scope. ' +
    'With Departments on, each department is a box around its people, joined by one line to the person it rolls up to; ' +
    'a shared department has a dashed frame and an arrow to each department it serves. ' +
    'Each box is focusable: use the arrow keys to move between a manager, its reports and its siblings, ' +
    'Enter to open the position card, and Space to fold a branch. ' +
    'The Table view carries the same positions and the same filters in a keyboard-operable list.'
  );
}
