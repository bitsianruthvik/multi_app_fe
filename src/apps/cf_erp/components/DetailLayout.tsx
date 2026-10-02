import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { Link } from 'react-router-dom';
import { readPref, writePref } from '@shared/ui';
import { Mono, Surface } from './ui';

/**
 * Record / Detail scaffold (DESIGN_SYSTEM.md §4.3, §7.5) — the same shape as
 * fab_erp's DetailLayout: solid e2 header → cross-link strip → section tabs
 * with counts → a tab body that cross-fades in.
 */

/** A cross-link chip to a related record (§2.2). `to` makes it a link; `onClick` an action. */
export function CrossLink({ icon, label, count, to, onClick }: { icon?: ReactNode; label: string; count?: number; to?: string; onClick?: () => void }) {
  const active = !!to || !!onClick;
  return (
    <Box
      component={to ? Link : 'button'}
      {...(to ? { to } : { type: 'button', onClick })}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.75, height: 30, px: 1.25, borderRadius: 'var(--r-sm)',
        border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text-2)', textDecoration: 'none',
        fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 500, cursor: active ? 'pointer' : 'default', whiteSpace: 'nowrap',
        transition: 'all var(--t-fast) var(--ease)', '& svg': { fontSize: 16 },
        '&:hover': active ? { borderColor: 'var(--c-primary-200)', color: 'var(--c-primary-700)', background: 'var(--c-primary-50)' } : undefined,
      }}
    >
      {icon}
      {label}
      {count !== undefined && <Box component="span" sx={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-text-3)' }}>{count}</Box>}
    </Box>
  );
}

export interface DetailTab { value: string; label: string; count?: number }

/** The section tabs on their own, for pages that lay out the header themselves. */
export function DetailTabs({ tabs, active, onTab }: { tabs: DetailTab[]; active: string; onTab: (v: string) => void }) {
  return (
    <Box role="tablist" sx={{ display: 'flex', gap: 0.5, mb: 0.75, borderBottom: '1px solid var(--c-border)', overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
      {tabs.map((t) => {
        const on = t.value === active;
        return (
          <Box
            key={t.value}
            role="tab"
            aria-selected={on}
            tabIndex={0}
            onClick={() => onTab(t.value)}
            onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTab(t.value); } }}
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 1, cursor: 'pointer', flexShrink: 0,
              fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap',
              color: on ? 'var(--c-primary-700)' : 'var(--c-text-2)',
              borderBottom: '2px solid', borderColor: on ? 'var(--c-primary-500)' : 'transparent', mb: '-1px',
              transition: 'color var(--t-fast) var(--ease)', '&:hover': { color: 'var(--c-primary-700)' },
            }}
          >
            {t.label}
            {t.count !== undefined && <Box component="span" sx={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: on ? 'var(--c-primary-600)' : 'var(--c-text-3)' }}>{t.count}</Box>}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * The header card can fold to one line, so a long grid below gets the screen
 * (user, 2026-10-02: "make it collapsable so that most of the screen can be used
 * for the BOM"). Remembered per device — a person who folds it once wants it
 * folded on the next order too.
 */
function useCollapsedHeader(id: string): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => readPref<boolean>(`detail.collapsed.${id}`, false) === true);
  return [collapsed, (next) => { setCollapsed(next); writePref(`detail.collapsed.${id}`, next); }];
}

export function DetailLayout({ header, crossLinks, beforeTabs, tabs, active, onTab, children, maxWidth = 1280, collapsible }: {
  header: ReactNode;
  crossLinks?: ReactNode;
  /** A band between the cross-links and the tabs — the order's stage tabs live here. */
  beforeTabs?: ReactNode;
  tabs?: DetailTab[];
  active?: string;
  onTab?: (v: string) => void;
  children: ReactNode;
  /** 'none' lets a wide grid use the whole content width. */
  maxWidth?: number | 'none';
  /** Gives the header card a fold toggle: `summary` is the one compact line shown when it is folded; `id` keys the remembered choice. */
  collapsible?: { id: string; summary: ReactNode };
}) {
  const [internal, setInternal] = useState(tabs?.[0]?.value ?? '');
  const cur = active ?? internal;
  const setCur = onTab ?? setInternal;
  const [collapsed, setCollapsed] = useCollapsedHeader(collapsible?.id ?? 'none');
  const folded = !!collapsible && collapsed;
  return (
    <Box sx={{ maxWidth }}>
      {folded ? (
        <Surface e={2} sx={{ px: 1.5, py: 0, minHeight: 36, display: 'flex', alignItems: 'center', mb: 0.5 }}>
          <Box data-testid="detail-summary" sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
            <Box component="button" type="button" aria-expanded={false} aria-label="Show order details" title="Show order details" onClick={() => setCollapsed(false)}
              sx={{ display: 'inline-flex', alignItems: 'center', border: 0, background: 'transparent', color: 'var(--c-text-2)', cursor: 'pointer', p: 0.25, borderRadius: 'var(--r-sm)', '&:hover': { color: 'var(--c-primary-700)' } }}>
              <ExpandMoreRounded fontSize="small" />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0, flexWrap: 'wrap', fontSize: 13.5 }}>{collapsible!.summary}</Box>
          </Box>
        </Surface>
      ) : (
        <Surface e={2} sx={{ p: 1.5, position: 'relative', mb: crossLinks ? 0.75 : 1 }}>
          {collapsible && (
            <Box sx={{ position: 'absolute', right: 8, bottom: 4 }}>
              <Box component="button" type="button" aria-expanded aria-label="Hide order details" title="Hide order details — more room for the grid" onClick={() => setCollapsed(true)}
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, border: 0, background: 'transparent', color: 'var(--c-text-3)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 12, p: 0.25, borderRadius: 'var(--r-sm)', '&:hover': { color: 'var(--c-primary-700)' } }}>
                Hide details<ExpandLessRounded fontSize="small" />
              </Box>
            </Box>
          )}
          {header}
        </Surface>
      )}
      {crossLinks && !folded && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 0.75 }}>{crossLinks}</Box>}
      {beforeTabs}
      {tabs && tabs.length > 0 && <DetailTabs tabs={tabs} active={cur} onTab={setCur} />}
      <Box key={cur} sx={{ animation: 'cf-tab-in 160ms var(--ease)', '@keyframes cf-tab-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'translateY(0)' } } }}>
        {children}
      </Box>
    </Box>
  );
}

