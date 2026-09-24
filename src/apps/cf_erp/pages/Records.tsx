import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Tooltip, Typography } from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import { cfApi, qs } from '../api/client';
import type { MasterRecord, RecordList, Tree } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { SOURCING_LABEL } from '../lib/records';
import { appPath } from '../navMeta';
import { EmptyState, ErrorNotice, KindChip, Mono, PageHeader, StatStrip, StatusBadge } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { ClassificationPicker } from '../components/ClassificationPicker';
import { CreateRecordDialog } from '../components/CreateRecordDialog';
import { useToast } from '../components/toastContext';

const SELECTION_MODE: Record<string, string> = { allowed_list: 'Allowed list', spec_match: 'Matching', both: 'List + matching' };
const STATUS_CHIPS = [['', 'Any status'], ['draft', 'Draft'], ['active', 'Active'], ['obsolete', 'Obsolete']] as const;

const COPY = {
  item: {
    title: 'Items',
    subtitle: 'Real things that transact — bought, made, stored, issued. Catalog items are reusable; temporary items are made for one sales order, from its structure.',
    kinds: [['', 'All'], ['catalog', 'Catalog'], ['temporary', 'Temporary']] as const,
    create: 'New item',
    path: 'items',
    icon: <Inventory2Rounded />,
  },
  definition: {
    title: 'Definitions',
    subtitle: 'Blueprints used while designing an order. A template creates order-specific items; a selection picks an existing catalog item.',
    kinds: [['', 'All'], ['template', 'Templates'], ['selection', 'Selections']] as const,
    create: 'New definition',
    path: 'definitions',
    icon: <AccountTreeRounded />,
  },
};

/**
 * How big a row's BOM is, at a glance. A list row carries `bomLineCount` flat
 * (null when it has no BOM); the record itself carries the same figure inside
 * its BOM header, which is what the fallback reads. An item with no BOM is an
 * em dash, never a zero — a BOM with no lines yet is a different thing.
 */
function bomLines(r: MasterRecord): number | null {
  return r.bomLineCount ?? r.bom?.lineCount ?? null;
}

function bomCell(r: MasterRecord) {
  const lines = bomLines(r);
  if (lines != null) {
    return (
      <Tooltip title={`${lines} line${lines === 1 ? '' : 's'}${r.bomStatus ? ` · ${r.bomStatus} BOM` : ''}`}>
        <Box component="span"><Mono muted={!lines}>{lines}</Mono></Box>
      </Tooltip>
    );
  }
  // Only reachable if a BOM exists but its size did not come with the row.
  if (r.bomStatus) return <Tooltip title="Has a BOM — open it to see its lines"><Box component="span"><Mono muted>{r.bomStatus}</Mono></Box></Tooltip>;
  return <Mono muted>—</Mono>;
}

function columnsFor(recordKind: 'item' | 'definition'): DataColumn<MasterRecord>[] {
  return [
    { key: 'code', header: 'Code', render: (r) => r.code ? <Mono chip>{r.code}</Mono> : <Mono muted>—</Mono>, sortValue: (r) => r.code, alwaysVisible: true },
    {
      key: 'name', header: 'Name', sortValue: (r) => r.name,
      render: (r) => (
        <Box sx={{ py: 0.5 }}>
          <Box sx={{ fontWeight: 500, whiteSpace: 'normal' }}>{r.name}</Box>
          {r.item?.itemType === 'temporary' && (r.sourceDefinitionCode || r.owner) && (
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
              {r.sourceDefinitionCode ? `from ${r.sourceDefinitionCode}` : ''}{r.sourceDefinitionCode && r.owner ? ' · ' : ''}{r.owner ? `${r.owner.orderCode} line ${r.owner.lineNo}` : ''}
            </Typography>
          )}
        </Box>
      ),
    },
    { key: 'shortName', header: 'Short name', defaultHidden: true, render: (r) => r.shortName ? <Mono>{r.shortName}</Mono> : <Mono muted>—</Mono>, sortValue: (r) => r.shortName },
    { key: 'kind', header: 'Kind', render: (r) => <KindChip kind={r.kind} />, sortValue: (r) => r.kind },
    { key: 'classification', header: 'Classification', render: (r) => r.classificationName, sortValue: (r) => r.classificationName },
    recordKind === 'item'
      // Six columns is what fits at 1024px, and the BOM is the more useful
      // sixth: tracking is a setup fact, and there is no quantity here for its
      // unit to qualify. One click in the column menu brings it back.
      ? { key: 'tracked', header: 'Tracked by', defaultHidden: true, render: (r) => <>{r.item?.trackedBy} <Mono muted>· {r.item?.uom}</Mono></>, sortValue: (r) => r.item?.trackedBy, exportValue: (r) => (r.item ? `${r.item.trackedBy} · ${r.item.uom}` : '') }
      // Sorted by the words the column shows, not by the raw enum behind them.
      : { key: 'chooses', header: 'Chooses from', render: (r) => (r.definition?.selectionMode ? SELECTION_MODE[r.definition.selectionMode] : '—'), sortValue: (r) => (r.definition?.selectionMode ? SELECTION_MODE[r.definition.selectionMode] : null) },
    ...(recordKind === 'item' ? [{
      key: 'sourcing', header: 'Comes from', defaultHidden: true,
      render: (r: MasterRecord) => (r.item && r.item.itemType === 'catalog' ? SOURCING_LABEL[r.item.sourcing] : 'Made on the order'),
      sortValue: (r: MasterRecord) => (r.item && r.item.itemType === 'catalog' ? SOURCING_LABEL[r.item.sourcing] : 'Made on the order'),
    } as DataColumn<MasterRecord>] : []),
    ...(recordKind === 'item' ? [{
      key: 'bom', header: 'BOM', numeric: true, width: 80, render: bomCell,
      // The real count sorts the column; an item with no BOM has no number, so
      // it sorts with the other blanks (the table puts nulls last either way).
      sortValue: (r: MasterRecord) => bomLines(r) ?? (r.bomStatus ? 0 : null),
      exportValue: (r: MasterRecord) => bomLines(r) ?? (r.bomStatus ? r.bomStatus : ''),
    } as DataColumn<MasterRecord>] : []),
    // Most records are at no revision at all — one click away in the column menu.
    { key: 'rev', header: 'Rev', defaultHidden: true, render: (r) => <Mono muted>{r.revision ?? '—'}</Mono>, sortValue: (r) => r.revision },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} />, sortValue: (r) => r.status },
  ];
}

