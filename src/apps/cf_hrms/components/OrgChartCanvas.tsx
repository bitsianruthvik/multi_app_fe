import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Box } from '@mui/material';
import type { ChartScene, Prim } from './orgChartLayout';

/**
 * The chart itself: inline SVG, drawn from the scene's draw list.
 *
 * Inline rather than an `<img>` because every box has to be a real focusable
 * control. DESIGN_SYSTEM.md §6.4 makes a keyboard path mandatory for a canvas
 * screen, and an org chart nobody can tab through is an org chart half the
 * client's office cannot read. Arrow keys walk the tree the way the tree looks:
 * ← → between siblings, ↑ to the manager, ↓ to the first report; Enter opens
 * the card, Space folds the branch.
 *
 * Zoom is applied to the `<svg>` element's width/height only — the viewBox and
 * every coordinate stay put — so zooming never re-renders a thousand nodes.
 */

export type NavDirection = 'up' | 'down' | 'left' | 'right';

function renderPrim(p: Prim, key: string) {
  switch (p.k) {
    case 'rect':
      return (
        <rect
          key={key}
          x={p.x}
          y={p.y}
          width={p.w}
          height={p.h}
          rx={p.r ?? 0}
          fill={p.fill ?? 'none'}
          stroke={p.stroke}
          strokeWidth={p.sw}
          strokeDasharray={p.dash?.join(' ')}
        />
      );
    case 'circle':
      return (
        <circle
          key={key}
          cx={p.cx}
          cy={p.cy}
          r={p.r}
          fill={p.fill ?? 'none'}
          stroke={p.stroke}
          strokeWidth={p.sw}
        />
      );
    case 'path':
      return (
        <path
          key={key}
          d={p.d}
          fill={p.fill ?? 'none'}
          stroke={p.stroke}
          strokeWidth={p.sw}
          strokeDasharray={p.dash?.join(' ')}
        />
      );
    case 'text':
      return (
        <text
          key={key}
          x={p.x}
          y={p.y}
          fontSize={p.size}
          fontWeight={p.weight}
          fontStyle={p.italic ? 'italic' : undefined}
          textAnchor={p.anchor ?? 'start'}
          fill={p.fill}
        >
          {p.text}
        </text>
      );
    default:
      return null;
  }
}

export function OrgChartCanvas({
  scene,
  zoom,
  fontFamily,
  selected,
  accessibleName,
  textAlternative,
  onSelect,
  onOpenCard,
  onToggleCollapse,
  onNavigate,
}: {
  scene: ChartScene;
  zoom: number;
  fontFamily: string;
  selected: number | null;
  accessibleName: string;
  /** Read out in place of the picture; the table view is the full fallback. */
  textAlternative: string;
  onSelect: (id: number) => void;
  onOpenCard: (id: number) => void;
  onToggleCollapse: (id: number) => void;
  onNavigate: (from: number, dir: NavDirection) => number | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const selectedBox = selected == null ? null : scene.boxes.find((b) => b.id === selected) ?? null;

  const focusNode = useCallback((id: number) => {
    const el = document.getElementById(`orgchart-node-${id}`);
    if (el instanceof SVGElement || el instanceof HTMLElement) {
      (el as unknown as HTMLElement).focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, []);

  // Keep the selected box in view when it was chosen from somewhere else — the
  // "start from" list, the search results, a cross-link in the card.
  useEffect(() => {
    if (selected == null) return;
    const el = document.getElementById(`orgchart-node-${selected}`);
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [selected, scene]);

  const onKeyDown = (e: React.KeyboardEvent<SVGGElement>, id: number) => {
    const dirs: Record<string, NavDirection> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };
    if (dirs[e.key]) {
      const next = onNavigate(id, dirs[e.key]);
      if (next != null) {
        e.preventDefault();
        onSelect(next);
        focusNode(next);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      onOpenCard(id);
      return;
    }
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      onToggleCollapse(id);
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    if (!wrap || e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest('[data-orgnode]') || target.closest('[data-orgtoggle]')) return;
    pan.current = { x: e.clientX, y: e.clientY, left: wrap.scrollLeft, top: wrap.scrollTop };
    wrap.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    if (!wrap || !pan.current) return;
    wrap.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
    wrap.scrollTop = pan.current.top - (e.clientY - pan.current.y);
  };

  const endPan = (e: ReactPointerEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    if (wrap?.hasPointerCapture(e.pointerId)) wrap.releasePointerCapture(e.pointerId);
    pan.current = null;
  };

  return (
    <Box
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      sx={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        background: 'var(--c-surface)',
        borderRadius: 'var(--r-md)',
        border: '1px solid var(--c-border)',
        boxShadow: 'var(--e-1)',
        cursor: 'grab',
        '&:active': { cursor: 'grabbing' },
        touchAction: 'pan-x pan-y',
      }}
    >
      <svg
        role="img"
        aria-label={accessibleName}
        width={Math.round(scene.width * zoom)}
        height={Math.round(scene.height * zoom)}
        viewBox={`0 0 ${scene.width} ${scene.height}`}
        xmlns="http://www.w3.org/2000/svg"
        fontFamily={fontFamily}
        style={{ display: 'block' }}
      >
        <title>{accessibleName}</title>
        <desc>{textAlternative}</desc>
        <rect width={scene.width} height={scene.height} fill={scene.background} />
        <g aria-hidden="true">{scene.header.map((p, i) => renderPrim(p, `h${i}`))}</g>
        <g aria-hidden="true">{scene.edges.map((p, i) => renderPrim(p, `e${i}`))}</g>
        <g aria-hidden="true">{scene.secondary.map((p, i) => renderPrim(p, `s${i}`))}</g>
        {selectedBox && (
          <rect
            aria-hidden="true"
            x={selectedBox.x - 3}
            y={selectedBox.y - 3}
            width={selectedBox.w + 6}
            height={selectedBox.h + 6}
            rx={11}
            fill="none"
            stroke="var(--c-primary-500)"
            strokeWidth={2.4}
          />
        )}
        <g role="tree" aria-label="Positions">
          {scene.boxes.map((box) => (
            <g key={box.id}>
              <g
                id={`orgchart-node-${box.id}`}
                data-orgnode={box.id}
                role="treeitem"
                tabIndex={0}
                aria-label={box.label}
                aria-selected={selected === box.id}
                aria-expanded={
                  box.toggle ? !box.toggle.collapsed : undefined
                }
                style={{ cursor: 'pointer', outlineOffset: 2 }}
                onClick={() => {
                  onSelect(box.id);
                  onOpenCard(box.id);
                }}
                onFocus={() => onSelect(box.id)}
                onKeyDown={(e) => onKeyDown(e, box.id)}
              >
                {box.prims.map((p, i) => renderPrim(p, `${box.id}-${i}`))}
              </g>
              {box.toggle && (
                <g
                  data-orgtoggle={box.id}
                  role="button"
                  tabIndex={0}
                  aria-label={
                    box.toggle.collapsed
                      ? `Show the ${box.toggle.hidden} positions under ${box.label.split('.')[0]}`
                      : `Hide the team under ${box.label.split('.')[0]}`
                  }
                  style={{ cursor: 'pointer', outlineOffset: 2 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapse(box.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggleCollapse(box.id);
                    }
                  }}
                >
                  {box.toggle.prims.map((p, i) => renderPrim(p, `t${box.id}-${i}`))}
                </g>
              )}
            </g>
          ))}
        </g>
      </svg>
    </Box>
  );
}
