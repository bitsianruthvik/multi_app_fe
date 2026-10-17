import { useMemo, useState } from 'react';
import { Box, Button, Link as MuiLink, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import {
  createStandard, getStandard, listStandards, standardFileBlob,
  type StandardDetail, type StandardFile, type StandardSummary, type StandardTreeRow,
} from '../api/standards';
import { fileToBase64 } from '../api/bomSheet';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { appPath } from '../navMeta';
import { kgText } from '../lib/money';
import { Badge, DetailSkeleton, EmptyState, ErrorNotice, Fact, Mono, PageHeader, SectionCard, WarnBadge } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { DetailHeader, DetailLayout } from '../components/DetailLayout';
import { FormDialog } from '../components/FormDialog';
import { DrawingViewer } from '../components/Drawings/DrawingViewer';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';

/**
 * STANDARD DRAWINGS (init.sql §69). The list: every standard by its number, with its current version's size and
 * weight and its source. The detail: its BOM tree with values, the part drawings (opened in the drawing viewer),
 * where the sheet lives, and the order lines made from it. A version never changes; a line's BOM saved onto a
 * standard is its next version.
 */

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

export const InternalBadge = () => <Badge family="warning" label="Internal only" title="RDSO property — keep inside the company." noIcon />;

function SourceLink({ url }: { url: string | null }) {
  if (!url) return <Mono muted>—</Mono>;
  return (
    <MuiLink href={url} target="_blank" rel="noreferrer" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 13 }} onClick={(e) => e.stopPropagation()}>
      Source <OpenInNewRounded sx={{ fontSize: 14 }} />
    </MuiLink>
  );
}

/** A new standard drawing: its number, name and where its sheet lives. Its BOM comes from a line ("Save this BOM to the standard"). */
function NewStandardDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (s: StandardDetail) => void }) {
  const [form, setForm] = useState({ number: '', name: '', revision: '', sourceUrl: '', description: '', internal: false });
  const [file, setFile] = useState<File | null>(null);
  const save = async () => onDone(await createStandard({
    number: form.number.trim(), name: form.name.trim() || undefined, revision: form.revision.trim() || undefined, sourceUrl: form.sourceUrl.trim() || undefined,
    description: form.description.trim() || undefined, internal: form.internal,
    file: file ? { name: file.name, content: await fileToBase64(file) } : null,
  }));
  return (
    <FormDialog open={open} title="New standard drawing" subtitle="Its BOM is added from an order line: make the line, then save its BOM to the standard."
      onClose={() => { onClose(); setFile(null); setForm({ number: '', name: '', revision: '', sourceUrl: '', description: '', internal: false }); }}
      onSubmit={save} submitLabel="Add standard" busyLabel="Adding…" submitDisabled={!form.number.trim()}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) 120px' }, gap: 2 }}>
        <TextField label="Drawing number" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} autoFocus helperText="As written on the sheet" />
        <TextField label="Revision" value={form.revision} onChange={(e) => setForm({ ...form, revision: e.target.value })} />
      </Box>
      <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 24.4 m composite girder" />
      <TextField label="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} multiline minRows={2} />
      <TextField label="Link to the sheet (optional)" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https://…" />
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button component="label" variant="outlined" size="small">
          {file ? 'Change file' : 'Attach the drawing (DXF or PDF)'}
          <input hidden type="file" accept=".dxf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Button>
        {file && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{file.name}</Typography>}
      </Box>
      <TextField select label="Who may see it" value={form.internal ? 'internal' : 'open'} onChange={(e) => setForm({ ...form, internal: e.target.value === 'internal' })}>
        <MenuItem value="open">Anyone with access to orders</MenuItem>
        <MenuItem value="internal">Internal only (not to be shared outside)</MenuItem>
      </TextField>
    </FormDialog>
  );
}

