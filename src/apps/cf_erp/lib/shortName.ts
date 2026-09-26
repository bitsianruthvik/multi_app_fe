/**
 * What the API is sent for a short name (masterRecordService.readShortName):
 * a value, not set (null — codes fall back), or NONE — set on purpose, codes
 * print nothing where it goes. None is its own flag, because an empty box on a
 * form means "not set".
 */
export function shortNameBody(value: string, none: boolean): { shortName: string | null; noShortName: boolean } {
  return none ? { shortName: null, noShortName: true } : { shortName: value.trim() || null, noShortName: false };
}

/** How a short name reads on a screen: its value, "none" when set to none, a dash when not set. */
export const shortNameText = (shortName: string | null | undefined): string => (shortName === '' ? 'none' : shortName ?? '—');
