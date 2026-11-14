import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { keyframes } from '@mui/system';
import * as THREE from 'three';
import { getLineModel3d, type Model3D } from '../../api/drawings';
import { getRowProgress, type RowProgress } from '../../api/rowProgress';
import { lookOf, legendOf, marksOf, rowOfElement, type LegendEntry, type Look } from '../../lib/progress3d';
import { GESTURES_3D } from '../../lib/model3d';
import type { PreparedModel } from '../../lib/model3dPrep';
import { prepared } from '../../lib/model3dPrepare';
import { cutPieces, edgeLines, HOLE_MIN_PX, holeMarkers, instancedMeshes, largestHole, pickTags, pieceBox, piecesBox, pixelsOf, type Placement } from '../../lib/model3dInstanced';
import { bindClicks, createOrbit, frameBox, highlightMaterial, VIEW_DIR } from '../../lib/orbit3d';

/**
 * THE 3D PROGRESS VIEW (user, 2026-11-01): a production order's or a sales order's lines in 3D — every line's model,
 * once per unit of its quantity — each piece coloured by the flow step its row is at (lib/progress3d.ts: a row gone
 * into its parent takes the parent's colour, so a sub-assembly at assembly level is one colour; uncut parts are
 * ghosts; a step being worked pulses). Lines with no 3D model are listed, not drawn. Refreshes every minute.
 * Gestures as the drawing viewer's 3D (lib/orbit3d.ts): Ctrl / Shift / middle / right drag pans, double-click a piece
 * to turn about it; a clicked piece is outlined in the highlight colour (its own small mesh — no rebuild).
 * Drawn as the drawing viewer's 3D is (2026-11-08): each distinct shape once, instanced per look; holes as markers.
 */

/** The legend's glowing swatch breathes like the pieces do. */
const glowKf = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
  50% { box-shadow: 0 0 7px 2px rgba(59, 130, 246, 0.8); }
