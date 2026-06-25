import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Box, Chip, Typography } from '@mui/material';
import { STEP_NODE_W } from '../../utils/mapLayout';

const TYPE_COLORS: Record<string, string> = {
  Cutting:    '#3b82f6',
  Welding:    '#ef4444',
  Drilling:   '#8b5cf6',
  'Fit-up':   '#f59e0b',
  Fitting:    '#f59e0b',
  Inspection: '#10b981',
  Blasting:   '#64748b',
  Painting:   '#ec4899',
  Assembly:   '#f97316',
  Marking:    '#06b6d4',
  Grinding:   '#a16207',
};
const DEFAULT_COLOR = '#6366f1';

function fmtTime(v: number | null, u: string | null): string {
  if (v == null || v === 0) return '';
  const unit = (u ?? 'min').toLowerCase();
  return unit.startsWith('h') ? `${v}h` : `${v}m`;
}

const ROLE_BG: Record<string, string> = {
  Output:    '#dcfce7',
  Input:     '#dbeafe',
  'Worked-On': '#fef9c3',
  Consumed:  '#fee2e2',
  Reference: '#f1f5f9',
};
const ROLE_FG: Record<string, string> = {
  Output:    '#166534',
  Input:     '#1e40af',
  'Worked-On': '#92400e',
  Consumed:  '#991b1b',
  Reference: '#334155',
};

function ProcessStepNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const cp = d.onCriticalPath as boolean;
  const col = TYPE_COLORS[d.processType as string] ?? DEFAULT_COLOR;
  const timeStr = fmtTime(d.estimatedTimeValue as number | null, d.estimatedTimeUnit as string | null);
  const maps = (d.nodeMaps as Array<Record<string, unknown>>) ?? [];

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ width: 8, height: 8, background: col, border: 'none' }} />
      <Box
        sx={{
          width: STEP_NODE_W,
          borderRadius: '10px',
          border: `2px solid ${cp ? '#ef4444' : selected ? '#6366f1' : '#e2e8f0'}`,
          bgcolor: cp ? '#fff1f2' : 'background.paper',
          boxShadow: selected
            ? `0 0 0 3px #6366f133, 0 2px 8px #0002`
            : cp
            ? '0 2px 12px #ef444455'
            : '0 1px 3px #0001',
          overflow: 'hidden',
          cursor: 'default',
          transition: 'box-shadow 0.15s, border-color 0.15s',
        }}
      >
        {/* Type color bar */}
        <Box sx={{ height: 4, bgcolor: col }} />

        <Box sx={{ px: 1.2, pt: 0.6, pb: 0.8 }}>
          {/* Code row */}
          <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', lineHeight: 1.2, fontFamily: 'monospace' }}>
            {d.processStepCode as string}
            {d.parallelGroup ? ` · ${d.parallelGroup}` : ''}
          </Typography>

          {/* Name + time */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mt: 0.2 }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, lineHeight: 1.3, flex: 1, mr: 0.5 }}>
              {d.processName as string}
            </Typography>
            {timeStr && (
              <Typography
                sx={{
                  fontSize: '0.72rem',
                  fontWeight: cp ? 800 : 500,
                  color: cp ? '#dc2626' : 'text.secondary',
                  flexShrink: 0,
                }}
              >
                {timeStr}
              </Typography>
            )}
          </Box>

          {/* Machine type */}
          {d.machineOrWorkcentreType && (
            <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', mt: 0.2, lineHeight: 1 }}>
              {d.machineOrWorkcentreType as string}
            </Typography>
          )}

          {/* Participating nodes */}
          {maps.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.3, mt: 0.5 }}>
              {maps.slice(0, 5).map((nm) => (
                <Chip
                  key={nm.nodeId as number}
                  label={nm.nodeCode as string}
                  size="small"
                  sx={{
                    height: 15,
                    fontSize: '0.55rem',
                    px: 0.2,
                    bgcolor: ROLE_BG[nm.nodeRole as string] ?? '#f1f5f9',
                    color: ROLE_FG[nm.nodeRole as string] ?? '#334155',
                    fontWeight: 600,
                    '& .MuiChip-label': { px: 0.5 },
                  }}
                />
              ))}
              {maps.length > 5 && (
                <Chip
                  label={`+${maps.length - 5}`}
                  size="small"
                  sx={{ height: 15, fontSize: '0.55rem', bgcolor: '#f1f5f9', color: '#64748b', '& .MuiChip-label': { px: 0.5 } }}
                />
              )}
            </Box>
          )}
        </Box>
      </Box>
      <Handle type="source" position={Position.Right} style={{ width: 8, height: 8, background: col, border: 'none' }} />
    </>
  );
}

export default memo(ProcessStepNode);
