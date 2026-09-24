import { Box, Drawer } from '@mui/material';
import { NavLink, useLocation } from 'react-router-dom';
import { useCompanySlug } from '../hooks/useCompanySlug';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { appPath, screenKey, type Can, type NavSection } from '../types';

/**
 * Mobile navigation — both rows of the top nav as one scrollable list.
 *
 * On a phone there is no room for two horizontal rows, and a horizontally
 * scrolling primary nav hides items with no affordance at all. A full-height
 * sheet showing every permitted screen at once is both simpler and more
 * complete than what it replaces.
 */
export function MobileNavSheet({
  appSlug,
  sections,
  open,
  onClose,
  can,
}: {
  appSlug: string;
  sections: NavSection[];
  open: boolean;
  onClose: () => void;
  can?: Can;
}) {
  const company = useCompanySlug();
  const { pathname } = useLocation();
  const permitted = useIsPermitted();
  const isPermitted = can ?? permitted;

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { width: 280, background: 'var(--c-surface)', borderRight: '1px solid var(--c-border)' },
      }}
    >
      <Box component="nav" aria-label="Main" sx={{ py: 1.5 }}>
        {sections.map((section) => {
          const screens = section.screens.filter((s) => isPermitted(s.permission));
          if (!screens.length) return null;
          return (
            <Box key={section.key} sx={{ mb: 1.5 }}>
              <Box
                sx={{
                  px: 2,
                  pb: 0.5,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--c-text-3)',
                }}
              >
                {section.label}
              </Box>
              {screens.map((screen) => {
                const to = appPath(company, appSlug, screen.path);
                const active = pathname === to || pathname.startsWith(`${to}/`);
                return (
                  <Box
                    key={screenKey(screen)}
                    component={NavLink}
                    to={to}
                    onClick={onClose}
                    aria-current={active ? 'page' : undefined}
                    sx={{
                      display: 'block',
                      mx: 1,
                      px: 1.5,
                      py: 1,
                      borderRadius: 'var(--r-sm)',
                      textDecoration: 'none',
                      fontFamily: 'var(--font-ui)',
                      fontSize: 14,
                      fontWeight: 500,
                      color: active ? 'var(--c-primary-700)' : 'var(--c-text)',
                      background: active ? 'var(--c-primary-50)' : 'transparent',
                    }}
                  >
                    {screen.label}
                  </Box>
                );
              })}
            </Box>
          );
        })}
      </Box>
    </Drawer>
  );
}
