/**
 * StatusLegend.tsx — legend for the Task DAG / Task Engine graph (EU-3):
 * status color swatches + the flow-vs-component edge distinction.
 *
 * `inline` drops the card chrome for use inside the graph's docked toolbar
 * (Phase 6b) — the legend used to float over the canvas in a React Flow Panel,
 * covering the top-right corner, which is exactly where a left-to-right dagre
 * layout puts the end of the graph.
 */

import { Box, Typography } from '@mui/material';
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER, type TaskStatus } from './types';

// `cancelled` is filtered out by the backend, so it never renders — hide it.
const VISIBLE: TaskStatus[] = STATUS_ORDER.filter((s) => s !== 'cancelled');

export default function StatusLegend({ inline = false }: { inline?: boolean }) {
  return (
    <Box
      sx={{
        display: 'flex', flexWrap: 'wrap', gap: inline ? 1.25 : 0.5,
        ...(inline
          ? { alignItems: 'center' }
          : {
            flexDirection: 'column',
            p: 1, borderRadius: 'var(--r-md, 8px)',
            background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--e-1)',
          }),
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {VISIBLE.map((s) => (
          <Box key={s} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {/* The swatch border was rgba(0,0,0,.15) — invisible against a dark
                surface, so in dark mode the chips lost their edge. */}
            <Box sx={{ width: 10, height: 10, borderRadius: '3px', background: STATUS_COLOR[s], border: '1px solid var(--c-border)' }} />
            <Typography sx={{ fontSize: 11, color: 'var(--c-text-2)' }}>{STATUS_LABEL[s]}</Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, ...(inline ? {} : { mt: 0.25 }) }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 18, height: 0, borderTop: '2px solid var(--c-graph-edge-flow)' }} />
          <Typography sx={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>Process step</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 18, height: 0, borderTop: '2px dashed var(--c-graph-edge-component)' }} />
          <Typography sx={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>BOM component</Typography>
        </Box>
      </Box>
    </Box>
  );
}
