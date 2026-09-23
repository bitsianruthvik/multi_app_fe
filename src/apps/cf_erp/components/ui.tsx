/**
 * cf_erp's component kit. Built to the same measurements as fab_erp's shipped
 * components (apps/fab_erp/components — Surface, PageHeader, SectionCard,
 * StatStrip, StatusBadge, EmptyState, Mono, Skeletons) so the two apps read as
 * one product, while sharing no code (DESIGN_SYSTEM.md §5–§7):
 * solid surfaces with layered elevation, status as icon + label + colour (never
 * colour alone), mono for codes and quantities, shimmer skeletons, not spinners.
 */
import type { ReactNode } from 'react';
import { Alert, Box, Button, Tooltip, Typography, type BoxProps } from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import HourglassEmptyRounded from '@mui/icons-material/HourglassEmptyRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import RemoveCircleOutlineRounded from '@mui/icons-material/RemoveCircleOutlineRounded';
import InboxRounded from '@mui/icons-material/InboxRounded';
import WarehouseRounded from '@mui/icons-material/WarehouseRounded';
import HandshakeRounded from '@mui/icons-material/HandshakeRounded';
import type { CfApiError } from '../api/client';
import type { Kind, OrderStatus, OrderType, RecordStatus, ValueRule } from '../api/types';
import { useCountUp } from '../hooks/useCountUp';

export type Family = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** The solid surface primitive (§7.1). Glass is for the top bar and scrims only. */
export function Surface({ e, elevation, bordered = true, sx, ...props }: BoxProps & { e?: 0 | 1 | 2 | 3; elevation?: 1 | 2; bordered?: boolean }) {
  const level = e ?? elevation ?? 1;
  return (
    <Box
      {...props}
      sx={{
        background: 'var(--c-surface)',
        border: bordered ? '1px solid var(--c-border)' : 'none',
        borderRadius: 'var(--r-md)',
        boxShadow: level === 0 ? 'none' : `var(--e-${level})`,
        ...sx,
      }}
    />
  );
}

/** Title 22/600 + subtitle + right-aligned actions (§7.5). */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
      <Box sx={{ minWidth: 0, flex: '1 1 320px' }}>
        <Typography component="h1" sx={{ fontFamily: 'var(--font-ui)', fontSize: 22, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1.3 }}>{title}</Typography>
        {subtitle && <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)', mt: 0.5, maxWidth: 820 }}>{subtitle}</Typography>}
      </Box>
      {actions && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>}
    </Box>
  );
}

/**
 * A titled solid panel: header row (title 15/600, subtitle, actions) over a
 * divider, then the body. `flush` drops the body padding for a table that
 * should reach the card's edges.
 */
export function SectionCard({ title, subtitle, actions, action, children, flush = false, e = 1, sx }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; action?: ReactNode; children: ReactNode; flush?: boolean; e?: 0 | 1 | 2 | 3; sx?: object;
}) {
  const act = actions ?? action;
  return (
    <Surface e={e} sx={{ overflow: 'hidden', ...sx }}>
      {(title || act) && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2.5, py: 1.75, borderBottom: '1px solid var(--c-divider)', flexWrap: 'wrap' }}>
          <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
            {title && <Box component="h2" sx={{ m: 0, fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>{title}</Box>}
            {subtitle && <Box sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.25 }}>{subtitle}</Box>}
          </Box>
          {act && <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, flexWrap: 'wrap' }}>{act}</Box>}
        </Box>
      )}
      <Box sx={flush ? undefined : { px: 2.5, py: 2 }}>{children}</Box>
    </Surface>
  );
}

