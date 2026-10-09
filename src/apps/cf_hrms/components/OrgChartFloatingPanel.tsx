import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Box, IconButton, Tooltip, useMediaQuery, useTheme } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import { readPref, writePref } from '@shared/ui';

/**
 * One floating, draggable window for everything a box opens (spec §14).
 *
 * It replaced two things on 2026-10-09: the inspector docked beside the chart,
 * which took a third of the width and gave the page a second scroll bar, and
 * the position card's modal Dialog, which covered the chart it was describing.
 * The client asked for one overlay, an X, and the freedom to move it.
 *
 * WHY `position: fixed` AGAINST A BOUNDS ELEMENT rather than absolute inside
 * the chart: the same panel opens from Departments and Doubts, which scroll the
 * page; there it is bounded by the app's scrolling main region instead. Fixed
 * also makes "stays put while the chart is panned or zoomed underneath" true
 * by construction — the chart scrolls inside its own box and the panel is not
 * inside that box. Its position is stored as an offset from the bounds'
 * top-left corner, so entering full screen carries it along.
 *
 * WHY IT IS NOT A MODAL: the chart stays live underneath. No focus trap, no
 * backdrop, `aria-modal="false"`. Opening it does not move focus, so the arrow
 * keys keep walking the chart; the opener decides when focus goes in (Enter on
 * the same box again) and Esc inside the panel closes it.
 *
 * AT PHONE WIDTH it is a bottom sheet: a dragged window on a 375px screen
 * covers the chart whichever way it is moved, and there is no room to move it.
 */

const GAP = 12;
const WIDTH = 500;
const MAX_HEIGHT = 720;
const KEY_STEP = 24;

export interface FloatingPanelHandle {
  /** Move keyboard focus into the panel (its drag handle). */
  focus: () => void;
}

interface Pos {
  x: number;
  y: number;
}

interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

