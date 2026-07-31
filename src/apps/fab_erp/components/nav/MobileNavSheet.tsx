import { Box, Drawer } from '@mui/material';
import { NavLink, useLocation } from 'react-router-dom';
import { NAV_SECTIONS } from '../../navMeta';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { useCompanySlug } from '../../hooks/useCompanySlug';

/**
 * Mobile navigation — both levels of the top nav as one scrollable list.
 *
 * On a phone there is no room for two horizontal rows, and a horizontally
 * scrolling primary nav hides items with no affordance. A full-height sheet
 * showing every permitted screen at once is both simpler and more complete
 * than what it replaces.
 */
export function MobileNavSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const company = useCompanySlug();
  const { pathname } = useLocation();
  const isPermitted = useIsPermitted();

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: 280,
          background: 'var(--c-surface)',
          borderRight: '1px solid var(--c-border)',
        },
      }}
    >
      <Box component="nav" aria-label="Main" sx={{ py: 1.5 }}>
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((i) => isPermitted(i.permission));
          if (!items.length) return null;
          return (
            <Box key={section.id} sx={{ mb: 1.5 }}>
              <Box
                sx={{
                  px: 2, pb: 0.5,
                  fontSize: 11, fontWeight: 600, letterSpacing: '.06em',
                  textTransform: 'uppercase', color: 'var(--c-text-3)',
                }}
              >
                {section.label}
              </Box>
              {items.map((item) => {
                const to = `/${company}/fab_erp/${item.slug}`;
                const active = pathname === to || pathname.startsWith(`${to}/`);
                return (
                  <Box
                    key={item.slug}
                    component={NavLink}
                    to={to}
                    onClick={onClose}
                    sx={{
                      display: 'block',
                      mx: 1, px: 1.5, py: 1,
                      borderRadius: 'var(--r-sm)',
                      textDecoration: 'none',
                      fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 500,
                      color: active ? 'var(--c-primary-700)' : 'var(--c-text)',
                      background: active ? 'var(--c-primary-50)' : 'transparent',
                    }}
                  >
                    {item.label}
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
