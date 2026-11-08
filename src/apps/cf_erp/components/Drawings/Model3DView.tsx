import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, CircularProgress, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import * as THREE from 'three';
import type { Model3D } from '../../api/drawings';
import { GESTURES_3D, isLit, litMark, normMark, scopeChoices, shownIn, sizeWords, type Part3D, type Scope3D } from '../../lib/model3d';
import { label, merge } from '../../lib/model3dGeometry';
import type { PreparedModel } from '../../lib/model3dPrep';
import { prepared, preparedNow } from '../../lib/model3dPrepare';
import { cutPieces, edgeLines, HOLE_MIN_PX, holeMarkers, instancedMeshes, largestHole, pickTags, pieceBox, piecesBox, pixelsOf, type Placement } from '../../lib/model3dInstanced';
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
 * Selecting does not rebuild the scene: the selection is its own small highlight mesh, and the big meshes only swap
 * material or visibility. Gestures: lib/orbit3d.ts.
 *
 * Fast (user, 2026-11-08: "Same parts should of course be built once"; "Holes should just be an easy construct… all we
 * need is their locations and their dimensions"): the model is made ready once (lib/model3dPrep.ts — each distinct
 * shape built once, in a Web Worker, kept in the browser's store), each shape is ONE InstancedMesh placed by its
 * pieces' matrices, and the holes are small dark markers (one InstancedMesh). Only the selection and the part on its
 * own are built with their holes truly cut. A click finds the piece by its instance.
 */

const LIT = 0xd9822b;
const STEEL = 0x8a99ab;
const FAINT = 0xb9c2cc;
const DIM = 0x1f6feb;
const HOLE = 0x2b3138;

/** A plate part: its outline ring and every inner ring as a hole, extruded to its thickness (x, y in the plate, z through it). */
function partGeometry(p: Part3D): THREE.BufferGeometry | null {
  const [outer, ...inner] = p.rings;
  if (!outer || outer.length < 3) return null;
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const r of inner) if (r.length >= 3) shape.holes.push(new THREE.Path(r.map(([x, y]) => new THREE.Vector2(x, y))));
  return new THREE.ExtrudeGeometry(shape, { depth: p.thicknessMm, bevelEnabled: false, curveSegments: 6 });
}

const mm = (n: number) => Math.round(n).toLocaleString('en-IN');

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

/** Free a scene's GPU memory (the shared hole marker shape stays: it is the page's). */
const disposeTree = (root: THREE.Object3D) => root.traverse((o) => {
  const m = o as THREE.Mesh; if (!m.userData?.keepGeometry) m.geometry?.dispose?.();
  const mats = (Array.isArray(m.material) ? m.material : [m.material]) as (THREE.Material & { map?: THREE.Texture | null })[];
  for (const mat of mats) { mat?.map?.dispose?.(); mat?.dispose?.(); }
});

const NONE: number[] = [];
const NO_CODES: Record<string, string> = {};

