/**
 * /platform/compliance — the PRODUCT TEAM's compliance console (CF_HRMS_HIRING_SPEC.md §36.4), outside
 * any company. Opens for a login listed in platform_admins (granted by
 * apps/cf_hrms/scripts/grant-platform-admin.mjs); a company's Owner sees "not for you".
 *
 *   Notices     what the watcher found on the official sites: open one, link it to a rule, draft the new
 *               version (the law layer's draft flow), publish it (every company is told), or dismiss it
 *   Sources     the official pages the watcher reads, each with its last check, last change and error
 *   Published   the history: what, when, by whom, companies told and acknowledged
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, Chip, Link, MenuItem, Stack, TextField, Typography } from '@mui/material';
import {
  Callout, DetailSkeleton, DetailTabs, EmptyState, ErrorNotice, FormDialog, PageHeader, PromptDialog, SectionCard, SideSheet,
  ThemeScope, ToastProvider, ToneBadge, errorMessage, useToast,
} from '@shared/ui';
import { platformApi, type LawStatus, type Notice, type Publication, type RuleRef, type Source } from './platformApi';

const DOMAINS = ['TAX', 'PF', 'ESI', 'PT', 'LWF', 'MIN_WAGE', 'BONUS', 'GRATUITY', 'OVERTIME', 'LEAVE_MIN', 'WAGES'];
const when = (s: string | null) => (s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const STATUS_TONE = { NEVER: 'neutral', OK: 'success', CHANGED: 'info', ERROR: 'danger', BLOCKED: 'warning' } as const;
const NOTICE_TONE = { NEW: 'info', OPEN: 'warning', LINKED: 'warning', PUBLISHED: 'success', DISMISSED: 'neutral' } as const;
const today = () => new Date().toISOString().slice(0, 10);

function parseJson(text: string): { value?: unknown; error?: string } {
  if (!text.trim()) return {};
  try { return { value: JSON.parse(text) }; } catch (e) { return { error: `The value is not JSON: ${(e as Error).message}` }; }
}

/* ── one notice ───────────────────────────────────────────────────────── */
function NoticeSheet({ id, law, rules, onClose, onChanged }: { id: number | null; law: LawStatus | null; rules: RuleRef[]; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [n, setN] = useState<Notice | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [link, setLink] = useState({ domain: 'PT', jurisdiction: 'TG', ruleKey: 'settings' });
  const [form, setForm] = useState({ title: '', summary: '', effectiveFrom: today(), value: '', versionLabel: '', taxYear: '', regime: 'NEW' });
  const [dismissing, setDismissing] = useState(false);
  useEffect(() => {
    if (!id) return;
    setN(null); setError(null);
    platformApi.open(id).then((r) => {
      setN(r.notice);
      const d = r.notice.domain ?? r.notice.source?.domains?.find((x) => x !== 'ALL') ?? 'PT';
      setLink({ domain: d, jurisdiction: r.notice.jurisdiction ?? r.notice.source?.jurisdictions?.[0] ?? 'IN', ruleKey: r.notice.ruleKey ?? (d === 'MIN_WAGE' ? 'ALL_EMPLOYMENTS' : 'settings') });
      setForm((f) => ({ ...f, title: r.notice.title.slice(0, 300) }));
      onChanged();
    }).catch(setError);
  }, [id, onChanged]);
  const lawCan = Boolean(law?.present && !law.missing.includes('publishVersion') && !law.missing.includes('draftVersion'));
  const keys = useMemo(() => [...new Set(rules.filter((r) => r.domain === link.domain).map((r) => r.ruleKey))], [rules, link.domain]);
  const run = async (fn: () => Promise<{ notice: Notice } & Record<string, unknown>>, ok: string) => {
    try { const r = await fn(); setN(r.notice); toast.success(ok); onChanged(); return r; } catch (e) { toast.error(errorMessage(e)); return null; }
  };
  const valueOf = () => { const v = parseJson(form.value); if (v.error) { toast.error(v.error); return undefined; } return v; };
  const draft = async () => {
    const v = valueOf(); if (!v) return;
    const body: Record<string, unknown> = { value: v.value, effectiveFrom: form.effectiveFrom, title: form.title, sourceNote: `${n?.title} — ${n?.url}` };
    if (link.domain === 'TAX') Object.assign(body, { taxYear: form.taxYear, regime: form.regime });
    await run(() => platformApi.draft(n!.id, body), 'Draft made in the law layer.');
  };
  const publish = async () => {
    const v = valueOf(); if (!v) return;
    const r = await run(() => platformApi.publish(n!.id, { title: form.title, summary: form.summary || null, effectiveFrom: form.effectiveFrom, value: v.value, versionLabel: form.versionLabel || null }), 'Published.');
    if (r && Array.isArray(r.notified)) toast.success(`${r.notified.length} companies told.`);
  };
  const closed = n && ['PUBLISHED', 'DISMISSED'].includes(n.status);
  return (
    <SideSheet open={Boolean(id)} onClose={onClose} title={n?.title ?? 'Notice'} subtitle={n ? `${n.source?.name ?? ''} · found ${when(n.foundAt)}` : undefined} width={620}>
      <ErrorNotice error={error} />
      {!n && !error && <DetailSkeleton />}
      {n && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
            <ToneBadge tone={NOTICE_TONE[n.status]} label={n.status.toLowerCase()} />
            <Chip size="small" label={n.changeKind === 'NEW' ? 'New on the page' : 'Changed on the page'} />
            {n.itemDate && <Chip size="small" label={`dated ${n.itemDate}`} />}
            <Link href={n.url} target="_blank" rel="noopener noreferrer" sx={{ fontSize: 13 }}>Open the notice</Link>
          </Stack>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>No summary is written by the app (title, link, date and source only). Read the notice, then link it to the rule it changes.</Typography>
          {n.status === 'DISMISSED' && <Callout tone="neutral" title="Dismissed">{n.dismissedReason}</Callout>}
          {n.status === 'PUBLISHED' && <Callout tone="success" title="Published">Every company with CF HRMS was told (publication {n.publicationId}).</Callout>}
          {!closed && (
            <SectionCard title="1. Link it to a rule" subtitle={n.ruleKey ? `Linked: ${n.domain} · ${n.jurisdiction} · ${n.ruleKey}` : 'Which rule does it change?'}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField select size="small" label="Domain" value={link.domain} onChange={(e) => setLink({ ...link, domain: e.target.value })} sx={{ minWidth: 130 }}>
                  {DOMAINS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                </TextField>
                <TextField size="small" label="Jurisdiction" value={link.jurisdiction} onChange={(e) => setLink({ ...link, jurisdiction: e.target.value.toUpperCase().slice(0, 2) })} sx={{ width: 110 }} helperText="IN or TG …" />
                <Autocomplete freeSolo size="small" options={keys} value={link.ruleKey} onInputChange={(_, v) => setLink({ ...link, ruleKey: v })} sx={{ flex: 1, minWidth: 160 }}
                  renderInput={(p) => <TextField {...p} label="Rule" />} />
                <Button variant="outlined" onClick={() => void run(() => platformApi.link(n.id, link), 'Linked.')}>Link</Button>
              </Stack>
            </SectionCard>
          )}
          {!closed && n.status === 'LINKED' && (
            <SectionCard title={lawCan ? '2. Draft the new version, then publish' : '2. Publish'} subtitle={lawCan ? (n.ruleVersionId ? `Draft ${n.ruleVersionId} is ready in the law layer — its worked examples run when you publish.` : 'The law layer keeps the draft and runs its worked examples on publishing.') : 'The law layer is not wired in yet: the value and the words below are published with the notice.'}>
              <Stack spacing={1.25}>
                <TextField size="small" label="Title (what changed)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                <TextField size="small" multiline minRows={2} label="Words for HR (what it means for them)" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
                <Stack direction="row" spacing={1}>
                  <TextField size="small" type="date" label="In force from" InputLabelProps={{ shrink: true }} value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
                  <TextField size="small" label="Version label" value={form.versionLabel} onChange={(e) => setForm({ ...form, versionLabel: e.target.value })} />
                  {link.domain === 'TAX' && <TextField size="small" label="Tax year" placeholder="2026-27" value={form.taxYear} onChange={(e) => setForm({ ...form, taxYear: e.target.value })} sx={{ width: 110 }} />}
                  {link.domain === 'TAX' && <TextField select size="small" label="Regime" value={form.regime} onChange={(e) => setForm({ ...form, regime: e.target.value })}><MenuItem value="NEW">NEW</MenuItem><MenuItem value="OLD">OLD</MenuItem></TextField>}
                </Stack>
                <TextField size="small" multiline minRows={4} label="The rule's new value (JSON; worked examples in value.examples)" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} sx={{ '& textarea': { fontFamily: 'monospace', fontSize: 12 } }} />
                <Stack direction="row" spacing={1}>
                  {lawCan && <Button variant="outlined" onClick={() => void draft()}>Draft a new version</Button>}
                  <Button variant="contained" disabled={lawCan && !n.ruleVersionId} onClick={() => void publish()}>Publish</Button>
                </Stack>
              </Stack>
            </SectionCard>
          )}
          {!closed && <Box><Button color="inherit" onClick={() => setDismissing(true)}>Dismiss…</Button></Box>}
          <PromptDialog open={dismissing} title="Dismiss this notice" label="Why (an office order, not a rule; already published …)" confirmLabel="Dismiss"
            onClose={() => setDismissing(false)} onConfirm={async (reason) => { await run(() => platformApi.dismiss(n.id, reason), 'Dismissed.'); setDismissing(false); }} />
        </Stack>
      )}
    </SideSheet>
  );
}

