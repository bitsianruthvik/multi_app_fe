import { cfApi, qs } from './client';

/** Tools, spares and consumables as stock items; a machine's resource list (backend init.sql §81). */
export type ResourceKind = 'tool' | 'spare' | 'consumable';
export type LifeUnit = 'uses' | 'hours' | 'metres';

/** A catalog item offered by the resource picker. */
export interface ResourceItem { id: number; code: string; name: string; uom: string; kind: ResourceKind | null; lifeUnit: LifeUnit | null; lifeLimit: number | null }

/** One row of a machine's list, as GET /machines/:id/resources answers. */
export interface MachineResource {
  id: number; machineId: number; itemId: number; code: string; name: string; kind: ResourceKind; qty: number; uom: string;
  notes: string | null; itemKind: ResourceKind | null; lifeUnit: LifeUnit | null; lifeLimit: number | null;
}

export type ToolStatus = 'in_use' | 'worn_out' | 'retired' | 'void';

/** One tool piece issued from stock. */
export interface ToolPiece {
  id: number; itemId: number; itemCode: string | null; itemName: string | null; uom: string | null; movementCode: string | null; unitNo: number;
  issuedOn: string | null; orderId: number | null; orderCode: string | null; usedFor: 'order' | 'general'; machineId: number | null; machineCode: string | null;
  lifeUnit: LifeUnit; lifeLimit: number | null; lifeUsed: number; remaining: number | null; percentUsed: number | null; status: ToolStatus; notes: string | null;
}

/** A catalog tool with its life setting. */
export interface ToolItem { id: number; code: string; name: string; uom: string; lifeUnit: LifeUnit | null; lifeLimit: number | null; inUse: number; wornOut: number }

export const searchResourceItems = (term: string, opts: { kind?: ResourceKind; all?: boolean } = {}) =>
  cfApi.get<ResourceItem[]>(`/resource-items${qs({ search: term, kind: opts.kind, all: opts.all ? 1 : undefined, limit: 30 })}`);

export const getMachineResources = (machineId: number) => cfApi.get<MachineResource[]>(`/machines/${machineId}/resources`);

export const saveMachineResources = (machineId: number, rows: { itemId: number; kind: ResourceKind; qty: number; notes: string | null }[]) =>
  cfApi.put<MachineResource[]>(`/machines/${machineId}/resources`, { rows });

export const listToolPieces = (status: string, search: string) => cfApi.get<ToolPiece[]>(`/tools/life${qs({ status, search: search || undefined })}`);
export const listToolItems = (search: string) => cfApi.get<ToolItem[]>(`/tools/items${qs({ search: search || undefined })}`);
export const recordToolUse = (id: number, amount: number) => cfApi.post<ToolPiece>(`/tools/life/${id}/use`, { amount });
export const retireToolPiece = (id: number) => cfApi.post<ToolPiece>(`/tools/life/${id}/retire`, {});
export const setToolItemLife = (itemId: number, lifeUnit: LifeUnit | null, lifeLimit: number | null) => cfApi.put(`/items/${itemId}/tool-life`, { lifeUnit, lifeLimit });
