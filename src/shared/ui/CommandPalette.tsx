import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Box, InputBase, Modal } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import SearchRounded from '@mui/icons-material/SearchRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import BoltRounded from '@mui/icons-material/BoltRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import { PaletteContext } from './commandPaletteContext';
import { useIsPermitted } from './hooks/useIsPermitted';
import { useCompanySlug } from './hooks/useCompanySlug';
import { readPref, writePref } from './storage';
import { allScreens, appPath, screenKey, type Can, type NavSection } from './types';

/**
 * ⌘K command palette (DESIGN_SYSTEM.md §3, §5.7-8).
 *
 * This is the accelerator that lets navigation stop growing: without it, the
 * only way to reach a record from an unrelated screen is to navigate to its
 * list and search there. Four result groups, in the order intent actually
 * arrives:
 *   1. Recent   — with no query, the palette is a launcher
 *   2. Actions  — verbs, permission-gated ("New order", "Log time")
 *   3. Go to    — every nav screen, straight from the app's navMeta
 *   4. Records  — live entity search, if the app supplies a search function
 *
 * Glass is allowed here: the palette panel and its scrim are one of exactly two
 * sanctioned glass surfaces (§5.3), because real content sits behind it.
 *
 * The kit knows nothing about any app's records. An app passes `searchRecords`
 * (its own endpoint) and optionally `recordIcon`; if it passes neither, the
 * palette is still a complete navigator.
 */

/** A quick action. Either goes somewhere (`path`) or runs something here (`run`). */
export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  /** feature_tag gate; undefined = always available. */
  permission?: string;
  /** Route under /:company/:appSlug/ — may carry a query, e.g. `orders?new=1`. */
  path?: string;
  /** Opens a dialog or runs something in place. Takes precedence over `path`. */
  run?: () => void;
}

/** One record from the app's own search endpoint. */
export interface PaletteRecord {
  id: string | number;
  /** Entity type — passed back to `recordIcon`. */
  type: string;
  label: string;
  hint?: string;
  /** Route under /:company/:appSlug/ that opens it. */
  path: string;
}

interface Recent {
  path: string;
  label: string;
}

const MAX_RECENTS = 5;

function readRecents(): Recent[] {
  return readPref<Recent[]>('palette:recents', []).slice(0, MAX_RECENTS);
}

function pushRecent(entry: Recent) {
  const next = [entry, ...readRecents().filter((r) => r.path !== entry.path)].slice(0, MAX_RECENTS);
  writePref('palette:recents', next);
}

type Item =
  | { kind: 'action'; id: string; label: string; hint?: string; path?: string; run?: () => void }
  | { kind: 'nav'; id: string; label: string; hint?: string; path: string }
  | { kind: 'recent'; id: string; label: string; path: string }
  | { kind: 'record'; id: string; label: string; hint?: string; path: string; type: string };

/**
 * Score a candidate against the query. Higher is better; 0 means no match.
 *
 * A plain subsequence match — the obvious first implementation — is far too
 * permissive on short queries: "span" subsequence-matches "Code generation",
 * burying the real result. So matches are scored by how they land, and anything
 * weaker than a word-initial match on the label is rejected.
 */
function score(label: string, extra: string, needle: string): number {
  if (!needle) return 1;
  const n = needle.toLowerCase().trim();
  const l = label.toLowerCase();

  if (l === n) return 100;
  if (l.startsWith(n)) return 90;
  if (l.includes(n)) return 70;

  // Word-initial match: "cg" → "Code generation", "ps" → "Progress stages".
  const initials = l
    .split(/\s+/)
    .map((w) => w[0])
    .join('');
  if (initials.startsWith(n)) return 60;

  // Section name and keywords are weaker signals than the label itself.
  if (extra.toLowerCase().includes(n)) return 40;

  return 0;
}

