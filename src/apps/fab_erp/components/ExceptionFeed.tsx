import { Box } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import type { ReactNode } from 'react';
import { Surface } from './Surface';

/**
 * The cockpit's exception feed — one prioritised list of specific problems
 * (FAB_ERP_UX_ELEVATION_PLAN.md §6.1).
 *
 * Deliberately a single ordered list rather than a grid of per-category cards.
 * Four cards force the reader to compare severities themselves; one list that
 * is already sorted worst-first tells them where to start. Each row names the
 * actual record and links straight to it — a count with no target is a dead end.
 *
 * The empty state is a feature, not a fallback: "nothing needs you" is the most
 * valuable thing this surface can say, so it says it clearly.
 */

export type ExceptionSeverity = 'danger' | 'warning' | 'info';

export interface ExceptionItem {
  id: string;
  severity: ExceptionSeverity;
  /** Short lead, e.g. "SO-20260715-0002". Rendered mono when `code` is true. */
  label: string;
  code?: boolean;
  /** The problem, in plain language. */
  detail: string;
  /** Right-aligned magnitude, e.g. "12 days late". */
  metric?: string;
  onClick?: () => void;
}

const TONE: Record<ExceptionSeverity, { bar: string; fg: string; bg: string }> = {
  danger: { bar: 'var(--c-danger-600)', fg: 'var(--c-danger-800)', bg: 'var(--c-danger-50)' },
  warning: { bar: 'var(--c-warning-600)', fg: 'var(--c-warning-800)', bg: 'var(--c-warning-50)' },
  info: { bar: 'var(--c-info-600)', fg: 'var(--c-info-800)', bg: 'var(--c-info-50)' },
};

// Worst first. The list's whole job is to order the reader's attention.
const SEVERITY_RANK: Record<ExceptionSeverity, number> = { danger: 0, warning: 1, info: 2 };

export function ExceptionFeed({
  items,
  title = 'Needs attention',
  emptyMessage = 'Nothing needs your attention right now.',
  action,
}: {
  items: ExceptionItem[];
  title?: string;
  emptyMessage?: string;
  action?: ReactNode;
}) {
  const sorted = [...items].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  return (
    <Surface e={1} sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 1.75,
          borderBottom: '1px solid var(--c-divider)',
        }}
      >
        <Box component="h2" sx={{ m: 0, fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>
          {title}
        </Box>
        {sorted.length > 0 && (
          <Box
            sx={{
              fontFamily: 'var(--font-mono)', fontSize: 11.5, px: 0.875, py: 0.125,
              borderRadius: 999, background: 'var(--c-surface-2)', color: 'var(--c-text-2)',
            }}
          >
            {sorted.length}
          </Box>
        )}
        <Box sx={{ ml: 'auto' }}>{action}</Box>
      </Box>

      {sorted.length === 0 ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2.5, py: 3 }}>
          <CheckCircleRounded sx={{ fontSize: 20, color: 'var(--c-success-600)' }} aria-hidden />
          <Box sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>{emptyMessage}</Box>
        </Box>
      ) : (
        sorted.map((item) => {
          const tone = TONE[item.severity];
          return (
            <Box
              key={item.id}
              component={item.onClick ? 'button' : 'div'}
              type={item.onClick ? 'button' : undefined}
              onClick={item.onClick}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, width: '100%',
                px: 2.5, py: 1.5, textAlign: 'left',
                border: 'none', borderBottom: '1px solid var(--c-divider)',
                background: 'transparent',
                cursor: item.onClick ? 'pointer' : 'default',
                font: 'inherit',
                transition: 'background var(--t-fast) var(--ease)',
                '&:last-of-type': { borderBottom: 'none' },
                '&:hover': item.onClick ? { background: 'var(--c-surface-2)' } : undefined,
              }}
            >
              {/* Severity is carried by a bar AND the tinted label, never colour
                  alone — the label text states the problem regardless. */}
              <Box sx={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: tone.bar, flexShrink: 0 }} aria-hidden />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Box
                  sx={{
                    fontSize: 13.5, fontWeight: 500, color: 'var(--c-text)',
                    fontFamily: item.code ? 'var(--font-mono)' : 'var(--font-ui)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </Box>
                <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.125 }}>{item.detail}</Box>
              </Box>
              {item.metric && (
                <Box
                  sx={{
                    flexShrink: 0, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
                    fontSize: 11.5, fontWeight: 500, px: 1, py: 0.375, borderRadius: 'var(--r-sm)',
                    background: tone.bg, color: tone.fg,
                  }}
                >
                  {item.metric}
                </Box>
              )}
              {item.onClick && (
                <ChevronRightRounded sx={{ fontSize: 18, color: 'var(--c-text-3)', flexShrink: 0 }} aria-hidden />
              )}
            </Box>
          );
        })
      )}
    </Surface>
  );
}