/** Codes, ids, quantities (§5.4). `chip` is the inset pill for codes in list rows. */
export function Mono({ children, muted = false, chip = false, tabular = true, sx }: { children: ReactNode; muted?: boolean; chip?: boolean; tabular?: boolean; sx?: object }) {
  return (
    <Box component="span" sx={{
      fontFamily: 'var(--font-mono)', fontSize: 12, fontVariantNumeric: tabular ? 'tabular-nums' : undefined,
      color: chip ? 'var(--c-text-2)' : muted ? 'var(--c-text-3)' : 'inherit',
      ...(chip && { background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', padding: '2px 7px', whiteSpace: 'nowrap' }),
      ...sx,
    }}>
      {children}
    </Box>
  );
}

export function CapsLabel({ children }: { children: ReactNode }) {
  return <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>{children}</Typography>;
}

const FAMILY_ICON: Record<Family, typeof CheckCircleRounded> = {
  success: CheckCircleRounded, warning: HourglassEmptyRounded, danger: ErrorOutlineRounded, info: SyncRounded, neutral: RemoveCircleOutlineRounded,
};

/** fab_erp's StatusBadge look: family colour, family icon, label — no border (§7.3). */
export function Badge({ family, icon, label, title, noIcon = false }: { family: Family; icon?: ReactNode; label: string; title?: string; noIcon?: boolean }) {
  const Icon = FAMILY_ICON[family];
  const badge = (
    <Box component="span" sx={{
      display: 'inline-flex', alignItems: 'center', gap: '6px', background: `var(--c-${family}-50)`, color: `var(--c-${family}-800)`,
      borderRadius: 'var(--r-sm)', padding: '3px 9px', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', lineHeight: 1.5, '& svg': { fontSize: 14 },
    }}>
      {noIcon ? null : icon ?? <Icon aria-hidden />}{label}
    </Box>
  );
  return title ? <Tooltip title={title}>{badge}</Tooltip> : badge;
}

const STATUS: Record<RecordStatus | 'inactive', { family: Family; label: string }> = {
  draft: { family: 'warning', label: 'Draft' },
  active: { family: 'success', label: 'Active' },
  obsolete: { family: 'neutral', label: 'Obsolete' },
  inactive: { family: 'neutral', label: 'Inactive' },
};
export function StatusBadge({ status }: { status: RecordStatus | 'inactive' | 'active' }) {
  const s = STATUS[status] ?? STATUS.draft;
  return <Badge family={s.family} label={s.label} />;
}

/** A sales order's commercial stage — set by people, never by production progress. */
const ORDER_STATUS: Record<OrderStatus, { family: Family; label: string; help: string }> = {
  draft: { family: 'warning', label: 'Draft', help: 'A stock order being prepared.' },
  inquiry: { family: 'info', label: 'Inquiry', help: 'The customer asked; the structure can be designed and estimated now.' },
  quoted: { family: 'info', label: 'Quoted', help: 'A quotation went out; waiting for the customer.' },
  confirmed: { family: 'success', label: 'Confirmed', help: 'Committed to the customer (or to stock).' },
  closed: { family: 'neutral', label: 'Closed', help: 'Delivered and done — nothing on it changes any more.' },
  lost: { family: 'neutral', label: 'Lost', help: 'The customer went elsewhere. Can be reopened as an inquiry.' },
  cancelled: { family: 'danger', label: 'Cancelled', help: 'Stopped. Kept for history.' },
};
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const s = ORDER_STATUS[status] ?? ORDER_STATUS.inquiry;
  return <Badge family={s.family} label={s.label} title={s.help} />;
}

export function OrderTypeChip({ type }: { type: OrderType }) {
  return <Badge family="neutral" icon={type === 'stock' ? <WarehouseRounded /> : <HandshakeRounded />} label={type === 'stock' ? 'Stock order' : 'Customer order'} />;
}

const KIND_LABEL: Record<Kind, string> = { catalog: 'Catalog item', temporary: 'Temporary item', template: 'Template', selection: 'Selection' };
export function KindChip({ kind }: { kind: Kind }) {
  return <Badge family={kind === 'temporary' ? 'info' : 'neutral'} label={KIND_LABEL[kind]} noIcon />;
}

/** Where a value came from — the taxonomy's own words. */
const SOURCE: Record<ValueRule, { family: Family; label: string; help: string }> = {
  entered: { family: 'neutral', label: 'Entered', help: 'Typed in on this record.' },
  fixed: { family: 'info', label: 'Fixed', help: 'Set higher up; cannot be changed here.' },
  defaulted: { family: 'info', label: 'Default', help: 'Taken from a default higher up; can be overridden here.' },
  calculated: { family: 'success', label: 'Calculated', help: 'Worked out by a formula from this record’s other values.' },
  rollup: { family: 'success', label: 'Roll-up', help: 'Added up from BOM children.' },
  inherited: { family: 'info', label: 'Inherited', help: 'Taken from the BOM parent.' },
};
export function SourceBadge({ source, from }: { source: ValueRule; from?: string }) {
  const s = SOURCE[source] ?? SOURCE.entered;
  const where = from && from !== 'here' ? ` (from ${from.toLowerCase()})` : '';
  return <Badge family={s.family} label={s.label} title={`${s.help}${where}`} noIcon />;
}

export function RuleBadge({ rule }: { rule: ValueRule }) {
  const s = SOURCE[rule];
  return <Badge family="neutral" label={s.label} title={s.help} noIcon />;
}

export function WarnBadge({ label, title }: { label: string; title?: string }) {
  return <Badge family="warning" label={label} title={title} />;
}

export function DangerBadge({ label, title }: { label: string; title?: string }) {
  return <Badge family="danger" label={label} title={title} />;
}

export interface Stat {
  label: string;
  value: number;
  /** A non-numeric display ("92%") shown instead of the counted value. */
  display?: string;
  icon?: ReactNode;
  /** Colours the value — only while it is above zero, so "Held 0" stays calm. */
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  /** A longer explanation, shown on hover. */
  hint?: string;
  onClick?: () => void;
}

const TONE_COLOR: Record<string, string> = {
  primary: 'var(--c-primary-600)', success: 'var(--c-success-600)', warning: 'var(--c-warning-600)', danger: 'var(--c-danger-600)', info: 'var(--c-info-600)',
};

function StatCard({ stat }: { stat: Stat }) {
  const n = useCountUp(stat.value);
  const color = stat.tone && TONE_COLOR[stat.tone] && stat.value > 0 ? TONE_COLOR[stat.tone] : 'var(--c-text)';
  const card = (
    <Surface e={1} onClick={stat.onClick} sx={{
      p: 2, display: 'flex', alignItems: 'center', gap: 1.5, cursor: stat.onClick ? 'pointer' : 'default', minWidth: 0,
      transition: 'box-shadow var(--t-fast) var(--ease), transform var(--t-fast) var(--ease)',
      ...(stat.onClick && { '&:hover': { boxShadow: 'var(--e-2)', transform: 'translateY(-1px)' } }),
    }}>
      {stat.icon && (
        <Box sx={{ width: 38, height: 38, borderRadius: 'var(--r-sm)', display: { xs: 'none', sm: 'grid' }, placeItems: 'center', background: 'var(--c-primary-50)', color: 'var(--c-primary-600)', flexShrink: 0, '& svg': { fontSize: 20 } }}>
          {stat.icon}
        </Box>
      )}
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 0.25 }}>{stat.label}</Typography>
        <Typography sx={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 24, fontWeight: 600, lineHeight: 1.1, color }}>{stat.display ?? n}</Typography>
      </Box>
    </Surface>
  );
  return stat.hint ? <Tooltip title={stat.hint} placement="top-start">{card}</Tooltip> : card;
}

