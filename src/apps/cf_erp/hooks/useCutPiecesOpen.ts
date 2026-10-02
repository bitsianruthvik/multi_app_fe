import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CUT_PIECES_PARAM } from '../lib/process';

/**
 * Whether the cut-pieces dialog over Nesting is open — kept in the address
 * (`cutPieces=1`), so an old `?tab=cut-pieces` link (redirected by the order
 * page), Back and a reload all show the same thing (2026-10-02).
 */
export function useCutPiecesOpen(): [boolean, (open: boolean) => void] {
  const [params, setParams] = useSearchParams();
  const open = params.get(CUT_PIECES_PARAM) === '1';
  const setOpen = useCallback((next: boolean) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next) p.set(CUT_PIECES_PARAM, '1'); else p.delete(CUT_PIECES_PARAM);
      return p;
    }, { replace: true });
  }, [setParams]);
  return [open, setOpen];
}
