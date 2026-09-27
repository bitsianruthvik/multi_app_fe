/**
 * What a save on a line's structure or values says about its cut pieces
 * (`cutPieces` on the answer — cutPlateService.refreshCutPieces). Cut pieces
 * are made as soon as the line's required values are complete, and made again
 * when the values or the structure change, until the line is locked. The save
 * never fails because they could not follow it: `reason` says why instead.
 */
export interface CutPiecesFollowUp {
  made: boolean;
  reason: 'made' | 'up_to_date' | 'values_missing' | 'no_plate_parts' | 'locked' | 'released' | 'closed'
    | 'no_structure' | 'not_set_up' | 'cannot_derive';
  message: string | null;
  summary?: unknown;
}

/**
 * The one line worth telling somebody after a save, or null when there is
 * nothing to say: made (what was made), or could not be made although the
 * values allow it (why). Waiting for values is the Values stage's to show.
 */
export function cutPiecesNote(r: CutPiecesFollowUp | null | undefined): { text: string; tone: 'info' | 'error' } | null {
  if (!r || !r.message) return null;
  if (r.made) return { text: r.message, tone: 'info' };
  if (r.reason === 'cannot_derive' || r.reason === 'not_set_up') return { text: r.message, tone: 'error' };
  return null;
}
