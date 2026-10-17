import { useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import {
  Callout, DataTable, PageHeader, SectionCard, ToneBadge, ErrorNotice, ListSkeleton, errorMessage, useToast,
  type DataColumn,
} from '@shared/ui';
import { useAuth } from '@core/contexts/AuthContext';
import { isAdminRole } from '@core/utils/roles';
import { kdApi, useReport, type Connector, type DatasetState, type Status, type SyncRun } from '../api';
import { ago } from '../format';

const DATASET_LABEL: Record<string, string> = {
  invoices: 'A/R invoices', creditNotes: 'A/R credit notes', orders: 'Sales orders', deliveries: 'Deliveries',
  purchaseOrders: 'Purchase orders', purchaseInvoices: 'A/P invoices', businessPartners: 'Business partners',
  items: 'Items', itemGroups: 'Item groups', salesPersons: 'Sales employees', queryCategories: 'Query categories',
  userQueries: 'Saved queries',
};

/** The connector on the SAP server: approve it, see each dataset's last sync and every run. */
export default function Connection() {
  const { data, error, loading, reload } = useReport<Status>('/status');
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);

  const act = async (c: Connector, action: 'approve' | 'revoke') => {
    setBusy(c.id);
    try {
      await kdApi.post(`/connectors/${c.id}/${action}`);
      toast.success(action === 'approve' ? `Connector on ${c.machine} approved` : `Connector on ${c.machine} revoked`);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const connCols: DataColumn<Connector>[] = [
    { key: 'machine', header: 'Machine', render: (r) => r.machine },
    { key: 'winUser', header: 'Windows user', render: (r) => r.winUser },
    { key: 'status', header: 'Status', render: (r) => (
      <ToneBadge label={r.status} tone={r.status === 'approved' ? 'success' : r.status === 'pending' ? 'warning' : 'neutral'} />) },
    { key: 'lastSeenAt', header: 'Last seen', render: (r) => ago(r.lastSeenAt) },
    { key: 'actions', header: '', render: (r) => admin && (
      <Stack direction="row" spacing={1} justifyContent="flex-end">
        {r.status !== 'approved' && <Button size="small" variant="contained" disabled={busy === r.id} onClick={() => act(r, 'approve')}>Approve</Button>}
        {r.status !== 'revoked' && <Button size="small" color="error" disabled={busy === r.id} onClick={() => act(r, 'revoke')}>Revoke</Button>}
      </Stack>
    ) },
  ];
  const dsCols: DataColumn<DatasetState>[] = [
    { key: 'dataset', header: 'Data', render: (r) => DATASET_LABEL[r.dataset] ?? r.dataset, sortValue: (r) => r.dataset },
    { key: 'rowCount', header: 'Records', numeric: true, align: 'right', render: (r) => r.rowCount ?? '—', sortValue: (r) => r.rowCount ?? 0 },
    { key: 'lastOkAt', header: 'Last synced', render: (r) => ago(r.lastOkAt), sortValue: (r) => r.lastOkAt ?? '' },
    { key: 'lastError', header: 'Problem', render: (r) => (r.lastError
      ? <Typography variant="body2" color="error" sx={{ maxWidth: 520 }}>{r.lastError}</Typography> : '—') },
  ];
  const runCols: DataColumn<SyncRun>[] = [
    { key: 'startedAt', header: 'Started', render: (r) => new Date(r.startedAt).toLocaleString() },
    { key: 'took', header: 'Took', render: (r) => `${Math.max(0, Math.round((Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 1000))} s` },
    { key: 'ok', header: 'Result', render: (r) => <ToneBadge label={r.ok ? 'OK' : 'Problems'} tone={r.ok ? 'success' : 'danger'} /> },
    { key: 'rows', header: 'Records read', numeric: true, align: 'right',
      render: (r) => Object.values(r.summary || {}).reduce((t, s) => t + (s?.rows ?? 0), 0) },
  ];

  const pending = data?.connectors.filter((c) => c.status === 'pending') ?? [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <PageHeader title="Connection" subtitle="The connector on Karni's SAP server — reads SAP with GET only, never writes"
        actions={<Button size="small" variant="outlined" onClick={reload}>Refresh</Button>} />
      {error ? <ErrorNotice error={error} onRetry={reload} /> : loading && !data ? <ListSkeleton rows={6} /> : data && (
        <>
          {pending.length > 0 && (
            <Callout tone="warning" title={`${pending.length} connector${pending.length > 1 ? 's' : ''} waiting for approval`}>
              {admin ? 'Approve it below if it is the machine you set up. Nothing is read from SAP until you do.'
                : 'An admin has to approve it before any SAP data arrives.'}
            </Callout>
          )}
          <SectionCard title="Connectors" flush>
            <DataTable rows={data.connectors} columns={connCols} getRowId={(r) => r.id} bare
              empty="No connector has registered yet. Run setup.ps1 on the SAP server." />
          </SectionCard>
          <SectionCard title="Data" subtitle="What has arrived from SAP" flush>
            <DataTable rows={data.datasets} columns={dsCols} getRowId={(r) => r.dataset} bare />
          </SectionCard>
          <SectionCard title="Recent runs" flush>
            <DataTable rows={data.runs} columns={runCols} getRowId={(r) => r.id} bare pageSize={20} />
          </SectionCard>
        </>
      )}
    </Box>
  );
}
