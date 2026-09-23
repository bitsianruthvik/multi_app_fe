import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Box, InputBase, Modal } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import SearchRounded from '@mui/icons-material/SearchRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import BoltRounded from '@mui/icons-material/BoltRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import PeopleRounded from '@mui/icons-material/PeopleRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import TimerRounded from '@mui/icons-material/TimerRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import WarehouseRounded from '@mui/icons-material/WarehouseRounded';
import LayersRounded from '@mui/icons-material/LayersRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import { cfApi, qs } from '../api/client';
import { allScreens } from '../navMeta';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useCompanySlug } from '../hooks/useLoad';
import { PaletteContext } from './commandPaletteContext';

/**
 * ⌘K command palette (DESIGN_SYSTEM.md §3, §5.7-8) — fab_erp's palette for
 * cf_erp. Groups, in the order of how often they are wanted: recents (with no
 * query), actions, go to a screen (straight from navMeta), and records from
 * GET /search. The panel and its scrim are one of the two sanctioned glass
 * surfaces (§5.3).
 */
const TYPE_ICON: Record<string, ReactNode> = {
  order: <ReceiptLongRounded />, item: <Inventory2Rounded />, definition: <AccountTreeRounded />, machine: <PrecisionManufacturingRounded />,
  operation: <TimerRounded />, flow: <RouteRounded />, batch: <LayersRounded />, movement: <SwapHorizRounded />, area: <WarehouseRounded />, party: <PeopleRounded />,
};

interface SearchResult { type: string; id: number; code: string | null; name: string; detail: string | null; route: string }
interface PaletteAction { id: string; label: string; hint?: string; permission?: string; slug: string }

const ACTIONS: PaletteAction[] = [
  { id: 'new-order', label: 'New order', hint: 'An inquiry, or a stock order', permission: 'cf_erp_orders_manage', slug: 'orders?new=1' },
  { id: 'new-item', label: 'New item', hint: 'Add an item to the catalog', permission: 'cf_erp_catalog_manage', slug: 'items?new=1' },
  { id: 'receive', label: 'Receive stock', hint: 'Post a receipt into a stocking area', permission: 'cf_erp_inventory_manage', slug: 'stock?new=receipt' },
  { id: 'new-machine', label: 'New machine', hint: 'Add a machine on its machine type', permission: 'cf_erp_production_manage', slug: 'machines?new=1' },
  { id: 'new-flow', label: 'New flow', hint: 'Put operations in order', permission: 'cf_erp_production_manage', slug: 'flows?new=1' },
  { id: 'new-customer', label: 'New customer', hint: 'Or a supplier', permission: 'cf_erp_parties_manage', slug: 'customers?new=1' },
];

const RECENTS_KEY = 'cf_erp:palette:recents';
interface Recent { slug: string; label: string }
function readRecents(): Recent[] {
  try { const raw = localStorage.getItem(RECENTS_KEY); return raw ? (JSON.parse(raw) as Recent[]).slice(0, 5) : []; } catch { return []; }
}
function pushRecent(entry: Recent) {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify([entry, ...readRecents().filter((r) => r.slug !== entry.slug)].slice(0, 5))); } catch { /* a nicety */ }
}

type Item =
  | { kind: 'action' | 'nav'; id: string; label: string; hint?: string; slug: string }
  | { kind: 'recent'; id: string; label: string; slug: string }
  | { kind: 'record'; id: string; label: string; hint?: string; slug: string; type: string };

