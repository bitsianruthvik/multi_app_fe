import type { ReactNode } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import { PageHeader, ErrorNotice, StatSkeleton, ListSkeleton, EmptyState } from '@shared/ui';
import { ago } from '../format';

/**
 * The frame every report shares: title, "from SAP · synced N min ago", a
 * refresh button, loading and error states, and the empty state shown before
 * the connector's first sync.
 */
export function ReportPage({
  title, subtitle, asOf, loading, error, reload, hasData, actions, children,
}: {
  title: string;
  subtitle?: ReactNode;
  asOf?: string | null;
  loading: boolean;
  error: unknown;
  reload: () => void;
  hasData: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <PageHeader
        title={title}
        subtitle={
          <Stack direction="row" spacing={1} alignItems="center" component="span">
            {subtitle && <span>{subtitle}</span>}
            {subtitle && <span>·</span>}
            <Typography component="span" variant="inherit" sx={{ color: 'text.secondary' }}>
              From SAP Business One, read-only · synced {ago(asOf)}
            </Typography>
          </Stack>
        }
        actions={
          <Stack direction="row" spacing={1}>
            {actions}
            <Button size="small" variant="outlined" startIcon={<RefreshRounded />} onClick={reload} disabled={loading}>
              Refresh
            </Button>
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
        <EmptyState
          title="No SAP data yet"
          hint="The connector on the SAP server has not sent anything yet. Check the Connection screen."
        />
      ) : (
        children
      )}
    </Box>
  );
}
