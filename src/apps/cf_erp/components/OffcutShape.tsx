import { Box } from '@mui/material';
import type { Offcut } from '../api/types';
import { outlinePath } from '../lib/offcutShape';

/** What is left of a stock bar has no outline: it is a length, drawn as a bar. */
function BarShape({ width, height, title, lengthMm }: { width: number; height: number; title?: string; lengthMm: number }) {
  const h = Math.min(height, 14);
  return (
    <svg data-testid="offcut-bar" role="img" aria-label={title ?? `Bar offcut, ${Math.round(lengthMm)} mm`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <rect x={1} y={(height - h) / 2} width={width - 2} height={h} rx={2} fill="var(--c-primary-100)" stroke="var(--c-primary-600)" strokeWidth={1.5} />
    </svg>
  );
}

export function OffcutShape({ offcut, width = 120, height = 60, title }: { offcut: Pick<Offcut, 'outline' | 'bbox' | 'rect'> & Partial<Pick<Offcut, 'kind' | 'lengthMm'>>; width?: number; height?: number; title?: string }) {
  if (offcut.kind === 'bar' && offcut.lengthMm && !(offcut.outline ?? []).length) return <BarShape width={width} height={height} title={title} lengthMm={offcut.lengthMm} />;
  const rings = (offcut.outline ?? []).filter((r) => Array.isArray(r) && r.length >= 3);
  const pts = rings.flat();
  const bbox = offcut.bbox ?? (pts.length
    ? { x: Math.min(...pts.map((p) => p[0])), y: Math.min(...pts.map((p) => p[1])), length: Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])), width: Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1])) }
    : null);
  const d = outlinePath(offcut.outline, bbox);
  if (!d || !bbox || !(bbox.length > 0) || !(bbox.width > 0)) {
    return (
      <Box data-testid="offcut-shape-empty" role="img" aria-label="No outline" sx={{ width, height, display: 'grid', placeItems: 'center', border: '1px dashed var(--c-border)', borderRadius: 'var(--r-sm)', color: 'var(--c-text-3)', fontSize: 11 }}>
        no outline
      </Box>
    );
  }
  const r = offcut.rect;
  return (
    <svg data-testid="offcut-shape" role="img" aria-label={title ?? 'Offcut outline'} width={width} height={height} viewBox={`0 0 ${bbox.length} ${bbox.width}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      <path d={d} fillRule="evenodd" fill="var(--c-primary-100)" stroke="var(--c-primary-600)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {r && r.length > 0 && r.width > 0 && (
        <rect data-testid="offcut-rect" x={0} y={0} width={Math.min(r.length, bbox.length)} height={Math.min(r.width, bbox.width)} fill="none" stroke="var(--c-text-2)" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}
