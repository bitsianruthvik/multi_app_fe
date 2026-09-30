import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Button, LinearProgress, Typography } from '@mui/material';
import TagRounded from '@mui/icons-material/TagRounded';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import { CfApiError } from '../../api/client';
import { loadPieceCodes, type PieceCodesPreview } from '../../api/pieceCodes';
import { ErrorNotice, SectionCard, SkeletonRows } from '../ui';
import { indexPieces } from './pieceCodeModel';
import { PieceCodeTree } from './PieceCodeTree';
import { Working } from '../WorkingNote';
import { knownLineSize, pieceTreeText, rememberLineSize } from '../../lib/working';

const count = (n: number) => n.toLocaleString();
const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;
/** How many codes a callout names before it stops. */
const NAMED = 5;
/** How many of the release problems are listed before "and N more". */
const LISTED = 30;

/** A tinted note in the card: danger for what release will refuse, warning for what is incomplete. */
function Callout({ tone, children }: { tone: 'info' | 'warning' | 'danger'; children: ReactNode }) {
  const Icon = tone === 'info' ? InfoOutlined : ErrorOutlineRounded;
  return (
    <Box role={tone === 'info' ? undefined : 'alert'} sx={{
      display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.25, minWidth: 0, fontSize: 13,
      borderRadius: 'var(--r-md)', background: `var(--c-${tone}-50)`, border: `1px solid var(--c-${tone}-200)`, color: `var(--c-${tone}-800)`,
    }}>
      <Icon sx={{ fontSize: 17, mt: '1px', flexShrink: 0 }} aria-hidden />
      <Box sx={{ minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75 }}>{children}</Box>
    </Box>
  );
}

/** Codes a callout names — each one finds itself in the tree. */
function CodeChips({ codes, total, onFind }: { codes: string[]; total: number; onFind: (code: string) => void }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
      {codes.slice(0, NAMED).map((code) => (
        <Box key={code} component="button" type="button" onClick={() => onFind(code)} title="Find it in the list"
          sx={{
            fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--c-text)', background: 'var(--c-surface)', cursor: 'pointer',
            border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', px: 0.75, py: 0.25, overflowWrap: 'anywhere', textAlign: 'left', maxWidth: '100%',
            '&:hover': { borderColor: 'var(--c-primary-400)' }, '&:focus-visible': { outline: '2px solid var(--c-focus)', outlineOffset: 1 },
          }}>
          {code}
        </Box>
      ))}
      {total > NAMED && <Box component="span" sx={{ fontSize: 12.5 }}>and {count(total - NAMED)} more</Box>}
    </Box>
  );
}

type Load = { status: 'idle' | 'loading' | 'done' | 'failed'; data: PieceCodesPreview | null; error: CfApiError | null; round: number };

/**
 * "Where can I see the code that's formed?" — before a line is released, every
 * piece release would make and the code release would write for it, as a tree.
 * Read-only, and only on request: working it out for a two-span bridge means
 * laying out ~6,000 pieces, so it is never loaded just because the tab opened.
 */
