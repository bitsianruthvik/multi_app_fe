/**
 * SimilarGroupsPanel.tsx — "these girders are the same as each other".
 *
 * Asked for on 2026-08-18: a six-girder span produces 210 parts, and typing a
 * Top Flange's thickness thirty times is not thirty decisions. It is one
 * decision typed thirty times, with thirty chances to get it wrong.
 *
 * Marking is deliberately DUMB: tick the siblings that are copies, press the
 * button. No naming, no drag, no nesting of groups — every extra control here
 * is one more thing to understand before saving yourself typing, and the whole
 * value proposition is that it takes five seconds.
 *
 * Only siblings of one level are offered together, because that is the only set
 * where "the same as each other" means anything: two girders under different
 * spans have parts with different peer keys, so a group spanning them would
 * silently fan out to nothing.
 *
 * What it buys shows up on the Parameters step, where the copies collapse into
 * one row that writes to all of them.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Tooltip, Typography,
} from '@mui/material';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';

import {
  getSimilarGroups, markSimilar, type SimilarGroup,
} from '../api/parameters';
import { Surface, useToast, backendMessage, Mono } from '../components';

interface Candidate {
  id: number; code: string | null; name: string | null;
  similarGroup: string | null; childCount: number;
}
interface CandidateSet {
  key: string; levelKind: string; parentId: number | null; parentCode: string | null;
  items: Candidate[];
}

export default function SimilarGroupsPanel({ orderId, canManage, onChanged }: {
  orderId: number;
  canManage: boolean;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [sets, setSets] = useState<CandidateSet[]>([]);
  const [groups, setGroups] = useState<SimilarGroup[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [activeSet, setActiveSet] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSimilarGroups(orderId) as unknown as
        { groups: SimilarGroup[]; candidates: CandidateSet[] };
      setGroups(res.groups ?? []);
      setSets(res.candidates ?? []);
    } catch (e) {
      setError(backendMessage(e, 'Could not load the similarity groups.'));
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  /** Ticking in one set clears any tick in another — a group is one set's claim. */
  function toggle(setKey: string, id: number) {
    setPicked((prev) => {
      const next = activeSet === setKey ? new Set(prev) : new Set<number>();
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setActiveSet(setKey);
  }

  async function mark() {
    if (picked.size < 2) return;
    setBusy(true); setError('');
    try {
      // The key only has to be unique within the order and stable enough to
      // group by; it is never shown, so it carries the level and the first
      // member rather than asking anyone to name their girders.
      const ids = [...picked];
      const set = sets.find((s) => s.key === activeSet);
      const key = `${set?.levelKind ?? 'grp'}-${Math.min(...ids)}`;
      const res = await markSimilar(orderId, ids, key);
      toast(`${res.members} ${set?.levelKind ?? 'item'}s marked as copies of each other`, 'success');
      setPicked(new Set());
      setActiveSet(null);
      await load();
      onChanged?.();
    } catch (e) {
      setError(backendMessage(e, 'Could not mark those as similar.'));
    } finally { setBusy(false); }
  }

  async function ungroup(g: SimilarGroup) {
    setBusy(true); setError('');
    try {
      await markSimilar(orderId, g.members.map((m) => m.id), null);
      toast('Group removed — those rows are independent again', 'success');
      await load();
      onChanged?.();
    } catch (e) {
      setError(backendMessage(e, 'Could not remove that group.'));
    } finally { setBusy(false); }
  }

  if (loading) return null;
  if (!sets.length && !groups.length) return null; // nothing repeats — no point offering

  return (
    <Surface e={1} sx={{ p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ContentCopyRounded fontSize="small" sx={{ color: 'var(--c-text-2)' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Similar girders and segments</Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
            Mark copies of each other and you fill their values in once, not once each.
          </Typography>
        </Box>
        {groups.length > 0 && (
          <Chip size="small" label={`${groups.length} group(s)`}
            sx={{ bgcolor: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }} />
        )}
        <Button size="small" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Manage'}</Button>
      </Box>

      {open && (
        <Box sx={{ mt: 1.5 }}>
          {error && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError('')}>{error}</Alert>}

          {groups.map((g) => (
            <Box key={g.groupKey} sx={{
              display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, p: 1,
              borderRadius: 'var(--r-sm)', bgcolor: 'var(--c-surface-2)',
            }}>
              <Chip size="small" label={g.levelKind} sx={{ height: 20, fontSize: 11 }} />
              <Typography sx={{ fontSize: 12.5, flex: 1, minWidth: 0 }}>
                {g.members.map((m) => m.code?.split('-').pop() ?? m.name).join(' ≡ ')}
              </Typography>
              {canManage && (
                <Button size="small" onClick={() => ungroup(g)} disabled={busy}>Ungroup</Button>
              )}
            </Box>
          ))}

          {sets.map((s) => (
            <Box key={s.key} sx={{ mt: 1.5 }}>
              <Typography sx={{
                fontSize: 11, fontWeight: 600, letterSpacing: '.06em',
                textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.5,
              }}>
                {s.levelKind}s{s.parentCode ? ` under ${s.parentCode.split('-').pop()}` : ''}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {s.items.map((it) => {
                  const grouped = !!it.similarGroup;
                  return (
                    <Tooltip
                      key={it.id}
                      title={grouped ? 'Already in a group — ungroup it above first' : `${it.childCount} child row(s)`}
                    >
                      <Box
                        onClick={canManage && !grouped ? () => toggle(s.key, it.id) : undefined}
                        sx={{
                          display: 'flex', alignItems: 'center', gap: 0.25, pr: 1,
                          borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)',
                          opacity: grouped ? 0.5 : 1,
                          cursor: canManage && !grouped ? 'pointer' : 'default',
                          bgcolor: picked.has(it.id) ? 'var(--c-primary-50)' : 'transparent',
                        }}
                      >
                        <Checkbox
                          size="small" checked={picked.has(it.id)} disabled={!canManage || grouped}
                          sx={{ p: 0.5 }}
                        />
                        <Mono sx={{ fontSize: 12 }}>{it.code?.split('-').pop() ?? it.name}</Mono>
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
            </Box>
          ))}

          {canManage && (
            <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button
                variant="contained" size="small" onClick={mark}
                disabled={busy || picked.size < 2}
                startIcon={busy ? <CircularProgress size={13} color="inherit" /> : undefined}
              >
                Mark {picked.size > 1 ? `these ${picked.size}` : 'selected'} as similar
              </Button>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                {picked.size < 2 ? 'Tick two or more of the same kind.' : 'They will share one row on Parameters.'}
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Surface>
  );
}
