import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Box, useMediaQuery, useTheme } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import { ErrorBoundary } from '@core/components/ErrorBoundary';
import { resolveRoute } from '../../navMeta';
import { FabErpTopNav } from './FabErpTopNav';
import { SectionNav } from './SectionNav';
import { MobileNavSheet } from './MobileNavSheet';
import { ShortcutsHelp } from '../ShortcutsHelp';
import { useShortcutsHelp } from '../../hooks/useShortcutsHelp';
import { useCompanySlug } from '../../hooks/useCompanySlug';
import { DetailTitleContext } from './detailTitleContext';

/**
 * The fab_erp application shell (FAB_ERP_UX_ELEVATION_PLAN.md §2.1).
 *
 * Two thin rows instead of a 240px rail:
 *   row 1 — the five primary sections + search/create/theme/account
 *   row 2 — the active section's screens with live count badges, OR, on a
 *           detail route, a breadcrumb back to the collection
 *
 * Row 2 swapping to a breadcrumb on detail routes is deliberate. A sub-nav is
 * useless once you are three levels deep — what you need there is to know where
 * you are and how to get back out. This is also why the old top-bar breadcrumb
 * (which was stale for 12 of 30 routes) is gone: labels now come from navMeta,
 * so it cannot drift again.
 */
export function FabErpShell({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { pathname } = useLocation();
  const company = useCompanySlug();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const shortcuts = useShortcutsHelp();

  const resolved = useMemo(() => resolveRoute(pathname), [pathname]);
  const onDetail = !!resolved?.isChild;

  // Detail pages publish their own label (order number, item code…) via
  // useDetailTitle. Until one does, fall back to the URL's trailing segments.
  const [detailTitle, setDetailTitle] = useState<string | null>(null);
  const publishTitle = useCallback((t: string | null) => setDetailTitle(t), []);
  const urlLabel = pathname.split('/').filter(Boolean).slice(3).join(' / ');
  const detailLabel = detailTitle ?? urlLabel;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--c-canvas)' }}>
      <FabErpTopNav
        activeSection={resolved?.section ?? null}
        onOpenMobileNav={() => setMobileNavOpen(true)}
        isMobile={isMobile}
      />

      {!isMobile && (
        onDetail && resolved ? (
          <Box
            component="nav"
            aria-label="Breadcrumb"
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.5,
              height: 40, px: 2, flexShrink: 0,
              background: 'var(--c-surface)',
              borderBottom: '1px solid var(--c-border)',
            }}
          >
            <Box
              component={Link}
              to={`/${company}/fab_erp/${resolved.entry.slug}`}
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.5,
                textDecoration: 'none', color: 'var(--c-text-2)',
                fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500,
                px: 0.75, py: 0.5, borderRadius: 'var(--r-sm)',
                '&:hover': { color: 'var(--c-primary-700)', background: 'var(--c-surface-2)' },
              }}
            >
              <ArrowBackRounded sx={{ fontSize: 15 }} aria-hidden />
              {resolved.entry.label}
            </Box>
            <ChevronRightRounded sx={{ fontSize: 15, color: 'var(--c-text-3)' }} aria-hidden />
            <Box
              aria-current="page"
              sx={{
                fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500,
                color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {detailLabel}
            </Box>
          </Box>
        ) : (
          <SectionNav section={resolved?.section ?? null} />
        )
      )}

      <MobileNavSheet open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <ShortcutsHelp open={shortcuts.open} onClose={shortcuts.close} />

      <Box component="main" sx={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <Box
          key={pathname}
          sx={{
            p: { xs: 2, md: 3 },
            minHeight: '100%',
            // Route cross-fade (DESIGN_SYSTEM.md §5.7-7). Suppressed for
            // reduced-motion by the global guard in tokens.css.
            animation: 'fab-route-in 200ms var(--ease)',
            '@keyframes fab-route-in': {
              from: { opacity: 0, transform: 'translateY(4px)' },
              to: { opacity: 1, transform: 'translateY(0)' },
            },
          }}
        >
          <ErrorBoundary level="page">
            <DetailTitleContext.Provider value={publishTitle}>
              {children}
            </DetailTitleContext.Provider>
          </ErrorBoundary>
        </Box>
      </Box>
    </Box>
  );
}
