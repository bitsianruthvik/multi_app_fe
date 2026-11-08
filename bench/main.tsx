/* eslint-disable react-refresh/only-export-components -- a bench page, not part of the app */
/*
 * A local bench for the drawing viewer's 3D view (not part of the app build): opens a model.json with the 3D view and
 * measures time to first render, the longest main-thread block while building, and the frame rate after.
 *   npx vite --port 5191   then   /bench/model3d.html?m=rdso&v=new[&mark=TRUSS][&scope=level]
 * Put the models at bench/data/<m>.json (drawing_bom/out/<SET>/model.json; not committed).
 */
import { lazy, StrictMode, Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expandModel, type ModelFile } from '../src/apps/cf_erp/lib/modelDrawing';
import type { Model3D } from '../src/apps/cf_erp/api/drawings';
import { selectionOf, type Scope3D } from '../src/apps/cf_erp/lib/model3d';

const q = new URLSearchParams(location.search);
const which = q.get('v') ?? 'new';
// v=old: the view as it was, copied to bench/OldModel3DView.tsx (not committed) to compare.
const olds = import.meta.glob('./OldModel3DView.tsx') as Record<string, () => Promise<{ default: typeof import('../src/apps/cf_erp/components/Drawings/Model3DView').default }>>;
const View = which === 'old' && olds['./OldModel3DView.tsx'] ? lazy(olds['./OldModel3DView.tsx']) : lazy(() => import('../src/apps/cf_erp/components/Drawings/Model3DView'));

type W = Window & { __bench?: Record<string, unknown> };
const w = window as W;
const out: Record<string, unknown> = { v: which, m: q.get('m') ?? 'rdso' };
w.__bench = out;
let maxBlock = 0;
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) maxBlock = Math.max(maxBlock, e.duration); }).observe({ type: 'longtask', buffered: true }); } catch { /* no longtask API */ }

function Bench({ model }: { model: Model3D }) {
  const [scope, setScope] = useState<Scope3D>((q.get('scope') as Scope3D) ?? 'whole');
  const [sel, setSel] = useState<number[]>([]);
  const mark = q.get('mark');
  return (
    <>
      <div id="report" style={{ padding: 6, fontFamily: 'monospace' }} data-testid="bench-report">measuring…</div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <View model={model} part={null} marks={mark ? [mark] : []} scope={scope} onScope={setScope} selected={sel}
          onPick={(i) => { out.picked = i; setSel(i == null ? [] : selectionOf(model, i, q.get('all') === '1')); }} />
      </div>
    </>
  );
}

(async () => {
  const raw = await (await fetch(`./data/${out.m}.json`)).json() as ModelFile;
  const model = expandModel(raw) as unknown as Model3D;
  out.pieces = model.elements.length;
  const t0 = performance.now();
  createRoot(document.getElementById('root')!).render(q.get("strict") === "1" ? <StrictMode><Suspense fallback={null}><Bench model={model} /></Suspense></StrictMode> : <Suspense fallback={null}><Bench model={model} /></Suspense>);
  const report = () => { const r = document.getElementById('report'); if (r) r.textContent = JSON.stringify(out); };
  // First render: the canvas is up and "Building the 3D view…" is gone.
  await new Promise<void>((res) => {
    const look = () => {
      const host = document.querySelector('[data-testid="model3d"]');
      if (host && host.querySelector('canvas') && !host.querySelector('[role="status"]')) { res(); return; }
      requestAnimationFrame(look);
    };
    look();
  });
  out.firstRenderMs = Math.round(performance.now() - t0);
  out.longestBlockMs = Math.round(maxBlock);
  report();
  // Frame rate over 5 s after a 1 s settle (the view renders every frame).
  await new Promise((r) => setTimeout(r, 1000));
  let frames = 0; let worst = 0; let last = performance.now(); const start = last;
  await new Promise<void>((res) => {
    const f = () => { const now = performance.now(); worst = Math.max(worst, now - last); last = now; frames++; if (now - start < 5000) requestAnimationFrame(f); else res(); };
    requestAnimationFrame(f);
  });
  out.fps = Math.round((frames * 1000) / (performance.now() - start));
  out.worstFrameMs = Math.round(worst);
  out.done = true;
  report();
})();
