/** Shapes returned by the cf_erp backend (apps/cf_erp/services). */

export type DataType = 'number' | 'text' | 'boolean' | 'date' | 'option';
export type ValueRule = 'entered' | 'fixed' | 'defaulted' | 'calculated' | 'rollup' | 'inherited';
export type CaptureAt = 'item' | 'batch' | 'individual';
export type RecordStatus = 'draft' | 'active' | 'obsolete';
export type Kind = 'catalog' | 'temporary' | 'template' | 'selection';
/** Where a catalog item comes from when an order asks for one (user, 2026-09-23). */
export type Sourcing = 'stock' | 'make' | 'both';

export interface Meta {
  levels: string[];
  leafDepth: number;
  dataTypes: DataType[];
  measurementTypes: string[];
  valueRules: ValueRule[];
  captureLevels: CaptureAt[];
  tracking: ('quantity' | 'batch' | 'individual')[];
  selectionModes: ('allowed_list' | 'spec_match' | 'both')[];
  statuses: RecordStatus[];
  waitRelations?: WaitRelation[];
  flowStatuses?: RecordStatus[];
  weekdays?: Weekday[];
  areaPurposes?: AreaPurpose[];
  batchStatuses?: BatchStatus[];
  movementTypes?: MovementType[];
}

export interface TreeNode {
  id: number;
  parentId: number | null;
  depth: number;
  level: string;
  scope: NodeScope;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  status: 'active' | 'inactive';
  itemCount: number;
  definitionCount: number;
  ruleCount: number;
  machineCount: number;
  children: TreeNode[];
}
/** Machine families hold machine types; the other scopes are picker filters for items and definitions. */
export type NodeScope = 'item' | 'definition' | 'both' | 'machine';

export interface Tree { levels: string[]; leafDepth: number; roots: TreeNode[] }

export interface PathStep { id: number; code: string; name: string; level: string }

export interface SpecOption { id: number; value: string; label: string | null; sortOrder?: number; status?: 'active' | 'inactive' }

export interface Specification {
  id: number;
  code: string;
  name: string;
  dataType: DataType;
  measurementType: string | null;
  defaultUom: string | null;
  decimals: number | null;
  description: string | null;
  status: 'active' | 'inactive';
  options?: SpecOption[];
  ruleCount: number;
  valueCount: number;
}

export interface Formula {
  id: number;
  code: string;
  name: string;
  expression: string;
  version: number;
  description: string | null;
  status: 'active' | 'inactive';
  /** value: plain codes · rollup: children.X · timing: item.X and machine.X */
  kind: FormulaKind | null;
  ruleCount: number;
  timingRuleCount: number;
}

export type FormulaKind = 'value' | 'rollup' | 'timing';

export interface FormulaCheck {
  ok: boolean;
  problems: string[];
  references: string[];
  rollupTerms?: string[];
  usesRollup?: boolean;
  kind?: FormulaKind;
  itemRefs?: string[];
  machineRefs?: string[];
  result: { value: number | null; missing?: string[]; error?: string } | null;
}

export interface Rule {
  id: number;
  specificationId: number;
  specCode: string;
  specName: string;
  dataType: DataType;
  unit: string | null;
  subjectType: 'classification' | 'master' | 'machine';
  subjectId: number;
  captureAt: CaptureAt;
  valueRule: ValueRule;
  isRequired: boolean;
  isApplicable: boolean;
  formulaId: number | null;
  formulaCode: string | null;
  sortOrder: number;
  optionIds: number[];
  optionValues: string[];
}

export interface ValueView {
  raw: number | string | boolean | null;
  display: string | null;
  source: ValueRule;
  from: string;
  optionValue?: string | null;
}

export type SpecStatus =
  | 'set' | 'missing' | 'empty' | 'default' | 'fixed' | 'no_fixed_value' | 'calculated' | 'waiting_inputs'
  | 'formula_error' | 'formula_missing' | 'formula_cycle' | 'no_bom' | 'no_parent' | 'waiting_parent' | 'frozen' | 'switched_off' | 'captured_later'
  | 'not_capturable' | 'set_here' | 'default_from_above' | 'computed_on_items' | 'rollup' | 'inherited';

