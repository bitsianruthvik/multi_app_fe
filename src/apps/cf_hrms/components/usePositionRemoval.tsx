import { useCallback, useState } from 'react';
import { errorMessage, useToast } from '@shared/ui';
import type { PositionRemovalImpact, RemovalResult } from '../api/positions';
import { positionsApi } from '../api/positions';
import { PositionRemoveDialog } from './PositionRemoveDialog';

/**
 * Starts the close-or-delete flow for a position. `start(id)` reads the impact
 * first and only then opens the dialog — so the dialog never appears half-empty
 * and never offers a choice it has not checked. Render `dialog` once.
 */
export function usePositionRemoval({ onDone }: { onDone: (result: RemovalResult) => void }) {
  const toast = useToast();
  const [impact, setImpact] = useState<PositionRemovalImpact | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const start = useCallback(async (id: number) => {
    setBusyId(id);
    try {
      setImpact(await positionsApi.deleteImpact(id));
    } catch (e) {
      toast.error(errorMessage(e, 'Could not check what closing or deleting this would affect.'));
    } finally {
      setBusyId(null);
    }
  }, [toast]);

  const reload = useCallback(() => {
    if (!impact) return;
    positionsApi.deleteImpact(impact.position.id).then(setImpact).catch(() => { /* the in-dialog error already says what happened */ });
  }, [impact]);

  const dialog = impact ? (
    <PositionRemoveDialog
      key={impact.position.id}
      impact={impact}
      onReload={reload}
      onClose={() => setImpact(null)}
      onDone={onDone}
    />
  ) : null;

  return { start, busyId, dialog };
}
