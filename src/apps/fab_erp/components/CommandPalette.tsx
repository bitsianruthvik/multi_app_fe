import React, {
  useCallback, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { Box, InputBase, Modal } from '@mui/material';
import SearchRounded from '@mui/icons-material/SearchRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import BoltRounded from '@mui/icons-material/BoltRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import PeopleRounded from '@mui/icons-material/PeopleRounded';
import FactoryRounded from '@mui/icons-material/FactoryRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import BuildRounded from '@mui/icons-material/BuildRounded';
import WarehouseRounded from '@mui/icons-material/WarehouseRounded';
import { useNavigate } from 'react-router-dom';
import { fabGet } from '../api/client';
import { allEntries } from '../navMeta';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { PaletteContext } from './commandPaletteContext';
import { useCompanySlug } from '../hooks/useCompanySlug';

/**
 * ⌘K command palette (DESIGN_SYSTEM.md §3, §5.7-8).
 *
 * This is the accelerator that lets navigation stop growing. Before it, the
 * only global search was an inline box mounted on the Home page alone, so from
 * any of the other 29 screens there was no way to jump to a record at all.
 *
 * Three result groups, in this order because it matches intent frequency:
 *   1. Actions  — verbs, permission-gated ("New order", "Log past work")
 *   2. Go to    — every nav entry, straight from navMeta (one source of truth)
 *   3. Records  — live entity search via the existing /search endpoint
 *
 * Glass is allowed here: the palette panel and its scrim are one of exactly two
 * sanctioned glass surfaces (§5.3), because real content sits behind it.
 */

// ── Entity type → icon + route, mirroring the /search endpoint's `type` field ──
const TYPE_META: Record<string, { icon: ReactNode; label: string; route: (id: number) => string }> = {
  item:           { icon: <Inventory2Rounded />,    label: 'Item',     route: (id) => `item-catalog/${id}` },
  order:          { icon: <ReceiptLongRounded />,   label: 'Order',    route: (id) => `orders/${id}` },
  customer:       { icon: <PeopleRounded />,        label: 'Customer', route: () => 'customers' },
  plant:          { icon: <FactoryRounded />,       label: 'Plant',    route: () => 'plants' },
  bom:            { icon: <AccountTreeRounded />,   label: 'BOM',      route: () => 'item-catalog' },
  resource_type:  { icon: <BuildRounded />,         label: 'Resource', route: () => 'resource-types' },
  stock_location: { icon: <WarehouseRounded />,     label: 'Location', route: () => 'plants' },
};

interface SearchResult {
  id: number;
  name: string;
  code: string;
  detail: string | null;
  type: string;
  typeLabel: string;
}

/** A quick action. `permission` undefined = always available. */
interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  permission?: string;
  /** Route to navigate to, relative to /:company/fab_erp/. */
  slug: string;
}

const ACTIONS: PaletteAction[] = [
  { id: 'new-order',   label: 'New order',        hint: 'Capture a sales, purchase or work order', permission: 'fab_erp_projects_manage', slug: 'orders?new=1' },
  { id: 'new-item',    label: 'New item',         hint: 'Add a part to the catalog',               permission: 'fab_erp_items_meta_manage', slug: 'item-catalog?new=1' },
  { id: 'start-work',  label: 'Start work',       hint: 'Open the operator task queue',            permission: 'fab_erp_taskqueue_manage', slug: 'task-queue' },
  { id: 'reconcile',   label: 'Reconcile time',   hint: 'Resolve unaccounted machine time',        permission: 'fab_erp_machine_state_manage', slug: 'reconciliation' },
];

const RECENTS_KEY = 'fab_erp:palette:recents';
const MAX_RECENTS = 5;

interface Recent { slug: string; label: string }

function readRecents(): Recent[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as Recent[]).slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

function pushRecent(entry: Recent) {
  try {
    const next = [entry, ...readRecents().filter((r) => r.slug !== entry.slug)].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* recents are a nicety */
  }
}

type Item =
  | { kind: 'action'; id: string; label: string; hint?: string; slug: string }
  | { kind: 'nav'; id: string; label: string; hint?: string; slug: string }
  | { kind: 'recent'; id: string; label: string; slug: string }
  | { kind: 'record'; id: string; label: string; hint?: string; slug: string; type: string };

