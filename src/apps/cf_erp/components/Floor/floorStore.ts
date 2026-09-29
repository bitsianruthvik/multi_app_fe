/**
 * What a shared tablet remembers between visits: its machine (until someone
 * changes it) and who is using it (8 hours, or until "Not you?"). Storage can be
 * blocked or full on a shared device, so every read and write is guarded and the
 * screens work without it.
 */
export const OPERATOR_HOURS = 8;

interface StoredOperator { id: number; name: string; at: number }

const key = (company: string, what: string) => `cf_floor:${company}:${what}`;
const read = (k: string): string | null => { try { return window.localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => {
  try { if (v === null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch { /* the tablet just forgets */ }
};

export function loadMachineId(company: string): number | null {
  const n = Number(read(key(company, 'machine')));
  return Number.isFinite(n) && n > 0 ? n : null;
}
export const saveMachineId = (company: string, id: number | null) => write(key(company, 'machine'), id === null ? null : String(id));

export function loadOperator(company: string, now = Date.now()): { id: number; name: string } | null {
  try {
    const o = JSON.parse(read(key(company, 'operator')) ?? 'null') as StoredOperator | null;
    if (!o || typeof o.id !== 'number' || now - o.at > OPERATOR_HOURS * 3600_000) return null;
    return { id: o.id, name: o.name };
  } catch { return null; }
}
export const saveOperator = (company: string, o: { id: number; name: string } | null, now = Date.now()) =>
  write(key(company, 'operator'), o ? JSON.stringify({ ...o, at: now }) : null);