function Notices({ law, rules }: { law: LawStatus | null; rules: RuleRef[] }) {
  const [status, setStatus] = useState('WAITING');
  const [data, setData] = useState<{ notices: Notice[]; counts: Record<string, number> } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<number | null>(null);
  const load = useCallback(() => { platformApi.notices(status).then((d) => { setData(d); setError(null); }).catch(setError); }, [status]);
  useEffect(load, [load]);
  const c = data?.counts ?? {};
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
        {[['WAITING', `Waiting (${(c.NEW ?? 0) + (c.OPEN ?? 0) + (c.LINKED ?? 0)})`], ['PUBLISHED', `Published (${c.PUBLISHED ?? 0})`], ['DISMISSED', `Dismissed (${c.DISMISSED ?? 0})`], ['ALL', 'All']].map(([k, l]) => (
          <Chip key={k} label={l} color={status === k ? 'primary' : 'default'} onClick={() => setStatus(k)} />
        ))}
      </Stack>
      <ErrorNotice error={error} onRetry={load} />
      {!data && !error && <DetailSkeleton />}
      {data && !data.notices.length && <EmptyState title="Nothing in the queue" hint="The watcher reads every source on its schedule; new or changed items land here." />}
      {data && data.notices.length > 0 && (
        <SectionCard flush>
          {data.notices.map((n) => (
            <Box key={n.id} role="button" tabIndex={0} data-testid={`pnotice-${n.id}`} onClick={() => setOpen(n.id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(n.id); }}
              sx={{ display: 'flex', gap: 1.5, alignItems: 'center', px: 2, py: 1.25, borderTop: '1px solid var(--c-border)', cursor: 'pointer', '&:hover': { background: 'var(--c-surface-2)' }, flexWrap: 'wrap' }}>
              <ToneBadge tone={NOTICE_TONE[n.status]} label={n.status.toLowerCase()} />
              <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 500 }}>{n.title}</Typography>
                <Typography noWrap sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{n.source?.code} · {n.changeKind === 'NEW' ? 'new' : 'changed'}{n.itemDate ? ` · dated ${n.itemDate}` : ''} · found {when(n.foundAt)}{n.ruleKey ? ` · ${n.domain}/${n.jurisdiction}/${n.ruleKey}` : ''}</Typography>
              </Box>
            </Box>
          ))}
        </SectionCard>
      )}
      <NoticeSheet id={open} law={law} rules={rules} onClose={() => setOpen(null)} onChanged={load} />
    </Box>
  );
}

