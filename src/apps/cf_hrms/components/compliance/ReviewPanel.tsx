/**
 * Compliance › Review (CF_HRMS_HIRING_SPEC.md §36.5) — the company's CA:
 *   Rule sets       every rule set in force (from the law layer) with its review state; open one to see
 *                   each rule's value, source and verified flag, and comment / approve / question it
 *   What changed    since the last yearly sign-off: what was published, which sets changed, open questions
 *   Trace           one person in one run: every payslip line with the rule version it used
 *   Sign-off        the yearly record (it ticks "Reviewed by our CA for <year>" on Tax settings)
 *   Review pack     every rule in force as Excel or PDF
 * Writing needs the "Review compliance (CA)" right (the Reviewer (CA) role); everybody with Compliance
 * view reads it. The "Rules in force" page itself is the law layer's (linked when it is in the menu).
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Chip, FormControlLabel, Checkbox, Link, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Callout, DetailSkeleton, EmptyState, ErrorNotice, SectionCard, SideSheet, ToneBadge, errorMessage, useToast } from '@shared/ui';
import { complianceApi, type RuleSetDetail, type RuleSetSummary, type Trace } from '../../api/compliance';
import { saveBase64File } from '../../api/excel';
import { SECTIONS } from '../../navMeta';

const TONE = { PENDING: 'neutral', APPROVED: 'success', QUESTIONED: 'warning' } as const;
const WORD = { PENDING: 'To review', APPROVED: 'Approved', QUESTIONED: 'Questioned' } as const;
const fmt = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const currentYear = () => { const d = new Date(); const s = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${s}-${String((s + 1) % 100).padStart(2, '0')}`; };
/** The law layer's own "Rules in force" screen, when the menu has one. */
const RULES_PAGE = SECTIONS.flatMap((s) => s.screens).find((x) => /rules/i.test(x.path) && /force|law/i.test(`${x.label} ${x.path}`))?.path ?? null;

function SetSheet({ set, onClose, onChanged }: { set: string | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<{ set: RuleSetDetail; canReview: boolean } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [text, setText] = useState('');
  const [ruleKey, setRuleKey] = useState('');
  useEffect(() => { if (!set) return; setD(null); complianceApi.set(set).then(setD).catch(setError); }, [set]);
  const send = async (action: 'COMMENT' | 'APPROVE' | 'QUESTION') => {
    if (!set) return;
    try { const r = await complianceApi.comment(set, { action, body: text || undefined, ruleKey: ruleKey || null }); setD((x) => (x ? { ...x, set: r.set } : x)); setText(''); toast.success(action === 'APPROVE' ? 'Approved.' : action === 'QUESTION' ? 'Questioned.' : 'Comment added.'); onChanged(); } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <SideSheet open={Boolean(set)} onClose={onClose} title={d?.set.label ?? 'Rule set'} width={640}>
      <ErrorNotice error={error} />
      {!d && !error && <DetailSkeleton />}
      {d && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <ToneBadge tone={TONE[d.set.status]} label={WORD[d.set.status]} />
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
              {d.set.changedSinceDecision ? 'Changed since it was decided — review it again. ' : ''}{d.set.decidedBy ? `${d.set.decidedStatus === 'APPROVED' ? 'Approved' : 'Questioned'} by ${d.set.decidedBy}, ${fmt(d.set.decidedAt)}` : 'Not reviewed yet.'}
            </Typography>
          </Stack>
          {d.set.ruleList.map((r) => (
            <Box key={String(r.id)} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', p: 1.5 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{r.ruleKey}{r.regime ? ` (${r.regime.toLowerCase()} regime)` : ''}</Typography>
                {r.version != null && <Chip size="small" label={`v${r.version}`} />}
                <ToneBadge tone={r.verified ? 'success' : 'warning'} label={r.verified ? 'Verified' : 'Not verified'} />
                {r.effectiveFrom && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>from {r.effectiveFrom}</Typography>}
              </Stack>
              <Typography sx={{ fontSize: 12.5, mt: 0.5, wordBreak: 'break-word' }}>{r.valueWords || '—'}</Typography>
              {r.sourceNote && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.5 }}>{r.sourceNote.slice(0, 400)}</Typography>}
              {r.sourceUrl && <Link href={r.sourceUrl} target="_blank" rel="noopener noreferrer" sx={{ fontSize: 12 }}>Source</Link>}
            </Box>
          ))}
          <SectionCard title="Comments" subtitle={`${d.set.commentList.length} so far`}>
            {d.set.commentList.map((c) => (
              <Typography key={c.id} sx={{ fontSize: 12.5, mb: 0.75 }}>
                <b>{c.action === 'COMMENT' ? 'Comment' : c.action === 'APPROVE' ? 'Approved' : 'Question'}</b> — {c.by}, {fmt(c.at)}{c.ruleKey ? ` (${c.ruleKey})` : ''}: {c.body ?? ''}
              </Typography>
            ))}
            {d.canReview ? (
              <Stack spacing={1} sx={{ mt: 1 }}>
                <TextField select size="small" label="About a rule (optional)" value={ruleKey} onChange={(e) => setRuleKey(e.target.value)}>
                  <MenuItem value="">The whole set</MenuItem>
                  {d.set.ruleList.map((r) => <MenuItem key={String(r.id)} value={r.ruleKey}>{r.ruleKey}</MenuItem>)}
                </TextField>
                <TextField size="small" multiline minRows={2} label="Words" value={text} onChange={(e) => setText(e.target.value)} />
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" color="success" onClick={() => void send('APPROVE')}>Approve</Button>
                  <Button variant="outlined" color="warning" disabled={!text.trim()} onClick={() => void send('QUESTION')}>Question</Button>
                  <Button disabled={!text.trim()} onClick={() => void send('COMMENT')}>Comment</Button>
                </Stack>
              </Stack>
            ) : <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Only the company’s CA (the Reviewer (CA) role) comments, approves or questions.</Typography>}
          </SectionCard>
        </Stack>
      )}
    </SideSheet>
  );
}

