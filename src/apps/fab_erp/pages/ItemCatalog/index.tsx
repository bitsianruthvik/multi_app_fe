/**
 * ItemCatalog — company-wide parts / materials library.
 *
 * Split out of a single 2,654-line file (EU-16 item 1): this is now just the
 * page shell — tabs, the shared taxonomy state, and the dialogs that used to
 * all live in one component. Each tab and dialog has its own file in this
 * folder; `shared.ts` holds the handful of things more than one of them need.
 *
 * Page tabs: Items | Taxonomy. The taxonomy is one tree (Category → Group →
 * Sub-group) rather than three flat tabs, and the Marks tab is gone — the
 * mark-scheme panel that consumed it is no longer mounted anywhere.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Tab, Tabs } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

import { fabQuery } from '../../api/client';
import type { CatalogItemRow } from '../../api/catalog';
import { getTaxonomyCounts, type TaxonomyCounts } from '../../api/catalogDetail';
import type { FabItemCategory, FabItemGroup, FabItemSubgroup } from '../../types';
import { usePermission } from '@core/hooks/usePermission';
import { useAuth } from '@core/contexts/AuthContext';
import { isAdminRole } from '@core/utils/roles';
import InfoTooltip, { type InfoContent } from '@shared/components/InfoTooltip';
import { PageHeader, useToast } from '../../components';

import { ItemsTab, type ItemsTabHandle } from './ItemsTab';
import { AddTaxonomyDialog, TaxonomyDeleteDialog } from './TaxonomyTab';
import { TaxonomyTree, type TaxonomyAddTarget, type TaxonomyEntity, type TaxonomyLevel } from './TaxonomyTree';
import { CatalogDialog, DeleteDialog } from './CatalogDialog';
import { TaxonomyDetailDialog } from './TaxonomyDetailDialog';
import { ImporterControls } from './importer';

// ─── INFO TOOLTIP CONTENT ─────────────────────────────────────────────────────

const INFO_ITEMS: InfoContent = [
  { heading: 'Items', items: [
    'Every part and material the company uses lives here. A BOM or an order picks from this list.',
    'Add an item with a name and a category; the code is worked out from the Items rule unless you type one.',
    'Click a row to see where it is used, what is in stock, and what has been bought.',
  ] },
];
const INFO_TAXONOMY: InfoContent = [
  { heading: 'Taxonomy', items: [
    'A category is the top level. Everything in it inherits the category\'s fields.',
    'A group sits inside a category and a sub-group inside a group. Each can add or override fields for what is below it.',
    'Click a node to edit it. A node with items on it cannot be deleted until they are moved.',
  ] },
];

type TaxonomyDetailState = { level: TaxonomyLevel; entity: TaxonomyEntity } | null;
type TaxonomyDeleteState = { type: TaxonomyLevel; entity: TaxonomyEntity } | null;

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
  const [addTaxonomy, setAddTaxonomy] = useState<TaxonomyAddTarget | null>(null);
  const [taxonomyDelete, setTaxonomyDelete] = useState<TaxonomyDeleteState>(null);

  const [categories, setCategories] = useState<FabItemCategory[]>([]);
  const [groups,     setGroups]     = useState<FabItemGroup[]>([]);
  const [subgroups,  setSubgroups]  = useState<FabItemSubgroup[]>([]);
  /** Items per node, for the tree's "N items". Null until the first fetch lands. */
  const [counts, setCounts] = useState<TaxonomyCounts | null>(null);

  const refetchCounts = useCallback(async () => {
    try { setCounts(await getTaxonomyCounts()); } catch { /* the tree shows 0s until this succeeds */ }
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

  useEffect(() => { refetchTaxonomy(); refetchCounts(); }, [refetchTaxonomy, refetchCounts]);

  function refreshItems() {
    itemsTabRef.current?.refresh();
    refetchCounts();
  }

  function onSaved(code?: string) {
    setDlg({ open: false, item: null });
    toast(code ? `Item created — code: ${code}` : 'Saved.');
    refreshItems();
  }
  function onDeleted() { setDelItem(null); toast('Removed.'); refreshItems(); }

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
        <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>Taxonomy<InfoTooltip content={INFO_TAXONOMY} placement="bottom" /></Box>} />
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
        <TaxonomyTree
          categories={categories} groups={groups} subgroups={subgroups}
          counts={counts}
          canEdit={canManageTaxonomy}
          onNodeClick={(level, entity) => setTaxonomyDetail({ level, entity })}
          onAddClick={(target) => setAddTaxonomy(target)}
          onDeleteClick={(type, entity) => setTaxonomyDelete({ type, entity })}
        />
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
        open={addTaxonomy !== null}
        level={addTaxonomy?.level ?? 'category'}
        categories={categories}
        groups={groups}
        defaultCategoryId={addTaxonomy?.categoryId ?? null}
        defaultGroupId={addTaxonomy?.groupId ?? null}
        onClose={() => setAddTaxonomy(null)}
        onCreated={async () => { await refetchTaxonomy(); setAddTaxonomy(null); toast('Added.'); }}
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
