/**
 * Namespaced localStorage for UI preferences (column visibility, page size,
 * row density, palette recents).
 *
 * The namespace is set once by ThemeScope to the app's slug, so two apps in the
 * same browser never read each other's table preferences. Every accessor is
 * wrapped: a quota error or a private window must never take a table down —
 * preferences are a nicety, the data is not.
 */

let namespace = 'ui';

/** Set by ThemeScope; apps do not normally call this themselves. */
export function setUiStorageNamespace(ns: string) {
  namespace = ns || 'ui';
}

export function uiStorageNamespace(): string {
  return namespace;
}

export function readPref<V>(suffix: string, fallback: V): V {
  try {
    const raw = localStorage.getItem(`${namespace}:${suffix}`);
    return raw ? (JSON.parse(raw) as V) : fallback;
  } catch {
    return fallback;
  }
}

export function writePref(suffix: string, value: unknown) {
  try {
    localStorage.setItem(`${namespace}:${suffix}`, JSON.stringify(value));
  } catch {
    /* quota or private mode — preferences are a nicety, never block the UI */
  }
}

export function readRawPref(suffix: string): string | null {
  try {
    return localStorage.getItem(`${namespace}:${suffix}`);
  } catch {
    return null;
  }
}

export function writeRawPref(suffix: string, value: string) {
  try {
    localStorage.setItem(`${namespace}:${suffix}`, value);
  } catch {
    /* see above */
  }
}
