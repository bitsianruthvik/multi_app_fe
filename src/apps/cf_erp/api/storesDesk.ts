import { cfApi, qs } from './client';

/** The Stores desk (backend routes/storesDesk.js, init.sql §111): the ledger, give out, out with, counts. */
export interface DeskSettings {
  storesV2: boolean; countAutoLimit: number;
  /** §112: the stock book is closed up to this date; how far back an entry may be dated; the store's hours; days before a thing is out too long. */
  closedThrough: string | null; backdateDays: number; openTime: string; closeTime: string; toolsOutDays: number;
}
export interface Department { id: number; name: string }
export interface StorePerson { id: number; name: string; department: Department | null }
export interface StoreArea { id: number; code: string; name: string; purpose: string }
export interface LedgerGroup { familyId: number; family: string; subfamilyId: number; subfamily: string; items: number }

export interface LedgerRow {
  item: { id: number; code: string | null; name: string; uom: string; trackedBy: string; returnable: boolean; status: string; issueConditions?: string | null };
  group: { familyId: number | null; family: string | null; subfamilyId: number | null; subfamily: string | null };
  opening: number; in: number; out: number; balance: number; now: number;
  outWith: number; onOrder: number; reserved: number;
  min: number | null; max: number | null; method: string | null; low: boolean;
}
export interface LedgerPage {
  rows: LedgerRow[]; total: number; hasMore?: boolean;
  period: { from: string; to: string }; areas: StoreArea[]; groups: LedgerGroup[];
}
export type GivenLabel = { type: 'order' | 'department' | 'vendor' | 'general' | 'supplier'; label: string } | null;
export interface LedgerEvent {
  id: number; movementId: number; code: string | null; type: string; date: string; change: number; area: string; store: boolean; lot: string | null;
  reference: string | null; reason: string | null; given: GivenLabel; person: string | null; machine: string | null;
  returnIn: boolean; reversed: boolean; reversal: boolean; by: string | null;
}
export interface Custody {
  id: number; item: { id: number; code: string | null; name: string; uom: string };
  quantity: number; returned: number; worn: number; lost: number; left: number;
  holderType: 'person' | 'department' | 'vendor'; holder: string | null; department: string | null; order: string | null; machine: string | null;
  issuedOn: string; dueOn: string | null; overdueDays: number; daysOut: number; movementId: number; movementCode: string | null; status: 'open' | 'closed';
}
export interface ItemLedger {
  item: { id: number; code: string | null; name: string; uom: string; trackedBy: string; returnable: boolean; dueDays: number | null; method: string | null; min: number | null; max: number | null };
  period: { from: string; to: string };
  areas: { id: number; code: string; name: string; purpose: string; quantity: number; store: boolean }[];
  lots: { id: number; code: string; status: string; supplierRef: string | null; area: { id: number; name: string }; quantity: number }[];
  events: LedgerEvent[];
  outWith: Custody[];
  onOrder: { id: number; code: string | null; status: string; supplier: string | null; expected: string | null; quantity: number }[];
}
export type GivenType = 'order' | 'department' | 'vendor';
export interface GiveOutBody {
  givenFor: { type: GivenType; orderId?: number; orderLineId?: number; departmentId?: number; partyId?: number };
  personId?: number | null; machineId?: number | null; notes?: string | null;
  lines: { itemId: number; quantity: number; areaId?: number; batchId?: number; conditionsChecked?: boolean }[];
}
export interface OutWithList { rows: Custody[]; counts: { person: number; department: number; vendor: number; overdue: number; all: number; d30: number; d90: number; over: number }; longDays: number; /** Where the age bands end, in days (settings). */ bands?: [number, number] }
export interface CountLine { item: { id: number; code: string | null; name: string; uom: string }; lot: { id: number; code: string } | null; book: number }
export interface CountList { area: StoreArea; areas: StoreArea[]; kind: 'daily' | 'weekly'; since: string; lines: CountLine[]; lastCount: string | null }
export interface StockCount {
  id: number; code: string; kind: string; area: { id: number; name: string }; date: string; status: 'matched' | 'posted' | 'pending' | 'rejected';
  lines: number; differences: number; value: number | null; note: string | null; movementId: number | null; approvalId: number | null; by: string | null;
}
export interface StockCountDetail extends Omit<StockCount, 'lines'> {
  lines: { item: CountLine['item']; lot: CountLine['lot']; book: number; counted: number; diff: number; reason: string | null; value: number | null }[];
}

