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

/*
 * THE DRILL-DOWN WIZARD'S TYPES LIVED HERE — StructureSpec, the outline, and
 * instantiateTemplate. All gone with the wizard itself. The structure is now
 * edited as a tree (DraftNode, below) and written exactly as sent.
 */

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
   * Sizes the RECIPE states, if it states any — "a Top Flange inside a
   * Composite Girder Segment is 40 x 700 x 12000". Copied onto every row built
   * from this line, so nobody retypes them per order. Blank is equally valid:
   * plenty of parts are sized per job.
   */
  defaults?: { length_mm?: number | null; width_mm?: number | null; thickness_mm?: number | null };
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
  /** Recipe sizes. A key present and blank CLEARS that default. */
  defaults?: Record<string, number | string | null>;
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


/**
 * The shape these answers would produce. WRITES NOTHING — safe to call on
 * every keystroke (debounce it anyway; it walks the whole BOM server-side).
 */
export const previewTemplate = (
  itemId: number,
  params: TemplateParams,
  perInstance: TemplatePerInstance = {},
) => fabPost<TemplatePreview>(`templates/${itemId}/preview`, { params, perInstance });


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
  /**
   * The BOM's own abbreviation for this rung, and how it joins to its parent's.
   * NOT used to name anything here — the BOM step writes no codes. They are
   * carried so the code pass at production-order time has them.
   */
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
 * The rows it creates have NO CODE. At BOM time nothing physical exists to
 * name — the row says "six of this design" — and codes are minted later, at
 * production-order time, where the pieces become real.
 *
 * `replace` is refused unless it is passed, and refused anyway when tasks on
 * the line have been started — rebuilding would throw shop-floor history away.
 */
export const buildStructure = (
  orderId: number,
  body: {
    tree: DraftNode;
    orderLineId?: number | null;
    replace?: boolean;
  },
) => fabPost<InstantiateResult>(`orders/${orderId}/build`, { ...body });
