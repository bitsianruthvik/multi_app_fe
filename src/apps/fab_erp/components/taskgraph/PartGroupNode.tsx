/**
 * PartGroupNode.tsx — custom React Flow group/container node = one BOM part's
 * swimlane (EU-3). Collapsed → a compact chip summarizing the part's task
 * status. Expanded → a bordered container with a header bar; the part's
 * operation task nodes render inside it as child nodes. Handles on the
 * container let cross-BOM component edges attach when a side is collapsed.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Box, IconButton, Typography } from '@mui/material';
import AddBoxOutlined from '@mui/icons-material/AddBoxOutlined';
import IndeterminateCheckBoxOutlined from '@mui/icons-material/IndeterminateCheckBoxOutlined';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import { STATUS_COLOR, STATUS_ORDER, type PartGroupNodeData } from './types';
import { HEADER_H } from './graphLayout';

function StatusBar({ counts, total }: { counts: PartGroupNodeData['statusCounts']; total: number }) {
  if (total === 0) return null;
  return (
    <Box sx={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', width: '100%' }}>
      {STATUS_ORDER.map((s) => {
        const c = counts[s] ?? 0;
        if (c === 0) return null;
        return <Box key={s} sx={{ width: `${(c / total) * 100}%`, background: STATUS_COLOR[s] }} />;
      })}
    </Box>
  );
}

function PartGroupNode({ data }: NodeProps) {
  const d = data as unknown as PartGroupNodeData;
  const name = d.itemName ?? `Item #${d.itemId}`;
  const Header = (
    <Box
      sx={{
        height: HEADER_H, boxSizing: 'border-box', px: 0.75,
        display: 'flex', alignItems: 'center', gap: 0.5,
      }}
    >
      {/* A plus/minus, not a chevron. This control opens one BOM LEVEL — the
          part's own operations plus its direct sub-assemblies — and "+" is the
          universal sign for "there is more underneath here", where a chevron
          reads as "this row scrolls". The title says what's inside so nobody
          has to click to find out. */}
      <IconButton
        size="small"
        onClick={() => d.onToggle(d.itemId)}
        sx={{ p: 0.25 }}
        title={d.collapsed
          ? `Open ${d.totalCount} operation${d.totalCount === 1 ? '' : 's'}${d.childPartCount ? ` and ${d.childPartCount} sub-assembl${d.childPartCount === 1 ? 'y' : 'ies'}` : ''}`
          : 'Close this level'}
        aria-label={d.collapsed ? `Expand ${name}` : `Collapse ${name}`}
      >
        {d.collapsed
          ? <AddBoxOutlined sx={{ fontSize: 18 }} />
          : <IndeterminateCheckBoxOutlined sx={{ fontSize: 18 }} />}
      </IconButton>
      <Typography
        title={name}
        sx={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {name}
      </Typography>
      <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', flexShrink: 0 }}>
        {d.doneCount}/{d.totalCount}
      </Typography>
    </Box>
  );

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ width: 8, height: 8, background: 'var(--c-graph-edge-component)', border: 'none' }} />

      <Box
        sx={{
          width: '100%', height: '100%', boxSizing: 'border-box',
          borderRadius: 'var(--r-md, 8px)',
          border: `1.5px ${d.collapsed ? 'solid' : 'dashed'} var(--c-graph-lane)`,
          background: d.collapsed ? 'var(--c-surface)' : 'var(--c-surface-2)',
          boxShadow: d.collapsed ? 'var(--e-1)' : 'none',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {Header}
        {d.collapsed && (
          <Box sx={{ px: 1, pb: 1, pt: 0.25, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <StatusBar counts={d.statusCounts} total={d.totalCount} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography sx={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>
                {d.totalCount} operation{d.totalCount === 1 ? '' : 's'}
              </Typography>
              {/* The sub-assembly count is the honest answer to "how much is
                  hidden behind this +". Without it the drill-down is a guess. */}
              {d.childPartCount > 0 && (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--c-primary-600)' }}>
                  <AccountTreeRounded sx={{ fontSize: 12 }} aria-hidden />
                  <Typography sx={{ fontSize: 10.5, fontWeight: 600 }}>
                    +{d.childPartCount} part{d.childPartCount === 1 ? '' : 's'}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>

      <Handle type="source" position={Position.Right} style={{ width: 8, height: 8, background: 'var(--c-graph-edge-component)', border: 'none' }} />
    </>
  );
}

export default memo(PartGroupNode);
