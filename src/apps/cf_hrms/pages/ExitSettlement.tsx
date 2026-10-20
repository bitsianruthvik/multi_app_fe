/**
 * People › Exits › Full and final (payroll P3b) — one person's settlement.
 *
 *   none ─save draft─▶ DRAFT ─approve─▶ APPROVED ─(the payroll that takes it is marked paid)─▶ PAID
 *                        ▲    (worked out again      │ take the approval back while that payroll is not locked
 *                        └──── on every read) ◀──────┘
 *
 * The statement is the server's; this page never adds a number up. What the system cannot know is typed in
 * the form beside it — the notice period when the appointment has none, a waiver with its reason, days to
 * encash, a different gratuity with a note, amounts exempted by an earlier employer, a bonus, recoveries — and
 * every change is previewed (POST …/preview, a moment after typing stops) before it is saved.
 *
 * Approving needs the leaving closed (the person's page) and no problems; it pays with the payroll of the month
 * the statement names. Amounts need payroll view and the named pay view; changes need payroll edit.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Box, Button, Checkbox, CircularProgress, FormControlLabel, IconButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined';
import {
  Callout, ConfirmDialog, DetailSkeleton, ErrorNotice, PageHeader, PromptDialog, SectionCard, Surface, ToneBadge,
  errorMessage, errorProblems, useDetailTitle, useToast,
} from '@shared/ui';
import { useCan } from '../access/can';
import {
  RECOVERY_WORD, settlementApi,
  type SettlementDetail, type SettlementFresh, type SettlementInputs, type Statement,
} from '../api/payrollExit';
import { saveBase64File } from '../api/excel';
import { NeedPayView } from '../components/payroll/PayParts';
import { SettlementStatement } from '../components/payroll/SettlementStatement';
import { SETTLEMENT_TONE, parseAmount, rupees, stampDay } from '../components/payroll/payWords';
import { longDay } from '../components/jobDates';

export default function ExitSettlement() {
  const can = useCan();
  if (!can.named.payView) return can.settled ? <><PageHeader title="Full and final" /><NeedPayView what="Full and final settlements" /></> : <DetailSkeleton />;
  return <SettlementPage />;
}

/* ── the form, as typed ───────────────────────────────────────────────── */

type RecoveryKind = 'LOAN' | 'ASSET' | 'OTHER';
interface Form {
  noticeDays: string;
  waiveNotice: boolean;
  waiveNote: string;
  encashDays: string;
  gratuityAmount: string;
  gratuityNote: string;
  gratuityExemptedBefore: string;
  leaveExemptedBefore: string;
  bonus: { label: string; amount: string }[];
  recoveries: { kind: RecoveryKind; label: string; amount: string }[];
  note: string;
}
const str = (v: number | null | undefined) => (v == null || v === 0 ? '' : String(v));
function formOf(i: SettlementInputs | null | undefined): Form {
  return {
    noticeDays: i?.noticeDays != null ? String(i.noticeDays) : '',
    waiveNotice: Boolean(i?.waiveNotice),
    waiveNote: i?.waiveNote ?? '',
    encashDays: i?.encashDays != null ? String(i.encashDays) : '',
    gratuityAmount: i?.gratuityAmount != null ? String(i.gratuityAmount) : '',
    gratuityNote: i?.gratuityNote ?? '',
    gratuityExemptedBefore: str(i?.gratuityExemptedBefore),
    leaveExemptedBefore: str(i?.leaveExemptedBefore),
    bonus: (i?.bonus ?? []).map((b) => ({ label: b.label, amount: String(b.amount) })),
    recoveries: (i?.recoveries ?? []).map((r) => ({ kind: r.kind, label: r.label, amount: String(r.amount) })),
    note: i?.note ?? '',
  };
}
/** The body the server reads. Empty = not typed (the worked-out value is used). */
function inputsOf(f: Form): SettlementInputs {
  const num = (s: string): number | null => {
    const v = parseAmount(s);
    return v == null || !Number.isFinite(v) ? null : v;
  };
  return {
    noticeDays: num(f.noticeDays),
    waiveNotice: f.waiveNotice,
    waiveNote: f.waiveNotice ? f.waiveNote.trim() : '',
    encashDays: num(f.encashDays),
    gratuityAmount: num(f.gratuityAmount),
    gratuityNote: f.gratuityNote.trim(),
    gratuityExemptedBefore: num(f.gratuityExemptedBefore) ?? 0,
    leaveExemptedBefore: num(f.leaveExemptedBefore) ?? 0,
    bonus: f.bonus.filter((b) => b.label.trim() || b.amount.trim()).map((b) => ({ label: b.label.trim(), amount: num(b.amount) ?? 0 })),
    recoveries: f.recoveries.filter((r) => r.label.trim() || r.amount.trim()).map((r) => ({ kind: r.kind, label: r.label.trim(), amount: num(r.amount) ?? 0 })),
    note: f.note.trim(),
  };
}

