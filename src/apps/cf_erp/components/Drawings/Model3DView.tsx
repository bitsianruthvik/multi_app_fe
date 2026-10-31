import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, CircularProgress, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Model3D, Model3DElement } from '../../api/drawings';
import { isLit, litMark, sizeWords, type Part3D } from '../../lib/model3d';

/**
 * THE 3D VIEW (user, 2026-10-31: "a 3D version in the tool to show the diagram in 3D"; then: labels, dimensions,
 * "Only this level", and parts in 3D).
 *
 * Two things it can show:
 *   Whole structure — the line's model (`cf-erp-model3d/1`, kept with its standard drawing — services/model3dService.js)
 *          the way the takeoff tool draws its model.json: members as their plates (an I or a box from its flanges and
 *          webs, a pipe as a tube) along their axis, shaped plates (gussets) as their outline extruded, other plates as
 *          boxes. The open level lights up (by drawing mark); the rest is faint, or hidden ("Only this level").
 *   This part — a plate part on its own: its DXF outline (and every hole) extruded to its thickness.
 * Labels: each lit piece's mark (the members' when nothing is lit). Dimensions: the overall length, width and height
 * of what is lit (or of everything, or of the part), as dimension lines. Drag to turn, scroll to zoom, right-drag to
 * pan; click a piece to name it and see its size.
 */

const LIT = 0xd9822b;
const STEEL = 0x8a99ab;
const FAINT = 0xb9c2cc;
const DIM = 0x1f6feb;

/** The meshes of one element, in model millimetres (z up). */
function elementGeometries(e: Model3DElement): THREE.BufferGeometry[] {
  if (e.plate) {
    const pl = e.plate;
    if (pl.pts.length < 3) return [];
    const shape = new THREE.Shape(pl.pts.map(([x, y]) => new THREE.Vector2(x, y)));
    // Its bolt holes (x, y, diameter) go right through.
    for (const [hx, hy, hd] of pl.holes ?? []) shape.holes.push(new THREE.Path().absarc(hx, hy, hd / 2, 0, Math.PI * 2, true));
    const g = new THREE.ExtrudeGeometry(shape, { depth: pl.t, bevelEnabled: false, curveSegments: 8 });
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...pl.u), new THREE.Vector3(...pl.v), new THREE.Vector3(...pl.w));
    m.setPosition(pl.o[0], pl.o[1], pl.o[2]);
    g.applyMatrix4(m);
    return [g];
  }
  if (e.box) {
    const g = new THREE.BoxGeometry(e.box.size[0], e.box.size[1], e.box.size[2]);
    g.translate(e.box.c[0], e.box.c[1], e.box.c[2]);
    return [g];
  }
  const m = e.member!;
  const a = new THREE.Vector3(...m.a); const b = new THREE.Vector3(...m.b);
  const axis = b.clone().sub(a); const L = axis.length();
  if (L < 1) return [];
  axis.normalize();
  const up = new THREE.Vector3(...m.up);
  up.sub(axis.clone().multiplyScalar(up.dot(axis)));
  if (up.lengthSq() < 1e-9) up.set(axis.z === 0 ? 0 : 1, 0, axis.z === 0 ? 1 : 0);
  up.normalize();
  const side = new THREE.Vector3().crossVectors(axis, up).normalize();
  const basis = new THREE.Matrix4().makeBasis(axis, up, side);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const place = (g: THREE.BufferGeometry) => { g.applyMatrix4(basis); g.translate(mid.x, mid.y, mid.z); return g; };
  const plate = (len: number, depth: number, width: number, dy: number, dz: number) => { const g = new THREE.BoxGeometry(len, depth, width); g.translate(0, dy, dz); return place(g); };
  const s = m.section;
  if (s.type === 'pipe') { const g = new THREE.CylinderGeometry(s.d / 2, s.d / 2, L, 20, 1, false); g.rotateZ(-Math.PI / 2); return [place(g)]; }
  const h = s.h;
  if (s.type === 'I') {
    const webH = h - s.tTop - s.tBot;
    return [plate(L, s.tTop, s.bTop, h / 2 - s.tTop / 2, 0), plate(L, s.tBot, s.bBot, -h / 2 + s.tBot / 2, 0), plate(L, webH, s.tw, (s.tBot - s.tTop) / 2, 0)];
  }
  const w = s.w;
  const webBot = -h / 2 + (s.bBot > w ? s.tBot : 0); const webTop = h / 2 - (s.bTop > w ? s.tTop : 0);
  const webH = webTop - webBot; const webY = (webTop + webBot) / 2;
  return [plate(L, s.tTop, s.bTop, h / 2 - s.tTop / 2, 0), plate(L, s.tBot, s.bBot, -h / 2 + s.tBot / 2, 0), plate(L, webH, s.tw, webY, w / 2 - s.tw / 2), plate(L, webH, s.tw, webY, -w / 2 + s.tw / 2)];
}

