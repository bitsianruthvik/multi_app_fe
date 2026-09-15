/**
 * BlankNesting — nesting as blanks, and the sheets they come off.
 *
 * ── WHY THIS REPLACES THE BOARD AND THE SUGGESTOR ────────────────────────────
 *
 * Both of those linked a plate straight to a finished part. So an order needing
 * 960 identical stiffeners was 960 cards on a board, and the fact that they are
 * ONE rectangle cut 960 times appeared nowhere. Here a row is that rectangle:
 * 25 part names on the KEPL order become 24 rows.
 *
 * ── TWO VIEWS, BECAUSE THERE ARE TWO QUESTIONS ───────────────────────────────
 *
 *   What has to be cut   the blanks, with the parts that draw on each
 *   How it gets cut      the sheets, each carrying a MIX of rectangles
 *
 * They are not the same list and neither substitutes for the other. A sheet
 * holding a web plate and forty stiffeners is where the steel is saved — on
 * this order 43 of 130 sheets carry more than one rectangle, and packing them
 * separately costs 49 tonnes — so the sheet view has to exist. But "how many
 * stiffeners does this job need" is answered only by the blank view.
 *
 * ── WHAT ACCEPTING DOES ──────────────────────────────────────────────────────
 *
 * Creates the blanks as real items, records every (blank, sheet) pair, points
 * each part at its blank, and raises the cutting work on a production order of
 * its own — separate from fabrication, because cutting waits on plate arriving
 * and fabrication waits on shop capacity.
 *
 * ── PACKING NOW RUNS IN THE BACKGROUND (EU-18) ───────────────────────────────
 *
 * `standard`/`deep` can take tens of seconds; this screen used to run that
 * synchronously on every mount and on every "how hard to look" change, which
 * meant a blocking spinner just to open the tab. It now NEVER packs on its own:
 * on mount it only asks EU-11's `fab_nesting_runs` for the last run this order
 * had (a single cheap row read), and packing happens only when "Run nesting" is
 * clicked, as a background run this screen polls.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';
import {
  Alert, Box, Button, Checkbox, Chip, Collapse, IconButton, LinearProgress,
  Link as MuiLink, MenuItem, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import GridViewRounded from '@mui/icons-material/GridViewRounded';
import { StatusBadge, EmptyState, StatSkeleton, ListSkeleton } from '../components';

import { fabQuery } from '../api/client';
import {
  getBlankPlan, getSavedBlankPlan, acceptBlankPlan, downloadPlanSheet, uploadPlanSheet,
  startNestingRun, getNestingRun, getLatestNestingRun, cancelNestingRun,
  type Blank, type Nest, type BlankSummary, type BlankPlanResponse, type Effort, type SkippedPart,
  type SizeAdvice,
} from '../api/blanks';
import { backendMessage } from '../utils/backendMessage';
import { formatElapsed } from '../utils/formatElapsed';
import { ConfirmDialog } from './FormDialog';
import { useNowTick } from '../hooks/useLiveRefresh';
import NestSheetSvg from './NestSheetSvg';

const t = (kg: number) => `${(kg / 1000).toFixed(1)} t`;

/**
 * The three efforts, in the words a person chooses between. The seconds are
 * the server's own budgets (nestingPacker.EFFORT_LEVELS); `about` is what to
 * tell someone who asks how long.
 */
const EFFORTS: Record<Effort, { label: string; hint: string; seconds: number; about: string }> = {
  quick: { label: 'Quick look', hint: 'A few seconds — while the BOM is still changing', seconds: 0, about: 'a few seconds' },
  standard: { label: 'Standard', hint: 'About a minute — the everyday plan', seconds: 60, about: 'a minute' },
  deep: { label: 'Deep search', hint: 'About five minutes — before a large plate order', seconds: 300, about: 'five minutes' },
};

/**
 * How a plan was made, said plainly. The server records it as
 * "Deep — search in 300.8s" (older plans: "Deep — 2000 restarts in 300.8s");
 * nobody reading it needs "restarts".
 */
const plainProvenance = (p: string | null) => {
  if (!p) return p;
  const m = /^(Quick|Standard|Deep)\s*—\s*(?:\d+\s*restarts|search) in\s*([\d.]+)s/i.exec(p);
  if (!m) return p;
  const secs = Number(m[2]);
  const took = secs < 90 ? `${Math.round(secs)} s` : `${Math.round(secs / 60)} min`;
  return `${m[1]} search · took ${took}`;
};

/** The effort a saved plan was made with, read back off its provenance. */
const effortOf = (p: string | null): Effort | null => {
  const m = /^(quick|standard|deep)\b/i.exec(p ?? '');
  return m ? (m[1].toLowerCase() as Effort) : null;
};
const rect = (o: { thickness: number; width: number; length: number }) =>
  `${o.thickness} × ${o.width} × ${o.length}`;

/**
 * The blank's handle on the cutting-plan sheet: its code after the order's
 * own prefix. The server sends it as `ref`; a plan saved before it existed
 * gets the same answer derived here.
 */
const handleOf = (b: { ref?: string; code: string }) => b.ref ?? b.code.replace(/^BLK-\d+-/, '');

const DEFAULT_THRESHOLDS = { good: 90, warn: 75 };

/** Green above `good`, amber above `warn`, red below. Both on a 0-100 scale. */
const utilColour = (pct: number, th: { good: number; warn: number }) =>
  (pct >= th.good ? 'var(--c-success-600)' : pct >= th.warn ? 'var(--c-warning-600)' : 'var(--c-danger-600)');

