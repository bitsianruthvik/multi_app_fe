import { useState, type ReactNode } from 'react';
import { Box, Button, CircularProgress, ListItemIcon, Menu, MenuItem } from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';

/**
 * "MORE" — everything on the Nesting step that is not one of the two ways to
 * nest. One button at the top right, so the toolbar is not ten buttons wide.
 *
 * An action that cannot be used now stays in the list and says why under its
 * name, in place of what it does — a missing button teaches nothing.
 */

export interface MoreAction {
  key: string;
  label: string;
  /** What it does, in a sentence. */
  help: string;
  /** Why it cannot be used now. Present = disabled, and shown in place of `help`. */
  why?: string | null;
  icon: ReactNode;
  busy?: boolean;
  onClick: () => void;
}

export function NestMoreMenu({ actions, busy = false }: { actions: MoreAction[]; /** A download it started is on its way. */ busy?: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = !!anchor;
  return (
    <>
      <Button variant="outlined" id="nest-more-button" data-testid="nest-more" aria-haspopup="menu" aria-expanded={open || undefined}
        aria-controls={open ? 'nest-more-menu' : undefined} onClick={(e) => setAnchor(e.currentTarget)} endIcon={<ExpandMoreRounded />}
        startIcon={busy ? <CircularProgress size={14} color="inherit" aria-label="Working" /> : undefined}>
        More
      </Button>
      <Menu id="nest-more-menu" anchorEl={anchor} open={open} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ list: { 'aria-labelledby': 'nest-more-button' }, paper: { sx: { maxWidth: 'min(380px, calc(100vw - 32px))' } } }}>
        {actions.map((a) => (
          <MenuItem key={a.key} data-testid={`more-${a.key}`} disabled={!!a.why || a.busy}
            onClick={() => { setAnchor(null); a.onClick(); }}
            // A disabled item still has to be READ: it says why it is disabled.
            sx={{ alignItems: 'flex-start', whiteSpace: 'normal', py: 1, '&.Mui-disabled': { opacity: 1 } }}>
            <ListItemIcon sx={{ mt: '2px', color: a.why ? 'var(--c-text-3)' : 'var(--c-text-2)' }}>
              {a.busy ? <CircularProgress size={16} color="inherit" /> : a.icon}
            </ListItemIcon>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ fontSize: 13.5, fontWeight: 500, color: a.why ? 'var(--c-text-3)' : 'var(--c-text)' }}>{a.label}</Box>
              <Box data-testid={a.why ? `more-${a.key}-why` : undefined} sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{a.why ?? a.help}</Box>
            </Box>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
