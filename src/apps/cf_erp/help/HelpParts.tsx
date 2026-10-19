import type { ReactNode } from 'react';
import { Box, Chip, List, ListItemButton, ListItemText } from '@mui/material';
import { MarkdownView, type MarkdownLinks } from './MarkdownView';
import { AREA_LABEL, HELP_ROLES, ROLE_LABEL, type HelpTopic } from './registry';

/** The pieces the help panel and the Help page share. */

export function TopicArticle({ topic, links, headingLevel = 1, actions }: {
  topic: HelpTopic; links: MarkdownLinks; headingLevel?: 1 | 2; actions?: ReactNode;
}) {
  return (
    <Box component="article" data-help-topic-id={topic.id} sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
        <Box component={headingLevel === 1 ? 'h1' : 'h2'} sx={{ m: 0, flex: 1, minWidth: 0, fontSize: headingLevel === 1 ? 20 : 18, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1.3 }}>
          {topic.title}
        </Box>
        {actions}
      </Box>
      <Box sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 2 }}>
        {AREA_LABEL[topic.area] ?? topic.area}
        {topic.roles.length > 0 && ` · for ${topic.roles.map((r) => ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? r).join(', ')}`}
      </Box>
      <MarkdownView source={topic.body} links={links} />
    </Box>
  );
}

export function TopicList({ topics, onPick, activeId, dense = true, showArea = true }: {
  topics: HelpTopic[]; onPick: (t: HelpTopic) => void; activeId?: string | null; dense?: boolean; showArea?: boolean;
}) {
  return (
    <List dense={dense} disablePadding>
      {topics.map((t) => (
        <ListItemButton key={t.id} selected={t.id === activeId} onClick={() => onPick(t)} sx={{ borderRadius: 'var(--r-sm)' }}>
          <ListItemText primary={t.title} secondary={showArea ? AREA_LABEL[t.area] ?? t.area : undefined}
            slotProps={{ primary: { sx: { fontSize: 13.5 } }, secondary: { sx: { fontSize: 11.5 } } }} />
        </ListItemButton>
      ))}
    </List>
  );
}

/** The role manuals as chips — the way into help when nothing matches. */
export function RoleChips({ onPick, roles = HELP_ROLES as readonly string[] }: { onPick: (role: string) => void; roles?: readonly string[] }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
      {roles.map((r) => (
        <Chip key={r} label={ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? r} size="small" variant="outlined" clickable onClick={() => onPick(r)} />
      ))}
    </Box>
  );
}

/** Never an empty panel: what to do when no topic is written for this screen. */
export function NoMatch({ onRole, children }: { onRole: (role: string) => void; children?: ReactNode }) {
  return (
    <Box data-help-nomatch sx={{ display: 'grid', gap: 1.5 }}>
      <Box sx={{ fontSize: 14, color: 'var(--c-text)' }}>
        <strong>No help is written for this screen yet.</strong>
      </Box>
      <Box sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
        Search above for what you want to do, or open the manual for your role:
      </Box>
      <RoleChips onPick={onRole} />
      {children}
    </Box>
  );
}