/** A backend message split on its own newlines — how a multi-problem refusal is written. */
const messageLines = (err: unknown, fallback: string): string[] => {
  const lines = backendMessage(err, fallback).split('\n').map((s) => s.trim()).filter(Boolean);
  return lines.length ? lines : [fallback];
};

/**
 * REPAIR-D put `NEST_NOT_VERIFIED`'s per-nest problems on the wire as a
 * structured `detail.nests[]` array (via the shared `fail()` responder),
 * alongside the same newline-joined `message` the old code already parsed.
 * Prefer the structured array when it's there; fall back to splitting
 * `message` for every other refusal shape (and for old cached responses).
 */
const refusalLines = (err: unknown, fallback: string): string[] => {
  const data = (err as { response?: { data?: { code?: string; detail?: { nests?: unknown } } } })
    ?.response?.data;
  if (data?.code === 'NEST_NOT_VERIFIED' && Array.isArray(data?.detail?.nests) && data.detail.nests.length) {
    return data.detail.nests as string[];
  }
  return messageLines(err, fallback);
};

export default function BlankNesting({
  orderId, canManage, onStageChanged, onGoToStructure, onContinue,
}: {
  orderId: number | string;
  canManage: boolean;
  onStageChanged?: () => void;
  /** Lets a skipped part jump straight to its Structure row — wired by the wizard (EU-19). */
  onGoToStructure?: (itemId: number) => void;
  /** Wired by the wizard: after a plan is accepted, one click to the next step. */
  onContinue?: () => void;
}) {
  const [blanks, setBlanks] = useState<Blank[]>([]);
  const [nests, setNests] = useState<Nest[]>([]);
  const [summary, setSummary] = useState<BlankSummary | null>(null);
  const [thresholds, setThresholds] = useState<{ good: number; warn: number } | null>(null);
  const [repeatable, setRepeatable] = useState(true);
  const [skipped, setSkipped] = useState<SkippedPart[]>([]);
  /** Have we ever loaded a real plan (from a run, or by re-reading after accept)? */
  const [hasPlan, setHasPlan] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  /** A multi-line accept refusal (EU-11 NEST_NOT_VERIFIED), shown verbatim, line by line. */
  const [refusal, setRefusal] = useState<string[] | null>(null);
  const [uploadProblems, setUploadProblems] = useState<string[] | null>(null);
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [effort, setEffort] = useState<Effort>('standard');
  /** Sheet sizes the packer says would have cut waste (fresh packs only). */
  const [advice, setAdvice] = useState<SizeAdvice[]>([]);
  /**
   * What the ACCEPTED plan buys, remembered from the last time one was on
   * screen — so a fresh proposal can say "2.1 t less than the plan you have"
   * instead of leaving the reader to compare two numbers from memory.
   */
  const [acceptedBoughtKg, setAcceptedBoughtKg] = useState<number | null>(null);
  /**
   * ONE FLOW FOR THE WHOLE ORDER, chosen once at the top.
   *
   * It was a dropdown on all twenty-four rows, and on every order so far the
   * answer is the same on all of them — twenty-four chances to make them differ
   * by accident, for a case nobody has had yet. When one genuinely needs its own
   * flow, that belongs on the blank, and this is the wrong screen to guess it on.
   */
  const [flowId, setFlowId] = useState<number | ''>('');
  const [provenance, setProvenance] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  /** Which sheets the next Accept should actually apply — defaults to all of them. */
  const [checkedNests, setCheckedNests] = useState<Set<string>>(new Set());

  const [flows, setFlows] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    fabQuery<{ data: { id: number; name: string }[] }>('fabErpOperationFlow', {
      filters: { active: 1 },
      orderBy: [{ field: 'name', direction: 'asc' }],
      pagination: { limit: 200 },
    }).then((r) => setFlows(r.data ?? [])).catch(() => setFlows([]));
  }, []);

  /** Adopt a plan (from a finished run, or a plain re-read after accepting). */
  const applyResult = useCallback((res: BlankPlanResponse | null) => {
    if (!res) return;
    setBlanks(res.blanks ?? []);
    setNests(res.nests ?? []);
    setSummary(res.summary ?? null);
    setThresholds(res.thresholds ?? null);
    setSkipped(res.skipped ?? []);
    setRepeatable(res.reproducible !== false);
    setProvenance(res.provenance ?? null);
    setAccepted(res.accepted === true);
    setAdvice(res.accepted === true ? [] : (res.advice ?? []));
    if (res.accepted === true) setAcceptedBoughtKg(res.summary?.boughtKg ?? null);
    setCheckedNests(new Set((res.nests ?? []).map((n) => n.nestNo)));
    setHasPlan(true);
    // Show the effort the plan was made with, not whatever was last picked —
    // "How hard to look: Standard" beside a Deep plan read as a contradiction.
    const e = effortOf(res.provenance ?? null);
    if (e) setEffort(e);
  }, []);

  /*
   * ── THE RUN, AND POLLING IT (X5) ──────────────────────────────────────────
   *
   * A monotonically increasing token, bumped on mount, on every new run, and
   * on cancel — any in-flight request or scheduled poll whose token no longer
   * matches is dropped rather than applied, so a slow stale response can never
   * overwrite a newer one.
   */
  const tokenRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<string | null>(null);
  /** 0–100, as the server reports it — the search knows how much of its budget it has spent. */
  const [runProgress, setRunProgress] = useState(0);
  const [runEffort, setRunEffort] = useState<Effort>('standard');
  // Tick every second only while a run is actually in flight (the elapsed-time
  // display's only consumer) — an unconditional 1s tick rerendered the whole
  // screen even when idle. A near-disabled interval when not running (rather
  // than a conditional hook call, which React forbids) keeps this a one-line
  // change at the call site.
  const now = useNowTick(running ? 1000 : 3_600_000);
  const elapsed = formatElapsed(runStartedAt, now);

  const poll = useCallback((runId: number, token: number) => {
    pollTimerRef.current = setTimeout(async () => {
      if (tokenRef.current !== token) return;
      try {
        const run = await getNestingRun(orderId, runId);
        if (tokenRef.current !== token) return;
        if (run.status === 'queued' || run.status === 'running') {
          setRunProgress(Number(run.progress) || 0);
          if (run.effort) setRunEffort(run.effort);
          poll(runId, token);
          return;
        }
        setRunning(false);
        setActiveRunId(null);
        if (run.status === 'done') applyResult(run.result);
        else if (run.status === 'error') setError(run.error ?? 'That nesting run failed.');
        // 'cancelled': nothing new to show — whatever was on screen stands.
      } catch (err) {
        if (tokenRef.current !== token) return;
        setRunning(false);
        setActiveRunId(null);
        setError(backendMessage(err, 'Lost track of that nesting run.'));
      }
    }, 1500);
  }, [orderId, applyResult]);

  const startRun = useCallback(async () => {
    const myToken = tokenRef.current + 1;
    tokenRef.current = myToken;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setError(null);
    setRefusal(null);
    setResult(null);
    setRunning(true);
    setActiveRunId(null);
    setRunStartedAt(new Date().toISOString());
    setRunProgress(0);
    setRunEffort(effort);
    try {
      const { runId } = await startNestingRun(orderId, effort);
      if (tokenRef.current !== myToken) return;
      setActiveRunId(runId);
      poll(runId, myToken);
    } catch (err) {
      if (tokenRef.current !== myToken) return;
      setRunning(false);
      setError(backendMessage(err, 'Could not start nesting.'));
    }
  }, [orderId, effort, poll]);

  const cancelRun = useCallback(async () => {
    if (!activeRunId) return;
    const runId = activeRunId;
    tokenRef.current += 1; // drop the in-flight poll response, whenever it lands
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setRunning(false);
    setActiveRunId(null);
    try { await cancelNestingRun(orderId, runId); } catch { /* best effort — the token bump already stopped us watching it */ }
  }, [orderId, activeRunId]);

  // Re-nesting an ACCEPTED plan reads as "redo it" — confirm first.
  const [confirmRenest, setConfirmRenest] = useState(false);
  const runOrConfirm = useCallback(() => {
    if (accepted) setConfirmRenest(true);
    else void startRun();
  }, [accepted, startRun]);

  /*
   * ── ON MOUNT: ASK FOR THE LAST RUN, NEVER PACK (item 2) ───────────────────
   *
   * `getLatestNestingRun` is one row read — cheap whether or not a plan has
   * ever been made. If nothing has run yet, the empty state below asks the
   * user to press "Run nesting" rather than silently starting a 36-second pack.
   */
  useEffect(() => {
    const myToken = tokenRef.current + 1;
    tokenRef.current = myToken;
    setInitializing(true);
    setHasPlan(false);
    (async () => {
      try {
        const { run } = await getLatestNestingRun(orderId);
        if (tokenRef.current !== myToken) return;
        if (run?.status === 'done' && run.result) {
          /*
           * THE LAST RUN, UNLESS IT IS THE PLAN THAT WAS ACCEPTED. A run's
           * result is a proposal and says "not accepted" — which is wrong the
           * moment somebody accepts it and comes back: the same sheets were
           * on screen labelled as if nothing had happened. So the saved plan
           * is read too (one cheap row read); when it matches the run it is
           * shown instead, with its real status, and otherwise it only feeds
           * the "less than the accepted plan" comparison.
           */
          const saved = await getSavedBlankPlan(orderId).catch(() => null);
          if (tokenRef.current !== myToken) return;
          const same = saved?.accepted && saved.nests.length === run.result.nests.length
            && Math.abs((saved.summary?.boughtKg ?? 0) - (run.result.summary?.boughtKg ?? -1)) < 1;
          if (saved?.accepted) setAcceptedBoughtKg(saved.summary?.boughtKg ?? null);
          applyResult(same ? saved : run.result);
        } else if (!run || run.status === 'error' || run.status === 'cancelled') {
          /*
           * NO RUN, BUT MAYBE A PLAN. An order nested before background runs
           * existed, or one whose plan came in as a spreadsheet, has an
           * accepted plan and no run row — and used to open on "Nesting has
           * not been run yet" while the footer said the plan was accepted.
           * `saved=1` is one cheap read and never packs.
           */
          const saved = await getSavedBlankPlan(orderId);
          if (tokenRef.current !== myToken) return;
          if (saved.accepted) applyResult(saved);
        } else if (run && (run.status === 'queued' || run.status === 'running')) {
          // Someone else (another tab, another user) started this and it is
          // still going — pick up polling it rather than losing track of it.
          setRunning(true);
          setRunStartedAt(run.startedAt ?? run.createdAt);
          setRunProgress(Number(run.progress) || 0);
          if (run.effort) setRunEffort(run.effort);
          setActiveRunId(run.id);
          poll(run.id, myToken);
        }
      } catch {
        // No run history, or the lookup failed — the empty state stands either way.
      } finally {
        if (tokenRef.current === myToken) setInitializing(false);
      }
    })();
    return () => { tokenRef.current += 1; if (pollTimerRef.current) clearTimeout(pollTimerRef.current); };
    // Deliberately orderId-only: `applyResult`/`poll` are stable (their own
    // deps don't include state this effect should re-run for), and re-running
    // this on every `effort` pick would turn "change the dropdown" back into
    // a fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  /** Cheap re-read of what the order NOW has accepted — after accept/upload, never on mount. */
  const refreshAccepted = useCallback(async () => {
    try {
      const res = await getBlankPlan(orderId, effort, false);
      applyResult(res);
    } catch (err) {
      setError(backendMessage(err, 'Could not re-read the accepted plan.'));
    }
  }, [orderId, effort, applyResult]);

  const toggle = useCallback((k: string) => setOpen((o) => {
    const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n;
  }), []);

  const toggleChecked = useCallback((nestNo: string) => setCheckedNests((s) => {
    const n = new Set(s); if (n.has(nestNo)) n.delete(nestNo); else n.add(nestNo); return n;
  }), []);

  const accept = useCallback(async () => {
    setAccepting(true);
    setError(null);
    setRefusal(null);
    setResult(null);
    const chosen = nests.filter((n) => checkedNests.has(n.nestNo));
    try {
      const res = await acceptBlankPlan(orderId, {
        nests: chosen,
        // Every blank gets the same flow; blank means "the cutting default".
        flows: flowId === ''
          ? {}
          : Object.fromEntries(blanks.map((b) => [b.key, Number(flowId)])),
        provenance: provenance ?? undefined,
      });
      setResult(
        `${res.blanks} blanks across ${res.sheets} sheets on ${res.cuttingOrderNumber}. `
        + `${res.partsRepointed} part rows now come off a blank.`,
      );
      await refreshAccepted();
      onStageChanged?.();
    } catch (err) {
      // EU-11 refuses a partial accept that would split a row with one message
      // carrying a line per problem — show every line verbatim, not just the
      // first.
      const lines = refusalLines(err, 'That plan could not be accepted.');
      if (lines.length > 1) setRefusal(lines);
      else setError(lines[0]);
    } finally {
      setAccepting(false);
    }
  }, [nests, checkedNests, blanks, flowId, provenance, orderId, refreshAccepted, onStageChanged]);

  /**
   * THE SECOND WAY IN.
   *
   * The packer does not know that the 40 mm is stacked behind the 25 mm, or that
   * the cutter wants every diaphragm plate in one setup. A planner who cannot
   * say so keeps the real plan in a spreadsheet beside the software — and then
   * the software is describing a job nobody is doing.
   *
   * So the suggestion is a STARTING POINT that can be taken away, edited and
   * brought back, rather than the only thing the screen will accept.
   */
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const download = useCallback(async () => {
    try {
      await downloadPlanSheet(orderId, effort);
    } catch (err) {
      setError(backendMessage(err, 'Could not produce the sheet.'));
    }
  }, [orderId, effort]);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    setUploadProblems(null);
    setResult(null);
    try {
      const res = await uploadPlanSheet(orderId, file);
      const short = res.fromSheet?.short ?? [];
      setResult(
        `Your plan applied: ${res.fromSheet?.sheets ?? res.sheets} sheets from ${res.fromSheet?.rows ?? 0} rows, `
        + `on ${res.cuttingOrderNumber}.`
        + (short.length
          ? ` ${short.length} blank${short.length === 1 ? '' : 's'} not fully covered — `
            + short.slice(0, 3).map((x) => `${x.rect} (${x.planned} of ${x.needed})`).join(', ')
            + (short.length > 3 ? ', and more' : '') + '.'
          : ''),
      );
      await refreshAccepted();
      onStageChanged?.();
    } catch (err) {
      const problems = (err as { response?: { data?: { problems?: string[] } } })?.response?.data?.problems;
      if (problems?.length) setUploadProblems(problems);
      else setError(backendMessage(err, 'That sheet could not be read.'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [orderId, refreshAccepted, onStageChanged]);

  const shortBlanks = useMemo(() => blanks.filter((b) => b.short > 0), [blanks]);
  const th = thresholds ?? DEFAULT_THRESHOLDS;
  // A fresh object literal here would defeat NestRow's memo on every render
  // (react-window compares itemData by reference), so it's memoised same as
  // any other prop passed down.
  const nestRowData = useMemo<NestRowData>(() => ({
    nests, checkedNests, onToggleCheck: toggleChecked, canManage, thresholds: th,
  }), [nests, checkedNests, toggleChecked, canManage, th]);

  /*
   * THE THREE EFFORTS, SAID IN TIME AND PURPOSE. "Quick / Standard / Deep" on
   * their own gave nobody a reason to pick one; what a person actually wants
   * to know is how long it takes and when it is worth it.
   */
  const effortPicker = (
    <TextField
      select size="small" label="How hard to look" value={effort}
      onChange={(e) => setEffort(e.target.value as Effort)}
      sx={{ width: 200 }}
      slotProps={{ select: { renderValue: (v) => EFFORTS[v as Effort].label } }}
    >
      {(Object.keys(EFFORTS) as Effort[]).map((k) => (
        <MenuItem key={k} value={k} sx={{ display: 'block', py: 0.75 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{EFFORTS[k].label}</Typography>
          <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{EFFORTS[k].hint}</Typography>
        </MenuItem>
      ))}
    </TextField>
  );

  const runningPanel = (
    <Box sx={{ p: 4, textAlign: 'center', maxWidth: 480, mx: 'auto' }}>
      <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 0.5 }}>
        Working out which sheets waste least
      </Typography>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 2 }}>
        {EFFORTS[runEffort].label} · {elapsed ?? '0s'} so far
        {EFFORTS[runEffort].seconds > 0 && ` · usually about ${EFFORTS[runEffort].about}`}
      </Typography>
      <LinearProgress
        variant={runProgress > 0 ? 'determinate' : 'indeterminate'}
        value={runProgress}
        sx={{ height: 6, borderRadius: 3, mb: 1 }}
      />
      <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mb: 2 }}>
        {runProgress > 0
          ? `${runProgress}% of the search done — every sheet is packed once first, then the time goes where the waste is`
          : 'Packing every thickness once, then improving the worst sheets'}
      </Typography>
      <Button size="small" onClick={() => void cancelRun()}>Cancel</Button>
    </Box>
  );

  if (initializing) {
    // §5.7-5: the shape of the screen to come (four stats, a list), not a spinner.
    return (
      <Box sx={{ p: 2 }}>
        <StatSkeleton count={4} />
        <Box sx={{ mt: 2 }}><ListSkeleton rows={4} /></Box>
      </Box>
    );
  }

  if (running) return runningPanel;

  if (!hasPlan) {
    return (
      <Box sx={{ p: 2 }}>
        {error && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        <EmptyState
          icon={<GridViewRounded />}
          title="Work out which sheets to cut this order from"
          hint="Every part with a size becomes a rectangle to cut. The packer lays those onto plate from the catalogue and looks for the arrangement that buys the least steel. Nothing is ordered or cut until you accept a plan."
          action={(
            <Stack direction="row" spacing={1.5} justifyContent="center" alignItems="center">
              {effortPicker}
              <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={() => void startRun()}>
                Run nesting
              </Button>
            </Stack>
          )}
        />
      </Box>
    );
  }

  if (!blanks.length) {
    return (
      <Box sx={{ p: 2 }}>
        {error && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        <Alert severity="info" variant="outlined">
          Nothing to nest yet. Nesting groups this order&rsquo;s parts into rectangles, and a part
          needs a size <b>and its steel</b> (material and grade) before it can be one. Sizes are on
          the Structure step; the steel is set once on the line &mdash; the pencil on the line&rsquo;s
          row &mdash; or on a single part where it differs.
          {skipped.length > 0 && (
            <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2.5 }}>
              {skipped.slice(0, 6).map((s, i) => (
                <li key={i}>
                  {onGoToStructure && s.itemId != null ? (
                    <MuiLink component="button" type="button" onClick={() => onGoToStructure(s.itemId!)} sx={{ fontWeight: 600 }}>
                      {s.name}
                    </MuiLink>
                  ) : <b>{s.name}</b>} — {s.reason}
                </li>
              ))}
              {skipped.length > 6 && <li>…and {skipped.length - 6} more</li>}
            </Box>
          )}
        </Alert>
        <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
          {effortPicker}
          <Button size="small" startIcon={<RefreshIcon />} onClick={runOrConfirm}>Re-nest</Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      {error && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {result && (
        <Alert
          severity="success" sx={{ mb: 2 }} onClose={() => setResult(null)}
          action={onContinue && accepted ? (
            <Button color="inherit" size="small" endIcon={<ArrowForwardRounded />} onClick={onContinue}>
              Next step
            </Button>
          ) : undefined}
        >
          {result}
        </Alert>
      )}
      {refusal && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setRefusal(null)}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>That plan could not be verified:</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {refusal.map((line, i) => (
              <li key={i} style={{ fontSize: 12.5, fontFamily: 'var(--font-mono, monospace)' }}>{line}</li>
            ))}
          </Box>
        </Alert>
      )}
      {uploadProblems && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setUploadProblems(null)}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>That plan could not be read:</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {uploadProblems.map((line, i) => (
              <li key={i} style={{ fontSize: 12.5 }}>{line}</li>
            ))}
          </Box>
        </Alert>
      )}

      {/* ── the numbers ──────────────────────────────────────────────────── */}
      <Stack direction="row" spacing={0} sx={{
        mb: 2, border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)',
        overflow: 'hidden', background: 'var(--c-surface)', boxShadow: 'var(--e-1)', flexWrap: 'wrap',
      }}>
        {([
          // Four, not seven. Pieces, mixed sheets and drop were all derivable
          // from what is left and none of them changed a decision — they were
          // there because they were interesting, which is not the same thing.
          // WASTE replaced BLANKS: the blank count is on the tab beneath, and
          // the tonnes thrown away is the number this whole step exists to cut.
          ['Sheets', String(summary?.plates ?? 0), null, null],
          ['Steel to buy', t(summary?.boughtKg ?? 0), null,
            acceptedBoughtKg != null && !accepted && summary
              ? (summary.boughtKg < acceptedBoughtKg
                ? `${t(acceptedBoughtKg - summary.boughtKg)} less than the accepted plan`
                : summary.boughtKg > acceptedBoughtKg
                  ? `${t(summary.boughtKg - acceptedBoughtKg)} more than the accepted plan`
                  : 'same as the accepted plan')
              : null],
          ['Waste', t(summary?.dropKg ?? 0), null,
            summary && summary.grossKg > 0 ? `${((summary.dropKg / summary.grossKg) * 100).toFixed(1)}% of the plate` : null],
          ['Yield', `${((summary?.yield ?? 0) * 100).toFixed(1)}%`, utilColour((summary?.yield ?? 0) * 100, th), null],
        ] as [string, string, string | null, string | null][]).map(([k, v, colour, sub]) => (
          <Box key={k} sx={{ px: 2, py: 1.25, borderRight: '1px solid var(--c-divider)', minWidth: 112 }}>
            <Typography sx={{
              fontSize: 10.5, fontWeight: 600, letterSpacing: '.075em',
              textTransform: 'uppercase', color: 'var(--c-text-3)',
            }}>{k}</Typography>
            <Typography sx={{
              fontFamily: 'var(--font-mono, monospace)', fontSize: 22, fontWeight: 600, lineHeight: 1.15,
              fontVariantNumeric: 'tabular-nums', color: colour ?? 'var(--c-text)',
            }}>{v}</Typography>
            {sub && (
              <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>{sub}</Typography>
            )}
          </Box>
        ))}
      </Stack>

      {/*
        WHAT SIZE WOULD HAVE HELPED. On KEPL the single biggest loss is 16 t of
        28 mm because the only sheet wide enough is 3100 and the webs are 2995.
        No arrangement can touch that; a phone call to the mill can. This is
        the one place that fact is said out loud.
      */}
      {advice.length > 0 && !accepted && (
        <Alert severity="info" variant="outlined" sx={{ mb: 1.5, py: 0.5 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.25 }}>
            Some of this waste is the plate size, not the layout
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {advice.slice(0, 3).map((a, i) => (
              <li key={i} style={{ fontSize: 12.5 }}>
                <b>{a.thickness} mm</b>: {a.plates} sheet{a.plates === 1 ? '' : 's'} of{' '}
                <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{a.from.length} × {a.from.width}</span>
                {' '}only need{' '}
                <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{a.to.length} × {a.to.width}</span>
                {' '}— <b>{t(a.savingKg)}</b> less plate if the mill can supply that size.
              </li>
            ))}
          </Box>
        </Alert>
      )}

      {/*
        WHAT THIS PLAN IS, in one line: accepted or not, and how it was arrived
        at. "Deep — 2000 restarts in 41s" or "Uploaded from a spreadsheet". The
        first question anybody asks about a plan is why it looks like that, and
        the screen could not answer it at all.
      */}
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap' }}>
        {/* §7.3: a status is an icon + a label + a family, the same badge every screen uses. */}
        <StatusBadge status={accepted ? 'accepted' : 'not accepted'} family={accepted ? 'success' : 'warning'} />
        {provenance && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{plainProvenance(provenance)}</Typography>
        )}
        {!repeatable && !accepted && (
          <Tooltip title="A timed search: running it again may land on a slightly different plan. What you accept is what gets cut.">
            <Chip size="small" variant="outlined" label="timed search" />
          </Tooltip>
        )}
        {shortBlanks.length > 0 && (
          <Chip size="small" color="error" variant="outlined"
            label={`${shortBlanks.length} not fully placed`} />
        )}
        {!thresholds && (
          <Tooltip title="The backend has not stated yield bands for this order — showing the 90% / 75% defaults.">
            <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>yield bands: 90% / 75% (default)</Typography>
          </Tooltip>
        )}

        <Box sx={{ flex: 1 }} />

        <TextField
          select size="small" label="Cut by" value={flowId}
          onChange={(e) => setFlowId(e.target.value === '' ? '' : Number(e.target.value))}
          sx={{ width: 190 }}
          disabled={!canManage}
          // An empty value is a real choice — the cutting default — so say it,
          // rather than showing an empty box that reads as "not set".
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        >
          <MenuItem value="">Cutting (default)</MenuItem>
          {flows.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
        </TextField>

        {effortPicker}

        <Button size="small" startIcon={<RefreshIcon />} onClick={runOrConfirm}>
          Re-nest
        </Button>
        <Button size="small" startIcon={<DownloadIcon />} onClick={() => void download()}>
          Download plan
        </Button>
        {canManage && (
          <Button
            size="small" startIcon={<UploadFileIcon />} disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? 'Reading…' : 'Upload plan'}
          </Button>
        )}
        <input
          ref={fileRef} type="file" accept=".xlsx" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
        />
      </Stack>

      <ConfirmDialog
        open={confirmRenest}
        title="Work out a new plan?"
        confirmLabel="Re-nest"
        body="This works out a new plan to look at. The accepted plan stays until you accept a different one."
        onClose={() => setConfirmRenest(false)}
        onConfirm={() => startRun()}
      />

      {/*
        Only when it is NOT accepted. Once it is, the status chip says so and a
        paragraph explaining that this is a suggestion is describing something
        that already stopped being one.
      */}
      {!accepted && (
        <Alert severity="info" variant="outlined" sx={{ mb: 1.5, py: 0.5 }}>
          This is a <b>suggestion</b>. Accept it, or download it, rearrange it in Excel or your nesting program (the Blank column is the code after the order number), and
          upload it back — the plan that gets built is whichever you accept last.
        </Alert>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1, minHeight: 36 }}>
        <Tab label={`What has to be cut (${blanks.length})`} sx={{ minHeight: 36, fontSize: 13 }} />
        <Tab label={`How it gets cut (${nests.length} sheets)`} sx={{ minHeight: 36, fontSize: 13 }} />
      </Tabs>

      {/* ── the blanks ───────────────────────────────────────────────────── */}
      {tab === 0 && (
        <Box sx={{
          border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)',
          overflowX: 'auto', overflowY: 'hidden',
        }}>
          <Stack direction="row" spacing={1} sx={{
            px: 1.5, py: 0.75, background: 'var(--c-surface-2)', minWidth: 760,
            borderBottom: '1px solid var(--c-border)',
          }}>
            <Box sx={{ width: 26, flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}><Hd>Blank</Hd></Box>
            <Box sx={{ width: 70, flexShrink: 0, textAlign: 'right' }}><Hd>Need</Hd></Box>
            <Box sx={{ width: 210, flexShrink: 0 }}><Hd>Cut from</Hd></Box>
            <Box sx={{ width: 80, flexShrink: 0, textAlign: 'right' }}><Hd>Sheets</Hd></Box>
          </Stack>

          {blanks.map((b) => (
            <BlankRow key={b.key} blank={b} isOpen={open.has(b.key)} onToggle={toggle} />
          ))}
        </Box>
      )}

      {/* ── the sheets ───────────────────────────────────────────────────── */}
      {tab === 1 && (
        <Box sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
          <FixedSizeList<NestRowData>
            height={Math.min(600, Math.max(150, nests.length * 148))}
            width="100%"
            itemCount={nests.length}
            itemSize={148}
            itemData={nestRowData}
          >
            {NestRow}
          </FixedSizeList>
        </Box>
      )}

      {skipped.length > 0 && (
        <Alert severity="warning" variant="outlined" sx={{ mt: 2 }}>
          {skipped.length} part row{skipped.length === 1 ? '' : 's'} could not be turned into a
          blank:{' '}
          {skipped.slice(0, 3).map((s, i) => (
            <span key={i}>
              {i > 0 && ', '}
              {onGoToStructure && s.itemId != null ? (
                <MuiLink component="button" type="button" onClick={() => onGoToStructure(s.itemId!)}>{s.name}</MuiLink>
              ) : s.name} ({s.reason})
            </span>
          ))}
          {skipped.length > 3 && `, and ${skipped.length - 3} more`}.
        </Alert>
      )}

      {/* ── accept ───────────────────────────────────────────────────────── */}
      {canManage && (
        <Stack direction="row" spacing={2} alignItems="center" sx={{
          mt: 2, p: 1.75, borderRadius: 'var(--r-md)', background: 'var(--c-surface-2)',
          border: '1px solid var(--c-border)', flexWrap: 'wrap',
        }}>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', flex: '1 1 320px', minWidth: 0 }}>
            Accepting creates <b>{blanks.length} blanks</b> across{' '}
            <b>{checkedNests.size} of {nests.length} sheets</b>,
            points every part at its blank, and raises the cutting work on its own production
            order — separate from fabrication, because it waits on plate rather than on the shop.
          </Typography>
          <Button
            variant="contained" disabled={accepting || !nests.length || !checkedNests.size}
            onClick={() => void accept()}
          >
            {accepting ? 'Working…' : 'Accept plan'}
          </Button>
        </Stack>
      )}
    </Box>
  );
}