/** A plate part: its outline ring and every inner ring as a hole, extruded to its thickness (x, y in the plate, z through it). */
function partGeometry(p: Part3D): THREE.BufferGeometry | null {
  const [outer, ...inner] = p.rings;
  if (!outer || outer.length < 3) return null;
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const r of inner) if (r.length >= 3) shape.holes.push(new THREE.Path(r.map(([x, y]) => new THREE.Vector2(x, y))));
  return new THREE.ExtrudeGeometry(shape, { depth: p.thicknessMm, bevelEnabled: false, curveSegments: 6 });
}

const merge = (list: THREE.BufferGeometry[]) => {
  if (!list.length) return null;
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = flat.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3); let o = 0;
  for (const g of flat) { pos.set(g.attributes.position.array as Float32Array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.computeVertexNormals();
  return out;
};

/** A text label that always faces the camera; `h` = its height in model mm. */
function label(text: string, h: number, color = '#1d2733', bg = 'rgba(255,255,255,0.85)') {
  const c = document.createElement('canvas'); const x = c.getContext('2d')!;
  const fs = 48; x.font = `600 ${fs}px system-ui, sans-serif`;
  const w = Math.ceil(x.measureText(text).width) + 24; c.width = w; c.height = fs + 20;
  x.font = `600 ${fs}px system-ui, sans-serif`; x.fillStyle = bg; x.fillRect(0, 0, w, c.height);
  x.fillStyle = color; x.textBaseline = 'middle'; x.fillText(text, 12, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set((h * w) / c.height, h, 1); s.renderOrder = 10;
  return s;
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

type Mode = 'span' | 'part';

export function Model3DView({ model, part, marks }: { model: Model3D | null; part: Part3D | null; marks: (string | null | undefined)[] }) {
  const host = useRef<HTMLDivElement | null>(null);
  const lit = useMemo(() => (model ? litMark(model, marks) : null), [model, marks]);
  // A part opened on its own row shows itself; a level the model knows shows the whole structure.
  const [mode, setMode] = useState<Mode>(() => (model && (lit || !part) ? 'span' : 'part'));
  const [only, setOnly] = useState(false);
  const [labels, setLabels] = useState(true);
  const [dims, setDims] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const litCount = useMemo(() => (model ? model.elements.filter((e) => isLit(e, lit)).length : 0), [model, lit]);
  const view = useRef({ only, labels, dims });
  useEffect(() => { view.current = { only, labels, dims }; }, [only, labels, dims]);
  const api = useRef<{ fit: () => void } | null>(null);

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

    const showPart = mode === 'part' && !!part;
    let litGeo: THREE.BufferGeometry | null = null; let plainGeo: THREE.BufferGeometry | null = null;
    const owner: { start: number; count: number; text: string }[] = [];
    const pickList: THREE.BufferGeometry[] = [];
    const labelGroup = new THREE.Group(); const dimGroup = new THREE.Group();
    const focus = new THREE.Box3();
    if (showPart && part) {
      // The plate lies flat (x along its length, y across), its thickness up.
      litGeo = merge([partGeometry(part)].filter((g): g is THREE.BufferGeometry => !!g));
      if (litGeo) {
        focus.setFromBufferAttribute(litGeo.attributes.position as THREE.BufferAttribute);
        owner.push({ start: 0, count: litGeo.attributes.position.count, text: `${part.label} · ${sizeWords(part)}` });
        pickList.push(litGeo);
      }
    } else if (model) {
      const litList: THREE.BufferGeometry[] = []; const plainList: THREE.BufferGeometry[] = [];
      let at = 0;
      for (const e of model.elements) {
        const gs = elementGeometries(e).map((g) => (g.index ? g.toNonIndexed() : g));
        (isLit(e, lit) ? litList : plainList).push(...gs);
        const n = gs.reduce((s, g) => s + g.attributes.position.count, 0);
        owner.push({ start: at, count: n, text: `${e.label ?? e.mark}${e.mark ? ` · ${e.mark}` : ''} · ${sizeWords(e)}` });
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

    const litMesh = litGeo ? new THREE.Mesh(litGeo, new THREE.MeshLambertMaterial({ color: showPart ? STEEL : LIT, side: THREE.DoubleSide })) : null;
    const plainMesh = plainGeo ? new THREE.Mesh(plainGeo, new THREE.MeshLambertMaterial({ color: lit ? FAINT : STEEL, transparent: !!lit, opacity: lit ? 0.28 : 1, depthWrite: !lit, side: THREE.DoubleSide })) : null;
    if (plainMesh) scene.add(plainMesh);
    if (litMesh && litGeo) { scene.add(litMesh); scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(litGeo, 30), new THREE.LineBasicMaterial({ color: showPart ? 0x3b4754 : 0x7a3e0c }))); }
    const pickGeo = merge(pickList);
    const pickMesh = pickGeo ? new THREE.Mesh(pickGeo, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })) : null;
    if (pickMesh) scene.add(pickMesh);

    // Labels: the lit pieces' marks; with nothing lit, the members'. One per mark nearby (no pile-ups).
    if (model && !showPart) {
      const seen: { mark: string; p: THREE.Vector3 }[] = [];
      for (const e of model.elements) {
        if (!e.mark || (lit ? !isLit(e, lit) : !e.member)) continue;
        const bb = new THREE.Box3(); for (const g of elementGeometries(e)) bb.union(new THREE.Box3().setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute));
        const c = bb.getCenter(new THREE.Vector3());
        if (seen.some((s) => s.mark === e.mark && s.p.distanceTo(c) < textH * 8)) continue;
        seen.push({ mark: e.mark, p: c });
        const s = label(e.mark, textH * 0.8); s.position.copy(c); labelGroup.add(s);
        if (labelGroup.children.length > 400) break;
      }
    } else if (showPart && part && !focus.isEmpty()) {
      const s = label(part.label, textH); s.position.copy(focus.getCenter(new THREE.Vector3())).add(new THREE.Vector3(0, 0, part.thicknessMm + textH)); labelGroup.add(s);
    }
    scene.add(labelGroup);
    if (!focus.isEmpty()) dimGroup.add(dimensions(focus, textH * 0.9, showPart ? ['L', 'W', 'T'] : ['L', 'W', 'H']));
    scene.add(dimGroup);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.12; controls.screenSpacePanning = true;
    const fit = () => {
      const bb = !focus.isEmpty() && (view.current.only || showPart || litGeo) ? focus : all;
      if (bb.isEmpty()) return;
      const c = bb.getCenter(new THREE.Vector3()); const r = Math.max(bb.getSize(new THREE.Vector3()).length() / 2, 200);
      const dist = (r / Math.sin((camera.fov * Math.PI) / 360)) * 1.15;
      camera.position.copy(c).add(new THREE.Vector3(-0.55, -0.75, 0.48).normalize().multiplyScalar(dist));
      camera.near = dist / 300; camera.far = dist * 30; camera.updateProjectionMatrix();
      controls.target.copy(c); controls.update();
    };
    fit();
    api.current = { fit };

    const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2(); let down: [number, number] | null = null;
    const onDown = (ev: PointerEvent) => { down = [ev.clientX, ev.clientY]; };
    const onUp = (ev: PointerEvent) => {
      if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 4 || !pickMesh) { down = null; return; }
      down = null;
      const r = renderer.domElement.getBoundingClientRect();
      ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, camera);
      const hit = ray.intersectObject(pickMesh, false)[0];
      if (!hit || hit.faceIndex == null) { setPicked(null); return; }
      const v = hit.faceIndex * 3; const o = owner.find((x) => v >= x.start && v < x.start + x.count);
      setPicked(o ? o.text : null);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    const ro = new ResizeObserver(() => { const s = size(); renderer.setSize(s.w, s.h); camera.aspect = s.w / s.h; camera.updateProjectionMatrix(); });
    ro.observe(el);
    let raf = 0;
    const tick = () => {
      // The switches are read each frame through a ref (no rebuild, never a stale value): only this level, labels, dimensions.
      if (plainMesh) plainMesh.visible = !(view.current.only && litMesh);
      labelGroup.visible = view.current.labels; dimGroup.visible = view.current.dims;
      controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(tick);
    };
    tick();
    const readyAt = requestAnimationFrame(() => setReady(true));
    return () => {
      cancelAnimationFrame(raf); cancelAnimationFrame(readyAt); ro.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp);
      scene.traverse((o) => {
        const m = o as THREE.Mesh; m.geometry?.dispose?.();
        const mat = m.material as (THREE.Material & { map?: THREE.Texture | null }) | undefined; mat?.map?.dispose?.(); mat?.dispose?.();
      });
      renderer.dispose(); renderer.domElement.remove(); api.current = null;
    };
    // The scene is rebuilt for a new model, part, lit level or mode; the switches are read each frame.
  }, [model, part, lit, mode]);

  // "Only this level" frames it (after the ref has the new value).
  useEffect(() => { const id = requestAnimationFrame(() => api.current?.fit()); return () => cancelAnimationFrame(id); }, [only]);

  const pill = { fontSize: 12.5, color: 'var(--c-text-2)', background: 'var(--c-surface)', px: 1, py: 0.25, borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)' };
  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', display: 'flex' }} data-testid="model3d">
      <Box ref={host} sx={{ flex: 1, minWidth: 0, minHeight: 0, cursor: 'grab', '&:active': { cursor: 'grabbing' }, touchAction: 'none' }} />
      {!ready && <Box role="status" sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, color: 'var(--c-text-2)' }}><CircularProgress size={18} /> Building the 3D view…</Box>}
      <Box sx={{ position: 'absolute', left: 12, top: 10, right: 12, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', pointerEvents: 'none' }}>
        {model && part && (
          <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v: Mode | null) => { if (v) setMode(v); }} sx={{ pointerEvents: 'auto', background: 'var(--c-surface)' }} aria-label="What to show in 3D">
            <ToggleButton value="part" data-testid="model3d-mode-part">This part</ToggleButton>
            <ToggleButton value="span" data-testid="model3d-mode-span">Whole structure</ToggleButton>
          </ToggleButtonGroup>
        )}
        <Typography sx={pill} data-testid="model3d-lit">
          {mode === 'part' && part ? `${part.label} · ${sizeWords(part)}` : model ? (lit ? `${lit} lit · ${litCount} of ${model.elements.length} pieces` : `${model.elements.length} pieces — this level is not in the model`) : ''}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: 'flex', gap: 0.5, pointerEvents: 'auto', flexWrap: 'wrap' }}>
          {mode === 'span' && lit && <Button size="small" variant={only ? 'contained' : 'outlined'} onClick={() => setOnly((x) => !x)} data-testid="model3d-only" aria-pressed={only}>Only this level</Button>}
          <Button size="small" variant={labels ? 'contained' : 'outlined'} onClick={() => setLabels((x) => !x)} data-testid="model3d-labels" aria-pressed={labels}>Labels</Button>
          <Button size="small" variant={dims ? 'contained' : 'outlined'} onClick={() => setDims((x) => !x)} data-testid="model3d-dims" aria-pressed={dims}>Dimensions</Button>
          <Button size="small" variant="outlined" onClick={() => api.current?.fit()} data-testid="model3d-fit">Fit</Button>
        </Box>
      </Box>
      <Typography data-testid="model3d-picked" sx={{ position: 'absolute', left: 12, bottom: 8, fontSize: 12.5, color: picked ? 'var(--c-text-1)' : 'var(--c-text-3)', background: 'var(--c-surface)', px: 1, borderRadius: 'var(--r-sm)', maxWidth: 'calc(100% - 24px)' }}>
        {picked ?? 'Drag to turn · scroll to zoom · right-drag to pan · click a piece to name it'}
      </Typography>
    </Box>
  );
}

export default Model3DView;