function RuleSets() {
  const navigate = useNavigate();
  const { company } = useParams<{ company: string }>();
  const [data, setData] = useState<Awaited<ReturnType<typeof complianceApi.sets>> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => { complianceApi.sets().then(setData).catch(setError); }, []);
  useEffect(load, [load]);
  return (
    <Box>
      {data && !data.lawLayer.connected && <Callout tone="info" title="From the tax rules and your statutory settings" sx={{ mb: 2 }}>The law layer is not wired in yet; the rule sets come from what payroll uses today.</Callout>}
      {RULES_PAGE && <Button size="small" sx={{ mb: 1 }} onClick={() => navigate(`/${company}/cf_hrms/${RULES_PAGE}`)}>Open Rules in force</Button>}
      <ErrorNotice error={error} onRetry={load} />
      {!data && !error && <DetailSkeleton />}
      {data && !data.sets.length && <EmptyState title="No rules in force" hint="Nothing to review yet." />}
      <SectionCard flush>
        {(data?.sets ?? []).map((s: RuleSetSummary) => (
          <Box key={s.set} role="button" tabIndex={0} data-testid={`ruleset-${s.set}`} onClick={() => setOpen(s.set)} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(s.set); }}
            sx={{ display: 'flex', gap: 1.5, alignItems: 'center', px: 2, py: 1.25, borderTop: '1px solid var(--c-border)', cursor: 'pointer', '&:hover': { background: 'var(--c-surface-2)' }, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 500, flex: '1 1 200px' }}>{s.label}</Typography>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{s.rules} rule{s.rules === 1 ? '' : 's'}{s.unverified ? ` · ${s.unverified} not verified` : ''}{s.comments ? ` · ${s.comments} comments` : ''}</Typography>
            <ToneBadge tone={TONE[s.status]} label={s.changedSinceDecision ? 'Changed — review again' : WORD[s.status]} />
          </Box>
        ))}
      </SectionCard>
      <SetSheet set={open} onClose={() => setOpen(null)} onChanged={load} />
    </Box>
  );
}

function WhatChanged() {
  const [d, setD] = useState<Awaited<ReturnType<typeof complianceApi.changes>> | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { complianceApi.changes().then(setD).catch(setError); }, []);
  if (error) return <ErrorNotice error={error} />;
  if (!d) return <DetailSkeleton />;
  return (
    <Stack spacing={2}>
      <Typography sx={{ fontSize: 13 }}>{d.lastSignoff ? `Since the sign-off of ${d.lastSignoff.year} by ${d.lastSignoff.by} on ${fmt(d.lastSignoff.at)}.` : 'No year has been signed off yet: everything counts as new.'}</Typography>
      <SectionCard title="Published since" subtitle={`${d.publications.length}`}>
        {d.publications.length ? d.publications.map((p) => <Typography key={p.id} sx={{ fontSize: 12.5, mb: 0.5 }}>• {p.title} — {p.domain}{p.jurisdiction !== 'IN' ? ` (${p.jurisdiction})` : ''}, from {p.effectiveFrom} (published {fmt(p.publishedAt)})</Typography>)
          : <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Nothing.</Typography>}
      </SectionCard>
      <SectionCard title="Rule sets changed" subtitle={`${d.changedSets.length}`}>
        {d.changedSets.length ? d.changedSets.map((s) => <Typography key={s.set} sx={{ fontSize: 12.5, mb: 0.5 }}>• {s.label}{s.isNew ? ' (new)' : ''} — {WORD[s.status as keyof typeof WORD] ?? s.status}</Typography>)
          : <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>None.</Typography>}
      </SectionCard>
      <SectionCard title="Open questions" subtitle={`${d.openQuestions.length}`}>
        {d.openQuestions.length ? d.openQuestions.map((q, i) => <Typography key={i} sx={{ fontSize: 12.5, mb: 0.5 }}>• {q.label}: “{q.body}” — {q.by}, {fmt(q.at)}</Typography>)
          : <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>None.</Typography>}
      </SectionCard>
    </Stack>
  );
}

