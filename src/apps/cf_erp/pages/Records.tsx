import { useEffect, useMemo, useState } from 'react';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import { cfApi } from '../api/client';
import type { MasterRecord, RecordCounts, ScreenTree } from '../api/types';
import { useDebounced, usePagedList } from '../hooks/usePagedList';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { SOURCING_LABEL } from '../lib/records';
import { appPath } from '../navMeta';
import { EmptyState, ErrorNotice, KindChip, Mono, PageHeader, StatStrip, StatusBadge } from '../components/ui';
import { shortNameText } from '../lib/shortName';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { ClassificationLevelFilter } from '../components/ClassificationLevelFilter';
import { CreateRecordDialog } from '../components/CreateRecordDialog';
import { ClassificationManager } from '../components/ClassificationManager';
import { screenTreePath } from '../lib/classificationScreens';
import { kindQuery, kindCount } from '../lib/records';
import { useToast } from '../components/toastContext';

const SELECTION_MODE: Record<string, string> = { allowed_list: 'Items', spec_match: 'Branches', both: 'Branches + items' };
const STATUS_CHIPS = [['', 'Any status'], ['draft', 'Draft'], ['active', 'Active'], ['obsolete', 'Obsolete']] as const;

/** Columns the server sorts by (masterRecordService RECORD_SORT); BOM size sorts only once everything is loaded. */
const SORTABLE = ['code', 'name', 'shortName', 'kind', 'classification', 'status', 'rev', 'tracked', 'chooses', 'sourcing'];

