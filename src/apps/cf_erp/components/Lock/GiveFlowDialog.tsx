import { useEffect, useMemo, useState } from 'react';
import { Box, Checkbox, FormControlLabel, Typography } from '@mui/material';
import { cfApi } from '../../api/client';
import { postBomChanges, type BomChange } from '../../api/bomChanges';
import type { LockFlowRow } from '../../api/lock';
import type { Flow } from '../../api/types';
import { FormDialog } from '../FormDialog';
import { FlowChoiceList } from '../Bom/FlowChoice';
import { Mono } from '../ui';

/**
 * "Give them a flow" from the Freeze design checklist (walkthrough 2026-10-18 step 59: release refused rows with no
 * flow, and the checklist never said). The made rows with no flow are listed, all ticked; one flow is picked and
 * given to the ticked rows in ONE save (POST /bom-changes, the same change the Structure grid makes — a frozen line
 * still takes a flow for a row that has none). Rows that need a different flow are unticked here and given theirs on
 * the Structure stage. Nothing is held up: freezing does not wait for this.
 */
export function GiveFlowDialog({ open, lineId, rows, onClose, onDone }: {
  open: boolean;
  lineId: number;
  rows: LockFlowRow[];
  onClose: () => void;
  onDone: (n: number) => void;
}) {
  const [flows, setFlows] = useState<Flow[] | null>(null);
  const [flowId, setFlowId] = useState<number | null>(null);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!open) return undefined;
    setFlowId(null);
    setTicked(new Set(rows.map((r) => r.recordId)));
    let alive = true;
    cfApi.get<Flow[]>('/flows').then((f) => { if (alive) setFlows(f); }).catch(() => { if (alive) setFlows([]); });
    return () => { alive = false; };
  }, [open, rows]);
  const chosen = useMemo(() => flows?.find((f) => f.id === flowId) ?? null, [flows, flowId]);
  const picked = rows.filter((r) => ticked.has(r.recordId));
  return (
    <FormDialog open={open} onClose={onClose} maxWidth="sm" title="Give these rows a flow"
      subtitle="One flow for every ticked row, saved together. Untick a row that is made another way and give it its own on the Structure stage."
      submitLabel={chosen ? `Give ${picked.length} ${picked.length === 1 ? 'row' : 'rows'} ${chosen.code}` : 'Pick a flow'}
      submitDisabled={!chosen || picked.length === 0}
      onSubmit={async () => {
        const changes: BomChange[] = picked.map((r) => (r.lineId != null
          ? { op: 'flow', lineId: r.lineId, flowId: flowId as number }
          : { op: 'ownFlow', recordId: r.recordId, flowId: flowId as number }));
        await postBomChanges({ scope: { orderLineId: lineId }, changes });
        onDone(picked.length);
        onClose();
      }}>
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <Box data-testid="give-flow-rows" sx={{ display: 'grid', gap: 0, maxHeight: 200, overflow: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', px: 1 }}>
          {rows.map((r) => (
            <FormControlLabel key={r.recordId} sx={{ m: 0 }}
              control={<Checkbox size="small" checked={ticked.has(r.recordId)} onChange={(e) => setTicked((cur) => { const next = new Set(cur); if (e.target.checked) next.add(r.recordId); else next.delete(r.recordId); return next; })} />}
              label={<Mono>{r.name}</Mono>} />
          ))}
        </Box>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{chosen ? <>Flow: <Mono>{chosen.code}</Mono> {chosen.name}</> : 'Pick the flow they are made by:'}</Typography>
        <FlowChoiceList flows={flows} chosen={flowId} usual="own" autoFocus={false} onPick={(id) => setFlowId(id)} />
      </Box>
    </FormDialog>
  );
}