/** What freezes a record: its order is closed, lost or cancelled, or its line was released to production. */
export interface Frozen { orderId: number; orderCode: string; orderStatus: OrderStatus; reason?: 'closed' | 'released'; lineNo?: number | null; releaseId?: number }

export interface ResolvedSpec {
  spec: { id: number; code: string; name: string; dataType: DataType; unit: string | null; decimals: number | null };
  captureAt: CaptureAt;
  applicable: boolean;
  capturable: boolean;
  rule: {
    assignmentId: number;
    valueRule: ValueRule;
    isRequired: boolean;
    formula: { id: number; code: string; name: string; expression: string; version: number } | null;
    sortOrder: number;
  };
  definedAt: { level: string; subjectType: string; subjectId: number; code: string | null; name: string };
  overrides: { level: string; valueRule: ValueRule; applicable: boolean }[];
  options?: SpecOption[];
  value: ValueView | null;
  status: SpecStatus;
  problem?: string;
  conflict?: string;
  note?: string;
  missingInputs?: string[];
}

export interface Resolution {
  mode: 'item' | 'setup' | 'batch';
  chain: { subjectType: string; subjectId: number; level: string; code: string | null; name: string; self: boolean }[];
  specs: ResolvedSpec[];
  missingRequired: { code: string; name: string }[];
  problems: string[];
  unassignedValues: { code: string; name: string; source: string; raw: unknown }[];
  /** Set when the item's order is closed, lost or cancelled — its values are kept as they were. */
  frozen?: Frozen | null;
}

export interface MasterRecord {
  id: number;
  recordKind: 'item' | 'definition';
  kind: Kind;
  code: string | null;
  name: string;
  /** The few characters that stand for the thing — what stock and WIP codes are built from. */
  shortName: string | null;
  description: string | null;
  classificationId: number;
  status: RecordStatus;
  revision: string | null;
  createdAt: string;
  updatedAt: string;
  item: {
    itemType: 'catalog' | 'temporary';
    trackedBy: 'quantity' | 'batch' | 'individual';
    uom: string;
    /** Where one comes from when an order asks for it: from stock, made on the order, or either. */
    sourcing: Sourcing;
    sourceDefinitionId: number | null;
    ownerOrderLineId: number | null;
  } | null;
  definition: {
    definitionType: 'template' | 'selection';
    selectionMode: 'allowed_list' | 'spec_match' | 'both' | null;
    candidateClassificationId: number | null;
    candidateClassification?: PathStep | null;
  } | null;
  classificationPath?: PathStep[];
  sourceDefinition?: { id: number; code: string | null; name: string; status: RecordStatus } | null;
  counts?: { temporaryItems: number; allowedItems: number; criteria: number };
  classificationCode?: string;
  classificationName?: string;
  sourceDefinitionCode?: string | null;
  warnings?: string[];
  bom?: { id: number; bomType: BomType; status: RecordStatus; revision: string | null; lineCount: number } | null;
  bomStatus?: RecordStatus | null;
  frozen?: Frozen | null;
  owner?: { orderId: number; orderCode: string; orderStatus?: OrderStatus; lineId?: number; lineNo: number; isLineItem?: boolean } | null;
  placement?: { parentId: number; parentCode: string | null; parentName: string; bomLineId: number; position: number; quantity: number; role: string | null } | null;
  defaultFlowId?: number | null;
  /** The flow it is usually made by, and — for a temporary item without one — its template's. */
  defaultFlow?: FlowRef | null;
  definitionFlow?: FlowRef | null;
}

export interface RecordList { total: number; rows: MasterRecord[] }

export interface HistoryEntry {
  id: number;
  specCode: string;
  specName: string;
  change: 'create' | 'update' | 'delete';
  from: string | null;
  to: string | null;
  unit: string | null;
  source: ValueRule | null;
  changedAt: string;
  changedBy: string | null;
}

