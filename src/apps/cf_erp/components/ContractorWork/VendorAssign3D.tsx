import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import * as THREE from 'three';
import { getLineModel3d, type Model3D } from '../../api/drawings';
import { getRowProgress, type RowProgress, type RowProgressRow } from '../../api/rowProgress';
import type { ContractorGrid } from '../../api/contractorWorkOrders';
import { marksOf, rowOfElement } from '../../lib/progress3d';
import { GESTURES_3D } from '../../lib/model3d';
import type { PreparedModel } from '../../lib/model3dPrep';
import { prepared } from '../../lib/model3dPrepare';
import { edgeLines, instancedMeshes, pickTags, pieceBox, piecesBox, sliceMatrix, type Placement } from '../../lib/model3dInstanced';
import { bindClicks, createOrbit, frameBox, VIEW_DIR } from '../../lib/orbit3d';

/**
 * WHO DOES WHAT, IN 3D (user, 2026-11-14: "there should be a 3D diagram that shows who is assigned on what. If two vendors
 * are assigned for the same structure, then both colors should take 50-50 space and so on"). A production order's lines,
 * each piece in the colour of the vendor(s) given work on it — on the piece's own row or on any assembly it goes into
 * (a girder's welding given out covers its plates). Two vendors split the piece in two bands along its length, three in
 * thirds. Work kept in-house is light grey; pieces outside this production order are faint. Click a piece: which vendor
 * does which operation on it.
 */

/** Distinct vendor colours (categorical — not the red→green of operations, so the two are never confused). */
const VENDOR_HUES = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#db2777', '#0891b2', '#ca8a04', '#4f46e5', '#65a30d', '#dc2626'];
const IN_HOUSE = '#d4d9e0';
const FAINT = '#eef1f4';

interface LineData { lineId: number; model: Model3D | null; progress: RowProgress | null }
interface Who { vendors: number[]; ops: Map<number, string[]> }

export function VendorAssign3D({ grid, height = 520 }: { grid: ContractorGrid; height?: number }) {
  const orderId = grid.productionOrder.order.id;
  const poId = grid.productionOrder.id;
  const lineIds = useMemo(() => [...new Set(grid.rows.map((r) => r.lineId))], [grid]);
  const [lines, setLines] = useState<LineData[] | null>(null);
  useEffect(() => {
    let live = true;
    setLines(null);
    Promise.all(lineIds.map(async (lineId): Promise<LineData> => {
      const [m, p] = await Promise.allSettled([getLineModel3d(orderId, lineId), getRowProgress(orderId, lineId, poId)]);
      return { lineId, model: m.status === 'fulfilled' ? m.value.model : null, progress: p.status === 'fulfilled' ? p.value : null };
    })).then((x) => { if (live) setLines(x); });
    return () => { live = false; };
  }, [orderId, poId, lineIds]);

  // Vendor colours by the order they appear in the grid's work orders; names for the legend.
  const vendors = useMemo(() => {
    const m = new Map<number, { id: number; name: string; colour: string }>();
    for (const w of grid.workOrders) if (w.lane !== 'cancelled' && !m.has(w.contractor.id)) m.set(w.contractor.id, { id: w.contractor.id, name: w.contractor.name, colour: VENDOR_HUES[m.size % VENDOR_HUES.length] });
    return m;
  }, [grid]);
  // Who has work on each row (item id): the vendors, and per vendor the operations given.
  const byItem = useMemo(() => {
    const opName = new Map(grid.operations.map((o) => [String(o.id), o.name]));
    const m = new Map<number, Who>();
    for (const r of grid.rows) {
      if (r.itemId == null) continue;
      for (const [opId, c] of Object.entries(r.cells)) {
        if (!c.workOrder || !vendors.has(c.workOrder.contractor.id)) continue;
        const w: Who = m.get(r.itemId) ?? { vendors: [], ops: new Map() };
        const v = c.workOrder.contractor.id;
        if (!w.vendors.includes(v)) w.vendors.push(v);
        const list = w.ops.get(v) ?? []; list.push(opName.get(opId) ?? opId); w.ops.set(v, list);
        m.set(r.itemId, w);
      }
    }
    return m;
  }, [grid, vendors]);

  if (!lines) return <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', color: 'var(--c-text-2)', p: 2 }}><CircularProgress size={16} /> Loading the 3D view…</Box>;
  const drawn = lines.filter((l) => l.model && l.progress);
  return (
    <Box data-testid="vendor3d" sx={{ display: 'grid', gap: 1 }}>
      {drawn.length < lines.length && <Alert severity="info" sx={{ py: 0 }}>{lines.length - drawn.length} line{lines.length - drawn.length === 1 ? ' has' : 's have'} no 3D model yet.</Alert>}
      {drawn.length > 0 && <Scene lines={drawn} byItem={byItem} vendors={vendors} height={height} />}
    </Box>
  );
}