function viewportBounds(): Bounds {
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

function readBounds(el: HTMLElement | null): Bounds {
  if (!el) return viewportBounds();
  const r = el.getBoundingClientRect();
  // Never wider or taller than what is on screen: the main region of a long
  // Departments page is clipped by the viewport.
  const top = Math.max(r.top, 0);
  const left = Math.max(r.left, 0);
  return {
    left,
    top,
    width: Math.min(r.right, window.innerWidth) - left,
    height: Math.min(r.bottom, window.innerHeight) - top,
  };
}

export const OrgChartFloatingPanel = forwardRef<
  FloatingPanelHandle,
  {
    open: boolean;
    title: ReactNode;
    /** Plain text for the accessible name; `title` may be rich. */
    label: string;
    onClose: () => void;
    /** The element the panel floats over and is kept inside. Null = viewport. */
    boundsEl: HTMLElement | null;
    /** Preference key the dragged position is kept under (per viewer). */
    storageKey: string;
    /** Anything that moves the bounds without resizing them (full screen). */
    relayout?: string | number | boolean;
    children: ReactNode;
  }
>(function OrgChartFloatingPanel(
  { open, title, label, onClose, boundsEl, storageKey, relayout, children },
  ref,
) {
  const theme = useTheme();
  const sheet = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const handleRef = useRef<HTMLDivElement>(null);
  const titleId = `orgchart-panel-title`;

  const [bounds, setBounds] = useState<Bounds>(() => readBounds(boundsEl));
  // null = never placed: the top-right corner of the bounds.
  const [pos, setPos] = useState<Pos | null>(() => readPref<Pos | null>(storageKey, null));
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useImperativeHandle(ref, () => ({ focus: () => handleRef.current?.focus() }), []);

  // Follow the bounds: a resized window, the toolbar wrapping, full screen.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => setBounds(readBounds(boundsEl));
    update();
    window.addEventListener('resize', update);
    document.addEventListener('fullscreenchange', update);
    let ro: ResizeObserver | null = null;
    if (boundsEl && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update);
      ro.observe(boundsEl);
    }
    // A position:fixed ancestor entering full screen moves the bounds in one
    // frame without a resize of either element; one rAF catches it.
    const raf = requestAnimationFrame(update);
    return () => {
      window.removeEventListener('resize', update);
      document.removeEventListener('fullscreenchange', update);
      ro?.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [open, boundsEl, relayout]);

  const width = Math.max(260, Math.min(WIDTH, bounds.width - 2 * GAP));
  const height = Math.max(200, Math.min(MAX_HEIGHT, bounds.height - 2 * GAP));

  const clamp = useCallback(
    (p: Pos): Pos => ({
      x: Math.round(Math.min(Math.max(p.x, GAP), Math.max(GAP, bounds.width - width - GAP))),
      y: Math.round(Math.min(Math.max(p.y, GAP), Math.max(GAP, bounds.height - height - GAP))),
    }),
    [bounds.width, bounds.height, width, height],
  );

  const at = clamp(pos ?? { x: bounds.width - width - GAP, y: GAP });

  const remember = (p: Pos) => {
    setPos(p);
    writePref(storageKey, p);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (sheet || e.button !== 0) return;
    if ((e.target as Element).closest('button')) return;
    drag.current = { px: e.clientX, py: e.clientY, x: at.x, y: at.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setPos(clamp({ x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    remember(at);
  };

  // The drag handle is also a keyboard control: arrows move the window.
  const onHandleKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (sheet) return;
    const dx = e.key === 'ArrowLeft' ? -KEY_STEP : e.key === 'ArrowRight' ? KEY_STEP : 0;
    const dy = e.key === 'ArrowUp' ? -KEY_STEP : e.key === 'ArrowDown' ? KEY_STEP : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    e.stopPropagation();
    remember(clamp({ x: at.x + dx, y: at.y + dy }));
  };

  // Esc anywhere inside closes it. A dialog opened FROM the panel (Close or
  // delete…) portals to the body, but React still bubbles its keys through the
  // component tree to here — so only Esc whose target is in the panel's own DOM
  // counts; the dialog's Esc closes the dialog alone.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || !e.currentTarget.contains(e.target as Node)) return;
    e.stopPropagation();
    onClose();
  };

  // Do not leave a stale drag behind if the panel closes mid-drag.
  useEffect(() => {
    if (!open) drag.current = null;
  }, [open]);

  if (!open) return null;

  const placement = sheet
    ? {
        left: 0,
        right: 0,
        bottom: 0,
        height: '72vh',
        borderRadius: 'var(--r-lg) var(--r-lg) 0 0',
      }
    : {
        left: bounds.left + at.x,
        top: bounds.top + at.y,
        width,
        height,
        borderRadius: 'var(--r-lg)',
      };

  return (
    <Box
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-orgpanel=""
      onKeyDown={onKeyDown}
      sx={{
        position: 'fixed',
        ...placement,
        zIndex: 'var(--z-sheet)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--c-surface)',
        border: '1px solid var(--c-border)',
        boxShadow: 'var(--e-3)',
        overflow: 'hidden',
      }}
    >
      <Box
        ref={handleRef}
        tabIndex={0}
        role="group"
        aria-label={sheet ? label : `${label}. Drag to move, or use the arrow keys.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onHandleKey}
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 0.75,
          px: 1.5,
          py: 1.25,
          borderBottom: '1px solid var(--c-border)',
          background: 'var(--c-surface-2)',
          cursor: sheet ? 'default' : 'move',
          touchAction: 'none',
          userSelect: 'none',
          flexShrink: 0,
          '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: -2 },
        }}
      >
        {!sheet && (
          <DragIndicatorRounded
            aria-hidden
            sx={{ fontSize: 18, color: 'var(--c-text-3)', mt: '3px', flexShrink: 0 }}
          />
        )}
        <Box id={titleId} sx={{ flex: 1, minWidth: 0 }}>
          {title}
        </Box>
        <Tooltip title="Close (Esc)">
          <IconButton size="small" onClick={onClose} aria-label="Close the panel" sx={{ mt: '-2px' }}>
            <CloseRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          overscrollBehavior: 'contain',
          p: 2,
        }}
      >
        {children}
      </Box>
    </Box>
  );
});
