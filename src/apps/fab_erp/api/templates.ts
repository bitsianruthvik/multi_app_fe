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

import api, { API_HOST } from '@core/utils/axiosConfig';
import { fabGet, fabPost, fabDel } from './client';
import type { OrderReadiness } from './readiness';
import type { TreeNode } from '../hooks/useTree';

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
 * One node of the recipe, nested — the same shape the order's Structure step
 * edits, because it comes from the same builder on the server.
 *
 * A `TreeNode<T>` (hooks/useTree.ts) with the recipe's own payload as `T` —
 * `DraftNode` below is `useTree`'s other instance of the same generic, one
 * per tree shape rather than two near-identical hand-written interfaces.
 * `ItemBomNodeData` is exported on its own so `ItemBomDesigner.tsx` can hand
 * it to `useTree<ItemBomNodeData>()` — `useTree<ItemBomNode>()` would wrap an
 * already-wrapped type.
 */
export interface ItemBomNodeData {
  catalogItemId: number;
  name: string;
  unit: string;
  /** null when the line asks a question and states no default. */
  qty: number | null;
  codeSegment: string | null;
  codeJoin: string;
  /**
   * Whether this line explodes into one row per instance when an order is
   * built from it (REPAIR-B). Assemblies explode (four girders are four
   * rows, each with its own mark and tasks); parts do not (twenty-one
   * identical stiffeners are one row with qty=21 — see `bomService.expand`'s
   * "DOES A QUANTITY MEAN MANY THINGS, OR ONE THING MANY TIMES?" comment).
   * The root is not a line and always reports `true`.
   */
  explode: boolean;
  defaultFlowId: number | null;
  /** Which line this row came from. Null on the root, which is not a line. */
  bomLineId: number | null;
  /**
   * Whether this line's quantity is a per-job answer rather than a fixed
   * number (EU-6). NOT the parameter's name — `draftTree` (bomService.js,
   * shared by this endpoint and the order structure editor) stopped
   * returning that string when it added this flag, so a line that varies
   * per job cannot have its existing question name re-displayed or
   * silently re-sent on an unrelated field edit here. See
   * `ItemBomDesigner.tsx`'s own comment where this matters.
   */
  variesPerJob: boolean;
  /** 'make' or 'buy'. A bought item is not asked its size — you picked it. */
  procurementType?: string;
  /** Sizes the recipe states. Absent keys mean it states none. */
  dims?: Record<string, number | string | null>;
  /**
   * Set on a PICK line: the order chooses one catalog item inside this filter
   * ("any Plate Stiffener"). `catalogItemId` stays the line's own child — the
   * ROLE (its name, code segment and flow). Null on an ordinary line.
   */
  pick?: PickFilter | null;
}

/**
 * A pick line's filter: the catalog items an order may fill the line with.
 * Names ride along from the server so a chip can read "Plate Stiffeners"
 * without a lookup.
 */
export interface PickFilter {
  categoryId: number;
  groupId: number | null;
  subgroupId: number | null;
  defaultItemId: number | null;
  categoryName?: string | null;
  groupName?: string | null;
  subgroupName?: string | null;
  defaultItemName?: string | null;
}

/** The part of a filter that is written — names are the server's to fill. */
export type PickFilterInput = Pick<PickFilter, 'categoryId' | 'groupId' | 'subgroupId' | 'defaultItemId'>;

export interface PickCandidate {
  id: number;
  code: string;
  name: string;
  unit: string | null;
  thicknessMm: number | string | null;
  procurementType: string | null;
}

/** GET /catalog/pick-candidates — the catalog items a filter allows (what the server will accept). */
export const getPickCandidates = (filter: { categoryId: number; groupId?: number | null; subgroupId?: number | null }, q?: string) =>
  fabGet<{ items: PickCandidate[] }>('catalog/pick-candidates', {
    categoryId: filter.categoryId,
    ...(filter.groupId != null ? { groupId: filter.groupId } : {}),
    ...(filter.subgroupId != null ? { subgroupId: filter.subgroupId } : {}),
    ...(q ? { q } : {}),
  });