export const getDeskSettings = () => cfApi.get<DeskSettings>('/stores-desk/settings');
export const getDepartments = () => cfApi.get<Department[]>('/stores-desk/departments');
export const addDepartment = (name: string) => cfApi.post<Department>('/stores-desk/departments', { name });
export const searchPeople = (search: string) => cfApi.get<StorePerson[]>(`/stores-desk/people${qs({ search: search || undefined })}`);
export const addPerson = (name: string, departmentId?: number | null) => cfApi.post<{ id: number; name: string }>('/stores-desk/people', { name, departmentId });
export const getItemLedger = (itemId: number, p: { from?: string; to?: string }) => cfApi.get<ItemLedger>(`/stores-desk/ledger/${itemId}${qs(p)}`);
export const giveOut = (body: GiveOutBody) => cfApi.post<{ movement: { id: number; code: string | null }; outWith: number }>('/stores-desk/give-out', body);
export const getOutWith = (p: { holder?: string; overdue?: number; age?: string; search?: string; status?: string }) => cfApi.get<OutWithList>(`/stores-desk/out-with${qs(p)}`);
export const custodyBack = (id: number, body: { kind: 'returned' | 'worn' | 'lost'; quantity?: number; note?: string }) => cfApi.post<Custody>(`/stores-desk/out-with/${id}/back`, body);
export const getCountList = (p: { areaId?: number; kind?: string; subfamilyId?: number }) => cfApi.get<CountList>(`/stores-desk/count-list${qs(p)}`);
export const getCounts = () => cfApi.get<StockCount[]>('/stores-desk/counts');
export const postCount = (body: { areaId: number; kind: string; note?: string; lines: { itemId: number; lotId?: number | null; counted: number; reason?: string }[] }) =>
  cfApi.post<StockCountDetail>('/stores-desk/counts', body);

// ---- §112: Today ---------------------------------------------------------------
export interface LevelSuggestion {
  item: { id: number; code: string | null; name: string; uom: string };
  kind: 'new' | 'raise' | 'lower' | 'unused';
  weeks: number; usedWeeks: number; weeklyAvg: number; leadDays: number; leadAssumed: boolean; pattern?: string;
  current: { min: number | null; max: number | null }; suggested: { min: number; max: number }; why: string;
}
export interface LevelSuggestions {
  gate: { weeks: number; usedWeeks: number; window: number };
  summary: { suggestions: number; itemsWithUse: number; waiting: number; longestHistoryWeeks: number; weeksToFirst: number | null };
  rows: LevelSuggestion[];
}
export interface TodayPo { id: number; code: string | null; supplier: string | null; expected: string; lines: number; items: string[]; daysLate: number; dueIn: number }
export interface AfterHoursEntry { id: number; code: string | null; type: string; at: string; by: string | null; given: GivenLabel; person: string | null; item: string | null; lines: number }
export interface StoresToday {
  date: string; settings: DeskSettings;
  purchaseOrders: { late: number; dueSoon: number; followDays?: number; rows: TodayPo[] };
  afterHours: { entries: AfterHoursEntry[]; lastCheckedAt: string | null; hours: { open: string; close: string } };
  count: { toCount: number; countedToday: boolean; dailyDue: boolean; weeklyDone: boolean; pending: number; rejected: number; lastCount: string | null };
  outTooLong: { count: number; longDays: number; rows: Custody[] };
  belowMinimum: { count: number; lowAll: number; rows: { item: LedgerRow['item']; balance: number; min: number | null }[] };
  levels: LevelSuggestions;
}
export const getToday = () => cfApi.get<StoresToday>('/stores-desk/today');
export const nightCheck = (note?: string) => cfApi.post<{ checked: number }>('/stores-desk/night-check', note ? { note } : {});
export const applyLevel = (itemId: number, body: { min: number; max: number }) => cfApi.post<{ itemId: number }>(`/stores-desk/level-suggestions/${itemId}/apply`, body);
export const putDeskSettings = (body: Partial<Pick<DeskSettings, 'closedThrough' | 'backdateDays' | 'openTime' | 'closeTime' | 'toolsOutDays' | 'countAutoLimit'>>) => cfApi.put<DeskSettings>('/stores-desk/settings', body);

/** 12 → "12", 1.5 → "1.5", 0.184019 → "0.184": a quantity as a storekeeper writes it. */
export const qtyText = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 }));