function SettlementPage() {
  const { company = '', employeeId = '' } = useParams<{ company: string; employeeId: string }>();
  const empId = Number(employeeId);
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();

  const [data, setData] = useState<SettlementDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState<Form>(() => formOf(null));
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<SettlementFresh | null>(null);
  const [previewError, setPreviewError] = useState<unknown>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'pdf'>(null);
  const [ask, setAsk] = useState<null | 'approve' | 'unapprove' | 'remove'>(null);

  const adopt = useCallback((d: SettlementDetail) => {
    setData(d);
    setForm(formOf(d.settlement?.inputs ?? null));
    setDirty(false);
    setPreview(null);
    setPreviewError(null);
  }, []);
  const load = useCallback(() => {
    settlementApi.forEmployee(empId).then((d) => { adopt(d); setError(null); }).catch(setError);
  }, [empId, adopt]);
  useEffect(load, [load]);

  const s = data?.settlement ?? null;
  const editable = can.payroll.edit && (!s || s.status === 'DRAFT');

  // Live preview: a moment after typing stops.
  const seq = useRef(0);
  useEffect(() => {
    if (!dirty || !editable) return undefined;
    const mine = ++seq.current;
    const t = setTimeout(() => {
      setPreviewing(true);
      settlementApi.preview(empId, inputsOf(form))
        .then((p) => { if (mine === seq.current) { setPreview(p); setPreviewError(null); } })
        .catch((e) => { if (mine === seq.current) setPreviewError(e); })
        .finally(() => { if (mine === seq.current) setPreviewing(false); });
    }, 600);
    return () => clearTimeout(t);
  }, [form, dirty, editable, empId]);

  const statement: Statement | null = useMemo(() => {
    if (preview?.statement) return preview.statement;
    if (s && s.status !== 'DRAFT') return s.statement;
    return data?.fresh?.statement ?? s?.statement ?? null;
  }, [preview, s, data]);
  useDetailTitle(statement?.employee.name ?? null);

  const change = (patch: Partial<Form>) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };

  const save = async (): Promise<SettlementDetail> => {
    const d = await settlementApi.save(empId, inputsOf(form));
    adopt(d);
    return d;
  };
  const onSave = async () => {
    setBusy('save');
    try {
      await save();
      toast.success('Draft saved.');
    } catch (e) {
      setPreviewError(e);
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const download = async () => {
    if (!s) return;
    setBusy('pdf');
    try { saveBase64File(await settlementApi.file(s.id)); } catch (e) { toast.error(errorMessage(e, 'The PDF could not be made.')); } finally { setBusy(null); }
  };

  if (!data) return error ? <ErrorNotice error={error} fallback="This settlement could not be worked out." onRetry={load} /> : <DetailSkeleton />;

  const emp = statement?.employee;
  const exit = statement?.exit;
  const problems = preview ? preview.problems : (data.fresh?.problems ?? []);
  const payMonthLabel = statement?.payMonthLabel ?? null;

  return (
    <Box sx={{ pb: 6 }}>
      <Button component={RouterLink} to={`/${company}/cf_hrms/exits`} size="small" startIcon={<ArrowBackRounded />} sx={{ ml: -0.75, mb: 0.5 }}>
        Exits
      </Button>

      <Surface e={2} sx={{ p: { xs: 2, sm: 2.5 }, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
          <Typography component="h1" sx={{ fontSize: 20, fontWeight: 600 }}>Full and final{emp ? ` — ${emp.name}` : ''}</Typography>
          {s ? <ToneBadge tone={SETTLEMENT_TONE[s.status] ?? 'neutral'} label={s.statusWords} noIcon /> : <ToneBadge tone="neutral" label="Not saved yet" noIcon />}
        </Box>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5, overflowWrap: 'anywhere' }}>
          {[
            emp?.code,
            exit ? `${exit.type === 'RESIGNED' ? 'Resigned' : 'Removed'}${exit.noticeDate ? ` (notice ${longDay(exit.noticeDate)})` : ''}` : null,
            exit?.lastWorkingDay ? `last working day ${longDay(exit.lastWorkingDay)}` : null,
            exit?.status === 'OPEN' ? 'the leaving is not closed yet' : null,
            s?.approvedAt ? `approved ${stampDay(s.approvedAt)}` : null,
            s?.paidAt ? `paid ${stampDay(s.paidAt)}` : null,
          ].filter(Boolean).join(' · ')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }} data-fnf-actions="">
          {editable && (
            <Button variant={s ? 'outlined' : 'contained'} disabled={busy != null || (!dirty && !!s)} onClick={() => void onSave()} data-action="save-fnf"
              startIcon={busy === 'save' ? <CircularProgress size={14} color="inherit" /> : undefined}>
              Save draft
            </Button>
          )}
          {s?.status === 'DRAFT' && can.payroll.edit && (
            <Button variant="contained" disabled={busy != null} onClick={() => setAsk('approve')} data-action="approve-fnf">Approve</Button>
          )}
          {s?.status === 'APPROVED' && can.payroll.edit && (
            <Button variant="outlined" disabled={busy != null} onClick={() => setAsk('unapprove')} data-action="unapprove-fnf">Take approval back</Button>
          )}
          {s && (
            <Button variant="outlined" disabled={busy != null} onClick={() => void download()} data-action="fnf-pdf"
              startIcon={busy === 'pdf' ? <CircularProgress size={14} color="inherit" /> : <PictureAsPdfOutlined fontSize="small" />}>
              Download PDF
            </Button>
          )}
          {s?.status === 'DRAFT' && can.payroll.remove && (
            <Button color="inherit" disabled={busy != null} onClick={() => setAsk('remove')} data-action="remove-fnf">Remove draft</Button>
          )}
        </Box>
      </Surface>

      {exit?.status === 'OPEN' && (
        <Callout tone="warning" title="The leaving is not closed yet">
          The settlement can be drafted now, but it is approved only once the leaving is closed on the person’s page — until then the payroll pays them a full month.
        </Callout>
      )}
      {s?.status === 'APPROVED' && (
        <Callout tone="info" title={`Approved — pays in the ${s.payMonthLabel ?? 'next'} payroll`}>
          The figures are frozen. To change them, take the approval back (possible until that payroll is locked).
        </Callout>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: editable ? 'minmax(0, 1fr) 360px' : 'minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
        <Box sx={{ minWidth: 0, order: { xs: 2, md: 1 } }}>
          {previewing && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1 }}>Working it out again…</Typography>}
          {dirty && !previewing && preview && <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)', mb: 1 }}>Preview of your changes — not saved yet.</Typography>}
          {statement ? <SettlementStatement statement={{ ...statement, problems }} /> : <Callout title="Nothing to show yet">{errorMessage(previewError, 'The statement could not be worked out.')}</Callout>}
        </Box>
        {editable && (
          <Box sx={{ minWidth: 0, order: { xs: 1, md: 2 }, position: { md: 'sticky' }, top: { md: 16 } }}>
            <InputsCard form={form} statement={statement} change={change} previewError={previewError} />
          </Box>
        )}
      </Box>

      <ConfirmDialog
        open={ask === 'approve'}
        title="Approve this full and final?"
        body={`It pays in the ${payMonthLabel ?? 'next'} payroll${statement ? `: ${rupees(statement.totals.net)} net, as worked out now` : ''}. The figures are frozen until the approval is taken back.${dirty ? ' Your changes are saved first.' : ''}`}
        confirmLabel="Approve"
        onClose={() => setAsk(null)}
        onConfirm={async () => {
          let id = s?.id;
          if (dirty) id = (await save()).settlement?.id;
          if (id == null) throw new Error('Save the draft first.');
          adopt(await settlementApi.approve(id));
          toast.success(`Approved — pays in the ${payMonthLabel ?? 'next'} payroll.`);
        }}
      />
      {ask === 'unapprove' && s && (
        <PromptDialog
          open
          title="Take the approval back?"
          body="It goes back to a draft and is worked out again. Not possible once the payroll that pays it is locked."
          label="Why (optional)"
          required={false}
          multiline
          confirmLabel="Take approval back"
          onClose={() => setAsk(null)}
          onConfirm={async (note) => { adopt(await settlementApi.unapprove(s.id, note.trim() || undefined)); toast.success('Back to a draft.'); }}
        />
      )}
      <ConfirmDialog
        open={ask === 'remove'}
        title="Remove this draft?"
        body="What was typed goes. The statement can be worked out again any time."
        confirmLabel="Remove draft"
        danger
        onClose={() => setAsk(null)}
        onConfirm={async () => {
          if (!s) return;
          await settlementApi.remove(s.id);
          toast.success('Draft removed.');
          navigate(`/${company}/cf_hrms/exits`);
        }}
      />
    </Box>
  );
}

