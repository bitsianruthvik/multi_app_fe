import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Box, Button, Collapse, MenuItem, Stack, TextField, Typography } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import {
  Callout, ConfirmDialog, DetailSkeleton, ErrorNotice, FactItem, FormDialog, Mono, StageIcon, Surface,
  ToneBadge, errorMessage, useDetailTitle, useIsPermitted, useToast,
} from '@shared/ui';
import {
  CLOSE_REASON_LABEL, braced, hiringApi, niceDate, saveHiringFile, todayIso,
  type CloseReason, type Hiring, type HiringFile, type HiringInput, type HiringStage, type LetterMeta,
} from '../api/hiring';
import { JobContentPanel } from '../components/JobContentPanel';

/**
 * One hiring — the whole flow on ONE resumable screen (CF_HRMS_HIRING_SPEC.md §2.6).
 *
 *   Job description  ->  Offer  ->  Appointment
 *
 * The step the hiring is at is open; a finished step folds to one line and can
 * be opened to look. Nothing here decides what is allowed: every button reads
 * `hiring.can`, and what is still needed is `hiring.missing`, in the server's
 * own words. Its refusals are shown as they come, with the itemised list.
 *
 * THE CANDIDATE IS NOT AN EMPLOYEE until the last button. That button makes the
 * appointment letter, the employee, the employee code and the assignment in one
 * write, so it sits behind a dialog that repeats the name, the position and the
 * date — it is the one step here that cannot be taken back from this screen.
 *
 * TYPED TEXT IS NEVER LOST: the offer form keeps what was typed when a save is
 * refused, and "Generate offer letter" saves the form first so the letter
 * always prints what is on the screen.
 */

type StepKey = 'jd' | 'offer' | 'appointment';
type StepState = 'done' | 'current' | 'todo';

interface OfferForm {
  salutation: string; name: string; phone: string; email: string; address: string; gender: string; dateOfBirth: string;
  designation: string; departmentName: string; reportingToTitle: string; reportingToName: string; placeOfPosting: string;
  proposedJoiningDate: string; annualCtc: string; offerDate: string; offerValidUntil: string;
  probationMonths: string; noticeDaysProbation: string; noticeDaysConfirmed: string;
  signatoryName: string; signatoryDesignation: string;
}

const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');
const numText = (v: number | null | undefined) => (v == null ? '' : String(v));

const toForm = (h: Hiring): OfferForm => ({
  salutation: h.candidate.salutation ?? '',
  name: h.candidate.name ?? '',
  phone: h.candidate.phone ?? '',
  email: h.candidate.email ?? '',
  address: h.candidate.address ?? '',
  gender: h.candidate.gender ?? '',
  dateOfBirth: day(h.candidate.dateOfBirth),
  designation: h.terms.designation ?? '',
  departmentName: h.terms.departmentName ?? '',
  reportingToTitle: h.terms.reportingToTitle ?? '',
  reportingToName: h.terms.reportingToName ?? '',
  placeOfPosting: h.terms.placeOfPosting ?? '',
  proposedJoiningDate: day(h.terms.proposedJoiningDate),
  annualCtc: numText(h.terms.annualCtc),
  offerDate: day(h.terms.offerDate),
  offerValidUntil: day(h.terms.offerValidUntil),
  probationMonths: numText(h.terms.probationMonths),
  noticeDaysProbation: numText(h.terms.noticeDaysProbation),
  noticeDaysConfirmed: numText(h.terms.noticeDaysConfirmed),
  signatoryName: h.terms.signatoryName ?? '',
  signatoryDesignation: h.terms.signatoryDesignation ?? '',
});

const text = (v: string) => (v.trim() ? v.trim() : null);
const num = (v: string) => {
  const cleaned = v.replace(/[,\s₹]/g, '');
  return cleaned === '' ? null : Number(cleaned);
};

const toInput = (f: OfferForm): HiringInput => ({
  candidateSalutation: text(f.salutation),
  candidateName: text(f.name),
  candidatePhone: text(f.phone),
  candidateEmail: text(f.email),
  // As it prints: the line breaks are the address.
  candidateAddress: f.address.trim() ? f.address.replace(/\s+$/g, '') : null,
  candidateGender: text(f.gender),
  candidateDateOfBirth: f.dateOfBirth || null,
  designation: text(f.designation),
  departmentName: text(f.departmentName),
  reportingToTitle: text(f.reportingToTitle),
  reportingToName: text(f.reportingToName),
  placeOfPosting: text(f.placeOfPosting),
  proposedJoiningDate: f.proposedJoiningDate || null,
  annualCtc: num(f.annualCtc),
  offerDate: f.offerDate || null,
  offerValidUntil: f.offerValidUntil || null,
  probationMonths: num(f.probationMonths),
  noticeDaysProbation: num(f.noticeDaysProbation),
  noticeDaysConfirmed: num(f.noticeDaysConfirmed),
  signatoryName: text(f.signatoryName),
  signatoryDesignation: text(f.signatoryDesignation),
});

