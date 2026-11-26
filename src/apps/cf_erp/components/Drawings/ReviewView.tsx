import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAuth } from '@core/contexts/AuthContext';
import { CfApiError } from '../../api/client';
import type { ReviewInfo, ReviewSource } from '../../api/drawings';
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
 * ('review-state') are kept in this browser, per person and per review.
 */

const IMG_PARALLEL = 4;
const asDataUrl = (b: Blob): Promise<string> => new Promise((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(String(r.result ?? '')); r.onerror = () => reject(r.error ?? new Error('Could not read the image.')); r.readAsDataURL(b);
});
/** JSON safe inside a <script> element. */
const inline = (v: unknown) => JSON.stringify(v ?? null).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function ReviewView({ source, info }: { source: ReviewSource; info: ReviewInfo }) {
  const { user } = useAuth();
  const [doc, setDoc] = useState<string | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const stateKey = useMemo(() => `cf_erp:review:${source.key}:${info.set ?? ''}:${user?.id ?? user?.email ?? ''}`, [source.key, info.set, user?.id, user?.email]);

  // The page with its data inlined (both read once, the data is the bigger part) and the reviewer's ticks so far.
  useEffect(() => {
    let live = true;
    setDoc(null); setError(null);
    Promise.all([source.text('index.html'), source.text('data.json')]).then(([page, data]) => {
      if (!live) return;
      let saved: unknown = null; try { saved = JSON.parse(localStorage.getItem(stateKey) ?? 'null'); } catch { saved = null; }
      const boot = `<script>window.REVIEW_EMBED = true; window.REVIEW_WHO = ${inline(user?.name ?? '')}; window.REVIEW_STATE = ${inline(saved)}; window.REVIEW = ${data.replace(/</g, '\\u003c')};</script>`;
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
        try { localStorage.setItem(stateKey, JSON.stringify(d.state)); } catch { /* storage full or off: the ticks last this visit */ }
      }
    };
    window.addEventListener('message', onMessage);
    return () => { live = false; window.removeEventListener('message', onMessage); };
  }, [source, stateKey, doc]);

  const s = info.summary;
  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }} data-testid="review-view">
      <Box sx={{ px: 1.5, py: 0.75, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'baseline', fontSize: 12.5, color: 'var(--c-text-2)', borderBottom: '1px solid var(--c-border)' }}>
        <Typography component="span" sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text-1)' }}>
          Review{s?.designs ? `: ${s.red ?? 0} must review · ${s.amber ?? 0} look · ${s.green ?? 0} checked` : ''}
        </Typography>
        <span>Every design against the customer’s sheet, whether every part the drawing names is there, and each doubt with how it was decided from the drawing. Your ticks stay in this browser.</span>
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
