import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button } from '@mui/material';
import ZoomInRounded from '@mui/icons-material/ZoomInRounded';
import ZoomOutMapRounded from '@mui/icons-material/ZoomOutMapRounded';
import type { Nest } from '../../api/types';
import { bandsOf, mm } from '../../lib/nesting';

/**
 * ONE PLATE, DRAWN.
 *
 * The drawing is not decoration. A nesting plan is Plate → Sequence → Row →
 * Part, and the SEQUENCE IS THE POINT: the floor pierces sequence 1 in full,
 * then 2, then 3, and that ordering is what stops a part shifting mid-cut. So
 * the sequences are banded and numbered, the rows inside them are numbered, and
 * every piece carries its place along its row. Somebody should be able to cut
 * from this picture.
 *
 * Three things are drawn on top of each other, outermost first:
 *   1. the PLATE AS BOUGHT — `length` × `width`, the catalog size procurement
 *      pays for;
 *   2. the REQUIRED BOX, dashed — what the layout actually needs once the kerf
 *      is charged at the rim. The gap between the two is the ordering margin,
 *      the slack a crooked mill edge is cut off, and it is deliberate;
 *   3. the sequence bands, their rows, and the pieces.
 *
 * THE TYPE IS SIZED IN PIXELS, NOT IN MILLIMETRES. The obvious way to draw this
 * is a viewBox in millimetres and font sizes as a fraction of the plate — and
 * it fails, because the plates are not one shape. A 12 050 × 2 300 plate in a
 * 440 px column puts three rows in 16 px, and a label that is a fraction of the
 * plate comes out four pixels tall. So the container is measured and everything
 * that has to be READ is converted back from pixels, which makes a sequence
 * number the same size on a 2 m plate and a 12 m one.
 *
 * AND A LONG PLATE STILL NEEDS ROOM. Fitting a 5:1 plate into a column leaves
 * rows a few pixels high whatever the type does, so the drawing zooms and
 * scrolls sideways inside its own card. It never widens the page: the scroll is
 * the card's, and `Fit` is always one click away.
 */

/** On-screen sizes, in CSS pixels. Everything else is derived from the plate. */
const PX = {
  seq: 13,          // the sequence number in the gutter — the cut order
  row: 9.5,         // the row number beside its row
  dim: 10.5,        // the two sizes across the top
  piece: 9,         // a piece's place along its row
  gutter: 40,       // room for SEQ and the row numbers
  padTop: 26,
  padBottom: 16,
  padRight: 6,
  /** Under this a piece is too small to letter, and an unreadable digit is worse than none. */
  minPieceH: 11,
};

const ZOOMS = [1, 2, 4] as const;

