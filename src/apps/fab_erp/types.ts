/**
 * fab_erp TypeScript types
 * Auto-generated from fab_erp backend schema (init.sql)
 * Each interface corresponds to a table with camelCase field names
 */

/**
 * Base interface for all fab_erp tables
 * Includes standard audit columns returned by the generic query API
 */
export interface FabBase {
  id: number;
  companyId: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * fab_plants: Master data for manufacturing plants
 */
export interface FabPlant extends FabBase {
  name: string;
  code: string;
}

/**
 * fab_resource_types: Resource type definitions (machines, labor, etc.)
 */
export interface FabResourceType extends FabBase {
  plantId: number | null;
  name: string;
  code: string;
  category: string | null;
  // SAP-standard capacity / scheduling / costing defaults
  capacityHrsPerDay?: number | null;
  numUnits?:          number | null;
  utilizationPct?:    number | null;
  efficiencyPct?:     number | null;
  overloadPct?:       number | null;
  setupTimeHrs?:      number | null;
  teardownTimeHrs?:   number | null;
  queueTimeHrs?:      number | null;
  moveTimeHrs?:       number | null;
  schedulingBasis?:   string | null;
  costPerHour?:       number | null;
  currency?:          string | null;
  // joined
  plantName?: string;
  plantCode?: string;
}

/**
 * fab_resource_type_metrics: Metrics associated with resource types
 */
export interface FabResourceTypeMetric extends FabBase {
  resourceTypeId: number;
  metricKey: string;
  metricLabel: string;
  dataType: string;
  unit: string | null;
}

/**
 * fab_resources: Specific resource instances (Machine A, Operator 1, etc.)
 */
export interface FabResource extends FabBase {
  plantId: number | null;
  stockLocationId: number | null;
  shiftCalendarId: number | null;
  resourceTypeId: number;
  name: string;
  code: string;
  // Resource-level overrides (null = inherit from resource type)
  capacityHrsPerDay?: number | null;
  numUnits?:          number | null;
  utilizationPct?:    number | null;
  efficiencyPct?:     number | null;
  overloadPct?:       number | null;
  setupTimeHrs?:      number | null;
  teardownTimeHrs?:   number | null;
  queueTimeHrs?:      number | null;
  moveTimeHrs?:       number | null;
  schedulingBasis?:   string | null;
  costPerHour?:       number | null;
  currency?:          string | null;
}

/**
 * fab_resource_custom_fields: Custom fields attached to resource types or resources
 */
export interface FabResourceCustomField extends FabBase {
  level:      'resource_type' | 'resource';
  levelId:    number;
  fieldKey:   string;
  fieldLabel: string;
  fieldType:  'text' | 'number' | 'date' | 'dropdown';
  fieldValue: string | null;
  sortOrder:  number;
}

/**
 * fab_item_metric_defs: Definitions of metrics that can be measured on items
 */
export interface FabItemMetricDef extends FabBase {
  metricKey: string;
  metricLabel: string;
  dataType: string;
  unit: string | null;
}

/**
 * fab_constants: Constant values used in formulas (conversion factors, etc.)
 */
export interface FabConstant extends FabBase {
  constKey: string;
  constValue: number;
  label: string | null;
}

/**
 * fab_process_master: Simple editable reference list of manufacturing operations
 */
export interface FabProcessMaster extends FabBase {
  name:        string;
  code:        string;
  description: string | null;
}

/**
 * fab_resource_type_properties: machine.* variable definitions per resource type
 * These supply the autocomplete options for formula variables in the FormulaCodeEditor.
 */
export interface FabResourceTypeProperty {
  id:             number;
  resourceTypeId: number;
  propertyKey:    string;
  propertyLabel:  string;
  unit:           string | null;
  defaultValue:   number | null;
  createdAt:      string;
  updatedAt:      string;
  deletedAt?:     string | null;
  // joined fields
  resourceTypeName?: string;
  resourceTypeCode?: string;
}

/**
 * A single known variable for the FormulaCodeEditor autocomplete.
 * key is dot-notation: "machine.speed", "item.length", "step.num_holes"
 */
export interface FormulaVariable {
  key:   string;
  label: string;
  unit:  string | null;
}

/**
 * Complete set of known formula variables grouped by namespace.
 * Returned by GET /api/:company/fab_erp/formula/variables
 */
export interface FormulaVariables {
  machine: FormulaVariable[];
  item:    FormulaVariable[];
}

/**
 * fab_process_templates: Versioned process (sequence of steps) templates
 */
export interface FabProcessTemplate extends FabBase {
  plantId: number | null;
  name: string;
  code: string;
  versionGroupId: number | null;
  versionNo: number;
  isCurrentVersion: number; // 0 | 1
  approvalStatus: 'draft' | 'pending' | 'approved';
}

/**
 * fab_process_template_steps: Individual steps within a process template
 */
export interface FabProcessTemplateStep extends FabBase {
  processTemplateId:      number;
  seqNo:                  number;
  name:                   string;
  resourceTypeId:         number | null;
  processMasterId:        number | null;
  allowedResourceTypeIds: number[] | null;  // stored as JSON in DB, parsed on read
  formula:                string | null;
  standardValues:         Record<string, number> | null;  // JSON in DB
  subTemplateId:          number | null;
  // joined fields (optional, present when relations are loaded)
  processTemplateName?:   string;
  processTemplateCode?:   string;
  resourceTypeName?:      string;
  processMasterName?:     string;
  processMasterCode?:     string;
}

/**
 * fab_operations: Operation definitions for manufacturing steps
 */
export interface FabOperation {
  id: number;
  companyId: number;
  name: string;
  code: string;
  defaultResourceTypeId: number | null;
  timeFormula: string | null;
  timeUnit: 'min' | 'hr' | 'sec';
  active: number;
  createdAt: string;
  updatedAt: string;
  defaultResourceTypeName?: string;
}

/**
 * fab_operation_variables: Variables for operations
 */
export interface FabOperationVariable {
  id: number;
  companyId: number;
  operationId: number;
  varKey: string;
  label: string;
  unit: string | null;
  defaultValue: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * fab_operation_resource_types: Join table for operation → resource type mappings
 */
export interface FabOperationResourceType {
  id: number;
  companyId: number;
  operationId: number;
  resourceTypeId: number;
  createdAt: string;
  updatedAt: string;
  resourceTypeName?: string;
  resourceTypeCode?: string;
  operationName?: string;
}

/**
 * fab_operation_flows: Flow definitions (sequences of operations)
 */
export interface FabOperationFlow {
  id: number;
  companyId: number;
  name: string;
  code: string;
  description: string | null;
  active: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * fab_operation_flow_steps: Steps within an operation flow
 */
export interface FabOperationFlowStep {
  id: number;
  companyId: number;
  flowId: number;
  operationId: number;
  seqNo: number;
  dependsOn: string | null;
  resourceTypeId: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  operationName?: string;
  operationCode?: string;
  resourceTypeName?: string;
}

/**
 * fab_orders: Unified order header (sales, manufacturing, purchase, planned, etc.)
 */
export interface FabOrder extends FabBase {
  orderNumber:          string;
  orderType:            'sales' | 'manufacturing' | 'purchase' | 'planned' | 'subcontract' | 'transfer';
  type?:                string | null;
  status:               string;
  plantId?:             number | null;
  catalogItemId?:       number | null;
  qty?:                 number | null;
  unit?:                string | null;
  requiredDate?:        string | null;
  confirmedDate?:       string | null;
  scheduledStart?:      string | null;
  scheduledEnd?:        string | null;
  scheduledShipDate?:   string | null;
  parentOrderId?:       number | null;
  sourceOrderId?:       number | null;
  sourceOrderLineId?:   number | null;
  bomId?:               number | null;
  routingPlanId?:       number | null;
  customerName?:        string | null;
  customerPoRef?:       string | null;
  deliveryAddress?:     string | null;
  paymentTerms?:        string | null;
  currency?:            string | null;
  supplierId?:          number | null;
  supplierRef?:         string | null;
  priority?:            string | null;
  mrpController?:       string | null;
  notes?:               string | null;
  createdBy?:           number | null;
  plantName?:           string;
  plantCode?:           string;
}

/**
 * fab_order_lines: Line items on any order (SO lines, MO components, PO lines, etc.)
 */
export interface FabOrderLine extends FabBase {
  orderId:          number;
  lineNo:           number;
  catalogItemId:    number;
  qty:              number;
  unit?:            string | null;
  unitPrice?:       number | null;
  discount?:        number | null;
  targetPlantId?:   number | null;
  requestedDate?:   string | null;
  bomId?:           number | null;
  routingPlanId?:   number | null;
  status?:          string | null;
  qtyCompleted?:    number | null;
  scheduledStart?:  string | null;
  scheduledEnd?:    string | null;
  notes?:           string | null;
  catalogItemName?: string;
  catalogItemCode?: string;
  catalogItemUnit?: string;
  targetPlantName?: string;
}

export interface FabMaterialBomItem extends FabBase {
  catalogItemId:    number;
  refCatalogItemId: number | null;
  name:             string;
  qty:              number;
  unit:             string | null;
  bomId:            number | null;
  itemCategory:     'component' | 'co_product' | 'by_product';
  refItemName?:     string;
  refItemCode?:     string;
  refItemUnit?:     string;
}

export interface FabItemConfigValue extends FabBase {
  catalogItemId: number;
  fieldKey:      string;
  fieldValue:    string | null;
  sortOrder:     number;
}

export interface FabCustomField extends FabBase {
  level:      'category' | 'group' | 'subgroup' | 'item' | 'stock_piece';
  levelId:    number;
  fieldKey:   string;
  fieldType:  'text' | 'number' | 'date' | 'dropdown';
  fieldValue: string | null;
  sortOrder:  number;
}

export interface FabMaterialBom extends FabBase {
  catalogItemId: number;
  name:          string;
  description:   string | null;
  isDefault:     number; // 0 | 1
  baseQty:       number;
  baseUnit:      string | null;
}

/**
 * fab_supplier_items: Vendor-specific lead time, cost, MOQ per catalog item
 */
export interface FabSupplierItem extends FabBase {
  supplierId:       number;
  catalogItemId:    number;
  leadTimeDays?:    number | null;
  unitCost?:        number | null;
  currency?:        string | null;
  minOrderQty?:     number | null;
  isPreferred:      number; // 0 | 1
  notes?:           string | null;
  supplierName?:    string;
  supplierCode?:    string;
  catalogItemName?: string;
  catalogItemCode?: string;
  catalogItemUnit?: string;
}

/**
 * fab_item_catalog: Company-level parts library — reusable items across projects
 */
export interface FabItemCatalog extends FabBase {
  name:          string;
  code:          string;
  unit:          string | null;
  description:   string | null;
  categoryId?:   number | null;
  groupId?:      number | null;
  subgroupId?:   number | null;
  // Basic Data — classification
  hsnCode?:      string | null;
  // joined taxonomy names
  categoryName?: string;
  groupName?:    string;
  subgroupName?: string;
  procurementType?:  string | null;
  leadTimeDays?:     number | null;
  mrpPolicy:         'manual' | 'reorder_point' | 'lot_for_lot';
  // Effective Category defaults, joined in for convenience.
  categoryBatchRequired?:  number | null;
  categorySerialRequired?: number | null;
  categoryHeatRequired?:   number | null;
  categoryMarkRequired?:   number | null;
}

/**
 * fab_items: Items (products, subassemblies) within a project BOM
 * Can be nested via parent_item_id; optionally links to catalog item
 */
export interface FabItem extends FabBase {
  projectId:       number;
  parentItemId:    number | null;
  catalogItemId:   number | null;
  name:            string;
  unit:            string | null;
  qty:             number;
  // joined fields (optional)
  projectName?:    string;
  projectCode?:    string;
  catalogItemCode?: string;
  catalogItemUnit?: string;
}

/**
 * fab_item_metric_values: Measured or calculated metric values for items
 */
export interface FabItemMetricValue extends FabBase {
  itemId: number;
  metricKey: string;
  metricValue: number | null;
}

/**
 * fab_shift_calendars: Shift calendar definitions
 */
export interface FabShiftCalendar extends FabBase {
  plantId: number | null;
  name: string;
  code: string;
}

/**
 * fab_shifts: Shift definitions within a shift calendar
 */
export interface FabShift extends FabBase {
  calendarId: number;
  name: string;
  startTime: string;
  endTime: string;
  workingMinutes: number;
}

/**
 * fab_calendar_days: Calendar days (working/non-working) for shift calendars
 */
export interface FabCalendarDay extends FabBase {
  calendarId: number;
  dayDate: string;
  isWorking: number; // 0 | 1
}

/**
 * fab_item_categories: Top-level categories for catalog items
 */
export interface FabItemCategory extends FabBase {
  name: string;
  code: string;
  description: string | null;
  shortform: string | null;
  isSystem: number; // 0 | 1
  // Traceability requirements ("Item Type" level) — items inherit these,
  // overridable per item. 0 | 1.
  batchRequired: number;
  serialRequired: number;
  heatRequired: number;
  markRequired: number;
}

/**
 * fab_item_groups: Mid-level groups for catalog items (within categories)
 */
export interface FabItemGroup extends FabBase {
  categoryId: number;
  name: string;
  code: string;
  description: string | null;
  shortform: string | null;
  isSystem: number;
  categoryName?: string;
}

/**
 * fab_item_subgroups: Leaf-level subgroups for catalog items (within groups)
 */
export interface FabItemSubgroup extends FabBase {
  groupId: number;
  name: string;
  code: string;
  description: string | null;
  shortform: string | null;
  isSystem: number;
  groupName?: string;
}

/**
 * fab_stock_locations: Storage/warehouse locations within plants
 */
export interface FabStockLocation extends FabBase {
  plantId: number;
  name: string;
  code: string;
  description: string | null;
  plantName?: string;
  plantCode?: string;
}

/**
 * fab_suppliers: Supplier/vendor master data
 */
export interface FabSupplier extends FabBase {
  name: string;
  code: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

/**
 * fab_customers: Customer master data
 */
export interface FabCustomer extends FabBase {
  name: string;
  code: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

export type CodegenSegment =
  | { type: 'fixed'; value: string }
  | { type: 'free_text'; value: string }
  | { type: 'date'; format: 'YYYY' | 'YY' | 'MM' | 'DD' | 'YYMM' | 'YYYYMM' | 'YYYYMMDD' }
  | { type: 'category_shortform'; length: number }
  | { type: 'group_shortform'; length: number }
  | { type: 'subgroup_shortform'; length: number }
  | { type: 'sequence'; digits: number; resetPeriod: 'never' | 'yearly' | 'monthly' };

export interface FabCodegenRule {
  segments: CodegenSegment[];
  nextSeq: number;
  seqPeriodKey: string | null;
  isDefault: boolean;
}

/**
 * fab_stock_policies: Min/reorder qty levels per item/plant/location
 */
export interface FabStockPolicy extends FabBase {
  catalogItemId: number;
  plantId: number;
  stockLocationId: number;
  minQty: number;
  reorderQty: number;
  catalogItemName?: string;
  plantName?: string;
  stockLocationName?: string;
}

/**
 * fab_grn: Goods Receipt Notes (inbound purchases)
 */
export interface FabGrn extends FabBase {
  grnNumber: string;
  grnDate: string;
  plantId: number;
  stockLocationId: number;
  supplierId: number | null;
  supplierRef: string | null;
  notes: string | null;
  status: string;
  plantName?: string;
  stockLocationName?: string;
  supplierName?: string;
}

/**
 * fab_grn_lines: Line items within a GRN
 */
export interface FabGrnLine extends FabBase {
  grnId: number;
  catalogItemId: number;
  batchId: number | null;
  batchCode: string | null;
  batchNo: string | null;
  serialNo: string | null;
  heatNo: string | null;
  markNo: string | null;
  qty: number;
  unitCost: number | null;
  catalogItemName?: string;
  catalogItemCode?: string;
  unit?: string;
}

// ─── Routing Plans ───────────────────────────────────────────────────────────

export interface FabRoutingPlan extends FabBase {
  bomId:           number;
  name:            string;
  versionNo:       number;
  versionGroupId:  number | null;
  isCurrent:       number;
  status:          'draft' | 'released' | 'superseded' | 'archived';
  releasedBy:      number | null;
  releasedAt:      string | null;
  notes:           string | null;
  // joined
  bomName?:         string;
  catalogItemId?:   number;
  catalogItemName?: string;
  catalogItemCode?: string;
  stepCount?:       number;
}

export interface FabRoutingOpStep extends FabBase {
  routingPlanId:  number;
  name:           string;
  description:    string | null;
  resourceTypeId: number | null;
  seqNo:          number;
  xPos:           number;
  yPos:           number;
  isOptional:     number;
  notes:          string | null;
  resourceTypeName?: string;
  resourceTypeCode?: string;
}

export interface FabRoutingOpDep extends FabBase {
  routingPlanId: number;
  fromStepId:    number;
  toStepId:      number;
  lagMinutes:    number | null;
  notes:         string | null;
}

export interface FabRoutingOpInput extends FabBase {
  stepId:         number;
  sourceType:     'bom_item' | 'op_output';
  bomItemId:      number | null;
  sourceStepId:   number | null;
  label:          string | null;
  qty:            number | null;
  uom:            string | null;
  notes:          string | null;
  bomItemName?:   string;
}

export interface FabRoutingOpOutput extends FabBase {
  stepId:     number;
  name:       string;
  outputType: 'wip' | 'final' | 'scrap';
  qtyFormula: string | null;
  uom:        string | null;
  notes:      string | null;
}

export interface FabRoutingOpFormula extends FabBase {
  stepId:      number;
  formulaType: 'setup_time' | 'machine_time' | 'people_time' | 'wait_time' | 'move_time';
  expression:  string;
  outputUnit:  string | null;
  isValid:     number;
}

export interface FormulaVar {
  key:   string;
  label: string;
  unit?: string | null;
}

/**
 * fab_stock_ledger: Read-only audit trail of all stock movements
 */
export interface FabStockLedger extends FabBase {
  catalogItemId: number;
  plantId: number;
  stockLocationId: number;
  batchId: number;
  pieceId: number | null;
  batchCode: string | null;
  batchNo: string | null;
  serialNo: string | null;
  heatNo: string | null;
  markNo: string | null;
  txnType: string;
  qty: number;
  unitCost: number | null;
  supplierId: number | null;
  grnId: number | null;
  grnLineId: number | null;
  txnDate: string;
  notes: string | null;
  catalogItemName?: string;
  catalogItemCode?: string;
  unit?: string;
  plantName?: string;
  stockLocationName?: string;
  supplierName?: string;
}
