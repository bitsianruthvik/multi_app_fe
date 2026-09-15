/**
 * NestSheetSvg — draws one sheet: the plate outline, every piece cut from it,
 * and what is left over.
 *
 * ── WHY THE LAYOUT IS A PREVIEW, NOT THE SERVER'S OWN CUT ────────────────────
 *
 * The packer's real per-piece placement (x/y/rotated) lives only inside
 * `nestingPacker.js`'s working `plate.pieces` array (PLAN.md EU-10) —
 * `blankPlanService.js` never forwards it onto the `nests[]` this screen
 * receives; it only aggregates to `items[{key,qty}]`. Reproducing the server's
 * actual guillotine cuts would mean editing that file, which is outside
 * EU-18's file list. So absent a real `pieces` prop, this draws a
 * DETERMINISTIC shelf layout of the same rectangles instead — the right
 * pieces, the right plate, an illustrative arrangement rather than the literal
 * cut plan. If a later EU threads real geometry through, pass it as `pieces`
 * and this stops synthesising one — no prop-shape change needed either side.
 */
import { useId, useMemo } from 'react';
import { Box } from '@mui/material';
import type { NestItem } from '../api/blanks';

export interface PlacedPiece {
  key: string;
  name: string;
  /** 1-based, within this piece's own item — "piece 3 of 36". */
  index: number;
  qty: number;
  x: number; y: number; l: number; w: number;
  rotated: boolean;
}

interface FreeRect { x: number; y: number; l: number; w: number }

const CHART_COLOURS = [
  'var(--c-chart-1)', 'var(--c-chart-2)', 'var(--c-chart-3)', 'var(--c-chart-4)',
  'var(--c-chart-5)', 'var(--c-chart-6)', 'var(--c-chart-7)', 'var(--c-chart-8)',
];
function colourFor(key: string, order: string[]) {
  const i = order.indexOf(key);
  return CHART_COLOURS[(i < 0 ? 0 : i) % CHART_COLOURS.length];
}

/** `"20 × 150 × 6000"` (thickness × width × length) → `{width, length}`. */
function parseRect(rectStr: string): { width: number; length: number } | null {
  const m = /^\s*[\d.]+\s*×\s*([\d.]+)\s*×\s*([\d.]+)\s*$/.exec(rectStr);
  if (!m) return null;
  const width = Number(m[1]);
  const length = Number(m[2]);
  return Number.isFinite(width) && Number.isFinite(length) ? { width, length } : null;
}

/**
 * Shelf-pack every item's pieces onto the plate, widest-first. This is NOT the
 * server's own cut (see file header) — a legible, deterministic stand-in so
 * the screen shows real rectangles instead of a bar and a percentage.
 */
function shelfPack(
  plateLength: number,
  plateWidth: number,
  items: NestItem[],
): { pieces: PlacedPiece[]; free: FreeRect[]; unsized: number } {
  const sized = items
    .map((it) => {
      const d = parseRect(it.rect);
      return d ? { ...it, w0: d.width, l0: d.length } : null;
    })
    .filter((x): x is NestItem & { w0: number; l0: number } => x != null)
    .sort((a, b) => b.w0 - a.w0 || b.l0 - a.l0);
  // `parseRect` drops any item whose `rect` string isn't `d × d × d` (e.g.
  // blankPlanService emitting "undefined × undefined × undefined") — silently
  // dropping those pieces would draw a plate that looks fuller than it is,
  // so the caller is told how many went missing and shows a message instead.
  const unsized = items.length - sized.length;

  const pieces: PlacedPiece[] = [];
  let x = 0;
  let y = 0;
  let shelfH = 0;

  for (const it of sized) {
    for (let i = 0; i < it.qty; i += 1) {
      let l = it.l0;
      let w = it.w0;
      let rotated = false;
      // Try the piece as-is; if it doesn't fit the remaining width on this
      // shelf but the turned piece does, turn it — same allowance the real
      // packer has (grain is not modelled here, only geometry).
      if (x + l > plateLength && x + w <= plateLength) { [l, w] = [w, l]; rotated = true; }
      if (x + l > plateLength) {
        x = 0; y += shelfH; shelfH = 0;
      }
      if (y + w > plateWidth) continue; // out of room — the numeric summary already says what's short
      pieces.push({
        key: it.key, name: it.name, index: i + 1, qty: it.qty, x, y, l, w, rotated,
      });
      x += l;
      shelfH = Math.max(shelfH, w);
    }
  }

  const usedHeight = y + shelfH;
  const free: FreeRect[] = usedHeight < plateWidth
    ? [{ x: 0, y: usedHeight, l: plateLength, w: plateWidth - usedHeight }]
    : [];

  return { pieces, free, unsized };
}