`;

interface LineData { lineId: number; model: Model3D | null; progress: RowProgress | null; error?: string }

export function Progress3D({ orderId, lineIds, productionOrderId = null, height = 520 }: { orderId: number; lineIds: number[]; productionOrderId?: number | null; height?: number }) {
  const [lines, setLines] = useState<LineData[] | null>(null);
  const [tick, setTick] = useState(0);
  const key = lineIds.join(',');
  const ids = useMemo(() => key.split(',').filter(Boolean).map(Number), [key]);
  useEffect(() => {
    let live = true;
    (async () => {
      const out = await Promise.all(ids.map(async (lineId): Promise<LineData> => {
        const [m, p] = await Promise.allSettled([getLineModel3d(orderId, lineId), getRowProgress(orderId, lineId, productionOrderId)]);
        return { lineId, model: m.status === 'fulfilled' ? m.value.model : null, progress: p.status === 'fulfilled' ? p.value : null, error: p.status === 'rejected' ? String((p.reason as Error)?.message ?? p.reason) : undefined };
      }));
      if (live) setLines(out);
    })();
    const t = window.setInterval(() => setTick((x) => x + 1), 60_000);
    return () => { live = false; window.clearInterval(t); };
  }, [orderId, ids, productionOrderId, tick]);

  if (!lines) return <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', color: 'var(--c-text-2)', p: 2 }}><CircularProgress size={16} /> Loading the 3D progress…</Box>;
  const drawn = lines.filter((l) => l.model && l.progress);
  const missing = lines.filter((l) => !l.model);
  return (
    <Box data-testid="progress3d" sx={{ display: 'grid', gap: 1 }}>
      {missing.length > 0 && (
        <Alert severity="info" sx={{ py: 0 }}>
          {missing.length === lines.length ? 'No 3D model is kept for ' : 'No 3D model for '}
          {missing.length === 1 ? 'one line' : `${missing.length} lines`} of this order yet — a model comes with the line's standard drawing.
        </Alert>
      )}
      {drawn.length > 0 && <Scene lines={drawn} height={height} />}
    </Box>
  );
}

function Scene({ lines, height }: { lines: LineData[]; height: number }) {
  const host = useRef<HTMLDivElement | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const api = useRef<{ fit: () => void } | null>(null);
  // Each line's model made ready to draw (lib/model3dPrepare.ts: built once, off the page's thread, kept in the browser).
  const [preps, setPreps] = useState<{ lines: LineData[]; list: PreparedModel[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all(lines.map((l) => prepared(l.model as Model3D)))
      .then((list) => { if (live) setPreps({ lines, list }); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [lines]);
  const list = preps?.lines === lines ? preps.list : null;
  // Every element of every copy and its look — worked out once per data change. A copy is the line's pieces moved along y.
  const placed = useMemo(() => {
    const out: { line: number; el: number; pre: THREE.Matrix4; look: Look }[] = [];
    if (!list) return out;
    let yAt = 0;
    lines.forEach((l, li) => {
      const model = l.model as Model3D; const prog = l.progress as RowProgress; const prep = list[li];
      const byMark = marksOf(prog);
      const box = piecesBox(prep, model.elements.keys());
      const span = box.isEmpty() ? 10000 : box.max.y - box.min.y;
      for (let u = 0; u < prog.quantity; u++) {
        const shift = new THREE.Matrix4().makeTranslation(0, yAt - (box.isEmpty() ? 0 : box.min.y), 0);
        model.elements.forEach((e, i) => {
          if (prep.elGeom[i] < 0) return;
          const row = rowOfElement(e, byMark);
          const look = lookOf(prog, row, u);
          const words = `${prog.orderCode} line ${prog.lineId}${prog.quantity > 1 ? ` · unit ${u + 1}` : ''} · ${e.label ?? e.mark ?? ''} — ${look.words}`;
          out.push({ line: li, el: i, pre: shift, look: { ...look, words } });
        });
        yAt += span + Math.max(3000, span * 0.25);
      }
    });
    return out;
  }, [lines, list]);
  const legend = useMemo(() => {
    const looks = placed.map((p) => p.look);
    const seen = new Map<string, LegendEntry>();
    for (const l of lines) for (const x of legendOf(l.progress as RowProgress, looks)) {
      const k = `${x.colour}|${x.label}|${x.ghost ? 1 : 0}`;
      if (!seen.has(k)) seen.set(k, x);
    }
    return [...seen.values()];
  }, [placed, lines]);

  useEffect(() => {
    const el = host.current;
    if (!el || !list) return undefined;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const size = () => ({ w: Math.max(el.clientWidth, 10), h: Math.max(el.clientHeight, 10) });
    renderer.setSize(size().w, size().h);
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.setAttribute('data-testid', 'progress3d-canvas');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(getComputedStyle(el).getPropertyValue('--c-surface-2').trim() || '#f4f5f7');
    const camera = new THREE.PerspectiveCamera(40, size().w / size().h, 10, 2e6);
    camera.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(0.4, -1, 1.2); scene.add(sun);

    // One set of InstancedMeshes per line and look (colour × ghost × faint × pulse): each distinct shape drawn once per look.
    const buckets = new Map<string, { line: number; look: Look; items: Placement[] }>();
    const holeItems = new Map<number, Placement[]>();
    placed.forEach((p, i) => {
      const k = `${p.line}|${p.look.colour}|${p.look.ghost}|${p.look.faint}|${p.look.pulse}`;
      if (!buckets.has(k)) buckets.set(k, { line: p.line, look: p.look, items: [] });
      const it: Placement = { el: p.el, tag: i, pre: p.pre };
      buckets.get(k)?.items.push(it);
      if (!p.look.ghost && !p.look.faint) { const h = holeItems.get(p.line); if (h) h.push(it); else holeItems.set(p.line, [it]); }
    });
    const pulsing: THREE.MeshLambertMaterial[] = []; const meshes: THREE.InstancedMesh[] = [];
    const geos = list.map(() => new Map<number, THREE.BufferGeometry>());
    const all = new THREE.Box3();
    for (const { line, look, items } of buckets.values()) {
      const prep = list[line];
      const see = look.ghost ? 0.22 : look.faint ? 0.18 : 1;
      const mat = new THREE.MeshLambertMaterial({ color: look.colour, transparent: see < 1, opacity: see, depthWrite: see === 1, side: THREE.DoubleSide, emissive: new THREE.Color(look.colour), emissiveIntensity: 0 });
      for (const m of instancedMeshes(prep, items, mat, geos[line])) { scene.add(m); meshes.push(m); if (m.boundingBox) all.union(m.boundingBox); }
      if (look.pulse) pulsing.push(mat);
      const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(edgeLines(prep, items), 3));
      if (look.pulse) {
        // A bright edge as well, so a piece being worked stands out even inside the structure.
        scene.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })));
      } else if (look.ghost) {
        // The steel that is not there yet: dashed outline.
        const edges = new THREE.LineSegments(eg, new THREE.LineDashedMaterial({ color: 0x5b6878, dashSize: 60, gapSize: 50 }));
        edges.computeLineDistances(); scene.add(edges);
      } else if (!look.faint) scene.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x3b4754, transparent: true, opacity: 0.35 })));
      else eg.dispose();
    }
    // The holes of the steel that is there: small dark markers, drawn once they are big enough on screen to see.
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x2b3138 });
    const holes: THREE.InstancedMesh[] = []; let holeMm = 0;
    for (const [line, items] of holeItems) {
      const h = holeMarkers(list[line], items, holeMat);
      if (h) { scene.add(h); holes.push(h); }
      holeMm = Math.max(holeMm, largestHole(list[line], items));
    }

    const controls = createOrbit(camera, renderer.domElement);
    const fit = () => frameBox(camera, controls, all, { dir: VIEW_DIR, margin: 1.1 });
    fit(); api.current = { fit };

    // The picked piece: its own highlight mesh (holes cut), swapped on each pick.
    const sel = new THREE.Group(); scene.add(sel);
    const highlight = (i: number) => {
      for (const c of [...sel.children]) { const m = c as THREE.Mesh; m.geometry?.dispose?.(); (m.material as THREE.Material | undefined)?.dispose?.(); sel.remove(c); }
      const p = i >= 0 ? placed[i] : null;
      const cut = p ? cutPieces(list[p.line], lines[p.line].model as Model3D, [{ el: p.el, tag: i, pre: p.pre }]) : null;
      if (cut) { sel.add(new THREE.Mesh(cut.mesh, highlightMaterial())); sel.add(new THREE.LineSegments(cut.edges, new THREE.LineBasicMaterial({ color: 0x6b0f45 }))); }
    };
    const ray = new THREE.Raycaster();
    const pick = (ndc: THREE.Vector2) => {
      ray.setFromCamera(ndc, camera);
      return pickTags(ray, meshes)[0] ?? -1;
    };
    const unbind = bindClicks(renderer.domElement, {
      click: (ndc) => { const i = pick(ndc); highlight(i); setPicked(i >= 0 ? placed[i].look.words : null); },
      dblclick: (ndc) => {
        const i = pick(ndc);
        if (i < 0) { fit(); return; }
        frameBox(camera, controls, pieceBox(list[placed[i].line], placed[i].el, placed[i].pre), { margin: 2.2 });
      },
    });
    const ro = new ResizeObserver(() => { const s = size(); renderer.setSize(s.w, s.h); camera.aspect = s.w / s.h; camera.updateProjectionMatrix(); });
    ro.observe(el);
    let raf = 0; const t0 = performance.now();
    const loop = () => {
      // A piece being worked right now glows and breathes (about once a second); the rest are lit flat.
      const glow = 0.55 + 0.4 * Math.sin(((performance.now() - t0) / 1000) * Math.PI * 2);
      for (const m of pulsing) m.emissiveIntensity = glow;
      const holesSeen = pixelsOf(holeMm, camera.position.distanceTo(controls.target), camera, renderer.domElement.clientHeight || 500) >= HOLE_MIN_PX;
      for (const h of holes) h.visible = holesSeen;
      controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop);
    };
    loop();
    const readyAt = requestAnimationFrame(() => setReady(true));
    return () => {
      cancelAnimationFrame(raf); cancelAnimationFrame(readyAt); ro.disconnect(); controls.dispose(); unbind();
      scene.traverse((o) => { const m = o as THREE.Mesh; if (!m.userData?.keepGeometry) m.geometry?.dispose?.(); (m.material as THREE.Material | undefined)?.dispose?.(); });
      renderer.dispose(); renderer.domElement.remove(); api.current = null;
    };
  }, [placed, list, lines]);

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Box sx={{ position: 'relative', height, borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--c-border)' }}>
        <Box ref={host} sx={{ position: 'absolute', inset: 0, cursor: 'grab', '&:active': { cursor: 'grabbing' }, touchAction: 'none' }} />
        {failed ? <Box role="alert" sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-2)' }}>The 3D view could not be built.</Box> : (!ready || !list) && <Box role="status" sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, color: 'var(--c-text-2)' }}><CircularProgress size={18} /> Building the 3D view…</Box>}
        <Box sx={{ position: 'absolute', right: 10, top: 8 }}><Button size="small" variant="outlined" onClick={() => api.current?.fit()} sx={{ background: 'var(--c-surface)' }}>Fit</Button></Box>
        <Typography data-testid="progress3d-picked" sx={{ position: 'absolute', left: 10, bottom: 8, fontSize: 12.5, color: picked ? 'var(--c-text-1)' : 'var(--c-text-3)', background: 'var(--c-surface)', px: 1, borderRadius: 'var(--r-sm)', maxWidth: 'calc(100% - 20px)' }}>
          {picked ?? `${GESTURES_3D} · click a piece to see where it is`}
        </Typography>
      </Box>
      <Box data-testid="progress3d-legend" sx={{ display: 'grid', gap: 0.75, fontSize: 12.5, color: 'var(--c-text-2)' }}>
        {/* How to read a colour: glowing = being worked now, solid = the last operation done on it. */}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
            <Box sx={{ width: 14, height: 14, borderRadius: '3px', background: '#3b82f6', border: '1.5px solid #fff', animation: `${glowKf} 1.2s ease-in-out infinite` }} />
            <span><b>Glowing</b> — that operation is being worked on it now</span>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
            <Box sx={{ width: 14, height: 14, borderRadius: '3px', background: '#3b82f6', border: '1px solid rgba(0,0,0,0.15)' }} />
            <span><b>Solid</b> — nothing running; the last operation done on it</span>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          {legend.map((x) => (
            <Box key={`${x.colour}${x.label}${x.ghost ? 'g' : ''}`} sx={{ display: 'flex', gap: 0.6, alignItems: 'center' }}
              title={x.op ? `${x.working ? `${x.working} being worked now` : 'none being worked now'}${x.last ? ` · last done on ${x.last}` : ''}` : undefined}>
              <Box sx={{
                width: 14, height: 14, borderRadius: '3px', background: x.ghost ? 'transparent' : x.colour, border: x.ghost ? '1.5px dashed #5b6878' : '1px solid rgba(0,0,0,0.15)',
                ...(x.working ? { animation: `${glowKf} 1.2s ease-in-out infinite` } : {}),
              }} />
              {x.label}
              {x.op && x.working ? <Box component="span" sx={{ fontSize: 11, color: 'var(--c-info-700)', fontWeight: 600 }}>{x.working} now</Box> : null}
            </Box>
          ))}
        </Box>
        <Box sx={{ color: 'var(--c-text-3)', fontSize: 12 }}>A part gone into its assembly takes the assembly&rsquo;s colour.</Box>
      </Box>
    </Box>
  );
}

export default Progress3D;
