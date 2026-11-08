import { useState } from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import { cfApi } from '../../api/client';
import type { ModelState } from './valuesModel';

/**
 * The 3D model on the Values stage (2026-11-08, modelValueService; user: "the values should compute when we upload the 3D
 * json. Until then only manual fill"):
 *   no model yet       one quiet line: the sizes, holes and welds come when it is attached; until then they are typed
 *   disagreements      a value a person typed that the model says otherwise — the typed one stays (decision 1); "Use the
 *                      model's" writes the model's value as the person's own (the same PUT a typed cell makes)
 * Accepting waits while the grid has unsaved changes (they are one save; this would be another).
 */
export function ModelPanel({ lineId, model, disabled, onChanged, onError }: {
  lineId: number;
  model: ModelState | null | undefined;
  /** Unsaved changes in the grid, or a save running. */
  disabled: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!model) return null;
  const sx = { mb: 0.5, py: 0, fontSize: 12.5, '& .MuiAlert-icon': { py: '6px', fontSize: 18 }, '& .MuiAlert-message': { py: '6px', width: '100%' } };
  if (!model.attached) {
    return <Alert severity="info" data-testid="model-waiting" sx={sx}>No 3D model yet. Sizes, holes, drilled thickness and welds (◌) fill when it is attached — until then, type what you know.</Alert>;
  }
  const list = model.disagreements;
  if (!list.length) return null;
  const accept = async (d: ModelState['disagreements'][number]) => {
    const key = `${d.recordId}:${d.code}`;
    setBusy(key);
    try {
      const value = Array.isArray(d.model) ? JSON.stringify(d.model) : d.model;
      await cfApi.put(`/order-lines/${lineId}/values`, { writes: [{ recordId: d.recordId, specCode: d.code, value }] });
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };
  return (
    <Alert severity="warning" data-testid="model-disagreements" sx={sx}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>
        The 3D model says otherwise on {list.length} typed {list.length === 1 ? 'value' : 'values'} — the typed {list.length === 1 ? 'value stays' : 'values stay'} until you choose.
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 2, maxHeight: 180, overflowY: 'auto' }}>
        {list.map((d) => {
          const key = `${d.recordId}:${d.code}`;
          return (
            <Box component="li" key={key} data-testid="model-disagreement" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <span>{d.mark ?? d.row ?? `row ${d.recordId}`} · {d.code}: {d.by === 'drawing' ? 'its drawing' : 'typed'} {d.heldText}, model {d.modelText}</span>
              {d.acceptable && (
                <Button size="small" disabled={disabled || busy != null} onClick={() => void accept(d)} sx={{ minHeight: 22, py: 0, fontSize: 12 }}
                  title={disabled ? 'Save or undo the grid’s changes first.' : 'Write the model’s value as this row’s own.'}>
                  {busy === key ? 'Saving…' : 'Use the model’s'}
                </Button>
              )}
            </Box>
          );
        })}
      </Box>
    </Alert>
  );
}
