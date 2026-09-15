/**
 * Shallow value comparison — used by `TreeEditor`/`TreeNode` to decide whether
 * a memoised row needs to re-render (EU-17). Lives in its own module (not
 * alongside the component) so a file can import it without tripping
 * react-refresh's "only export components" rule — same reason
 * `utils/backendMessage.ts` is its own file.
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ak = Object.keys(a as Record<string, unknown>);
  const bk = Object.keys(b as Record<string, unknown>);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}