/** Responsive grid of stat cards with count-up numbers (§4.1, §7.5). */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(auto-fit, minmax(200px, 1fr))' }, gap: 1.5, mb: 3 }}>
      {/* Keyed on the value: a changed figure gets a fresh card that starts from the truth. */}
      {stats.map((s, i) => <StatCard key={`${i}:${s.label}:${s.display ?? s.value}`} stat={s} />)}
    </Box>
  );
}

/** Centred empty state: icon + one line + a hint + the primary action (§7.5). */
export function EmptyState({ icon, title, body, hint, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  const text = hint ?? body;
  return (
    <Surface e={0} sx={{ py: 7, px: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1, background: 'var(--c-surface-2)', borderStyle: 'dashed' }}>
      <Box sx={{ color: 'var(--c-text-3)', '& svg': { fontSize: 44 }, mb: 0.5 }}>{icon ?? <InboxRounded />}</Box>
      <Typography sx={{ fontSize: 15, fontWeight: 500, color: 'var(--c-text)' }}>{title}</Typography>
      {text && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', maxWidth: 420 }}>{text}</Typography>}
      {action && <Box sx={{ mt: 1.5 }}>{action}</Box>}
    </Surface>
  );
}

/** Shimmer block (§5.7-5); reduced motion gets a still tint through the global guard. */
export function SkeletonBlock({ w = '100%', h = 14, r = 6 }: { w?: number | string; h?: number | string; r?: number | string }) {
  return (
    <Box sx={{
      width: w, height: h, borderRadius: typeof r === 'number' ? `${r}px` : r,
      background: 'linear-gradient(90deg, var(--c-surface-2) 25%, var(--c-divider) 37%, var(--c-surface-2) 63%)',
      backgroundSize: '400% 100%', animation: 'cf-shimmer 1.4s ease infinite',
      '@keyframes cf-shimmer': { '0%': { backgroundPosition: '100% 50%' }, '100%': { backgroundPosition: '0% 50%' } },
    }} />
  );
}

/** Placeholder rows while a list or body loads. */
export function SkeletonRows({ rows = 6, height = 40 }: { rows?: number; height?: number }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <SkeletonBlock key={i} h={height} r={8} />)}
    </Box>
  );
}