/** 900000 -> "9,00,000" — the way the letter prints it. */
const inrGrouping = (v: string): string | null => {
  const n = num(v);
  if (n == null || Number.isNaN(n)) return null;
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

const SALUTATIONS = ['Mr.', 'Ms.', 'Mrs.', 'Dr.'];
const GENDERS = ['Male', 'Female', 'Other'];
const STEP_LABEL: Record<StepKey, string> = { jd: 'Job description', offer: 'Offer', appointment: 'Appointment' };
const STEPS: StepKey[] = ['jd', 'offer', 'appointment'];

const sameForm = (a: OfferForm, b: OfferForm) => JSON.stringify(a) === JSON.stringify(b);

/** Why a hiring was closed, as the end of "This hiring is closed: …". */
const CLOSED_BECAUSE: Record<CloseReason, string> = {
  DECLINED: 'the candidate declined the offer',
  LAPSED: 'the offer lapsed without an answer',
  CANCELLED: 'it was cancelled',
};

function stepStates(h: Hiring): Record<StepKey, StepState> {
  switch (h.stage) {
    case 'JD':
      return { jd: 'current', offer: 'todo', appointment: 'todo' };
    case 'OFFER':
      return { jd: 'done', offer: 'current', appointment: 'todo' };
    case 'APPOINTMENT':
      return { jd: 'done', offer: 'done', appointment: 'current' };
    case 'DONE':
      return { jd: 'done', offer: 'done', appointment: 'done' };
    default:
      // Closed: what was finished before it closed stays finished; nothing is current.
      return { jd: h.jd ? 'done' : 'todo', offer: h.offerAccepted ? 'done' : 'todo', appointment: 'todo' };
  }
}

const currentStep = (h: Hiring): StepKey | null =>
  h.stage === 'JD' ? 'jd' : h.stage === 'OFFER' ? 'offer' : h.stage === 'APPOINTMENT' ? 'appointment' : null;

/** "Still needed" — the server's own list, shown as it comes. */
function Missing({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <Box data-missing="" sx={{ borderLeft: '3px solid var(--c-warning-600)', background: 'var(--c-warning-50)', px: 1.5, py: 1 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-warning-800)' }}>{title}</Typography>
      <Box component="ul" sx={{ m: 0, mt: 0.25, pl: 2.5, fontSize: 13, color: 'var(--c-text)', lineHeight: 1.55 }}>
        {items.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </Box>
    </Box>
  );
}

/** Placeholders the template asked for and the letter could not fill. */
function Unfilled({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <Callout tone="warning" title="Some places in the letter were not filled" sx={{ mb: 0 }}>
      <Typography sx={{ fontSize: 13, lineHeight: 1.55 }}>
        Nothing could be printed for{' '}
        {items.map((u, i) => (
          <span key={u}>
            {i > 0 ? ', ' : ''}
            <Mono sx={{ fontSize: 12.5 }}>{braced(u)}</Mono>
          </span>
        ))}
        . Where a detail of this hiring is empty, the letter has a gap in that place — fill it in above and generate
        again. A placeholder the system does not know stays in the letter exactly as typed — correct the template
        under Setup › Letters. Read the letter before sending it.
      </Typography>
    </Callout>
  );
}

function LetterRow({
  letter,
  refNo,
  busy,
  onDownload,
}: {
  letter: LetterMeta;
  refNo: string | null;
  busy: boolean;
  onDownload: () => void;
}) {
  return (
    <Box
      data-letter={letter.kind}
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        columnGap: 1.5,
        rowGap: 0.5,
        px: 1.25,
        py: 1,
        border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-sm)',
        background: letter.isCurrent ? 'var(--c-surface)' : 'var(--c-surface-2)',
      }}
    >
      <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 500, overflowWrap: 'anywhere' }}>
          {letter.kind === 'OFFER' ? 'Offer letter' : 'Appointment letter'}
          {refNo ? (
            <>
              {' · '}
              <Mono sx={{ fontSize: 12.5 }}>{refNo}</Mono>
            </>
          ) : null}
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
          Version {letter.version}
          {letter.isCurrent ? '' : ' · replaced'} · {niceDate(letter.generatedAt)}
          {letter.generatedByName ? ` · by ${letter.generatedByName}` : ''}
        </Typography>
      </Box>
      <Button size="small" variant="outlined" startIcon={<DownloadRounded />} disabled={busy} onClick={onDownload}>
        {busy ? 'Downloading…' : 'Download'}
      </Button>
    </Box>
  );
}

function StepCard({
  index,
  title,
  state,
  summary,
  open,
  onToggle,
  children,
}: {
  index: number;
  title: string;
  state: StepState;
  summary: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const id = `hiring-step-${index}`;
  return (
    <Surface e={state === 'current' ? 2 : 1} sx={{ p: 0, overflow: 'hidden', borderColor: state === 'current' ? 'var(--c-primary-200)' : undefined }}>
      <Box
        component="button"
        type="button"
        id={`hiring-step-head-${index}`}
        aria-expanded={open}
        aria-controls={id}
        data-step={title}
        data-step-state={state}
        onClick={onToggle}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          width: '100%',
          textAlign: 'left',
          font: 'inherit',
          color: 'inherit',
          background: 'none',
          border: 0,
          cursor: 'pointer',
          px: { xs: 1.5, sm: 2 },
          py: 1.5,
          // Clear of the sticky top bar when it is scrolled to.
          scrollMarginTop: '120px',
          '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: -2 },
        }}
      >
        {state === 'done' ? (
          <StageIcon state="done" size={20} />
        ) : (
          <Box
            aria-hidden
            sx={{
              width: 22,
              height: 22,
              flexShrink: 0,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              fontSize: 12,
              fontWeight: 600,
              background: state === 'current' ? 'var(--c-primary-50)' : 'var(--c-surface-3)',
              color: state === 'current' ? 'var(--c-primary-700)' : 'var(--c-text-2)',
              border: state === 'current' ? '1px solid var(--c-primary-500)' : '1px solid transparent',
            }}
          >
            {index}
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontSize: 15, fontWeight: 600, color: state === 'todo' ? 'var(--c-text-2)' : 'var(--c-text)' }}>
            {title}
          </Typography>
          {!open && (
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{summary}</Typography>
          )}
        </Box>
        {open ? (
          <ExpandMoreRounded aria-hidden sx={{ color: 'var(--c-text-3)' }} />
        ) : (
          <ChevronRightRounded aria-hidden sx={{ color: 'var(--c-text-3)' }} />
        )}
      </Box>
      <Collapse in={open} unmountOnExit={false}>
        <Box id={id} sx={{ px: { xs: 1.5, sm: 2 }, pb: 2, pt: 0.5, borderTop: '1px solid var(--c-divider)' }}>
          {children}
        </Box>
      </Collapse>
    </Surface>
  );
}

