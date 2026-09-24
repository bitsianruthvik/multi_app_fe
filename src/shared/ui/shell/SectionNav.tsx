import { Box } from '@mui/material';
import { NavLink, useLocation } from 'react-router-dom';
import { useCompanySlug } from '../hooks/useCompanySlug';
import { useIsPermitted } from '../hooks/useIsPermitted';
import {
  appPath,
  screenKey,
  type BadgeTone,
  type Can,
  type CountMetaMap,
  type NavCounts,
  type NavSection,
} from '../types';

/**
 * Row 2 of the top navigation — the active section's screens, each with a live
 * count badge (DESIGN_SYSTEM.md §3).
 *
 * The badges are the point. A row of inert labels tells you nothing; a row that
 * reads "Queue · 34 open · Machines · 9 running" tells you where the work is
 * before you click. That is what makes two thin rows better than the rail they
 * replace, not merely narrower.
 *
 * Counts are advisory: a missing one simply renders no badge. A count that is
 * only a size (items, machines) stays neutral; a count of waiting work takes a
 * tone from the app's `countMeta` so it can pull the eye.
 *
 * Renders nothing when the section has ≤1 permitted screen — a one-item second
 * row is chrome that earns no space.
 */
const TONE_STYLE: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--c-neutral-50)', fg: 'var(--c-neutral-800)' },
  success: { bg: 'var(--c-success-50)', fg: 'var(--c-success-800)' },
  warning: { bg: 'var(--c-warning-50)', fg: 'var(--c-warning-800)' },
  danger: { bg: 'var(--c-danger-50)', fg: 'var(--c-danger-800)' },
  info: { bg: 'var(--c-info-50)', fg: 'var(--c-info-800)' },
};

export function SectionNav({
  appSlug,
  section,
  counts = {},
  countMeta = {},
  can,
}: {
  appSlug: string;
  section: NavSection | null;
  counts?: NavCounts;
  countMeta?: CountMetaMap;
  can?: Can;
}) {
  const company = useCompanySlug();
  const { pathname } = useLocation();
  const permitted = useIsPermitted();
  const isPermitted = can ?? permitted;

  if (!section) return null;
  const screens = section.screens.filter((s) => isPermitted(s.permission));
  if (screens.length <= 1) return null;

  return (
    <Box
      component="nav"
      aria-label={`${section.label} screens`}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        height: 40,
        px: 1.5,
        flexShrink: 0,
        background: 'var(--c-surface)',
        borderBottom: '1px solid var(--c-border)',
        // The row must never wrap into two lines; on narrow screens it scrolls.
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      {screens.map((screen) => {
        const to = appPath(company, appSlug, screen.path);
        // Exact match, or a detail route beneath this screen.
        const active = pathname === to || pathname.startsWith(`${to}/`);
        const count = screen.countKey ? counts[screen.countKey] : undefined;
        const meta = screen.countKey ? countMeta[screen.countKey] : undefined;
        const tone = TONE_STYLE[meta?.tone ?? 'neutral'];

        return (
          <Box
            key={screenKey(screen)}
            component={NavLink}
            to={to}
            aria-current={active ? 'page' : undefined}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              flexShrink: 0,
              height: 28,
              px: 1.25,
              borderRadius: 'var(--r-sm)',
              textDecoration: 'none',
              fontFamily: 'var(--font-ui)',
              fontSize: 13,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              color: active ? 'var(--c-primary-700)' : 'var(--c-text-2)',
              background: active ? 'var(--c-primary-50)' : 'transparent',
              transition: 'background var(--t-fast) var(--ease), color var(--t-fast) var(--ease)',
              '&:hover': {
                color: 'var(--c-primary-700)',
                background: active ? 'var(--c-primary-50)' : 'var(--c-surface-2)',
              },
            }}
          >
            {screen.label}
            {count !== undefined && count > 0 && (
              <Box
                component="span"
                // Read as one phrase by a screen reader: "Queue, 34 open".
                aria-label={`${count}${meta?.suffix ? ` ${meta.suffix}` : ''}`}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.375,
                  px: 0.625,
                  height: 18,
                  borderRadius: 999,
                  background: tone.bg,
                  color: tone.fg,
                  fontFamily: 'var(--font-mono)',
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 10.5,
                  fontWeight: 500,
                }}
              >
                {count}
                {meta?.suffix && (
                  <Box component="span" sx={{ fontFamily: 'var(--font-ui)', fontSize: 10 }}>
                    {meta.suffix}
                  </Box>
                )}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