const BlankRow = memo(function BlankRow({
  blank: b, isOpen, onToggle,
}: {
  blank: Blank;
  isOpen: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <Box sx={{ borderBottom: '1px solid var(--c-divider)' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{
        px: 1.5, py: 0.85, minWidth: 760,
        background: b.short > 0 ? 'var(--c-danger-50, #FCE9EC)' : undefined,
        '&:hover': { background: 'var(--c-surface-2)' },
      }}>
        <IconButton size="small" sx={{ p: 0.25 }} onClick={() => onToggle(b.key)}>
          {isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        </IconButton>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/*
            * nowrap: "28 × 2995 × 12000" is ONE value and was breaking
            * after every ×, turning a row into four lines of digits.
            */}
          <Stack direction="row" spacing={1} alignItems="baseline">
            {/* The short handle the cutting-plan sheet uses for this blank. */}
            {handleOf(b) && (
              <Typography sx={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, fontWeight: 600, color: 'var(--c-primary-600)' }}>
                {handleOf(b)}
              </Typography>
            )}
            <Typography noWrap sx={{
              fontFamily: 'var(--font-mono, monospace)', fontSize: 13.5, fontWeight: 600,
              whiteSpace: 'nowrap',
            }}>{rect(b)}</Typography>
          </Stack>
          {/*
            * A BLANK IS A SIZE, NOT A PART. Listing the part names here
            * read as "this blank belongs to these parts" — it does not;
            * this one serves eight part rows. The count says the
            * relationship correctly and the names are one click away.
            */}
          <Typography noWrap sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
            {b.material} {b.grade} · used by {b.partCount} part{b.partCount === 1 ? '' : 's'}
          </Typography>
        </Box>

        <Box sx={{ width: 70, flexShrink: 0, textAlign: 'right' }}>
          <Mono bold>{b.qty}</Mono>
          {b.short > 0 && (
            <Typography sx={{ fontSize: 11, color: 'var(--c-danger-600)' }}>
              {b.short} short
            </Typography>
          )}
        </Box>

        <Box sx={{ width: 210, flexShrink: 0 }}>
          {b.plateSizes.length === 0 ? (
            <Tooltip title={b.reason ?? 'No sheet could hold it'}>
              <Chip size="small" color="error" variant="outlined" label="nothing fits" />
            </Tooltip>
          ) : (
            <>
              <Typography noWrap sx={{
                fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5,
              }}>{b.plateSizes[0]}</Typography>
              <Typography noWrap sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                {b.plateSizes.length > 1
                  ? `and ${b.plateSizes.length - 1} other size${b.plateSizes.length > 2 ? 's' : ''}`
                  : `${b.material ?? ''} ${b.grade ?? ''}`.trim()}
              </Typography>
            </>
          )}
        </Box>

        <Box sx={{ width: 80, flexShrink: 0, textAlign: 'right' }}>
          <Mono>{b.plateCount || '—'}</Mono>
          {b.sharesPlates > 0 && (
            <Tooltip title={`${b.sharesPlates} of these sheets also carry other blanks`}>
              <Typography sx={{ fontSize: 11, color: 'var(--c-primary-600)' }}>
                {b.sharesPlates} mixed
              </Typography>
            </Tooltip>
          )}
        </Box>

      </Stack>

      <Collapse in={isOpen} unmountOnExit>
        <Box sx={{ px: 5, py: 1.5, background: 'var(--c-surface-2)' }}>
          <Stack direction="row" spacing={3} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
            <Kv k="On the sheet as" v={handleOf(b)} />
            <Kv k="Blank code" v={b.code} />
            <Kv k="Used by" v={`${b.partCount} part row${b.partCount === 1 ? '' : 's'}`} />
            <Kv k="Steel in parts" v={t(b.totalWeightKg)} />
            <Kv k="Each" v={`${b.unitWeightKg.toFixed(1)} kg`} />
          </Stack>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 0.5 }}>
            Parts cut from this rectangle:
          </Typography>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
            {b.partNames.map((nm) => (
              <Chip key={nm} size="small" variant="outlined" label={nm} />
            ))}
          </Stack>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 0.75 }}>
            Cut across {b.nests.length} sheet{b.nests.length === 1 ? '' : 's'}:
          </Typography>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {b.nests.slice(0, 24).map((n) => (
              <Chip
                key={n.nestNo} size="small"
                variant={n.sharedWith > 0 ? 'filled' : 'outlined'}
                color={n.isDrop ? 'success' : n.sharedWith > 0 ? 'primary' : 'default'}
                label={`${n.nestNo} · ${n.qty}${n.sharedWith > 0 ? ` +${n.sharedWith}` : ''}`}
              />
            ))}
            {b.nests.length > 24 && (
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', alignSelf: 'center' }}>
                …and {b.nests.length - 24} more
              </Typography>
            )}
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
});

