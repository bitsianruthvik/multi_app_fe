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

import { fabGet, fabPost } from './client';
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
  levelKind: string | null;
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
) => fabPost<TemplatePreview>(`templates/${itemId}/preview`, { params, perInstance });

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
    lineCode?: string | null;
  },
) => fabPost<InstantiateResult>(`orders/${orderId}/instantiate`, { ...body });
