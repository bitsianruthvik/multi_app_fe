import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAuth } from '@core/contexts/AuthContext';
import { CfApiError } from '../../api/client';
import type { ReviewInfo, ReviewMark, ReviewSource } from '../../api/drawings';
import { ErrorNotice } from '../ui';

/**
 * THE DRAWING REVIEW OF A STRUCTURE, in the drawing tool beside 2D, 3D and Physics (user, 2026-11-26: "we should be able to see
 * the part by part comparison and all of those screens we build in the image viewer"). The page is drawing_bom's review
 * (src/review: every design in red / amber / green with the sheet snippet beside it, "Is every part there?", the doubts and
 * how each was decided, the summary), kept with the standard by review-attach.mjs.
 *
 * It runs in a sandboxed frame — scripts only, never this app's origin, so it cannot read the login — with its data inlined.
 * It has no address of its own, so the images (crops of the customer's sheets) come through this component: the page asks
 * for each as it nears the screen ('review-img'), this fetches it with the login and hands it back. The reviewer's ticks
 * ('review-state') are kept ON THE SERVER per standard and person, by part mark (user, 2026-11-28: "Keep saving the reviews I
 * have written so far, so that if I open it again I can see them") — saved a second after each change and when the review is
 * closed — and in this browser as well, for when the server cannot be reached. A browser's earlier ticks that the server does
 * not have yet are sent to it on the first open.
 *
 * The page is also told each part's codes on the order line (REVIEW_CODES: normalised mark → codes, shown beside the part) and
 * the part the person was looking at (REVIEW_START: the review opens on it).
 */

