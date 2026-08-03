import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, IconButton, TextField, Tooltip } from '@mui/material';
import EditRounded from '@mui/icons-material/EditRounded';
import LabelRounded from '@mui/icons-material/LabelRounded';
import FileDownloadRounded from '@mui/icons-material/FileDownloadRounded';
import AutoFixHighRounded from '@mui/icons-material/AutoFixHighRounded';

import {
  generateMarks, getCutList, setItemMark, type CutListItem,
} from '../api/client';
import {
  DataTable, EmptyState, FormDialog, Mono, QtyCell, SectionCard, StatStrip,
  useToast, backendMessage, type DataColumn, type Stat,
} from '../components';

/**
 * Piece marks for one order (Issue 2 — FAB_ERP_SHOPFLOOR_REALITY_PLAN.md).
 *
 * The mark is what gets painted on the steel, so this panel is deliberately
 * blunt about two things:
 *
 *  - **Generation only fills blanks.** The button says so, and the result toast
 *    reports how many were kept, because "regenerate" sounds destructive and
 *    users need to know it isn't.
 *  - **Unmarked is a defect, not a neutral state.** The strip counts it in
 *    warning tone: an unmarked part cannot be tracked through the shop.
 */
export function MarksPanel({ orderId, canManage }: { orderId: number; canManage: boolean }) {
  const { toast } = useToast();
  const [items, setItems] = useState<CutListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<CutListItem | null>(null);
  const [draftMark, setDraftMark] = useState('');
  const [cascadePrompt, setCascadePrompt] = useState<{ item: CutListItem; mark: string; children: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await getCutList(orderId);
      setItems(res.items ?? []);
    } catch (e) {
      setError(backendMessage(e, 'Failed to load the cut list.'));
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const stats: Stat[] = useMemo(() => {
    const unmarked = items.filter((i) => !i.mark);
    return [
      { label: 'Parts', value: items.length },
      { label: 'Marked', value: items.length - unmarked.length, tone: 'success' },
      { label: 'Unmarked', value: unmarked.length, tone: unmarked.length ? 'warning' : 'default' },
    ];
  }, [items]);

  const runGenerate = async () => {
    try {
      const r = await generateMarks(orderId);
      toast(
        r.assigned === 0
          ? 'Every part already has a mark — nothing changed.'
          : `Assigned ${r.assigned} mark${r.assigned === 1 ? '' : 's'}${r.skipped ? `, kept ${r.skipped} existing` : ''}.`,
      );
      load();
    } catch (e) {
      setError(backendMessage(e, 'Failed to generate marks.'));
    }
  };

  const saveMark = async (item: CutListItem, mark: string, cascade = false) => {
    const r = await setItemMark(item.id, mark, cascade);
    // The server reports children left on the old stem rather than silently
    // renaming steel that may already be painted — surface that as a choice.
    if (!cascade && r.childrenOnOldStem > 0) {
      setCascadePrompt({ item, mark, children: r.childrenOnOldStem });
    } else {
      toast(r.childrenRenamed ? `Mark set; ${r.childrenRenamed} child mark(s) updated.` : 'Mark set.');
    }
    load();
  };

  const exportCsv = () => {
    const rows = [
      ['Mark', 'Parent mark', 'Description', 'Catalog code', 'Qty', 'Unit'],
      ...items.map((i) => [
        i.mark ?? '', i.parentMark ?? '', i.name, i.catalogCode ?? '',
        String(i.qty ?? ''), i.unit ?? '',
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = `cut-list-order-${orderId}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const columns: DataColumn<CutListItem>[] = [
    {
      key: 'mark',
      header: 'Mark',
      width: 130,
      render: (i) => (i.mark
        ? <Mono sx={{ fontWeight: 600, color: 'var(--c-primary-900)' }}>{i.mark}</Mono>
        : <Box sx={{ fontSize: 12, color: 'var(--c-warning-800)' }}>unmarked</Box>),
      // Unmarked parts sort to the top — they're the ones needing action.
      sortValue: (i) => i.mark ?? '',
      exportValue: (i) => i.mark ?? '',
    },
    { key: 'parentMark', header: 'Part of', width: 120, render: (i) => (i.parentMark ? <Mono>{i.parentMark}</Mono> : '—'), sortValue: (i) => i.parentMark ?? '' },
    { key: 'name', header: 'Description', render: (i) => i.name, sortValue: (i) => i.name },
    { key: 'catalogCode', header: 'Catalog code', width: 190, render: (i) => (i.catalogCode ? <Mono chip>{i.catalogCode}</Mono> : '—'), sortValue: (i) => i.catalogCode ?? '' },
    { key: 'qty', header: 'Qty', width: 110, numeric: true, render: (i) => <QtyCell value={i.qty} uom={i.unit} />, sortValue: (i) => Number(i.qty) || 0 },
  ];

  return (
    <SectionCard
      title="Piece marks"
      subtitle="What each part is called on the shop floor. Marks are unique to this order and are never renumbered once assigned."
      flush
      action={canManage ? (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" startIcon={<FileDownloadRounded />} onClick={exportCsv} disabled={items.length === 0}>
            Cut list
          </Button>
          <Button size="small" variant="contained" startIcon={<AutoFixHighRounded />} onClick={runGenerate}>
            Assign missing marks
          </Button>
        </Box>
      ) : undefined}
    >
      <Box sx={{ px: 2.5, pt: 2 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        {items.length > 0 && <StatStrip stats={stats} />}
      </Box>

      {!loading && items.length === 0 ? (
        <EmptyState
          icon={<LabelRounded />}
          title="No parts on this order yet"
          hint="Add items to the order's BOM, then assign marks so the shop can track them."
        />
      ) : (
        <DataTable
          rows={items}
          columns={columns}
          getRowId={(i) => i.id}
          loading={loading}
          storageKey="order-marks"
          exportName={`cut-list-order-${orderId}`}
          defaultSortKey="mark"
          rowActions={canManage ? (i) => (
            <Tooltip title="Edit mark">
              <IconButton
                size="small"
                aria-label={`Edit mark for ${i.name}`}
                onClick={() => { setEditing(i); setDraftMark(i.mark ?? ''); }}
              >
                <EditRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : undefined}
        />
      )}

      <FormDialog
        open={!!editing}
        title={`Mark — ${editing?.name ?? ''}`}
        subtitle="Fabricators usually inherit marks from the client's drawings. A manual mark always wins over a generated one."
        onClose={() => setEditing(null)}
        onSubmit={async () => { if (editing) await saveMark(editing, draftMark); }}
      >
        <TextField
          label="Piece mark"
          value={draftMark}
          onChange={(e) => setDraftMark(e.target.value)}
          size="small"
          fullWidth
          autoFocus
          helperText="Unique within this order. Leave blank to clear."
        />
      </FormDialog>

      <FormDialog
        open={!!cascadePrompt}
        title="Update child marks too?"
        subtitle={
          cascadePrompt
            ? `${cascadePrompt.children} child part${cascadePrompt.children === 1 ? '' : 's'} still use the old mark as their prefix.`
            : undefined
        }
        submitLabel="Update children"
        onClose={() => setCascadePrompt(null)}
        onSubmit={async () => {
          if (cascadePrompt) await saveMark(cascadePrompt.item, cascadePrompt.mark, true);
          setCascadePrompt(null);
        }}
        extraActions={
          <Button size="small" onClick={() => setCascadePrompt(null)}>Leave them as they are</Button>
        }
      >
        <Box sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>
          Only do this if those pieces haven't been marked physically yet — renaming a mark that's
          already painted on steel breaks traceability.
        </Box>
      </FormDialog>
    </SectionCard>
  );
}
