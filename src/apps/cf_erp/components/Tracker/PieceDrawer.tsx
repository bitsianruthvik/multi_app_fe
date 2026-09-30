import { useState } from 'react';
import { Box, Drawer, IconButton, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { cfApi, CfApiError } from '../../api/client';
import type { ProductionStep } from '../../api/types';
import { getTreePiece, type TreeNode, type TreePieceResponse } from '../../api/trackerTree';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { appPath } from '../../navMeta';
import { progressText } from '../../lib/tracker';
import { pctText } from '../../lib/trackerTree';
import { ErrorNotice, Mono, SkeletonRows } from '../ui';
import { StepStatusBadge } from '../trackerUi';
import { StepActions } from '../ReleaseView';
import { ProgressDialog, StartStepDialog } from '../TrackerDialogs';
import { PromptDialog } from '../PromptDialog';
import { useToast } from '../toastContext';
import { OpStrip } from './TreeParts';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };
const refusal = (e: unknown) => (e instanceof CfApiError ? [e.message, ...e.problems].join(' ') : e instanceof Error ? e.message : String(e));

/** One step, in full: what it is, where it stands, what it waits for, and what can be done. */
function StepCard({ step, canProduce, onAct }: { step: ProductionStep; canProduce: boolean; onAct: (kind: 'start' | 'record' | 'hold' | 'resume', s: ProductionStep) => void }) {
  const lines = step.status === 'not_ready'
    ? step.blockers.map((b) => b.text)
    : step.status === 'in_progress' && step.machine ? [`On ${step.machine.code}.`]
      : step.status === 'done' && step.machine ? [`Made on ${step.machine.code}.`] : [];
  if (step.workOrderId) lines.unshift([step.workOrderCode ?? 'Work order', step.contractorName].filter(Boolean).join(' · '));
  return (
    <Box sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', p: 1.25, display: 'grid', gap: 0.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ fontSize: 14, fontWeight: 500, flex: '1 1 auto', minWidth: 0 }}>
          {step.stepName || step.operation.name} <Mono muted>{step.operation.code}</Mono>
        </Box>
        {progressText(step.qtyGood, step.quantity) && <Mono muted>{progressText(step.qtyGood, step.quantity)}</Mono>}
        <StepStatusBadge status={step.status} />
      </Box>
      {lines.map((t, i) => <Typography key={i} sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{t}</Typography>)}
      {canProduce && step.status !== 'done' && (
        <StepActions step={step} onStart={() => onAct('start', step)} onRecord={() => onAct('record', step)} onHold={() => onAct('hold', step)} onResume={() => onAct('resume', step)} />
      )}
    </Box>
  );
}

/**
 * A piece of the progress tree opened on the right: its code and where it sits,
 * then each step with the tracker's own actions (start, record, hold, resume).
 * After any of them the tree is told, so its bars catch up.
 */
export function PieceDrawer({ nodeId, basisNote, onClose, onChanged }: {
  nodeId: string | null;
  basisNote: { piece: string; row: string } | null;
  onClose: () => void;
  onChanged: (node: TreeNode) => void;
}) {
  const company = useCompanySlug();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canProduce = isPermitted('cf_erp_production_manage');
  const [starting, setStarting] = useState<ProductionStep | null>(null);
  const [recording, setRecording] = useState<ProductionStep | null>(null);
  const [holding, setHolding] = useState<ProductionStep | null>(null);
  const load = useLoad<TreePieceResponse | null>(() => (nodeId ? getTreePiece(nodeId) : Promise.resolve(null)), [nodeId]);
  const data = nodeId && load.data?.node.id === nodeId ? load.data : null;

  const after = (msg: string) => async () => {
    toast.success(msg);
    invalidateNavCounts();
    if (!nodeId) return;
    try {
      const fresh = await getTreePiece(nodeId);
      load.setData(fresh);
      onChanged(fresh.node);
    } catch (e) { toast.error(refusal(e)); }
  };
  const act = async (kind: 'start' | 'record' | 'hold' | 'resume', s: ProductionStep) => {
    if (kind === 'start') setStarting(s);
    else if (kind === 'record') setRecording(s);
    else if (kind === 'hold') setHolding(s);
    else {
      try { await cfApi.post(`/production-steps/${s.id}/resume`, {}); await after('Resumed.')(); } catch (e) { toast.error(refusal(e)); }
    }
  };
  const node = data?.node;

  return (
    <Drawer anchor="right" open={!!nodeId} onClose={onClose} PaperProps={{ sx: { width: { xs: '100vw', sm: 520 }, maxWidth: '100vw' } }}>
      <Box sx={{ p: 2, display: 'grid', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {data && (
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 0.25 }}>
                {data.order && <Box component={Link} to={appPath(company, `orders/${data.order.id}?tab=production${data.line ? `&line=${data.line.id}` : ''}`)} sx={linkSx}>{data.order.code}</Box>}
                {data.line && ` · Line ${data.line.lineNo}`}
              </Typography>
            )}
            <Mono sx={{ fontSize: 14.5, color: 'var(--c-text)', fontWeight: 600, wordBreak: 'break-all' }}>{node?.code ?? ' '}</Mono>
            {node?.name && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{node.name}{node.qty && node.qty !== 1 ? ` · ×${node.qty}` : ''}</Typography>}
          </Box>
          <IconButton aria-label="Close" onClick={onClose} size="small"><CloseRounded fontSize="small" /></IconButton>
        </Box>
        <ErrorNotice error={load.error} onRetry={load.reload} />
        {!data && !load.error && <SkeletonRows rows={4} height={64} />}
        {node && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <OpStrip ops={node.ops} />
              {node.childCount > 0 && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>With what is under it: {pctText(node.completion)} done</Typography>}
            </Box>
            {basisNote && node.basis && (
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                {node.basis === 'row' ? `${basisNote.row} (${node.qty} pieces in this group)` : basisNote.piece}
              </Typography>
            )}
            {data.steps.length === 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>This piece has no steps of its own.</Typography>}
            {data.steps.map((s) => <StepCard key={s.id} step={s} canProduce={canProduce} onAct={act} />)}
            {node.itemId && (
              <Typography sx={{ fontSize: 12.5 }}>
                <Box component={Link} to={appPath(company, `items/${node.itemId}`)} sx={{ ...linkSx, color: 'var(--c-primary-700)' }}>Open the item</Box>
              </Typography>
            )}
          </>
        )}
      </Box>
      <StartStepDialog step={starting} onClose={() => setStarting(null)} onDone={() => { void after('Started.')(); }} />
      <ProgressDialog step={recording} onClose={() => setRecording(null)} onDone={() => { void after('Recorded.')(); }} />
      <PromptDialog open={!!holding} title="Put this step on hold?" label="Why" confirmLabel="Hold" body={holding?.label}
        onClose={() => setHolding(null)}
        onConfirm={async (note) => { await cfApi.post(`/production-steps/${holding?.id}/hold`, { note }); await after('On hold.')(); }} />
    </Drawer>
  );
}