const IMG_PARALLEL = 4;
const asDataUrl = (b: Blob): Promise<string> => new Promise((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(String(r.result ?? '')); r.onerror = () => reject(r.error ?? new Error('Could not read the image.')); r.readAsDataURL(b);
});
/** JSON safe inside a <script> element. */
const SAVE_AFTER_MS = 1000;
type PageState = { parts?: Record<string, ReviewMark>; questions?: Record<string, unknown>; who?: string };
/** What is saved of a part: its decision and comment (the page's own 'at' is not compared). */
const sig = (p: ReviewMark | undefined) => `${p?.d ?? ''}|${p?.c ?? ''}`;
const asParts = (v: unknown): Record<string, ReviewMark> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, ReviewMark> : {});
const inline = (v: unknown) => JSON.stringify(v ?? null).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** start = the mark of the part the person was looking at (the review opens on it); null = the review's own order. */
export function ReviewView({ source, info, start = null }: { source: ReviewSource; info: ReviewInfo; start?: string | null }) {
  const { user } = useAuth();
  const [doc, setDoc] = useState<string | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const stateKey = useMemo(() => `cf_erp:review:${source.key}:${info.set ?? ''}:${user?.id ?? user?.email ?? ''}`, [source.key, info.set, user?.id, user?.email]);
  // What the server holds of each mark (its signature), and the marks changed since, waiting for the next save.
  const sent = useRef<Map<string, string>>(new Map());
  const pending = useRef<Record<string, ReviewMark>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveNote, setSaveNote] = useState<'saved' | 'saving' | 'offline' | null>(null);
  const flush = useRef<() => void>(() => {});
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
    flush.current = () => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      const parts = pending.current; if (!Object.keys(parts).length) return;
      pending.current = {};
      setSaveNote('saving');
      source.saveMarks(parts).then(() => {
        for (const [m, p] of Object.entries(parts)) sent.current.set(m, sig(p));
        setSaveNote('saved');
      }).catch(() => {
        // Kept for the next try (newer edits of the same mark win); the browser copy has them meanwhile.
        pending.current = { ...parts, ...pending.current };
        setSaveNote('offline');
      });
    };
  });

  // The page with its data inlined (both read once, the data is the bigger part) and the reviewer's ticks so far.
  useEffect(() => {
    let live = true;
    setDoc(null); setError(null);
    Promise.all([
      source.text('index.html'), source.text('data.json'),
      source.marks().catch(() => null),
      source.codes ? source.codes().catch(() => null) : Promise.resolve(null),
    ]).then(([page, data, server, codes]) => {
      if (!live) return;
      let local: PageState | null = null; try { local = JSON.parse(localStorage.getItem(stateKey) ?? 'null') as PageState | null; } catch { local = null; }
      // The server's decisions first; a mark this browser has that the server does not is taken and sent to it (the
      // ticks of the days before they were kept on the server). Without the server, the browser's copy.
      const serverParts = asParts(server?.parts);
      const parts: Record<string, ReviewMark> = { ...serverParts };
      const migrate: Record<string, ReviewMark> = {};
      for (const [m, p] of Object.entries(asParts(local?.parts))) {
        if (!(p?.d || p?.c) || serverParts[m]) continue;
        parts[m] = p; if (server) migrate[m] = { d: p.d ?? null, c: p.c ?? '' };
      }
      sent.current = new Map(Object.entries(serverParts).map(([m, p]) => [m, sig(p)]));
      pending.current = {};
      if (Object.keys(migrate).length) { pending.current = migrate; flush.current(); }
      setSaveNote(server ? null : 'offline');
      const state: PageState = { parts, questions: local?.questions ?? {}, ...(local?.who ? { who: local.who } : {}) };
      const boot = `<script>window.REVIEW_EMBED = true; window.REVIEW_WHO = ${inline(user?.name ?? '')}; window.REVIEW_STATE = ${inline(state)}; window.REVIEW_CODES = ${inline(codes ?? {})}; window.REVIEW_START = ${inline(startRef.current ?? null)}; window.REVIEW = ${data.replace(/</g, '\\u003c')};</script>`;
      const at = page.indexOf('<script src="data.js"></script>');
      setDoc(at >= 0 ? page.slice(0, at) + boot + page.slice(at + '<script src="data.js"></script>'.length) : page.replace('</head>', `${boot}</head>`));
    }).catch((e) => { if (live) setError(e instanceof CfApiError ? e : new CfApiError(0, e instanceof Error ? e.message : String(e))); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.key, info.fileId, attempt]);

  // The frame's asks: an image (fetched a few at a time, each once) or the ticks to keep.
  useEffect(() => {
    const queue: string[] = []; const done = new Map<string, string>(); let running = 0; let live = true;
    const send = (path: string, url: string) => frame.current?.contentWindow?.postMessage({ type: 'review-img', path, url }, '*');
    const pump = () => {
      while (live && running < IMG_PARALLEL && queue.length) {
        const path = queue.shift()!; running++;
        source.image(path).then(asDataUrl).then((url) => { done.set(path, url); if (live) send(path, url); })
          .catch(() => { /* an image that cannot be read stays empty; the page still works */ })
          .finally(() => { running--; pump(); });
      }
    };
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const d = e.data as { type?: string; path?: unknown; state?: unknown };
      if (d?.type === 'review-img' && typeof d.path === 'string' && /^img\/[A-Za-z0-9._-]{1,200}$/.test(d.path)) {
        const have = done.get(d.path); if (have) send(d.path, have); else if (!queue.includes(d.path)) { queue.push(d.path); pump(); }
      } else if (d?.type === 'review-state' && d.state && typeof d.state === 'object') {
        try { localStorage.setItem(stateKey, JSON.stringify(d.state)); } catch { /* storage full or off: the server keeps them */ }
        // The marks that differ from what the server holds go in the next save, a second after the last change.
        for (const [m, p] of Object.entries(asParts((d.state as PageState).parts))) {
          if (!m || m.length > 150) continue;
          const one: ReviewMark = { d: p?.d ?? null, c: typeof p?.c === 'string' ? p.c.slice(0, 4000) : '' };
          if (sig(one) !== (sent.current.get(m) ?? '|')) pending.current[m] = one; else delete pending.current[m];
        }
        if (timer.current) clearTimeout(timer.current);
        if (Object.keys(pending.current).length) timer.current = setTimeout(() => flush.current(), SAVE_AFTER_MS);
      }
    };
    window.addEventListener('message', onMessage);
    return () => { live = false; window.removeEventListener('message', onMessage); };
  }, [source, stateKey, doc]);

  // Leaving the review (or the page) saves what is still waiting.
  useEffect(() => {
    const now = () => flush.current();
    window.addEventListener('pagehide', now);
    return () => { window.removeEventListener('pagehide', now); now(); };
  }, [source.key]);

  // A part picked while the review is open: the page opens it.
  useEffect(() => {
    if (start) frame.current?.contentWindow?.postMessage({ type: 'review-goto', mark: start }, '*');
  }, [start]);

  const s = info.summary;
  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }} data-testid="review-view">
      <Box sx={{ px: 1.5, py: 0.75, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'baseline', fontSize: 12.5, color: 'var(--c-text-2)', borderBottom: '1px solid var(--c-border)' }}>
        <Typography component="span" sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text-1)' }}>
          Review{s?.designs ? `: ${s.red ?? 0} must review · ${s.amber ?? 0} look · ${s.green ?? 0} checked` : ''}
        </Typography>
        <span>Every design against the customer’s sheet, whether every part the drawing names is there, and each doubt with how it was decided from the drawing. Your decisions and comments are saved for you as you go.</span>
        {saveNote === 'saving' && <span data-testid="review-saving">Saving…</span>}
        {saveNote === 'saved' && <span data-testid="review-saved">Saved.</span>}
        {saveNote === 'offline' && <Typography component="span" data-testid="review-offline" sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-warning-700, #a15c00)' }}>Not saved to the server yet: kept in this browser, and sent with your next change.</Typography>}
        {info.built && <span>Built {info.built}{info.set ? ` from ${info.set}` : ''}.</span>}
        {info.stale && <Typography component="span" data-testid="review-stale" sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-warning-700, #a15c00)' }}>Out of date: the structure’s model has changed since this review was made.</Typography>}
      </Box>
      {error && <Box sx={{ p: 2 }}><ErrorNotice error={error} onRetry={() => setAttempt((n) => n + 1)} sx={{ mb: 0 }} /></Box>}
      {!error && doc == null && (
        <Box role="status" sx={{ m: 'auto', display: 'flex', alignItems: 'center', gap: 1, color: 'var(--c-text-2)' }}><CircularProgress size={18} /> Loading the review…</Box>
      )}
      {!error && doc != null && (
        <Box component="iframe" ref={frame} title="Drawing review" srcDoc={doc} sandbox="allow-scripts allow-downloads" data-testid="review-frame"
          sx={{ flex: 1, minHeight: 0, width: '100%', border: 0, background: '#fff' }} />
      )}
    </Box>
  );
}

export default ReviewView;
