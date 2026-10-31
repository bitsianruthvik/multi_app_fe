import type { NestPlatesAdded } from '../api/nesting';
import type { NestPlanMissingSteel } from '../api/types';
import { mm } from './nesting';

/** "12 mm MS E250 BR" — the steel in words. */
export const steelWords = (m: NestPlanMissingSteel) => [`${mm(m.thickness)} mm`, m.material, m.grade, m.impactClass].filter(Boolean).join(' ');

/** "Added PL-12X2500X12000-E250BR (12 mm × 12,000 × 2,500) to the catalog." */
export function addedWords(out: NestPlatesAdded): string {
  const made = out.created[0];
  if (!made) return out.skipped[0]?.why ?? out.message;
  const size = made.length != null && made.width != null ? ` (${mm(made.length)} × ${mm(made.width)})` : '';
  return `Added ${made.code}${size} to the catalog. Nesting runs again with it.`;
}

