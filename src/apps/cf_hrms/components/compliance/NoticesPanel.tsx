/**
 * Compliance › Notices (CF_HRMS_HIRING_SPEC.md §36.4): the law changes the product team has published,
 * what each means for this company (people, structures, policies), and acknowledging them. A notice
 * that is not acknowledged is mailed again to the Owner and HR every few days.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Button, Chip, Link, Stack, TextField, Typography } from '@mui/material';
import { Callout, DetailSkeleton, EmptyState, ErrorNotice, SectionCard, ToneBadge, errorMessage, useToast } from '@shared/ui';
import { complianceApi, type ComplianceNotification } from '../../api/compliance';

const when = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function NoticeCard({ n, canAck, onDone, open }: { n: ComplianceNotification; canAck: boolean; onDone: () => void; open: boolean }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const ack = async () => {
    setBusy(true);
    try { await complianceApi.acknowledge(n.id, note || undefined); toast.success('Acknowledged.'); window.dispatchEvent(new Event('cf-hrms-compliance-changed')); onDone(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const acked = n.status === 'ACKNOWLEDGED';
  return (
    <SectionCard
      title={n.title}
      subtitle={`${n.kind === 'DEADLINE' ? 'Deadline reminder' : 'Law change'}${n.effectiveFrom ? ` · in force from ${n.effectiveFrom}` : ''} · ${when(n.createdAt)}`}
      actions={<ToneBadge tone={acked ? 'success' : 'warning'} label={acked ? 'Acknowledged' : 'Waiting'} />}
      sx={open ? { outline: '2px solid var(--c-primary-400)' } : undefined}
    >
      <Stack spacing={1.25} data-testid={`notice-${n.id}`}>
        <Typography sx={{ fontSize: 13.5 }}>{n.body}</Typography>
        {n.impact && (
          <Box>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, mb: 0.5 }}>What it touches here</Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, mb: 0.5 }}>
              <Chip size="small" label={`${n.impact.people} ${n.impact.people === 1 ? 'person' : 'people'}`} />
              <Chip size="small" label={`${n.impact.structures} salary structure${n.impact.structures === 1 ? '' : 's'}`} />
              {n.impact.policies > 0 && <Chip size="small" label={`${n.impact.policies} leave polic${n.impact.policies === 1 ? 'y' : 'ies'}`} />}
            </Stack>
            {n.impact.lines.map((l) => <Typography key={l} sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>• {l}</Typography>)}
            {n.impact.proposals.length > 0 && (
              <Callout tone="info" title="Proposed fixes" sx={{ mt: 1 }}>
                {n.impact.proposals.map((p) => <Typography key={p.title} sx={{ fontSize: 12.5 }}>• {p.title}</Typography>)}
              </Callout>
            )}
          </Box>
        )}
        {n.sourceUrl && <Link href={n.sourceUrl} target="_blank" rel="noopener noreferrer" sx={{ fontSize: 12.5 }}>The official source</Link>}
        {acked ? (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Acknowledged by {n.acknowledgedBy ?? '—'} on {when(n.acknowledgedAt)}{n.ackNote ? ` — “${n.ackNote}”` : '.'}</Typography>
        ) : canAck ? (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField size="small" fullWidth label="Note (what you will do)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button variant="contained" disabled={busy} onClick={() => void ack()} sx={{ flexShrink: 0 }}>Acknowledge</Button>
          </Stack>
        ) : (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Waiting for the Owner or HR to acknowledge it{n.sendCount > 1 ? ` (mailed ${n.sendCount} times)` : ''}.</Typography>
        )}
      </Stack>
    </SectionCard>
  );
}

export function NoticesPanel() {
  const [params] = useSearchParams();
  const focus = Number(params.get('notice')) || null;
  const [status, setStatus] = useState<'OPEN' | 'ALL'>('ALL');
  const [data, setData] = useState<Awaited<ReturnType<typeof complianceApi.notifications>> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => { complianceApi.notifications(status).then((d) => { setData(d); setError(null); }).catch(setError); }, [status]);
  useEffect(load, [load]);
  const list = (data?.notifications ?? []).filter((n) => n.kind === 'LAW_CHANGE' || n.status === 'OPEN');
  const waiting = list.filter((n) => n.status === 'OPEN').length;
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Chip label="All" color={status === 'ALL' ? 'primary' : 'default'} onClick={() => setStatus('ALL')} />
        <Chip label="Waiting" color={status === 'OPEN' ? 'primary' : 'default'} onClick={() => setStatus('OPEN')} />
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', ml: 'auto' }}>
          {waiting} waiting{data ? ` · emails: ${data.emails.sent} sent, ${data.emails.queued} queued` : ''}
        </Typography>
      </Stack>
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {!data && !error && <DetailSkeleton />}
      {data && !list.length && <EmptyState title="Nothing to acknowledge" hint="When the product team publishes a change in the law, it appears here with what it means for this company." />}
      <Stack spacing={2}>
        {list.map((n) => <NoticeCard key={n.id} n={n} canAck={Boolean(data?.canAcknowledge)} onDone={load} open={focus === n.id} />)}
      </Stack>
    </Box>
  );
}

export default NoticesPanel;
