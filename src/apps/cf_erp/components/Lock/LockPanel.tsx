import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Button, LinearProgress, ListItemText, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import LockRounded from '@mui/icons-material/LockRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import RemoveCircleOutlineRounded from '@mui/icons-material/RemoveCircleOutlineRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { CfApiError } from '../../api/client';
import { loadLock, lockLine, type LockCheck, type LockView } from '../../api/lock';
import type { PieceCodesPreview } from '../../api/pieceCodes';
import type { OrderStage } from '../../api/types';
import { useLoad } from '../../hooks/useLoad';
import { tabFor } from '../../lib/process';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorNotice, SectionCard, SkeletonRows } from '../ui';
import { useToast } from '../toastContext';
import { indexPieces } from '../Production/pieceCodeModel';
import { PieceCodeTree } from '../Production/PieceCodeTree';
import { Working } from '../WorkingNote';
import { knownLineSize, lockCheckingText, lockRecheckText, pieceTreeText, rememberLineSize } from '../../lib/working';
import { saveCsv, saveXlsx } from '../../lib/dashboardExport';
import { bomFileStem, pieceBomTable } from '../../lib/pieceBomExport';

/**
 * The Lock stage (user, 2026-09-26): "Based on the BOM and the values, the
 * items must get created after entry, and once entered and locked I don't see a
 * reason for it to change. If it changes, the whole sales order changes."
 *
 * Locking rolls the line's structure out into PIECES — one per physical piece,
 * identical parts grouped under their parent — and writes each one's real code.
 * From then on the line's structure, values and cut pieces stay as they are; a
 * change is a new revision of the order. It comes right after Structure (with its values) —
 * before nesting and buying; any missing cut piece is made by the freeze itself.
 *
 * The screen says what lock checks, each check in words with what to do about
 * it; what it will write — the number of pieces, the line's position, and on
 * request the whole tree with every code; and, once locked, when it was and
 * the pieces as they were written. Nothing is locked without a confirm that
 * says plainly what happens.
 */