/** Catalog › Standard drawings — the list. */
export default function StandardDrawings() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canManage = isPermitted('cf_erp_orders_manage');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const list = useLoad(() => listStandards(search.trim()), [search]);
  const rows = list.data?.rows ?? [];
  const open = (s: StandardSummary) => navigate(appPath(company, `standard-drawings/${s.id}`));

  const columns: DataColumn<StandardSummary>[] = [
    {
      key: 'number', header: 'Drawing', alwaysVisible: true, sortValue: (s) => s.number, exportValue: (s) => s.number,
      render: (s) => (
        <Box sx={{ py: 0.5, minWidth: 0 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Mono sx={{ fontWeight: 600 }}>{s.number}</Mono>
            {s.revision && <Mono muted>rev {s.revision}</Mono>}
            {s.internal && <InternalBadge />}
          </Box>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{s.name}</Typography>
        </Box>
      ),
    },
    { key: 'description', header: 'Span / description', sortValue: (s) => s.description ?? '', exportValue: (s) => s.description ?? '', render: (s) => <Typography sx={{ fontSize: 13, whiteSpace: 'normal', maxWidth: 420 }}>{s.description ?? '—'}</Typography> },
    { key: 'version', header: 'Version', numeric: true, sortValue: (s) => s.version?.versionNo ?? 0, render: (s) => (s.version ? <Mono>v{s.version.versionNo}</Mono> : <WarnBadge label="No BOM yet" />) },
    { key: 'parts', header: 'Parts', numeric: true, sortValue: (s) => s.version?.parts ?? 0, exportValue: (s) => s.version?.parts ?? '', render: (s) => <Mono>{s.version ? s.version.parts : '—'}</Mono> },
    { key: 'weight', header: 'Weight', numeric: true, sortValue: (s) => s.version?.weightKg ?? 0, exportValue: (s) => s.version?.weightKg ?? '', render: (s) => <Mono>{s.version?.weightKg != null ? kgText(s.version.weightKg) : '—'}</Mono> },
    { key: 'files', header: 'Drawings', numeric: true, defaultHidden: false, sortValue: (s) => s.files ?? 0, render: (s) => <Mono>{s.files ?? 0}</Mono> },
    { key: 'lines', header: 'Used on', numeric: true, sortValue: (s) => s.lines ?? 0, render: (s) => <Mono>{s.lines ? `${s.lines} line${s.lines === 1 ? '' : 's'}` : '—'}</Mono> },
    { key: 'source', header: 'Source', render: (s) => <SourceLink url={s.sourceUrl} /> },
  ];

  return (
    <Box>
      <PageHeader title="Standard drawings" subtitle="Drawings used again and again, each with its BOM and values. Add a line from one on any order."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setAdding(true)}>New standard</Button>} />
      <Box sx={{ mb: 1.5, maxWidth: 420 }}>
        <TextField fullWidth size="small" label="Find by number or name" value={search} onChange={(e) => setSearch(e.target.value)} />
      </Box>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={rows} columns={columns} getRowId={(s) => s.id} loading={list.loading && !list.data} onRowClick={open}
        storageKey="standard-drawings" exportName="standard-drawings"
        empty={<EmptyState title={search ? 'No standard drawing matches' : 'No standard drawings yet'}
          hint="Add one here, or tick “This is a standard drawing” when you upload a line’s drawing." />} />
      <NewStandardDialog open={adding} onClose={() => setAdding(false)} onDone={(s) => { toast.success('Standard drawing added.'); navigate(appPath(company, `standard-drawings/${s.id}`)); }} />
    </Box>
  );
}

/** The tree's name cell: indented by depth, the role (its name in the parent) under it when it says more. */
function TreeName({ r }: { r: StandardTreeRow }) {
  const roleShown = r.role && r.role.toLowerCase() !== r.name.toLowerCase() ? r.role : null;
  return (
    <Box sx={{ pl: Math.min(r.depth, 6) * 1.5, py: 0.25, minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: r.depth <= 2 ? 600 : 500, whiteSpace: 'normal' }}>{r.name}</Typography>
        {r.kind === 'choose' && <WarnBadge label="To choose" title="A selection: the catalog item is chosen on the order." />}
        {r.kind === 'catalog' && <Badge family="neutral" label="Catalog" noIcon />}
      </Box>
      {roleShown && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'normal' }}>{roleShown}</Typography>}
      {r.notes && (
        <Typography sx={{ fontSize: 12, color: 'var(--c-warning-800)', whiteSpace: 'normal', mt: 0.25 }} data-testid="row-note">
          Note: {r.notes}
        </Typography>
      )}
    </Box>
  );
}

