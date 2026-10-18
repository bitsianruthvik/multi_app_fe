import { useState } from 'react';
import { Box, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Stack, Tooltip, Typography } from '@mui/material';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import SnoozeRounded from '@mui/icons-material/SnoozeRounded';
import DoNotDisturbOnOutlined from '@mui/icons-material/DoNotDisturbOnOutlined';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import EditNoteRounded from '@mui/icons-material/EditNoteRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import { PromptDialog, SideSheet, ToneBadge, errorMessage, useToast } from '@shared/ui';
import { kdApi, useReport } from '../api';
import { ago } from '../format';

export interface FindingRow {
  key: string; label?: string;
  _status: 'new' | 'open' | 'done' | 'snoozed' | 'muted';
  _reason: string | null; _since: string | null; _by: string | null; _at: string | null; _note: string | null; _until: string | null;
  [k: string]: unknown;
}

const STATUS: Record<FindingRow['_status'], { label: string; tone: 'danger' | 'warning' | 'info' | 'success' | 'neutral' }> = {
  new: { label: 'New', tone: 'danger' }, open: { label: 'Open', tone: 'warning' }, done: { label: 'Done', tone: 'success' },
  snoozed: { label: 'Snoozed', tone: 'info' }, muted: { label: 'Not relevant', tone: 'neutral' },
};

/** The status chip of a finding, with why it is back when it came back. */
export function FindingStatus({ row }: { row: FindingRow }) {
  const s = STATUS[row._status] || STATUS.new;
  const back = row._reason && !['first seen', 'reopened'].includes(row._reason);
  const tip = [
    row._reason ? `Why: ${row._reason}` : null,
    row._since ? `First seen ${ago(row._since)}` : null,
    row._by ? `${STATUS[row._status]?.label || ''} by ${row._by} ${ago(row._at)}` : null,
    row._until ? `Snoozed until ${String(row._until).slice(0, 10)}` : null,
    row._note ? `Note: ${row._note}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <Tooltip title={tip || ''}>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <ToneBadge label={back && row._status === 'new' ? 'Back' : s.label} tone={s.tone} />
        {row._note && <EditNoteRounded sx={{ fontSize: 16, color: 'var(--c-text-3)' }} />}
      </Stack>
    </Tooltip>
  );
}

/** Done / snooze / not relevant / reopen / note / history, for one finding. Every action is logged with the person's name. */
export function FindingActions({ ruleId, row, onChanged }: { ruleId: string; row: FindingRow; onChanged: () => void }) {
  const toast = useToast();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [ask, setAsk] = useState<null | { action: 'done' | 'mute' | 'note'; title: string; label: string; required: boolean }>(null);
  const [showHistory, setShowHistory] = useState(false);
  const handled = ['done', 'snoozed', 'muted'].includes(row._status);
  const path = `/insights/${encodeURIComponent(ruleId)}/${encodeURIComponent(row.key)}`;

  const run = async (action: string, extra: Record<string, unknown> = {}) => {
    setAnchor(null);
    try {
      await kdApi.post(`${path}/action`, { action, ...extra });
      toast.success({ done: 'Marked done', snooze: 'Snoozed', mute: 'Marked not relevant', reopen: 'Reopened', note: 'Note saved' }[action] || 'Saved');
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Box onClick={(e) => e.stopPropagation()}>
      <IconButton size="small" aria-label="Actions" onClick={(e) => setAnchor(e.currentTarget)}><MoreVertRounded fontSize="small" /></IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {!handled && (
          <MenuItem onClick={() => { setAnchor(null); setAsk({ action: 'done', title: 'Mark done', label: 'What was done (optional)', required: false }); }}>
            <ListItemIcon><CheckCircleOutlineRounded fontSize="small" /></ListItemIcon>
            <ListItemText primary="Mark done" secondary="Comes back only if it gets worse" />
          </MenuItem>
        )}
        {!handled && [3, 7, 30].map((d) => (
          <MenuItem key={d} onClick={() => run('snooze', { days: d })}>
            <ListItemIcon><SnoozeRounded fontSize="small" /></ListItemIcon>
            <ListItemText primary={`Snooze ${d} days`} />
          </MenuItem>
        ))}
        {!handled && (
          <MenuItem onClick={() => { setAnchor(null); setAsk({ action: 'mute', title: 'Not relevant', label: 'Why it is not relevant', required: true }); }}>
            <ListItemIcon><DoNotDisturbOnOutlined fontSize="small" /></ListItemIcon>
            <ListItemText primary="Not relevant" secondary="Comes back only if it doubles" />
          </MenuItem>
        )}
        {handled && (
          <MenuItem onClick={() => run('reopen')}>
            <ListItemIcon><ReplayRounded fontSize="small" /></ListItemIcon>
            <ListItemText primary="Reopen" />
          </MenuItem>
        )}
        <Divider />
        <MenuItem onClick={() => { setAnchor(null); setAsk({ action: 'note', title: 'Note', label: 'Note for the team', required: false }); }}>
          <ListItemIcon><EditNoteRounded fontSize="small" /></ListItemIcon>
          <ListItemText primary={row._note ? 'Edit note' : 'Add note'} />
        </MenuItem>
        <MenuItem onClick={() => { setAnchor(null); setShowHistory(true); }}>
          <ListItemIcon><HistoryRounded fontSize="small" /></ListItemIcon>
          <ListItemText primary="History" />
        </MenuItem>
      </Menu>
      {ask && (
        <PromptDialog open title={ask.title} label={ask.label} required={ask.required} initialValue={ask.action === 'note' ? row._note || '' : ''}
          confirmLabel={ask.action === 'note' ? 'Save' : ask.title} onClose={() => setAsk(null)}
          onConfirm={async (note) => { await run(ask.action, { note: note || undefined }); setAsk(null); }} />
      )}
      <HistorySheet open={showHistory} path={path} title={String(row.label || row.key)} onClose={() => setShowHistory(false)} />
    </Box>
  );
}

const ACTION_WORD: Record<string, string> = {
  done: 'Marked done', snooze: 'Snoozed', mute: 'Marked not relevant', reopen: 'Reopened', note: 'Note',
  'auto:new': 'Came back', 'auto:open': 'Back to open', 'auto:resolved': 'Resolved (gone from the data)',
};

function HistorySheet({ open, path, title, onClose }: { open: boolean; path: string; title: string; onClose: () => void }) {
  const { data } = useReport<{ rows: { action: string; byName: string; at: string; metric: number | null; note: string | null }[] }>(open ? `${path}/history` : null, false);
  return (
    <SideSheet open={open} onClose={onClose} title={title} subtitle="What happened to this finding">
      <Stack spacing={1.25}>
        {(data?.rows ?? []).map((h, i) => (
          <Box key={i} sx={{ p: 1.25, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)' }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{ACTION_WORD[h.action] || h.action}</Typography>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{h.byName || 'system'} · {new Date(h.at).toLocaleString()}</Typography>
            {h.note && <Typography sx={{ fontSize: 12.5, mt: 0.5 }}>{h.note}</Typography>}
          </Box>
        ))}
        {data && !data.rows.length && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Nothing yet.</Typography>}
      </Stack>
    </SideSheet>
  );
}