/** A list of placeholder rows shaped like entity rows. */
/** The StatStrip while it loads — the same grid, so nothing jumps when the numbers land. */
export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(auto-fit, minmax(200px, 1fr))' }, gap: 1.5, mb: 3 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
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

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Surface key={i} e={1} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5 }}>
          <SkeletonBlock w={64} h={20} r={8} />
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}><SkeletonBlock w="40%" h={13} /><SkeletonBlock w="22%" h={11} /></Box>
          <SkeletonBlock w={72} h={22} r={8} />
        </Surface>
      ))}
    </Box>
  );
}

/** A detail page's placeholder: header block with facts, then a body slab. */
export function DetailSkeleton() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }} aria-busy="true" aria-label="Loading">
      <Surface e={2} sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <SkeletonBlock w={180} h={20} />
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 2 }}>
          {Array.from({ length: 4 }).map((_, i) => <Box key={i} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}><SkeletonBlock w="45%" h={10} /><SkeletonBlock w="70%" h={14} /></Box>)}
        </Box>
      </Surface>
      <Surface e={1} sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} w={`${90 - i * 8}%`} h={13} />)}
      </Surface>
    </Box>
  );
}

/** A failed request, in words, with every problem the backend listed. */
export function ErrorNotice({ error, onRetry, sx }: { error: CfApiError | null; onRetry?: () => void; sx?: object }) {
  if (!error) return null;
  return (
    <Alert severity="error" sx={{ mb: 2, ...sx }} action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Retry</Button> : undefined}>
      <Box>{error.message}</Box>
      {error.problems.length > 0 && <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>{error.problems.map((p) => <li key={p}>{p}</li>)}</Box>}
    </Alert>
  );
}

/** A label/value pair for detail headers (11px caps label, 14px value). */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.25 }}>{label}</Typography>
      <Box sx={{ fontSize: 14, color: 'var(--c-text)' }}>{children}</Box>
    </Box>
  );
}
