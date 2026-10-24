import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, useMediaQuery, useTheme } from '@mui/material';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import { ErrorBoundary } from '@core/components/ErrorBoundary';
import { resolveNav, appPath, navSectionOf } from '../../navMeta';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { TopNav } from './TopNav';
import { SectionNav } from './SectionNav';
import { MobileNavSheet } from './MobileNavSheet';
import { ShortcutsHelp } from '../ShortcutsHelp';
import { useShortcutsHelp } from '../../hooks/useShortcutsHelp';
import { useCompanySlug } from '../../hooks/useLoad';
import { DetailTitleContext } from './detailTitle';
import { backOf } from './backState';
import { HelpProvider } from '../../help/HelpProvider';

/**
 * The cf_erp application shell — fab_erp's FabErpShell, same two thin rows:
 *   row 1 — the primary sections + search / create / theme / account
 *   row 2 — the active section's screens with live count badges, OR, on a
 *           detail route, a breadcrumb back to the collection
 * Three levels deep a sub-nav is useless; what you need is where you are and
 * the way out. Labels come from navMeta, so the breadcrumb cannot drift.
 */
export function CfErpShell({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { pathname, state } = useLocation();
  const navigate = useNavigate();
  // Opened from another record (a BOM row): the way back is that record, not the collection.
  const back = backOf(state);
  const company = useCompanySlug();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const shortcuts = useShortcutsHelp();

  // A path in two sections (Dashboard; Machines and Tools in Maintenance) stays in the section its menu link named, else
  // in the section you were in — so Maintenance › Machine register does not jump to the Production tab.
  const isPermitted = useIsPermitted();
  const lastSection = useRef<string | null>(null);
  // The section of the previous page: read on each navigation, written after it (an effect, not a render-time update).
  const prefer = navSectionOf(state) ?? lastSection.current;
  const resolved = useMemo(() => resolveNav(pathname, { prefer, isPermitted }), [pathname, prefer, isPermitted]);
  const sectionKey = resolved?.section.key ?? null;
  useEffect(() => { if (sectionKey) lastSection.current = sectionKey; }, [sectionKey]);
  const onDetail = !!resolved?.detailId;

  // Detail pages publish their own label (order number, item code…) via
  // useDetailTitle. Until one does, the breadcrumb shows an ellipsis.
  const [detailTitle, setDetailTitle] = useState<string | null>(null);
  const publishTitle = useCallback((t: string | null) => setDetailTitle(t), []);

  // The machine log is used at a machine on a tablet: no top navigation, just the page.
  if (resolved?.screen.key === 'floor') return <HelpProvider><ErrorBoundary level="page">{children}</ErrorBoundary></HelpProvider>;

  return (
    <HelpProvider onShortcuts={shortcuts.show}>
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--c-canvas)' }}>
      <TopNav activeSection={resolved?.section.key ?? null} onOpenMobileNav={() => setMobileNavOpen(true)} isMobile={isMobile} />

      {onDetail && resolved ? (
        <Box component="nav" aria-label="Breadcrumb" sx={{
          display: 'flex', alignItems: 'center', gap: 0.5, height: 40, px: { xs: 1, md: 2 }, flexShrink: 0, minWidth: 0,
          background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)',
        }}>
          {back && (
            <Box component="button" type="button" onClick={() => navigate(-1)} title={`Back to ${back.label}`} sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0, border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--c-primary-700)',
              fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, px: 0.75, py: 0.5, borderRadius: 'var(--r-sm)',
              '&:hover': { background: 'var(--c-surface-2)' },
            }}>
              <ArrowBackRounded sx={{ fontSize: 15 }} aria-hidden />
              {back.label}
            </Box>
          )}
          {back && <Box aria-hidden sx={{ width: '1px', height: 18, background: 'var(--c-border)', mx: 0.5, flexShrink: 0 }} />}
          <Box component={Link} to={appPath(company, resolved.screen.path)} sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0, textDecoration: 'none', color: 'var(--c-text-2)',
            fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, px: 0.75, py: 0.5, borderRadius: 'var(--r-sm)',
            '&:hover': { color: 'var(--c-primary-700)', background: 'var(--c-surface-2)' },
          }}>
            <ArrowBackRounded sx={{ fontSize: 15 }} aria-hidden />
            {resolved.screen.label}
          </Box>
          <ChevronRightRounded sx={{ fontSize: 15, color: 'var(--c-text-3)', flexShrink: 0 }} aria-hidden />
          <Box aria-current="page" sx={{
            fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500, color: 'var(--c-text)', minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {detailTitle ?? '…'}
          </Box>
        </Box>
      ) : (
        !isMobile && <SectionNav section={resolved?.section ?? null} />
      )}

      <MobileNavSheet open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <ShortcutsHelp open={shortcuts.open} onClose={shortcuts.close} />

      <Box component="main" sx={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <Box key={pathname} sx={{
          p: { xs: 2, md: 3 }, minHeight: '100%',
          // Route change: the new page fades and rises 4px into place — 160 ms, opacity/transform only (no layout shift),
          // the content is there at once so nothing waits on it. Reduced motion: motion.css's kill-switch.
          animation: 'cf-route-in var(--m-dur-base) var(--m-ease-standard)',
          '@keyframes cf-route-in': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        }}>
          <ErrorBoundary level="page">
            <DetailTitleContext.Provider value={publishTitle}>{children}</DetailTitleContext.Provider>
          </ErrorBoundary>
        </Box>
      </Box>
    </Box>
    </HelpProvider>
  );
}
