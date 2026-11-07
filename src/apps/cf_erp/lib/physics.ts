import type { PhysicsInfo } from '../api/drawings';

/** "2 fail, 10 to look at, 28 pass" — the physics view's findings, failing first (components/Drawings/PhysicsView.tsx). Pure. */
export function physicsCounts(info: Pick<PhysicsInfo, 'summary'> | null | undefined): string {
  const f = info?.summary?.findings ?? {};
  const parts: string[] = [];
  if (f.fail) parts.push(`${f.fail} ${f.fail === 1 ? 'fails' : 'fail'}`);
  if (f.look) parts.push(`${f.look} to look at`);
  if (f.pass) parts.push(`${f.pass} pass`);
  return parts.join(', ');
}
