/**
 * templates.ts — build an order's structure from a BOM, generically.
 *
 * The client half of `apps/fab_erp/routes/templates.js`, which replaces
 * `buildWizardRows` — a hardcoded four-level nest with "girders" and
 * "segmentsPerGirder" written into the source and defaults of 6 and 5 typed
 * into React state.
 *
 * NOTHING HERE KNOWS WHAT A GIRDER IS. The questions come from the BOM
 * (`parameters`), the shape comes from the server (`preview`), and the labels
 * come from the child item's own name. A PEB is not a branch — it is a template
 * with no Girder line, or a Girder count of zero.
 *
 * PREVIEW WRITES NOTHING, which is the point of having it: a person checks the
 * codes and the row count before anything exists, so a wrong answer costs a
 * re-run rather than a half-built order.
 */

import { fabGet, fabPost, fabDel } from './client';
import type { OrderReadiness } from './readiness';

/**
 * Quantities are DECIMAL(18,6) columns and mysql2 hands those back as strings.
 * Typed honestly so a caller cannot do arithmetic on one by accident — read
 * them through `Number()`.
 */
export type Decimalish = number | string | null;

/**
 * A catalog item with BOM lines under it and nothing above it.
 *
 * Derived server-side rather than flagged, so there is no `is_template` column
 * to fall out of step with the structure it claims to describe.
 */
export interface StructureTemplate {
  id: number;
  code: string | null;
  name: string;
  categoryName: string | null;
  categoryId: number | null;
  /** How many BOM lines hang directly off it — a rough "how big is this". */
  childLines: number;
}

/**
 * One question the template asks, found by walking the BOM for parameterised
 * quantities. There is no parameters table: a line whose qty is a parameter
 * name IS the question, so the two cannot disagree.
 */
export interface TemplateParameter {
  /** The name the API wants back in `params`, e.g. `segmentsPerGirder`. */
  param: string;
  /** Seeds the input. The wizard's old hardcoded 6 and 5, now data. */
  defaultQty: number | null;
  /** The child item this counts — "Girder", "Segment". The label comes from here. */
  askedBy: string | null;
  /** True when each parent may have its own count (the per-girder grid). */
  perInstance: boolean;
  /** Hand-written domain advice from whoever built the template. */
  helpText: string | null;
}

/** The template's immediate BOM, so a screen can show what it is about to build. */
export interface TemplateBomLine {
  childItemId: number;
  childName: string | null;
  childCode: string | null;
  qtyNum: Decimalish;
  qtyParam: string | null;
  defaultQty: Decimalish;
  /** TINYINT(1) — 0 or 1, not a boolean. */
  perInstanceQty: number;
  codeSegment: string | null;
  helpText: string | null;
  sortOrder: number;
  /**
   * The flow every item expanded from this line starts with.
   *
   * On the LINE rather than the child item, because the line is the child in
   * context of its parent: a Top Flange inside a Girder Segment can be made
   * differently from a Top Flange inside a PEB member. Replaces
   * `fab_flow_rules`, which could only key on the type.
   *
   * Null is a real answer — an assembly that only groups its children carries
   * no flow at all.
   */
  defaultFlowId: number | null;
  defaultFlowName?: string | null;
}

export interface TemplateQuestions {
  itemId: number;
  /** In top-down walk order: "how many girders" before "how many segments each". */
  parameters: TemplateParameter[];
  lines: TemplateBomLine[];
}

/** One node from the preview's shallow sample — enough to check a code reads right. */
export interface TemplateSampleNode {
  /** 0 is the root. */
  depth: number;
  name: string;
  code: string;
}

export interface TemplatePreview {
  /** Every node the template would produce. Show this before creating anything. */
  nodes: number;
  /**
   * Counts keyed by the CHILD ITEM'S NAME — `{ Span: 1, Girder: 6, Segment: 30 }`.
   *
   * Note this differs from `instantiate`'s `byLevel`, which is keyed by
   * `level_kind` (`assembly`, `part`). Same field name, different key space;
   * render them separately rather than diffing one against the other.
   */
  byName: Record<string, number>;
  /** The first three of each depth. Not the tree — 247 nodes nobody reads. */
  sample: TemplateSampleNode[];
}

/** What `params` and `perInstance` look like on the wire. */
export type TemplateParams = Record<string, number>;
/** param -> per-parent counts, indexed by the PARENT's 1-based ordinal. */
export type TemplatePerInstance = Record<string, number[]>;

/* ────────────────────────────── the drill-down ────────────────────────────── */

