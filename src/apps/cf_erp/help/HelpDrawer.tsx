import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Drawer, IconButton, InputAdornment, Tab, Tabs, TextField, Tooltip } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import MenuBookRounded from '@mui/icons-material/MenuBookRounded';
import KeyboardRounded from '@mui/icons-material/KeyboardRounded';
import { useCompanySlug } from '../hooks/useLoad';
import { helpIndex } from './load';
import { searchTopics, topicsForLocation, type HelpTopic } from './registry';
import type { HelpRequest } from './helpContext';
import type { MarkdownLinks } from './MarkdownView';
import { NoMatch, TopicArticle, TopicList } from './HelpParts';

/**
 * The help panel: a right-side drawer (full width on a phone) with the topics for this screen — tabs when several
 * match, the best first (this tab's / stage's topic before the screen's) — a search over every topic, and the way
 * to the full manual. A help: link inside a topic opens that topic here, with Back.
 */
export default function HelpDrawer({ open, request, onClose, onShortcuts }: {
  open: boolean; request: HelpRequest & { n: number }; onClose: () => void; onShortcuts?: () => void;
}) {
  const index = helpIndex();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const company = useCompanySlug();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(0);
  // Topics opened from a link or a search result, newest last; Back pops one.
  const [stack, setStack] = useState<string[]>([]);

  // A new request (another button, `?`) starts afresh.
  useEffect(() => { setQuery(''); setPicked(0); setStack([]); }, [request.n]);

  const matched = useMemo(() => {
    const here = topicsForLocation(index, pathname, search, request.tab);
    const asked = request.topic ? index.byId.get(request.topic) : undefined;
    return asked ? [asked, ...here.filter((t) => t.id !== asked.id)] : here;
  }, [index, pathname, search, request.tab, request.topic]);

  const results = useMemo(() => searchTopics(index, query), [index, query]);
  const stacked = stack.length ? index.byId.get(stack[stack.length - 1]) ?? null : null;
  const current: HelpTopic | null = stacked ?? matched[Math.min(picked, matched.length - 1)] ?? null;

  const openTopic = (id: string) => { if (index.byId.has(id)) { setStack((s) => [...s, id]); setQuery(''); } };
  const links: MarkdownLinks = { company, onOpenTopic: openTopic, onNavigate: onClose, known: (id) => index.byId.has(id) };
  const toManual = (qs: string) => { onClose(); navigate(`/${company}/cf_erp/help${qs}`); };

  let body;
  if (query.trim()) {
    body = results.length
      ? <TopicList topics={results} onPick={(t) => openTopic(t.id)} />
      : <Box sx={{ fontSize: 13.5, color: 'var(--c-text-2)', p: 1 }}>Nothing found for “{query.trim()}”. Try fewer or other words.</Box>;
  } else if (stacked) {
    body = (
      <>
        <Button size="small" startIcon={<ArrowBackRounded />} onClick={() => setStack((s) => s.slice(0, -1))} sx={{ mb: 1, ml: -0.5 }}>Back</Button>
        <TopicArticle topic={stacked} links={links} />
      </>
    );
  } else if (current) {
    body = <TopicArticle topic={current} links={links} />;
  } else {
    body = <NoMatch onRole={(r) => toManual(`?role=${r}`)} />;
  }

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 480 }, maxWidth: '100%', display: 'flex', flexDirection: 'column', background: 'var(--c-surface)' }, role: 'dialog', 'aria-label': 'Help' } as object }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 1.5, pb: 1 }}>
        <Box component="h2" sx={{ m: 0, flex: 1, fontSize: 16, fontWeight: 600, color: 'var(--c-text)' }}>Help</Box>
        {onShortcuts && (
          <Tooltip title="Keyboard shortcuts">
            <IconButton size="small" aria-label="Keyboard shortcuts" onClick={onShortcuts}><KeyboardRounded fontSize="small" /></IconButton>
          </Tooltip>
        )}
        <Tooltip title="Close (Esc)">
          <IconButton size="small" aria-label="Close help" onClick={onClose}><CloseRounded fontSize="small" /></IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ px: 2, pb: 1 }}>
        <TextField size="small" fullWidth placeholder="Search all help" value={query} onChange={(e) => setQuery(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }, htmlInput: { 'aria-label': 'Search all help' } }} />
      </Box>
      {!query.trim() && !stacked && matched.length > 1 && (
        <Tabs value={Math.min(picked, matched.length - 1)} onChange={(_, v: number) => setPicked(v)} variant="scrollable" scrollButtons="auto"
          sx={{ px: 1, minHeight: 36, borderBottom: '1px solid var(--c-divider)', '& .MuiTab-root': { minHeight: 36, textTransform: 'none', fontSize: 13 } }}>
          {matched.map((t) => <Tab key={t.id} label={t.title} />)}
        </Tabs>
      )}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 2 }}>{body}</Box>
      <Box sx={{ display: 'flex', gap: 1, px: 2, py: 1.25, borderTop: '1px solid var(--c-divider)', flexWrap: 'wrap' }}>
        <Button size="small" variant="outlined" startIcon={<MenuBookRounded />} onClick={() => toManual(current && !query.trim() ? `?topic=${encodeURIComponent(current.id)}` : '')}>
          Open the full manual
        </Button>
      </Box>
    </Drawer>
  );
}