/**
 * Score a candidate against the query. Higher is better; 0 means no match.
 *
 * A plain subsequence match (the obvious first implementation) is far too
 * permissive on short queries: "span" subsequence-matches "Code generation"
 * via c-o-d-e-generation's s…p…a…n, which buried the real result. So matches
 * are scored by how they land, and anything weaker than a word-initial match
 * on the label is rejected.
 */
function score(label: string, extra: string, needle: string): number {
  if (!needle) return 1;
  const n = needle.toLowerCase().trim();
  const l = label.toLowerCase();

  if (l === n) return 100;
  if (l.startsWith(n)) return 90;
  if (l.includes(n)) return 70;

  // Word-initial match: "cg" → "Code generation", "ps" → "Progress stages".
  const initials = l.split(/\s+/).map((w) => w[0]).join('');
  if (initials.startsWith(n)) return 60;

  // Section name and keywords are weaker signals than the label itself.
  if (extra.toLowerCase().includes(n)) return 40;

  return 0;
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openPalette = useCallback(() => setOpen(true), []);

  // Global ⌘K / Ctrl+K. Bound once at the provider so it works on every screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ctx = useMemo(() => ({ open: openPalette }), [openPalette]);

  return (
    <PaletteContext.Provider value={ctx}>
      {children}
      <Palette open={open} onClose={() => setOpen(false)} />
    </PaletteContext.Provider>
  );
}

