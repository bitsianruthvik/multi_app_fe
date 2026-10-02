import { cfApi, qs } from './client';
import type { Machine } from './types';

/** The server returns machines 500 at a time; this asks for page after page until a short one. */
const PAGE = 500;

/** Every machine (optionally narrowed by a search / classification), not just the first 500. */
export async function allMachines(params: { search?: string; classificationId?: number | null } = {}): Promise<Machine[]> {
  const machines: Machine[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await cfApi.get<Machine[]>(`/machines${qs({ ...params, offset: offset || undefined })}`);
    machines.push(...page);
    if (page.length < PAGE) return machines;
  }
}