/* ── sources ──────────────────────────────────────────────────────────── */
function Sources() {
  const toast = useToast();
  const [data, setData] = useState<{ sources: Source[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ code: '', name: '', url: '', kind: 'pdf_index', frequencyHours: '24', domains: 'TAX', jurisdictions: 'IN', linkPattern: '', alsoSites: '', note: '' });
  const load = useCallback(() => { platformApi.sources().then((d) => { setData(d); setError(null); }).catch(setError); }, []);
  useEffect(load, [load]);
  const check = async (s: Source) => {
    try {
      const r = await platformApi.check(s.id);
      if (r.result.skipped) toast.info('Another check is running for it.');
      else if (r.result.error) toast.error(`${s.code}: ${r.result.error}`);
      else toast.success(`${s.code}: ${r.result.items} items${r.result.found ? `, ${r.result.found.new} new, ${r.result.found.changed} changed` : ''}.`);
      load();
    } catch (e) { toast.error(errorMessage(e)); }
  };
  const toggle = async (s: Source) => { try { await platformApi.updateSource(s.id, { active: !s.active }); load(); } catch (e) { toast.error(errorMessage(e)); } };
  return (
    <Box>
      <Stack direction="row" sx={{ mb: 1.5, justifyContent: 'flex-end' }}><Button variant="contained" onClick={() => setAdding(true)}>Add a source</Button></Stack>
      <ErrorNotice error={error} onRetry={load} />
      {!data && !error && <DetailSkeleton />}
      <Stack spacing={1.5}>
        {(data?.sources ?? []).map((s) => (
          <SectionCard key={s.id} title={s.name} subtitle={`${s.code} · ${s.kind} · every ${s.frequencyHours} h · feeds ${s.domains.join(', ')} · ${s.jurisdictions.join(', ')}${s.active ? '' : ' · paused'}`}
            actions={<ToneBadge tone={STATUS_TONE[s.lastStatus]} label={s.lastStatus === 'NEVER' ? 'not checked' : s.lastStatus.toLowerCase()} />}>
            <Stack spacing={0.75} data-testid={`source-${s.code}`}>
              <Link href={s.url} target="_blank" rel="noopener noreferrer" sx={{ fontSize: 12.5, wordBreak: 'break-all' }}>{s.url}</Link>
              <Typography sx={{ fontSize: 12.5 }}>Last checked {when(s.lastCheckedAt)} · last change {when(s.lastChangeAt)} · {s.itemCount} items known · next {when(s.nextCheckAt)}</Typography>
              {s.lastError && <Callout tone={s.lastStatus === 'ERROR' || s.lastStatus === 'BLOCKED' ? 'danger' : 'info'} title={s.lastStatus === 'ERROR' || s.lastStatus === 'BLOCKED' ? `The last check failed${s.failCount > 1 ? ` (${s.failCount} times in a row)` : ''}` : 'Note'}>{s.lastError}</Callout>}
              {s.note && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{s.note}</Typography>}
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="outlined" onClick={() => void check(s)}>Check now</Button>
                <Button size="small" color="inherit" onClick={() => void toggle(s)}>{s.active ? 'Pause' : 'Resume'}</Button>
              </Stack>
            </Stack>
          </SectionCard>
        ))}
      </Stack>
      <FormDialog open={adding} title="Add a source" subtitle="An official page the watcher reads. Its first read is the starting point: nothing is queued from it." onClose={() => setAdding(false)}
        onSubmit={async () => {
          await platformApi.addSource({ code: f.code, name: f.name, url: f.url, kind: f.kind as Source['kind'], frequencyHours: Number(f.frequencyHours), domains: f.domains.split(/[ ,]+/).filter(Boolean), jurisdictions: f.jurisdictions.split(/[ ,]+/).filter(Boolean), linkPattern: f.linkPattern || null, alsoSites: f.alsoSites || null, note: f.note || null });
          toast.success('Added.'); load();
        }}>
        <Stack spacing={1.25}>
          <TextField size="small" label="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
          <TextField size="small" label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <TextField size="small" label="Address (https://…)" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
          <Stack direction="row" spacing={1}>
            <TextField select size="small" label="Kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} sx={{ minWidth: 140 }}>
              <MenuItem value="pdf_index">pdf_index — links to PDFs</MenuItem><MenuItem value="html_list">html_list — links</MenuItem><MenuItem value="rss">rss — a feed</MenuItem>
            </TextField>
            <TextField size="small" label="Every (hours)" value={f.frequencyHours} onChange={(e) => setF({ ...f, frequencyHours: e.target.value })} sx={{ width: 120 }} />
          </Stack>
          <TextField size="small" label="Feeds (domains)" helperText={DOMAINS.join(', ')} value={f.domains} onChange={(e) => setF({ ...f, domains: e.target.value.toUpperCase() })} />
          <TextField size="small" label="Jurisdictions" helperText="IN, TG …" value={f.jurisdictions} onChange={(e) => setF({ ...f, jurisdictions: e.target.value.toUpperCase() })} />
          <TextField size="small" label="Only links matching (optional pattern)" value={f.linkPattern} onChange={(e) => setF({ ...f, linkPattern: e.target.value })} />
          <TextField size="small" label="Its files are also on (optional sites)" value={f.alsoSites} onChange={(e) => setF({ ...f, alsoSites: e.target.value })} />
          <TextField size="small" label="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Stack>
      </FormDialog>
    </Box>
  );
}

