import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import * as THREE from 'three';
import { getLineModel3d, type Model3D } from '../../api/drawings';
import { getRowProgress, type RowProgress } from '../../api/rowProgress';
import { lookOf, legendOf, marksOf, rowOfElement, type Look } from '../../lib/progress3d';
import { elementGeometries, merge } from '../../lib/model3dGeometry';
import { GESTURES_3D, ownerAt } from '../../lib/model3d';
import { bindClicks, createOrbit, frameBox, highlightMaterial, VIEW_DIR } from '../../lib/orbit3d';

/**
 * THE 3D PROGRESS VIEW (user, 2026-11-01): a production order's or a sales order's lines in 3D — every line's model,
 * once per unit of its quantity — each piece coloured by the flow step its row is at (lib/progress3d.ts: a row gone
 * into its parent takes the parent's colour, so a sub-assembly at assembly level is one colour; uncut parts are
 * ghosts; a step being worked pulses). Lines with no 3D model are listed, not drawn. Refreshes every minute.
 * Gestures as the drawing viewer's 3D (lib/orbit3d.ts): Ctrl / Shift / middle / right drag pans, double-click a piece
 * to turn about it; a clicked piece is outlined in the highlight colour (its own small mesh — no rebuild).
 */

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
  // Every element of every copy and its look — worked out once per data change.
  const placed = useMemo(() => {
    const out: { geos: THREE.BufferGeometry[]; look: Look }[] = [];
    let yAt = 0;
    for (const l of lines) {
      const model = l.model as Model3D; const prog = l.progress as RowProgress;
      const byMark = marksOf(prog);
      const geosOf = model.elements.map((e) => elementGeometries(e).map((g) => (g.index ? g.toNonIndexed() : g)));
      const box = new THREE.Box3(); for (const gs of geosOf) for (const g of gs) box.union(new THREE.Box3().setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute));
      const span = box.isEmpty() ? 10000 : box.max.y - box.min.y;
      for (let u = 0; u < prog.quantity; u++) {
        const shift = new THREE.Matrix4().makeTranslation(0, yAt - (box.isEmpty() ? 0 : box.min.y), 0);
        model.elements.forEach((e, i) => {
          const row = rowOfElement(e, byMark);
          const look = lookOf(prog, row, u);
          const words = `${prog.orderCode} line ${prog.lineId}${prog.quantity > 1 ? ` · unit ${u + 1}` : ''} · ${e.label ?? e.mark ?? ''} — ${look.words}`;
          out.push({ geos: geosOf[i].map((g) => g.clone().applyMatrix4(shift)), look: { ...look, words } });
        });
        yAt += span + Math.max(3000, span * 0.25);
      }
    }
    return out;
  }, [lines]);
  const legend = useMemo(() => {
    const looks = placed.map((p) => p.look);
    const seen = new Map<string, { colour: string; label: string; ghost?: boolean }>();
    for (const l of lines) for (const x of legendOf(l.progress as RowProgress, looks)) seen.set(`${x.colour}|${x.label}|${x.ghost ? 1 : 0}`, x);
    return [...seen.values()];
  }, [placed, lines]);

  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
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

    // One mesh per look (colour × ghost × faint × pulse): few draw calls whatever the size.
    const buckets = new Map<string, { look: Look; geos: THREE.BufferGeometry[] }>();
    const owner: { start: number; count: number }[] = []; const pickList: THREE.BufferGeometry[] = [];
    let at = 0;
    for (const p of placed) {
      const k = `${p.look.colour}|${p.look.ghost}|${p.look.faint}|${p.look.pulse}`;
      if (!buckets.has(k)) buckets.set(k, { look: p.look, geos: [] });
      buckets.get(k)?.geos.push(...p.geos);
      const n = p.geos.reduce((s, g) => s + g.attributes.position.count, 0);
      owner.push({ start: at, count: n }); pickList.push(...p.geos); at += n;
    }
    const pulsing: THREE.MeshLambertMaterial[] = [];
    const all = new THREE.Box3();
    for (const { look, geos } of buckets.values()) {
      const g = merge(geos); if (!g) continue;
      all.union(new THREE.Box3().setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute));
      const see = look.ghost ? 0.22 : look.faint ? 0.18 : 1;
      const mat = new THREE.MeshLambertMaterial({ color: look.colour, transparent: see < 1, opacity: see, depthWrite: see === 1, side: THREE.DoubleSide, emissive: new THREE.Color(look.colour), emissiveIntensity: 0 });
      scene.add(new THREE.Mesh(g, mat));
      if (look.pulse) pulsing.push(mat);
      if (look.ghost) {
        // The steel that is not there yet: dashed outline.
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineDashedMaterial({ color: 0x5b6878, dashSize: 60, gapSize: 50 }));
        edges.computeLineDistances(); scene.add(edges);
      } else if (!look.faint) scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: 0x3b4754, transparent: true, opacity: 0.35 })));
    }
    const pickGeo = merge(pickList);
    const pickMesh = pickGeo ? new THREE.Mesh(pickGeo, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })) : null;
    if (pickMesh) scene.add(pickMesh);

    const controls = createOrbit(camera, renderer.domElement);
    const fit = () => frameBox(camera, controls, all, { dir: VIEW_DIR, margin: 1.1 });
    fit(); api.current = { fit };

    // The picked piece: its own highlight mesh, swapped on each pick.
    const sel = new THREE.Group(); scene.add(sel);
    const highlight = (i: number) => {
      for (const c of [...sel.children]) { const m = c as THREE.Mesh; m.geometry?.dispose?.(); (m.material as THREE.Material | undefined)?.dispose?.(); sel.remove(c); }
      const g = i >= 0 ? merge(placed[i].geos.map((x) => x.clone())) : null;
      if (g) { sel.add(new THREE.Mesh(g, highlightMaterial())); sel.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: 0x6b0f45 }))); }
    };
    const ray = new THREE.Raycaster();
    const pick = (ndc: THREE.Vector2) => {
      if (!pickMesh) return -1;
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(pickMesh, false)[0];
      return hit && hit.faceIndex != null ? ownerAt(owner, hit.faceIndex * 3) : -1;
    };
    const unbind = bindClicks(renderer.domElement, {
      click: (ndc) => { const i = pick(ndc); highlight(i); setPicked(i >= 0 ? placed[i].look.words : null); },
      dblclick: (ndc) => {
        const i = pick(ndc);
        if (i < 0) { fit(); return; }
        const bb = new THREE.Box3(); for (const g of placed[i].geos) bb.union(new THREE.Box3().setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute));
        frameBox(camera, controls, bb, { margin: 2.2 });
      },
    });
    const ro = new ResizeObserver(() => { const s = size(); renderer.setSize(s.w, s.h); camera.aspect = s.w / s.h; camera.updateProjectionMatrix(); });
    ro.observe(el);
    let raf = 0; const t0 = performance.now();
    const loop = () => {
      // A step being worked right now breathes (a soft glow, about once a second).
      const glow = 0.25 + 0.25 * Math.sin(((performance.now() - t0) / 1000) * Math.PI * 2);
      for (const m of pulsing) m.emissiveIntensity = glow;
      controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop);
    };
    loop();
    const readyAt = requestAnimationFrame(() => setReady(true));
    return () => {
      cancelAnimationFrame(raf); cancelAnimationFrame(readyAt); ro.disconnect(); controls.dispose(); unbind();
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); (m.material as THREE.Material | undefined)?.dispose?.(); });
      renderer.dispose(); renderer.domElement.remove(); api.current = null;
    };
  }, [placed]);

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Box sx={{ position: 'relative', height, borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--c-border)' }}>
        <Box ref={host} sx={{ position: 'absolute', inset: 0, cursor: 'grab', '&:active': { cursor: 'grabbing' }, touchAction: 'none' }} />
        {!ready && <Box role="status" sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, color: 'var(--c-text-2)' }}><CircularProgress size={18} /> Building the 3D view…</Box>}
        <Box sx={{ position: 'absolute', right: 10, top: 8 }}><Button size="small" variant="outlined" onClick={() => api.current?.fit()} sx={{ background: 'var(--c-surface)' }}>Fit</Button></Box>
        <Typography data-testid="progress3d-picked" sx={{ position: 'absolute', left: 10, bottom: 8, fontSize: 12.5, color: picked ? 'var(--c-text-1)' : 'var(--c-text-3)', background: 'var(--c-surface)', px: 1, borderRadius: 'var(--r-sm)', maxWidth: 'calc(100% - 20px)' }}>
          {picked ?? `${GESTURES_3D} · click a piece to see where it is`}
        </Typography>
      </Box>
      <Box data-testid="progress3d-legend" sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5, color: 'var(--c-text-2)' }}>
        {legend.map((x) => (
          <Box key={`${x.colour}${x.label}`} sx={{ display: 'flex', gap: 0.6, alignItems: 'center' }}>
            <Box sx={{ width: 14, height: 14, borderRadius: '3px', background: x.ghost ? 'transparent' : x.colour, border: x.ghost ? '1.5px dashed #5b6878' : '1px solid rgba(0,0,0,0.15)' }} />
            {x.label}
          </Box>
        ))}
        <Box sx={{ color: 'var(--c-text-3)' }}>A part gone into its assembly takes the assembly&rsquo;s colour · a glowing piece is being worked now</Box>
      </Box>
    </Box>
  );
}

export default Progress3D;
