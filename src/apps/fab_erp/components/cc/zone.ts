/**
 * Fever-chart zone → color token maps, shared by the portfolio dot/pill,
 * the alerts strip, and FeverChart. Semantic colors per DESIGN_SYSTEM.md §5.1
 * (emerald/amber/rose) — violet accent is deliberately not used for status.
 */
import type { CcZone } from '../../api/cc';

export const ZONE_COLOR: Record<CcZone, string> = {
  green: 'var(--c-success-600)',
  yellow: 'var(--c-warning-600)',
  red: 'var(--c-danger-600)',
};

export const ZONE_BG: Record<CcZone, string> = {
  green: 'var(--c-success-50)',
  yellow: 'var(--c-warning-50)',
  red: 'var(--c-danger-50)',
};

export const ZONE_LABEL: Record<CcZone, string> = {
  green: 'On track',
  yellow: 'Watch',
  red: 'At risk',
};
