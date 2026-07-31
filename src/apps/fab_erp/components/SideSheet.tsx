import { Box, Drawer, IconButton, Tooltip, type DrawerProps } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded';
import type { ReactNode } from 'react';

/**
 * Right-docked overlay panel (DESIGN_SYSTEM.md §7 addition).
 *
 * The host for Entity Peek and for "edit without leaving the list" flows. The
 * point of a sheet over a dialog is that the user keeps their place: the list
 * behind stays scrolled where it was, so peeking at six records in a row costs
 * six clicks instead of six navigations and six back-buttons.
 *
 * Body is solid (never glass — §5.3); only the scrim blurs, inherited from the
 * MuiBackdrop override in theme.ts.
 */
export function SideSheet({
  open,
  onClose,
  title,
  subtitle,
  /** Shown as a "expand to full record" affordance in the header. */
  onExpand,
  expandLabel = 'Open full record',
  actions,
  children,
  width = 460,
  ...drawerProps
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  onExpand?: () => void;
  expandLabel?: string;
  /** Footer actions; omit for a read-only peek. */
  actions?: ReactNode;
  children: ReactNode;
  width?: number;
} & Omit<DrawerProps, 'open' | 'onClose' | 'anchor' | 'title' | 'children'>) {
  return (
    <Drawer
      {...drawerProps}
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: width },
          maxWidth: '100%',
          background: 'var(--c-surface)',
          borderLeft: '1px solid var(--c-border)',
          boxShadow: 'var(--e-3)',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <Box
        sx={{
          display: 'flex', alignItems: 'flex-start', gap: 1, px: 2.5, py: 2,
          borderBottom: '1px solid var(--c-divider)', flexShrink: 0,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontSize: 17, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1.3 }}>
            {title}
          </Box>
          {subtitle && (
            <Box sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.25 }}>{subtitle}</Box>
          )}
        </Box>
        {onExpand && (
          <Tooltip title={expandLabel}>
            <IconButton size="small" onClick={onExpand} aria-label={expandLabel}>
              <OpenInFullRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Close">
          <IconButton size="small" onClick={onClose} aria-label="Close panel">
            <CloseRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, py: 2 }}>{children}</Box>

      {actions && (
        <Box
          sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1,
            px: 2.5, py: 1.75, borderTop: '1px solid var(--c-divider)',
            background: 'var(--c-surface-2)', flexShrink: 0,
          }}
        >
          {actions}
        </Box>
      )}
    </Drawer>
  );
}
