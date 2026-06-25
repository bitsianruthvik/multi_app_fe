import { Box } from '@mui/material';
import { Surface } from './Surface';

/**
 * Shimmer skeleton block (DESIGN_SYSTEM.md §5.7-5). Used while fetching —
 * never a centered spinner for lists/detail bodies. The shimmer keyframe is
 * defined inline once via a styled wrapper; reduced-motion users get a static
 * tint (the keyframe animation is suppressed by the global guard in tokens.css).
 */
export function SkeletonBlock({
  w = '100%',
  h = 14,
  r = 6,
}: {
  w?: number | string;
  h?: number | string;
  r?: number | string;
}) {
  return (
    <Box
      sx={{
        width: w,
        height: h,
        borderRadius: typeof r === 'number' ? `${r}px` : r,
        background:
          'linear-gradient(90deg, var(--c-surface-2) 25%, var(--c-divider) 37%, var(--c-surface-2) 63%)',
        backgroundSize: '400% 100%',
        animation: 'fab-shimmer 1.4s ease infinite',
        '@keyframes fab-shimmer': {
          '0%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      }}
    />
  );
}

/** A list of placeholder rows matching EntityRow height. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Surface key={i} e={1} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5 }}>
          <SkeletonBlock w={64} h={20} r={8} />
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <SkeletonBlock w="40%" h={13} />
            <SkeletonBlock w="22%" h={11} />
          </Box>
          <SkeletonBlock w={72} h={22} r={8} />
        </Surface>
      ))}
    </Box>
  );
}

/** A grid of placeholder stat cards. */
export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 1.5,
        mb: 3,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Surface key={i} e={1} sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <SkeletonBlock w={38} h={38} r={8} />
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <SkeletonBlock w="50%" h={11} />
            <SkeletonBlock w="35%" h={20} />
          </Box>
        </Surface>
      ))}
    </Box>
  );
}
