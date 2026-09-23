import { Box } from '@mui/material';
import { NavLink, useLocation } from 'react-router-dom';
import { COUNT_TONE, appPath, type BadgeTone, type NavSection } from '../../navMeta';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { useNavCounts } from '../../hooks/useNavCounts';
import { useCompanySlug } from '../../hooks/useLoad';

/**
 * Row 2 of the top navigation — the active section's screens, each with a live
 * count badge, as in fab_erp's SectionNav. A count that is merely a size stays
 * neutral; a count of waiting work (open orders, draft flows, held batches)
 * takes a tone so it pulls the eye. Renders nothing when the section has ≤1
 * permitted screen: a one-item second row is chrome that earns no space.
 */
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
  const screens = section.screens.filter((s) => isPermitted(s.permission));
  if (screens.length <= 1) return null;

  return (
    <Box component="nav" aria-label={`${section.label} screens`} sx={{
      display: 'flex', alignItems: 'center', gap: 0.25, height: 40, px: 1.5, flexShrink: 0,
      background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)',
      overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
    }}>
      {screens.map((screen) => {
        const to = appPath(company, screen.path);
        const active = pathname === to || pathname.startsWith(`${to}/`);
        const count = screen.countKey ? counts[screen.countKey] : undefined;
        const meta = screen.countKey ? COUNT_TONE[screen.countKey] : undefined;
        const tone = TONE_STYLE[meta?.tone ?? 'neutral'];
        return (
          <Box key={screen.key} component={NavLink} to={to} aria-current={active ? 'page' : undefined} sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.75, flexShrink: 0, height: 28, px: 1.25,
            borderRadius: 'var(--r-sm)', textDecoration: 'none', fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
            color: active ? 'var(--c-primary-700)' : 'var(--c-text-2)', background: active ? 'var(--c-primary-50)' : 'transparent',
            transition: 'background var(--t-fast) var(--ease), color var(--t-fast) var(--ease)',
            '&:hover': { color: 'var(--c-primary-700)', background: active ? 'var(--c-primary-50)' : 'var(--c-surface-2)' },
          }}>
            {screen.label}
            {count !== undefined && count > 0 && (
              <Box component="span" aria-label={`${count}${meta?.suffix ? ` ${meta.suffix}` : ''}`} sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.375, px: 0.625, height: 18, borderRadius: 999,
                background: tone.bg, color: tone.fg, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 10.5, fontWeight: 500,
              }}>
                {count}
                {meta?.suffix && <Box component="span" sx={{ fontFamily: 'var(--font-ui)', fontSize: 10 }}>{meta.suffix}</Box>}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
