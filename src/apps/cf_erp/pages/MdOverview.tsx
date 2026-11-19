import { useMemo, useState, type ReactNode } from 'react';
import { Alert as MuiAlert, Box, Button, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import type { Alert } from '../api/alerts';
import { decideApproval } from '../api/approvals';
import { getMdOverview, getMdReport, markReportSeen, type MdDecision, type MdDepartment, type MdReport, type MdReportHead, type Tone } from '../api/md';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { Badge, ErrorNotice, Mono, SkeletonRows, type Family } from '../components/ui';
import { AlertRow } from '../components/Alerts/AlertRow';
import { FormDialog } from '../components/FormDialog';
import { PromptDialog } from '../components/PromptDialog';
import { useToast } from '../components/toastContext';

const TONE_INK: Record<Tone, string> = { ok: 'var(--c-success-700)', warn: 'var(--c-warning-700)', bad: 'var(--c-danger-700)', neutral: 'var(--c-text)' };
const DOT: Record<MdDepartment['status'], string> = { ok: 'var(--c-success-600)', warn: 'var(--c-warning-600)', bad: 'var(--c-danger-600)' };
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const ageText = (d: number) => (d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`);

/** One band of the page: a numbered question, how much is in it, and its rows. */
function Band({ testid, title, count, tone, hint, action, children }: {
  testid: string; title: string; count?: number; tone?: Family; hint?: ReactNode; action?: ReactNode; children: ReactNode;
}) {
  return (
    <Box data-testid={testid} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface)', minWidth: 0, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', px: 1.5, py: 1.1, borderBottom: '1px solid var(--c-divider)' }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{title}</Typography>
        {count != null && <Badge family={count ? (tone ?? 'warning') : 'success'} label={count ? String(count) : 'none'} noIcon />}
        {hint && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', flex: '1 1 200px', minWidth: 0 }}>{hint}</Typography>}
        {action && <Box sx={{ ml: 'auto' }}>{action}</Box>}
      </Box>
      {children}
    </Box>
  );
}
const rowSx = { display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap' as const, px: 1.5, py: 1, borderBottom: '1px solid var(--c-divider)', '&:last-child': { borderBottom: 0 }, minWidth: 0 };
const Empty = ({ children }: { children: ReactNode }) => <Typography sx={{ p: 1.5, fontSize: 13.5, color: 'var(--c-text-3)' }}>{children}</Typography>;

function DecisionRow({ r, onDone }: { r: MdDecision; onDone: () => void }) {
  const company = useCompanySlug();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const decide = async (d: 'approve' | 'reject', note?: string) => {
    setBusy(true);
    try { await decideApproval(r.id, d, note); invalidateNavCounts(); toast.success(d === 'approve' ? 'Approved.' : 'Rejected.'); onDone(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Box sx={rowSx} data-testid="md-decision">
      <Badge family="info" label={r.department} noIcon />
      <Box sx={{ flex: '3 1 260px', minWidth: 0 }}>
        <Box sx={{ fontSize: 14, overflowWrap: 'anywhere' }}>{r.title}</Box>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', overflowWrap: 'anywhere' }}>
          {[r.typeLabel, r.requestedBy ? `from ${r.requestedBy}` : null, ageText(r.ageDays), r.summary].filter(Boolean).join(' · ')}
        </Typography>
      </Box>
      {r.amount != null && <Mono sx={{ fontSize: 13.5 }}>{rupees(r.amount)}</Mono>}
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', ml: 'auto' }}>
        {r.decideHere && <Button size="small" variant="contained" disabled={busy} onClick={() => void decide('approve')}>Approve</Button>}
        {r.decideHere && <Button size="small" variant="outlined" color="error" disabled={busy} onClick={() => setRejecting(true)}>Reject</Button>}
        <Button size="small" variant={r.decideHere ? 'text' : 'contained'} component={Link} to={appPath(company, r.link)}>{r.decideHere ? 'Open' : 'Open to decide'}</Button>
      </Box>
      <PromptDialog open={rejecting} title="Reject this request?" body={r.title} label="Why" confirmLabel="Reject" danger
        onConfirm={async (note) => { setRejecting(false); await decide('reject', note); }} onClose={() => setRejecting(false)} />
    </Box>
  );
}

/** A weekly report in full: figures, then its tables. "Mark seen" keeps the reader's name and the time. */
function ReportDialog({ head, onClose, onSeen }: { head: MdReportHead | null; onClose: () => void; onSeen: () => void }) {
  const toast = useToast();
  const rep = useLoad<MdReport | null>(() => (head ? getMdReport(head.id) : Promise.resolve(null)), [head?.id]);
  const [note, setNote] = useState('');
  const r = rep.data;
  const unseen = !!head && !head.seenAt;
  return (
    <FormDialog open={!!head} maxWidth="md" title={head ? `${head.label} · ${head.periodStart} to ${head.periodEnd}` : ''} subtitle={head?.headline ?? undefined} onClose={onClose}
      submitLabel={unseen ? 'Mark seen' : 'Close'} enterSubmits={false}
      onSubmit={async () => { if (head && unseen) { await markReportSeen(head.id, note.trim() || undefined); toast.success('Marked as seen.'); setNote(''); onSeen(); } }}>
      <ErrorNotice error={rep.error} onRetry={rep.reload} />
      {!r && !rep.error && <SkeletonRows rows={5} />}
      {r && (
        <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }} data-testid="md-report">
          {(r.data.notes ?? []).map((n) => <MuiAlert key={n} severity="info">{n}</MuiAlert>)}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1 }}>
            {r.data.figures.map((f) => (
              <Box key={f.label} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', p: 1.25, minWidth: 0 }}>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{f.label}</Typography>
                <Mono sx={{ fontSize: 17, fontWeight: 600, color: TONE_INK[f.tone ?? 'neutral'] }}>{f.value}</Mono>
              </Box>
            ))}
          </Box>
          {r.data.tables.map((t) => (
            <Box key={t.title} sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.5 }}>{t.title}</Typography>
              {t.rows.length === 0 ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>{t.empty ?? 'Nothing.'}</Typography> : (
                <Box sx={{ overflowX: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)' }}>
                  <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr>{t.columns.map((c) => <Box component="th" key={c} sx={{ textAlign: 'left', p: 1, fontSize: 11.5, color: 'var(--c-text-3)', fontWeight: 500, borderBottom: '1px solid var(--c-divider)', whiteSpace: 'nowrap' }}>{c}</Box>)}</tr></thead>
                    <tbody>{t.rows.map((row, i) => <tr key={i}>{row.map((c, j) => <Box component="td" key={j} sx={{ p: 1, borderBottom: '1px solid var(--c-divider)', verticalAlign: 'top' }}>{c}</Box>)}</tr>)}</tbody>
                  </Box>
                </Box>
              )}
            </Box>
          ))}
          {unseen
            ? <TextField label="Note for the record (optional)" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={1} />
            : <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Seen by {r.seenBy ?? 'someone'} on {String(r.seenAt).slice(0, 16).replace('T', ' ')}{r.seenNote ? ` — “${r.seenNote}”` : ''}.</Typography>}
        </Box>
      )}
    </FormDialog>
  );
}

/**
 * THE MD'S PAGE (init.sql §113; user 2026-11-19): four questions, top to bottom — what needs my decision, what must I
 * verify, what is going wrong, how is each department doing. One read (GET /md/overview); every action is on the row.
 */
export default function MdOverview() {
  const company = useCompanySlug();
  const d = useLoad(() => getMdOverview(), []);
  const [patched, setPatched] = useState<Map<number, Alert>>(new Map());
  const [open, setOpen] = useState<MdReportHead | null>(null);
  const alerts = useMemo(() => (d.data?.alerts ?? []).map((a) => patched.get(a.id) ?? a).filter((a) => a.status !== 'resolved'), [d.data, patched]);
  const o = d.data;
  return (
    <Box sx={{ minWidth: 0 }}>
      <ErrorNotice error={d.error} onRetry={d.reload} />
      {!o && !d.error && <SkeletonRows rows={8} />}
      {o && (
        <Box sx={{ display: 'grid', gap: 1.5 }} data-testid="md-overview">
          {o.standIn.on && (
            <MuiAlert severity={o.standIn.you ? 'warning' : 'info'}>
              {o.standIn.you ? 'You are standing in for the MD: you can decide everything on this page until the switch is turned off in Settings.' : `${o.standIn.name ?? 'A stand-in'} is deciding for the MD. Turn it off in Setup › Settings.`}
            </MuiAlert>
          )}
          <Band testid="md-decisions" title="1 · Needs your decision" count={o.decisions.rows.length} tone="danger"
            hint={o.decisions.rows.length ? `The oldest came in ${ageText(o.decisions.oldestDays)}. Requests from every department, in one list.` : 'Nothing waits for you.'}
            action={<Button size="small" component={Link} to={appPath(company, 'approvals?status=decided')}>What was decided</Button>}>
            {o.decisions.rows.length ? o.decisions.rows.map((r) => <DecisionRow key={`${r.source}${r.id}`} r={r} onDone={d.reload} />) : <Empty>No request is waiting.</Empty>}
          </Band>

          <Band testid="md-reports" title="2 · To verify" count={o.reports.toVerify.length} hint="Weekly reports. Read each, then mark it seen: your name and the time are kept.">
            {o.reports.toVerify.length === 0 && o.reports.seen.length === 0 && <Empty>No report yet. The first ones are made after the week ends.</Empty>}
            {[...o.reports.toVerify, ...o.reports.seen].map((r) => (
              <Box key={r.id} sx={rowSx} data-testid="md-report-row">
                <Badge family="info" label={r.department} noIcon />
                <Box sx={{ flex: '3 1 260px', minWidth: 0 }}>
                  <Box sx={{ fontSize: 14 }}>{r.label} <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>· {r.periodStart} to {r.periodEnd}</Typography></Box>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{r.headline}</Typography>
                </Box>
                <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  {r.seenAt && <Typography sx={{ fontSize: 12.5, color: 'var(--c-success-700)' }}>Seen by {r.seenBy ?? '—'}</Typography>}
                  <Button size="small" variant={r.seenAt ? 'text' : 'contained'} onClick={() => setOpen(r)}>Open</Button>
                </Box>
              </Box>
            ))}
          </Band>

          <Band testid="md-alerts" title="3 · Going wrong" count={alerts.length} tone="danger" hint="Only what has passed the limit set for the MD in Settings."
            action={<Button size="small" component={Link} to={appPath(company, 'alerts?dept=md')}>All alerts</Button>}>
            {alerts.length ? alerts.map((a) => <AlertRow key={a.id} a={a} compact onChanged={(x) => setPatched((p) => new Map(p).set(x.id, x))} />) : <Empty>No open alert has reached you.</Empty>}
          </Band>

          <Band testid="md-departments" title="4 · Departments" hint="Each tile opens that department's own screen.">
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 1, p: 1.5 }}>
              {o.departments.map((p) => (
                <Box key={p.key} component={Link} to={appPath(company, p.link)} data-testid="md-dept"
                  sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', p: 1.25, textDecoration: 'none', color: 'inherit', minWidth: 0, '&:hover': { background: 'var(--c-surface-2)' } }}>
                  <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', mb: 0.5 }}>
                    <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: DOT[p.status], flex: '0 0 auto' }} />
                    <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{p.label}</Typography>
                  </Box>
                  {p.lines.map((l) => <Typography key={l} sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{l}</Typography>)}
                </Box>
              ))}
            </Box>
          </Band>
        </Box>
      )}
      <ReportDialog head={open} onClose={() => setOpen(null)} onSeen={d.reload} />
    </Box>
  );
}
