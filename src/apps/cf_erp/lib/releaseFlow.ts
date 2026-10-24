/**
 * MADE ROWS WITH NO FLOW — one set of words for the two places that say it (2026-10-24, user: "fix the other confusing
 * screen issues"). Freezing only WARNS about them (the user's choice, 2026-10-18); RELEASE refuses them
 * (releaseService.buildPlan: "… has no flow — say how it is made."). People only found that out at release, so:
 *   - the Freeze design checklist says plainly that release will refuse these rows, with "Give them a flow";
 *   - the order's Production step lists the same rows up front, per line, before anyone clicks Release
 *     (GET /order-lines/:id/release-check → noFlowRows).
 * The rules are unchanged; only the words and where they are said.
 */

/** "Release will refuse these 3 rows until they have a flow" / "… this row until it has a flow". */
export function releaseRefusesText(n: number): string {
  return n === 1
    ? 'Release will refuse this row until it has a flow'
    : `Release will refuse these ${n.toLocaleString('en-IN')} rows until they have a flow`;
}

/** The first few names, then "and N more" — "Web plate, Flange and 4 more". */
export function rowNames(names: string[], shown = 5): string {
  const head = names.slice(0, shown);
  const rest = names.length - head.length;
  if (rest <= 0) return head.length > 1 ? `${head.slice(0, -1).join(', ')} and ${head[head.length - 1]}` : head.join('');
  return `${head.join(', ')} and ${rest.toLocaleString('en-IN')} more`;
}

/** The checklist's line for the 'flows' check: what release does, which rows, and that freezing is not held up. */
export function freezeFlowDetail(names: string[]): string {
  return `${releaseRefusesText(names.length)}: ${rowNames(names)}. Freezing is not held up — give ${names.length === 1 ? 'it' : 'them'} a flow now, or any time before release.`;
}

/** Order lines the Production step should check: not released yet, and due a release (or about to be created). */
export function linesToCheck(opts: {
  lineIds: number[];
  /** Lines of production orders still Yet to plan. */
  pendingLineIds: number[];
  /** Lines already released (an older release, or a production order already released). */
  releasedLineIds: number[];
  /** True while production orders are still to be created (none made yet for some of the plan). */
  toCreate: boolean;
}): number[] {
  const released = new Set(opts.releasedLineIds);
  const want = new Set(opts.pendingLineIds);
  if (opts.toCreate) for (const id of opts.lineIds) want.add(id);
  return [...want].filter((id) => !released.has(id)).sort((a, b) => a - b);
}
