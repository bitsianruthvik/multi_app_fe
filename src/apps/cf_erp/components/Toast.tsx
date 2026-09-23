import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import InfoRounded from '@mui/icons-material/InfoRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { ToastContext } from './toastContext';

type Tone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: Tone; text: string }

const TONE: Record<Tone, [string, string, typeof CheckCircleRounded]> = {
  success: ['var(--c-success-50)', 'var(--c-success-600)', CheckCircleRounded],
  error: ['var(--c-danger-50)', 'var(--c-danger-600)', ErrorOutlineRounded],
  info: ['var(--c-info-50)', 'var(--c-info-600)', InfoRounded],
};

/**
 * Toasts answer "did that work?" (DESIGN_SYSTEM.md §5.7-2/11) — fab_erp's look:
 * bottom-right stack, a coloured edge and tone tile, slide up, dismiss after
 * ~2.6 s (errors stay longer), announced politely to screen readers.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback((tone: Tone, text: string) => {
    const id = next.current++;
    setItems((all) => [...all.slice(-3), { id, tone, text }]);
    window.setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 2600);
  }, [dismiss]);
  const api = useMemo(() => ({
    success: (t: string) => push('success', t), error: (t: string) => push('error', t), info: (t: string) => push('info', t),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Box aria-live="polite" sx={{ position: 'fixed', bottom: 20, right: 20, left: { xs: 20, sm: 'auto' }, zIndex: 1400, display: 'flex', flexDirection: 'column', gap: 1, pointerEvents: 'none' }}>
        {items.map((t) => {
          const [bg, fg, Icon] = TONE[t.tone];
          return (
            <Box key={t.id} role="status" sx={{
              pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 1, minWidth: { sm: 260 }, maxWidth: 380, px: 1.5, py: 1.25,
              background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderLeft: `3px solid ${fg}`, borderRadius: 'var(--r-md)', boxShadow: 'var(--e-3)',
              animation: 'cf-toast-in 200ms var(--ease)', '@keyframes cf-toast-in': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
            }}>
              <Box sx={{ display: 'grid', placeItems: 'center', color: fg, background: bg, borderRadius: 'var(--r-sm)', width: 26, height: 26, flexShrink: 0 }}><Icon sx={{ fontSize: 16 }} /></Box>
              <Typography sx={{ flex: 1, fontSize: 13, color: 'var(--c-text)' }}>{t.text}</Typography>
              <Box component="button" onClick={() => dismiss(t.id)} aria-label="Dismiss"
                sx={{ display: 'grid', placeItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--c-text-3)', p: 0.25, '&:hover': { color: 'var(--c-text)' } }}>
                <CloseRounded sx={{ fontSize: 16 }} />
              </Box>
            </Box>
          );
        })}
      </Box>
    </ToastContext.Provider>
  );
}