/** Catalog › Standard drawings › one standard. */
export function StandardDrawingDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const company = useCompanySlug();
  const [versionId, setVersionId] = useState<number | null>(null);
  const [viewing, setViewing] = useState<StandardFile | null>(null);
  const [tab, setTab] = useState('bom');
  const std = useLoad(() => getStandard(id, versionId), [id, versionId]);
  const d = std.data;
  useDetailTitle(d?.number ?? null);
  const fileById = useMemo(() => new Map((d?.files ?? []).map((f) => [f.id, f])), [d]);
  if (std.error) return <ErrorNotice error={std.error} onRetry={std.reload} />;
  if (!d) return <DetailSkeleton />;
  const to = (path: string) => appPath(company, path);
  const parts = d.files.filter((f) => f.kind === 'part');
  const sheet = d.files.filter((f) => f.kind === 'source');

  const treeColumns: DataColumn<StandardTreeRow>[] = [
    { key: 'mark', header: 'Mark', alwaysVisible: true, render: (r) => <Mono>{r.mark ?? ''}</Mono> },
    { key: 'name', header: 'Row', alwaysVisible: true, render: (r) => <TreeName r={r} /> },
    { key: 'qty', header: 'Qty', numeric: true, alwaysVisible: true, render: (r) => <Mono>{r.quantity}</Mono> },
    { key: 'total', header: 'Per standard', numeric: true, render: (r) => <Mono muted>{r.total}</Mono> },
    { key: 'size', header: 'T × W × L (mm)', render: (r) => <Mono>{r.sizeText ?? ''}</Mono> },
    { key: 'grade', header: 'Grade', render: (r) => <Mono>{r.grade ?? ''}</Mono> },
    { key: 'weight', header: 'Weight each', numeric: true, render: (r) => <Mono>{r.weightKg != null ? kgText(r.weightKg) : ''}</Mono> },
    {
      key: 'values', header: 'Other values', defaultHidden: true,
      render: (r) => <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', whiteSpace: 'normal', maxWidth: 360 }}>{r.values.filter((v) => !['THICKNESS', 'WIDTH', 'LENGTH', 'GRADE', 'WEIGHT', 'DRAWING_MARK'].includes(v.code)).map((v) => `${v.name ?? v.code} ${v.text ?? ''}`).join(' · ')}</Typography>,
    },
    {
      key: 'drawing', header: 'Drawing', alwaysVisible: true,
      render: (r) => (r.fileId && fileById.get(r.fileId)
        ? <Tooltip title={`View ${fileById.get(r.fileId)!.fileName}`}><Button size="small" startIcon={<VisibilityRounded />} onClick={(e) => { e.stopPropagation(); setViewing(fileById.get(r.fileId!)!); }}>View</Button></Tooltip>
        : null),
    },
  ];
  const fileColumns: DataColumn<StandardFile>[] = [
    { key: 'mark', header: 'Mark', alwaysVisible: true, sortValue: (f) => f.mark ?? '', render: (f) => <Mono>{f.mark ?? (f.kind === 'source' ? 'Sheet' : '')}</Mono> },
    { key: 'file', header: 'File', alwaysVisible: true, sortValue: (f) => f.fileName, render: (f) => <Typography sx={{ fontSize: 13, overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{f.fileName}</Typography> },
    { key: 'size', header: 'Size (mm)', render: (f) => <Mono>{f.lengthMm != null && f.widthMm != null ? `${Math.round(f.lengthMm)} × ${Math.round(f.widthMm)}` : '—'}</Mono> },
    { key: 'holes', header: 'Holes', numeric: true, render: (f) => <Mono>{f.holes ?? '—'}</Mono> },
    { key: 'view', header: '', alwaysVisible: true, render: (f) => <Button size="small" startIcon={<VisibilityRounded />} onClick={(e) => { e.stopPropagation(); setViewing(f); }}>View</Button> },
  ];

  const header = (
    <DetailHeader code={d.number} title={d.name}
      badges={<>{d.revision && <Badge family="neutral" label={`rev ${d.revision}`} noIcon />}{d.internal && <InternalBadge />}{d.version ? <Badge family="info" label={`Version ${d.version.versionNo}`} noIcon /> : <WarnBadge label="No BOM yet" />}</>}
      subtitle={d.description}
      actions={d.versions.length > 1 && (
        <TextField select size="small" label="Version" value={d.version?.id ?? ''} onChange={(e) => setVersionId(Number(e.target.value))} sx={{ minWidth: 180 }}>
          {d.versions.map((v) => <MenuItem key={v.id} value={v.id}>{`Version ${v.versionNo}${v.id === d.currentVersionId ? ' (current)' : ''}`}</MenuItem>)}
        </TextField>
      )}
      facts={(
        <>
          <Fact label="Rows"><Mono>{d.version?.rows ?? '—'}</Mono></Fact>
          <Fact label="Parts"><Mono>{d.version?.parts ?? '—'}</Mono></Fact>
          <Fact label="Weight"><Mono>{d.version?.weightKg != null ? kgText(d.version.weightKg) : '—'}</Mono></Fact>
          <Fact label="Part drawings"><Mono>{parts.length}</Mono></Fact>
          <Fact label="Sheet">{d.drawing ? <Mono>{`${d.drawing.number} rev ${d.drawing.revision}`}</Mono> : <Mono muted>—</Mono>}</Fact>
          <Fact label="Source"><SourceLink url={d.sourceUrl ?? d.drawing?.url ?? null} /></Fact>
          {d.version && <Fact label="Made from">{d.version.madeFrom === 'import' ? 'Imported' : d.version.fromLineId ? 'An order line' : '—'}</Fact>}
        </>
      )} />
  );

  return (
    <DetailLayout header={header}
      tabs={[{ value: 'bom', label: 'BOM and values', count: d.tree.length }, { value: 'drawings', label: 'Drawings', count: d.files.length }, { value: 'lines', label: 'Used on', count: d.lines.length }]}
      active={tab} onTab={setTab}>
      {tab === 'bom' && (
        d.tree.length
          ? <DataTable rows={d.tree} columns={treeColumns} getRowId={(r) => r.key} storageKey="standard-tree" exportName={`standard-${d.number}`} pageSize={1000} />
          : <SectionCard title="No BOM yet"><EmptyState title="No BOM yet" hint="Make an order line for this drawing, fill its BOM and values, then choose “Save this BOM to the standard” on the line." /></SectionCard>
      )}
      {tab === 'drawings' && (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          {sheet.length > 0 && <DataTable rows={sheet} columns={fileColumns} getRowId={(f) => f.id} storageKey="standard-sheet" />}
          <DataTable rows={parts} columns={fileColumns} getRowId={(f) => f.id} storageKey="standard-files" pageSize={500}
            empty={<EmptyState title="No part drawings" hint="Part drawings come with a line's BOM when it is saved to the standard." />} />
          {d.notes && (
            <SectionCard title="Notes">
              <Typography sx={{ fontSize: 13, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{d.notes}</Typography>
            </SectionCard>
          )}
        </Box>
      )}
      {tab === 'lines' && (
        <SectionCard flush title="Order lines made from it" subtitle="Each line keeps its own copy of the version it was made from.">
          {d.lines.length ? (
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 1.5, display: 'grid', gap: 0.75 }}>
              {d.lines.map((l) => (
                <Box component="li" key={l.id} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 13.5 }}>
                  <Box component={Link} to={to(`orders/${l.orderId}`)} sx={linkSx}><Mono>{l.orderCode}</Mono></Box>
                  <span>line {l.lineNo}</span>
                  <Mono muted>{l.versionNo ? `version ${l.versionNo}` : 'no version yet'}</Mono>
                  <Mono muted>{l.orderStatus}</Mono>
                </Box>
              ))}
            </Box>
          ) : <EmptyState title="Not used on an order yet" hint="On an order, Add line › From a standard drawing." />}
        </SectionCard>
      )}
      {viewing && (
        <DrawingViewer onClose={() => setViewing(null)} orderId={0} lineId={0}
          drawing={{ id: viewing.id, mark: viewing.mark ?? viewing.fileName, fileName: viewing.fileName, fileKind: viewing.fileKind }}
          fetchFile={() => standardFileBlob(viewing.id)}
          downloadFile={async () => {
            const blob = await standardFileBlob(viewing.id);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = viewing.fileName; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }} />
      )}
    </DetailLayout>
  );
}
