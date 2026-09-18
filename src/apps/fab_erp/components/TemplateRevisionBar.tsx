/**
 * TemplateRevisionBar — where a template stands, above its Bill of Materials.
 *
 * The BOM below is the WORKING COPY; new orders are built from the latest
 * RELEASED revision (product owner, 2026-09-18). So the bar answers the two
 * questions a person editing a template has: "what will the next order get?"
 * and "have I changed anything that is not released yet?" — and releases.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';

import {
  getTemplateRevisions, releaseTemplateRevision,
  type TemplateRevision, type TemplateRevisionStatus,
} from '../api/templates';
import { backendMessage, useToast } from '../components';

const when = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export default function TemplateRevisionBar({ templateItemId, canRelease, refreshKey }: {
  templateItemId: number;
  canRelease: boolean;
  /** Bumped whenever the BOM below is saved, so "unreleased changes" is current. */
  refreshKey: number;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState<TemplateRevisionStatus | null>(null);
  const [history, setHistory] = useState<TemplateRevision[]>([]);
  const [before, setBefore] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await getTemplateRevisions(templateItemId);
      setStatus(r.status);
      setHistory(r.revisions ?? []);
      setBefore(r.builtBeforeRevisions ?? 0);
    } catch { /* the BOM still works without the bar */ }
  }, [templateItemId]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  if (!status || (!status.hasBom && status.latestRev == null)) return null;
  const next = (status.latestRev ?? 0) + 1;

  const release = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await releaseTemplateRevision(templateItemId, note.trim() || null);
      toast(`Released Rev ${r.rev} — new orders are built from it.`);
      setReleasing(false);
      setNote('');
      await load();
    } catch (e) {
      setErr(backendMessage(e, 'Could not release.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid var(--c-divider)', bgcolor: 'var(--c-surface-2)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
        {status.latestRev != null
          ? <Chip size="small" color="primary" label={`Rev ${status.latestRev}`} />
          : <Chip size="small" color="warning" variant="outlined" label="Not released" />}
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: '1 1 320px', minWidth: 0 }}>
          {status.latestRev == null
            ? 'Orders cannot be built from this template until it is released.'
            : status.unreleasedChanges
              ? <>The recipe below has <b>unreleased changes</b> — new orders still get Rev {status.latestRev} until you release.</>
              : <>New orders are built from Rev {status.latestRev}{status.releasedAt ? `, released ${when(status.releasedAt)}` : ''}{status.note ? ` — “${status.note}”` : ''}.</>}
        </Typography>
        {history.length > 0 && (
          <Button size="small" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? 'Hide history' : `History (${history.length})`}
          </Button>
        )}
        {canRelease && (status.unreleasedChanges || status.latestRev == null) && (
          <Button size="small" variant="contained" onClick={() => { setErr(null); setReleasing(true); }}>
            Release Rev {next}…
          </Button>
        )}
      </Box>

      <Collapse in={showHistory} unmountOnExit>
        <Table size="small" sx={{ mt: 1 }}>
          <TableHead>
            <TableRow>
              {['Rev', 'Released', 'By', 'Note', 'Order lines built'].map((h) => (
                <TableCell key={h} sx={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-3)', textTransform: 'uppercase' }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {history.map((r) => (
              <TableRow key={r.rev}>
                <TableCell sx={{ fontSize: 13, fontWeight: 600 }}>Rev {r.rev}</TableCell>
                <TableCell sx={{ fontSize: 13 }}>{when(r.releasedAt)}</TableCell>
                <TableCell sx={{ fontSize: 13 }}>{r.releasedBy ?? '—'}</TableCell>
                <TableCell sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{r.note ?? '—'}</TableCell>
                <TableCell sx={{ fontSize: 13 }}>{r.orderLines}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {before > 0 && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.5 }}>
            {before} order line{before === 1 ? ' was' : 's were'} built before revisions existed.
          </Typography>
        )}
      </Collapse>

      <Dialog open={releasing} onClose={() => setReleasing(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>Release Rev {next}</DialogTitle>
        <DialogContent>
          {err && <Alert severity="warning" sx={{ mb: 2 }}>{err}</Alert>}
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5 }}>
            Freezes the recipe as it is now. New orders are built from Rev {next}; orders already built keep the revision they were built from.
          </Typography>
          <TextField autoFocus fullWidth size="small" label="What changed (optional)" value={note}
            onChange={(e) => setNote(e.target.value)} inputProps={{ maxLength: 500 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReleasing(false)}>Cancel</Button>
          <Button variant="contained" disabled={busy} onClick={() => void release()}>{busy ? 'Releasing…' : `Release Rev ${next}`}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
