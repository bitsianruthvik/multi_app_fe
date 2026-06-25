import React, { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { Surface } from './Surface';

/** A clickable cross-link chip (DESIGN_SYSTEM.md §2.2 relationship web). */
export function CrossLink({
  icon,
  label,
  count,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        height: 30,
        px: 1.25,
        borderRadius: 'var(--r-sm)',
        border: '1px solid var(--c-border)',
        background: 'var(--c-surface)',
        color: 'var(--c-text-2)',
        fontFamily: 'var(--font-ui)',
        fontSize: 12.5,
        fontWeight: 500,
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
        transition: 'all var(--t-fast) var(--ease)',
        '& svg': { fontSize: 16 },
        '&:hover': onClick
          ? { borderColor: 'var(--c-primary-200)', color: 'var(--c-primary-700)', background: 'var(--c-primary-50)' }
          : undefined,
      }}
    >
      {icon}
      {label}
      {count !== undefined && (
        <Box component="span" sx={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-text-3)' }}>
          {count}
        </Box>
      )}
    </Box>
  );
}

export interface DetailTab {
  value: string;
  label: string;
  count?: number;
}

/**
 * Record/Detail scaffold (DESIGN_SYSTEM.md §4.3/§7.5): solid e2 header → cross-link
 * strip (always render for a Detail) → section tabs → solid tab body with cross-fade.
 */
export function DetailLayout({
  header,
  crossLinks,
  tabs,
  active,
  onTab,
  children,
  maxWidth,
}: {
  header: React.ReactNode;
  crossLinks?: React.ReactNode;
  tabs?: DetailTab[];
  active?: string;
  onTab?: (v: string) => void;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  const [internal, setInternal] = useState(tabs?.[0]?.value ?? '');
  const cur = active ?? internal;
  const setCur = onTab ?? setInternal;

  return (
    <Box sx={{ maxWidth, mx: maxWidth ? 'auto' : undefined }}>
      <Surface e={2} sx={{ p: 2.5, mb: crossLinks ? 1.5 : 2.5 }}>
        {header}
      </Surface>

      {crossLinks && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2.5 }}>{crossLinks}</Box>
      )}

      {tabs && tabs.length > 0 && (
        <Box
          role="tablist"
          sx={{
            display: 'flex',
            gap: 0.5,
            mb: 2,
            borderBottom: '1px solid var(--c-border)',
          }}
        >
          {tabs.map((t) => {
            const on = t.value === cur;
            return (
              <Box
                key={t.value}
                role="tab"
                aria-selected={on}
                tabIndex={0}
                onClick={() => setCur(t.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setCur(t.value);
                  }
                }}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 1.5,
                  py: 1,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: on ? 'var(--c-primary-700)' : 'var(--c-text-2)',
                  borderBottom: '2px solid',
                  borderColor: on ? 'var(--c-primary-500)' : 'transparent',
                  mb: '-1px',
                  transition: 'color var(--t-fast) var(--ease)',
                  '&:hover': { color: 'var(--c-primary-700)' },
                }}
              >
                {t.label}
                {t.count !== undefined && (
                  <Box component="span" sx={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: on ? 'var(--c-primary-600)' : 'var(--c-text-3)' }}>
                    {t.count}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      <Box
        key={cur}
        sx={{
          animation: 'fab-tab-in 160ms var(--ease)',
          '@keyframes fab-tab-in': {
            from: { opacity: 0, transform: 'translateY(4px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

/** A label/value pair for detail headers. */
export function FactItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.25 }}>
        {label}
      </Typography>
      <Box sx={{ fontSize: 14, color: 'var(--c-text)' }}>{value}</Box>
    </Box>
  );
}
