import { useState } from 'react';
import { Box, Button, MenuItem, Tab, Tabs, TextField, Typography } from '@mui/material';
import ConstructionRounded from '@mui/icons-material/ConstructionRounded';
import { CfApiError } from '../api/client';
import {
  listToolItems, listToolPieces, recordToolUse, retireToolPiece, setToolItemLife,
  type LifeUnit, type ToolItem, type ToolPiece,
} from '../api/toolsResources';
import { useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { EmptyState, ErrorNotice, Mono, PageHeader } from '../components/ui';
import { HelpButton } from '../help/HelpButton';
import { DataTable, type DataColumn } from '../components/DataTable';
import { useToast } from '../components/toastContext';
import { LIFE_UNITS, lifeText, pieceLife, STATUS_LABEL } from '../lib/toolsResources';
import { FlashOnChange } from '../motion';

const fail = (e: unknown) => (e instanceof CfApiError ? [e.message, ...e.problems].join(' ') : String(e));

/** Record use against a piece: type the amount, Enter. */
function UseBox({ piece, onDone }: { piece: ToolPiece; onDone: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const go = async () => {
    const n = Number(amount);
    if (!(n > 0)) return;
    try {
      const out = await recordToolUse(piece.id, n);
      setAmount('');
      toast.success(out.status === 'worn_out' ? `${piece.itemCode} is worn out.` : 'Use recorded.');
      onDone();
    } catch (e) { toast.error(fail(e)); }
  };
  return (
    <TextField size="small" value={amount} placeholder={piece.lifeUnit} sx={{ width: 96 }}
      onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void go(); } }}
      slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': `Use of ${piece.itemCode} no. ${piece.unitNo}`, style: { textAlign: 'right' } } }} />
  );
}

/** A tool item's life: unit and limit, saved on Enter or when you leave the limit. */
function LifeEditor({ item, canManage, onDone }: { item: ToolItem; canManage: boolean; onDone: () => void }) {
  const toast = useToast();
  const [unit, setUnit] = useState<LifeUnit | ''>(item.lifeUnit ?? '');
  const [limit, setLimit] = useState(item.lifeLimit == null ? '' : String(item.lifeLimit));
  const save = async (u: LifeUnit | '', l: string) => {
    if ((u || null) === item.lifeUnit && (l === '' ? null : Number(l)) === item.lifeLimit) return;
    try {
      await setToolItemLife(item.id, u || null, u && l !== '' ? Number(l) : null);
      toast.success(`${item.code}: life saved.`);
      onDone();
    } catch (e) { toast.error(fail(e)); }
  };
  if (!canManage) return <span>{lifeText(item.lifeUnit, item.lifeLimit)}</span>;
  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <TextField select size="small" value={unit} sx={{ width: 120 }} onChange={(e) => { const u = e.target.value as LifeUnit | ''; setUnit(u); if (!u) setLimit(''); void save(u, u ? limit : ''); }}
        slotProps={{ htmlInput: { 'aria-label': `Life unit of ${item.code}` } }}>
        <MenuItem value="">Not tracked</MenuItem>
        {LIFE_UNITS.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
      </TextField>
      <TextField size="small" value={limit} disabled={!unit} placeholder="limit" sx={{ width: 96 }} onChange={(e) => setLimit(e.target.value)}
        onBlur={() => void save(unit, limit)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(unit, limit); } }}
        slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': `Life limit of ${item.code}`, style: { textAlign: 'right' } } }} />
    </Box>
  );
}

