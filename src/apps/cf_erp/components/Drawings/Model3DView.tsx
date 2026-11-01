import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, CircularProgress, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import * as THREE from 'three';
import type { Model3D } from '../../api/drawings';
import { GESTURES_3D, isLit, litMark, normMark, ownerAt, scopeChoices, shownIn, sizeWords, type Part3D, type Scope3D } from '../../lib/model3d';
import { elementGeometries, label, merge } from '../../lib/model3dGeometry';
import { bindClicks, createOrbit, frameBox, highlightMaterial, VIEW_DIR } from '../../lib/orbit3d';

/**
 * THE 3D VIEW (user, 2026-10-31: "a 3D version in the tool to show the diagram in 3D"; then: labels, dimensions,
 * "Only this level", and parts in 3D; 2026-11-01: pan with Ctrl + drag, select a part → its details in the side
 * panel, "just this part / this part in the entire view").
 *
 * What it shows is ONE toggle group (lib/model3d.ts `scopeChoices`), held by the drawing viewer so its side panel can
 * drive it too:
 *   Just this part   the selected piece(s) alone, framed — or, with nothing selected, a plate part's own DXF outline
 *                    (and every hole) extruded to its thickness
 *   Just this level  the open level (lit by drawing mark) alone
 *   Whole structure  the line's model (`cf-erp-model3d/1`, services/model3dService.js); the selection — else the open
 *                    level — stands out, the rest is faint
 * Selecting does not rebuild the scene: the selection is its own small highlight mesh, and the big merged meshes only
 * swap material or visibility (60 fps on the ~2,300-piece RDSO models). Gestures: lib/orbit3d.ts.
 */

const LIT = 0xd9822b;
const STEEL = 0x8a99ab;
const FAINT = 0xb9c2cc;
const DIM = 0x1f6feb;

/** A plate part: its outline ring and every inner ring as a hole, extruded to its thickness (x, y in the plate, z through it). */
function partGeometry(p: Part3D): THREE.BufferGeometry | null {
  const [outer, ...inner] = p.rings;
  if (!outer || outer.length < 3) return null;
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const r of inner) if (r.length >= 3) shape.holes.push(new THREE.Path(r.map(([x, y]) => new THREE.Vector2(x, y))));
  return new THREE.ExtrudeGeometry(shape, { depth: p.thicknessMm, bevelEnabled: false, curveSegments: 6 });
}

const mm = (n: number) => Math.round(n).toLocaleString('en-IN');
const boxOf = (gs: THREE.BufferGeometry[]) => { const bb = new THREE.Box3(); for (const g of gs) bb.union(new THREE.Box3().setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute)); return bb; };

/** Dimension lines along the box's length (x), width (y) and height (z), each with its value. */
function dimensions(bb: THREE.Box3, textH: number, names: [string, string, string]) {
  const g = new THREE.Group();
  const { min, max } = bb; const off = textH * 1.6;
  const mat = new THREE.LineBasicMaterial({ color: DIM, depthTest: false });
  const add = (a: THREE.Vector3, b: THREE.Vector3, tick: THREE.Vector3, value: number, name: string) => {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b, a.clone().add(tick), a.clone().sub(tick), b.clone().add(tick), b.clone().sub(tick)]);
    const l = new THREE.LineSegments(geo, mat); l.renderOrder = 9; g.add(l);
    const t = label(`${name} ${mm(value)}`, textH, '#ffffff', 'rgba(31,111,235,0.92)'); t.position.copy(a.clone().add(b).multiplyScalar(0.5)); g.add(t);
  };
  const tk = textH * 0.35;
  add(new THREE.Vector3(min.x, min.y - off, min.z), new THREE.Vector3(max.x, min.y - off, min.z), new THREE.Vector3(0, tk, 0), max.x - min.x, names[0]);
  add(new THREE.Vector3(max.x + off, min.y, min.z), new THREE.Vector3(max.x + off, max.y, min.z), new THREE.Vector3(tk, 0, 0), max.y - min.y, names[1]);
  add(new THREE.Vector3(min.x - off, min.y - off, min.z), new THREE.Vector3(min.x - off, min.y - off, max.z), new THREE.Vector3(tk, 0, 0), max.z - min.z, names[2]);
  return g;
}