function Scene({ lines, byItem, vendors, height }: { lines: LineData[]; byItem: Map<number, Who>; vendors: Map<number, { id: number; name: string; colour: string }>; height: number }) {
  const host = useRef<HTMLDivElement | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [list, setList] = useState<PreparedModel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const api = useRef<{ fit: () => void } | null>(null);
  useEffect(() => {
    let live = true;
    setList(null);
    Promise.all(lines.map((l) => prepared(l.model as Model3D))).then((x) => { if (live) setList(x); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [lines]);

  // Each piece: its vendors (own row and every row above it), one band per vendor.
  const placed = useMemo(() => {
    const out: { line: number; el: number; pre: THREE.Matrix4; post: THREE.Matrix4 | null; colour: string; faint: boolean; words: string }[] = [];
    if (!list) return out;
    let yAt = 0;
    lines.forEach((l, li) => {
      const model = l.model as Model3D; const prog = l.progress as RowProgress; const prep = list[li];
      const byMark = marksOf(prog);
      const rowBy = new Map(prog.rows.map((r) => [r.rowId, r]));
      const whoOf = (row: RowProgressRow | null): { vendors: number[]; ops: Map<number, string[]> } => {
        const vs: number[] = []; const ops = new Map<number, string[]>();
        for (let r = row, hops = 0; r && hops < 40; r = r.parentRowId != null ? rowBy.get(r.parentRowId) ?? null : null, hops++) {
          const w = byItem.get(r.rowId);
          if (!w) continue;
          for (const v of w.vendors) {
            if (!vs.includes(v)) vs.push(v);
            ops.set(v, [...(ops.get(v) ?? []), ...(w.ops.get(v) ?? []).map((o) => (r === row ? o : `${o} (${r.name})`))]);
          }
        }
        return { vendors: vs.sort((a, b) => a - b), ops };
      };
      const box = piecesBox(prep, model.elements.keys());
      const shift = new THREE.Matrix4().makeTranslation(0, yAt - (box.isEmpty() ? 0 : box.min.y), 0);
      model.elements.forEach((e, i) => {
        if (prep.elGeom[i] < 0) return;
        const row = rowOfElement(e, byMark);
        const faint = !!row && row.units.every((u) => !u.inOrder);
        const who = whoOf(row);
        const name = `${e.label ?? e.mark ?? ''}${row ? ` · ${row.name}` : ''}`;
        if (!who.vendors.length) { out.push({ line: li, el: i, pre: shift, post: null, colour: faint ? FAINT : IN_HOUSE, faint, words: `${name} — in-house` }); return; }
        const words = `${name} — ${who.vendors.map((v) => `${vendors.get(v)?.name ?? v}: ${[...new Set(who.ops.get(v) ?? [])].join(', ')}`).join(' · ')}`;
        who.vendors.forEach((v, k) => out.push({ line: li, el: i, pre: shift, post: sliceMatrix(prep, i, k, who.vendors.length), colour: faint ? FAINT : vendors.get(v)?.colour ?? IN_HOUSE, faint, words }));
      });
      yAt += (box.isEmpty() ? 10000 : box.max.y - box.min.y) * 1.25 + 3000;
    });
    return out;
  }, [lines, list, byItem, vendors]);

  useEffect(() => {
    const el = host.current;
    if (!el || !list) return undefined;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const size = () => ({ w: Math.max(el.clientWidth, 10), h: Math.max(el.clientHeight, 10) });
    renderer.setSize(size().w, size().h);
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.setAttribute('data-testid', 'vendor3d-canvas');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(getComputedStyle(el).getPropertyValue('--c-surface-2').trim() || '#f4f5f7');
    const camera = new THREE.PerspectiveCamera(40, size().w / size().h, 10, 2e6);
    camera.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(0.4, -1, 1.2); scene.add(sun);
    const buckets = new Map<string, { line: number; colour: string; faint: boolean; items: Placement[] }>();
    placed.forEach((p, i) => {
      const k = `${p.line}|${p.colour}|${p.faint}`;
      if (!buckets.has(k)) buckets.set(k, { line: p.line, colour: p.colour, faint: p.faint, items: [] });
      buckets.get(k)?.items.push({ el: p.el, tag: i, pre: p.pre, post: p.post });
    });
    const meshes: THREE.InstancedMesh[] = []; const geos = list.map(() => new Map<number, THREE.BufferGeometry>());
    const all = new THREE.Box3();
    for (const { line, colour, faint, items } of buckets.values()) {
      const mat = new THREE.MeshLambertMaterial({ color: colour, transparent: faint, opacity: faint ? 0.25 : 1, depthWrite: !faint, side: THREE.DoubleSide });
      for (const m of instancedMeshes(list[line], items, mat, geos[line])) { scene.add(m); meshes.push(m); if (m.boundingBox) all.union(m.boundingBox); }
      if (!faint) {
        const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(edgeLines(list[line], items), 3));
        scene.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x3b4754, transparent: true, opacity: 0.3 })));
      }
    }
    const controls = createOrbit(camera, renderer.domElement);
    const fit = () => frameBox(camera, controls, all, { dir: VIEW_DIR, margin: 1.1 });
    fit(); api.current = { fit };
    const ray = new THREE.Raycaster();
    const pick = (ndc: THREE.Vector2) => { ray.setFromCamera(ndc, camera); return pickTags(ray, meshes)[0] ?? -1; };
    const unbind = bindClicks(renderer.domElement, {
      click: (ndc) => { const i = pick(ndc); setPicked(i >= 0 ? placed[i].words : null); },
      dblclick: (ndc) => {
        const i = pick(ndc);
        if (i < 0) { fit(); return; }
        frameBox(camera, controls, pieceBox(list[placed[i].line], placed[i].el, placed[i].pre), { margin: 2.2 });
      },
    });
    const ro = new ResizeObserver(() => { const s = size(); renderer.setSize(s.w, s.h); camera.aspect = s.w / s.h; camera.updateProjectionMatrix(); });
    ro.observe(el);
    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); unbind();
      scene.traverse((o) => { const m = o as THREE.Mesh; if (!m.userData?.keepGeometry) m.geometry?.dispose?.(); (m.material as THREE.Material | undefined)?.dispose?.(); });
      renderer.dispose(); renderer.domElement.remove(); api.current = null;
    };
  }, [placed, list]);

  const used = useMemo(() => [...vendors.values()].filter((v) => placed.some((p) => p.colour === v.colour)), [vendors, placed]);
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Box sx={{ position: 'relative', height, borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--c-border)' }}>
        <Box ref={host} sx={{ position: 'absolute', inset: 0, cursor: 'grab', '&:active': { cursor: 'grabbing' }, touchAction: 'none' }} />
        {failed ? <Box role="alert" sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-2)' }}>The 3D view could not be built.</Box>
          : !list && <Box role="status" sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, color: 'var(--c-text-2)' }}><CircularProgress size={18} /> Building the 3D view…</Box>}
        <Box sx={{ position: 'absolute', right: 10, top: 8 }}><Button size="small" variant="outlined" onClick={() => api.current?.fit()} sx={{ background: 'var(--c-surface)' }}>Fit</Button></Box>
        <Typography data-testid="vendor3d-picked" sx={{ position: 'absolute', left: 10, bottom: 8, fontSize: 12.5, color: picked ? 'var(--c-text-1)' : 'var(--c-text-3)', background: 'var(--c-surface)', px: 1, borderRadius: 'var(--r-sm)', maxWidth: 'calc(100% - 20px)' }}>
          {picked ?? `${GESTURES_3D} · click a piece to see who does what on it`}
        </Typography>
      </Box>
      <Box data-testid="vendor3d-legend" sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5, color: 'var(--c-text-2)' }}>
        {used.map((v) => (
          <Box key={v.id} sx={{ display: 'flex', gap: 0.6, alignItems: 'center' }}>
            <Box sx={{ width: 14, height: 14, borderRadius: '3px', background: v.colour }} />{v.name}
          </Box>
        ))}
        <Box sx={{ display: 'flex', gap: 0.6, alignItems: 'center' }}><Box sx={{ width: 14, height: 14, borderRadius: '3px', background: IN_HOUSE, border: '1px solid rgba(0,0,0,0.12)' }} />In-house</Box>
        <Box sx={{ display: 'flex', gap: 0.6, alignItems: 'center' }}>
          <Box sx={{ width: 22, height: 14, borderRadius: '3px', background: `linear-gradient(90deg, ${VENDOR_HUES[0]} 50%, ${VENDOR_HUES[1]} 50%)` }} />Two vendors on one piece: half each
        </Box>
      </Box>
    </Box>
  );
}
