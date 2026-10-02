import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { Box, Button, Collapse, IconButton, Tooltip } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import ZoomOutMapRounded from '@mui/icons-material/ZoomOutMapRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import type { Nest, NestRules } from '../../api/types';
import { kg, mm } from '../../lib/nesting';
import {
  DIAGRAM_COLOURS as C, DIM_ZOOM, LEGEND, clampZoom, dim, dimensionLabels, laidOut, ruleBadge, seqBoxes, seqColour,
  seqGaps, sharedCuts,
} from '../../lib/nestDiagram';

/**
 * ONE PLATE, DRAWN SO IT CAN BE JUDGED — and zoomed until it can be measured.
 *
 * Replaces the static drawing (2026-10-02, the user: "highlight kerfing and
 * other things with different colours so we know if it is optimal and if it is
 * following the rules … like different sequences, give a boundary … when we
 * zoom in, give dimensions on the same diagram"). The colours are explained in
 * lib/nestDiagram.ts and the legend under the drawing says the same.
 *
 * ZOOM AND PAN move the SVG's viewBox, nothing else: the wheel zooms about the
 * pointer, two fingers pinch, a drag pans, and the buttons do the same for a
 * keyboard. Every size that has to be READ is set in pixels and converted back
 * to millimetres at the current scale, so type stays the same size however far
 * in you go. At DIM_ZOOM and above the drawing carries its own dimensions —
 * part L × W, shared-kerf widths, sequence gaps, offcut sizes, the plate — but
 * only those that fit where they would go (lib/nestDiagram.dimensionLabels).
 *
 * ONLY THE OPEN PLATE IS DRAWN LIKE THIS. A line can hold a hundred plates;
 * the others are PlateThumb — rectangles and nothing else.
 */

const PX = {
  label: 11,       // sequence tags and the plate size
  dim: 10.5,       // dimension labels
  gutterTop: 22,   // room above the plate for its size
  pad: 8,
};