/**
 * Collection / List (§4.2) for items or definitions — the same screen, since
 * both live in one table. Kind and status sit in the URL (?status=draft), so
 * Home's "drafts to finish" lands here filtered; the figures describe the
 * filtered rows, so they always agree with the table beneath them.
 */
export default function Records({ recordKind }: { recordKind: 'item' | 'definition' }) {
  const copy = COPY[recordKind];
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_catalog_manage');
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useUrlParam('kind', '');
  const [status, setStatus] = useUrlParam('status', '');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [creating, setCreating] = useState(false);
  const classificationId = params.get('classificationId') ? Number(params.get('classificationId')) : null;
  useNewParam(() => { if (canManage) setCreating(true); });
  useEffect(() => { const t = window.setTimeout(() => setDebounced(search), 250); return () => window.clearTimeout(t); }, [search]);

  const tree = useLoad(() => cfApi.get<Tree>('/classification'), []);
  const list = useLoad(() => cfApi.get<RecordList>(`/records${qs({ recordKind, classificationId, search: debounced, limit: 500 })}`),
    [recordKind, classificationId, debounced]);

  const all = useMemo(() => list.data?.rows ?? [], [list.data]);
  const byKind = useMemo(() => all.filter((r) => !kind || r.kind === kind), [all, kind]);
  const rows = useMemo(() => byKind.filter((r) => !status || r.status === status), [byKind, status]);
  const columns = useMemo(() => columnsFor(recordKind), [recordKind]);
  const stats = [
    { label: 'Shown', value: rows.length },
    { label: 'Active', value: rows.filter((r) => r.status === 'active').length, tone: 'success' as const, onClick: () => setStatus('active') },
    { label: 'Draft', value: rows.filter((r) => r.status === 'draft').length, tone: 'warning' as const, hint: 'Not usable yet', onClick: () => setStatus('draft') },
    { label: 'Without a code', value: rows.filter((r) => !r.code).length, tone: 'danger' as const, hint: 'Cannot be activated' },
  ];

  const setClassification = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('classificationId', String(id)); else next.delete('classificationId');
    setParams(next, { replace: true });
  };
  const open = (r: MasterRecord) => navigate(appPath(company, `${copy.path}/${r.id}`));
  const filtered = !!debounced || !!kind || !!status || !!classificationId;
  const clear = () => { setSearch(''); setKind(''); setStatus(''); setClassification(null); };
  // The request asks for 500 rows, which is also the server's ceiling. Say so
  // rather than let the table and the figures above it quietly under-report.
  const hiddenByLimit = Math.max((list.data?.total ?? 0) - all.length, 0);

  return (
    <Box>
      <PageHeader title={copy.title} subtitle={copy.subtitle}
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>{copy.create}</Button>} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search code or name">
        {copy.kinds.map(([v, label]) => <FacetChip key={v || 'all'} label={label} active={kind === v} count={all.filter((r) => !v || r.kind === v).length} onClick={() => setKind(v)} />)}
        <Box sx={{ width: '1px', height: 20, background: 'var(--c-border)', mx: 0.5 }} aria-hidden />
        {STATUS_CHIPS.map(([v, label]) => <FacetChip key={v || 'any'} label={label} active={status === v} count={byKind.filter((r) => !v || r.status === v).length} onClick={() => setStatus(v)} />)}
        <Box sx={{ flex: '1 1 260px', maxWidth: 380, minWidth: 0 }}>
          <ClassificationPicker tree={tree.data} value={classificationId} onChange={setClassification} leafOnly={false} label="Within classification" />
        </Box>
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      {hiddenByLimit > 0 && (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1 }}>
          Showing the first {all.length} of {list.data?.total} — search, or pick a classification, to see the rest.
        </Typography>
      )}
      <DataTable key={recordKind} rows={rows} columns={columns} getRowId={(r) => r.id} onRowClick={open} loading={list.loading && !list.data}
        storageKey={copy.path} exportName={copy.path} defaultSortKey="code"
        empty={<EmptyState icon={copy.icon} title={filtered ? 'Nothing matches these filters' : 'Nothing here yet'}
          hint={filtered ? 'Clear the filters, or look in another classification.' : `Create the first ${recordKind}.`}
          action={filtered ? <Button onClick={clear}>Clear filters</Button> : canManage && <Button variant="contained" onClick={() => setCreating(true)}>{copy.create}</Button>} />} />
      <CreateRecordDialog open={creating} onClose={() => setCreating(false)} recordKind={recordKind} tree={tree.data} initialClassificationId={classificationId}
        onTreeChanged={tree.reload}
        onCreated={(r) => {
          invalidateNavCounts();
          toast.success(`${r.code ?? r.name} created${r.status === 'active' ? ' and activated' : ' as a draft'}.`);
          (r.warnings ?? []).forEach((w) => toast.error(w));
          open(r);
        }} />
    </Box>
  );
}
