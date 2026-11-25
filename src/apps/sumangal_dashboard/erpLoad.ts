import { createContext, useContext } from 'react';
import { apiFetch } from '@core/api/client';

/** The dashboard's data loading and shared state (erpData.tsx has the provider and the top-bar status). */
export type Payload = { D: unknown; S: unknown; H: unknown };
export type Meta = { loadedAt?: string; end?: string; source?: string } | null;
export type Runs = {
  data: Meta;
  agents: { id: number; status: string; idle_seconds: number | null; last_ok: number | null; last_message: string | null }[];
  job: { id: number; status: string; ok: number | null } | null;
};
export const company = () => window.location.pathname.split('/').filter(Boolean)[0] ?? '';
export const base = () => `/api/${company()}/sumangal_dashboard`;
let cached: Promise<Payload> | null = null;
export function loadData(): Promise<Payload> {
  if (!cached) {
    cached = apiFetch<Payload>(`${base()}/v15/data`, { method: 'GET', timeout: 180000 }).catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}

/** Forget the loaded data, so the next loadData() fetches it again. */
export function resetData() { cached = null; }

export type Ctx = { reload: number; shown: Meta; runs: Runs | null; asking: '' | 'waiting' | 'failed'; refresh: () => void; showNewer: () => void };
export const DataCtx = createContext<Ctx | null>(null);
export const useErpData = () => useContext(DataCtx);