export interface Generated { schemeId: number | null; schemeCode: string | null; text: string | null; number: number | null; missing: string[]; noRule?: boolean; error?: string; problems?: string[] }

export interface DraftPreview { resolution: Resolution | null; code: Generated | null; name: Generated | null; note?: string }

export interface Selection {
  definitionId: number;
  selectionMode: 'allowed_list' | 'spec_match' | 'both';
  candidateClassificationId: number | null;
  allowedItems: { id: number; itemId: number; code: string; name: string; status: RecordStatus; isDefault: boolean; sortOrder: number }[];
  criteria: { id: number; specificationId: number; specCode: string; specName: string; dataType: DataType; unit: string | null; operator: string; value: unknown; valueTo: number | null; optionId: number | null }[];
}

export interface Candidates {
  mode: string;
  note?: string;
  candidates: { id: number; code: string; name: string; revision: string | null; classificationName: string; isDefault: boolean; matchedValues: { specCode: string; value: unknown; unit: string | null; source: string }[] }[];
}

export interface CodegenEntity {
  entityType: string;
  label: string;
  tokens: { key: string; label: string; available: boolean; note?: string }[];
  tokenPatterns: { pattern: string; label: string }[];
  conditionTokens: { key: string; label: string; operators: string[]; valueKind: string; values?: string[] }[];
}

export interface Segment { segmentType: 'literal' | 'token' | 'sequence' | 'date'; literalText?: string | null; tokenKey?: string | null; format?: string | null; transform?: 'none' | 'upper' | 'lower'; maxLength?: number | null; isRequired?: boolean }
export interface Condition { tokenKey: string; operator: string; value: string }

export interface CodeScheme {
  id: number;
  code: string;
  name: string;
  entityType: string;
  targetField: 'code' | 'name';
  seqScope: 'prefix' | 'scheme';
  priority: number;
  description: string | null;
  status: 'active' | 'inactive';
  conditions: Condition[];
  segments: Segment[];
  counters: { prefix: string; nextValue: number }[];
}

// ---- BOMs ---------------------------------------------------------------------

export type BomType = 'standard' | 'template' | 'custom';

export interface BomLine {
  id: number;
  lineNo: number;
  position: number;
  role: string | null;
  quantity: number;
  notes: string | null;
  child: { id: number; code: string | null; name: string; kind: Kind; status: RecordStatus; recordKind: 'item' | 'definition'; uom: string | null; hasBom: boolean };
  design: { id: number; code: string | null; name: string };
  selection: { id: number; code: string | null; name: string } | null;
  resolved: boolean;
  sourceLineId: number | null;
  /** The flow this line names, and the one that applies. */
  flow: { id: number; code: string; name: string } | null;
  effectiveFlow: EffectiveFlow | null;
}

export interface BomView {
  parent: { id: number; code: string | null; name: string; kind: Kind; status: RecordStatus };
  bomType: BomType | null;
  canHaveBom: boolean;
  allowedChildKinds: Kind[];
  order: { id: number; code: string; status: OrderStatus; released?: boolean } | null;
  bom: { id: number; bomType: BomType; status: RecordStatus; revision: string | null; sourceBomId: number | null; notes: string | null; updatedAt: string } | null;
  lines: BomLine[];
  unresolvedSelections: number;
}

export interface StructureNode {
  key: string;
  id: number;
  code: string | null;
  name: string;
  kind: Kind;
  status: RecordStatus;
  uom: string | null;
  depth: number;
  quantity: number;
  total: number;
  lineId: number | null;
  lineNo: number | null;
  position: number | null;
  role: string | null;
  selection: { id: number; code: string | null; name: string } | null;
  resolved: boolean;
  flow: EffectiveFlow | null;
  bom: { id: number; bomType: BomType; status: RecordStatus; revision: string | null } | null;
  children: StructureNode[];
}

export interface Explosion {
  root: StructureNode;
  stats: { nodes: number; temporary: number; drafts: number; unresolved: number; maxDepth: number };
  truncated: boolean;
}