function TracePanel({ canTrace }: { canTrace: boolean }) {
  const [runs, setRuns] = useState<{ id: number; month: string; status: string; people: number }[]>([]);
  const [runId, setRunId] = useState<number | ''>('');
  const [people, setPeople] = useState<{ employeeId: number; code: string; name: string }[]>([]);
  const [emp, setEmp] = useState<number | ''>('');
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { if (canTrace) complianceApi.runs().then((r) => setRuns(r.runs)).catch(setError); }, [canTrace]);
  useEffect(() => { setPeople([]); setEmp(''); setTrace(null); if (runId) complianceApi.people(runId).then((r) => setPeople(r.people)).catch(setError); }, [runId]);
  useEffect(() => { setTrace(null); if (runId && emp) complianceApi.trace(runId, emp).then(setTrace).catch(setError); }, [runId, emp]);
  if (!canTrace) return <Callout tone="neutral" title="Pay is hidden">A calculation trace shows pay: it needs Payroll view and See pay.</Callout>;
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField select size="small" label="Payroll run" value={runId} onChange={(e) => setRunId(Number(e.target.value) || '')} sx={{ minWidth: 200 }}>
          {runs.map((r) => <MenuItem key={r.id} value={r.id}>{r.month} · {r.status.toLowerCase()} · {r.people} people</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Person" value={emp} onChange={(e) => setEmp(Number(e.target.value) || '')} sx={{ minWidth: 260 }} disabled={!people.length}>
          {people.map((p) => <MenuItem key={p.employeeId} value={p.employeeId}>{p.code} · {p.name}</MenuItem>)}
        </TextField>
      </Stack>
      <ErrorNotice error={error} />
      {!runs.length && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>No calculated run yet.</Typography>}
      {trace && (
        <SectionCard title={`${trace.person.code} · ${trace.person.name} — ${trace.run.month}`} subtitle={`${trace.person.structure ?? 'No structure'} · ${trace.person.payableDays} payable days · gross ${rupees(trace.person.gross)} · net ${rupees(trace.person.net)}`}>
          <Callout tone={trace.basis === 'SNAPSHOT' ? 'success' : 'info'} title={trace.basis === 'SNAPSHOT' ? 'The rule versions the run stored' : 'Derived'} sx={{ mb: 1.5 }}>{trace.basisWords}</Callout>
          {trace.reproduced && (
            <Callout tone={trace.reproduced.error ? 'warning' : trace.reproduced.same ? 'success' : 'danger'} title={trace.reproduced.error ? 'Could not recompute the run' : trace.reproduced.same ? 'Recomputed with those versions: the same' : 'Recomputed with those versions: different'} sx={{ mb: 1.5 }}>
              {trace.reproduced.error ?? (trace.reproduced.same ? 'The law layer ran this month again with exactly the stored versions (nothing written); every line of this person comes out as paid.' : (trace.reproduced.differences ?? []).join(' · '))}
            </Callout>
          )}
          <Box sx={{ overflowX: 'auto' }}>
            <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, '& td, & th': { borderTop: '1px solid var(--c-border)', p: 0.75, textAlign: 'left', verticalAlign: 'top' } }}>
              <thead><tr><th>Line</th><th>Amount</th><th>How</th><th>Rule used</th></tr></thead>
              <tbody>
                {trace.lines.map((l, i) => (
                  <tr key={`${l.code}-${i}`} data-testid={`trace-${l.code}`}>
                    <td>{l.name}<br /><span style={{ color: 'var(--c-text-2)' }}>{l.kind.toLowerCase().replace('_', ' ')} · {l.source.toLowerCase()}</span></td>
                    <td>{rupees(l.amount)}</td>
                    <td style={{ maxWidth: 260 }}>{l.basis ?? '—'}</td>
                    <td>{l.rule ? (l.rule.missing ? <span style={{ color: 'var(--c-danger-600)' }}>{l.rule.missing}</span> : `${l.rule.domain ?? ''} ${l.rule.ruleKey ?? ''} v${l.rule.version ?? 1}${l.rule.jurisdiction && l.rule.jurisdiction !== 'IN' ? ` (${l.rule.jurisdiction})` : ''}${l.rule.verified === false ? ' — not verified' : ''}`) : <span style={{ color: 'var(--c-text-2)' }}>the salary structure</span>}</td>
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>
          {trace.tax && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 1 }}>TDS: {trace.tax.year} {trace.tax.regime?.toLowerCase()} regime{trace.tax.projectedTax != null ? `, projected tax ${rupees(trace.tax.projectedTax)}` : ''}.</Typography>}
        </SectionCard>
      )}
    </Stack>
  );
}

