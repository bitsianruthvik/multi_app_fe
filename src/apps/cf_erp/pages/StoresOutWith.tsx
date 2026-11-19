import { useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import HandshakeRounded from '@mui/icons-material/HandshakeRounded';
import { custodyBack, getOutWith, qtyText, type Custody } from '../api/storesDesk';
import { useLoad } from '../hooks/useLoad';
import { useDebounced } from '../hooks/usePagedList';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader, SkeletonRows } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { FormDialog } from '../components/FormDialog';
import { useToast } from '../components/toastContext';

type Kind = 'returned' | 'worn' | 'lost';
const KIND: Record<Kind, { button: string; title: string; done: string; hint: string }> = {
  returned: { button: 'Returned', title: 'Returned', done: 'back on the shelf', hint: 'It goes back into the area it left.' },
  worn: { button: 'Worn out', title: 'Worn out', done: 'recorded as worn out', hint: 'Handed in and used up: nothing goes back into stock.' },
  lost: { button: 'Lost', title: 'Lost', done: 'recorded as lost', hint: 'Not coming back. Say what is known — Management sees it.' },
};

/**
 * STORES › OUT WITH (init.sql §111) — what is ours and not in the store: a tool with a person, a kit with a department,
 * material with a vendor. Each row ends one of three ways: Returned (back into stock), Worn out, or Lost.
 */
export default function StoresOutWith() {
  const toast = useToast();
  const canAct = useIsPermitted()('cf_erp_stores|cf_erp_inventory_manage');
  const [holder, setHolder] = useUrlParam('holder', '');
  const [age, setAge] = useUrlParam('age', '');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  const [act, setAct] = useState<{ row: Custody; kind: Kind } | null>(null);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const overdue = holder === 'overdue';
  const list = useLoad(() => getOutWith({ holder: overdue ? undefined : holder || undefined, overdue: overdue ? 1 : undefined, age: age || undefined, search: term || undefined }), [holder, age, term]);
  const counts = list.data?.counts;
  const [b1, b2] = list.data?.bands ?? [30, 90];
  const rows = list.data?.rows ?? [];
  const begin = (row: Custody, kind: Kind) => { setAct({ row, kind }); setQty(String(row.left)); setNote(''); };
  const save = async () => {
    if (!act) return;
    await custodyBack(act.row.id, { kind: act.kind, quantity: Number(qty), note: note.trim() || undefined });
    toast.success(`${qtyText(Number(qty))} ${act.row.item.uom} of ${act.row.item.name} ${KIND[act.kind].done}.`);
    list.reload();
  };
  const n = Number(qty);

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader title="Out with" subtitle="What is ours and not in the store: with a person, a department or a vendor. Each one comes back, is worn out, or is lost." />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search an item or a holder">
        <FacetChip label="All" active={!holder} count={counts?.all} onClick={() => setHolder('')} />
        <FacetChip label="People" active={holder === 'person'} count={counts?.person} onClick={() => setHolder('person')} />
        <FacetChip label="Departments" active={holder === 'department'} count={counts?.department} onClick={() => setHolder('department')} />
        <FacetChip label="Vendors" active={holder === 'vendor'} count={counts?.vendor} onClick={() => setHolder('vendor')} />
        <FacetChip label="Out too long" active={overdue} count={counts?.overdue} onClick={() => setHolder('overdue')} />
      </FilterBar>
      {/* How long it has been out, whoever holds it. */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 2, mt: -1 }} data-testid="out-age">
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Out for</Typography>
        <FacetChip label="Any time" active={!age} onClick={() => setAge('')} />
        <FacetChip label={`0–${b1} days`} active={age === 'd30'} count={counts?.d30} onClick={() => setAge('d30')} />
        <FacetChip label={`${b1 + 1}–${b2} days`} active={age === 'd90'} count={counts?.d90} onClick={() => setAge('d90')} />
        <FacetChip label={`Over ${b2} days`} active={age === 'over'} count={counts?.over} onClick={() => setAge('over')} />
      </Box>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      {!list.data && !list.error && <SkeletonRows rows={6} />}
      {list.data && rows.length === 0 && (
        <EmptyState icon={<HandshakeRounded />} title="Nothing is out" hint="A returnable item given out, or material sent to a vendor, shows here until it comes back." />
      )}
      <Box data-testid="out-with" sx={{ display: 'grid', gap: 1 }}>
        {rows.map((r) => (
          <Box key={r.id} data-testid="out-with-row" sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface)', p: 1.5, display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Box sx={{ flex: '2 1 220px', minWidth: 0 }}>
              <Box sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{r.item.name}</Box>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{[r.movementCode, r.order, r.machine].filter(Boolean).join(' · ')}</Typography>
            </Box>
            <Box sx={{ flex: '2 1 180px', minWidth: 0, fontSize: 13.5 }}>
              <Box sx={{ overflowWrap: 'anywhere' }}>{r.holder ?? '—'}{r.holderType === 'person' && r.department ? <Box component="span" sx={{ color: 'var(--c-text-3)' }}> · {r.department}</Box> : null}</Box>
              <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, color: 'var(--c-text-2)' }}>
                <span>since {r.issuedOn} ({r.daysOut} day{r.daysOut === 1 ? '' : 's'})</span>
                {r.overdueDays > 0 ? <Badge family="danger" label={`${r.overdueDays} day${r.overdueDays === 1 ? '' : 's'} over`} noIcon /> : r.dueOn ? <span>· due {r.dueOn}</span> : null}
              </Box>
            </Box>
            <Box sx={{ flex: '0 0 auto', textAlign: 'right' }}><Mono sx={{ fontSize: 16, fontWeight: 600 }}>{qtyText(r.left)}</Mono><Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{r.item.uom}{r.left !== r.quantity ? ` of ${qtyText(r.quantity)}` : ''}</Typography></Box>
            {canAct && (
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', ml: 'auto' }}>
                <Button size="small" variant="contained" onClick={() => begin(r, 'returned')}>{r.holderType === 'vendor' ? 'Received back' : 'Returned'}</Button>
                <Button size="small" variant="outlined" onClick={() => begin(r, 'worn')}>Worn out</Button>
                <Button size="small" variant="outlined" color="error" onClick={() => begin(r, 'lost')}>Lost</Button>
              </Box>
            )}
          </Box>
        ))}
      </Box>
      <FormDialog open={!!act} title={act ? `${KIND[act.kind].title} · ${act.row.item.name}` : ''} subtitle={act ? KIND[act.kind].hint : undefined} onClose={() => setAct(null)} onSubmit={save}
        submitLabel={act ? KIND[act.kind].button : 'Save'} submitColor={act?.kind === 'lost' ? 'error' : 'primary'} maxWidth="xs"
        submitDisabled={!act || !Number.isFinite(n) || n <= 0 || n > act.row.left + 1e-9 || (act.kind === 'lost' && !note.trim())}>
        <TextField label={`Quantity (${act?.row.item.uom ?? ''})`} value={qty} onChange={(e) => setQty(e.target.value)} autoFocus inputProps={{ inputMode: 'decimal' }}
          helperText={act ? `${qtyText(act.row.left)} still out with ${act.row.holder ?? 'the holder'}` : undefined} />
        <TextField label={act?.kind === 'lost' ? 'What is known' : 'Note (optional)'} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={act?.kind === 'lost' ? 2 : 1} />
      </FormDialog>
    </Box>
  );
}
