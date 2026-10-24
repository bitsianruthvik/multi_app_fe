import { useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Box, Button, GlobalStyles, InputAdornment, TextField } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import PrintRounded from '@mui/icons-material/PrintRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { PageHeader, SectionCard } from '../components/ui';
import { useCompanySlug } from '../hooks/useLoad';
import { helpIndex } from '../help/load';
import { AREA_LABEL, HELP_ROLES, ROLE_LABEL, areasInUse, manualForRole, searchTopics, topicsForArea, type HelpTopic } from '../help/registry';
import { RoleChips, TopicArticle, TopicList } from '../help/HelpParts';
import type { MarkdownLinks } from '../help/MarkdownView';
import { FadeIn } from '../motion';

/**
 * The full manual (TM/CF_ERP_HELP_SPEC.md): every topic by role and by area, search, one topic on the right.
 *   ?role=<role>   that role's manual — its Getting started guide, then each of its topics area by area — with Print
 *   ?topic=<id>    one topic        ?area=<area>  one area's topics        ?q=<words>  search
 * Printing prints only the manual (a copy portalled to <body>, so no app chrome and no scrolling box cuts it off).
 */
const PRINT_CSS = {
  '@media screen': { '.cf-help-print-root': { display: 'none' } },
  '@media print': {
    'html, body': { height: 'auto !important', overflow: 'visible !important', background: '#fff !important' },
    'body > *:not(.cf-help-print-root)': { display: 'none !important' },
    '.cf-help-print-root': { display: 'block', color: '#000', padding: '0 8mm', fontSize: '11pt' },
    '.cf-help-print-root article': { breakBefore: 'page' },
    '.cf-help-print-root article:first-of-type': { breakBefore: 'auto' },
    '.cf-help-print-root a': { color: '#000', textDecoration: 'none' },
    '.cf-help-print-root blockquote': { breakInside: 'avoid' },
  },
};

const NavHeading = ({ children }: { children: ReactNode }) => (
  <Box sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', px: 1, mt: 2, mb: 0.5 }}>{children}</Box>
);