const COPY = {
  item: {
    title: 'Items',
    subtitle: 'Real things that transact — bought, made, stored, issued. What an order makes for itself lives on the order, in its structure.',
    // Catalog items are the shop's standing list; temporary ones are made for one order line.
    kinds: [['', 'All'], ['catalog', 'Catalog'], ['temporary', 'Temporary (one order)']] as const,
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
    { key: 'shortName', header: 'Short name', defaultHidden: true, render: (r) => (r.shortName != null ? <Mono>{shortNameText(r.shortName)}</Mono> : <Mono muted>—</Mono>), sortValue: (r) => r.shortName },
    { key: 'kind', header: 'Kind', render: (r) => <KindChip kind={r.kind} />, sortValue: (r) => r.kind },
    { key: 'classification', header: 'Classification', render: (r) => r.classificationName, sortValue: (r) => r.classificationName },
    recordKind === 'item'
      // Six columns is what fits at 1024px, and the BOM is the more useful
      // sixth: tracking is a setup fact, and there is no quantity here for its
      // unit to qualify. One click in the column menu brings it back.
      ? { key: 'tracked', header: 'Tracked by', defaultHidden: true, render: (r) => <>{r.item?.trackedBy} <Mono muted>· {r.item?.uom}</Mono></>, sortValue: (r) => r.item?.trackedBy, exportValue: (r) => (r.item ? `${r.item.trackedBy} · ${r.item.uom}` : '') }
      // Sorted by the words the column shows, not by the raw enum behind them.
      : { key: 'chooses', header: 'Picks from', render: (r) => (r.definition?.selectionMode ? SELECTION_MODE[r.definition.selectionMode] : '—'), sortValue: (r) => (r.definition?.selectionMode ? SELECTION_MODE[r.definition.selectionMode] : null) },
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
 * Home's "drafts to finish" lands here filtered; the chips and figures
 * are the server's counts over every match, so they agree with the table
 * beneath them however many rows have loaded.
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
  const debounced = useDebounced(search.trim());
  const [creating, setCreating] = useState(false);
  /** The record "make a similar one" started from — the create form, pre-filled. */
  const [copying, setCopying] = useState<MasterRecord | null>(null);
  const classificationId = params.get('classificationId') ? Number(params.get('classificationId')) : null;
  useNewParam(() => { if (canManage) setCreating(true); });

  const screen = recordKind === 'item' ? 'items' : 'definitions';
  // The screen's own part of the tree — derived on the server from what is
  // filed where, so the filter and the pickers offer only branches that matter here.
  const tree = useLoad(() => cfApi.get<ScreenTree>(screenTreePath(screen)), [screen]);
  // ?classification=1 opens the pop-up (old Setup › Classification links land here).
  const [managing, setManaging] = useState(() => params.get('classification') === '1');
  useEffect(() => {
    if (params.get('classification') !== '1') return;
    const next = new URLSearchParams(params);
    next.delete('classification');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // EVERY filter is answered by the SERVER (kind chip, status chip, classification
  // subtree, search) and the list pages (usePagedList + DataTable server): the
  // old 500-row page hid everything past it and the figures above counted only
  // what had loaded (2026-10-02). The chips and tiles read `counts`, which the
  // server computes over all matches in the same request.
  const list = usePagedList<MasterRecord, RecordCounts>('/records', {
    recordKind, classificationId, search: debounced, status, ...kindQuery(recordKind, kind),
  });
  const rows = list.rows;
  const columns = useMemo(() => columnsFor(recordKind), [recordKind]);
  const rc = list.counts;
  const filtered = !!debounced || !!kind || !!status || !!classificationId;
  // Tiles are the server's figures. Matching = what the filters match; Active /
  // Draft count over every filter except the status chip (so they stay clickable
  // choices, like the chips); "of N" = every record on this screen.
  const stats = [
    { label: filtered && rc ? `Matching (of ${rc.overall.toLocaleString()})` : 'Matching', value: rc?.total ?? list.total },
    { label: 'Active', value: rc?.status.active ?? 0, tone: 'success' as const, onClick: () => setStatus('active') },
    { label: 'Draft', value: rc?.status.draft ?? 0, tone: 'warning' as const, hint: 'Not usable yet', onClick: () => setStatus('draft') },
    { label: 'Without a code', value: rc?.noCode ?? 0, tone: 'danger' as const, hint: 'Cannot be activated' },
  ];

  const setClassification = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('classificationId', String(id)); else next.delete('classificationId');
    setParams(next, { replace: true });
  };
  const open = (r: MasterRecord) => navigate(appPath(company, `${copy.path}/${r.id}`));
  const clear = () => { setSearch(''); setKind(''); setStatus(''); setClassification(null); };
  return (
    <Box>
      <PageHeader title={copy.title} subtitle={copy.subtitle}
        actions={(
          <>
            <Button variant="outlined" startIcon={<AccountTreeRounded />} onClick={() => setManaging(true)}>Classification</Button>
            {canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>{copy.create}</Button>}
          </>
        )} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search code or name">
        {copy.kinds.map(([v, label]) => <FacetChip key={v || 'all'} label={label} active={kind === v} count={kindCount(recordKind, v, rc?.kind)} onClick={() => setKind(v)} />)}
        <Box sx={{ width: '1px', height: 20, background: 'var(--c-border)', mx: 0.5 }} aria-hidden />
        {STATUS_CHIPS.map(([v, label]) => <FacetChip key={v || 'any'} label={label} active={status === v} count={v ? rc?.status[v] : rc?.status.all} onClick={() => setStatus(v)} />)}
        {/* One filter per level, each narrowing the others. They stand for a
            single id — the deepest one chosen — which is what the list asks the
            server for, and the server filters on that node's whole subtree. */}
        <ClassificationLevelFilter tree={tree.data} value={classificationId} onChange={setClassification} />
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable key={recordKind} rows={rows} columns={columns} getRowId={(r) => r.id} onRowClick={open} loading={!list.loaded}
        server={{ ...list.server, sortable: SORTABLE }}
        storageKey={copy.path} exportName={copy.path} defaultSortKey="code"
        // A temporary item is never offered: it is born from a sales order line
        // and the backend refuses to create one from here (ORDER_ONLY).
        rowActions={canManage ? (r) => (r.kind === 'temporary' ? null : (
          <Tooltip title="Make a similar one">
            <IconButton size="small" aria-label={`Make one similar to ${r.code ?? r.name}`} onClick={() => setCopying(r)}>
              <ContentCopyRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        )) : undefined}
        empty={<EmptyState icon={copy.icon} title={filtered ? 'Nothing matches these filters' : 'Nothing here yet'}
          hint={filtered ? 'Clear the filters, or look in another classification.' : `Create the first ${recordKind}.`}
          action={filtered ? <Button onClick={clear}>Clear filters</Button> : canManage && <Button variant="contained" onClick={() => setCreating(true)}>{copy.create}</Button>} />} />
      <CreateRecordDialog open={creating || !!copying} onClose={() => { setCreating(false); setCopying(null); }} recordKind={recordKind} tree={tree.data}
        copyFrom={copying} initialClassificationId={copying ? null : classificationId}
        onTreeChanged={tree.reload} screen={screen}
        onCreated={(r) => {
          invalidateNavCounts();
          toast.success(`${r.code ?? r.name} created${r.status === 'active' ? ' and activated' : ' as a draft'}.`);
          (r.warnings ?? []).forEach((w) => toast.error(w));
          open(r);
        }} />
      <ClassificationManager open={managing} screen={screen} onClose={() => setManaging(false)} onChanged={tree.reload} />
    </Box>
  );
}