const count = (n: number) => n.toLocaleString();
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;
const ordinal = (n: number) => {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${tail}`;
};
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
/** How many of a check's sentences show before "Show all". */
const SHOWN = 4;

/** A tinted note, the stage screens' way of saying something without taking anything away. */
function Callout({ tone, icon, children }: { tone: 'success' | 'info' | 'warning'; icon?: ReactNode; children: ReactNode }) {
  return (
    <Box role={tone === 'warning' ? 'status' : undefined} sx={{
      display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.25, minWidth: 0, fontSize: 13.5,
      borderRadius: 'var(--r-md)', background: `var(--c-${tone}-50)`, border: `1px solid var(--c-${tone}-200)`, color: `var(--c-${tone}-800)`,
    }}>
      {icon && <Box sx={{ flexShrink: 0, mt: '1px', display: 'flex', '& svg': { fontSize: 18 } }} aria-hidden>{icon}</Box>}
      <Box sx={{ minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5 }}>{children}</Box>
    </Box>
  );
}

/** One check: a mark that is never colour alone, what it looked at, what it found, and what to do. */
function CheckRow({ check, stageLabel, onGo }: { check: LockCheck; stageLabel: string | null; onGo: (() => void) | null }) {
  const [all, setAll] = useState(false);
  const state = !check.applies ? 'na' : check.ok ? 'ok' : 'todo';
  const Icon = state === 'ok' ? CheckCircleRounded : state === 'na' ? RemoveCircleOutlineRounded : ErrorOutlineRounded;
  const colour = state === 'ok' ? 'var(--c-success-600)' : state === 'na' ? 'var(--c-text-3)' : 'var(--c-warning-600)';
  const word = state === 'ok' ? 'Done' : state === 'na' ? 'Not needed' : 'To do';
  // The values, cut-piece and line checks say their problem in the detail
  // itself; the structure and the codes list theirs, one sentence each.
  const extra = check.key === 'structure' || check.key === 'codes' ? check.problems : [];
  const listed = all ? extra : extra.slice(0, SHOWN);
  return (
    <Box component="li" sx={{
      display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', columnGap: 1.25, rowGap: 0.5, py: 1.25, minWidth: 0,
      borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 },
    }}>
      <Icon sx={{ fontSize: 20, color: colour, mt: '1px' }} aria-hidden />
      <Box sx={{ minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap', minWidth: 0 }}>
          <Box component="span" sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>{check.title}</Box>
          <Box component="span" sx={{ fontSize: 12, color: colour, fontWeight: 500 }}>{word}</Box>
        </Box>
        <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{check.detail}</Typography>
        {listed.length > 0 && (
          <Box component="ul" sx={{ m: 0, pl: 2.25, display: 'grid', gap: 0.25, fontSize: 13, color: 'var(--c-text)', overflowWrap: 'anywhere' }}>
            {listed.map((p, i) => <li key={i}>{p}</li>)}
          </Box>
        )}
        {extra.length > SHOWN && (
          <Box>
            <Button size="small" onClick={() => setAll((v) => !v)} aria-expanded={all} sx={{ color: 'var(--c-text-2)', px: 0.5 }}>
              {all ? 'Show fewer' : `Show all ${count(extra.length)}`}
            </Button>
          </Box>
        )}
        {state === 'todo' && (check.todo || onGo) && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mt: 0.25 }}>
            {check.todo && <Typography sx={{ fontSize: 13, color: 'var(--c-text)', flex: '1 1 240px', minWidth: 0 }}>{check.todo}</Typography>}
            {onGo && stageLabel && (
              <Button size="small" variant="outlined" endIcon={<ArrowForwardRounded />} onClick={onGo}>Go to {stageLabel}</Button>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * The BOM the line builds — every piece and group of identical parts with its code, as the Piece
 * codes tree draws them — shown on request (a two-span bridge is ~6,000 pieces), and downloadable
 * whole as Excel or CSV. `header` goes above it: the frozen strip, once the line is frozen.
 */
function BomCard({ lineId, lineNo, orderCode, locked, summary, title, header }: {
  lineId: number; lineNo: number; orderCode: string; locked: boolean; summary: LockView['summary']; title: string; header?: ReactNode;
}) {
  type Load = { status: 'idle' | 'loading' | 'done' | 'failed'; data: LockView | null; error: CfApiError | null };
  const [load, setLoad] = useState<Load>({ status: 'idle', data: null, error: null });
  const [shown, setShown] = useState(false);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  /** The tree, read once and kept. */
  const fetchNodes = async (): Promise<LockView | null> => {
    if (load.data) return load.data;
    setLoad((st) => ({ ...st, status: 'loading', error: null }));
    try {
      const data = await loadLock(lineId, { nodes: true });
      if (alive.current) setLoad({ status: 'done', data, error: null });
      return data;
    } catch (e) {
      if (alive.current) setLoad((st) => ({ ...st, status: 'failed', error: e instanceof CfApiError ? e : new CfApiError(0, String(e)) }));
      return null;
    }
  };
  const download = async (as: 'xlsx' | 'csv') => {
    setMenu(null);
    const d = await fetchNodes();
    if (!d) return;
    const table = pieceBomTable(d.nodes, d.items);
    const stem = bomFileStem(orderCode, lineNo);
    if (as === 'xlsx') saveXlsx(stem, [table]); else saveCsv(stem, table);
  };
  // The Piece codes tree reads the release preview's shape; the lock view is that shape plus its own facts.
  const preview = useMemo<PieceCodesPreview | null>(() => {
    const d = load.data;
    if (!d) return null;
    return {
      line: { ...d.line }, released: null, problems: [], truncated: d.truncated, summary: d.summary,
      nodes: d.nodes, items: d.items, duplicates: d.duplicates, taken: d.taken, missing: d.missing,
    };
  }, [load.data]);
  const ix = useMemo(() => (preview ? indexPieces(preview) : null), [preview]);
  const loading = load.status === 'loading';
  const none = summary.nodes === 0;

  return (
    <SectionCard title={title}
      actions={(
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" startIcon={<AccountTreeRounded />} disabled={loading || none} data-testid="bom-toggle"
            onClick={() => { if (shown) setShown(false); else { setShown(true); void fetchNodes(); } }}>
            {shown ? 'Hide the BOM' : 'Show the full BOM'}
          </Button>
          <Button variant="outlined" startIcon={<DownloadRounded />} disabled={loading || none} data-testid="bom-download"
            aria-haspopup="menu" aria-expanded={!!menu} onClick={(e) => setMenu(e.currentTarget)}>Download</Button>
          <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} slotProps={{ list: { 'aria-label': 'Download the BOM', dense: true } }}>
            <MenuItem data-testid="bom-download-xlsx" onClick={() => { void download('xlsx'); }}>
              <ListItemText primary="Excel workbook (.xlsx)" secondary={`${plural(summary.nodes, 'row')} — every piece with its code`} />
            </MenuItem>
            <MenuItem data-testid="bom-download-csv" onClick={() => { void download('csv'); }}>
              <ListItemText primary="CSV" secondary="The same rows, for any spreadsheet" />
            </MenuItem>
          </Menu>
        </Box>
      )}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5 }}>
        {header}
        <ErrorNotice error={load.error} onRetry={() => { void fetchNodes(); }} sx={{ mb: 0 }} />
        {loading && <LinearProgress aria-label="Working out the pieces" sx={{ borderRadius: 2 }} />}
        <Working active={loading}>{pieceTreeText(summary.nodes || knownLineSize(lineId).pieces, 'pieces')}</Working>
        {!header && (
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
            {none ? 'There are no pieces to show yet.'
              : `${plural(summary.nodes, 'piece')}${locked ? '' : ' will be written'} — ${count(summary.pieces)} numbered one by one, ${plural(summary.groups, 'group')} of identical parts.`}
          </Typography>
        )}
        {shown && preview && ix && <PieceCodeTree data={preview} ix={ix} query={query} onQueryChange={setQuery} />}
      </Box>
    </SectionCard>
  );
}

export function LockPanel({ lineId, lineNo, quantity, canManage, stages, onGoStage, onChanged }: {
  lineId: number;
  lineNo: number;
  /** The line's quantity, known from the order before this screen has read anything — it sizes the wait. */
  quantity?: number;
  canManage: boolean;
  /** The order's stages — which ones exist to send somebody to, and what each is called. */
  stages: OrderStage[];
  onGoStage: (stageKey: string) => void;
  /** After a lock: the order, its process and its production read again. */
  onChanged: () => void;
}) {
  const toast = useToast();
  const { data: view, error, loading, reload } = useLoad(() => loadLock(lineId), [lineId]);
  const [confirming, setConfirming] = useState(false);
  const [round, setRound] = useState(0);
  // A folded stage (Values) is checked on its host's tab (Structure), so that is where "Go to" goes and what it says.
  const stageLabel = (key?: string) => (key ? stages.find((s) => s.stageKey === tabFor(key, stages))?.label ?? null : null);
  // What this read learns about the line's size is what the next slow screen quotes.
  useEffect(() => { if (view) rememberLineSize(lineId, { pieces: view.summary.nodes }); }, [lineId, view]);

  if (error && !view) return <ErrorNotice error={error} onRetry={reload} />;
  if (!view) {
    return (
      <SectionCard title={`Freeze the design of line ${lineNo}`} subtitle="Checking the values, the cut pieces and the structure, and working out every piece's code.">
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          <Working active>{lockCheckingText(knownLineSize(lineId), quantity)}</Working>
          <SkeletonRows rows={5} height={44} />
        </Box>
      </SectionCard>
    );
  }

  const s = view.summary;
  const pos = view.position;
  const positionWords = pos
    ? pos.lines <= 1
      ? `Line position ${pos.text} — the only line of this design on ${view.line.orderCode}.`
      : `Line position ${pos.text} — the ${ordinal(pos.value)} of the ${plural(pos.lines, 'line')} selling this design on ${view.line.orderCode}.`
    : null;
  const failing = view.checks.filter((ch) => ch.applies && !ch.ok).length;

  const lock = async () => {
    const out = await lockLine(lineId);
    toast.success(`Line ${lineNo} is frozen — ${plural(out.locked?.pieces ?? s.nodes, 'piece')} carry their codes.`);
    reload();
    setRound((r) => r + 1);
    onChanged();
  };

  // Frozen (user, 2026-10-07: "just too busy"): one strip says it all; the BOM card carries it.
  if (view.locked) {
    const strip = (
      <Callout tone="success" icon={<LockRounded />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }} data-testid="frozen-strip">
          <strong>Frozen {when(view.locked.at)}</strong>
          {view.locked.by?.name && <span>by {view.locked.by.name}</span>}
          <span>· {plural(view.locked.pieces, 'piece')} coded{pos ? ` · line position ${pos.text}` : ''}</span>
          <span>· changes now need a new revision</span>
          <Tooltip title="Freezing rolled the design out into pieces, each with its own code. The structure, values and cut pieces stay as they are; nesting, buying and production work from these pieces.">
            <InfoOutlined sx={{ fontSize: 16, ml: 0.25, cursor: 'help', color: 'var(--c-success-700)' }} aria-label="What freezing did" />
          </Tooltip>
        </Box>
      </Callout>
    );
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
        <ErrorNotice error={error} onRetry={reload} sx={{ mb: 0 }} />
        <BomCard key={`${lineId}:${round}:locked`} lineId={lineId} lineNo={lineNo} orderCode={view.line.orderCode} locked summary={s}
          title={`Line ${lineNo} · ${view.line.item?.name ?? 'its structure'} ×${view.line.quantity}`} header={strip} />
      </Box>
    );
  }

  let body: ReactNode;
  {
    body = (
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5 }}>
        {view.released && (
          <Callout tone="warning" icon={<ErrorOutlineRounded />}>
            <Box>Line {lineNo} was released to production before its design was frozen. Take the release back first, so the tracker and the frozen pieces carry the same codes.</Box>
          </Callout>
        )}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text)' }}>
            {s.nodes > 0
              ? <><strong>{plural(s.nodes, 'piece')}</strong> will be written — {count(s.pieces)} numbered one by one, {plural(s.groups, 'group')} of identical parts.</>
              : 'Nothing can be rolled out yet — see what is in the way below.'}
          </Typography>
          {positionWords && <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{positionWords}</Typography>}
        </Box>
        <Box component="ul" aria-label="What freezing checks" sx={{ listStyle: 'none', m: 0, p: 0, borderTop: '1px solid var(--c-divider)' }}>
          {view.checks.map((ch) => {
            const label = stageLabel(ch.stageKey);
            return <CheckRow key={ch.key} check={ch} stageLabel={label} onGo={label && ch.stageKey ? () => onGoStage(ch.stageKey as string) : null} />;
          })}
        </Box>
        {failing > 0 && (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            {plural(failing, 'thing is', 'things are')} in the way. The design can be frozen once {failing === 1 ? 'it is' : 'they are'} settled.
          </Typography>
        )}
        {!canManage && (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>You can see this line, but your role cannot freeze it. Ask for the orders permission.</Typography>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
      <SectionCard title={`Freeze the design of line ${lineNo}`}
        subtitle="Freezing the design rolls the structure out into pieces, each with its own code. After that its structure, values and cut pieces no longer change — a change means a new revision of the order."
        actions={canManage
          ? <Button variant="contained" startIcon={<LockRounded />} disabled={!view.canLock || loading} onClick={() => setConfirming(true)}>Freeze the design</Button>
          : undefined}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5 }}>
          {loading && <LinearProgress aria-label="Checking again" sx={{ borderRadius: 2 }} />}
          <Working active={loading}>{lockRecheckText(s.nodes)}</Working>
          <ErrorNotice error={error} onRetry={reload} sx={{ mb: 0 }} />
          {body}
        </Box>
      </SectionCard>
      <BomCard key={`${lineId}:${round}:plan`} lineId={lineId} lineNo={lineNo} orderCode={view.line.orderCode} locked={false} summary={s} title="The BOM freezing will build" />
      <ConfirmDialog open={confirming} title={`Freeze the design of line ${lineNo}?`} confirmLabel="Freeze the design"
        onClose={() => setConfirming(false)} onConfirm={lock}
        body={(
          <Box component="ul" sx={{ m: 0, pl: 2.25, display: 'grid', gap: 0.75 }}>
            <li>Each of the {plural(s.nodes, 'piece')} gets its code, written now{pos ? ` — at line position ${pos.text}` : ''}.</li>
            <li>The structure, the values and the cut pieces stop changing.</li>
            <li>Nesting picks the plates for these pieces; buying and production carry on from there.</li>
            <li>A change after this means a new revision of the order.</li>
          </Box>
        )} />
    </Box>
  );
}
