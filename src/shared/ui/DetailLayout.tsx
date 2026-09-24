import React, { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { Surface } from './Surface';
import { Mono } from './Mono';
import { StageIcon, type StageState } from './StageIcon';

/**
 * A cross-link chip to a related record (DESIGN_SYSTEM.md §4.3).
 *
 * Every detail screen renders these. A record is a node in a graph, and the
 * whole reason someone opened it is usually to get to its neighbours; a detail
 * page with no way sideways sends them back to a list to search again.
 *
 * `to` makes it a router link (right-click, middle-click and copy-link all
 * work); `onClick` makes it an action.
 */
export function CrossLink({
  icon,
  label,
  count,
  to,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  count?: number;
  to?: string;
  onClick?: () => void;
}) {
  const active = !!to || !!onClick;
  return (
    <Box
      component={to ? Link : 'button'}
      {...(to ? { to } : { type: 'button', onClick })}
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
        textDecoration: 'none',
        fontFamily: 'var(--font-ui)',
        fontSize: 12.5,
        fontWeight: 500,
        cursor: active ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
        transition: 'all var(--t-fast) var(--ease)',
        '& svg': { fontSize: 16 },
        '&:hover': active
          ? {
              borderColor: 'var(--c-primary-200)',
              color: 'var(--c-primary-700)',
              background: 'var(--c-primary-50)',
            }
          : undefined,
      }}
    >
      {icon}
      {label}
      {count !== undefined && (
        <Box
          component="span"
          sx={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-text-3)' }}
        >
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
  /**
   * Optional completion marker, for a record whose tabs form a SEQUENCE rather
   * than a set of peers. Drawn with the same glyph a wizard rail or a stage
   * strip uses, so the same state never looks like two different things.
   * Left undefined, a tab looks exactly as it did before.
   */
  dot?: StageState;
}

/** The section tabs on their own, for a page that lays out its own header. */
export function DetailTabs({
  tabs,
  active,
  onTab,
}: {
  tabs: DetailTab[];
  active: string;
  onTab: (v: string) => void;
}) {
  return (
    <Box
      role="tablist"
      sx={{
        display: 'flex',
        gap: 0.5,
        mb: 2,
        borderBottom: '1px solid var(--c-border)',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      {tabs.map((t) => {
        const on = t.value === active;
        return (
          <Box
            key={t.value}
            role="tab"
            aria-selected={on}
            tabIndex={0}
            onClick={() => onTab(t.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onTab(t.value);
              }
            }}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1.5,
              py: 1,
              cursor: 'pointer',
              flexShrink: 0,
              fontFamily: 'var(--font-ui)',
              fontSize: 13.5,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              color: on ? 'var(--c-primary-700)' : 'var(--c-text-2)',
              borderBottom: '2px solid',
              borderColor: on ? 'var(--c-primary-500)' : 'transparent',
              mb: '-1px',
              transition: 'color var(--t-fast) var(--ease)',
              '&:hover': { color: 'var(--c-primary-700)' },
            }}
          >
            {t.dot && (
              <Box component="span" aria-hidden sx={{ display: 'inline-flex', flexShrink: 0 }}>
                <StageIcon state={t.dot} size={14} />
              </Box>
            )}
            {t.label}
            {t.count !== undefined && (
              <Box
                component="span"
                sx={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: on ? 'var(--c-primary-600)' : 'var(--c-text-3)',
                }}
              >
                {t.count}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Record / Detail scaffold (DESIGN_SYSTEM.md §4.3/§7.5): a solid e2 header →
 * the cross-link strip → an optional band (a stage strip, a warning) → section
 * tabs → a tab body that cross-fades in.
 */
export function DetailLayout({
  header,
  crossLinks,
  beforeTabs,
  tabs,
  active,
  onTab,
  children,
  maxWidth,
}: {
  header: React.ReactNode;
  crossLinks?: React.ReactNode;
  /** A band between the cross-links and the tabs — a stage strip lives here. */
  beforeTabs?: React.ReactNode;
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
    <Box sx={{ maxWidth }}>
      <Surface e={2} sx={{ p: 2.5, mb: crossLinks ? 1.5 : 2.5 }}>
        {header}
      </Surface>

      {crossLinks && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2.5 }}>{crossLinks}</Box>
      )}

      {beforeTabs}

      {tabs && tabs.length > 0 && <DetailTabs tabs={tabs} active={cur} onTab={setCur} />}

      <Box
        key={cur}
        sx={{
          animation: 'ui-tab-in 160ms var(--ease)',
          '@keyframes ui-tab-in': {
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

/**
 * The header inside DetailLayout's card: the code in mono with its badges, the
 * name as the page heading, a line of context, actions on the right, then the
 * key facts in a grid that wraps.
 */
export function DetailHeader({
  code,
  title,
  badges,
  subtitle,
  actions,
  facts,
  children,
}: {
  code?: React.ReactNode;
  title?: React.ReactNode;
  badges?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  facts?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
          mb: facts || children ? 2 : 0,
        }}
      >
        <Box sx={{ minWidth: 0, flex: '1 1 280px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', mb: 0.5 }}>
            {code &&
              (title ? (
                <Mono sx={{ fontSize: 18, fontWeight: 500, color: 'var(--c-text)' }}>{code}</Mono>
              ) : (
                <Box component="h1" sx={{ m: 0, display: 'inline-flex' }}>
                  <Mono sx={{ fontSize: 18, fontWeight: 500, color: 'var(--c-text)' }}>{code}</Mono>
                </Box>
              ))}
            {!code && title && (
              <Typography
                component="h1"
                sx={{ fontSize: 18, fontWeight: 600, color: 'var(--c-text)' }}
              >
                {title}
              </Typography>
            )}
            {badges}
          </Box>
          {code && title && (
            <Typography
              component="h1"
              sx={{
                fontSize: 15,
                fontWeight: 500,
                color: 'var(--c-text)',
                overflowWrap: 'anywhere',
              }}
            >
              {title}
            </Typography>
          )}
          {subtitle && (
            <Box sx={{ fontSize: 13.5, color: 'var(--c-text-2)', mt: 0.25 }}>{subtitle}</Box>
          )}
        </Box>
        {actions && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            {actions}
          </Box>
        )}
      </Box>
      {facts && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 2,
          }}
        >
          {facts}
        </Box>
      )}
      {children}
    </Box>
  );
}

/** A label/value pair for detail headers (11px caps label, 14px value). */
export function FactItem({ label, value, children }: {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: 'var(--c-text-3)',
          mb: 0.25,
        }}
      >
        {label}
      </Typography>
      <Box sx={{ fontSize: 14, color: 'var(--c-text)' }}>{value ?? children}</Box>
    </Box>
  );
}
