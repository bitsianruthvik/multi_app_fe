import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Button, Dialog, DialogContent, IconButton, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import { ConfirmDialog, useCompanySlug } from '@shared/ui';
import type { Hiring } from '../api/hiring';
import { HiringFlow } from './HiringFlow';
import { HiringDialogContext, type HiringDialogApi } from './hiringDialogContext';

/**
 * The hiring flow as a pop-up (CF_HRMS_HIRING_SPEC.md §3.2): large on a desk,
 * the whole screen on a phone. The same `HiringFlow` the page at /hiring/:id
 * shows — this is only the frame around it.
 *
 * THE SCREEN BEHIND IS NOT TOUCHED while the pop-up is open: the chart keeps
 * its zoom, its pan and its open panel, because nothing navigates and nothing
 * reloads. It is told to refresh once, when the pop-up closes — by the button,
 * by Esc or by a click outside.
 *
 * TYPED TEXT IS NOT LOST TO A SLIP: with the Offer form unsaved, any way of
 * closing asks first.
 */
export function HiringDialogProvider({ children }: { children: ReactNode }) {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });

  const [hiringId, setHiringId] = useState<number | null>(null);
  const [title, setTitle] = useState<{ name: string; line: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  /** What the person tried to do while there was unsaved text. */
  const [asking, setAsking] = useState<'close' | 'page' | null>(null);
  const onClosed = useRef<(() => void) | null>(null);

  const finish = useCallback(() => {
    setHiringId(null);
    setTitle(null);
    setDirty(false);
    setAsking(null);
    const done = onClosed.current;
    onClosed.current = null;
    done?.();
  }, []);

  const api = useMemo<HiringDialogApi>(
    () => ({
      open: (id, closed) => {
        onClosed.current = closed ?? null;
        setHiringId(id);
      },
    }),
    [],
  );

  // A link inside the flow went somewhere else: the pop-up does not follow it there.
  const openedAt = useRef<string | null>(null);
  useEffect(() => {
    if (hiringId == null) {
      openedAt.current = null;
      return;
    }
    if (openedAt.current == null) openedAt.current = location.pathname;
    else if (openedAt.current !== location.pathname) finish();
  }, [location.pathname, hiringId, finish]);

  const requestClose = () => (dirty ? setAsking('close') : finish());
  const asPage = () => {
    const id = hiringId;
    finish();
    if (id != null) navigate(`/${company}/cf_hrms/hiring/${id}`);
  };
  const requestPage = () => (dirty ? setAsking('page') : asPage());

  const onLoaded = useCallback((h: Hiring) => {
    setTitle({ name: h.candidateName?.trim() || 'New hire', line: [h.roleTitle, h.positionCode].filter(Boolean).join(' · ') });
  }, []);

  return (
    <HiringDialogContext.Provider value={api}>
      {children}
      <Dialog
        open={hiringId != null}
        onClose={requestClose}
        fullScreen={phone}
        fullWidth
        maxWidth="lg"
        aria-labelledby="hiring-dialog-title"
        data-hiringdialog=""
        slotProps={{ paper: { sx: { height: phone ? '100%' : 'calc(100% - 48px)', background: 'var(--c-bg, var(--c-surface-2))' } } }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: { xs: 1.5, sm: 2.5 },
            py: 1.25,
            borderBottom: '1px solid var(--c-divider)',
            background: 'var(--c-surface)',
            flexShrink: 0,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography id="hiring-dialog-title" component="h2" sx={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
              Hiring{title ? ` · ${title.name}` : ''}
            </Typography>
            {title?.line && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{title.line}</Typography>}
          </Box>
          <Button size="small" startIcon={<OpenInNewRounded />} onClick={requestPage} sx={{ flexShrink: 0 }}>
            Open as a page
          </Button>
          <Tooltip title="Close">
            <IconButton aria-label="Close the hiring" onClick={requestClose} size="small">
              <CloseRounded />
            </IconButton>
          </Tooltip>
        </Box>
        <DialogContent sx={{ px: { xs: 1.5, sm: 2.5 }, py: 2 }}>
          {hiringId != null && (
            <Box sx={{ maxWidth: 980, mx: 'auto' }}>
              <HiringFlow
                key={hiringId}
                hiringId={hiringId}
                company={company}
                shell="dialog"
                onLoaded={onLoaded}
                onDirtyChange={setDirty}
                onOpenHiring={(id) => {
                  setDirty(false);
                  setHiringId(id);
                }}
                onPositionRemoved={finish}
              />
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={asking != null}
        title="Close without saving?"
        body="The candidate and offer details you typed are not saved yet. Closing now loses them."
        confirmLabel="Close without saving"
        danger
        onClose={() => setAsking(null)}
        onConfirm={() => (asking === 'page' ? asPage() : finish())}
      />
    </HiringDialogContext.Provider>
  );
}

export default HiringDialogProvider;
