/**
 * FieldsTab — the Marks tab (piece-mark prefixes per category).
 *
 * Named `FieldsTab.tsx` per the EU-16 file list, though nothing here changed
 * behaviourally (item 12: "leave the Mark schemes tab where it is" — out of
 * scope for this EU) — this file is just where its code physically landed
 * once the 2,654-line `ItemCatalog.tsx` was split apart. The exported
 * component keeps its original name, `MarkSchemesTab`.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, IconButton, MenuItem, TextField, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import LabelRounded from '@mui/icons-material/LabelRounded';

import { fabQuery, fabMutate } from '../../api/client';
import type { FabItemCategory } from '../../types';
import { DataTable, EmptyState, FormDialog, ConfirmDialog, Mono, useToast, backendMessage, type DataColumn } from '../../components';

/** fab_mark_schemes — item category → piece-mark prefix, one row per category. */
interface FabMarkScheme {
  id: number;
  companyId: number;
  /** NULL = the fallback row, used for any item whose category has no row. */
  itemCategoryId: number | null;
  prefix: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const MARK_PREFIX_MAX = 10;              // fab_mark_schemes.prefix is VARCHAR(10)
const MARK_FALLBACK   = '__fallback__';  // sentinel for the NULL-category option
const MARK_FALLBACK_LABEL = 'All other items (fallback)';
/** markService.js falls back to this when a company has configured nothing. */
const MARK_BUILTIN_PREFIX = 'P';

interface MarkSchemeDraft {
  category: number | typeof MARK_FALLBACK | '';
  prefix: string;
  sortOrder: string;
}

const BLANK_MARK_SCHEME = (): MarkSchemeDraft => ({ category: '', prefix: '', sortOrder: '0' });

function MarkSchemeDialog({ open, initial, categories, schemes, onClose, onSaved }: {
  open: boolean;
  initial: FabMarkScheme | null;
  categories: FabItemCategory[];
  schemes: FabMarkScheme[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !initial;
  const [draft, setDraft] = useState<MarkSchemeDraft>(BLANK_MARK_SCHEME());

  useEffect(() => {
    if (!open) return;
    setDraft(initial
      ? {
          category: initial.itemCategoryId ?? MARK_FALLBACK,
          prefix: initial.prefix,
          sortOrder: String(initial.sortOrder),
        }
      : BLANK_MARK_SCHEME());
  }, [open, initial]);

  // Both uniqueness rules are enforced here because the DB can only cover one of
  // them: UNIQUE (company_id, item_category_id) stops a second row for a real
  // category, but MySQL/TiDB allow any number of NULLs, so nothing stops a second
  // fallback row. An option the row being edited already owns stays selectable.
  const takenCategoryIds = new Set(
    schemes.filter((s) => s.id !== initial?.id && s.itemCategoryId !== null)
           .map((s) => s.itemCategoryId),
  );
  const fallbackTaken = schemes.some((s) => s.id !== initial?.id && s.itemCategoryId === null);

  const prefix = draft.prefix.trim().toUpperCase();

  const save = async () => {
    const payload = {
      item_category_id: typeof draft.category === 'number' ? draft.category : null,
      prefix,
      sort_order: Number(draft.sortOrder) || 0,
    };
    if (isNew) await fabMutate('fabErpMarkScheme', 'insert', payload);
    else await fabMutate('fabErpMarkScheme', 'update', { id: initial!.id, ...payload });
    onSaved();
  };

  return (
    <FormDialog
      open={open}
      title={isNew ? 'Add mark scheme' : `Edit prefix — ${initial?.prefix}`}
      onClose={onClose}
      onSubmit={save}
      submitDisabled={!prefix || draft.category === ''}
    >
      <TextField
        select label="Category" value={draft.category} size="small" fullWidth required
        helperText="Items in this category get the prefix below."
        onChange={(e) => {
          const v = e.target.value;
          setDraft((d) => ({ ...d, category: v === MARK_FALLBACK ? MARK_FALLBACK : v === '' ? '' : Number(v) }));
        }}
      >
        <MenuItem value="" disabled><em>Select category…</em></MenuItem>
        <MenuItem value={MARK_FALLBACK} disabled={fallbackTaken}>
          {MARK_FALLBACK_LABEL}{fallbackTaken ? ' — already defined' : ''}
        </MenuItem>
        {categories.map((c) => (
          <MenuItem key={c.id} value={c.id} disabled={takenCategoryIds.has(c.id)}>
            {c.name}{takenCategoryIds.has(c.id) ? ' — already has a prefix' : ''}
          </MenuItem>
        ))}
      </TextField>
      {/* Uppercased and capped on entry rather than validated on submit — a mark
          is stamped on steel, and VARCHAR(10) would truncate silently. */}
      <TextField
        label="Prefix" value={draft.prefix} size="small" fullWidth required
        helperText={`Written on the piece — B, C, PL. Up to ${MARK_PREFIX_MAX} characters.`}
        onChange={(e) => setDraft((d) => ({ ...d, prefix: e.target.value.toUpperCase().slice(0, MARK_PREFIX_MAX) }))}
      />
      <TextField
        label="Sort order" type="number" value={draft.sortOrder} size="small" fullWidth
        helperText="Display order in this list only — it does not affect which prefix an item gets."
        onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))}
      />
    </FormDialog>
  );
}

