/**
 * OperationNode.tsx — custom React Flow node for a single operation task (EU-3).
 * Redesigned card: operation name + BOM-part badge + status dot, with a hover
 * popover carrying the full task detail (resource, timings, delay reason,
 * timestamps). Click invokes the optional `onOpen` callback.
 */

import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Box, Chip, Divider, Popover, Tooltip, Typography } from '@mui/material';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { STATUS_COLOR, STATUS_LABEL, type OperationNodeData } from './types';
import { OP_W, OP_H } from './graphLayout';

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.15 }}>
      <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{label}</Typography>
      <Typography sx={{ fontSize: 11.5, color: 'var(--c-text)', fontWeight: 500, textAlign: 'right' }}>{value}</Typography>
    </Box>
  );
}

function OperationNode({ data }: NodeProps) {
  const d = data as unknown as OperationNodeData;
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const color = STATUS_COLOR[d.status] ?? '#9ca3af';
  const open = Boolean(anchorEl);

  const opName = d.operationName ?? `Op #${d.operationId ?? '?'}`;
  const partName = d.itemName ?? `Item #${d.itemId}`;
  // FEAT-09: no computed duration (operation has no time formula) → scheduling/ETA
  // can't estimate this task. Flag it on the card and in the detail popover.
  const missingDuration = d.computedHours === null || d.computedHours === undefined;

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ width: 8, height: 8, background: color, border: 'none' }} />

      <Box
        onMouseEnter={(e) => setAnchorEl(e.currentTarget)}
        onMouseLeave={() => setAnchorEl(null)}
        onClick={() => d.onOpen?.(d.id)}
        sx={{
          width: OP_W, height: OP_H, boxSizing: 'border-box',
          borderRadius: 'var(--r-md, 8px)', border: `2px solid ${color}`,
          background: 'var(--c-surface)', boxShadow: 'var(--e-1)',
          p: 1, display: 'flex', flexDirection: 'column', gap: 0.4,
          cursor: d.onOpen ? 'pointer' : 'default', overflow: 'hidden',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <Typography
            title={opName}
            sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {opName}
          </Typography>
          {missingDuration && (
            <Tooltip title="No duration — this operation has no time formula, so scheduling/ETA can’t estimate it.">
              <WarningAmberRounded sx={{ fontSize: 15, color: 'var(--c-warning, #ed6c02)', flexShrink: 0, ml: 'auto' }} />
            </Tooltip>
          )}
        </Box>

        <Chip
          label={partName}
          size="small"
          title={partName}
          sx={{
            height: 18, maxWidth: '100%', alignSelf: 'flex-start',
            bgcolor: 'var(--c-surface-2)', color: 'var(--c-text-2)',
            fontSize: 10.5, fontWeight: 600,
            '& .MuiChip-label': { px: 0.75, overflow: 'hidden', textOverflow: 'ellipsis' },
          }}
        />

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 'auto' }}>
          <Typography sx={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>{STATUS_LABEL[d.status] ?? d.status}</Typography>
          <Typography sx={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>seq {d.seqNo}</Typography>
        </Box>
      </Box>

      <Handle type="source" position={Position.Right} style={{ width: 8, height: 8, background: color, border: 'none' }} />

      <Popover
        open={open}
        anchorEl={anchorEl}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        sx={{ pointerEvents: 'none' }}
        disableRestoreFocus
        slotProps={{ paper: { sx: { p: 1.5, maxWidth: 300, borderRadius: 'var(--r-md, 8px)' } } }}
      >
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', mb: 0.25 }}>{opName}</Typography>
        <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)', mb: 0.75 }}>{partName}</Typography>
        <Divider sx={{ mb: 0.75 }} />
        <DetailRow label="Status" value={STATUS_LABEL[d.status] ?? d.status} />
        <DetailRow label="Sequence" value={d.seqNo} />
        <DetailRow label="Resource type" value={d.resourceTypeName} />
        <DetailRow label="Assigned resource" value={d.assignedResourceId} />
        <DetailRow label="Est. hours" value={missingDuration ? '⚠ missing (no time formula)' : d.computedHours} />
        <DetailRow label="Wait (working min)" value={d.waitWorkingMinutes} />
        <DetailRow label="Blocked by others (min)" value={d.blockedByOtherTasksMinutes} />
        <DetailRow label="Idle wait (min)" value={d.idleWaitMinutes} />
        <DetailRow label="Delay reason" value={d.delayReason} />
        <DetailRow label="Started" value={d.startedAt} />
        <DetailRow label="Paused" value={d.pausedAt} />
        <DetailRow label="Completed" value={d.completedAt} />
      </Popover>
    </>
  );
}

export default memo(OperationNode);