const disposeTree = (root: THREE.Object3D) => root.traverse((o) => {
  const m = o as THREE.Mesh; m.geometry?.dispose?.();
  const mats = (Array.isArray(m.material) ? m.material : [m.material]) as (THREE.Material & { map?: THREE.Texture | null })[];
  for (const mat of mats) { mat?.map?.dispose?.(); mat?.dispose?.(); }
});

const NONE: number[] = [];

export function Model3DView({ model, part, marks, codes = {}, scope, onScope, selected = NONE, onPick }: {
  model: Model3D | null;
  part: Part3D | null;
  marks: (string | null | undefined)[];
  codes?: Record<string, string>;
  /** what to show (the drawing viewer holds it; its side panel switches it too) */
  scope: Scope3D;
  onScope: (s: Scope3D) => void;
  /** the selected pieces (model element indices) */
  selected?: number[];
  /** a click on a piece (its element index), or on empty space (null) */
  onPick?: (index: number | null) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const lit = useMemo(() => (model ? litMark(model, marks) : null), [model, marks]);
  const showPart = scope === 'part' && !!part;
  const [labels, setLabels] = useState(true);
  const [dims, setDims] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const litCount = useMemo(() => (model ? model.elements.filter((e) => isLit(e, lit)).length : 0), [model, lit]);
  const selSet = useMemo(() => new Set(selected), [selected]);
  const view = useRef({ scope, labels, dims, selSet, lit });
  useEffect(() => { view.current = { scope, labels, dims, selSet, lit }; }, [scope, labels, dims, selSet, lit]);
  const pickRef = useRef(onPick);
  useEffect(() => { pickRef.current = onPick; }, [onPick]);
  const api = useRef<{ fit: () => void; select: (ids: number[]) => void } | null>(null);
  const selRef = useRef(selected);
  useEffect(() => { selRef.current = selected; }, [selected]);

  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const size = () => ({ w: Math.max(el.clientWidth, 10), h: Math.max(el.clientHeight, 10) });
    renderer.setSize(size().w, size().h);
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.setAttribute('data-testid', 'model3d-canvas');
    const scene = new THREE.Scene();
    // A solid background from the theme (a transparent canvas does not show in screenshots or prints).
    scene.background = new THREE.Color(getComputedStyle(el).getPropertyValue('--c-surface-2').trim() || '#f4f5f7');
    const camera = new THREE.PerspectiveCamera(40, size().w / size().h, 10, 2e6);
    camera.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(0.4, -1, 1.2); scene.add(sun);

    let litGeo: THREE.BufferGeometry | null = null; let plainGeo: THREE.BufferGeometry | null = null;
    // owner[i] = element i's vertices in the pick mesh (the part view: one run, the part).
    const owner: { start: number; count: number }[] = [];
    const pickList: THREE.BufferGeometry[] = [];
    const labelGroup = new THREE.Group(); const dimGroup = new THREE.Group();
    const focus = new THREE.Box3();
    if (showPart && part) {
      // The plate lies flat (x along its length, y across), its thickness up.
      litGeo = merge([partGeometry(part)].filter((g): g is THREE.BufferGeometry => !!g));
      if (litGeo) {
        focus.setFromBufferAttribute(litGeo.attributes.position as THREE.BufferAttribute);
        owner.push({ start: 0, count: litGeo.attributes.position.count });
        pickList.push(litGeo);
      }
    } else if (model) {
      const litList: THREE.BufferGeometry[] = []; const plainList: THREE.BufferGeometry[] = [];
      let at = 0;
      for (const e of model.elements) {
        const gs = elementGeometries(e).map((g) => (g.index ? g.toNonIndexed() : g));
        (isLit(e, lit) ? litList : plainList).push(...gs);
        const n = gs.reduce((s, g) => s + g.attributes.position.count, 0);
        owner.push({ start: at, count: n });
        pickList.push(...gs); at += n;
      }
      litGeo = merge(litList); plainGeo = merge(plainList);
      if (litGeo) focus.union(new THREE.Box3().setFromBufferAttribute(litGeo.attributes.position as THREE.BufferAttribute));
      else if (plainGeo) focus.union(new THREE.Box3().setFromBufferAttribute(plainGeo.attributes.position as THREE.BufferAttribute));
    }
    const all = new THREE.Box3();
    if (litGeo) all.union(new THREE.Box3().setFromBufferAttribute(litGeo.attributes.position as THREE.BufferAttribute));
    if (plainGeo) all.union(new THREE.Box3().setFromBufferAttribute(plainGeo.attributes.position as THREE.BufferAttribute));
    const textH = Math.max((all.isEmpty() ? 1000 : all.getSize(new THREE.Vector3()).length()) / 70, 12);

    // Each big mesh has its normal material and a faint one (the whole structure behind a selection): a swap, not a rebuild.
    const faintMat = new THREE.MeshLambertMaterial({ color: FAINT, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    const litMat = new THREE.MeshLambertMaterial({ color: showPart ? STEEL : LIT, side: THREE.DoubleSide });
    const plainMat = new THREE.MeshLambertMaterial({ color: lit ? FAINT : STEEL, transparent: !!lit, opacity: lit ? 0.28 : 1, depthWrite: !lit, side: THREE.DoubleSide });
    const litMesh = litGeo ? new THREE.Mesh(litGeo, litMat) : null;
    const plainMesh = plainGeo ? new THREE.Mesh(plainGeo, plainMat) : null;
    let litEdges: THREE.LineSegments | null = null;
    if (plainMesh) scene.add(plainMesh);
    if (litMesh && litGeo) { scene.add(litMesh); litEdges = new THREE.LineSegments(new THREE.EdgesGeometry(litGeo, 30), new THREE.LineBasicMaterial({ color: showPart ? 0x3b4754 : 0x7a3e0c })); scene.add(litEdges); }
    const pickGeo = merge(pickList);
    const pickMesh = pickGeo ? new THREE.Mesh(pickGeo, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })) : null;
    if (pickMesh) scene.add(pickMesh);

    // Labels: the lit pieces' codes; with nothing lit, the members'. One per mark nearby (no pile-ups).
    if (model && !showPart) {
      const seen: { mark: string; p: THREE.Vector3 }[] = [];
      for (const e of model.elements) {
        if (!e.mark || (lit ? !isLit(e, lit) : !e.member)) continue;
        const c = boxOf(elementGeometries(e)).getCenter(new THREE.Vector3());
        if (seen.some((s) => s.mark === e.mark && s.p.distanceTo(c) < textH * 8)) continue;
        seen.push({ mark: e.mark, p: c });
        // Codes: the part's code on this line without the order (user, 2026-11-01); its mark where the line has no code for it.
        const s = label(codes[normMark(e.mark)] ?? e.mark, textH * 0.8); s.position.copy(c); labelGroup.add(s);
        if (labelGroup.children.length > 400) break;
      }
    } else if (showPart && part && !focus.isEmpty()) {
      const s = label(part.label, textH); s.position.copy(focus.getCenter(new THREE.Vector3())).add(new THREE.Vector3(0, 0, part.thicknessMm + textH)); labelGroup.add(s);
    }
    scene.add(labelGroup);
    if (!focus.isEmpty()) dimGroup.add(dimensions(focus, textH * 0.9, showPart ? ['L', 'W', 'T'] : ['L', 'W', 'H']));
    scene.add(dimGroup);

    // The selection: its own small mesh in the highlight colour, with its code and its dimensions.
    const selGroup = new THREE.Group(); const selMarks = new THREE.Group(); const selDims = new THREE.Group();
    selGroup.add(selMarks, selDims); scene.add(selGroup);
    const selBox = new THREE.Box3();
    const select = (ids: number[]) => {
      for (const g of [selMarks, selDims]) { for (const c of [...g.children]) { disposeTree(c); g.remove(c); } }
      for (const c of [...selGroup.children]) if (c !== selMarks && c !== selDims) { disposeTree(c); selGroup.remove(c); }
      selBox.makeEmpty();
      if (!model || showPart || !ids.length) return;
      const gs = ids.flatMap((i) => (model.elements[i] ? elementGeometries(model.elements[i]) : []));
      const g = merge(gs);
      if (!g) return;
      selBox.copy(boxOf([g]));
      // Text sized to the selection (one stiffener in a 24 m span must not get span-sized dimension text).
      const th = Math.min(textH, Math.max(selBox.getSize(new THREE.Vector3()).length() / 18, 8));
      selGroup.add(new THREE.Mesh(g, highlightMaterial()));
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: 0x6b0f45 }));
      selGroup.add(edges);
      const seen = new Set<string>();
      for (const i of ids.slice(0, 60)) {
        const e = model.elements[i]; const key = e?.mark ?? e?.id;
        if (!e || seen.has(`${key}${i}`)) continue; seen.add(`${key}${i}`);
        const c = boxOf(elementGeometries(e));
        const s = label(e.mark ? codes[normMark(e.mark)] ?? e.mark : e.label ?? e.id, th, '#ffffff', 'rgba(158,24,98,0.92)');
        s.position.copy(c.getCenter(new THREE.Vector3())).setZ(c.max.z + th); selMarks.add(s);
      }
      selDims.add(dimensions(selBox, th * 0.9, ['L', 'W', 'H']));
    };

    const controls = createOrbit(camera, renderer.domElement);
    /** The box Fit frames for the current scope. */
    const fitBox = () => {
      const sc = view.current.scope;
      if (sc === 'selection' && !selBox.isEmpty()) return selBox;
      if (showPart || sc === 'level') return focus.isEmpty() ? all : focus;
      return litGeo && !focus.isEmpty() ? focus : all;
    };
    const fit = () => frameBox(camera, controls, fitBox(), { dir: VIEW_DIR });
    select(selRef.current);
    fit();
    api.current = { fit, select };

    // Picking: the nearest hit on a piece that is shown in the current scope.
    const ray = new THREE.Raycaster();
    const pick = (ndc: THREE.Vector2): number | null => {
      if (!pickMesh) return null;
      ray.setFromCamera(ndc, camera);
      for (const hit of ray.intersectObject(pickMesh, false)) {
        if (hit.faceIndex == null) continue;
        const i = ownerAt(owner, hit.faceIndex * 3);
        if (i < 0) continue;
        if (showPart) return i;
        const v = view.current;
        if (model && shownIn(v.scope, model.elements[i], i, v.lit, v.selSet)) return i;
      }
      return null;
    };
    const unbind = bindClicks(renderer.domElement, {
      click: (ndc) => {
        const i = pick(ndc);
        if (showPart) { setPicked(i != null && part ? `${part.label} · ${sizeWords(part)}` : null); return; }
        pickRef.current?.(i);
      },
      dblclick: (ndc) => {
        const i = pick(ndc);
        if (i == null) { fit(); return; }
        // The piece becomes the centre of turning, framed from where the camera is now.
        const bb = showPart || !model ? focus : boxOf(elementGeometries(model.elements[i]));
        frameBox(camera, controls, bb, { margin: 2.2 });
      },
    });
    const ro = new ResizeObserver(() => { const s = size(); renderer.setSize(s.w, s.h); camera.aspect = s.w / s.h; camera.updateProjectionMatrix(); });
    ro.observe(el);
    let raf = 0;
    const tick = () => {
      // The scope and switches are read each frame through a ref (no rebuild, never a stale value).
      const v = view.current; const sc = v.scope; const hasSel = selGroup.children.length > 2;
      if (!showPart) {
        const behind = hasSel && sc === 'whole';
        if (plainMesh) { plainMesh.visible = sc === 'whole' || (sc === 'level' && !litMesh); plainMesh.material = behind ? faintMat : plainMat; }
        if (litMesh) { litMesh.visible = sc === 'whole' || sc === 'level'; litMesh.material = behind ? faintMat : litMat; }
        if (litEdges) litEdges.visible = !!litMesh?.visible && !behind;
      }
      labelGroup.visible = v.labels && sc !== 'selection'; dimGroup.visible = v.dims && !hasSel;
      selMarks.visible = v.labels; selDims.visible = v.dims;
      controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(tick);
    };
    tick();
    const readyAt = requestAnimationFrame(() => setReady(true));
    return () => {
      cancelAnimationFrame(raf); cancelAnimationFrame(readyAt); ro.disconnect(); controls.dispose(); unbind();
      disposeTree(scene); faintMat.dispose(); litMat.dispose(); plainMat.dispose();
      renderer.dispose(); renderer.domElement.remove(); api.current = null;
    };
    // The scene is rebuilt for a new model, part, lit level or the part view; scope, selection and switches are not.
  }, [model, part, lit, showPart, codes]);

  // A new selection: only the highlight mesh is rebuilt; "Just this part" frames it.
  useEffect(() => {
    api.current?.select(selected);
    if (view.current.scope === 'selection') { const id = requestAnimationFrame(() => api.current?.fit()); return () => cancelAnimationFrame(id); }
    return undefined;
  }, [selected]);
  // A new scope frames what it shows (after the ref has the new value).
  useEffect(() => { const id = requestAnimationFrame(() => api.current?.fit()); return () => cancelAnimationFrame(id); }, [scope]);

  const choices = scopeChoices({ hasModel: !!model, hasPart: !!part, lit, selected: selected.length > 0 });
  const sel = selected.length && model ? model.elements[selected[0]] : null;
  const note = sel ? `${sel.label ?? sel.mark ?? sel.id}${sel.mark ? ` · ${sel.mark}` : ''} · ${sizeWords(sel)}${selected.length > 1 ? ` · ${selected.length} pieces selected` : ''}` : picked;
  const pill = { fontSize: 12.5, color: 'var(--c-text-2)', background: 'var(--c-surface)', px: 1, py: 0.25, borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)' };
  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', display: 'flex' }} data-testid="model3d">
      <Box ref={host} sx={{ flex: 1, minWidth: 0, minHeight: 0, cursor: 'grab', '&:active': { cursor: 'grabbing' }, touchAction: 'none' }} />
      {!ready && <Box role="status" sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, color: 'var(--c-text-2)' }}><CircularProgress size={18} /> Building the 3D view…</Box>}
      <Box sx={{ position: 'absolute', left: 12, top: 10, right: 12, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', pointerEvents: 'none' }}>
        {choices.length > 1 && (
          <ToggleButtonGroup size="small" exclusive value={scope} onChange={(_, v: Scope3D | null) => { if (v) onScope(v); }} sx={{ pointerEvents: 'auto', background: 'var(--c-surface)' }} aria-label="What to show in 3D" data-testid="model3d-scope">
            {choices.map((c) => <ToggleButton key={c.value} value={c.value} data-testid={`model3d-scope-${c.value}`}>{c.label}</ToggleButton>)}
          </ToggleButtonGroup>
        )}
        <Typography sx={pill} data-testid="model3d-lit">
          {showPart && part ? `${part.label} · ${sizeWords(part)}`
            : model ? (scope === 'selection' && selected.length ? `${selected.length} of ${model.elements.length} pieces shown`
              : lit ? `${lit} lit · ${litCount} of ${model.elements.length} pieces` : `${model.elements.length} pieces — this level is not in the model`) : ''}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: 'flex', gap: 0.5, pointerEvents: 'auto', flexWrap: 'wrap' }}>
          <Button size="small" variant={labels ? 'contained' : 'outlined'} onClick={() => setLabels((x) => !x)} data-testid="model3d-labels" aria-pressed={labels}>Codes</Button>
          <Button size="small" variant={dims ? 'contained' : 'outlined'} onClick={() => setDims((x) => !x)} data-testid="model3d-dims" aria-pressed={dims}>Dimensions</Button>
          <Button size="small" variant="outlined" onClick={() => api.current?.fit()} data-testid="model3d-fit">Fit</Button>
        </Box>
      </Box>
      <Typography data-testid="model3d-picked" sx={{ position: 'absolute', left: 12, bottom: 8, fontSize: 12.5, color: note ? 'var(--c-text-1)' : 'var(--c-text-3)', background: 'var(--c-surface)', px: 1, borderRadius: 'var(--r-sm)', maxWidth: 'calc(100% - 24px)' }}>
        {note ?? `${GESTURES_3D} · click a piece to select it (Esc clears)`}
      </Typography>
    </Box>
  );
}

export default Model3DView;