/** "Plate Stiffeners" — the narrowest name a filter has. */
export const pickLabel = (p: PickFilter) => p.subgroupName ?? p.groupName ?? p.categoryName ?? 'catalog items';

export type ItemBomNode = TreeNode<ItemBomNodeData>;

/** GET /item-bom/:itemId/tree — the whole recipe under one item, nested. */
export const getItemBomTree = (itemId: number) =>
  fabGet<{ ok: boolean; tree: ItemBomNode | null }>(`item-bom/${itemId}/tree`);

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
  /** Omitted means "leave it as it is" — `setBomLine` reads the prior value back itself. */
  explode?: boolean;
  codeJoin?: 'dash' | 'absorb' | null;
  /** A pick line's filter. Omitted = leave as it is; null = an ordinary line again. */
  pick?: PickFilterInput | null;
}) => fabPost<{ ok: boolean }>('item-bom', line as unknown as Record<string, unknown>);

/**
 * POST /item-bom/:id/copy — copy a line as a NEW part right below it
 * ("Top Flange (copy)", with the same flow, code segment, sizes and — for an
 * assembly — the same lines under it). A catalog child copies as a second
 * line of the same item (`newPart: false`).
 */
export const copyItemBomLine = (lineId: number) =>
  fabPost<{ ok: boolean; lineId: number; itemId: number; name: string; newPart: boolean }>(`item-bom/${lineId}/copy`, {});

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
/**
 * A `TreeNode<T>` (hooks/useTree.ts) — see the note on `ItemBomNodeData`
 * above. `DraftNodeData` is exported so `StructureEditor.tsx` can hand it to
 * `useTree<DraftNodeData>()`.
 */
export interface DraftNodeData {
  /**
   * The row this node ALREADY is, when the tree came from the order rather than
   * the catalogue. It is what lets a save be a diff: a row that survives an edit
   * keeps its id, and with it the dimensions typed on it and the plate it was
   * nested onto. Absent on a node somebody just added, and on every node of a
   * tree read from a BOM.
   */
  itemId?: number | null;
  /**
   * The catalog item this row IS. Null only on a pick row nobody has chosen an
   * item for yet — readiness refuses Confirm until somebody does.
   */
  catalogItemId: number | null;
  /** On a pick row: the template part it fills (name, code segment, flow). */
  roleItemId?: number | null;
  /** On a pick row: which catalog items may fill it. */
  pick?: PickFilter | null;
  /** On a pick row the draft filled in: the chosen item's name. */
  pickedName?: string | null;
  name: string;
  unit: string | null;
  /**
   * null means NOBODY HAS SAID YET — a line the recipe marks as varying per job
   * and no longer guesses at. It is not 0 and it must not become 1: the writers
   * refuse it, because one splice on a bridge that needs sixteen reads as a
   * decision in a way an empty box never does.
   */
  qty: number | null;
  /**
   * Made here or bought in, from the catalog item. A bought row (a shear
   * stud) has no rectangle to size, so the editor asks it for none.
   */
  procurementType?: string;
  /**
   * The row's order code — parent code + the item's short code + position.
   * Written to the row when the production order is deployed; before that
   * the server previews it from the same rule (`codeWritten` says which).
   */
  code?: string | null;
  /** The row's LAST piece under one parent (SPAN1-L1-4 on a qty-4 row); null when it is one piece. */
  codeLast?: string | null;
  codeWritten?: boolean;
  /** The catalog item's code (COMPOS-SPAN), always known once the row points at an item. */
  catalogCode?: string | null;
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
  /**
   * The rectangle, on the leaf that has one. Values are held as TYPED STRINGS
   * while somebody is editing so a half-entered "12." survives the next
   * keystroke and a cleared box stays cleared; they arrive from the server as
   * numbers and are parsed once, on save. A key present and blank CLEARS.
   *
   * Assemblies carry {} — a Segment has no shape of its own, its weight and area
   * are its parts summed.
   */
  dims?: Record<string, number | string | null>;
}

export type DraftNode = TreeNode<DraftNodeData>;