/** How well a candidate matches; 0 = no match. Word-initial is the weakest match accepted on a label. */
function score(label: string, extra: string, needle: string): number {
  if (!needle) return 1;
  const n = needle.toLowerCase().trim();
  const l = label.toLowerCase();
  if (l === n) return 100;
  if (l.startsWith(n)) return 90;
  if (l.includes(n)) return 70;
  if (l.split(/\s+/).map((w) => w[0]).join('').startsWith(n)) return 60;
  if (extra.toLowerCase().includes(n)) return 40;
  return 0;
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openPalette = useCallback(() => setOpen(true), []);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v); }
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

  useEffect(() => { if (open) { setQ(''); setRecords([]); setCursor(0); setSearching(false); } }, [open]);

  useEffect(() => {
    latest.current = q;
    if (q.trim().length < 2) { setRecords([]); setSearching(false); return undefined; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await cfApi.get<{ results: SearchResult[] }>(`/search${qs({ q: q.trim() })}`);
        if (latest.current === q) setRecords(data.results ?? []);
      } catch {
        if (latest.current === q) setRecords([]);
      } finally {
        if (latest.current === q) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const groups = useMemo(() => {
    const term = q.trim();
    const actions: Item[] = ACTIONS.filter((a) => isPermitted(a.permission))
      .map((a) => ({ a, s: score(a.label, a.hint ?? '', term) })).filter(({ s }) => s > 0).sort((x, y) => y.s - x.s)
      .map(({ a }) => ({ kind: 'action' as const, id: a.id, label: a.label, hint: a.hint, slug: a.slug }));
    const navs: Item[] = allScreens().filter(({ screen }) => isPermitted(screen.permission))
      .map((e) => ({ e, s: score(e.screen.label, `${e.section.label} ${(e.screen.keywords ?? []).join(' ')}`, term) }))
      .filter(({ s }) => s > 0).sort((x, y) => y.s - x.s)
      .map(({ e: { section, screen } }) => ({ kind: 'nav' as const, id: `nav:${screen.path}`, label: screen.label, hint: section.label === screen.label ? undefined : section.label, slug: screen.path }));
    const recs: Item[] = records.map((r) => ({
      kind: 'record' as const, id: `rec:${r.type}:${r.id}`, label: r.name || r.code || '—',
      hint: [r.code !== r.name ? r.code : null, r.detail].filter(Boolean).join(' · '), slug: r.route, type: r.type,
    }));
    const recents: Item[] = term ? [] : readRecents().map((r) => ({ kind: 'recent' as const, id: `rct:${r.slug}`, label: r.label, slug: r.slug }));
    return [
      { title: 'Recent', icon: <HistoryRounded />, items: recents },
      { title: 'Actions', icon: <BoltRounded />, items: actions },
      { title: 'Go to', icon: <ArrowForwardRounded />, items: navs },
      { title: 'Records', icon: <SearchRounded />, items: recs },
    ].filter((g) => g.items.length > 0);
  }, [q, records, isPermitted]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  useEffect(() => { setCursor((c) => (flat.length === 0 ? 0 : Math.min(c, flat.length - 1))); }, [flat.length]);

  const run = useCallback((item: Item) => {
    if (item.kind !== 'record') pushRecent({ slug: item.slug, label: item.label });
    navigate(`/${company}/cf_erp/${item.slug}`);
    onClose();
  }, [company, navigate, onClose]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat[cursor]) run(flat[cursor]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };
  useEffect(() => { listRef.current?.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' }); }, [cursor]);

  let runningIndex = -1;
  return (
    <Modal open={open} onClose={onClose} aria-labelledby="cf-palette-label" sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', pt: '12vh', px: 2 }}>
      <Box className="glass" onKeyDown={onKeyDown} sx={{
        width: '100%', maxWidth: 620, borderRadius: 'var(--r-lg)', border: '1px solid var(--glass-border)', boxShadow: 'var(--e-3)', overflow: 'hidden', outline: 'none',
        animation: 'cf-palette-in 160ms var(--ease)', '@keyframes cf-palette-in': { from: { opacity: 0, transform: 'scale(.98)' }, to: { opacity: 1, transform: 'scale(1)' } },
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, height: 56, borderBottom: '1px solid var(--c-divider)' }}>
          <SearchRounded sx={{ fontSize: 20, color: 'var(--c-text-3)' }} aria-hidden />
          <InputBase id="cf-palette-label" autoFocus value={q} onChange={(e) => { setQ(e.target.value); setCursor(0); }}
            placeholder="Search orders, items, machines, stock — or jump to a screen" inputProps={{ 'aria-label': 'Search or run a command' }}
            sx={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 15, color: 'var(--c-text)' }} />
          <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-text-3)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', px: 0.75, py: 0.25 }}>esc</Box>
        </Box>
        <Box ref={listRef} role="listbox" sx={{ maxHeight: '52vh', overflowY: 'auto', py: 1 }}>
          {flat.length === 0 && (
            <Box sx={{ px: 2, py: 4, textAlign: 'center', fontSize: 13.5, color: 'var(--c-text-2)' }}>
              {searching ? 'Searching…' : q.trim().length === 1 ? 'Keep typing — records need two characters.' : `Nothing matches “${q.trim()}”.`}
            </Box>
          )}
          {groups.map((group) => (
            <Box key={group.title}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 2, pt: 1, pb: 0.5, fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', '& svg': { fontSize: 13 } }}>
                {group.icon}{group.title}
              </Box>
              {group.items.map((item) => {
                runningIndex += 1;
                const active = runningIndex === cursor;
                const idx = runningIndex;
                return (
                  <Box key={item.id} role="option" aria-selected={active} data-cursor={active} onMouseMove={() => setCursor(idx)} onClick={() => run(item)}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mx: 1, px: 1.5, py: 1, borderRadius: 'var(--r-sm)', cursor: 'pointer', background: active ? 'var(--c-primary-50)' : 'transparent', color: active ? 'var(--c-primary-900)' : 'var(--c-text)' }}>
                    <Box sx={{ display: 'grid', placeItems: 'center', color: active ? 'var(--c-primary-600)' : 'var(--c-text-3)', '& svg': { fontSize: 18 } }}>
                      {item.kind === 'record' ? TYPE_ICON[item.type] ?? <SearchRounded /> : item.kind === 'action' ? <BoltRounded /> : item.kind === 'recent' ? <HistoryRounded /> : <ArrowForwardRounded />}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</Box>
                      {'hint' in item && item.hint && <Box sx={{ fontSize: 12, color: 'var(--c-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.hint}</Box>}
                    </Box>
                    {active && <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-primary-600)' }}>↵</Box>}
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
