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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Tab, Tabs, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

import { fabQuery } from '../../api/client';
import type { CatalogItemRow, ItemKind } from '../../api/catalog';
import { getTaxonomyCounts, type TaxonomyCounts } from '../../api/catalogDetail';
import type { FabItemCategory, FabItemGroup, FabItemSubgroup } from '../../types';
import { usePermission } from '@core/hooks/usePermission';
import { useAuth } from '@core/contexts/AuthContext';
import { isAdminRole } from '@core/utils/roles';
import InfoTooltip, { type InfoContent } from '@shared/components/InfoTooltip';
import { FacetChip, PageHeader, useToast } from '../../components';

import { ItemsTab, type ItemsTabHandle } from './ItemsTab';
import { AddTaxonomyDialog, TaxonomyDeleteDialog } from './TaxonomyTab';
import { TaxonomyTree, type TaxonomyAddTarget, type TaxonomyEntity, type TaxonomyLevel } from './TaxonomyTree';
import { CatalogDialog, DeleteDialog } from './CatalogDialog';
import { TaxonomyDetailDialog } from './TaxonomyDetailDialog';
import { ImporterControls } from './importer';

// ─── INFO TOOLTIP CONTENT ─────────────────────────────────────────────────────

const INFO_CATALOG: InfoContent = [
  { heading: 'Catalog', items: [
    'Things with a size of their own that you buy, receive and keep in stock: plates, sections, studs, standard stiffeners, machines, spares, consumables.',
    'Add an item with a name and a category; the code is worked out from the Items rule unless you type one.',
    'Click a row to see where it is used, what is in stock, and what has been bought.',
  ] },
];
const INFO_NON_CATALOG: InfoContent = [
  { heading: 'Non-catalog', items: [
    'Templates: the spans, girders, segments and parts an order is built from. They get their sizes on the order, and are never bought or received.',
    'Cut plates: the rectangles cut from plate for one order. Nesting makes them; they are never bought.',
    'Neither can be received into stock or put on a purchase order — the shop makes them.',
  ] },
];

/** The page's tabs, as they appear in the URL (`?tab=`), so a link or the Back button lands on the right one. */
const TABS = ['catalog', 'non-catalog', 'taxonomy'] as const;
type PageTab = typeof TABS[number];
/** The Non-catalog tab's two lists (`?list=`). */
type NonCatalogList = 'template' | 'cutplate';
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
  const [params, setParams] = useSearchParams();
  const pageTab: PageTab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? params.get('tab') as PageTab : 'catalog';
  const ncList: NonCatalogList = params.get('list') === 'cutplate' ? 'cutplate' : 'template';
  const listKind: ItemKind = pageTab === 'non-catalog' ? ncList : 'catalog';
  /** Which half of the taxonomy the Taxonomy tab shows (`?kind=non-catalog`). */
  const taxKind: 'catalog' | 'non-catalog' = params.get('kind') === 'non-catalog' ? 'non-catalog' : 'catalog';
  const go = (tab: PageTab, list?: NonCatalogList, kind?: 'catalog' | 'non-catalog') => {
    const next = new URLSearchParams();
    if (tab !== 'catalog') next.set('tab', tab);
    if (tab === 'non-catalog' && list === 'cutplate') next.set('list', 'cutplate');
    if (tab === 'taxonomy' && kind === 'non-catalog') next.set('kind', 'non-catalog');
    setParams(next, { replace: true });
  };
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
  /** The Taxonomy tab's half: categories whose new items start catalog, or non-catalog. */
  const taxCategories = useMemo(
    () => categories.filter((c) => (Number(c.defaultCataloged ?? 1) === 0) === (taxKind === 'non-catalog')),
    [categories, taxKind],
  );
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
    toast(code ? `Created — code: ${code}` : 'Saved.');
    refreshItems();
  }
  function onDeleted() { setDelItem(null); toast('Removed.'); refreshItems(); }

  // Cut plates are made by nesting an order, never typed in — no Add there.
  const addLabel = listKind === 'catalog' ? 'Add item' : listKind === 'template' ? 'Add template part' : null;
  const tabLabel = (text: string, info: InfoContent) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>{text}<InfoTooltip content={info} placement="bottom" /></Box>
  );

  return (
    <Box>
      <PageHeader
        title="Items"
        subtitle="Catalog items are bought and stocked. Non-catalog items are templates and cut plates, made on an order."
      />

      <Tabs value={pageTab} onChange={(_, v: PageTab) => go(v)} sx={{ mb: 2, borderBottom: '1px solid var(--c-divider)' }}>
        <Tab value="catalog" label={tabLabel('Catalog', INFO_CATALOG)} />
        <Tab value="non-catalog" label={tabLabel('Non-catalog', INFO_NON_CATALOG)} />
        <Tab value="taxonomy" label={tabLabel('Taxonomy', INFO_TAXONOMY)} />
      </Tabs>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/*
        THE TAB'S OWN BAR, under the tab row: what this list is (Non-catalog's
        Templates / Cut plates), and what you can add to IT. The Add button used
        to sit in the page header, where it read as belonging to the page rather
        than to the list you were looking at.
      */}
      {pageTab !== 'taxonomy' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          {pageTab === 'non-catalog' && (
            <>
              <FacetChip label="Templates" active={ncList === 'template'} onClick={() => go('non-catalog', 'template')} />
              <FacetChip label="Cut plates" active={ncList === 'cutplate'} onClick={() => go('non-catalog', 'cutplate')} />
            </>
          )}
          <Box sx={{ flex: 1 }} />
          {canManage && listKind === 'catalog' && <ImporterControls onImported={refreshItems} />}
          {canManage && addLabel && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDlg({ open: true, item: null })}>
              {addLabel}
            </Button>
          )}
          {listKind === 'cutplate' && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Cut plates are made by nesting an order — nothing to add here.</Typography>
          )}
        </Box>
      )}

      {/* The taxonomy, split the same way: catalog categories, or the non-catalog ones (Fabricated, Cut Plates). */}
      {pageTab === 'taxonomy' && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <FacetChip label="Catalog categories" active={taxKind === 'catalog'} onClick={() => go('taxonomy', undefined, 'catalog')} />
          <FacetChip label="Non-catalog categories" active={taxKind === 'non-catalog'} onClick={() => go('taxonomy', undefined, 'non-catalog')} />
        </Box>
      )}

      {pageTab !== 'taxonomy' && (
        <ItemsTab
          // A fresh grid per list: filters that make sense on one (grade, a
          // thickness range) would silently empty another.
          key={listKind}
          ref={itemsTabRef}
          kind={listKind}
          canManage={canManage}
          categories={categories} groups={groups} subgroups={subgroups}
          onAdd={addLabel ? () => setDlg({ open: true, item: null }) : undefined}
          onEdit={(item) => setDlg({ open: true, item })}
          onDelete={(item) => setDelItem(item)}
        />
      )}

      {pageTab === 'taxonomy' && (
        <TaxonomyTree
          categories={taxCategories} groups={groups} subgroups={subgroups}
          counts={counts}
          canEdit={canManageTaxonomy}
          onNodeClick={(level, entity) => setTaxonomyDetail({ level, entity })}
          onAddClick={(target) => setAddTaxonomy(target)}
          onDeleteClick={(type, entity) => setTaxonomyDelete({ type, entity })}
        />
      )}

      {/* ── Dialogs ── */}
      <CatalogDialog
        open={dlg.open} initial={dlg.item} kind={listKind}
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
        categories={taxCategories}
        nonCatalog={taxKind === 'non-catalog'}
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