/** GET the BOM as a tree to edit. Writes nothing. */
/**
 * The tree a new order starts from — the template's LATEST RELEASED revision
 * (never its unreleased working copy); the root's `revision` says which. A
 * template never released answers 409 NOT_RELEASED.
 */
export const getDraftTree = (itemId: number) =>
  fabGet<{ tree: DraftNode & { revision?: number | null } }>(`templates/${itemId}/draft`);

/* ─────────────────────────── template revisions ─────────────────────────── */

export interface TemplateRevisionStatus {
  templateItemId: number;
  latestRev: number | null;
  releasedAt: string | null;
  note: string | null;
  hasBom: boolean;
  /** The working copy differs from the latest revision — there is something to release. */
  unreleasedChanges: boolean;
}
export interface TemplateRevision {
  rev: number;
  note: string | null;
  releasedAt: string;
  releasedBy: string | null;
  /** Order lines built from this revision. */
  orderLines: number;
}

/** GET /templates/:id/revisions — where the template stands, and its history. */
export const getTemplateRevisions = (itemId: number) =>
  fabGet<{ status: TemplateRevisionStatus; revisions: TemplateRevision[]; builtBeforeRevisions: number }>(`templates/${itemId}/revisions`);

/** POST /templates/:id/revisions — release the working copy as the next revision. */
export const releaseTemplateRevision = (itemId: number, note: string | null) =>
  fabPost<{ ok: boolean; rev: number }>(`templates/${itemId}/revisions`, { note });

/**
 * GET what this order actually DECIDED, in the same shape.
 *
 * `getDraftTree` answers "what does the catalogue say this is made of".
 * This answers "what did we settle on", which stops being the same thing the
 * moment somebody changes a quantity. Editing needs the second.
 */
export const getCurrentTree = (orderId: number, orderLineId?: number | null) =>
  fabGet<{ tree: DraftNode | null; codePrefix?: string | null }>(
    `orders/${orderId}/structure/tree${orderLineId ? `?orderLineId=${orderLineId}` : ''}`,
  );

/**
 * One row `requireAllQty` (bomService.js) refused for having no quantity —
 * the shape of `detail.unanswered[]` on a 400 `QTY_REQUIRED` from
 * `/structure/apply` or `/build`. `itemId`/`code` are null for a row that
 * does not exist on the order yet (a hand-added or not-yet-saved node);
 * `path` is the ancestry's own names joined by ` / `, ending in `name` —
 * computed the same way client-side so a row can be matched back to its
 * tree node without a second round trip.
 */
export interface QtyRequiredRow {
  itemId: number | null;
  code: string | null;
  name: string;
  depth: number;
  path: string;
}

/** What EU-12's revision guard needs, and what a save actually did (EU-17 item 3). */
export interface ApplyStructureResult {
  ok: boolean;
  created: number;
  updated: number;
  removed: number;
  /** Rows whose dimensions were written this save — not a row count, a resize count. */
  sized: number;
  /** Recomputed by the server so the wizard rail cannot go stale (EU-7). */
  readiness: OrderReadiness;
}

/**
 * Save an edited structure. A DIFF — surviving rows keep their ids.
 *
 * `revisionReason` is required by the server (400 `REVISION_REASON_REQUIRED`)
 * once the order is no longer a draft (EU-12, decision 4) — every existing
 * caller here is draft-only, so it stays optional and unset.
 */
export const applyStructure = (
  orderId: number,
  body: { tree: DraftNode; orderLineId?: number | null; revisionReason?: string },
) => fabPost<ApplyStructureResult>(`orders/${orderId}/structure/apply`, { ...body });

/**
 * EU-9's flow routes (`routes/orderItems.js`) — mounted since EU-9 but never
 * called from anywhere until now (EU-17 item 6 / X3).
 *
 * `syncOrderFlows` re-pulls each item's BOM-line default flow — touching only
 * items that still have none unless `reassign` is true, so re-running never
 * undoes an exception somebody set by hand (§13 "a default flow belongs to the
 * BOM LINE"). It does not say WHICH flow each item landed on, so the caller
 * re-reads the tree afterward rather than guessing.
 */