/* ── what HR types ────────────────────────────────────────────────────── */

function InputsCard({ form: f, statement: st, change, previewError }: {
  form: Form; statement: Statement | null; change: (p: Partial<Form>) => void; previewError: unknown;
}) {
  const amountProps = { inputMode: 'decimal' as const };
  const clean = (v: string) => v.replace(/[₹,\s]/g, '');
  const problems = errorProblems(previewError);
  return (
    <SectionCard title="What the system cannot know" subtitle="Each change is worked out again on the left.">
      <Stack spacing={1.5} data-fnf-inputs="">
        {previewError != null && (
          <Callout tone="warning" title={errorMessage(previewError)} sx={{ mb: 0 }}>
            {problems.length > 0 && <Box component="ul" sx={{ m: 0, pl: 2.5 }}>{problems.map((p, i) => <li key={i}>{p}</li>)}</Box>}
          </Callout>
        )}

        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Notice</Typography>
        <TextField size="small" label="Notice period, days" value={f.noticeDays} onChange={(e) => change({ noticeDays: clean(e.target.value) })} inputProps={amountProps}
          helperText={st?.notice.requiredDays != null && st.notice.source !== 'TYPED' ? `Empty: ${st.notice.requiredDays} days from the appointment terms.` : 'Needed when the appointment terms have none.'} data-field="noticeDays" />
        <FormControlLabel control={<Checkbox size="small" checked={f.waiveNotice} onChange={(e) => change({ waiveNotice: e.target.checked })} />} label="Waive the notice not served" />
        {f.waiveNotice && <TextField size="small" label="Why it is waived" value={f.waiveNote} onChange={(e) => change({ waiveNote: e.target.value })} multiline minRows={2} />}

        <Typography sx={{ fontSize: 13, fontWeight: 600, pt: 0.5 }}>Leave encashment</Typography>
        <TextField size="small" label="Days to encash" value={f.encashDays} onChange={(e) => change({ encashDays: clean(e.target.value) })} inputProps={amountProps}
          helperText={st && !st.encashment.typed ? `Empty: ${st.encashment.days} days from the balances.` : 'Empty: from the leave balances.'} data-field="encashDays" />

        <Typography sx={{ fontSize: 13, fontWeight: 600, pt: 0.5 }}>Gratuity</Typography>
        <TextField size="small" label="Gratuity paid (another amount)" value={f.gratuityAmount} onChange={(e) => change({ gratuityAmount: clean(e.target.value) })} inputProps={amountProps}
          helperText={st ? `Empty: ${rupees(st.gratuity.formulaAmount)} as worked out. The tax exemption still uses that amount.` : undefined} data-field="gratuityAmount" />
        {f.gratuityAmount.trim() !== '' && <TextField size="small" label="Why a different amount" value={f.gratuityNote} onChange={(e) => change({ gratuityNote: e.target.value })} multiline minRows={2} />}

        <Typography sx={{ fontSize: 13, fontWeight: 600, pt: 0.5 }}>Exempted by an earlier employer</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <TextField size="small" label="Gratuity" value={f.gratuityExemptedBefore} onChange={(e) => change({ gratuityExemptedBefore: clean(e.target.value) })} inputProps={amountProps} />
          <TextField size="small" label="Leave encashment" value={f.leaveExemptedBefore} onChange={(e) => change({ leaveExemptedBefore: clean(e.target.value) })} inputProps={amountProps} />
        </Box>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: -0.5 }}>The lifetime limits count what was not taxed before.</Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', pt: 0.5 }}>
          <Typography sx={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Bonus and other payments</Typography>
          <Button size="small" startIcon={<AddRounded />} onClick={() => change({ bonus: [...f.bonus, { label: '', amount: '' }] })}>Add</Button>
        </Box>
        {f.bonus.map((b, i) => (
          <Box key={i} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 100px 32px', gap: 0.75, alignItems: 'center' }}>
            <TextField size="small" label="What" value={b.label} onChange={(e) => change({ bonus: f.bonus.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            <TextField size="small" label="₹" value={b.amount} onChange={(e) => change({ bonus: f.bonus.map((x, j) => (j === i ? { ...x, amount: clean(e.target.value) } : x)) })} inputProps={amountProps} />
            <Tooltip title="Remove"><IconButton size="small" onClick={() => change({ bonus: f.bonus.filter((_, j) => j !== i) })}><CloseRounded fontSize="small" /></IconButton></Tooltip>
          </Box>
        ))}

        <Box sx={{ display: 'flex', alignItems: 'center', pt: 0.5 }}>
          <Typography sx={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Recoveries</Typography>
          <Button size="small" startIcon={<AddRounded />} onClick={() => change({ recoveries: [...f.recoveries, { kind: 'LOAN', label: '', amount: '' }] })}>Add</Button>
        </Box>
        {f.recoveries.map((r, i) => (
          <Box key={i} sx={{ p: 1, border: '1px solid var(--c-divider)', borderRadius: 1.5 }}>
            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', mb: 0.75 }}>
              <TextField select size="small" label="Kind" value={r.kind} sx={{ flex: 1, minWidth: 0 }}
                onChange={(e) => change({ recoveries: f.recoveries.map((x, j) => (j === i ? { ...x, kind: e.target.value as RecoveryKind } : x)) })}>
                {(Object.keys(RECOVERY_WORD) as RecoveryKind[]).map((k) => <MenuItem key={k} value={k}>{RECOVERY_WORD[k]}</MenuItem>)}
              </TextField>
              <Tooltip title="Remove"><IconButton size="small" onClick={() => change({ recoveries: f.recoveries.filter((_, j) => j !== i) })}><CloseRounded fontSize="small" /></IconButton></Tooltip>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 100px', gap: 0.75 }}>
              <TextField size="small" label="What" value={r.label} onChange={(e) => change({ recoveries: f.recoveries.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <TextField size="small" label="₹" value={r.amount} onChange={(e) => change({ recoveries: f.recoveries.map((x, j) => (j === i ? { ...x, amount: clean(e.target.value) } : x)) })} inputProps={amountProps} />
            </Box>
          </Box>
        ))}

        <TextField size="small" label="Note (printed on the statement)" value={f.note} onChange={(e) => change({ note: e.target.value })} multiline minRows={2} />
      </Stack>
    </SectionCard>
  );
}