function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [records, setRecords] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const company = useCompanySlug();
  const isPermitted = useIsPermitted();
  const latest = useRef('');
  const listRef = useRef<HTMLDivElement>(null);

  // Reset on every open so the palette never greets you with a stale query.
  useEffect(() => {
    if (open) { setQ(''); setRecords([]); setCursor(0); setSearching(false); }
  }, [open]);

  // Debounced record search against the existing endpoint.
  useEffect(() => {
    latest.current = q;
    if (q.trim().length < 2) { setRecords([]); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await fabGet<{ results: SearchResult[] }>('search', { q: q.trim() });
        if (latest.current === q) setRecords(data.results ?? []);
      } catch {
        if (latest.current === q) setRecords([]); // search failing must not break navigation
      } finally {
        if (latest.current === q) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const groups = useMemo(() => {
    const term = q.trim();

    const actions: Item[] = ACTIONS
      .filter((a) => isPermitted(a.permission))
      .map((a) => ({ a, s: score(a.label, a.hint ?? '', term) }))
      .filter(({ s }) => s > 0)
      .sort((x, y) => y.s - x.s)
      .map(({ a }) => ({ kind: 'action' as const, id: a.id, label: a.label, hint: a.hint, slug: a.slug }));

    const navs: Item[] = allEntries()
      .filter(({ entry }) => isPermitted(entry.permission))
      .map((e) => ({
        e,
        s: score(e.entry.label, `${e.section.label} ${(e.entry.keywords ?? []).join(' ')}`, term),
      }))
      .filter(({ s }) => s > 0)
      .sort((x, y) => y.s - x.s)
      .map(({ e: { section, entry } }) => ({
        kind: 'nav' as const,
        id: `nav:${entry.slug}`,
        label: entry.label,
        hint: section.label,
        slug: entry.slug,
      }));

    const recs: Item[] = records.map((r) => ({
      kind: 'record' as const,
      id: `rec:${r.type}:${r.id}`,
      label: r.name || r.code,
      hint: [r.code, r.detail].filter(Boolean).join(' · ') || r.typeLabel,
      slug: (TYPE_META[r.type]?.route ?? (() => 'home'))(r.id),
      type: r.type,
    }));

    // With no query the palette is a launcher: recents first, then everything.
    const recents: Item[] = term
      ? []
      : readRecents().map((r) => ({ kind: 'recent' as const, id: `rct:${r.slug}`, label: r.label, slug: r.slug }));

    return [
      { title: 'Recent', icon: <HistoryRounded />, items: recents },
      { title: 'Actions', icon: <BoltRounded />, items: actions },
      { title: 'Go to', icon: <ArrowForwardRounded />, items: navs },
      { title: 'Records', icon: <SearchRounded />, items: recs },
    ].filter((g) => g.items.length > 0);
  }, [q, records, isPermitted]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Keep the cursor inside the list as results change under it.
  useEffect(() => {
    setCursor((c) => (flat.length === 0 ? 0 : Math.min(c, flat.length - 1)));
  }, [flat.length]);

  const run = useCallback(
    (item: Item) => {
      if (item.kind !== 'record') pushRecent({ slug: item.slug, label: item.label });
      navigate(`/${company}/fab_erp/${item.slug}`);
      onClose();
    },
    [company, navigate, onClose],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat[cursor]) run(flat[cursor]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  // Keep the highlighted row visible during keyboard traversal.
  useEffect(() => {
    listRef.current?.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  let runningIndex = -1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="fab-palette-label"
      sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', pt: '12vh', px: 2 }}
    >
      <Box
        className="glass"
        onKeyDown={onKeyDown}
        sx={{
          width: '100%',
          maxWidth: 620,
          borderRadius: 'var(--r-lg)',
          border: '1px solid var(--glass-border)',
          boxShadow: 'var(--e-3)',
          overflow: 'hidden',
          outline: 'none',
          animation: 'fab-palette-in 160ms var(--ease)',
          '@keyframes fab-palette-in': {
            from: { opacity: 0, transform: 'scale(.98)' },
            to: { opacity: 1, transform: 'scale(1)' },
          },
        }}
      >
        <Box
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, px: 2, height: 56,
            borderBottom: '1px solid var(--c-divider)',
          }}
        >
          <SearchRounded sx={{ fontSize: 20, color: 'var(--c-text-3)' }} aria-hidden />
          <InputBase
            id="fab-palette-label"
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setCursor(0); }}
            placeholder="Search orders, items, stock — or jump to a screen"
            inputProps={{ 'aria-label': 'Search or run a command' }}
            sx={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 15, color: 'var(--c-text)' }}
          />
          <Box
            sx={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-text-3)',
              border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', px: 0.75, py: 0.25,
            }}
          >
            esc
          </Box>
        </Box>

        <Box ref={listRef} role="listbox" sx={{ maxHeight: '52vh', overflowY: 'auto', py: 1 }}>
          {flat.length === 0 && (
            <Box sx={{ px: 2, py: 4, textAlign: 'center', fontSize: 13.5, color: 'var(--c-text-2)' }}>
              {searching
                ? 'Searching…'
                : q.trim().length === 1
                  ? 'Keep typing — records need two characters.'
                  : `Nothing matches “${q.trim()}”.`}
            </Box>
          )}

          {groups.map((group) => (
            <Box key={group.title}>
              <Box
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.75, px: 2, pt: 1, pb: 0.5,
                  fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
                  color: 'var(--c-text-3)', '& svg': { fontSize: 13 },
                }}
              >
                {group.icon}
                {group.title}
              </Box>
              {group.items.map((item) => {
                runningIndex += 1;
                const active = runningIndex === cursor;
                const idx = runningIndex;
                return (
                  <Box
                    key={item.id}
                    role="option"
                    aria-selected={active}
                    data-cursor={active}
                    onMouseMove={() => setCursor(idx)}
                    onClick={() => run(item)}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1.25, mx: 1, px: 1.5, py: 1,
                      borderRadius: 'var(--r-sm)', cursor: 'pointer',
                      background: active ? 'var(--c-primary-50)' : 'transparent',
                      color: active ? 'var(--c-primary-900)' : 'var(--c-text)',
                    }}
                  >
                    <Box sx={{ display: 'grid', placeItems: 'center', color: active ? 'var(--c-primary-600)' : 'var(--c-text-3)', '& svg': { fontSize: 18 } }}>
                      {item.kind === 'record'
                        ? TYPE_META[item.type]?.icon ?? <SearchRounded />
                        : item.kind === 'action'
                          ? <BoltRounded />
                          : item.kind === 'recent'
                            ? <HistoryRounded />
                            : <ArrowForwardRounded />}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.label}
                      </Box>
                      {'hint' in item && item.hint && (
                        <Box sx={{ fontSize: 12, color: 'var(--c-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.hint}
                        </Box>
                      )}
                    </Box>
                    {active && (
                      <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-primary-600)' }}>
                        ↵
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>
      </Box>
    </Modal>
  );
}
