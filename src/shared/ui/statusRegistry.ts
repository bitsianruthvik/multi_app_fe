import type { StatusTone } from './types';

/**
 * One status vocabulary per app, registered once at app setup.
 *
 * The kit must not know any app's statuses — `confirmed`, `regularised` and
 * `in_transit` mean nothing here. But the rule that a status maps to a tone in
 * exactly ONE place is worth keeping, because the failure it prevents is real:
 * an unmapped status renders as an anonymous grey chip on the one screen where
 * "this is done, go and act" is the most consequential thing it could say.
 *
 * An app calls `registerStatusTones` (and optionally `registerStatusLabels`)
 * once — next to its navMeta — and every StatusBadge in the app agrees. A
 * one-off can still pass `tone` or `map` to the badge directly.
 */

const TONES: Record<string, StatusTone> = {};
const LABELS: Record<string, string> = {};

export function registerStatusTones(map: Record<string, StatusTone>) {
  Object.assign(TONES, map);
}

export function registerStatusLabels(map: Record<string, string>) {
  Object.assign(LABELS, map);
}

/** The tone for a status; anything unregistered is neutral. */
export function statusTone(status: string, map?: Record<string, StatusTone>): StatusTone {
  return map?.[status] ?? TONES[status] ?? 'neutral';
}

/** The label for a status; falls back to the underscore-to-space substitution. */
export function statusLabel(status: string, map?: Record<string, string>): string {
  return map?.[status] ?? LABELS[status] ?? status.replace(/_/g, ' ');
}

/** A status tone as a MUI `Chip`/`Button` colour. */
export function chipColorForStatus(
  status: string,
): 'default' | 'warning' | 'info' | 'success' | 'error' {
  const tone = statusTone(status);
  if (tone === 'success') return 'success';
  if (tone === 'warning') return 'warning';
  if (tone === 'danger') return 'error';
  if (tone === 'info') return 'info';
  return 'default';
}
