/**
 * Router state a link sets when it opens a record from inside another one (a BOM
 * row's name): the shell's breadcrumb then offers the way back to where you were
 * instead of the collection.
 */
export interface BackState {
  backTo?: { label: string; path: string };
}

export const backOf = (state: unknown): BackState['backTo'] | null => {
  const b = (state as BackState | null)?.backTo;
  return b && typeof b.label === 'string' && typeof b.path === 'string' ? b : null;
};