interface NestRowData {
  nests: Nest[];
  checkedNests: Set<string>;
  onToggleCheck: (nestNo: string) => void;
  canManage: boolean;
  thresholds: { good: number; warn: number };
}

/** One sheet: tick box, the drawing, its size, what's on it, and the fill. */
const NestRow = memo(function NestRow({ index, style, data }: ListChildComponentProps<NestRowData>) {
  const {
    nests, checkedNests, onToggleCheck, canManage, thresholds,
  } = data;
  const n = nests[index];
  const checked = checkedNests.has(n.nestNo);
  const pct = n.utilisationPct ?? n.usedPct ?? 0;
  const colour = utilColour(pct, thresholds);

  return (
    <div style={style}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{
        px: 1.5, height: '100%', borderBottom: '1px solid var(--c-divider)',
        '&:hover': { background: 'var(--c-surface-2)' },
      }}>
        <Checkbox
          size="small" checked={checked} disabled={!canManage}
          onChange={() => onToggleCheck(n.nestNo)}
          inputProps={{ 'aria-label': `Include sheet ${n.nestNo} in the accepted plan` }}
        />
        <Typography sx={{
          fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5, width: 58, flexShrink: 0,
          color: 'var(--c-text-2)',
        }}>{n.nestNo}</Typography>

        {/* The real cut when the server sent one; a synthesised shelf layout only for a sheet with no geometry. */}
        <Tooltip title={n.piecesDerived ? 'Drawn from a re-pack — the accepted plan kept no layout for this sheet' : ''}>
          <Box sx={{ display: 'flex' }}>
            <NestSheetSvg
              plate={n} items={n.items} height={116}
              pieces={n.pieces?.length ? n.pieces.map((p, i) => ({
                key: p.key, name: n.items.find((it) => it.key === p.key)?.name ?? p.key,
                index: i + 1, qty: n.items.find((it) => it.key === p.key)?.qty ?? 1,
                x: p.x, y: p.y, l: p.l, w: p.w, rotated: p.rotated,
              })) : undefined}
            />
          </Box>
        </Tooltip>

        <Box sx={{ width: 160, flexShrink: 0 }}>
          <Typography noWrap sx={{
            fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5, fontWeight: 600,
          }}>{rect(n)}</Typography>
          <Typography noWrap sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
            {n.plateKg.toFixed(0)} kg{n.isDrop ? ' · offcut' : ''}
          </Typography>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, maxHeight: '100%', overflowY: 'auto' }}>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {n.items.map((it) => (
              <Chip key={it.key} size="small" variant="outlined"
                label={`${it.qty} × ${it.rect}`} sx={{ fontFamily: 'var(--font-mono, monospace)' }} />
            ))}
          </Stack>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ width: 100, flexShrink: 0, justifyContent: 'flex-end' }}>
          <Typography sx={{
            fontFamily: 'var(--font-mono, monospace)', fontSize: 13, fontWeight: 600,
            color: colour, whiteSpace: 'nowrap',
          }}>{pct.toFixed(0)}%</Typography>
          {n.overfilled && (
            <Tooltip title="This sheet is recorded as carrying more than its own area — check the plan.">
              <Chip size="small" color="error" variant="outlined" label="over" />
            </Tooltip>
          )}
        </Stack>
      </Stack>
    </div>
  );
});

function Hd({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{
      fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em',
      textTransform: 'uppercase', color: 'var(--c-text-3)',
    }}>{children}</Typography>
  );
}

function Mono({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return (
    <Typography sx={{
      fontFamily: 'var(--font-mono, monospace)', fontSize: bold ? 14 : 13,
      fontWeight: bold ? 600 : 400, fontVariantNumeric: 'tabular-nums',
    }}>{children}</Typography>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <Box>
      <Typography sx={{
        fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em',
        textTransform: 'uppercase', color: 'var(--c-text-3)',
      }}>{k}</Typography>
      <Typography sx={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5 }}>{v}</Typography>
    </Box>
  );
}