export function PlateDrawing({ nest, colourOf, title }: {
  nest: Nest;
  /** The line-wide colour for a cut plate, so the same rectangle is one colour everywhere. */
  colourOf: (cutPlateId: number) => string;
  title?: string;
}) {
  const bands = useMemo(() => bandsOf(nest), [nest]);
  const box = useRef<HTMLDivElement | null>(null);
  const [avail, setAvail] = useState(0);
  const [zoom, setZoom] = useState(1);

  // The card's width decides the scale, and it changes with the window and
  // the phone. Measured rather than assumed.
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    setAvail(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => setAvail(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const L = nest.length || 1;
  const W = nest.width || 1;
  const drawW = Math.max(avail, 240) * zoom;

  // The gutter is a pixel size, and pixels only exist once the scale is known,
  // which needs the gutter. One pass off the plate alone is close enough.
  const rough = drawW / L;
  const gutter = PX.gutter / rough;
  const padRight = PX.padRight / rough;
  const scale = drawW / (gutter + L + padRight);
  const u = (px: number) => px / scale;              // pixels back into plate millimetres
  const padTop = u(PX.padTop);
  const padBottom = u(PX.padBottom);
  const drawH = (padTop + W + padBottom) * scale;

  const reqL = nest.requiredLength ?? null;
  const reqW = nest.requiredWidth ?? null;

  return (
    <Box sx={{ minWidth: 0, width: '100%', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
        {zoom > 1 && (
          <Button size="small" startIcon={<ZoomOutMapRounded />} onClick={() => setZoom(1)} sx={{ minWidth: 0, py: 0.25 }}>
            Fit
          </Button>
        )}
        <Button size="small" startIcon={<ZoomInRounded />} sx={{ minWidth: 0, py: 0.25 }}
          onClick={() => setZoom((z) => ZOOMS[Math.min(ZOOMS.indexOf(z as 1) + 1, ZOOMS.length - 1)])}
          disabled={zoom === ZOOMS[ZOOMS.length - 1]}>
          {zoom === 1 ? 'Bigger' : `${zoom}×`}
        </Button>
      </Box>

      {/* The measured box. The scroll belongs to it, never to the page. */}
      <Box ref={box} sx={{ minWidth: 0, width: '100%', overflowX: zoom > 1 ? 'auto' : 'hidden', overflowY: 'hidden' }}>
        <Box
          component="svg"
          role="img"
          aria-label={title ?? `${nest.lotNo ?? 'Plate'}: ${nest.pieces.length} pieces in ${bands.length} sequences`}
          viewBox={`${-gutter} ${-padTop} ${gutter + L + padRight} ${padTop + W + padBottom}`}
          width={drawW}
          height={drawH}
          preserveAspectRatio="xMidYMid meet"
          sx={{ display: 'block', overflow: 'visible' }}
        >
          {/* The plate as bought. */}
          <rect
            x={0} y={0} width={L} height={W}
            fill="var(--c-surface-2)" stroke="var(--c-text-3)" strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
          />

          {/* Sequence bands, alternating so the units read apart at a glance. */}
          {bands.map((b, i) => (
            <g key={b.seqNo}>
              <rect
                x={0} y={b.y0 - u(1)} width={L} height={Math.max(b.y1 - b.y0 + u(2), u(2))}
                fill={i % 2 === 0 ? 'var(--c-primary-50)' : 'var(--c-surface-3)'}
              />
              {/* The cut order, in the gutter: sequence 1 is pierced in full, then 2. */}
              <text
                x={-gutter + u(2)} y={(b.y0 + b.y1) / 2} fontSize={u(PX.seq)} fontWeight={700}
                dominantBaseline="central" fill="var(--c-primary-600)" style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {b.seqNo}
              </text>
              {/* Row numbers, closer in, so a row can be called out by name on the floor. */}
              {b.rows.map((r) => ((r.y1 - r.y0) * scale >= PX.row
                ? (
                  <text
                    key={r.rowNo} x={-u(3)} y={(r.y0 + r.y1) / 2} fontSize={u(PX.row)} textAnchor="end"
                    dominantBaseline="central" fill="var(--c-text-3)" style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {`r${r.rowNo}`}
                  </text>
                )
                : null))}
            </g>
          ))}

          {/* Every piece, coloured by which cut plate it is. */}
          {bands.map((b) => b.rows.map((r) => r.pieces.map((p) => {
            const label = `${p.posNo}`;
            const fits = p.width * scale >= PX.minPieceH && p.length * scale >= label.length * PX.piece * 0.75;
            return (
              <g key={`${p.seqNo}-${p.rowNo}-${p.posNo}-${p.cutPlateId}-${p.x}-${p.y}`}>
                <rect
                  x={p.x} y={p.y} width={p.length} height={p.width}
                  fill={colourOf(p.cutPlateId)} fillOpacity={0.82}
                  stroke="var(--c-surface)" strokeWidth={0.8} vectorEffect="non-scaling-stroke"
                >
                  <title>
                    {`${p.cutPlateCode} — sequence ${p.seqNo}, row ${p.rowNo}, position ${p.posNo}`
                      + `\n${mm(p.length)} × ${mm(p.width)} mm${p.rotated ? ' (turned)' : ''} at ${mm(p.x)}, ${mm(p.y)}`}
                  </title>
                </rect>
                {fits && (
                  <text
                    x={p.x + p.length / 2} y={p.y + p.width / 2} fontSize={u(PX.piece)} textAnchor="middle"
                    dominantBaseline="central" fill="#fff" fontWeight={600} pointerEvents="none"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })))}

          {/*
            What the layout NEEDS, against what is bought. The two are different
            numbers on purpose, so both are on the picture rather than only in a
            table underneath it.
          */}
          {reqL != null && reqW != null && (
            <>
              <rect
                x={0} y={0} width={Math.min(reqL, L)} height={Math.min(reqW, W)}
                fill="none" stroke="var(--c-primary-600)" strokeWidth={1.4} strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={0} y1={-u(9)} x2={Math.min(reqL, L)} y2={-u(9)}
                stroke="var(--c-primary-600)" strokeWidth={1.2} vectorEffect="non-scaling-stroke"
              />
              <text x={0} y={-u(14)} fontSize={u(PX.dim)} fill="var(--c-primary-600)" fontWeight={600}>
                {`needs ${mm(reqL)} × ${mm(reqW)}`}
              </text>
            </>
          )}
          <text x={L} y={-u(14)} fontSize={u(PX.dim)} textAnchor="end" fill="var(--c-text-2)">
            {`plate ${mm(L)} × ${mm(W)}`}
          </text>
          <text x={-gutter + u(2)} y={-u(14)} fontSize={u(PX.row)} fill="var(--c-text-3)" fontWeight={600}>
            SEQ
          </text>
          <text x={0} y={W + u(11)} fontSize={u(PX.row)} fill="var(--c-text-3)">
            {`${bands.length} ${bands.length === 1 ? 'sequence' : 'sequences'}, cut in the order numbered on the left · ${nest.pieces.length} pieces`}
          </text>
        </Box>
      </Box>
    </Box>
  );
}
