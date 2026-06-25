/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useState } from 'react';
import { Box, Typography } from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import InfoRounded from '@mui/icons-material/InfoRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastCtx {
  toast: (message: string, tone?: ToastTone) => void;
}

const Ctx = createContext<ToastCtx>({ toast: () => {} });

export function useToast() {
  return useContext(Ctx);
}

const TONE: Record<ToastTone, [string, string, typeof CheckCircleRounded]> = {
  success: ['var(--c-success-50)', 'var(--c-success-600)', CheckCircleRounded],
  error: ['var(--c-danger-50)', 'var(--c-danger-600)', ErrorOutlineRounded],
  info: ['var(--c-info-50)', 'var(--c-info-600)', InfoRounded],
};

/**
 * Toast stack (DESIGN_SYSTEM.md §5.7-2/11): slide-up + fade, auto-dismiss ~2.6s,
 * dismissible, announced via aria-live="polite". Wrap the fab_erp tree once.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs, { id, message, tone }]);
      setTimeout(() => remove(id), 2600);
    },
    [remove],
  );

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <Box
        aria-live="polite"
        sx={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 1400,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          pointerEvents: 'none',
        }}
      >
        {items.map((t) => {
          const [bg, fg, Icon] = TONE[t.tone];
          return (
            <Box
              key={t.id}
              sx={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                minWidth: 260,
                maxWidth: 380,
                px: 1.5,
                py: 1.25,
                background: 'var(--c-surface)',
                border: '1px solid var(--c-border)',
                borderLeft: `3px solid ${fg}`,
                borderRadius: 'var(--r-md)',
                boxShadow: 'var(--e-3)',
                animation: 'fab-toast-in 200ms var(--ease)',
                '@keyframes fab-toast-in': {
                  from: { opacity: 0, transform: 'translateY(8px)' },
                  to: { opacity: 1, transform: 'translateY(0)' },
                },
              }}
            >
              <Box sx={{ display: 'grid', placeItems: 'center', color: fg, background: bg, borderRadius: 'var(--r-sm)', width: 26, height: 26, flexShrink: 0 }}>
                <Icon sx={{ fontSize: 16 }} />
              </Box>
              <Typography sx={{ flex: 1, fontSize: 13, color: 'var(--c-text)' }}>{t.message}</Typography>
              <Box
                component="button"
                onClick={() => remove(t.id)}
                aria-label="Dismiss"
                sx={{ display: 'grid', placeItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--c-text-3)', p: 0.25, '&:hover': { color: 'var(--c-text)' } }}
              >
                <CloseRounded sx={{ fontSize: 16 }} />
              </Box>
            </Box>
          );
        })}
      </Box>
    </Ctx.Provider>
  );
}
