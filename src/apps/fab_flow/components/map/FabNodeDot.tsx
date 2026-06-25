import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FAB_DOT_CY } from '../../utils/mapLayout';

const LEVEL_COLORS: Record<string, string> = {
  Assembly:        '#6366f1',
  'Sub-Assembly':  '#3b82f6',
  'Sub-assembly':  '#3b82f6',
  Component:       '#10b981',
  Material:        '#f97316',
  Part:            '#8b5cf6',
};
const DEFAULT_COLOR = '#94a3b8';
const HANDLE_TOP = FAB_DOT_CY - 4; // top edge so centre aligns with pill midline

function FabNodeDot({ data, selected }: NodeProps) {
  const d    = data as Record<string, unknown>;
  const cp   = d.onCriticalPath as boolean;
  const col  = LEVEL_COLORS[(d.levelName as string) ?? ''] ?? DEFAULT_COLOR;
  const accent = cp ? '#ef4444' : col;
  const qty  = d.quantity as number | null;

  const borderColor = selected ? accent : cp ? `${accent}88` : '#e2e8f0';
  const boxShadow   = selected
    ? `0 0 0 2px ${accent}44`
    : cp
    ? `0 2px 8px ${accent}22`
    : '0 1px 3px rgba(0,0,0,0.07)';

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{ top: HANDLE_TOP, transform: 'none', width: 0, height: 0, opacity: 0, border: 'none', background: 'transparent' }}
      />

      <div style={{
        width: 184,
        height: 32,
        display: 'flex',
        alignItems: 'stretch',
        borderRadius: 16,
        background: '#fff',
        border: `1.5px solid ${borderColor}`,
        boxShadow,
        overflow: 'hidden',
        cursor: 'default',
        userSelect: 'none',
      }}>
        {/* Left accent bar */}
        <div style={{ width: 4, flexShrink: 0, background: accent, borderRadius: '14px 0 0 14px' }} />

        {/* Text content */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 10px 0 8px',
          minWidth: 0,
          gap: 1,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: cp ? '#92400e' : '#1e293b',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.3,
              fontFamily: 'system-ui, sans-serif',
            }}>
              {d.nodeCode as string}
            </span>
            {qty != null && qty > 1 && (
              <span style={{
                fontSize: 9,
                fontWeight: 800,
                color: '#fff',
                background: accent,
                borderRadius: 4,
                padding: '1px 4px',
                flexShrink: 0,
                lineHeight: 1.3,
                fontFamily: 'system-ui, sans-serif',
              }}>
                ×{qty}
              </span>
            )}
          </div>
          <span style={{
            fontSize: 9,
            color: '#64748b',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.3,
            fontFamily: 'system-ui, sans-serif',
          }}>
            {d.displayName as string}
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{ top: HANDLE_TOP, transform: 'none', width: 0, height: 0, opacity: 0, border: 'none', background: 'transparent' }}
      />
    </>
  );
}

export default memo(FabNodeDot);