export interface SyncFlowsResult { ok: boolean; assigned: number; readiness: OrderReadiness }
export const syncOrderFlows = (orderId: number, reassign = false) =>
  fabPost<SyncFlowsResult>(`orders/${orderId}/flows/sync`, { reassign });

/**
 * `setOrderFlows` overrides one or more items' flow at once — the server
 * round trip a bulk "set flow" action goes through, since it already knows
 * the flow it is setting and the readiness this returns means no follow-up
 * GET is needed to reflect the change.
 */
export interface SetFlowsResult { ok: boolean; updated: number; readiness: OrderReadiness }
export const setOrderFlows = (orderId: number, itemIds: number[], flowId: number | null) =>
  fabPost<SetFlowsResult>(`orders/${orderId}/flows/set`, { itemIds, flowId });

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

/**
 * An item the order's add-a-row picker may offer, with what it takes to tell
 * two similar names apart.
 */
export interface PickableItem {
  id: number;
  name: string;
  code: string | null;
  unit: string | null;
  categoryName: string | null;
  groupName: string | null;
  subgroupName: string | null;
  procurement: 'make' | 'buy';
  /** "32 × 90 × 1700", where the item states a size. Parts take theirs from the order. */
  size: string | null;
  material: string | null;
  /** What its BOM lines usually have it made by. */
  flowName: string | null;
  bomCount: number;
  orderCount: number;
  lastUsedAt: string | null;
  /** Already somewhere on this order — the next row is usually one of these. */
  onThisOrder: boolean;
}

export const getPickableItems = (orderId?: number | string | null) =>
  fabGet<{ items: PickableItem[] }>('catalog/pickable', orderId ? { orderId } : {})
    .then((r) => r.items ?? []);

export type CatalogSize = Partial<Record<'thickness_mm' | 'width_mm' | 'length_mm' | 'material' | 'grade', number | string>>;

export const getCatalogSizes = () =>
  fabGet<{ sizes: Record<string, CatalogSize> }>('catalog/sizes').then((r) => r.sizes ?? {});


/* ───────────────── one line's structure as a sheet, and back ───────────────── */

/**
 * GET /orders/:orderId/structure/sheet?orderLineId= — one line's tree as an
 * .xlsx the person edits in Excel. Returns the Blob; the caller saves it.
 *
 * Not the whole-order Level sheet (`/structure/export`, unused): this one
 * carries Row ids, so the upload below is a DIFF through `applyTree` — rows
 * keep their ids, and with them their sizes, their plate and their tasks.
 */
export async function downloadStructureSheet(orderId: number | string, orderLineId: number | string): Promise<Blob> {
  const companySlug = localStorage.getItem('companySlug');
  const res = await api.get(
    `${API_HOST}/api/${companySlug}/fab_erp/orders/${orderId}/structure/sheet`,
    { params: { orderLineId }, responseType: 'blob' },
  );
  return res.data as Blob;
}

/** What an upload did — `applyStructure`'s result plus the rows the sheet held. */
export interface StructureSheetResult extends ApplyStructureResult {
  rows: number;
}

/**
 * POST /orders/:orderId/structure/sheet — apply an edited sheet as a diff.
 *
 * A 422 means nothing was written: `response.data.detail.problems` names
 * every bad row ("Row 9: …"). `revisionReason` is required by the server once
 * the order is no longer a draft, exactly as for `applyStructure`.
 */
export async function uploadStructureSheet(
  orderId: number | string,
  orderLineId: number | string,
  file: File,
  revisionReason?: string,
): Promise<StructureSheetResult> {
  const companySlug = localStorage.getItem('companySlug');
  const form = new FormData();
  form.append('excel_file', file);
  form.append('orderLineId', String(orderLineId));
  if (revisionReason) form.append('revisionReason', revisionReason);
  const res = await api.post(`${API_HOST}/api/${companySlug}/fab_erp/orders/${orderId}/structure/sheet`, form);
  return res.data as StructureSheetResult;
}
