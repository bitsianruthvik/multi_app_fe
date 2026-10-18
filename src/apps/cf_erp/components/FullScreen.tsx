import { useEffect, type ReactNode } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import FullscreenRounded from '@mui/icons-material/FullscreenRounded';
import FullscreenExitRounded from '@mui/icons-material/FullscreenExitRounded';

/**
 * FULL SCREEN for a step of the order flow (user, 2026-10-18): a button in the screen's header expands the step to fill
 * the window; Esc or the same button brings it back. Whether a step was left full screen is remembered in this browser
 * (useFullScreen in hooks/useFullScreen.ts). One small piece, so every order-flow step can use it:
 *
 *   const fs = useFullScreen('mr-screen');
 *   <FullScreenFrame on={fs.on} onExit={() => fs.set(false)}> … <FullScreenToggle on={fs.on} onToggle={fs.toggle} /> … </FullScreenFrame>
 */
export function FullScreenToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Tooltip title={on ? 'Exit full screen (Esc)' : 'Full screen'}>
      <IconButton size="small" onClick={onToggle} aria-label={on ? 'Exit full screen' : 'Full screen'} aria-pressed={on} data-testid="full-screen-toggle">
        {on ? <FullscreenExitRounded fontSize="small" /> : <FullscreenRounded fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}

/** Holds a step; when `on`, the step fills the window above the app's shell, scrolling inside itself. Esc exits. */
export function FullScreenFrame({ on, onExit, children }: { on: boolean; onExit: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!on) return undefined;
    const onKey = (e: KeyboardEvent) => {
      // A dialog or a menu open over the step takes its own Esc first.
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('.MuiDialog-root, .MuiPopover-root, .MuiMenu-root')) return;
      onExit();
    };
    window.addEventListener('keydown', onKey);
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = was; };
  }, [on, onExit]);
  if (!on) return <>{children}</>;
  return (
    <Box data-testid="full-screen-frame" role="region" aria-label="Full screen"
      sx={{ position: 'fixed', inset: 0, zIndex: 1250, overflow: 'auto', background: 'var(--c-bg, var(--c-surface))', p: { xs: 2, md: 3 } }}>
      {children}
    </Box>
  );
}
