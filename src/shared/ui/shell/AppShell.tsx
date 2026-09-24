import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Box, useMediaQuery, useTheme } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import { ErrorBoundary } from '@core/components/ErrorBoundary';
import { TopNav, type BrandMark, type QuickCreate } from './TopNav';
import { SectionNav } from './SectionNav';
import { MobileNavSheet } from './MobileNavSheet';
import { DetailTitleContext } from './detailTitle';
import { ShortcutsHelp, type ShortcutGroup } from '../ShortcutsHelp';
import { useShortcutsHelp } from '../hooks/useShortcutsHelp';
import { useCompanySlug } from '../hooks/useCompanySlug';
import {
  appPath,
  resolveNav,
  type Can,
  type CountMetaMap,
  type NavCounts,
  type NavSection,
} from '../types';

/**
 * The application shell (DESIGN_SYSTEM.md §3).
 *
 * Two thin rows instead of a rail:
 *   row 1 — the primary sections + search / create / theme / account
 *   row 2 — the active section's screens with live count badges, OR, on a
 *           detail route, a breadcrumb back to the collection
 *
 * Row 2 swapping to a breadcrumb on a detail route is deliberate. A sub-nav is
 * useless once you are three levels deep — what you need there is to know where
 * you are and how to get back out. Every label comes from `sections`, the one
 * nav source, so a breadcrumb cannot drift away from the nav that produced it.
 *
 * Mount it inside `ThemeScope` and inside `CommandPaletteProvider`.
 */
export function AppShell({
  appSlug,
  sections,
  brand,
  children,
  can,
  counts,
  countMeta,
  quickCreate,
  homePath = 'home',
  notificationsPath,
  accountItems,
  onSignOut,
  shortcutGroups,
}: {
  appSlug: string;
  /** The one nav source — also feeds the palette, the breadcrumb and the sheet. */
  sections: NavSection[];
  brand: BrandMark;
  children: ReactNode;
  /** Permission predicate. Defaults to the shared `useIsPermitted()`. */
  can?: Can;
  /** Live badge counts, keyed by `countKey`. Advisory: absent counts show nothing. */
  counts?: NavCounts;
  /** Tone and suffix per count key — which counts read as "needs you". */
  countMeta?: CountMetaMap;
  quickCreate?: QuickCreate[];
  homePath?: string;
  notificationsPath?: string;
  accountItems?: ReactNode;
  onSignOut?: () => void;
  /** App-specific keyboard bindings for the `?` sheet. */
  shortcutGroups?: ShortcutGroup[];
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { pathname } = useLocation();
  const company = useCompanySlug();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const shortcuts = useShortcutsHelp();

  const resolved = useMemo(
    () => resolveNav(sections, appSlug, pathname),
    [sections, appSlug, pathname],
  );
  const onDetail = !!resolved?.detailId;

  // Detail pages publish their own label (an order number, an item code) via
  // useDetailTitle. Until one does, fall back to the URL's trailing segments —
  // an id is poor, but it is better than an empty crumb.
  const [detailTitle, setDetailTitle] = useState<string | null>(null);
  const publishTitle = useCallback((t: string | null) => setDetailTitle(t), []);
  const detailLabel = detailTitle ?? resolved?.detailId ?? '…';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--c-canvas)',
      }}
    >
      <TopNav
        appSlug={appSlug}
        sections={sections}
        brand={brand}
        activeSection={resolved?.section.key ?? null}
        onOpenMobileNav={() => setMobileNavOpen(true)}
        isMobile={isMobile}
        can={can}
        quickCreate={quickCreate}
        homePath={homePath}
        notificationsPath={notificationsPath}
        accountItems={accountItems}
        onSignOut={onSignOut}
      />

      {onDetail && resolved ? (
        <Box
          component="nav"
          aria-label="Breadcrumb"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            height: 40,
            px: { xs: 1, md: 2 },
            flexShrink: 0,
            minWidth: 0,
            background: 'var(--c-surface)',
            borderBottom: '1px solid var(--c-border)',
          }}
        >
          <Box
            component={Link}
            to={appPath(company, appSlug, resolved.screen.path)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              flexShrink: 0,
              textDecoration: 'none',
              color: 'var(--c-text-2)',
              fontFamily: 'var(--font-ui)',
              fontSize: 13,
              fontWeight: 500,
              px: 0.75,
              py: 0.5,
              borderRadius: 'var(--r-sm)',
              '&:hover': { color: 'var(--c-primary-700)', background: 'var(--c-surface-2)' },
            }}
          >
            <ArrowBackRounded sx={{ fontSize: 15 }} aria-hidden />
            {resolved.screen.label}
          </Box>
          <ChevronRightRounded
            sx={{ fontSize: 15, color: 'var(--c-text-3)', flexShrink: 0 }}
            aria-hidden
          />
          <Box
            aria-current="page"
            sx={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--c-text)',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {detailLabel}
          </Box>
        </Box>
      ) : (
        !isMobile && (
          <SectionNav
            appSlug={appSlug}
            section={resolved?.section ?? null}
            counts={counts}
            countMeta={countMeta}
            can={can}
          />
        )
      )}

      <MobileNavSheet
        appSlug={appSlug}
        sections={sections}
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        can={can}
      />
      <ShortcutsHelp
        open={shortcuts.open}
        onClose={shortcuts.close}
        extraGroups={shortcutGroups}
      />

      <Box component="main" sx={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <Box
          key={pathname}
          sx={{
            p: { xs: 2, md: 3 },
            minHeight: '100%',
            // Route cross-fade (§5.7-7); reduced motion is guarded in tokens.css.
            animation: 'ui-route-in 200ms var(--ease)',
            '@keyframes ui-route-in': {
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
