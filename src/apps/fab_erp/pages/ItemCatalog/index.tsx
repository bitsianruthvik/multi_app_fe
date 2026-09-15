/**
 * ItemCatalog — company-wide parts / materials library.
 *
 * Split out of a single 2,654-line file (EU-16 item 1): this is now just the
 * page shell — tabs, the shared taxonomy state, and the dialogs that used to
 * all live in one component. Each tab and dialog has its own file in this
 * folder; `shared.ts` holds the handful of things more than one of them need.
 *
 * Page tabs: Items | Category | Group | Sub-group | Marks.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Tab, Tabs } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

import { fabQuery } from '../../api/client';
import type { CatalogItemRow } from '../../api/catalog';
import type { FabItemCategory, FabItemGroup, FabItemSubgroup } from '../../types';
import { usePermission } from '@core/hooks/usePermission';
import { useAuth } from '@core/contexts/AuthContext';
import { isAdminRole } from '@core/utils/roles';
import InfoTooltip, { type InfoContent } from '@shared/components/InfoTooltip';
import { PageHeader, useToast } from '../../components';

import { ItemsTab, type ItemsTabHandle } from './ItemsTab';
import { TaxonomyTab, AddTaxonomyDialog, TaxonomyDeleteDialog } from './TaxonomyTab';
import { CatalogDialog, DeleteDialog } from './CatalogDialog';
import { TaxonomyDetailDialog } from './TaxonomyDetailDialog';
import { MarkSchemesTab } from './FieldsTab';
import { ImporterControls } from './importer';

// ─── INFO TOOLTIP CONTENT ─────────────────────────────────────────────────────

const INFO_ITEMS: InfoContent = [
  { heading: 'What it is', items: ['Company-wide parts & materials library — every item that can appear in a BOM or order lives here.'] },
  {
    heading: 'How to use',
    items: [
      'Add Item — click the button, fill in Name, Code (auto-generated), and Unit of measure.',
      'Code is unique per company; it is auto-derived from the name but you can override it.',
      'Assign a Category / Group / Sub-group to keep items organised — you can create new taxonomy entries inline.',
      'Click any row to open the full detail view: BOM, stock levels, and custom fields.',
      'Export Template — downloads a fill-in Excel sheet with dropdown-validated Category/Group/Sub-group columns plus a reference of existing taxonomy names.',
      'Import Items — upload the filled template; any Category/Group/Sub-group name that does not exist yet is created automatically, preserving the parent relationship from the row.',
      'After import, download the import log — an Excel sheet listing every row, whether it was created or skipped, and why.',
    ],
  },
];
const INFO_CATEGORY: InfoContent = [
  { heading: 'What it is', items: ['Top-level classification for items (e.g. Raw Material, Assembly, Packing Material).'] },
  { heading: 'How to use', items: [
    'Create a category, then assign items to it from the Items tab or the item form.',
    'Custom fields defined on a category are inherited by all items in that category.',
    'Click a row to edit the description and manage inherited custom fields.',
  ] },
];
const INFO_GROUP: InfoContent = [
  { heading: 'What it is', items: ['Sub-division within a Category (e.g. Structural Steel inside Raw Material).'] },
  { heading: 'How to use', items: [
    'A Group must belong to one Category.',
    'Custom fields on a Group override the Category\'s fields for items in this Group.',
    'Click a row to edit and manage its custom fields.',
  ] },
];
const INFO_SUBGROUP: InfoContent = [
  { heading: 'What it is', items: ['Finest level of item taxonomy — sits inside a Group.'] },
  { heading: 'How to use', items: [
    'A Sub-group belongs to one Group.',
    'Custom fields are inherited from both Group and Category; you can override at any level.',
    'Items assigned to a Sub-group automatically inherit all ancestor custom fields.',
  ] },
];
const INFO_MARKS: InfoContent = [
  { heading: 'What it is', items: [
    'The prefix each category gets when piece marks are generated for an order — Beam → B gives top-level beams B1, B2, B3, and their children B1-a, B1-b.',
    'One row per category, plus at most one fallback row for everything else.',
  ] },
  { heading: 'How to use', items: [
    'Add a row, pick the category, and type the prefix that goes on the steel — a letter or two is what a paint pen can carry.',
    'A category can hold only one prefix; categories that already have one are greyed out in the dialog.',
    'Prefixes are matched on the item\'s catalog category, so an item with no category always takes the fallback prefix.',
    'With no scheme configured at all, every mark falls back to the built-in prefix "P".',
    'Editing a prefix does not renumber marks that are already assigned — generation only fills in blanks.',
  ] },
];

type TaxonomyDetailState = {
  level: 'category' | 'group' | 'subgroup';
  entity: FabItemCategory | FabItemGroup | FabItemSubgroup;
} | null;

type TaxonomyDeleteState = {
  type: 'category' | 'group' | 'subgroup';
  entity: FabItemCategory | FabItemGroup | FabItemSubgroup;
} | null;

export default function ItemCatalog() {
  // Admins bypass these tags on the BACKEND, so without OR-ing the role in
  // here an admin whose JWT predates the grant sees the tabs but no "Add
  // Field" button — the custom-fields editor looks deleted rather than
  // merely un-granted (§13 "usePermission has no admin bypass").
  const { user }          = useAuth();
  const admin             = isAdminRole(user?.role);
  const canManage         = usePermission('fab_erp_items_meta_manage') || admin;
  const canManageTaxonomy = usePermission('fab_erp_taxonomy_manage') || admin;
  const { toast } = useToast();
  const [pageTab, setPageTab] = useState(0);
  const [error, setError] = useState('');

  const itemsTabRef = useRef<ItemsTabHandle>(null);

  const [dlg,     setDlg]    = useState<{ open: boolean; item: CatalogItemRow | null }>({ open: false, item: null });
  const [delItem, setDelItem] = useState<CatalogItemRow | null>(null);
  const [taxonomyDetail, setTaxonomyDetail] = useState<TaxonomyDetailState>(null);
  const [addTaxonomyLevel, setAddTaxonomyLevel] = useState<'category' | 'group' | 'subgroup' | null>(null);
  const [taxonomyDelete, setTaxonomyDelete] = useState<TaxonomyDeleteState>(null);

  const [categories, setCategories] = useState<FabItemCategory[]>([]);
  const [groups,     setGroups]     = useState<FabItemGroup[]>([]);
  const [subgroups,  setSubgroups]  = useState<FabItemSubgroup[]>([]);

  /**
   * Just the count, not the rows — the Marks tab's warning needs how many
   * catalog items have no category, and that no longer requires loading the
   * whole catalog (`ItemsTab` now pages `GET /catalog/items` instead).
   */
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const fetchUncategorizedCount = useCallback(async () => {
    try {
      const res = await fabQuery<{ total?: number; data: unknown[] }>('fabErpItemCatalog', {
        filters: { categoryId: null }, pagination: { limit: 1 }, includeTotal: true,
      });
      setUncategorizedCount(res.total ?? 0);
    } catch { /* the Marks tab's banner just shows 0 until this succeeds */ }
  }, []);

  const refetchTaxonomy = useCallback(async () => {
    try {
      const [catRes, grpRes, subRes] = await Promise.all([
        fabQuery<{ data: FabItemCategory[] }>('fabErpItemCategory', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 5000 } }),
        fabQuery<{ data: FabItemGroup[] }>('fabErpItemGroup',       { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 5000 } }),
        fabQuery<{ data: FabItemSubgroup[] }>('fabErpItemSubgroup', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 5000 } }),
      ]);
      setCategories(catRes.data ?? []);
      setGroups(grpRes.data ?? []);
      setSubgroups(subRes.data ?? []);
    } catch { /* supplementary — ignore */ }
  }, []);

  useEffect(() => { refetchTaxonomy(); fetchUncategorizedCount(); }, [refetchTaxonomy, fetchUncategorizedCount]);

  function refreshItems() {
    itemsTabRef.current?.refresh();
    fetchUncategorizedCount();
  }

  function onSaved(code?: string) {
    setDlg({ open: false, item: null });
    toast(code ? `Item created — code: ${code}` : 'Saved.');
    refreshItems();
  }
  function onDeleted() { setDelItem(null); toast('Removed.'); refreshItems(); }

  const handleTaxonomyRowClick = (
    level: 'category' | 'group' | 'subgroup',
    entity: FabItemCategory | FabItemGroup | FabItemSubgroup,
  ) => setTaxonomyDetail({ level, entity });

  return (
    <Box>
      <PageHeader
        title="Item Catalog"
        subtitle="Reusable parts and materials — pick from here when building a project BOM"
        actions={pageTab === 0 && canManage ? (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <ImporterControls onImported={refreshItems} />
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDlg({ open: true, item: null })}>
              Add item
            </Button>
          </Box>
        ) : undefined}
      />

      <Tabs value={pageTab} onChange={(_, v) => setPageTab(v)} sx={{ mb: 3, borderBottom: '1px solid var(--c-divider)' }}>
        <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>Items<InfoTooltip content={INFO_ITEMS} placement="bottom" /></Box>} />
        <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>Category<InfoTooltip content={INFO_CATEGORY} placement="bottom" /></Box>} />
        <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>Group<InfoTooltip content={INFO_GROUP} placement="bottom" /></Box>} />
        <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>Sub-group<InfoTooltip content={INFO_SUBGROUP} placement="bottom" /></Box>} />
        {canManageTaxonomy && (
          <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>Marks<InfoTooltip content={INFO_MARKS} placement="bottom" /></Box>} />
        )}
      </Tabs>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {pageTab === 0 && (
        <ItemsTab
          ref={itemsTabRef}
          canManage={canManage}
          categories={categories} groups={groups} subgroups={subgroups}
          onAdd={() => setDlg({ open: true, item: null })}
          onEdit={(item) => setDlg({ open: true, item })}
          onDelete={(item) => setDelItem(item)}
        />
      )}

      {pageTab === 1 && (
        <TaxonomyTab
          level="category" categories={categories} groups={groups} subgroups={subgroups}
          canEdit={canManageTaxonomy}
          onRowClick={(c) => handleTaxonomyRowClick('category', c)}
          onAddClick={() => setAddTaxonomyLevel('category')}
          onDeleteClick={(c) => setTaxonomyDelete({ type: 'category', entity: c })}
        />
      )}
      {pageTab === 2 && (
        <TaxonomyTab
          level="group" categories={categories} groups={groups} subgroups={subgroups}
          canEdit={canManageTaxonomy}
          onRowClick={(g) => handleTaxonomyRowClick('group', g)}
          onAddClick={() => setAddTaxonomyLevel('group')}
          onDeleteClick={(g) => setTaxonomyDelete({ type: 'group', entity: g })}
        />
      )}
      {pageTab === 3 && (
        <TaxonomyTab
          level="subgroup" categories={categories} groups={groups} subgroups={subgroups}
          canEdit={canManageTaxonomy}
          onRowClick={(s) => handleTaxonomyRowClick('subgroup', s)}
          onAddClick={() => setAddTaxonomyLevel('subgroup')}
          onDeleteClick={(s) => setTaxonomyDelete({ type: 'subgroup', entity: s })}
        />
      )}
      {pageTab === 4 && canManageTaxonomy && (
        <MarkSchemesTab categories={categories} uncategorizedCount={uncategorizedCount} canEdit={canManageTaxonomy} />
      )}

      {/* ── Dialogs ── */}
      <CatalogDialog
        open={dlg.open} initial={dlg.item}
        categories={categories} groups={groups} subgroups={subgroups}
        canManageTaxonomy={canManageTaxonomy}
        onClose={() => setDlg({ open: false, item: null })}
        onSaved={onSaved}
        refetchTaxonomy={refetchTaxonomy}
      />
      <DeleteDialog
        item={delItem}
        onClose={() => setDelItem(null)}
        onDeleted={onDeleted}
        onError={setError}
      />

      {taxonomyDetail && (
        <TaxonomyDetailDialog
          level={taxonomyDetail.level}
          entity={taxonomyDetail.entity}
          categories={categories}
          groups={groups}
          canEdit={canManageTaxonomy}
          canEditFields={canManage}
          onClose={() => setTaxonomyDetail(null)}
          onSaved={async () => { await refetchTaxonomy(); toast('Saved.'); }}
        />
      )}

      <AddTaxonomyDialog
        open={addTaxonomyLevel !== null}
        level={addTaxonomyLevel ?? 'category'}
        categories={categories}
        groups={groups}
        onClose={() => setAddTaxonomyLevel(null)}
        onCreated={async () => { await refetchTaxonomy(); setAddTaxonomyLevel(null); toast('Added.'); }}
      />

      <TaxonomyDeleteDialog
        open={taxonomyDelete !== null}
        type={taxonomyDelete?.type ?? null}
        entity={taxonomyDelete?.entity ?? null}
        groups={groups}
        subgroups={subgroups}
        onClose={() => setTaxonomyDelete(null)}
        onDeleted={async () => { setTaxonomyDelete(null); await refetchTaxonomy(); refreshItems(); }}
        setToast={toast}
      />
    </Box>
  );
}
