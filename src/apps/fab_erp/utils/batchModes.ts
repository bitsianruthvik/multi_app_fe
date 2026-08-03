import type { FabOperationResourceType } from '../types';

/**
 * Batch-mode vocabulary and the match-keys parser, in their own module.
 *
 * A file that exports both a component and a constant loses fast refresh
 * (react-refresh/only-export-components) — the same rule that already moved
 * backendMessage, formatElapsed and formatMinutes out of their component files.
 */

export type BatchMode = NonNullable<FabOperationResourceType['batchMode']>;

export const BATCH_MODE_OPTIONS: Array<{ value: BatchMode; label: string; help: string }> = [
  { value: 'none', label: 'Not batchable', help: 'Tasks run one at a time on this kind of machine.' },
  { value: 'shared_setup', label: 'Shared setup', help: 'Each piece is still worked individually, but setup is paid once — stack and drill.' },
  { value: 'fixed_cycle', label: 'Fixed cycle', help: 'One run costs the same however many pieces go in — a galvanising dip, one nested cut.' },
  { value: 'capacity_cycle', label: 'Capacity cycle', help: 'Like fixed cycle, but the machine holds a limited number, so more pieces means more cycles.' },
];

/** JSON column: arrives parsed from the query API, but tolerate a raw string. */
export function parseMatchKeys(raw: FabOperationResourceType['batchMatchKeys']): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch { return []; }
}
