import type { TimingRule } from '../api/types';

/**
 * The main rule of an operation's rule list (the page's own list is already ordered shallow-to-deep): one on a machine
 * type before one on a single machine, a rule valid today before a dated-out one, one that lets machines in before one
 * that keeps them out. The list endpoint ranks the same way (mainRuleOf).
 */
export function pickMainRule(rules: TimingRule[], today = new Date().toISOString().slice(0, 10)): TimingRule | null {
  const valid = (r: TimingRule) => (!r.effectiveFrom || r.effectiveFrom <= today) && (!r.effectiveTo || r.effectiveTo >= today);
  const rank = (r: TimingRule) => (r.subject.type === 'classification' ? 0 : 4) + (valid(r) ? 0 : 2) + (r.eligible ? 0 : 1);
  return [...rules].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}