function Published() {
  const [rows, setRows] = useState<Publication[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { platformApi.publications().then((r) => setRows(r.publications)).catch(setError); }, []);
  if (error) return <ErrorNotice error={error} />;
  if (!rows) return <DetailSkeleton />;
  if (!rows.length) return <EmptyState title="Nothing published yet" hint="A notice linked to a rule and published shows here, with the companies told." />;
  return (
    <SectionCard flush>
      {rows.map((p) => (
        <Box key={p.id} sx={{ px: 2, py: 1.25, borderTop: '1px solid var(--c-border)' }} data-testid={`pub-${p.id}`}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{p.title}</Typography>
            <Chip size="small" label={`${p.domain} · ${p.jurisdiction} · ${p.ruleKey}`} />
            <Chip size="small" label={p.via === 'LAW_LAYER' ? `law layer${p.ruleVersionId ? ` v-id ${p.ruleVersionId}` : ''}` : 'adapter'} />
          </Stack>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>In force from {p.effectiveFrom} · published {when(p.publishedAt)} by {p.publishedBy ?? '—'} · {p.companiesNotified} companies told · {p.acknowledged} acknowledged</Typography>
          {p.summary && <Typography sx={{ fontSize: 12.5 }}>{p.summary}</Typography>}
        </Box>
      ))}
    </SectionCard>
  );
}