export function PieceCodesCard({ lineId, lineNo }: { lineId: number; lineNo: number }) {
  const [load, setLoad] = useState<Load>({ status: 'idle', data: null, error: null, round: 0 });
  const [query, setQuery] = useState('');
  const [showProblems, setShowProblems] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const run = async () => {
    setLoad((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const data = await loadPieceCodes(lineId);
      rememberLineSize(lineId, { pieces: data.summary.nodes });
      if (alive.current) setLoad((s) => ({ status: 'done', data, error: null, round: s.round + 1 }));
    } catch (e) {
      if (alive.current) setLoad((s) => ({ ...s, status: 'failed', error: e instanceof CfApiError ? e : new CfApiError(0, String(e)) }));
    }
  };

  const data = load.data;
  const ix = useMemo(() => (data && !data.released ? indexPieces(data) : null), [data]);
  const loading = load.status === 'loading';

  const holes = useMemo(() => {
    const byRule = new Map<string, { scheme: string; needs: string; codes: string[] }>();
    for (const m of data?.missing ?? []) {
      const needs = m.missing.join(', ');
      const key = `${m.schemeCode}\u0000${needs}`;
      if (!byRule.has(key)) byRule.set(key, { scheme: m.schemeCode, needs, codes: [] });
      byRule.get(key)?.codes.push(data?.nodes[m.k]?.code ?? '');
    }
    return [...byRule.values()];
  }, [data]);

  const find = (code: string) => setQuery(code);

  let body: ReactNode;
  if (!data && load.status !== 'failed') {
    body = loading ? (
      <Box sx={{ display: 'grid', gap: 1.25 }}>
        <Working active>{pieceTreeText(knownLineSize(lineId).pieces, 'codes')}</Working>
        <SkeletonRows rows={5} height={30} />
      </Box>
    ) : (
      <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
        Release gives each physical piece its own code, numbered under the piece it goes into. See every one of them here first.
        They are worked out from the coding rules as they are now. Nothing is written.
      </Typography>
    );
  } else if (data?.released) {
    body = (
      <Callout tone="info">
        <Box>
          Line {lineNo} is already released, on {new Date(data.released.releasedAt).toLocaleDateString()}.
          Its {plural(data.released.pieces, 'piece', 'pieces')} and their codes are in the tracker.
        </Box>
      </Callout>
    );
  } else if (data && ix) {
    const s = data.summary;
    const rules = s.nodes === 0 ? null
      : s.builtIn === s.nodes ? 'No coding rule applies, so every code is the built-in one.'
        : s.builtIn > 0 ? `${plural(s.builtIn, 'uses', 'use')} the built-in code, because no coding rule applies to ${s.builtIn === 1 ? 'it' : 'them'}.`
          : 'Every code comes from a coding rule.';
    body = (
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5 }}>
        {s.nodes === 0 ? (
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
            {data.problems.length
              ? 'Nothing can be laid out yet — see what stops release below.'
              : 'Release makes no pieces for this line: what it sells comes from stock.'}
          </Typography>
        ) : (
          <Box sx={{ fontSize: 13.5, color: 'var(--c-text)' }}>
            <strong>{plural(s.codes, 'code', 'codes')}.</strong>{' '}
            {plural(s.pieces, 'numbered piece', 'numbered pieces')} and {plural(s.groups, 'group', 'groups')} of identical parts, one code a group.{' '}
            <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{rules}</Box>
          </Box>
        )}

        {s.duplicates > 0 && (
          <Callout tone="danger">
            <Box>
              <strong>{plural(s.duplicates, 'code is', 'codes are')} given to more than one piece</strong> ({plural(s.duplicatePieces, 'piece', 'pieces')} in all).
              Release refuses until the coding rule tells them apart — add the piece number, or the piece it goes into.
            </Box>
            <CodeChips codes={data.duplicates} total={data.duplicates.length} onFind={find} />
          </Callout>
        )}
        {s.taken > 0 && (
          <Callout tone="danger">
            <Box>
              <strong>{plural(s.taken, 'code already belongs to a piece', 'codes already belong to pieces')} of another release.</strong>{' '}
              Release refuses. Add something to the rule that tells orders apart — the order number, or a running number.
            </Box>
            <CodeChips codes={data.taken} total={data.taken.length} onFind={find} />
          </Callout>
        )}
        {holes.map((h) => (
          <Callout key={`${h.scheme}:${h.needs}`} tone="danger">
            <Box>
              <strong>Coding rule {h.scheme} cannot number {plural(h.codes.length, 'piece', 'pieces')}</strong> — it needs {h.needs}, which {h.codes.length === 1 ? 'that piece has' : 'they have'} not got.
              {h.codes.length === 1 ? ' It shows' : ' They show'} the built-in code here. Release refuses until the rule has what it needs.
            </Box>
            <CodeChips codes={h.codes} total={h.codes.length} onFind={find} />
          </Callout>
        ))}
        {data.truncated && (
          <Callout tone="warning">
            <Box>The structure is over the size limit, so this list is incomplete.</Box>
          </Callout>
        )}
        {data.problems.length > 0 && (
          <Callout tone="warning">
            <Box>
              <strong>{plural(data.problems.length, 'thing still stops', 'things still stop')} release.</strong>{' '}
              The codes are what release would write once {data.problems.length === 1 ? 'it is' : 'they are'} fixed. A piece waiting on one may be missing below.
            </Box>
            <Box>
              <Button size="small" color="inherit" variant="outlined" onClick={() => setShowProblems((v) => !v)} aria-expanded={showProblems}>
                {showProblems ? 'Hide them' : 'Show them'}
              </Button>
            </Box>
            {showProblems && (
              <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.25, color: 'var(--c-text)', overflowWrap: 'anywhere' }}>
                {data.problems.slice(0, LISTED).map((p, i) => <li key={i}>{p}</li>)}
                {data.problems.length > LISTED && <li>and {count(data.problems.length - LISTED)} more.</li>}
              </Box>
            )}
          </Callout>
        )}

        {s.nodes > 0 && <PieceCodeTree key={load.round} data={data} ix={ix} query={query} onQueryChange={setQuery} />}
      </Box>
    );
  }

  return (
    <SectionCard title="Piece codes"
      subtitle={`The code each piece will carry once line ${lineNo} is released.`}
      actions={data && !data.released
        ? <Button startIcon={<ReplayRounded />} onClick={run} disabled={loading} sx={{ color: 'var(--c-text-2)' }}>{loading ? 'Working out…' : 'Work out again'}</Button>
        : !data ? <Button variant="outlined" startIcon={<TagRounded />} onClick={run} disabled={loading}>{loading ? 'Working out…' : 'Show the codes'}</Button>
          : undefined}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5 }}>
        {loading && data && <LinearProgress aria-label="Working out the codes again" sx={{ borderRadius: 2 }} />}
        {data && <Working active={loading}>{pieceTreeText(data.summary.nodes, 'codes')}</Working>}
        <ErrorNotice error={load.error} onRetry={run} sx={{ mb: 0 }} />
        {body}
      </Box>
    </SectionCard>
  );
}