/**
 * The header inside DetailLayout's e2 card, as fab_erp lays it out: the code in
 * mono with its badges, the name as the page heading, a line of context, the
 * actions on the right, then the key facts in a grid that wraps.
 */
export function DetailHeader({ code, title, badges, subtitle, actions, facts, children }: {
  code?: ReactNode; title?: ReactNode; badges?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; facts?: ReactNode; children?: ReactNode;
}) {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: facts || children ? 1.25 : 0 }}>
        <Box sx={{ minWidth: 0, flex: '1 1 280px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', mb: 0.5 }}>
            {code && (title
              ? <Mono sx={{ fontSize: 18, fontWeight: 500, color: 'var(--c-text)' }}>{code}</Mono>
              : <Box component="h1" sx={{ m: 0, display: 'inline-flex' }}><Mono sx={{ fontSize: 18, fontWeight: 500, color: 'var(--c-text)' }}>{code}</Mono></Box>)}
            {!code && title && <Typography component="h1" sx={{ fontSize: 18, fontWeight: 600, color: 'var(--c-text)' }}>{title}</Typography>}
            {badges}
          </Box>
          {/* The name and its context share one line — two stacked lines cost a row of the screen for nothing. */}
          <Box sx={{ display: 'flex', alignItems: 'baseline', columnGap: 1.25, flexWrap: 'wrap', minWidth: 0 }}>
            {code && title && <Typography component="h1" sx={{ fontSize: 15, fontWeight: 500, color: 'var(--c-text)', overflowWrap: 'anywhere' }}>{title}</Typography>}
            {subtitle && <Box sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{subtitle}</Box>}
          </Box>
        </Box>
        {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>{actions}</Box>}
      </Box>
      {facts && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 3, rowGap: 0.5,
          // A fact is label and value on ONE line here: a stacked label over every value doubles the strip's height.
          '& > div': { display: 'flex', alignItems: 'baseline', gap: 0.75 }, '& > div > p': { mb: 0 } }}>{facts}</Box>
      )}
      {children}
    </Box>
  );
}