export function Model3DView({ model, part, marks, codes = NO_CODES, scope, onScope, selected = NONE, onPick }: {
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
  // The model made ready to draw (lib/model3dPrepare.ts): at once when this page has it already, else from the worker.
  const [prepState, setPrepState] = useState<{ model: Model3D; prep: PreparedModel | null; failed?: boolean } | null>(null);
  const [progress, setProgress] = useState(0);
  const prep = model && !showPart ? (prepState?.model === model ? prepState.prep : preparedNow(model)) : null;
  const failed = !!model && !showPart && prepState?.model === model && !!prepState.failed;
  useEffect(() => {
    if (!model || showPart || preparedNow(model)) return undefined;
    let live = true;
    prepared(model, (f) => { if (live) setProgress(f); })
      .then((p) => { if (live) setPrepState({ model, prep: p }); })
      .catch(() => { if (live) setPrepState({ model, prep: null, failed: true }); });
    return () => { live = false; };
  }, [model, showPart]);
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
    // Waiting for the model to be made ready: nothing to draw yet.
    if (!showPart && model && !prep) return undefined;
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

    // The part on its own (one mesh, holes cut), or the model: one InstancedMesh per shape, lit and plain apart.
    let partMesh: THREE.Mesh | null = null;
    const litMeshes: THREE.InstancedMesh[] = []; const plainMeshes: THREE.InstancedMesh[] = [];
    let litHoles: THREE.InstancedMesh | null = null; let plainHoles: THREE.InstancedMesh | null = null;
    const labelGroup = new THREE.Group(); const dimGroup = new THREE.Group();
    const focus = new THREE.Box3(); const all = new THREE.Box3();
    // Each set of meshes has its normal material and a faint one (the whole structure behind a selection): a swap, not a rebuild.
    const faintMat = new THREE.MeshLambertMaterial({ color: FAINT, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    const litMat = new THREE.MeshLambertMaterial({ color: showPart ? STEEL : LIT, side: THREE.DoubleSide });
    const plainMat = new THREE.MeshLambertMaterial({ color: lit ? FAINT : STEEL, transparent: !!lit, opacity: lit ? 0.28 : 1, depthWrite: !lit, side: THREE.DoubleSide });
    const holeMat = new THREE.MeshBasicMaterial({ color: HOLE });
    const holeFaintMat = new THREE.MeshBasicMaterial({ color: HOLE, transparent: true, opacity: 0.25, depthWrite: false });
    let litEdges: THREE.LineSegments | null = null;
    let holeMm = 0;
    if (showPart && part) {
      // The plate lies flat (x along its length, y across), its thickness up.
      const g = merge([partGeometry(part)].filter((x): x is THREE.BufferGeometry => !!x));
      if (g) {
        focus.setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute); all.copy(focus);
        partMesh = new THREE.Mesh(g, litMat); scene.add(partMesh);
        litEdges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: 0x3b4754 })); scene.add(litEdges);
      }
    } else if (model && prep) {
      const litItems: Placement[] = []; const plainItems: Placement[] = [];
      model.elements.forEach((e, i) => {
        if (prep.elGeom[i] < 0) return;
        (isLit(e, lit) ? litItems : plainItems).push({ el: i, tag: i });
      });
      const geos = new Map<number, THREE.BufferGeometry>();
      litMeshes.push(...instancedMeshes(prep, litItems, litMat, geos));
      plainMeshes.push(...instancedMeshes(prep, plainItems, plainMat, geos));
      for (const m of [...plainMeshes, ...litMeshes]) scene.add(m);
      litHoles = holeMarkers(prep, litItems, holeMat);
      plainHoles = holeMarkers(prep, plainItems, lit ? holeFaintMat : holeMat);
      if (litHoles) scene.add(litHoles);
      if (plainHoles) scene.add(plainHoles);
      holeMm = largestHole(prep, [...litItems, ...plainItems]);
      if (litItems.length) {
        const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(edgeLines(prep, litItems), 3));
        litEdges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x7a3e0c })); scene.add(litEdges);
      }
      all.copy(piecesBox(prep, model.elements.keys()));
      focus.copy(litItems.length ? piecesBox(prep, litItems.map((x) => x.el)) : all);
    }
    const textH = Math.max((all.isEmpty() ? 1000 : all.getSize(new THREE.Vector3()).length()) / 70, 12);

    // Labels: the lit pieces' codes; with nothing lit, the members'. One per mark nearby (no pile-ups).
    if (model && prep && !showPart) {
      const seen: { mark: string; p: THREE.Vector3 }[] = [];
      for (let i = 0; i < model.elements.length; i++) {
        const e = model.elements[i];
        if (!e.mark || e.bolt || (lit ? !isLit(e, lit) : !e.member)) continue;
        const bb = pieceBox(prep, i);
        if (bb.isEmpty()) continue;
        const c = bb.getCenter(new THREE.Vector3());
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

    // The selection: its own small mesh in the highlight colour — its holes truly cut — with its code and its dimensions.
    const selGroup = new THREE.Group(); const selMarks = new THREE.Group(); const selDims = new THREE.Group();
    selGroup.add(selMarks, selDims); scene.add(selGroup);
    const selBox = new THREE.Box3();
    const select = (ids: number[]) => {
      for (const g of [selMarks, selDims]) { for (const c of [...g.children]) { disposeTree(c); g.remove(c); } }
      for (const c of [...selGroup.children]) if (c !== selMarks && c !== selDims) { disposeTree(c); selGroup.remove(c); }
      selBox.makeEmpty();
      if (!model || !prep || showPart || !ids.length) return;
      const cut = cutPieces(prep, model, ids.filter((i) => model.elements[i]).map((i) => ({ el: i, tag: i })));
      if (!cut) return;
      selBox.copy(cut.mesh.boundingBox ?? new THREE.Box3());
      // Text sized to the selection (one stiffener in a 24 m span must not get span-sized dimension text).
      const th = Math.min(textH, Math.max(selBox.getSize(new THREE.Vector3()).length() / 18, 8));
      selGroup.add(new THREE.Mesh(cut.mesh, highlightMaterial()));
      selGroup.add(new THREE.LineSegments(cut.edges, new THREE.LineBasicMaterial({ color: 0x6b0f45 })));
      const seen = new Set<string>();
      for (const i of ids.slice(0, 60)) {
        const e = model.elements[i]; const key = e?.mark ?? e?.id;
        if (!e || seen.has(`${key}${i}`)) continue; seen.add(`${key}${i}`);
        const c = pieceBox(prep, i);
        if (c.isEmpty()) continue;
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
      return litMeshes.length && !focus.isEmpty() ? focus : all;
    };
    const fit = () => frameBox(camera, controls, fitBox(), { dir: VIEW_DIR });
    select(selRef.current);
    fit();
    api.current = { fit, select };

    // Picking: the nearest hit on a piece that is shown in the current scope (each instance knows its piece).
    const ray = new THREE.Raycaster();
    const pickable = [...litMeshes, ...plainMeshes];
    const pick = (ndc: THREE.Vector2): number | null => {
      ray.setFromCamera(ndc, camera);
      if (showPart) return partMesh && ray.intersectObject(partMesh, false).length ? 0 : null;
      if (!model) return null;
      const v = view.current;
      for (const i of pickTags(ray, pickable)) if (shownIn(v.scope, model.elements[i], i, v.lit, v.selSet)) return i;
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
        const bb = showPart || !prep ? focus : pieceBox(prep, i);
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
        const plainOn = sc === 'whole' || (sc === 'level' && !litMeshes.length); const litOn = sc === 'whole' || sc === 'level';
        for (const m of plainMeshes) { m.visible = plainOn; m.material = behind ? faintMat : plainMat; }
        for (const m of litMeshes) { m.visible = litOn; m.material = behind ? faintMat : litMat; }
        // The holes go with their steel; behind a selection they are left out (the faint steel shows the shape), and so
        // are holes too small to see from here (a whole span: each would be under a pixel).
        const holesSeen = pixelsOf(holeMm, camera.position.distanceTo(controls.target), camera, renderer.domElement.clientHeight || 600) >= HOLE_MIN_PX;
        if (plainHoles) plainHoles.visible = plainOn && !behind && holesSeen;
        if (litHoles) litHoles.visible = litOn && !behind && holesSeen;
        if (litEdges) litEdges.visible = litOn && litMeshes.length > 0 && !behind;
      }
      labelGroup.visible = v.labels && sc !== 'selection'; dimGroup.visible = v.dims && !hasSel;
      selMarks.visible = v.labels; selDims.visible = v.dims;
      controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(tick);
    };
    // The shaders are compiled first without holding the page (where the browser can), then the first frame is drawn.
    let alive = true; let readyAt = 0;
    const start = () => { if (!alive) return; tick(); readyAt = requestAnimationFrame(() => setReady(true)); };
    renderer.compileAsync(scene, camera).then(start, start);
    return () => {
      alive = false; cancelAnimationFrame(raf); cancelAnimationFrame(readyAt); ro.disconnect(); controls.dispose(); unbind();
      disposeTree(scene); faintMat.dispose(); litMat.dispose(); plainMat.dispose(); holeMat.dispose(); holeFaintMat.dispose();
      renderer.dispose(); renderer.domElement.remove(); api.current = null;
    };
    // The scene is rebuilt for a new model, part, lit level or the part view; scope, selection and switches are not.
  }, [model, prep, part, lit, showPart, codes]);

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
  const waiting = !!model && !showPart && !prep;
  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', display: 'flex' }} data-testid="model3d">
      <Box ref={host} sx={{ flex: 1, minWidth: 0, minHeight: 0, cursor: 'grab', '&:active': { cursor: 'grabbing' }, touchAction: 'none' }} />
      {failed ? (
        <Box role="alert" sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-2)' }}>The 3D view could not be built for this model.</Box>
      ) : (waiting || !ready) && (
        <Box role="status" sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, color: 'var(--c-text-2)' }}>
          <CircularProgress size={18} {...(waiting && progress > 0 ? { variant: 'determinate' as const, value: Math.round(progress * 100) } : {})} />
          Building the 3D view…{waiting && progress > 0 ? ` ${Math.round(progress * 100)}%` : ''}
        </Box>
      )}
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
