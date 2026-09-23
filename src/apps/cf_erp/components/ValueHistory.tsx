import { Box, Typography } from '@mui/material';
import { cfApi } from '../api/client';
import type { HistoryEntry } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { ErrorNotice, Mono, SectionCard, SourceBadge } from './ui';
import { DataTable, type DataColumn } from './DataTable';

/** A missing side of a change reads as "(empty)", never as the word "null". */
const shown = (v: string | null) => (v === null || v === undefined || v === '' ? '(empty)' : v);

const changeText = (h: HistoryEntry) =>
  `${h.change === 'create' ? `set ${shown(h.to)}` : h.change === 'delete' ? `cleared (was ${shown(h.from)})` : `${shown(h.from)} → ${shown(h.to)}`}${h.unit && h.change !== 'delete' ? ` ${h.unit}` : ''}`;

const COLUMNS: DataColumn<HistoryEntry>[] = [
  { key: 'when', header: 'When', render: (h) => <Mono muted>{new Date(h.changedAt).toLocaleString()}</Mono>, sortValue: (h) => h.changedAt },
  { key: 'spec', header: 'Specification', render: (h) => <>{h.specName} <Mono muted>{h.specCode}</Mono></>, sortValue: (h) => h.specName },
  { key: 'change', header: 'Change', render: (h) => <Mono>{changeText(h)}</Mono>, exportValue: changeText },
  { key: 'source', header: 'Source', render: (h) => (h.source ? <SourceBadge source={h.source} /> : null), sortValue: (h) => h.source },
  { key: 'by', header: 'By', render: (h) => h.changedBy ?? '—', sortValue: (h) => h.changedBy },
];

/**
 * Every change to a value — who, when, from what to what — for a record, a
 * machine or a batch. `path` is the history endpoint; `version` refetches it
 * after a save on the same page.
 */
export function ValueHistory({ path, subtitle, version = 0 }: { path: string; subtitle: string; version?: number }) {
  const hist = useLoad(() => cfApi.get<HistoryEntry[]>(path), [path, version]);
  return (
    <SectionCard flush title="Value history" subtitle={subtitle}>
      {hist.error && <Box sx={{ p: 2 }}><ErrorNotice error={hist.error} onRetry={hist.reload} /></Box>}
      <DataTable bare rows={hist.data ?? []} columns={COLUMNS} getRowId={(h) => h.id} loading={hist.loading && !hist.data} defaultSortKey="when" defaultSortDir="desc"
        empty={<Typography sx={{ color: 'var(--c-text-3)', p: 2 }}>No changes yet.</Typography>} />
    </SectionCard>
  );
}