/**
 * THE STRUCTURE SPEC — the drill-down wizard's complete answer sheet.
 *
 * Keyed by code path relative to the line root (`G1`, `G1-1`), which is what a
 * person reads on screen. An ABSENT NODE INHERITS, so a span whose six girders
 * are all the same is one entry, not six.
 *
 * `sameAs` is the only output of the grouping control. Split and Similar are
 * inverses of each other at the same rung, so they are one concept: a group is
 * a set of paths pointing at one canonical path. Building them as two features
 * would mean two data shapes and an undefined state when both were used.
 */
export interface StructureSpecNode {
  /** BOM line id -> how many. Absent lines keep the template's own answer. */
  children?: Record<string, number>;
  /** "This node is the same as that one" — the similarity link. */
  sameAs?: string;
}

export interface StructureSpec {
  version: 2;
  /**
   * The UNIFORM answer, keyed by catalog item id -> BOM line id -> count.
   *
   * "Every Line takes 3 Segments" is one entry however many Lines there are.
   * Writing it out per node instead would put a thousand entries in a column to
   * say one thing, and the spec would stop being readable.
   */
  defaults?: Record<string, Record<string, number>>;
  /** The EXCEPTIONS, keyed by code path, plus the `sameAs` grouping links. */
  nodes: Record<string, StructureSpecNode>;
}

/** One BOM line offered at a step. */
export interface OutlineLine {
  lineId: number;
  childItemId: number;
  childName: string | null;
  codeSegment: string | null;
  helpText: string | null;
  qtyParam: string | null;
  defaultQty: number | null;
  /**
   * True when each one becomes its own row with its own code and tasks — four
   * girders are four girders. False means a PART with a quantity: twenty
   * identical stiffeners are one row of twenty, which is how the BOQ writes
   * them and how nesting wants them.
   */
  explode: boolean;
  /** Has its own BOM below it, so answering 0 hoists rather than deletes. */
  hasChildren: boolean;
}

/** One node whose contents this step decides. */
export interface OutlineParent {
  /** Code path relative to the line root — the spec's key. */
  path: string;
  code: string;
  name: string;
  catalogItemId: number;
  /** The group it answers with, or null when it answers for itself. */
  similarGroup: string | null;
}

/**
 * One rung of the drill-down: a single kind of parent and what it contains.
 *
 * Per KIND, not merely per depth. Depth 1 of a composite span holds Lines, End
 * Diaphragms, Intermediate Diaphragms and Splices — 69 nodes and 18 BOM lines
 * between them, and almost every pairing is meaningless. Split by catalog item
 * and each step asks one honest question.
 */
export interface OutlineStep {
  /** Stable across re-outlines, so the wizard stays put while answers change. */
  key: string;
  depth: number;
  catalogItemId: number;
  /** The catalog item's own name. Never an enum. */
  label: string;
  parents: OutlineParent[];
  parentCount: number;
  /** False when there are too many parents to edit individually. */
  perNode: boolean;
  lines: OutlineLine[];
  /** parent path -> (line id -> count in force right now). */
  values: Record<string, Record<string, number>>;
}

export interface StructureOutline {
  steps: OutlineStep[];
  nodes: number;
  byName: Record<string, number>;
  rootCode: string;
}

/**
 * The structure one rung at a time, for the answers so far. WRITES NOTHING.
 *
 * Re-fetched after every change because a step's parents are produced by the
 * step above it: answer "3 segments" and the next rung has three nodes to talk
 * about, not five.
 */
export const outlineTemplate = (
  itemId: number,
  body: {
    params?: TemplateParams;
    perInstance?: TemplatePerInstance;
    structure?: StructureSpec | null;
  },
) => fabPost<StructureOutline>(`templates/${itemId}/outline`, { ...body });

export interface InstantiateResult {
  ok: boolean;
  /** Rows written to `fab_items`. */
  created: number;
  /** The `fab_items.id` of the new root, not the catalog item it came from. */
  rootItemId: number;
  /** Keyed by `level_kind` here — see the note on TemplatePreview.byName. */
  byLevel: Record<string, number>;
  /** Recomputed by the server so the stage strip behind cannot go stale. */
  readiness: OrderReadiness;
}

/** Everything this company can build, ordered by category then name. */
/** One BOM line as the editor sees it — a template line plus its own id and depth. */
export interface ItemBomLine extends TemplateBomLine {
  id: number;
  parentItemId: number;
  childUnit: string | null;
  /**
   * How many lines the CHILD has under it.
   *
   * Sent with the list so the editor can mark which rows go deeper without a
   * request per row. A Segment with seven parts under it and a Top Flange with
   * none look identical in a flat list, and that difference is the structure.
   */
  childLineCount: number;
}

export interface ItemBomResponse {
  ok: boolean;
  parent: { id: number; code: string | null; name: string; unit: string | null };
  lines: ItemBomLine[];
  /** Every question the whole tree under this item would ask an order. */
  parameters: TemplateParameter[];
}