export interface LineStructure extends Explosion {
  line: { id: number; lineNo: number; lineType: 'standard' | 'custom'; quantity: number };
  order: { id: number; code: string; status: OrderStatus; editable: boolean };
}

export interface WhereUsedRow {
  lineId: number;
  quantity: number;
  role: string | null;
  position: number;
  via: 'child' | 'selection';
  bomType: BomType;
  bomStatus: RecordStatus;
  parent: { id: number; code: string | null; name: string; kind: Kind };
  order: { id: number; code: string } | null;
}

export interface LineCandidates extends Candidates {
  lineId: number;
  selection: { id: number; code: string | null; name: string };
  chosenItemId: number | null;
}

// ---- Sales orders -------------------------------------------------------------

export type OrderType = 'customer' | 'stock';
export type OrderStatus = 'draft' | 'inquiry' | 'quoted' | 'confirmed' | 'closed' | 'lost' | 'cancelled';

export interface SalesOrderLine {
  id: number;
  lineNo: number;
  lineType: 'standard' | 'custom';
  position: number;
  quantity: number;
  committedDate: string | null;
  description: string | null;
  notes: string | null;
  item: { id: number; code: string | null; name: string; status: RecordStatus; kind: 'catalog' | 'temporary'; uom: string; revision: string | null } | null;
  design: { id: number; code: string | null; name: string };
  bomRevision: string | null;
  bom: { status: RecordStatus; currentRevision: string | null } | null;
  structure: { temporaryItems: number; drafts: number; unresolvedSelections: number } | null;
  /** Set once the line is released to production (the whole line, decision E1). */
  release?: { id: number; releasedAt: string } | null;
}

export interface SalesOrder {
  id: number;
  code: string;
  orderType: OrderType;
  title: string | null;
  customer: { id: number; code: string | null; name: string | null } | null;
  customerReference: string | null;
  status: OrderStatus;
  receivedOn: string | null;
  committedDate: string | null;
  confirmedAt: string | null;
  deliveryAddress: string | null;
  notes: string | null;
  lineCount?: number;
  overdue: boolean;
  allowedTransitions: OrderStatus[];
  createdAt: string;
  updatedAt: string;
  lines?: SalesOrderLine[];
}

export type PartyRole = 'customer' | 'supplier' | 'subcontractor';

