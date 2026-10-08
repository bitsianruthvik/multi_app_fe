/**
 * What a record shows in the spot where its code used to be (user, 2026-10-08):
 * a definition shows its SHORT NAME, never its code (it still has one in the
 * database — the BOQ import and the code generator use it); everything else
 * keeps its code. Null means "show nothing here and let the name carry it".
 * Display only — keys, urls and anything sent to the server keep the real code.
 */
export interface DisplayCodeSource {
  kind?: string | null;
  recordKind?: string | null;
  code?: string | null;
  shortName?: string | null;
}

export function isDefinitionKind(kind: string | null | undefined, recordKind?: string | null): boolean {
  return recordKind === 'definition' || kind === 'template' || kind === 'selection';
}

export function displayCode(r: DisplayCodeSource | null | undefined): string | null {
  if (!r) return null;
  if (isDefinitionKind(r.kind, r.recordKind)) return r.shortName ? r.shortName : null;
  return r.code ? r.code : null;
}

/** "SHORT · Name" for a definition, "CODE · Name" otherwise; just the name when there is nothing to put before it. */
export function displayLabel(r: DisplayCodeSource & { name: string }, sep = ' · '): string {
  const c = displayCode(r);
  return c ? `${c}${sep}${r.name}` : r.name;
}

/** displayCode, falling back to the name when there is nothing to show — for labels, titles and toasts. */
export function codeOrName(r: DisplayCodeSource & { name: string }): string {
  return displayCode(r) ?? r.name;
}

/** A definition given only as { shortName, name } (a BOM line's selection or design): its short name, else its name. */
export function definitionLabel(d: { shortName?: string | null; name: string }): string {
  return d.shortName ? d.shortName : d.name;
}