export const PlateRuleBadge = memo(function PlateRuleBadge({ rules, compact = false }: { rules: NestRules | null | undefined; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const b = ruleBadge(rules);
  const tone = b.tone === 'success' ? 'success' : b.tone === 'warning' ? 'warning' : 'neutral';
  const chip = (
    <Box component="span" data-testid="rule-badge" data-status={rules?.status ?? 'none'} sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.9, py: 0.15, borderRadius: 999, fontSize: 12.5, fontWeight: 600,
      background: `var(--c-${tone}-50)`, color: `var(--c-${tone === 'neutral' ? 'text-2' : `${tone}-800`})`,
      border: `1px solid var(--c-${tone === 'neutral' ? 'border' : `${tone}-200`})`, whiteSpace: 'nowrap',
    }}>
      <span aria-hidden>{b.mark}</span>{b.label}
      {rules?.utilisationPct != null && <Box component="span" sx={{ fontWeight: 500, color: 'var(--c-text-2)' }}>{` · ${rules.utilisationPct.toFixed(1)}% used`}</Box>}
    </Box>
  );
  if (compact || !rules) return chip;
  return (
    <Box sx={{ minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        {chip}
        {rules.sharedCuts > 0 && (
          <Box component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
            {`${rules.sharedCuts} shared ${rules.sharedCuts === 1 ? 'cut' : 'cuts'} · ${mm(rules.sharedLengthMm)} mm cut once`}
          </Box>
        )}
        <Button size="small" onClick={() => setOpen((o) => !o)} endIcon={open ? <ExpandLessRounded /> : <ExpandMoreRounded />} sx={{ py: 0 }}>
          {open ? 'Hide the checks' : 'Why'}
        </Button>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box component="ul" data-testid="rule-checks" sx={{ m: 0, pl: 0, listStyle: 'none', display: 'grid', gap: 0.4, fontSize: 12.5 }}>
          {rules.checks.map((c) => (
            <Box component="li" key={c.key} sx={{ display: 'flex', gap: 0.75, alignItems: 'baseline', minWidth: 0 }}>
              <Box component="span" aria-hidden sx={{ width: 14, flexShrink: 0, fontWeight: 700, color: c.ok === false ? 'var(--c-warning-600)' : c.ok ? 'var(--c-success-600)' : 'var(--c-text-3)' }}>
                {c.ok === false ? '⚠' : c.ok ? '✓' : '–'}
              </Box>
              <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <strong>{c.label}</strong>
                <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{` — ${c.detail}`}</Box>
              </Box>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
});

/** A cheap picture of a plate: its parts by sequence, nothing else. For the strip of plates. */
export const PlateThumb = memo(function PlateThumb({ nest, width = 132 }: { nest: Nest; width?: number }) {
  const L = nest.length || 1;
  const W = nest.width || 1;
  const h = Math.max(18, Math.min(80, (width * W) / L));
  const pieces = laidOut(nest.pieces);
  return (
    <Box component="svg" viewBox={`0 0 ${L} ${W}`} width={width} height={h} preserveAspectRatio="none" aria-hidden sx={{ display: 'block' }}>
      <rect x={0} y={0} width={L} height={W} fill={C.scrap} />
      {pieces.map((p, i) => (
        <rect key={i} x={p.x} y={W - p.y - p.width} width={p.length} height={p.width} fill={seqColour(p.seqNo)} />
      ))}
    </Box>
  );
});

function Swatch({ children, label, help }: { children: ReactNode; label: string; help?: string }) {
  const body = (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, fontSize: 12, color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>
      <Box component="svg" width={18} height={12} viewBox="0 0 18 12" aria-hidden sx={{ flexShrink: 0 }}>{children}</Box>
      {label}
    </Box>
  );
  return help ? <Tooltip title={help}><span>{body}</span></Tooltip> : body;
}

const SHOWN_SEQ = 10;

/** The legend: sequences first (they are the cut order), then what the other colours are. */
export function DiagramLegend({ seqs }: { seqs: number[] }) {
  return (
    <Box data-testid="diagram-legend" sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', alignItems: 'center', minWidth: 0 }}>
      {seqs.slice(0, SHOWN_SEQ).map((s) => (
        <Swatch key={s} label={`Seq ${s}`} help={`Sequence ${s}: cut whole, in this order.`}>
          <rect x={1} y={1} width={16} height={10} rx={2} fill={seqColour(s)} stroke={seqColour(s)} strokeDasharray="3 2" />
        </Swatch>
      ))}
      {seqs.length > SHOWN_SEQ && <Box component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{`+${seqs.length - SHOWN_SEQ} more`}</Box>}
      {LEGEND.map((l) => (
        <Swatch key={l.key} label={l.label} help={l.help}>
          {l.key === 'kerf' && <rect x={1} y={1} width={16} height={10} fill={C.kerf} stroke={C.kerfEdge} strokeWidth={0.8} />}
          {l.key === 'shared' && <line x1={2} y1={6} x2={16} y2={6} stroke={C.shared} strokeWidth={2.5} />}
          {l.key === 'rim' && <><rect x={1} y={1} width={16} height={10} fill={C.rim} /><rect x={4} y={3.5} width={10} height={5} fill="var(--c-surface)" stroke={C.rimEdge} strokeDasharray="2 1.5" strokeWidth={0.8} /></>}
          {l.key === 'offcut' && <><rect x={1} y={1} width={16} height={10} fill={C.offcutFill} stroke={C.offcut} strokeWidth={0.8} /><path d="M1 11L11 1M7 11L17 1" stroke={C.offcut} strokeWidth={1} /></>}
          {l.key === 'scrap' && <rect x={1} y={1} width={16} height={10} fill={C.scrap} stroke={C.scrapLine} strokeWidth={0.8} />}
        </Swatch>
      ))}
    </Box>
  );
}

/** Zoom steps for the buttons. The wheel moves in finer steps. */
const STEP = 1.6;

export function PlateDiagram({ nest, kerfMm, title }: {
  nest: Nest;
  /** The kerf this plate was laid out with (the group's / the lot's). */
  kerfMm: number;
  title?: string;
}) {
  const uid = useId().replace(/[^\w-]/g, '');
  const box = useRef<HTMLDivElement | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  const [cw, setCw] = useState(0);
  const [zoom, setZoom] = useState(1);
  // Centre of the window, drawing space (mm, y down). Null = centred on the plate.
  const [centre, setCentre] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    setCw(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => setCw(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const L = nest.length || 1;
  const W = nest.width || 1;
  const k = Number(kerfMm) || 0;
  const width = Math.max(cw, 240);
  // The whole plate with a little room round it; the box is as tall as the plate's shape asks, within reason.
  const pad = (PX.pad / width) * L;
  const totalL = L + 2 * pad;
  const topRoom = (PX.gutterTop / width) * totalL;
  const totalW = W + topRoom + pad;
  const height = Math.round(Math.min(560, Math.max(170, (width * totalW) / totalL)));
  const s0 = Math.min(width / totalL, height / totalW);
  const scale = s0 * zoom;                         // px per mm
  const u = (px: number) => px / scale;            // px -> mm at this zoom
  const vw = width / scale;
  const vh = height / scale;
  const home = { x: L / 2, y: (W - topRoom + pad) / 2 };
  const c0 = centre ?? home;
  // Keep the window over the plate: never pan it off screen. A window wider
  // than the plate (zoomed out) sits on the plate's centre.
  const within = (v: number, lo: number, hi: number, mid: number) => (lo > hi ? mid : Math.min(hi, Math.max(lo, v)));
  const cx = within(c0.x, vw / 2 - pad, L + pad - vw / 2, home.x);
  const cy = within(c0.y, vh / 2 - topRoom, W + pad - vh / 2, home.y);
  const view = { x: cx - vw / 2, y: cy - vh / 2, w: vw, h: vh };
  const fy = useCallback((y: number, h = 0) => W - y - h, [W]);

  const pieces = useMemo(() => laidOut(nest.pieces), [nest]);
  const boxes = useMemo(() => seqBoxes(pieces), [pieces]);
  const cuts = useMemo(() => sharedCuts(pieces, k), [pieces, k]);
  const gaps = useMemo(() => seqGaps(boxes), [boxes]);
  const offcuts = useMemo(() => nest.offcuts ?? [], [nest]);
  const dims = dimensionLabels({ zoom, scale, fontPx: PX.dim, pieces, kerf: k, cuts, gaps, offcuts, view, flipY: (y) => fy(y) });
  const showDims = zoom >= DIM_ZOOM;

  // ---- interaction --------------------------------------------------------
  // Several wheel or pinch events can land between two renders, so each one
  // reads and writes the LIVE view, not the one this render closed over.
  const live = useRef({ zoom, cx, cy });
  live.current = { zoom, cx, cy };
  const zoomAt = (factor: number, at?: { x: number; y: number }) => {
    const cur = live.current;
    const next = clampZoom(cur.zoom * factor);
    if (Math.abs(next - cur.zoom) < 1e-9) return;
    if (next <= 1) { live.current = { zoom: 1, cx: home.x, cy: home.y }; setZoom(1); setCentre(null); return; }
    // Keep the point under the pointer where it is.
    const r = cur.zoom / next;
    const c2 = at ? { x: at.x + (cur.cx - at.x) * r, y: at.y + (cur.cy - at.y) * r } : { x: cur.cx, y: cur.cy };
    live.current = { zoom: next, cx: c2.x, cy: c2.y };
    setZoom(next);
    setCentre(c2);
  };

  // Pixel point -> drawing space, at the CURRENT window.
  const toDrawing = (clientX: number, clientY: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r || !r.width) return undefined;
    return { x: view.x + ((clientX - r.left) / r.width) * view.w, y: view.y + ((clientY - r.top) / r.height) * view.h };
  };

  // The wheel must not scroll the page while it zooms — a non-passive listener.
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, toDrawing(e.clientX, e.clientY));
  };
  useEffect(() => {
    const el = svg.current;
    if (!el) return undefined;
    const h = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  // Drag pans; two pointers pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number } | null>(null);
  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  };
  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.d > 0 && Math.abs(d - pinch.current.d) > 2) {
        zoomAt(d / pinch.current.d, toDrawing((a.x + b.x) / 2, (a.y + b.y) / 2));
        pinch.current = { d };
      }
      return;
    }
    if (zoom <= 1) return;
    const dx = (e.clientX - prev.x) / scale;
    const dy = (e.clientY - prev.y) / scale;
    if (dx || dy) setCentre({ x: cx - dx, y: cy - dy });
  };
  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const fit = () => { setZoom(1); setCentre(null); };

  const seqs = boxes.map((b) => b.seqNo);
  const hatch = `nd-offcut-${uid}`;
  const scrapHatch = `nd-scrap-${uid}`;
  const clip = `nd-clip-${uid}`;
  const reqL = nest.requiredLength;
  const reqW = nest.requiredWidth;
  const stroke = (px: number) => ({ strokeWidth: px, vectorEffect: 'non-scaling-stroke' as const });

  return (
    <Box sx={{ minWidth: 0, width: '100%', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
        <Box sx={{ fontSize: 12, color: 'var(--c-text-3)', flex: '1 1 200px', minWidth: 0 }}>
          {showDims
            ? 'Dimensions in mm. Drag to move, wheel or pinch to zoom.'
            : `Zoom in (${DIM_ZOOM}× or more) to see dimensions. Wheel or pinch to zoom, drag to move.`}
        </Box>
        <Tooltip title="Zoom out"><span>
          <IconButton size="small" aria-label="Zoom out" onClick={() => zoomAt(1 / STEP)} disabled={zoom <= 1}><RemoveRounded fontSize="small" /></IconButton>
        </span></Tooltip>
        <Box component="span" data-testid="zoom-level" sx={{ fontSize: 12, minWidth: 36, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{`${zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)}×`}</Box>
        <Tooltip title="Zoom in"><span>
          <IconButton size="small" aria-label="Zoom in" onClick={() => zoomAt(STEP)} disabled={zoom >= 40}><AddRounded fontSize="small" /></IconButton>
        </span></Tooltip>
        <Tooltip title="Whole plate"><span>
          <IconButton size="small" aria-label="Fit the plate" onClick={fit} disabled={zoom === 1 && !centre}><ZoomOutMapRounded fontSize="small" /></IconButton>
        </span></Tooltip>
      </Box>

      <Box ref={box} sx={{ minWidth: 0, width: '100%', overflow: 'hidden', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', background: 'var(--c-surface)' }}>
        <svg
          ref={svg}
          role="img"
          aria-label={title ?? `${nest.lotNo ?? 'Plate'}: ${pieces.length} pieces in ${boxes.length} sequences${offcuts.length ? `, ${offcuts.length} offcuts` : ''}`}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          width={width}
          height={height}
          data-zoom={zoom}
          style={{ display: 'block', touchAction: 'none', cursor: zoom > 1 ? 'grab' : 'default', userSelect: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={(e) => zoomAt(STEP, toDrawing(e.clientX, e.clientY))}
        >
          <defs>
            <pattern id={hatch} patternUnits="userSpaceOnUse" width={u(7)} height={u(7)} patternTransform="rotate(45)">
              <rect width={u(7)} height={u(7)} fill={C.offcutFill} />
              <line x1={0} y1={0} x2={0} y2={u(7)} stroke={C.offcut} strokeWidth={u(1.4)} />
            </pattern>
            <pattern id={scrapHatch} patternUnits="userSpaceOnUse" width={u(9)} height={u(9)} patternTransform="rotate(-45)">
              <rect width={u(9)} height={u(9)} fill={C.scrap} />
              <line x1={0} y1={0} x2={0} y2={u(9)} stroke={C.scrapLine} strokeWidth={u(1)} />
            </pattern>
            <clipPath id={clip}><rect x={0} y={0} width={L} height={W} /></clipPath>
          </defs>

          {/* The plate: scrap unless something better claims the steel. */}
          <rect x={0} y={0} width={L} height={W} fill={`url(#${scrapHatch})`} stroke="var(--c-text-2)" {...stroke(1.4)} />

          {/* Offcuts — kept, claimable. */}
          {offcuts.map((o) => {
            const d = (o.outline ?? []).filter((poly) => poly.length >= 3)
              .map((poly) => `M${poly.map(([x, y]) => `${x},${fy(y)}`).join('L')}Z`).join(' ');
            return d ? (
              <path key={o.offcutNo} d={d} fill={`url(#${hatch})`} fillRule="evenodd" stroke={C.offcut} {...stroke(1)}>
                <title>{`Offcut ${o.offcutNo} — kept, ${kg(o.weightKg)} kg${o.rect ? `\nusable ${mm(o.rect.length)} × ${mm(o.rect.width)} mm` : ''}`}</title>
              </path>
            ) : null;
          })}

          <g clipPath={`url(#${clip})`}>
            {/* Rim: the kerf-wide band the plate edge is cut in. */}
            {k > 0 && (
              <path d={`M0,0H${L}V${W}H0Z M${k},${k}V${W - k}H${L - k}V${k}Z`} fill={C.rim} fillRule="evenodd" opacity={0.9}>
                <title>{`Rim: ${dim(k)} mm cut off every plate edge`}</title>
              </path>
            )}
            {/* Kerf: the halo round every part. Shared boundaries overlap, so they read as one band. */}
            {k > 0 && pieces.map((p, i) => (
              <rect key={`k${i}`} x={p.x - k} y={fy(p.y, p.width) - k} width={p.length + 2 * k} height={p.width + 2 * k} fill={C.kerf} />
            ))}
          </g>
          {k > 0 && (
            <rect x={k} y={k} width={Math.max(0, L - 2 * k)} height={Math.max(0, W - 2 * k)} fill="none" stroke={C.rimEdge} strokeDasharray="5 4" {...stroke(1)} />
          )}

          {/* Sequence boundaries: a dashed outline round each sequence, tagged with its number. */}
          {boxes.map((b) => (
            <g key={`s${b.seqNo}`}>
              <rect x={b.x0 - k / 2} y={fy(b.y1) - k / 2} width={b.x1 - b.x0 + k} height={b.y1 - b.y0 + k}
                fill="none" stroke={seqColour(b.seqNo)} strokeDasharray="7 4" {...stroke(1.6)} />
              {(b.y1 - b.y0) * scale >= PX.label + 2 && (
                <text x={b.x0 + u(3)} y={fy(b.y1) + u(PX.label)} fontSize={u(PX.label)} fontWeight={700} fill={seqColour(b.seqNo)}
                  pointerEvents="none" style={{ paintOrder: 'stroke', stroke: 'var(--c-surface)', strokeWidth: u(3) }}>
                  {`S${b.seqNo}`}
                </text>
              )}
            </g>
          ))}

          {/* The parts, by sequence. */}
          {pieces.map((p) => (
            <rect key={`${p.seqNo}-${p.rowNo}-${p.posNo}-${p.x}-${p.y}`} x={p.x} y={fy(p.y, p.width)} width={p.length} height={p.width}
              fill={seqColour(p.seqNo)} fillOpacity={0.85} stroke="var(--c-surface)" {...stroke(0.6)}>
              <title>
                {`${p.cutPlateCode} — sequence ${p.seqNo}, row ${p.rowNo}, position ${p.posNo}`
                  + `\n${mm(p.length)} × ${mm(p.width)} mm${p.rotated ? ' (turned)' : ''} at ${mm(p.x)}, ${mm(p.y)}`}
              </title>
            </rect>
          ))}

          {/* Shared cuts — one cut serving two parts. */}
          {cuts.map((c2, i) => (
            <line key={`c${i}`} x1={c2.x1} y1={fy(c2.y1)} x2={c2.x2} y2={fy(c2.y2)} stroke={C.shared} strokeLinecap="round" {...stroke(2.2)}>
              <title>{`Shared cut: ${dim(c2.length)} mm cut once (kerf ${dim(k)} mm)`}</title>
            </line>
          ))}

          {/* What the layout needs, dashed, against the plate bought. */}
          {reqL != null && reqW != null && (
            <rect x={0} y={fy(0, Math.min(reqW, W))} width={Math.min(reqL, L)} height={Math.min(reqW, W)}
              fill="none" stroke="var(--c-primary-600)" strokeDasharray="2 3" {...stroke(1)} />
          )}

          {/* The plate's size, always; at zoom, as dimension lines along two edges. */}
          <text x={0} y={-u(6)} fontSize={u(PX.label)} fill="var(--c-text-2)" pointerEvents="none">
            {`Plate ${mm(L)} × ${mm(W)}${reqL != null && reqW != null ? ` · needs ${mm(reqL)} × ${mm(reqW)}` : ''}`}
          </text>
          {showDims && (
            <g data-dim="plate" pointerEvents="none">
              <line x1={0} y1={-u(2)} x2={L} y2={-u(2)} stroke="var(--c-text-3)" {...stroke(0.8)} />
              <line x1={L + u(3)} y1={0} x2={L + u(3)} y2={W} stroke="var(--c-text-3)" {...stroke(0.8)} />
              <text x={L - u(2)} y={-u(6)} fontSize={u(PX.dim)} textAnchor="end" fill="var(--c-text-2)">{`${dim(L)}`}</text>
              <text x={L + u(5)} y={W / 2} fontSize={u(PX.dim)} fill="var(--c-text-2)" dominantBaseline="central"
                transform={`rotate(90 ${L + u(5)} ${W / 2})`} textAnchor="middle">{`${dim(W)}`}</text>
            </g>
          )}

          {/* Dimensions: only those that fit, decluttered. */}
          {dims.map((d) => (
            <text key={d.key} data-dim={d.kind} x={d.x} y={d.y} fontSize={u(PX.dim)} textAnchor="middle" dominantBaseline="central"
              fill={d.fill} fontWeight={d.kind === 'part' ? 600 : 500} pointerEvents="none"
              transform={d.vertical ? `rotate(-90 ${d.x} ${d.y})` : undefined}
              style={{ fontVariantNumeric: 'tabular-nums', ...(d.kind === 'part' ? {} : { paintOrder: 'stroke', stroke: 'var(--c-surface)', strokeWidth: u(3) }) }}>
              {d.text}
            </text>
          ))}
        </svg>
      </Box>
      <DiagramLegend seqs={seqs} />
    </Box>
  );
}
