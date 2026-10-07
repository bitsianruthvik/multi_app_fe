import { useState, type ChangeEvent } from 'react';
import { Box, Button, Dialog, DialogContent, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import ContentCutRounded from '@mui/icons-material/ContentCutRounded';
import type { Offcut, OffcutStatus } from '../api/types';
import { useCompanySlug } from '../hooks/useLoad';
import { useDebounced, usePagedList } from '../hooks/usePagedList';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { kgText, rupeeText } from '../lib/money';
import { Badge, EmptyState, ErrorNotice, Fact, Mono, PageHeader, type Family } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { OffcutShape } from '../components/OffcutShape';
import { DialogHeader } from '../components/FormDialog';

const STATUS_CHIPS: [string, string][] = [['available', 'Available'], ['planned', 'Planned'], ['used', 'Used'], ['scrapped', 'Scrapped'], ['returned', 'Returned'], ['all', 'All']];
const STATUS_LABEL: Record<OffcutStatus, string> = { planned: 'Planned', available: 'Available', used: 'Used', scrapped: 'Scrapped', returned: 'Returned' };
const STATUS_HELP: Record<OffcutStatus, string> = {
  planned: 'Its nest is accepted but the plate is not cut yet',
  available: 'Cut, in stock and usable',
  used: 'Used in another nest',
  scrapped: 'Scrapped',
  returned: 'Returned to the customer',
};
const STATUS_FAMILY: Record<OffcutStatus, Family> = { planned: 'info', available: 'success', used: 'neutral', scrapped: 'danger', returned: 'neutral' };

const steelText = (o: Pick<Offcut, 'thickness' | 'grade'>) => [o.thickness != null ? `${o.thickness} mm` : null, o.grade].filter(Boolean).join(' ') || '—';
const rectText = (o: Pick<Offcut, 'rect'> & Partial<Pick<Offcut, 'kind' | 'lengthMm'>>) => (o.kind === 'bar' && o.lengthMm ? `${Math.round(o.lengthMm)} long` : o.rect ? `${Math.round(o.rect.length)} × ${Math.round(o.rect.width)}` : '—');
const KIND_CHIPS: [string, string][] = [['all', 'All kinds'], ['plate', 'Plates'], ['bar', 'Bars']];
const KIND_LABEL = { plate: 'Plate', bar: 'Bar' } as const;
const kindOf = (o: Pick<Offcut, 'kind'>): 'plate' | 'bar' => (o.kind === 'bar' ? 'bar' : 'plate');

/** What GET /offcuts?paged=1 counts over every matching offcut. */
interface OffcutCounts { status: Record<string, number> }
const SERVER_SORT = ['offcutNo', 'steel', 'weight', 'value', 'status', 'created'];

const StatusChipBadge = ({ status }: { status: OffcutStatus }) => <Badge family={STATUS_FAMILY[status]} label={STATUS_LABEL[status]} title={STATUS_HELP[status]} noIcon />;

const inputSx = { height: 32, px: 1, border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', background: 'transparent', color: 'var(--c-text)', fontFamily: 'var(--font-ui)', fontSize: 13 };

function OffcutDialog({ offcut, onClose, company }: { offcut: Offcut | null; onClose: () => void; company: string }) {
  return (
    <Dialog open={!!offcut} onClose={onClose} maxWidth="md" fullWidth>
      {offcut && (
        <>
          <DialogHeader title={<Mono>{offcut.offcutNo}</Mono>} subtitle={`${steelText(offcut)} · ${STATUS_HELP[offcut.status]}`} onClose={onClose} />
          <DialogContent>
            <Box data-testid="offcut-dialog" sx={{ display: 'grid', gap: 2 }}>
              <Box sx={{ display: 'grid', placeItems: 'center', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', p: 1.5, background: 'var(--c-surface-2)', overflow: 'hidden' }}>
                <OffcutShape offcut={offcut} width={640} height={320} title={`${offcut.offcutNo} outline`} />
              </Box>
              {offcut.rect && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Dashed: the biggest clean rectangle, {rectText(offcut)} mm (its size only; where it sits is not shown).</Typography>}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
                <Fact label="Status"><StatusChipBadge status={offcut.status} /></Fact>
                <Fact label="Steel">{steelText(offcut)}</Fact>
                <Fact label="Material">{offcut.material ?? offcut.item?.name ?? '—'}</Fact>
                <Fact label="Weight">{kgText(offcut.weightKg)}</Fact>
                <Fact label="Value">{offcut.value == null ? '—' : rupeeText(offcut.value)}</Fact>
                <Fact label="Area">{`${(offcut.areaMm2 / 1e6).toFixed(3)} m²`}</Fact>
                <Fact label="Kind">{KIND_LABEL[kindOf(offcut)]}</Fact>
                {offcut.kind === 'bar' && <Fact label="Length">{offcut.lengthMm ? `${Math.round(offcut.lengthMm).toLocaleString('en-IN')} mm` : '—'}</Fact>}
                {offcut.kind !== 'bar' && <Fact label="Clean rectangle">{rectText(offcut)}{offcut.rect ? ' mm' : ''}</Fact>}
                {offcut.kind !== 'bar' && <Fact label="Bounding box">{offcut.bbox ? `${Math.round(offcut.bbox.length)} × ${Math.round(offcut.bbox.width)} mm` : '—'}</Fact>}
                <Fact label="Item">{offcut.item ? <Mono>{offcut.item.code ?? offcut.item.name}</Mono> : '—'}</Fact>
                <Fact label="Order"><Link to={appPath(company, `orders/${offcut.origin.orderId}`)}><Mono>{offcut.origin.orderCode}</Mono></Link> · line {offcut.origin.lineNo}</Fact>
                <Fact label="Nest"><Mono>{offcut.origin.lotNo}</Mono>{offcut.origin.plate?.code && <> · {offcut.kind === 'bar' ? 'bar' : 'plate'} <Mono>{offcut.origin.plate.code}</Mono></>}</Fact>
                <Fact label="Batch">{offcut.batch ? <Link to={appPath(company, `batches/${offcut.batch.id}`)}><Mono>{offcut.batch.code}</Mono></Link> : 'Not cut yet'}</Fact>
              </Box>
            </Box>
          </DialogContent>
        </>
      )}
    </Dialog>
  );
}

/** Inventory › Offcuts — what is left of cut plates, each with the drawing of its shape. */
export default function Offcuts() {
  const company = useCompanySlug();
  const [status, setStatus] = useUrlParam('status', 'available');
  const [kind, setKind] = useUrlParam('kind', 'all');
  const [thickness, setThickness] = useUrlParam('thickness', '');
  const [grade, setGrade] = useUrlParam('grade', '');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Offcut | null>(null);
  const debounced = useDebounced(search.trim());
  const dThickness = useDebounced(thickness.trim());
  const dGrade = useDebounced(grade.trim());
  const list = usePagedList<Offcut, OffcutCounts>('/offcuts', { status, kind: kind === 'all' ? undefined : kind, thickness: dThickness || undefined, grade: dGrade || undefined, search: debounced }, { defaultSort: { key: 'created', dir: 'desc' } });
  const counts = list.counts?.status;
  const filtered = !!debounced || !!dThickness || !!dGrade || kind !== 'all';

  const columns: DataColumn<Offcut>[] = [
    { key: 'shape', header: 'Shape', render: (o) => <Box sx={{ py: 0.5 }}><OffcutShape offcut={o} width={120} height={60} /></Box>, alwaysVisible: true },
    { key: 'offcutNo', header: 'Offcut', render: (o) => <Mono chip>{o.offcutNo}</Mono>, sortValue: (o) => o.offcutNo, exportValue: (o) => o.offcutNo },
    { key: 'kind', header: 'Kind', render: (o) => <Badge family="neutral" label={KIND_LABEL[kindOf(o)]} noIcon />, sortValue: (o) => kindOf(o), exportValue: (o) => KIND_LABEL[kindOf(o)] },
    { key: 'steel', header: 'Steel', render: (o) => steelText(o), sortValue: (o) => o.thickness, exportValue: (o) => steelText(o) },
    { key: 'weight', header: 'Weight', numeric: true, render: (o) => <Mono>{kgText(o.weightKg)}</Mono>, sortValue: (o) => o.weightKg, exportValue: (o) => o.weightKg ?? '' },
    { key: 'value', header: 'Value', numeric: true, render: (o) => <Mono>{o.value == null ? '—' : rupeeText(o.value)}</Mono>, sortValue: (o) => o.value, exportValue: (o) => o.value ?? '' },
    { key: 'rect', header: 'Size', render: (o) => <Mono>{rectText(o)}</Mono>, exportValue: (o) => rectText(o) },
    {
      key: 'origin', header: 'From', exportValue: (o) => `${o.origin.orderCode} ${o.origin.lotNo}`,
      render: (o) => (
        <Box sx={{ py: 0.5 }} onClick={(e) => e.stopPropagation()}>
          <Link to={appPath(company, `orders/${o.origin.orderId}`)}><Mono>{o.origin.orderCode}</Mono></Link>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>nest <Mono>{o.origin.lotNo}</Mono></Typography>
        </Box>
      ),
    },
    { key: 'status', header: 'Status', render: (o) => <StatusChipBadge status={o.status} />, sortValue: (o) => o.status, exportValue: (o) => STATUS_LABEL[o.status] },
  ];

  return (
    <Box>
      <PageHeader title="Offcuts" subtitle="What is left of a cut plate or a cut bar, kept as stock — so the next nest can use it. A plate shows the drawing of its shape; a bar shows its length." />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search offcut no, order or nest">
        {STATUS_CHIPS.map(([v, label]) => <FacetChip key={v} label={label} active={status === v} count={counts?.[v]} onClick={() => setStatus(v)} />)}
        {KIND_CHIPS.map(([v, label]) => <FacetChip key={`kind-${v}`} label={label} active={kind === v} onClick={() => setKind(v)} />)}
        <Box component="input" aria-label="Thickness (mm)" placeholder="Thickness mm" value={thickness} onChange={(e: ChangeEvent<HTMLInputElement>) => setThickness(e.target.value)} inputMode="decimal" sx={{ ...inputSx, width: 120 }} />
        <Box component="input" aria-label="Grade" placeholder="Grade e.g. E350" value={grade} onChange={(e: ChangeEvent<HTMLInputElement>) => setGrade(e.target.value)} sx={{ ...inputSx, width: 140 }} />
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={list.rows} columns={columns} getRowId={(o) => o.id} onRowClick={setOpen} loading={!list.loaded}
        server={{ ...list.server, sortable: SERVER_SORT }}
        storageKey="offcuts" exportName="offcuts" defaultSortKey="created" defaultSortDir="desc"
        empty={<EmptyState icon={<ContentCutRounded />} title={filtered ? 'No offcut matches' : 'No offcuts here'}
          hint={filtered ? 'Clear the search, kind, thickness or grade.' : 'Offcuts appear when a nested plate or bar is cut.'}
          action={filtered ? <Button onClick={() => { setSearch(''); setThickness(''); setGrade(''); setKind('all'); }}>Clear filters</Button> : status !== 'all' ? <Button onClick={() => setStatus('all')}>Show every status</Button> : undefined} />} />
      <OffcutDialog offcut={open} onClose={() => setOpen(null)} company={company} />
    </Box>
  );
}
