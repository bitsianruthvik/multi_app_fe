import type { ReactNode } from 'react';
import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import { PageHeader, ErrorNotice, StatSkeleton, ListSkeleton, EmptyState } from '@shared/ui';
import { ago } from '../format';
import type { useFilters } from '../filters';
import { RangePicker, UnitSwitch } from './Filters';

/**
 * The frame every report shares: title, "from SAP · synced N min ago", the
 * unit switch and (when the report has one) the period, a refresh button,
 * loading and error states, and the empty state before the first sync.
 */
export function ReportPage({
  title, subtitle, asOf, loading, error, reload, hasData, filters, range = true, actions, children,
}: {
  title: string;
  subtitle?: ReactNode;
  asOf?: string | null;
  loading: boolean;
  error: unknown;
  reload: () => void;
  hasData: boolean;
  filters?: ReturnType<typeof useFilters>;
  range?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <PageHeader
        title={title}
        subtitle={
          <Stack direction="row" spacing={1} alignItems="center" component="span" flexWrap="wrap">
            {subtitle && <span>{subtitle}</span>}
            {subtitle && <span>·</span>}
            <Typography component="span" variant="inherit" sx={{ color: 'text.secondary' }}>
              SAP Business One, read-only · synced {ago(asOf)}
            </Typography>
          </Stack>
        }
        actions={
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            {actions}
            {filters && <UnitSwitch value={filters.unit} onChange={filters.setUnit} />}
            {filters && range && <RangePicker range={filters.range} from={filters.from} to={filters.to} onChange={filters.setRange} />}
            <Tooltip title="Refresh">
              <span>
                <IconButton size="small" onClick={reload} disabled={loading} aria-label="Refresh"><RefreshRounded fontSize="small" /></IconButton>
              </span>
            </Tooltip>
          </Stack>
        }
      />
      {error ? (
        <ErrorNotice error={error} onRetry={reload} />
      ) : loading && !hasData ? (
        <>
          <StatSkeleton count={4} />
          <ListSkeleton rows={8} />
        </>
      ) : !asOf ? (
        <EmptyState title="No SAP data yet" hint="The connector on the SAP server has not sent anything yet. Check the Connection screen." />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, opacity: loading ? 0.6 : 1, transition: 'opacity var(--t-fast) var(--ease)' }}>
          {children}
        </Box>
      )}
    </Box>
  );
}

/** A grid of report cards: two or three across on wide screens, one on phones. */
export function CardGrid({ children, cols = '1fr 1fr' }: { children: ReactNode; cols?: string }) {
  return <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', lg: cols }, alignItems: 'start' }}>{children}</Box>;
}