export function MarkSchemesTab({ categories, uncategorizedCount, canEdit }: {
  categories: FabItemCategory[];
  uncategorizedCount: number;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const [schemes, setSchemes] = useState<FabMarkScheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [dlg,     setDlg]     = useState<{ open: boolean; scheme: FabMarkScheme | null }>({ open: false, scheme: null });
  const [delScheme, setDelScheme] = useState<FabMarkScheme | null>(null);

  const fetchSchemes = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fabQuery<{ data: FabMarkScheme[] }>('fabErpMarkScheme', {
        orderBy: [{ field: 'sortOrder', direction: 'asc' }], pagination: { limit: 500 },
      });
      setSchemes(res.data ?? []);
    } catch (e) {
      setError(backendMessage(e, 'Failed to load mark schemes'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSchemes(); }, [fetchSchemes]);

  const categoryName = useCallback(
    (id: number) => categories.find((c) => c.id === id)?.name ?? `Category #${id}`,
    [categories],
  );

  const fallbackPrefix = schemes.find((s) => s.itemCategoryId === null)?.prefix;

  const columns: DataColumn<FabMarkScheme>[] = [
    {
      key: 'category',
      header: 'Category',
      render: (r) => (r.itemCategoryId === null
        ? <Box component="span" sx={{ color: 'var(--c-text-2)', fontStyle: 'italic' }}>{MARK_FALLBACK_LABEL}</Box>
        : categoryName(r.itemCategoryId)),
      // Empty string sorts the fallback to the top, where it reads as the
      // default the rest of the list is refining.
      sortValue: (r) => (r.itemCategoryId === null ? '' : categoryName(r.itemCategoryId)),
      exportValue: (r) => (r.itemCategoryId === null ? MARK_FALLBACK_LABEL : categoryName(r.itemCategoryId)),
    },
    { key: 'prefix',    header: 'Prefix',     render: (r) => <Mono chip>{r.prefix}</Mono>, sortValue: (r) => r.prefix },
    { key: 'sortOrder', header: 'Sort order', render: (r) => r.sortOrder, numeric: true, sortValue: (r) => r.sortOrder },
  ];

  const addBtn = canEdit ? (
    <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setDlg({ open: true, scheme: null })}>
      Add mark scheme
    </Button>
  ) : undefined;

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* The trap this tab exists to expose: a prefix is matched on the catalog
          row's category, so an uncategorised item never reaches any of these
          rows regardless of how carefully they are set up. */}
      <Alert severity={uncategorizedCount > 0 ? 'warning' : 'info'} sx={{ mb: 2 }}>
        {uncategorizedCount} catalog item{uncategorizedCount === 1 ? '' : 's'} ha{uncategorizedCount === 1 ? 's' : 've'} no
        category, so {uncategorizedCount === 1 ? 'it is' : 'they are'} marked with the fallback prefix{' '}
        <strong>{fallbackPrefix ?? MARK_BUILTIN_PREFIX}</strong>
        {fallbackPrefix ? '' : ` (built in — no fallback row is defined yet)`} rather than a prefix of their own.
      </Alert>

      {canEdit && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          {addBtn}
        </Box>
      )}

      {!loading && schemes.length === 0 ? (
        <EmptyState
          icon={<LabelRounded />}
          title="No mark schemes yet"
          hint={`Every piece mark currently uses the built-in prefix "${MARK_BUILTIN_PREFIX}" — ${MARK_BUILTIN_PREFIX}1, ${MARK_BUILTIN_PREFIX}2, ${MARK_BUILTIN_PREFIX}1-a.`}
          action={canEdit ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDlg({ open: true, scheme: null })}>
              Add first mark scheme
            </Button>
          ) : undefined}
        />
      ) : (
        <DataTable
          rows={schemes}
          columns={columns}
          getRowId={(r) => r.id}
          loading={loading}
          storageKey="mark-schemes"
          exportName="mark-schemes"
          defaultSortKey="sortOrder"
          rowActions={canEdit ? (row) => (
            <>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => setDlg({ open: true, scheme: row })} aria-label={`Edit prefix ${row.prefix}`}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="small" color="error" onClick={() => setDelScheme(row)} aria-label={`Delete prefix ${row.prefix}`}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          ) : undefined}
        />
      )}

      <MarkSchemeDialog
        open={dlg.open}
        initial={dlg.scheme}
        categories={categories}
        schemes={schemes}
        onClose={() => setDlg({ open: false, scheme: null })}
        onSaved={() => { setDlg({ open: false, scheme: null }); toast('Mark scheme saved'); fetchSchemes(); }}
      />
      <ConfirmDialog
        open={!!delScheme}
        title="Delete mark scheme"
        entityName={delScheme
          ? `${delScheme.prefix} — ${delScheme.itemCategoryId === null ? MARK_FALLBACK_LABEL : categoryName(delScheme.itemCategoryId)}`
          : undefined}
        body="Marks already assigned keep the prefix they were given; only future generation changes."
        onClose={() => setDelScheme(null)}
        onConfirm={async () => {
          await fabMutate('fabErpMarkScheme', 'delete', { id: delScheme!.id });
          setDelScheme(null);
          toast('Mark scheme deleted');
          fetchSchemes();
        }}
      />
    </Box>
  );
}
