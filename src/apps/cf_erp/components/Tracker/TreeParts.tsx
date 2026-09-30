import { Box, Tooltip, Typography } from '@mui/material';
import type { TreeNode, TreeOp } from '../../api/trackerTree';
import { OP_STATE, OP_STATE_ORDER, opPillText, opTitle, pctText } from '../../lib/trackerTree';

/**
 * The small pieces the progress tree is drawn from: a piece's operations as a
 * strip of pills, a subtree's completion as a slim bar, and the blocked mark.
 * Calm by design — grey is "not started", and only a block is red.
 */

/** One operation: colour + a mark or "2/6", its name on hover. */
export function OpPill({ op }: { op: TreeOp }) {
  const s = OP_STATE[op.state];
  const text = opPillText(op);
  return (
    <Tooltip title={opTitle(op)} arrow disableInteractive>
      <Box
        component="span"
        data-testid="op-pill"
        data-state={op.state}
        aria-label={opTitle(op)}
        sx={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          minWidth: 20, height: 18, px: text.length > 1 ? 0.625 : 0, borderRadius: '5px',
          background: s.fill, border: '1px solid', borderColor: s.border, color: s.ink,
          fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600, lineHeight: 1,
          ...(op.state === 'todo' && op.ready ? { borderColor: 'var(--c-success-600)', borderStyle: 'dashed' } : {}),
        }}
      >
        {text}
      </Box>
    </Tooltip>
  );
}

/** A piece's own operations in flow order. */
export function OpStrip({ ops }: { ops: TreeOp[] }) {
  if (!ops.length) return null;
  return (
    <Box data-testid="op-strip" sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
      {ops.map((op) => <OpPill key={op.stepId} op={op} />)}
    </Box>
  );
}

/** A subtree's completion: a slim bar and the percentage. */
export function CompletionBar({ value, title, width = 96 }: { value: number | null; title?: string; width?: number }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value));
  const bar = (
    <Box data-testid="completion" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-label={`Completed ${pctText(value)}`}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ width, height: 6, borderRadius: 3, background: 'var(--c-neutral-200)', overflow: 'hidden', flexShrink: 0 }}>
        <Box data-testid="completion-fill" style={{ width: `${pct * 100}%` }} sx={{ minWidth: pct > 0 ? 2 : 0, height: '100%', borderRadius: 3, background: pct >= 1 ? 'var(--c-success-600)' : 'var(--c-primary-500)' }} />
      </Box>
      <Box component="span" data-testid="completion-pct" sx={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--c-text-2)', minWidth: 34, textAlign: 'right' }}>{pctText(value)}</Box>
    </Box>
  );
  return title ? <Tooltip title={<Box sx={{ whiteSpace: 'pre-line' }}>{title}</Box>} arrow disableInteractive>{bar}</Tooltip> : bar;
}

/** "3 blocked" with the first reason on hover; a single blocked piece just says "Blocked". */
export function BlockedMark({ node }: { node: TreeNode }) {
  if (!node.blockedCount) return null;
  const text = node.childCount > 0 ? `${node.blockedCount} blocked` : 'Blocked';
  const why = [node.blockedAt ? `First: ${node.blockedAt}` : null, node.blockedReason].filter(Boolean).join('\n');
  return (
    <Tooltip title={<Box sx={{ whiteSpace: 'pre-line' }}>{why || 'Blocked'}</Box>} arrow disableInteractive>
      <Box component="span" data-testid="blocked-mark" sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.75, height: 20, borderRadius: 10,
        background: 'var(--c-danger-50)', color: 'var(--c-danger-700)', fontSize: 11.5, fontWeight: 500, whiteSpace: 'nowrap',
      }}>
        <Box component="span" aria-hidden sx={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-danger-600)' }} />
        {text}
      </Box>
    </Tooltip>
  );
}

/** What the colours mean, once, above the tree. */
export function OpLegend() {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
      {OP_STATE_ORDER.map((st) => (
        <Box key={st} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <OpPill op={{ stepId: 0, operationId: 0, name: OP_STATE[st].label, done: st === 'partial' ? 2 : st === 'done' ? 6 : 0, total: st === 'partial' ? 6 : 1, state: st }} />
          <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{OP_STATE[st].label}</Typography>
        </Box>
      ))}
    </Box>
  );
}