export default function Help() {
  const index = helpIndex();
  const company = useCompanySlug();
  const [params, setParams] = useSearchParams();
  const role = params.get('role');
  const topicId = params.get('topic');
  const area = params.get('area');
  const q = params.get('q') ?? '';

  const go = (next: Record<string, string | null>) => setParams(() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    return p;
  });
  const links: MarkdownLinks = { company, onOpenTopic: (id) => go({ topic: id }), known: (id) => index.byId.has(id) };

  const manual = useMemo(() => (role ? manualForRole(index, role) : []), [index, role]);
  const results = useMemo(() => searchTopics(index, q), [index, q]);
  const topic = topicId ? index.byId.get(topicId) ?? null : null;
  const areas = areasInUse(index);
  const activeArea = area ?? topic?.area ?? null;
  const roleLabel = role ? ROLE_LABEL[role as keyof typeof ROLE_LABEL] ?? role : '';

  let main: ReactNode;
  if (q.trim()) {
    main = (
      <SectionCard title={`Search: “${q.trim()}”`} subtitle={`${results.length} topic${results.length === 1 ? '' : 's'}`}>
        {results.length ? <TopicList topics={results} onPick={(t) => go({ topic: t.id })} /> : <Box sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Nothing found. Try fewer or other words.</Box>}
      </SectionCard>
    );
  } else if (topic) {
    main = <SectionCard><TopicArticle topic={topic} links={links} /></SectionCard>;
  } else if (topicId) {
    main = <SectionCard><Box sx={{ fontSize: 14 }}>There is no help topic “{topicId}”. Pick one on the left, or search.</Box></SectionCard>;
  } else if (role) {
    main = (
      <Box sx={{ display: 'grid', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Box component="h2" sx={{ m: 0, flex: 1, fontSize: 18, fontWeight: 600 }}>The {roleLabel} manual</Box>
          <Button size="small" variant="outlined" startIcon={<PrintRounded />} onClick={() => window.print()} disabled={manual.length === 0}>Print</Button>
        </Box>
        {manual.length === 0
          ? <SectionCard><Box sx={{ fontSize: 14 }}>No topics are written for {roleLabel} yet.</Box></SectionCard>
          : manual.map((t) => <SectionCard key={t.id}><TopicArticle topic={t} links={links} headingLevel={2} /></SectionCard>)}
      </Box>
    );
  } else if (area) {
    main = (
      <SectionCard title={AREA_LABEL[area] ?? area}>
        <TopicList topics={topicsForArea(index, area)} onPick={(t) => go({ topic: t.id })} showArea={false} />
      </SectionCard>
    );
  } else {
    main = (
      <SectionCard title="Start here" subtitle="Pick your role for a manual from the first screen to the last, or a topic on the left.">
        <RoleChips onPick={(r) => go({ role: r })} />
        {index.topics.length === 0 && <Box sx={{ fontSize: 13.5, color: 'var(--c-text-2)', mt: 2 }}>No help topics are written yet.</Box>}
      </SectionCard>
    );
  }

  const printCopy = role && manual.length > 0 && createPortal(
    <Box className="cf-help-print-root">
      <Box component="h1" sx={{ fontSize: '18pt', mb: 1 }}>CF ERP — the {roleLabel} manual</Box>
      {manual.map((t: HelpTopic) => <TopicArticle key={t.id} topic={t} links={links} headingLevel={2} />)}
    </Box>,
    document.body,
  );

  return (
    <Box>
      <GlobalStyles styles={PRINT_CSS} />
      <PageHeader title="Help" subtitle="How to use CF ERP — by role, by area, or search. The i button on any screen opens the help for that screen." />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '280px minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
        <Box component="nav" aria-label="Help topics" sx={{ position: { md: 'sticky' }, top: 0, minWidth: 0 }}>
          <TextField size="small" fullWidth placeholder="Search all help" defaultValue={q} key={q}
            onKeyDown={(e) => { if (e.key === 'Enter') go({ q: (e.target as HTMLInputElement).value.trim() || null }); }}
            onBlur={(e) => { const v = e.target.value.trim(); if (v !== q.trim()) go({ q: v || null }); }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }, htmlInput: { 'aria-label': 'Search all help' } }} />
          <NavHeading>By role</NavHeading>
          <Box sx={{ display: 'grid' }}>
            {HELP_ROLES.map((r) => (
              <Button key={r} size="small" onClick={() => go({ role: r })} sx={{
                justifyContent: 'flex-start', textTransform: 'none', fontSize: 13.5, color: role === r ? 'var(--c-primary-700)' : 'var(--c-text)',
                fontWeight: role === r ? 600 : 400, background: role === r ? 'var(--c-surface-2)' : 'transparent',
              }}>{ROLE_LABEL[r]}</Button>
            ))}
          </Box>
          <NavHeading>By area</NavHeading>
          <Box sx={{ display: 'grid' }}>
            {areas.map((a) => (
              <Button key={a} size="small" onClick={() => go({ area: a })} sx={{
                justifyContent: 'space-between', textTransform: 'none', fontSize: 13.5, color: activeArea === a ? 'var(--c-primary-700)' : 'var(--c-text)',
                fontWeight: activeArea === a ? 600 : 400, background: activeArea === a ? 'var(--c-surface-2)' : 'transparent',
              }}>
                <span>{AREA_LABEL[a] ?? a}</span>
                <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 12 }}>{topicsForArea(index, a).length}</Box>
              </Button>
            ))}
          </Box>
        </Box>
        {/* Motion: the reading pane fades in when another topic, manual or area is opened (not on each search keystroke). */}
        <FadeIn key={`${role}|${topicId}|${area}|${q ? 'q' : ''}`} style={{ minWidth: 0 }}>{main}</FadeIn>
      </Box>
      {printCopy}
    </Box>
  );
}
