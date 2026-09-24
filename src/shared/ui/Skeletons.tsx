import { Box } from '@mui/material';
import { Surface } from './Surface';

/**
 * Shimmer skeletons (DESIGN_SYSTEM.md §5.7-5). Lists and detail bodies show a
 * placeholder shaped like the thing that is coming — never a centred spinner,
 * which tells the reader nothing about what they are waiting for. Spinners are
 * for button-local busy only.
 *
 * Reduced-motion users get a static tint: the shimmer keyframe is suppressed by
 * the global guard in tokens.css, and the silhouette still does its job.
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
        animation: 'ui-shimmer 1.4s ease infinite',
        '@keyframes ui-shimmer': {
          '0%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      }}
    />
  );
}

/** Plain placeholder rows, for a body whose shape isn't a list of entity rows. */
export function SkeletonRows({ rows = 6, height = 40 }: { rows?: number; height?: number }) {
  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonBlock key={i} h={height} r={8} />
      ))}
    </Box>
  );
}

/** A list of placeholder rows matching EntityRow's height. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <Surface
          key={i}
          e={1}
          sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5 }}
        >
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

/** The StatStrip while it loads — the same grid, so nothing jumps when numbers land. */
export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'repeat(2, minmax(0, 1fr))',
          sm: 'repeat(auto-fit, minmax(200px, 1fr))',
        },
        gap: 1.5,
        mb: 3,
      }}
      aria-busy="true"
      aria-label="Loading"
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

/**
 * Detail-page placeholder: header block + fact pairs + a body slab. It matches
 * DetailLayout's shape so the page doesn't visibly re-flow when the real
 * content lands.
 */
export function DetailSkeleton() {
  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
      aria-busy="true"
      aria-label="Loading"
    >
      <Surface e={2} sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <SkeletonBlock w={180} h={20} r={6} />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 2,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <Box key={i} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <SkeletonBlock w="45%" h={10} />
              <SkeletonBlock w="70%" h={14} />
            </Box>
          ))}
        </Box>
      </Surface>
      <Surface e={1} sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} w={`${90 - i * 8}%`} h={13} />
        ))}
      </Surface>
    </Box>
  );
}

/**
 * Chart placeholder. Deliberately draws bars of varying height rather than one
 * grey slab — the silhouette tells the reader a chart is coming, so the page
 * doesn't read as broken while it loads.
 */
export function ChartSkeleton({ height = 220 }: { height?: number }) {
  const bars = [58, 82, 41, 96, 67, 74, 35, 88];
  return (
    <Surface e={1} sx={{ p: 2.5 }} aria-busy="true" aria-label="Loading">
      <SkeletonBlock w={160} h={13} />
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1.25, height, mt: 2 }}>
        {bars.map((h, i) => (
          <SkeletonBlock key={i} w="100%" h={`${h}%`} r={6} />
        ))}
      </Box>
    </Surface>
  );
}

/** Card-grid placeholder — a cockpit, a setup hub, a board of cards. */
export function CardGridSkeleton({
  count = 6,
  height = 108,
}: {
  count?: number;
  height?: number;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 1.5,
      }}
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Surface
          key={i}
          e={1}
          sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.25, height }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <SkeletonBlock w={34} h={34} r={8} />
            <SkeletonBlock w="55%" h={14} />
          </Box>
          <SkeletonBlock w="85%" h={11} />
          <SkeletonBlock w="40%" h={11} />
        </Surface>
      ))}
    </Box>
  );
}