export interface Party {
  id: number;
  code: string;
  name: string;
  roles: PartyRole[];
  taxNumber: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

// ---- Production: machines, operations, flows ----------------------------------

export interface FlowRef { id: number; code: string; name: string; status: RecordStatus }

/** Where the flow that applies came from: the BOM line, the child's own default, or its template's. */
export interface EffectiveFlow { id: number; code: string; name: string; from: 'line' | 'item' | 'template' }

export interface Machine {
  id: number;
  code: string;
  name: string;
  classificationId: number;
  classificationCode?: string;
  classificationName?: string;
  catalogItem: { id: number; code: string | null; name: string | null } | null;
  serialNumber: string | null;
  status: 'active' | 'inactive';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimeView { minutes: number | null; formula: { id: number; code: string; expression: string } | null }

export interface TimingSubject { type: 'classification' | 'machine'; id: number; code: string | null; name: string | null; level: string }

/** What a machine can do (or is kept out of), and where that was set. */
export interface MachineOperation {
  operation: { id: number; code: string; name: string };
  eligible: boolean;
  from: TimingSubject;
  setup: TimeView | null;
  work: TimeView | null;
}

export interface MachineDetail extends Machine {
  classificationPath: PathStep[];
  operations: MachineOperation[];
}

export interface Operation {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive';
  flowCount?: number;
  ruleCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TimingRule {
  id: number;
  operationId: number;
  subject: TimingSubject;
  eligible: boolean;
  setup: TimeView | null;
  work: TimeView | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  notes: string | null;
}

export interface OperationMachine {
  machine: { id: number; code: string; name: string };
  eligible: boolean;
  from: TimingSubject;
  setup: TimeView | null;
  work: TimeView | null;
}

export interface OperationDetail extends Operation {
  rules: TimingRule[];
  flows: { id: number; code: string; name: string; status: RecordStatus; sequence: number }[];
  machines: OperationMachine[];
}

export interface TimePart { minutes: number | null; formula: string | null; missing?: string[]; error?: string }

export interface TimingPreview {
  operation: { id: number; code: string; name: string };
  machine: { id: number; code: string; name: string };
  item?: { id: number; code: string | null; name: string } | null;
  quantity: number;
  date: string;
  eligible: boolean;
  reason?: string;
  from?: TimingSubject;
  setupMinutes?: number | null;
  workMinutesPerPiece?: number | null;
  totalMinutes?: number | null;
  setup?: TimePart;
  work?: TimePart;
}

export type WaitRelation = 'parent' | 'children' | 'siblings' | 'ancestor';

export interface WaitRule {
  id: number;
  relation: WaitRelation;
  targetDefinition: { id: number; code: string | null; name: string } | null;
  targetOperation: { id: number; code: string; name: string } | null;
  requiredStatus: 'started' | 'done';
  notes: string | null;
  /** The rule in one sentence. */
  text: string;
}

export interface FlowStep {
  id: number;
  sequence: number;
  operation: { id: number; code: string; name: string; status: 'active' | 'inactive' };
  stepName: string | null;
  notes: string | null;
  waits: WaitRule[];
}

export interface Flow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  revision: string | null;
  status: RecordStatus;
  stepCount?: number;
  usedBy?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlowDetail extends Flow {
  steps: FlowStep[];
  uses: { records: { id: number; code: string | null; name: string; kind: Kind }[]; bomLines: number };
}

// ---- Shifts (per machine) ---------------------------------------------------------

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface MachineShift {
  id: number;
  machineId: number;
  name: string;
  weekdays: Weekday[];
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  breakMinutes: number;
  /** Working minutes: the span less the break. */
  minutes: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  sortOrder: number;
  notes: string | null;
}

export interface CalendarException {
  id: number;
  machineId: number;
  date: string;
  kind: 'closed' | 'extra';
  shiftId: number | null;
  shiftName: string | null;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  text: string;
}

export interface CalendarWindow { start: string; end: string; label: string; source: 'shift' | 'extra'; minutes: number }
export interface CalendarDay { date: string; weekday: Weekday; windows: CalendarWindow[]; exceptions: CalendarException[]; minutes: number }
export interface MachineCalendar { machine: { id: number; code: string; name: string }; from: string; to: string; days: CalendarDay[]; minutes: number }

// ---- Inventory -----------------------------------------------------------------------

export type AreaPurpose = 'storage' | 'wip' | 'quarantine' | 'dispatch';
export type BatchStatus = 'available' | 'on_hold' | 'rejected';
export type MovementType = 'receipt' | 'issue' | 'transfer' | 'adjustment' | 'scrap';
/** What a stock row counts as: its batch's quality state first, then its area's purpose. */
export type StockCategory = 'available' | 'in_process' | 'held' | 'rejected' | 'dispatch';

export interface StockingArea {
  id: number;
  code: string;
  name: string;
  purpose: AreaPurpose;
  machine: { id: number; code: string; name: string } | null;
  status: 'active' | 'inactive';
  notes: string | null;
  itemCount?: number;
  lineCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Batch {
  id: number;
  code: string;
  item: { id: number; code: string | null; name: string; uom: string };
  status: BatchStatus;
  statusNote: string | null;
  receivedOn: string | null;
  supplier: { id: number; code: string; name: string } | null;
  supplierRef: string | null;
  notes: string | null;
  onHand?: number;
  createdAt: string;
}

export interface BatchDetail extends Batch {
  specs: Resolution;
  locations: { area: { id: number; code: string; name: string; purpose: AreaPurpose }; quantity: number }[];
}

export interface StockRow {
  area: { id: number; code: string; name: string; purpose: AreaPurpose };
  item: { id: number; code: string | null; name: string; uom: string; trackedBy: 'quantity' | 'batch' | 'individual' };
  batch: { id: number; code: string; status: BatchStatus } | null;
  quantity: number;
  category: StockCategory;
  updatedAt: string;
}

export interface StockTotals { onHand: number; available: number; in_process: number; held: number; rejected: number; dispatch: number }

export interface Movement {
  id: number;
  code: string;
  movementType: MovementType;
  movementDate: string;
  party: { id: number; code: string; name: string } | null;
  order: { id: number; code: string } | null;
  reference: string | null;
  reason: string | null;
  notes: string | null;
  reversalOf: { id: number; code: string } | null;
  reversedBy: { id: number; code: string } | null;
  lineCount: number;
  areaCodes: string;
  itemCodes: string;
  createdAt: string;
}

export interface MovementLine {
  lineNo: number;
  item: { id: number; code: string | null; name: string; uom: string };
  batch: { id: number; code: string; status: BatchStatus } | null;
  from: { id: number; code: string; name: string; purpose: AreaPurpose } | null;
  to: { id: number; code: string; name: string; purpose: AreaPurpose } | null;
  quantity: number;
  /** Net change across its areas: + received, − issued or scrapped, 0 for a transfer. */
  change: number;
  notes: string | null;
}

export interface MovementDetail extends Movement { lines: MovementLine[] }

export interface ItemReservation {
  id: number;
  quantity: number;
  batch: { id: number; code: string; status: BatchStatus } | null;
  order: { id: number; code: string };
  lineNo: number;
  /** Material set aside for the work, or finished pieces earmarked for the line they sell. */
  kind?: 'material' | 'order';
}

export interface ItemStock {
  item: { id: number; code: string | null; name: string; uom: string; trackedBy: 'quantity' | 'batch' | 'individual'; stockable: boolean };
  totals: StockTotals & { reserved?: number; free?: number };
  rows: StockRow[];
  reservations?: ItemReservation[];
  movements: Movement[];
}

export interface AreaInventory { area: StockingArea; totals: StockTotals; rows: StockRow[]; movements: Movement[] }

// ---- Release and the production tracker (Phase 5) --------------------------------

/** recorded state + what the waits and material say: worked out on every read. */
export type StepStatus = 'not_ready' | 'ready' | 'in_progress' | 'on_hold' | 'done';
export type PieceStatus = 'not_ready' | 'ready' | 'in_progress' | 'on_hold' | 'complete';

export interface StepWait { origin: 'flow' | 'rule' | 'default'; met: boolean; text: string }
export interface StepBlocker { kind: 'wait' | 'material'; text: string }

export interface ProductionStep {
  id: number;
  sequence: number;
  operation: { id: number; code: string; name: string };
  stepName: string | null;
  label: string;
  quantity: number;
  qtyGood: number;
  qtyScrap: number;
  state: 'pending' | 'in_progress' | 'done' | 'on_hold';
  status: StepStatus;
  machine: { id: number; code: string; name: string } | null;
  startedAt: string | null;
  finishedAt: string | null;
  waits: StepWait[];
  blockers: StepBlocker[];
  requirementIds: number[];
}

export interface ProductionPiece {
  id: number;
  parentId: number | null;
  depth: number;
  label: string;
  code: string | null;
  item: { id: number; code: string | null; name: string; uom: string };
  pieceNo: number | null;
  quantity: number;
  flow: { id: number; code: string; name: string; revision: string | null };
  status: PieceStatus;
  steps: ProductionStep[];
}

export interface Requirement {
  id: number;
  item: { id: number; code: string | null; name: string; uom: string; trackedBy: 'quantity' | 'batch' | 'individual' };
  quantity: number;
  issued: number;
  reserved: number;
  usableReserved: number;
  short: number;
  covered: boolean;
  piece: { id: number; label: string } | null;
  step: { id: number; label: string; status: StepStatus } | null;
  reservations: { id: number; quantity: number; batch: { id: number; code: string; status: BatchStatus } | null }[];
  free: number;
}

export interface Release {
  id: number;
  order: { id: number; code: string; title: string | null; status: OrderStatus; type: OrderType };
  line: { id: number; lineNo: number; committedDate: string | null };
  item: { id: number; code: string | null; name: string; revision: string | null };
  quantity: number;
  releasedAt: string;
  releasedBy: string | null;
  status: 'not_started' | 'in_progress' | 'complete';
  progress: {
    steps: number; done: number; inProgress: number; ready: number; notReady: number; onHold: number;
    pieces: number; complete: number; materials: number; materialsCovered: number;
  };
  canUnrelease: boolean;
  /** Where the finished pieces are received and earmarked for this line. */
  finishedArea: { id: number; code: string; name: string } | null;
  /** quantity: the line's. made: finished into stock. delivered: shipped. readyToShip: in stock for this line and not yet shipped. */
  finished: { quantity: number; made: number; delivered: number; readyToShip: number };
  items: ProductionPiece[];
  requirements: Requirement[];
}

export interface ReleaseCheck {
  line: { id: number; lineNo: number; orderId: number; orderCode: string; quantity: number };
  ok: boolean;
  problems: string[];
  summary: { pieces: number; groups: number; steps: number; waits: number; requirements: number };
  materials: { item: { id: number; code: string | null; name: string; uom: string | null }; required: number; free: number; short: number }[];
  /** The obvious place for finished work, when exactly one area fits. */
  finishedArea: { id: number; code: string; name: string; purpose: AreaPurpose } | null;
  /** It could not settle on one — the dialog asks instead of blocking the release. */
  needsFinishedArea: boolean;
  finishedAreaProblem: string | null;
  /** What the picker offers, the fitting purpose first. */
  areas: { id: number; code: string; name: string; purpose: AreaPurpose }[];
}

/** A delivery against a sales order line: an ordinary stock issue, plus the line as it now stands. */
export interface Shipment { movement: Movement; release: Release }

export interface OrderProduction {
  releases: Release[];
  unreleased: { id: number; lineNo: number; quantity: number; item: { code: string | null; name: string | null } }[];
}

export interface TrackerStepRow extends ProductionStep {
  release: { id: number };
  order: Release['order'];
  line: Release['line'];
  piece: { id: number; label: string; itemCode: string | null; depth: number };
}

export interface TrackerMaterialRow extends Requirement {
  release: { id: number };
  order: Release['order'];
  line: Release['line'];
}

export interface StepEvent { id: number; event: 'start' | 'progress' | 'hold' | 'resume'; good: number; scrap: number; machine: { id: number; code: string } | null; note: string | null; at: string; by: string | null }

// ── Buying (Phase 6) ────────────────────────────────────────────────────────

export type PurchaseStatus = 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';

/** One item the released jobs are short of. */
export interface BuyRow {
  item: { id: number; code: string | null; name: string; uom: string; trackedBy: 'quantity' | 'batch' | 'individual' };
  /** Wanted by released work, less what has been issued to it. */
  wanted: number;
  reserved: number;
  free: number;
  onOrder: number;
  toBuy: number;
  orders: { id: number; code: string }[];
  purchaseOrders: { id: number; code: string; status: PurchaseStatus; outstanding: number }[];
}

export interface PurchaseLine {
  id: number;
  lineNo: number;
  item: { id: number; code: string | null; name: string; uom: string; trackedBy: 'quantity' | 'batch' | 'individual' };
  quantity: number;
  received: number;
  outstanding: number;
  expectedDate: string | null;
  note: string | null;
  receipts: { id: number; code: string; date: string; quantity: number }[];
}

export interface PurchaseOrderRow {
  id: number;
  code: string;
  status: PurchaseStatus;
  suggested: boolean;
  supplier: { id: number; code: string | null; name: string } | null;
  expectedDate: string | null;
  orderedAt: string | null;
  createdAt: string;
  totals: { lines: number; ordered: number; received: number; outstanding: number };
}

export interface PurchaseOrder extends PurchaseOrderRow {
  notes: string | null;
  lines: PurchaseLine[];
}

export interface SuggestResult {
  order: PurchaseOrder | null;
  lines: number;
  message: string | null;
}