export interface CommandPaletteProviderProps {
  appSlug: string;
  sections: NavSection[];
  children: ReactNode;
  actions?: PaletteAction[];
  /** The app's record search. Called with a trimmed query of ≥2 characters. */
  searchRecords?: (query: string) => Promise<PaletteRecord[]>;
  /** An icon per record `type`. Falls back to a magnifier. */
  recordIcon?: (type: string) => ReactNode;
  placeholder?: string;
  /** Defaults to the shared `useIsPermitted()` predicate. */
  can?: Can;
}

export function CommandPaletteProvider({
  appSlug,
  sections,
  children,
  actions = [],
  searchRecords,
  recordIcon,
  placeholder = 'Search records — or jump to a screen',
  can,
}: CommandPaletteProviderProps) {
  const [open, setOpen] = useState(false);
  const openPalette = useCallback(() => setOpen(true), []);

  // Global ⌘K / Ctrl+K, bound once at the provider so it works on every screen.
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
      <Palette
        open={open}
        onClose={() => setOpen(false)}
        appSlug={appSlug}
        sections={sections}
        actions={actions}
        searchRecords={searchRecords}
        recordIcon={recordIcon}
        placeholder={placeholder}
        can={can}
      />
    </PaletteContext.Provider>
  );
}

function Palette({
  open,
  onClose,
  appSlug,
  sections,
  actions,
  searchRecords,
  recordIcon,
  placeholder,
  can,
}: {
  open: boolean;
  onClose: () => void;
  appSlug: string;
  sections: NavSection[];
  actions: PaletteAction[];
  searchRecords?: (query: string) => Promise<PaletteRecord[]>;
  recordIcon?: (type: string) => ReactNode;
  placeholder: string;
  can?: Can;
}) {
  const [q, setQ] = useState('');
  const [records, setRecords] = useState<PaletteRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const company = useCompanySlug();
  const permitted = useIsPermitted();
  const isPermitted = can ?? permitted;
  const latest = useRef('');
  const listRef = useRef<HTMLDivElement>(null);

  // Reset on every open so the palette never greets you with a stale query.
  useEffect(() => {
    if (open) {
      setQ('');
      setRecords([]);
      setCursor(0);
      setSearching(false);
    }
  }, [open]);

  // Debounced record search.
  useEffect(() => {
    latest.current = q;
    if (!searchRecords || q.trim().length < 2) {
      setRecords([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchRecords(q.trim());
        if (latest.current === q) setRecords(found ?? []);
      } catch {
        // Search failing must never break navigation.
        if (latest.current === q) setRecords([]);
      } finally {
        if (latest.current === q) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, searchRecords]);

  const groups = useMemo(() => {
    const term = q.trim();

    const actionItems: Item[] = actions
      .filter((a) => isPermitted(a.permission))
      .map((a) => ({ a, s: score(a.label, a.hint ?? '', term) }))
      .filter(({ s }) => s > 0)
      .sort((x, y) => y.s - x.s)
      .map(({ a }) => ({
        kind: 'action' as const,
        id: a.id,
        label: a.label,
        hint: a.hint,
        path: a.path,
        run: a.run,
      }));

    const navs: Item[] = allScreens(sections)
      .filter(({ screen }) => isPermitted(screen.permission))
      .map((e) => ({
        e,
        s: score(e.screen.label, `${e.section.label} ${(e.screen.keywords ?? []).join(' ')}`, term),
      }))
      .filter(({ s }) => s > 0)
      .sort((x, y) => y.s - x.s)
      .map(({ e: { section, screen } }) => ({
        kind: 'nav' as const,
        id: `nav:${screenKey(screen)}`,
        label: screen.label,
        hint: section.label === screen.label ? undefined : section.label,
        path: screen.path,
      }));

    const recs: Item[] = records.map((r) => ({
      kind: 'record' as const,
      id: `rec:${r.type}:${r.id}`,
      label: r.label,
      hint: r.hint,
      path: r.path,
      type: r.type,
    }));

    // With no query the palette is a launcher: recents first, then everything.
    const recents: Item[] = term
      ? []
      : readRecents().map((r) => ({
          kind: 'recent' as const,
          id: `rct:${r.path}`,
          label: r.label,
          path: r.path,
        }));

    return [
      { title: 'Recent', icon: <HistoryRounded />, items: recents },
      { title: 'Actions', icon: <BoltRounded />, items: actionItems },
      { title: 'Go to', icon: <ArrowForwardRounded />, items: navs },
      { title: 'Records', icon: <SearchRounded />, items: recs },
    ].filter((g) => g.items.length > 0);
  }, [q, records, actions, sections, isPermitted]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Keep the cursor inside the list as results change under it.
  useEffect(() => {
    setCursor((c) => (flat.length === 0 ? 0 : Math.min(c, flat.length - 1)));
  }, [flat.length]);

  const run = useCallback(
    (item: Item) => {
      // An action that runs in place goes nowhere, so it is no one's "recent
      // screen" either — the palette steps out of the way and the thing happens.
      if (item.kind === 'action' && item.run) {
        onClose();
        item.run();
        return;
      }
      if (!item.path) return;
      if (item.kind !== 'record') pushRecent({ path: item.path, label: item.label });
      navigate(appPath(company, appSlug, item.path));
      onClose();
    },
    [company, appSlug, navigate, onClose],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flat[cursor]) run(flat[cursor]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
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
      aria-labelledby="ui-palette-label"
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        pt: '12vh',
        px: 2,
      }}
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
          animation: 'ui-palette-in 160ms var(--ease)',
          '@keyframes ui-palette-in': {
            from: { opacity: 0, transform: 'scale(.98)' },
            to: { opacity: 1, transform: 'scale(1)' },
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            height: 56,
            borderBottom: '1px solid var(--c-divider)',
          }}
        >
          <SearchRounded sx={{ fontSize: 20, color: 'var(--c-text-3)' }} aria-hidden />
          <InputBase
            id="ui-palette-label"
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            placeholder={placeholder}
            inputProps={{ 'aria-label': 'Search or run a command' }}
            sx={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 15, color: 'var(--c-text)' }}
          />
          <Box
            sx={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--c-text-3)',
              border: '1px solid var(--c-border)',
              borderRadius: 'var(--r-sm)',
              px: 0.75,
              py: 0.25,
            }}
          >
            esc
          </Box>
        </Box>

        <Box ref={listRef} role="listbox" sx={{ maxHeight: '52vh', overflowY: 'auto', py: 1 }}>
          {flat.length === 0 && (
            <Box
              sx={{ px: 2, py: 4, textAlign: 'center', fontSize: 13.5, color: 'var(--c-text-2)' }}
            >
              {searching
                ? 'Searching…'
                : q.trim().length === 1 && searchRecords
                  ? 'Keep typing — records need two characters.'
                  : `Nothing matches “${q.trim()}”.`}
            </Box>
          )}

          {groups.map((group) => (
            <Box key={group.title}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 2,
                  pt: 1,
                  pb: 0.5,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--c-text-3)',
                  '& svg': { fontSize: 13 },
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
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      mx: 1,
                      px: 1.5,
                      py: 1,
                      borderRadius: 'var(--r-sm)',
                      cursor: 'pointer',
                      background: active ? 'var(--c-primary-50)' : 'transparent',
                      color: active ? 'var(--c-primary-900)' : 'var(--c-text)',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'grid',
                        placeItems: 'center',
                        color: active ? 'var(--c-primary-600)' : 'var(--c-text-3)',
                        '& svg': { fontSize: 18 },
                      }}
                    >
                      {item.kind === 'record' ? (
                        (recordIcon?.(item.type) ?? <SearchRounded />)
                      ) : item.kind === 'action' ? (
                        <BoltRounded />
                      ) : item.kind === 'recent' ? (
                        <HistoryRounded />
                      ) : (
                        <ArrowForwardRounded />
                      )}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box
                        sx={{
                          fontSize: 14,
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.label}
                      </Box>
                      {'hint' in item && item.hint && (
                        <Box
                          sx={{
                            fontSize: 12,
                            color: 'var(--c-text-3)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.hint}
                        </Box>
                      )}
                    </Box>
                    {active && (
                      <Box
                        sx={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: 'var(--c-primary-600)',
                        }}
                      >
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