/** GET /item-bom/:itemId — the lines directly under one catalog item. */
export const getItemBom = (itemId: number) =>
  fabGet<ItemBomResponse>(`item-bom/${itemId}`);

/**
 * POST /item-bom — add or edit one line.
 *
 * Exactly one of `qtyNum` or `qtyParam`. Both would be two answers to "how
 * many"; neither would silently expand to zero and collapse the level with no
 * explanation. The server refuses either way, and refuses a cycle.
 */
export const saveItemBomLine = (line: {
  id?: number | null;
  parentItemId: number;
  childItemId: number;
  qtyNum?: number | string | null;
  qtyParam?: string | null;
  defaultQty?: number | string | null;
  perInstanceQty?: boolean;
  codeSegment?: string | null;
  helpText?: string | null;
  sortOrder?: number;
  /** Null clears it, which is a valid answer for a grouping level. */
  defaultFlowId?: number | null;
}) => fabPost<{ ok: boolean }>('item-bom', line as unknown as Record<string, unknown>);

/** DELETE /item-bom/:id — remove a line. The child item itself is untouched. */
export const deleteItemBomLine = (id: number) =>
  fabDel<{ ok: boolean }>(`item-bom/${id}`);

export const listTemplates = () =>
  fabGet<{ templates: StructureTemplate[] }>('templates');

/** The questions one template asks, plus its immediate BOM. */
export const getTemplateQuestions = (itemId: number) =>
  fabGet<TemplateQuestions>(`templates/${itemId}/parameters`);

/**
 * The shape these answers would produce. WRITES NOTHING — safe to call on
 * every keystroke (debounce it anyway; it walks the whole BOM server-side).
 */
export const previewTemplate = (
  itemId: number,
  params: TemplateParams,
  perInstance: TemplatePerInstance = {},
  structure: StructureSpec | null = null,
) => fabPost<TemplatePreview>(`templates/${itemId}/preview`, { params, perInstance, structure });

/**
 * Create the structure on an order line.
 *
 * `lineCode` is the line's own code and becomes the top level of every code
 * below it, exactly as the BOQ sheet's Span column always was. The order's
 * prefix is resolved server-side and cannot be passed — a code that does not
 * match its order is a code nobody can find later.
 */
export const instantiateTemplate = (
  orderId: number,
  body: {
    itemId: number;
    orderLineId?: number | null;
    params?: TemplateParams;
    perInstance?: TemplatePerInstance;
    /**
     * The drill-down's answers. Saved onto the line, so the wizard can be
     * reopened on a structure rather than rebuilt from memory, and so
     * re-running it produces the identical tree.
     */
    structure?: StructureSpec | null;
    lineCode?: string | null;
    /**
     * Rebuild a line that already has a structure.
     *
     * Without it the server refuses with 409 ALREADY_BUILT rather than adding a
     * second copy of everything — every code is prefixed by the line, so
     * duplicates look like ordinary rows and nobody would spot them. With it,
     * the line's existing items and their tasks are soft-deleted first, and it
     * is still refused if any of that work has been started.
     */
    replace?: boolean;
  },
) => fabPost<InstantiateResult>(`orders/${orderId}/instantiate`, { ...body });

/* ─────────────────────────── the editable BOM ─────────────────────────── */

/**
 * One node of the structure being edited.
 *
 * It is the BOM's own shape, not an expansion: a Girder line is ONE node
 * reading ×6, which is what you edit and what gets built. `key` is a local id
 * so the editor can address a node that does not exist anywhere yet.
 */
export interface DraftNode {
  key: string;
  catalogItemId: number;
  name: string;
  unit: string | null;
  qty: number;
  codeSegment: string | null;
  codeJoin: 'dash' | 'absorb';
  defaultFlowId: number | null;
  /** The BOM line it came from — null once somebody adds a row by hand. */
  bomLineId: number | null;
  /** What the BOM called this quantity, if it asked for one. Shown as a hint. */
  qtyParam: string | null;
  children: DraftNode[];
}

/** GET the BOM as a tree to edit. Writes nothing. */
export const getDraftTree = (itemId: number) =>
  fabGet<{ tree: DraftNode }>(`templates/${itemId}/draft`);

/**
 * Build exactly this tree on the line.
 *
 * `replace` is refused unless it is passed, and refused anyway when tasks on
 * the line have been started — rebuilding would throw shop-floor history away.
 */
export const buildStructure = (
  orderId: number,
  body: {
    tree: DraftNode;
    orderLineId?: number | null;
    lineCode?: string | null;
    replace?: boolean;
  },
) => fabPost<InstantiateResult>(`orders/${orderId}/build`, { ...body });
