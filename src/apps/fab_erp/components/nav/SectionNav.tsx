import { Box } from '@mui/material';
import { NavLink, useLocation } from 'react-router-dom';
import type { NavSection, BadgeTone } from '../../navMeta';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { useNavCounts } from '../../hooks/useNavCounts';
import { useCompanySlug } from '../../hooks/useCompanySlug';

/**
 * Row 2 of the top navigation — the active section's screens, each with a live
 * count badge (FAB_ERP_UX_ELEVATION_PLAN.md §2.1).
 *
 * The badges are the point. A rail of 21 inert labels tells you nothing; a row
 * that reads "Queue · 34 · Machines · 9 running" tells you where the work is
 * before you click. That is what makes this more intuitive than the rail it
 * replaces, not merely narrower.
 *
 * Renders nothing when the section has ≤1 permitted item — a single-item second
 * row is chrome that earns no space (this is why Today shows no row 2).
 */

/**
 * Which counts mean "this needs you" rather than "this is how big it is".
 * A count that is merely a size (items, BOMs, machines) stays neutral; a count
 * that represents pending work gets a tone so it can pull the eye.
 */
const TONE_BY_KEY: Record<string, BadgeTone> = {
  openTasks: 'info',
  posInTransit: 'warning',
  redBuffers: 'danger',
  machinesRunning: 'success',
  openOrders: 'info',
};

/** Suffix that turns a bare number into a readable phrase. */
const SUFFIX_BY_KEY: Record<string, string> = {
  openTasks: 'open',
  machinesRunning: 'running',
  posInTransit: 'in transit',
  redBuffers: 'red',
  openOrders: 'open',
  activeOrders: 'active',
};

const TONE_STYLE: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--c-neutral-50)', fg: 'var(--c-neutral-800)' },
  success: { bg: 'var(--c-success-50)', fg: 'var(--c-success-800)' },
  warning: { bg: 'var(--c-warning-50)', fg: 'var(--c-warning-800)' },
  danger: { bg: 'var(--c-danger-50)', fg: 'var(--c-danger-800)' },
  info: { bg: 'var(--c-info-50)', fg: 'var(--c-info-800)' },
};

export function SectionNav({ section }: { section: NavSection | null }) {
  const company = useCompanySlug();
  const { pathname } = useLocation();
  const isPermitted = useIsPermitted();
  const { counts } = useNavCounts();

  if (!section) return null;
  const items = section.items.filter((i) => isPermitted(i.permission));
  if (items.length <= 1) return null;

  return (
    <Box
      component="nav"
      aria-label={`${section.label} sections`}
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 'var(--z-topnav)',
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        height: 40,
        px: 1.5,
        background: 'var(--c-surface)',
        borderBottom: '1px solid var(--c-border)',
        // The row must never wrap into two lines; on narrow screens it scrolls.
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      {items.map((item) => {
        const to = `/${company}/fab_erp/${item.slug}`;
        // Exact match, or a detail route beneath this entry.
        const active = pathname === to || pathname.startsWith(`${to}/`);
        const count = item.countKey ? counts[item.countKey] : undefined;
        const tone = TONE_STYLE[(item.countKey && TONE_BY_KEY[item.countKey]) || 'neutral'];
        const suffix = item.countKey ? SUFFIX_BY_KEY[item.countKey] : undefined;

        return (
          <Box
            key={item.slug}
            component={NavLink}
            to={to}
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
            {item.label}
            {count !== undefined && count > 0 && (
              <Box
                component="span"
                // Read as one phrase by a screen reader: "Queue, 34 open".
                aria-label={`${count}${suffix ? ` ${suffix}` : ''}`}
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
                {suffix && (
                  <Box component="span" sx={{ fontFamily: 'var(--font-ui)', fontSize: 10 }}>
                    {suffix}
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