function Console() {
  const [me, setMe] = useState<{ admin: { name: string; email: string }; lawLayer: LawStatus } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState('notices');
  const [rules, setRules] = useState<RuleRef[]>([]);
  useEffect(() => {
    platformApi.me().then((m) => { setMe(m); platformApi.rules().then((r) => setRules(r.rules)).catch(() => setRules([])); }).catch(setError);
  }, []);
  const refused = (error as { status?: number } | null)?.status === 403;
  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: { xs: 2, md: 3 } }}>
      <PageHeader title="Compliance console" subtitle={me ? `Product team · ${me.admin.name} (${me.admin.email}) · law layer ${me.lawLayer.connected ? 'connected' : `not wired in${me.lawLayer.missing.length ? ` (missing ${me.lawLayer.missing.join(', ')})` : ''}`}` : 'For the product team, outside any company.'} />
      {refused && <Callout tone="warning" title="This console is for the product team">Your login is not a platform admin. A company’s Owner manages its company inside the app; the law itself is kept here by the product team.</Callout>}
      {Boolean(error) && !refused && <ErrorNotice error={error} />}
      {!me && !error && <DetailSkeleton />}
      {me && (
        <>
          <DetailTabs tabs={[{ value: 'notices', label: 'Notices' }, { value: 'sources', label: 'Sources' }, { value: 'published', label: 'Published' }]} active={tab} onTab={setTab} />
          <Box sx={{ mt: 2 }} key={tab}>
            {tab === 'notices' && <Notices law={me.lawLayer} rules={rules} />}
            {tab === 'sources' && <Sources />}
            {tab === 'published' && <Published />}
          </Box>
        </>
      )}
    </Box>
  );
}

export default function PlatformCompliance() {
  return (
    <ThemeScope appSlug="platform">
      <ToastProvider>
        <Console />
      </ToastProvider>
    </ThemeScope>
  );
}
