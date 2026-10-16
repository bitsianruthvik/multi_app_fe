import { cfApi, qs } from './client';
import type { AreaPurpose, BatchStatus } from './types';

/**
 * Inventory v2 — the Stock screen (backend routes/inventory.js, §67):
 * GET /stock/view groups stock by item × area × owner × what it counts as,
 * ordered by tracking mode; lots and pieces open from a row.
 */

export type ViewCategory = 'available' | 'in_process' | 'finished' | 'held' | 'rejected' | 'dispatch' | 'scrap' | 'offcut';
export type Tracking = 'quantity' | 'batch' | 'individual';
export type ItemKind = 'standard' | 'custom';
export interface PartyRef { id: number; code: string | null; name: string | null }
export interface AreaRef { id: number; code: string; name: string; purpose: AreaPurpose }

export interface StockViewRow {
  key: string;
  item: { id: number; code: string | null; name: string; uom: string; trackedBy: Tracking; kind: ItemKind; classificationId: number | null };
  area: AreaRef;
  /** null = ours. */
  owner: PartyRef | null;
  category: ViewCategory;
  quantity: number;
  kg: number | null;
  lines: number;
  lots: number;
  open: 'lots' | 'pieces' | null;
  unitCost: number | null;
  /** Ours only; null on a customer's row. */
  value: number | null;
  uncostedQty: number;
  /** A customer's row only. */
  referenceValue: number | null;
  scrap: null | { ratePerKg: number | null; note: string | null };
  updatedAt: string;
}

export interface StockViewCounts {
  categories: Record<ViewCategory | 'all', number>;
  owners: { ours: number; parties: (PartyRef & { n: number })[] };
  kinds: { standard: number; custom: number; all: number };
  tracking: { quantity: number; batch: number; individual: number; all: number };
}

export interface CustomerTotal {
  party: PartyRef;
  kg: number | null;
  unweighedItems: number;
  lines: number;
  quantities: { uom: string; quantity: number }[];
  referenceValue: number | null;
  uncostedQty: number;
}

export interface StockViewTotals {
  currency: string;
  ours: { value: number | null; uncostedQty: number; kg: number | null; unweighedItems: number; lines: number; scrapKg: number };
  customers: CustomerTotal[];
}

export interface ScrapRate { ratePerKg: number | null; currency: string; note: string | null }

export interface StockViewAnswer {
  rows: StockViewRow[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  counts: StockViewCounts;
  totals: StockViewTotals;
  scrapRate: ScrapRate;
}

export interface StockViewParams {
  search?: string; areaId?: number | null; category?: string; owner?: string; kind?: string; classificationId?: number | null; tracking?: string;
  sort?: string; dir?: 'asc' | 'desc'; limit?: number; offset?: number;
}

export const getStockView = (p: StockViewParams) => cfApi.get<StockViewAnswer>(`/stock/view${qs({ ...p })}`);

export interface StockLot {
  batch: { id: number; code: string; status: BatchStatus };
  quantity: number;
  kg: number | null;
  unitCost: number | null;
  value: number | null;
  referenceValue: number | null;
  owner: PartyRef | null;
  ownerOrder: { id: number; code: string | null } | null;
  piece: null | { productionItemId: number; code: string | null };
  offcut: null | { id: number; offcutNo: string };
  receivedOn: string | null;
  updatedAt: string;
}

/** The owner a lots / pieces call is asked for: 'ours' for our row, else the customer's id. */
export const ownerParam = (owner: PartyRef | null) => (owner ? String(owner.id) : 'ours');

export const getStockLots = (row: Pick<StockViewRow, 'item' | 'area' | 'owner' | 'category'>) =>
  cfApi.get<StockLot[]>(`/stock/view/lots${qs({ itemId: row.item.id, areaId: row.area.id, owner: ownerParam(row.owner), category: row.category })}`);

export type UnitStatus = 'in_process' | 'finished' | 'joined' | 'split' | 'dispatched' | 'scrapped' | 'returned' | 'undone';

export interface StockUnit {
  id: number;
  code: string;
  pieceCode: string | null;
  serial: number | null;
  status: UnitStatus;
  item: { id: number; code: string | null; name: string };
  batch: { id: number; code: string } | null;
  area: AreaRef | null;
  owner: PartyRef | null;
  parent: { id: number; code: string | null } | null;
  replaces: { id: number; code: string | null } | null;
  order: { id: number; code: string | null; lineNo: number | null } | null;
  productionItemId: number | null;
  updatedAt: string;
}

export interface UnitsAnswer { rows: StockUnit[]; total: number; hasMore?: boolean; counts?: { status: Record<string, number> } }

export const listUnits = (p: { itemId: number; areaId?: number | null; owner?: string; status?: string; search?: string; limit?: number; offset?: number }) =>
  cfApi.get<UnitsAnswer>(`/stock/units${qs({ paged: 1, ...p })}`);

export interface UnitEvent {
  id: number;
  event: string;
  words: string;
  at: string;
  movement: null | { id: number; code: string; type: string; date: string | null; reference: string | null };
  from: { id: number; code: string | null } | null;
  to: { id: number; code: string | null } | null;
  parent: { id: number; code: string | null } | null;
  note: string | null;
}

export interface UnitDetail { unit: StockUnit; history: UnitEvent[]; inside: StockUnit[]; madeAgainAs: StockUnit[] }

export const getUnit = (id: number) => cfApi.get<UnitDetail>(`/stock/units/${id}`);

export const getScrapRate = () => cfApi.get<ScrapRate>('/stock/scrap-rate');
export const saveScrapRate = (ratePerKg: number | null) => cfApi.put<ScrapRate>('/stock/scrap-rate', { ratePerKg });

export interface LedgerCheck {
  ok: boolean;
  checked: number;
  differences: { areaId: number; itemId: number; batchId: number | null; ledger: number; balance: number }[];
  units?: { ok: boolean; liveUnits: number; differences: { batchId: number; areaId: number; balance: number; units: number }[] };
}

export const checkLedger = () => cfApi.get<LedgerCheck>('/stock/check');