const groupLabel = { fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' as const, color: 'var(--c-text-3)' };
const fieldGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 1.5 };
const shrink = { inputLabel: { shrink: true } };

export default function HiringDetail() {
  const { company = '', id = '' } = useParams<{ company: string; id: string }>();
  const hiringId = Number(id);
  const toast = useToast();
  const can = useIsPermitted();
  const canOpenRole = can('cf_hrms_roles_manage');

  const [hiring, setHiring] = useState<Hiring | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<OfferForm | null>(null);
  const [base, setBase] = useState<OfferForm | null>(null);
  const [openSteps, setOpenSteps] = useState<Record<StepKey, boolean>>({ jd: false, offer: false, appointment: false });

  const [busy, setBusy] = useState<string | null>(null);
  /** The last refusal, and which step it belongs under. */
  const [failure, setFailure] = useState<{ step: StepKey; error: unknown } | null>(null);
  const [unfilled, setUnfilled] = useState<{ OFFER: string[]; APPOINTMENT: string[] }>({ OFFER: [], APPOINTMENT: [] });

  const [joining, setJoining] = useState('');
  const [apptDate, setApptDate] = useState('');
  /** Until someone sets it, the letter date follows the joining date. */
  const [apptTouched, setApptTouched] = useState(false);

  const [accepting, setAccepting] = useState(false);
  const [acceptedOn, setAcceptedOn] = useState(todayIso());
  const [closing, setClosing] = useState(false);
  const [closeReason, setCloseReason] = useState<CloseReason>('DECLINED');
  const [closeNote, setCloseNote] = useState('');
  const [confirmingAppoint, setConfirmingAppoint] = useState(false);
  const stageRef = useRef<HiringStage | null>(null);

  /**
   * Takes a fresh answer from the server. `resetForm` after a save or on first
   * load; otherwise text typed and not yet saved stays where it is.
   */
  const adopt = useCallback((next: Hiring, opts: { resetForm?: boolean; reopen?: boolean } = {}) => {
    // A new stage opens its own step and folds the others; the same stage leaves the folds alone.
    if (opts.reopen || stageRef.current !== next.stage) {
      const cur = currentStep(next);
      setOpenSteps({ jd: cur === 'jd', offer: cur === 'offer', appointment: cur === 'appointment' });
      // After a step is finished the next one opens further down: bring it (or, at
      // the end, the result) into view. Not on first load, which starts at the top.
      if (stageRef.current != null && !opts.reopen) {
        const target = cur ? `hiring-step-head-${STEPS.indexOf(cur) + 1}` : 'hiring-top';
        // After the folds have finished moving, or the scroll lands where the step used to be.
        window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 380);
      }
    }
    stageRef.current = next.stage;
    setHiring(next);
    const fresh = toForm(next);
    setBase(fresh);
    setForm((prev) => (opts.resetForm || !prev ? fresh : prev));
  }, []);

  const load = useCallback(() => {
    if (!Number.isInteger(hiringId) || hiringId <= 0) {
      setLoadError(new Error('That is not a hiring.'));
      setLoading(false);
      return;
    }
    setLoading(true);
    hiringApi
      .get(hiringId)
      .then(({ hiring: h }) => {
        adopt(h, { resetForm: true, reopen: true });
        const j = day(h.joiningDate) || day(h.terms.proposedJoiningDate);
        setJoining(j);
        setApptDate(day(h.appointmentDate) || j);
        setApptTouched(!!h.appointmentDate);
        setLoadError(null);
      })
      .catch(setLoadError)
      .finally(() => setLoading(false));
  }, [hiringId, adopt]);

  useEffect(() => {
    load();
  }, [load]);

  useDetailTitle(hiring ? hiring.candidateName?.trim() || `Hiring · ${hiring.roleTitle}` : null);

  const dirty = !!form && !!base && !sameForm(form, base);
  const states = useMemo(() => (hiring ? stepStates(hiring) : null), [hiring]);

  if (loading && !hiring) return <DetailSkeleton />;
  if (!hiring || !form || !states) return <ErrorNotice error={loadError} fallback="That hiring could not be loaded." onRetry={load} />;

  const closed = hiring.stage === 'CLOSED';
  const done = hiring.stage === 'DONE';
  const candidate = hiring.candidateName?.trim() || form.name.trim() || null;
  const positionHref = `/${company}/cf_hrms/positions/${hiring.positionId}`;
  const positionWords = [hiring.roleTitle, hiring.positionCode].filter(Boolean).join(' · ');
  const offerLetters = hiring.letters.filter((l) => l.kind === 'OFFER');
  const currentOffer = offerLetters.find((l) => l.isCurrent) ?? offerLetters[0] ?? null;
  const appointmentLetter = hiring.letters.find((l) => l.kind === 'APPOINTMENT' && l.isCurrent) ?? hiring.letters.find((l) => l.kind === 'APPOINTMENT') ?? null;
  const ctcBad = form.annualCtc.trim() !== '' && Number.isNaN(num(form.annualCtc));
  const ctcWords = inrGrouping(form.annualCtc);

  const set = <K extends keyof OfferForm>(key: K, value: OfferForm[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const toggle = (k: StepKey) => setOpenSteps((o) => ({ ...o, [k]: !o[k] }));
  const failed = (step: StepKey) => (failure?.step === step ? failure.error : null);

  /** One server call: busy flag, the refusal kept under its step, never thrown. */
  const run = async <T,>(key: string, step: StepKey, fn: () => Promise<T>): Promise<T | null> => {
    setBusy(key);
    setFailure(null);
    try {
      return await fn();
    } catch (e) {
      setFailure({ step, error: e });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const download = async (key: string, fetchFile: () => Promise<HiringFile>) => {
    setBusy(key);
    try {
      saveHiringFile(await fetchFile());
    } catch (e) {
      toast.error(errorMessage(e, 'That file could not be downloaded.'));
    } finally {
      setBusy(null);
    }
  };

  const confirmJd = async () => {
    const r = await run('confirm-jd', 'jd', () => hiringApi.confirmJd(hiring.id));
    if (r) {
      adopt(r.hiring, { resetForm: true });
      toast.success('Job description confirmed.');
    }
  };

  /** Saves the form. On a refusal the typed text stays exactly as it is. */
  const save = async (): Promise<Hiring | null> => {
    const r = await run('save', 'offer', () => hiringApi.update(hiring.id, toInput(form)));
    if (!r) return null;
    adopt(r.hiring, { resetForm: true });
    return r.hiring;
  };

  const saveOnly = async () => {
    if (await save()) toast.success('Saved.');
  };

  const generateOffer = async () => {
    // The letter prints what is saved, so what is on the screen is saved first.
    let latest: Hiring | null = hiring;
    if (dirty) {
      latest = await save();
      if (!latest) return;
    }
    if (!latest.can.generateOffer) {
      toast.info('Saved. The offer letter still needs the details listed below.');
      return;
    }
    const again = latest.letters.some((l) => l.kind === 'OFFER');
    const r = await run('offer-letter', 'offer', () => hiringApi.offerLetter(hiring.id));
    if (r) {
      adopt(r.hiring, { resetForm: true });
      setUnfilled((u) => ({ ...u, OFFER: r.unfilled ?? [] }));
      toast.success(again ? 'A new version of the offer letter is ready.' : 'The offer letter is ready.');
    }
  };

  const accept = async () => {
    const { hiring: h } = await hiringApi.acceptOffer(hiring.id, acceptedOn || undefined);
    adopt(h, { resetForm: !dirty });
    const j = day(h.joiningDate) || day(h.terms.proposedJoiningDate);
    setJoining(j);
    if (!apptTouched) setApptDate(j);
    toast.success('Offer accepted. Next: the appointment.');
  };

  const closeHiring = async () => {
    const { hiring: h } = await hiringApi.close(hiring.id, { reason: closeReason, note: closeNote.trim() || undefined });
    adopt(h, { resetForm: true });
    toast.success('Hiring closed. The position is vacant again.');
  };

  const appoint = async () => {
    const r = await hiringApi.appoint(hiring.id, { joiningDate: joining, appointmentDate: apptDate || undefined });
    adopt(r.hiring, { resetForm: true });
    setUnfilled((u) => ({ ...u, APPOINTMENT: r.unfilled ?? [] }));
    toast.success(`${r.employee.fullName} is now an employee — ${r.employee.employeeCode}.`);
  };

  const readOnly = !hiring.can.edit;
  const field = { size: 'small' as const, disabled: readOnly };

  const jdSummary = hiring.jd
    ? `Job description confirmed on ${niceDate(hiring.jd.generatedAt)}`
    : closed
      ? 'Not confirmed before the hiring was closed'
      : 'Read the job description and confirm it';
  const offerSummary = hiring.offerAccepted
    ? `Offer accepted${hiring.offerAcceptedOn ? ` on ${niceDate(hiring.offerAcceptedOn)}` : ''}${hiring.refNo ? ` · ${hiring.refNo}` : ''}`
    : currentOffer
      ? `Offer letter version ${currentOffer.version}, ${niceDate(currentOffer.generatedAt)}${closed ? '' : ' · waiting for the candidate'}`
      : states.offer === 'todo' && !closed
        ? 'Comes after the job description is confirmed'
        : closed
          ? 'No offer letter was made'
          : 'Candidate details, terms, then the offer letter';
  const appointmentSummary = done
    ? `${hiring.employee?.fullName ?? candidate ?? 'The employee'} joined as ${hiring.employee?.employeeCode ?? ''}`.trim()
    : states.appointment === 'todo'
      ? closed
        ? 'Not reached'
        : 'Comes after the offer is accepted'
      : 'Joining date, appointment letter, and the employee is created';

  return (
    <Box id="hiring-top" sx={{ maxWidth: 980, scrollMarginTop: '140px' }}>
      {/* ── The position this hiring is for, and where it stands ───────────── */}
      <Surface e={2} sx={{ p: { xs: 2, sm: 2.5 }, mb: 2 }}>
        <Button
          component={RouterLink}
          to={positionHref}
          size="small"
          startIcon={<ArrowBackRounded />}
          sx={{ ml: -0.75, mb: 0.5 }}
        >
          Back to the position
        </Button>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
          <Box sx={{ minWidth: 0, flex: '1 1 280px' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 0.25 }}>
              <Typography component="h1" sx={{ fontSize: 20, fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
                {candidate ?? 'New hire'}
              </Typography>
              {done ? (
                <ToneBadge tone="success" label="Done" />
              ) : closed ? (
                <ToneBadge tone="neutral" noIcon label="Closed" />
              ) : (
                <ToneBadge tone="info" noIcon label="Hiring" />
              )}
            </Box>
            <Typography data-statusline="" sx={{ fontSize: 14, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
              {hiring.statusLine}
            </Typography>
          </Box>
          {hiring.can.close && (
            <Button size="small" variant="outlined" color="inherit" onClick={() => setClosing(true)}>
              Close hiring
            </Button>
          )}
        </Box>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 2,
            mt: 2,
            pt: 2,
            borderTop: '1px solid var(--c-divider)',
          }}
        >
          <FactItem
            label="Role"
            value={
              canOpenRole ? (
                <Box component={RouterLink} to={`/${company}/cf_hrms/roles/${hiring.roleId}`} sx={{ color: 'var(--c-primary-700)' }}>
                  {hiring.roleTitle}
                </Box>
              ) : (
                hiring.roleTitle
              )
            }
          />
          <FactItem
            label="Position"
            value={
              <Box component={RouterLink} to={positionHref} sx={{ color: 'var(--c-primary-700)' }}>
                <Mono>{hiring.positionCode ?? `#${hiring.positionId}`}</Mono>
              </Box>
            }
          />
          <FactItem label="Department" value={hiring.departmentName ?? 'Not set'} />
          <FactItem label="Shift" value={hiring.shift?.name ?? 'Not set'} />
          <FactItem
            label="Reports to"
            value={
              hiring.terms.reportingToTitle
                ? `${hiring.terms.reportingToTitle}${hiring.terms.reportingToName ? ` (${hiring.terms.reportingToName})` : ''}`
                : 'Not set'
            }
          />
          {hiring.refNo && <FactItem label="Letter reference" value={<Mono>{hiring.refNo}</Mono>} />}
        </Box>
      </Surface>

      {closed && (
        <Callout
          tone="neutral"
          title={`This hiring is closed: ${CLOSED_BECAUSE[hiring.closeReason as CloseReason] ?? CLOSE_REASON_LABEL[hiring.closeReason as CloseReason] ?? 'no reason was recorded'}.`}
        >
          {hiring.closeNote?.trim() && (
            <Typography data-closenote="" sx={{ fontSize: 13.5, lineHeight: 1.55, mb: 0.5, overflowWrap: 'anywhere' }}>
              Note: {hiring.closeNote.trim()}
            </Typography>
          )}
          <Typography sx={{ fontSize: 13.5, lineHeight: 1.55 }}>
            Nothing here can be changed any more and no employee was created. The position is vacant again; to hire for
            it, open{' '}
            <Box component={RouterLink} to={positionHref} sx={{ color: 'var(--c-primary-700)' }}>
              the position
            </Box>{' '}
            and choose Hire a new person.
          </Typography>
        </Callout>
      )}

      {done && hiring.employee && (
        <Surface
          e={1}
          data-hired=""
          sx={{ p: { xs: 2, sm: 2.5 }, mb: 2, borderLeft: '3px solid var(--c-success-600)', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'var(--c-success-800)' }}>
            <CheckCircleRounded aria-hidden sx={{ fontSize: 20 }} />
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>The employee is created</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, mt: 1 }}>
            <Typography sx={{ fontSize: 20, fontWeight: 600, overflowWrap: 'anywhere' }}>{hiring.employee.fullName}</Typography>
            <Box>
              <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mr: 0.75 }}>
                Employee code
              </Typography>
              <Mono data-newcode="" sx={{ fontSize: 22, fontWeight: 600, color: 'var(--c-text)' }}>
                {hiring.employee.employeeCode}
              </Mono>
            </Box>
          </Box>
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)', mt: 0.5 }}>
            In this position{hiring.joiningDate ? ` from ${niceDate(hiring.joiningDate)}` : ''}.
          </Typography>
          <Stack spacing={1} sx={{ mt: 1.5 }}>
            {appointmentLetter && (
              <LetterRow
                letter={appointmentLetter}
                refNo={hiring.refNo}
                busy={busy === `letter-${appointmentLetter.id}`}
                onDownload={() => void download(`letter-${appointmentLetter.id}`, () => hiringApi.letterFile(hiring.id, appointmentLetter.id))}
              />
            )}
            <Unfilled items={unfilled.APPOINTMENT} />
            <Typography data-annexure="" sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
              Attach the compensation annexure (Annexure-A) by hand.
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
            <Button component={RouterLink} to={`/${company}/cf_hrms/employees/${hiring.employee.id}`} size="small" variant="contained">
              Open the employee
            </Button>
            <Button component={RouterLink} to={`/${company}/cf_hrms/org-chart?root=${hiring.positionId}`} size="small" variant="outlined">
              See the position on the chart
            </Button>
          </Stack>
        </Surface>
      )}

      {/* ── The step train ─────────────────────────────────────────────────── */}
      <Box
        component="ol"
        aria-label="Steps of this hiring"
        sx={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 0.5, rowGap: 0.5, m: 0, mb: 1.5, p: 0 }}
      >
        {STEPS.map((k, i) => (
          <Box component="li" key={k} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            {i > 0 && <ChevronRightRounded aria-hidden sx={{ fontSize: 18, color: 'var(--c-text-3)' }} />}
            <Box
              component="button"
              type="button"
              onClick={() => setOpenSteps((o) => ({ ...o, [k]: true }))}
              aria-current={states[k] === 'current' ? 'step' : undefined}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.6,
                font: 'inherit',
                fontSize: 13,
                fontWeight: states[k] === 'current' ? 600 : 400,
                color: states[k] === 'todo' ? 'var(--c-text-3)' : 'var(--c-text)',
                background: states[k] === 'current' ? 'var(--c-primary-50)' : 'transparent',
                border: 0,
                borderRadius: 'var(--r-sm)',
                px: 1,
                py: 0.5,
                cursor: 'pointer',
                '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 1 },
              }}
            >
              {states[k] === 'current' ? (
                // "You are here" — a plain dot, not the amber of something gone wrong.
                <Box aria-hidden sx={{ width: 9, height: 9, mx: '3px', borderRadius: '50%', background: 'var(--c-primary-600)', flexShrink: 0 }} />
              ) : (
                <StageIcon state={states[k] === 'done' ? 'done' : 'todo'} />
              )}
              {STEP_LABEL[k]}
            </Box>
          </Box>
        ))}
      </Box>

      <Stack spacing={1.5}>
        {/* ── 1. Job description ───────────────────────────────────────────── */}
        <StepCard index={1} title="Job description" state={states.jd} summary={jdSummary} open={openSteps.jd} onToggle={() => toggle('jd')}>
          <Stack spacing={1.5} sx={{ pt: 1.5 }}>
            {hiring.jd ? (
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                <Typography sx={{ fontSize: 14, flex: '1 1 220px' }}>
                  Job description confirmed on {niceDate(hiring.jd.generatedAt)}. A copy was kept as it stood that day.
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<DownloadRounded />}
                  disabled={busy === 'jd-file'}
                  onClick={() => void download('jd-file', () => hiringApi.jdFile(hiring.id))}
                >
                  {busy === 'jd-file' ? 'Downloading…' : 'Download'}
                </Button>
              </Box>
            ) : (
              <Typography sx={{ fontSize: 14, lineHeight: 1.55 }}>
                This is the job the new person will do. Read it, then confirm it — a copy is kept as it stands today.
              </Typography>
            )}
            <Box>
              <Typography sx={{ ...groupLabel, mb: 0.75 }}>
                {hiring.jd ? 'The position’s job today' : 'KRAs, responsibilities and KPIs'}
              </Typography>
              <JobContentPanel target={{ type: 'position', id: hiring.positionId }} dense />
            </Box>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.55 }}>
              Changes are not made here. Edit what is specific to{' '}
              <Box component={RouterLink} to={`${positionHref}?tab=job&edit=1`} sx={{ color: 'var(--c-primary-700)' }}>
                this position
              </Box>
              , or what every position of the role shares on{' '}
              {canOpenRole ? (
                <Box component={RouterLink} to={`/${company}/cf_hrms/roles/${hiring.roleId}?tab=content`} sx={{ color: 'var(--c-primary-700)' }}>
                  the role
                </Box>
              ) : (
                'the role'
              )}
              .
            </Typography>
            {!!failed('jd') && <ErrorNotice error={failed('jd')} fallback="The job description could not be confirmed." />}
            {hiring.can.confirmJd && (
              <Box>
                <Button variant="contained" disabled={busy != null} onClick={() => void confirmJd()}>
                  {busy === 'confirm-jd' ? 'Confirming…' : 'Confirm job description'}
                </Button>
              </Box>
            )}
          </Stack>
        </StepCard>

        {/* ── 2. Offer ─────────────────────────────────────────────────────── */}
        <StepCard index={2} title="Offer" state={states.offer} summary={offerSummary} open={openSteps.offer} onToggle={() => toggle('offer')}>
          {states.offer === 'todo' && !closed ? (
            <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)', pt: 1.5 }}>
              Confirm the job description first. The candidate and the offer terms are entered here after that.
            </Typography>
          ) : (
            <Stack spacing={2} sx={{ pt: 1.5 }}>
              <Box>
                <Typography sx={{ ...groupLabel, mb: 1 }}>Candidate</Typography>
                <Box sx={fieldGrid}>
                  <TextField {...field} select label="Salutation" value={form.salutation} onChange={(e) => set('salutation', e.target.value)}>
                    <MenuItem value="">None</MenuItem>
                    {[...new Set([...SALUTATIONS, form.salutation].filter(Boolean))].map((s) => (
                      <MenuItem key={s} value={s}>{s}</MenuItem>
                    ))}
                  </TextField>
                  <TextField {...field} label="Full name" value={form.name} onChange={(e) => set('name', e.target.value)} />
                  <TextField {...field} label="Phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                  <TextField {...field} label="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
                  <TextField {...field} select label="Gender (optional)" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                    <MenuItem value="">Not recorded</MenuItem>
                    {[...new Set([...GENDERS, form.gender].filter(Boolean))].map((g) => (
                      <MenuItem key={g} value={g}>{g}</MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    {...field}
                    label="Date of birth (optional)"
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(e) => set('dateOfBirth', e.target.value)}
                    slotProps={shrink}
                  />
                </Box>
                <TextField
                  {...field}
                  label="Address"
                  multiline
                  minRows={3}
                  fullWidth
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  helperText="As it should print on the letter — one line of the address per line."
                  sx={{ mt: 1.5 }}
                />
              </Box>

              <Box>
                <Typography sx={{ ...groupLabel, mb: 1 }}>Offer</Typography>
                <Box sx={fieldGrid}>
                  <TextField {...field} label="Designation" value={form.designation} onChange={(e) => set('designation', e.target.value)} />
                  <TextField {...field} label="Department" value={form.departmentName} onChange={(e) => set('departmentName', e.target.value)} />
                  <TextField {...field} label="Reporting to (title)" value={form.reportingToTitle} onChange={(e) => set('reportingToTitle', e.target.value)} />
                  <TextField
                    {...field}
                    label="Reporting to (name)"
                    value={form.reportingToName}
                    onChange={(e) => set('reportingToName', e.target.value)}
                    // Empty when the manager's position is vacant; the appointment letter then prints a gap.
                    helperText={
                      form.reportingToName.trim()
                        ? undefined
                        : 'The appointment letter names the person they report to. This position’s manager is vacant — type a name.'
                    }
                    slotProps={{ formHelperText: { sx: { color: 'var(--c-warning-800)' } } }}
                  />
                  <TextField {...field} label="Place of posting" value={form.placeOfPosting} onChange={(e) => set('placeOfPosting', e.target.value)} />
                  <TextField
                    {...field}
                    label="Proposed joining date"
                    type="date"
                    value={form.proposedJoiningDate}
                    onChange={(e) => set('proposedJoiningDate', e.target.value)}
                    slotProps={shrink}
                  />
                  <TextField
                    {...field}
                    label="Annual CTC (₹)"
                    value={form.annualCtc}
                    onChange={(e) => set('annualCtc', e.target.value)}
                    error={ctcBad}
                    helperText={ctcBad ? 'Type the amount as a number, for example 900000.' : ctcWords ? `Prints as ${ctcWords}` : 'For the whole year'}
                    slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                  />
                  <TextField {...field} label="Offer date" type="date" value={form.offerDate} onChange={(e) => set('offerDate', e.target.value)} slotProps={shrink} />
                  <TextField
                    {...field}
                    label="Offer valid until"
                    type="date"
                    value={form.offerValidUntil}
                    onChange={(e) => set('offerValidUntil', e.target.value)}
                    slotProps={shrink}
                  />
                  <TextField
                    {...field}
                    label="Probation (months)"
                    value={form.probationMonths}
                    onChange={(e) => set('probationMonths', e.target.value)}
                    slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                  />
                  <TextField
                    {...field}
                    label="Notice in probation (days)"
                    value={form.noticeDaysProbation}
                    onChange={(e) => set('noticeDaysProbation', e.target.value)}
                    slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                  />
                  <TextField
                    {...field}
                    label="Notice after confirmation (days)"
                    value={form.noticeDaysConfirmed}
                    onChange={(e) => set('noticeDaysConfirmed', e.target.value)}
                    slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                  />
                  <TextField {...field} label="Signed by (name)" value={form.signatoryName} onChange={(e) => set('signatoryName', e.target.value)} />
                  <TextField
                    {...field}
                    label="Signed by (designation)"
                    value={form.signatoryDesignation}
                    onChange={(e) => set('signatoryDesignation', e.target.value)}
                  />
                </Box>
              </Box>

              {!!failed('offer') && <ErrorNotice error={failed('offer')} fallback="That could not be saved. What you typed is still here." />}

              {hiring.can.edit && (
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                  <Button variant="outlined" disabled={!dirty || ctcBad || busy != null} onClick={() => void saveOnly()}>
                    {busy === 'save' ? 'Saving…' : 'Save'}
                  </Button>
                  <Typography role="status" sx={{ fontSize: 12.5, color: dirty ? 'var(--c-warning-800)' : 'var(--c-text-3)' }}>
                    {dirty ? 'You have changes that are not saved.' : 'Everything typed here is saved.'}
                  </Typography>
                </Box>
              )}

              {!hiring.offerAccepted && !closed && (
                <Missing title="Still needed for the offer letter" items={hiring.missing.offerLetter} />
              )}

              {offerLetters.length > 0 && (
                <Stack spacing={0.75}>
                  {offerLetters.map((l) => (
                    <LetterRow
                      key={l.id}
                      letter={l}
                      refNo={hiring.refNo}
                      busy={busy === `letter-${l.id}`}
                      onDownload={() => void download(`letter-${l.id}`, () => hiringApi.letterFile(hiring.id, l.id))}
                    />
                  ))}
                </Stack>
              )}
              <Unfilled items={unfilled.OFFER} />

              {(hiring.can.generateOffer || (hiring.can.edit && !hiring.offerAccepted && states.offer === 'current')) && (
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                  <Button
                    variant={currentOffer ? 'outlined' : 'contained'}
                    disabled={busy != null || ctcBad || (!hiring.can.generateOffer && !dirty)}
                    onClick={() => void generateOffer()}
                  >
                    {busy === 'offer-letter' ? 'Generating…' : currentOffer ? 'Generate again' : 'Generate offer letter'}
                  </Button>
                  {currentOffer && (
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', flex: '1 1 220px' }}>
                      Makes a new version with the details above. The reference number stays the same.
                    </Typography>
                  )}
                </Box>
              )}

              {(hiring.can.acceptOffer || (hiring.can.close && currentOffer)) && (
                <Box sx={{ pt: 1.5, borderTop: '1px solid var(--c-divider)' }}>
                  <Typography sx={{ ...groupLabel, mb: 1 }}>What did the candidate say?</Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {hiring.can.acceptOffer && (
                      <Button
                        variant="contained"
                        disabled={busy != null}
                        onClick={() => {
                          setAcceptedOn(todayIso());
                          setAccepting(true);
                        }}
                      >
                        Offer accepted
                      </Button>
                    )}
                    {hiring.can.close && (
                      <Button variant="outlined" color="inherit" disabled={busy != null} onClick={() => setClosing(true)}>
                        Close hiring
                      </Button>
                    )}
                  </Stack>
                </Box>
              )}
            </Stack>
          )}
        </StepCard>

        {/* ── 3. Appointment ───────────────────────────────────────────────── */}
        <StepCard
          index={3}
          title="Appointment"
          state={states.appointment}
          summary={appointmentSummary}
          open={openSteps.appointment}
          onToggle={() => toggle('appointment')}
        >
          {done ? (
            <Stack spacing={1.5} sx={{ pt: 1.5 }}>
              <Typography sx={{ fontSize: 14, lineHeight: 1.55 }}>
                {hiring.employee?.fullName ?? 'The employee'} was appointed
                {hiring.joiningDate ? ` and joined on ${niceDate(hiring.joiningDate)}` : ''}. Employee code{' '}
                <Mono>{hiring.employee?.employeeCode ?? '—'}</Mono>.
              </Typography>
              <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
                The appointment letter is at the top of this page.
              </Typography>
            </Stack>
          ) : states.appointment === 'todo' ? (
            <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)', pt: 1.5 }}>
              {closed
                ? 'This hiring was closed before an appointment.'
                : 'This step opens when the offer is accepted. Nobody is an employee until then.'}
            </Typography>
          ) : (
            <Stack spacing={1.5} sx={{ pt: 1.5 }}>
              <Box sx={{ ...fieldGrid, maxWidth: 520 }}>
                <TextField
                  size="small"
                  label="Joining date"
                  type="date"
                  value={joining}
                  disabled={!hiring.can.appoint && hiring.missing.appoint.length === 0}
                  onChange={(e) => {
                    setJoining(e.target.value);
                    if (!apptTouched) setApptDate(e.target.value);
                  }}
                  slotProps={shrink}
                />
                <TextField
                  size="small"
                  label="Appointment letter date"
                  type="date"
                  value={apptDate}
                  disabled={!hiring.can.appoint && hiring.missing.appoint.length === 0}
                  onChange={(e) => {
                    setApptDate(e.target.value);
                    setApptTouched(true);
                  }}
                  slotProps={shrink}
                />
              </Box>
              <Typography data-appoint-effect="" sx={{ fontSize: 14, lineHeight: 1.55 }}>
                This creates the employee, issues the employee code and puts them in this position from{' '}
                <b>{joining ? niceDate(joining) : 'the joining date'}</b>.
              </Typography>
              <Missing title="Still needed before the appointment" items={hiring.missing.appoint} />
              {/* Said BEFORE the button: afterwards the letter is made and the employee exists. */}
              {!hiring.terms.reportingToName?.trim() && (
                <Callout tone="warning" title="The letter will have a gap where the manager’s name goes" sx={{ mb: 0 }}>
                  <Typography sx={{ fontSize: 13, lineHeight: 1.55 }}>
                    “Reporting to (name)” is empty, because this position’s manager is vacant. The appointment letter
                    names that person. Open the Offer step, type a name and save, or go on and write it in by hand.
                  </Typography>
                </Callout>
              )}
              {dirty && (
                <Typography role="status" sx={{ fontSize: 13, color: 'var(--c-warning-800)' }}>
                  The Offer step has changes that are not saved. Save them first, so the letter prints them.
                </Typography>
              )}
              <Box>
                <Button
                  variant="contained"
                  disabled={!hiring.can.appoint || !joining || dirty || busy != null}
                  onClick={() => setConfirmingAppoint(true)}
                >
                  Generate appointment letter and create employee
                </Button>
              </Box>
            </Stack>
          )}
        </StepCard>
      </Stack>

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}
      <FormDialog
        open={accepting}
        title="The candidate accepted the offer"
        subtitle={candidate ? `${candidate} · ${positionWords}` : positionWords}
        onClose={() => setAccepting(false)}
        onSubmit={async () => {
          await accept();
          setAccepting(false);
        }}
        submitLabel="Offer accepted"
        submitDisabled={!acceptedOn}
        maxWidth="xs"
      >
        <TextField
          label="Accepted on"
          type="date"
          size="small"
          fullWidth
          // Keeps the floating label clear of the dialog's scroll edge.
          sx={{ mt: 0.75 }}
          value={acceptedOn}
          onChange={(e) => setAcceptedOn(e.target.value)}
          slotProps={shrink}
          helperText="The next step is the appointment. The offer letter cannot be generated again after this."
        />
      </FormDialog>

      <FormDialog
        open={closing}
        title="Close this hiring"
        subtitle="The position becomes vacant again and no employee is created. A closed hiring cannot be reopened."
        onClose={() => setClosing(false)}
        onSubmit={async () => {
          await closeHiring();
          setClosing(false);
        }}
        submitLabel="Close hiring"
        submitColor="error"
        maxWidth="xs"
        enterSubmits={false}
      >
        <Stack spacing={1.5} sx={{ pt: 0.75 }}>
          <TextField select label="Why" size="small" value={closeReason} onChange={(e) => setCloseReason(e.target.value as CloseReason)}>
            <MenuItem value="DECLINED">Declined — the candidate said no</MenuItem>
            <MenuItem value="LAPSED">Lapsed — no answer before the offer ran out</MenuItem>
            <MenuItem value="CANCELLED">Cancelled — we are not hiring this person</MenuItem>
          </TextField>
          <TextField
            label="Note (optional)"
            size="small"
            multiline
            minRows={2}
            value={closeNote}
            onChange={(e) => setCloseNote(e.target.value)}
          />
        </Stack>
      </FormDialog>

      <ConfirmDialog
        open={confirmingAppoint}
        title="Create the employee?"
        confirmLabel="Create employee"
        body={
          <Box>
            <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1.5, rowGap: 0.5, m: 0, mb: 1.5, fontSize: 14 }}>
              <Box component="dt" sx={{ color: 'var(--c-text-2)' }}>Name</Box>
              <Box component="dd" sx={{ m: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{candidate ?? 'No name entered'}</Box>
              <Box component="dt" sx={{ color: 'var(--c-text-2)' }}>Position</Box>
              <Box component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>{positionWords}</Box>
              <Box component="dt" sx={{ color: 'var(--c-text-2)' }}>Joining on</Box>
              <Box component="dd" sx={{ m: 0 }}>{niceDate(joining)}</Box>
            </Box>
            <Typography sx={{ fontSize: 13.5, lineHeight: 1.55 }}>
              This makes the appointment letter, creates the employee, issues the employee code and puts them in the
              position. It cannot be undone from this screen.
            </Typography>
          </Box>
        }
        onClose={() => setConfirmingAppoint(false)}
        onConfirm={appoint}
      />
    </Box>
  );
}
