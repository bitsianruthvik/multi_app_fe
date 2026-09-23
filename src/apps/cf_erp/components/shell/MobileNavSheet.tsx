import { Box, Drawer } from '@mui/material';
import { NavLink, useLocation } from 'react-router-dom';
import { SECTIONS, appPath } from '../../navMeta';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { useCompanySlug } from '../../hooks/useLoad';

/** Phone navigation: both nav rows as one list in a sheet (as in fab_erp). */
export function MobileNavSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const company = useCompanySlug();
  const { pathname } = useLocation();
  const isPermitted = useIsPermitted();
  return (
    <Drawer anchor="left" open={open} onClose={onClose} PaperProps={{ sx: { width: 280, background: 'var(--c-surface)', borderRight: '1px solid var(--c-border)' } }}>
      <Box component="nav" aria-label="Main" sx={{ py: 1.5 }}>
        {SECTIONS.map((section) => {
          const screens = section.screens.filter((s) => isPermitted(s.permission));
          if (!screens.length) return null;
          return (
            <Box key={section.key} sx={{ mb: 1.5 }}>
              <Box sx={{ px: 2, pb: 0.5, fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>{section.label}</Box>
              {screens.map((screen) => {
                const to = appPath(company, screen.path);
                const active = pathname === to || pathname.startsWith(`${to}/`);
                return (
                  <Box key={screen.key} component={NavLink} to={to} onClick={onClose} sx={{
                    display: 'block', mx: 1, px: 1.5, py: 1, borderRadius: 'var(--r-sm)', textDecoration: 'none', fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 500,
                    color: active ? 'var(--c-primary-700)' : 'var(--c-text)', background: active ? 'var(--c-primary-50)' : 'transparent',
                  }}>
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