/** Inventory › Tools: tools are stock items; this is their life. */
export default function Tools() {
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canIssue = isPermitted('cf_erp_inventory_manage');
  const canCatalog = isPermitted('cf_erp_catalog_manage');
  const [tab, setTab] = useUrlParam('tab', 'pieces');
  const [status, setStatus] = useState('in_use');
  const [search, setSearch] = useState('');
  const pieces = useLoad(() => listToolPieces(status, search), [status, search]);
  const items = useLoad(() => listToolItems(search), [search]);

  const pieceColumns: DataColumn<ToolPiece>[] = [
    { key: 'tool', header: 'Tool', alwaysVisible: true, sortValue: (p) => p.itemCode, render: (p) => <><Mono>{p.itemCode}</Mono> {p.itemName} <Mono muted>#{p.unitNo}</Mono></> },
    { key: 'issued', header: 'Issued', sortValue: (p) => p.issuedOn, render: (p) => <Mono>{p.issuedOn ?? ''}</Mono> },
    { key: 'usedFor', header: 'Used for', sortValue: (p) => p.orderCode ?? 'General', render: (p) => (p.usedFor === 'order' ? <Mono>{p.orderCode}</Mono> : 'General') },
    { key: 'machine', header: 'On machine', render: (p) => <Mono muted={!p.machineCode}>{p.machineCode ?? '—'}</Mono> },
    {
      key: 'life', header: 'Life', alwaysVisible: true, sortValue: (p) => p.percentUsed ?? -1,
      render: (p) => (
        <Box sx={{ minWidth: 150 }}>
          <Box sx={{ fontSize: 13 }}><FlashOnChange value={p.percentUsed}>{pieceLife(p)}</FlashOnChange></Box>
          {p.percentUsed != null && (
            <Box sx={{ height: 4, borderRadius: 2, background: 'var(--c-surface-2)', mt: 0.5 }}>
              <Box sx={{ height: 4, borderRadius: 2, width: `${p.percentUsed}%`, background: p.percentUsed >= 80 ? 'var(--c-danger, #b3261e)' : 'var(--c-primary-700)' }} />
            </Box>
          )}
        </Box>
      ),
    },
    { key: 'status', header: 'State', sortValue: (p) => p.status, render: (p) => <FlashOnChange value={p.status}>{STATUS_LABEL[p.status] ?? p.status}</FlashOnChange> },
  ];
  const itemColumns: DataColumn<ToolItem>[] = [
    { key: 'item', header: 'Tool', alwaysVisible: true, sortValue: (t) => t.code, render: (t) => <><Mono>{t.code}</Mono> {t.name}</> },
    { key: 'life', header: 'Life per piece', alwaysVisible: true, render: (t) => <LifeEditor key={`${t.id}-${t.lifeUnit}-${t.lifeLimit}`} item={t} canManage={canCatalog} onDone={items.reload} /> },
    { key: 'inUse', header: 'In use', sortValue: (t) => t.inUse, render: (t) => <Mono>{t.inUse}</Mono> },
    { key: 'worn', header: 'Worn out', sortValue: (t) => t.wornOut, render: (t) => <Mono>{t.wornOut}</Mono> },
  ];

  return (
    <Box>
      <PageHeader title="Tools" help={<HelpButton tab={tab} />} subtitle="Tools are stock items like any other: receive and issue them under Stock. Give a tool a life and every piece issued is counted until it is worn out." />
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 36 }}>
          <Tab value="pieces" label="Issued pieces" sx={{ minHeight: 36 }} />
          <Tab value="items" label="Tool items" sx={{ minHeight: 36 }} />
        </Tabs>
        {tab === 'pieces' && (
          <TextField select size="small" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ width: 140 }} slotProps={{ htmlInput: { 'aria-label': 'State' } }}>
            <MenuItem value="in_use">In use</MenuItem><MenuItem value="worn_out">Worn out</MenuItem><MenuItem value="retired">Retired</MenuItem><MenuItem value="all">All</MenuItem>
          </TextField>
        )}
        <TextField size="small" placeholder="Search tools" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ width: 220 }} slotProps={{ htmlInput: { 'aria-label': 'Search tools' } }} />
      </Box>
      {tab === 'pieces' ? (
        <>
          <ErrorNotice error={pieces.error} onRetry={pieces.reload} />
          <DataTable rows={pieces.data ?? []} columns={pieceColumns} getRowId={(p) => p.id} loading={pieces.loading && !pieces.data} storageKey="tool-pieces" exportName="tool-pieces"
            rowActions={canIssue ? (p) => (p.status === 'in_use' ? (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <UseBox piece={p} onDone={pieces.reload} />
                <Button size="small" onClick={async () => { try { await retireToolPiece(p.id); toast.success('Retired.'); pieces.reload(); } catch (e) { toast.error(fail(e)); } }}>Retire</Button>
              </Box>
            ) : null) : undefined}
            empty={<EmptyState icon={<ConstructionRounded />} title="No tool pieces here" hint="A tool piece appears when a tool that has a life is issued from stock." />} />
        </>
      ) : (
        <>
          <ErrorNotice error={items.error} onRetry={items.reload} />
          <DataTable rows={items.data ?? []} columns={itemColumns} getRowId={(t) => t.id} loading={items.loading && !items.data} storageKey="tool-items" exportName="tool-items" defaultSortKey="item"
            empty={<EmptyState icon={<ConstructionRounded />} title="No tool items yet" hint="Add items under the Tools family in the catalog. Tools from the machine register were moved there as TL- items." />} />
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 1 }}>The life is copied onto each piece when it is issued; pieces already out keep theirs.</Typography>
        </>
      )}
    </Box>
  );
}