function SignOff() {
  const toast = useToast();
  const [d, setD] = useState<Awaited<ReturnType<typeof complianceApi.signoffs>> | null>(null);
  const [year, setYear] = useState(currentYear());
  const [note, setNote] = useState('');
  const [withOpen, setWithOpen] = useState(false);
  const load = useCallback(() => { complianceApi.signoffs().then(setD).catch((e) => toast.error(errorMessage(e))); }, [toast]);
  useEffect(load, [load]);
  const sign = async () => {
    try { const r = await complianceApi.signOff({ year, note: note || undefined, withOpenQuestions: withOpen }); toast.success(r.caNote); load(); } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <Stack spacing={2}>
      <SectionCard title="Yearly sign-offs" subtitle="Each one ticks “Reviewed by our CA for <year>” on Tax settings, and every tax screen’s banner goes.">
        {(d?.signoffs ?? []).map((s) => <Typography key={s.id} sx={{ fontSize: 13, mb: 0.5 }}>• <b>{s.year}</b> — {s.by}, {fmt(s.at)} ({s.sets} rule sets){s.note ? ` — ${s.note}` : ''}</Typography>)}
        {d && !d.signoffs.length && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>No year signed off yet.</Typography>}
      </SectionCard>
      {d?.canSignOff && (
        <SectionCard title="Sign off a year">
          <Stack spacing={1.5}>
            <TextField size="small" label="Tax year" value={year} onChange={(e) => setYear(e.target.value)} sx={{ maxWidth: 160 }} />
            <TextField size="small" multiline minRows={2} label="Note (what you checked)" value={note} onChange={(e) => setNote(e.target.value)} />
            <FormControlLabel control={<Checkbox checked={withOpen} onChange={(e) => setWithOpen(e.target.checked)} />} label="Sign off even with questions still open (they stay on record)" />
            <Box><Button variant="contained" onClick={() => void sign()}>Sign off {year}</Button></Box>
          </Stack>
        </SectionCard>
      )}
    </Stack>
  );
}

function Pack() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const get = async (format: 'xlsx' | 'pdf') => {
    setBusy(format);
    try { saveBase64File(await complianceApi.pack(format)); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  return (
    <SectionCard title="Review pack" subtitle="Every rule in force for this company — value, source, verified flag, version and worked examples — with each set’s review state, the comments and the sign-offs.">
      <Stack direction="row" spacing={1}>
        <Button variant="contained" disabled={Boolean(busy)} onClick={() => void get('xlsx')}>Download Excel</Button>
        <Button variant="outlined" disabled={Boolean(busy)} onClick={() => void get('pdf')}>Download PDF</Button>
      </Stack>
    </SectionCard>
  );
}

const VIEWS = [['sets', 'Rule sets'], ['changes', 'What changed'], ['trace', 'Calculation trace'], ['signoff', 'Sign-off'], ['pack', 'Review pack']] as const;

export function ReviewPanel() {
  const [view, setView] = useState<(typeof VIEWS)[number][0]>('sets');
  const [canTrace, setCanTrace] = useState(false);
  useEffect(() => { complianceApi.sets().then((s) => setCanTrace(s.canTrace)).catch(() => setCanTrace(false)); }, []);
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
        {VIEWS.map(([k, label]) => <Chip key={k} label={label} color={view === k ? 'primary' : 'default'} onClick={() => setView(k)} data-testid={`review-${k}`} />)}
      </Stack>
      {view === 'sets' && <RuleSets />}
      {view === 'changes' && <WhatChanged />}
      {view === 'trace' && <TracePanel canTrace={canTrace} />}
      {view === 'signoff' && <SignOff />}
      {view === 'pack' && <Pack />}
    </Box>
  );
}

export default ReviewPanel;