export default function NestSheetSvg({
  plate, items, pieces: suppliedPieces, scale, height = 130, maxWidth,
}: {
  plate: { length: number; width: number };
  items: NestItem[];
  /** Real per-piece placement, when the backend sends it (not today — see file header). */
  pieces?: PlacedPiece[];
  /** Pixels per plate-mm. Alternative to `height` for a caller that wants a fixed scale. */
  scale?: number;
  /** Rendered pixel height when `scale` is not given; width follows the plate's aspect ratio. */
  height?: number;
  maxWidth?: number;
}) {
  const computed = useMemo(
    () => shelfPack(plate.length, plate.width, items),
    [plate.length, plate.width, items],
  );
  const pieces = suppliedPieces?.length ? suppliedPieces : computed.pieces;
  const free = suppliedPieces?.length ? [] : computed.free;
  const order = useMemo(() => [...new Set(pieces.map((p) => p.key))], [pieces]);

  const h = scale ? plate.width * scale : height;
  const ratio = plate.width > 0 ? plate.length / plate.width : 1;
  const w = scale ? plate.length * scale : Math.min(maxWidth ?? Infinity, h * ratio);
  const strokeW = Math.max(plate.length, plate.width) * 0.002;
  // Hatch pitch in plate millimetres — about 60 lines across the long side.
  const hatch = Math.max(plate.length, plate.width) / 60;
  const hatchId = `hatch-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  // Synthesised layout only (real `pieces` never go through `shelfPack`) — some
  // items' `rect` didn't parse, so drawing the rest would understate the plate.
  if (!suppliedPieces?.length && computed.unsized > 0) {
    return (
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height, width: maxWidth ?? '100%', background: 'var(--c-surface-2)',
        borderRadius: 1, color: 'var(--c-text-3)', fontSize: 12,
      }}
      >
        layout unavailable
      </Box>
    );
  }

  return (
    <Box sx={{ overflowX: 'auto', flexShrink: 0, lineHeight: 0 }}>
      <svg
        viewBox={`0 0 ${plate.length} ${plate.width}`}
        preserveAspectRatio="xMidYMid meet"
        width={w}
        height={h}
        style={{ display: 'block', background: 'var(--c-surface-2)', borderRadius: 4 }}
        role="img"
        aria-label={`Sheet layout, ${plate.length} by ${plate.width} millimetres, ${pieces.length} pieces`}
      >
        {/*
          THE WASTE IS WHAT THE EYE SHOULD LAND ON. The whole sheet is hatched
          and the pieces are painted over it, so whatever is left uncovered —
          the tail of a band, the strip along one edge — shows as hatching
          without anybody computing where it is. A plain grey remnant on a
          plain grey sheet was invisible, on the one screen that exists to
          make it visible.
        */}
        <defs>
          <pattern id={hatchId} patternUnits="userSpaceOnUse" width={hatch} height={hatch} patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2={hatch} stroke="var(--c-text-3)" strokeOpacity="0.35" strokeWidth={hatch / 4} />
          </pattern>
        </defs>
        <rect x={0} y={0} width={plate.length} height={plate.width} fill={`url(#${hatchId})`}>
          <title>Hatched — plate left over</title>
        </rect>
        {free.map((r, i) => (
          <rect
            key={`free-${i}`} x={r.x} y={r.y} width={r.l} height={r.w}
            fill="transparent"
          >
            <title>Remnant — {Math.round(r.l)} × {Math.round(r.w)} mm left over</title>
          </rect>
        ))}
        {/* A solid base under each piece, or the hatch shows through the tint
            and every piece looks like waste. */}
        {pieces.map((p, i) => (
          <rect key={`base-${p.key}-${i}`} x={p.x} y={p.y} width={p.l} height={p.w} fill="var(--c-surface)" />
        ))}
        {pieces.map((p, i) => (
          <rect
            key={`${p.key}-${i}`}
            x={p.x} y={p.y} width={p.l} height={p.w}
            fill={colourFor(p.key, order)}
            fillOpacity={0.75}
            stroke="var(--c-border)"
            strokeWidth={strokeW}
          >
            <title>{`${p.name} — piece ${p.index} of ${p.qty}${p.rotated ? ' (rotated)' : ''}`}</title>
          </rect>
        ))}
        <rect
          x={strokeW} y={strokeW}
          width={Math.max(0, plate.length - strokeW * 2)}
          height={Math.max(0, plate.width - strokeW * 2)}
          fill="none" stroke="var(--c-text-3)" strokeWidth={strokeW * 1.5}
        />
      </svg>
    </Box>
  );
}
