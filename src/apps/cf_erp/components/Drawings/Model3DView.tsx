import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Model3D, Model3DElement } from '../../api/drawings';
import { isLit, litMark } from '../../lib/model3d';

/**
 * THE 3D VIEW OF A LINE (user, 2026-10-31: "a 3D version in the tool to show the diagram in 3D").
 *
 * Draws the line's model (`cf-erp-model3d/1`, kept with its standard drawing — services/model3dService.js) the way the
 * takeoff tool draws its model.json: members as their plates (an I or a box from its flanges and webs, a pipe as a
 * tube) along their axis, shaped plates (gussets) as their outline extruded, other plates as boxes. The level that is open lights up (its elements, by drawing mark); the rest
 * is shown faint, or hidden with "Only this level". Drag to turn, scroll to zoom, right-drag to pan; click a piece to
 * name it.
 */

const LIT = 0xd9822b;      // the open level
const STEEL = 0x8a99ab;    // everything else, when nothing is lit
const FAINT = 0xb9c2cc;

/** The meshes of one element, in model millimetres (z up). */
function elementGeometries(e: Model3DElement): THREE.BufferGeometry[] {
  if (e.plate) {
    // A shaped plate (a gusset at its real outline): the outline extruded to its thickness, then put in place.
    const pl = e.plate;
    if (pl.pts.length < 3) return [];
    const shape = new THREE.Shape(pl.pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: pl.t, bevelEnabled: false, curveSegments: 1 });
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
  // The member's own frame: x along it, y = its depth direction (`up`, made square to the axis), z the width.
  const up = new THREE.Vector3(...m.up);
  up.sub(axis.clone().multiplyScalar(up.dot(axis)));
  if (up.lengthSq() < 1e-9) up.set(axis.z === 0 ? 0 : 1, 0, axis.z === 0 ? 1 : 0);
  up.normalize();
  const side = new THREE.Vector3().crossVectors(axis, up).normalize();
  const basis = new THREE.Matrix4().makeBasis(axis, up, side);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const place = (g: THREE.BufferGeometry) => { g.applyMatrix4(basis); g.translate(mid.x, mid.y, mid.z); return g; };
  const plate = (len: number, depth: number, width: number, dy: number, dz: number) => {
    const g = new THREE.BoxGeometry(len, depth, width); g.translate(0, dy, dz); return place(g);
  };
  const s = m.section;
  if (s.type === 'pipe') {
    const g = new THREE.CylinderGeometry(s.d / 2, s.d / 2, L, 20, 1, false);
    g.rotateZ(-Math.PI / 2);   // cylinder along x
    return [place(g)];
  }
  const h = s.h;
  if (s.type === 'I') {
    const webH = h - s.tTop - s.tBot;
    return [
      plate(L, s.tTop, s.bTop, h / 2 - s.tTop / 2, 0),
      plate(L, s.tBot, s.bBot, -h / 2 + s.tBot / 2, 0),
      plate(L, webH, s.tw, (s.tBot - s.tTop) / 2, 0),
    ];
  }
  // box: two webs `w` apart (over the webs), a top and a bottom plate (a narrow one between the webs, a wide one on them)
  const w = s.w;
  const webBot = -h / 2 + (s.bBot > w ? s.tBot : 0); const webTop = h / 2 - (s.bTop > w ? s.tTop : 0);
  const webH = webTop - webBot; const webY = (webTop + webBot) / 2;
  return [
    plate(L, s.tTop, s.bTop, h / 2 - s.tTop / 2, 0),
    plate(L, s.tBot, s.bBot, -h / 2 + s.tBot / 2, 0),
    plate(L, webH, s.tw, webY, w / 2 - s.tw / 2),
    plate(L, webH, s.tw, webY, -w / 2 + s.tw / 2),
  ];
}

export function Model3DView({ model, marks }: { model: Model3D; marks: (string | null | undefined)[] }) {
  const host = useRef<HTMLDivElement | null>(null);
  const lit = useMemo(() => litMark(model, marks), [model, marks]);
  const [only, setOnly] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const litCount = useMemo(() => model.elements.filter((e) => isLit(e, lit)).length, [model, lit]);
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

    // One merged mesh per look (lit / plain / faint), plus a hidden pick index per element.
    const groups: Record<'lit' | 'plain', THREE.BufferGeometry[]> = { lit: [], plain: [] };
    const owner: { start: number; count: number; e: Model3DElement }[] = [];
    const pickGeoms: THREE.BufferGeometry[] = [];
    for (const e of model.elements) {
      const gs = elementGeometries(e);
      const bucket = isLit(e, lit) ? 'lit' : 'plain';
      for (const g of gs) { groups[bucket].push(g.toNonIndexed()); }
      for (const g of gs) { const n = g.toNonIndexed(); owner.push({ start: pickGeoms.reduce((s, x) => s + x.attributes.position.count, 0), count: n.attributes.position.count, e }); pickGeoms.push(n); }
    }
    const merge = (list: THREE.BufferGeometry[]) => {
      if (!list.length) return null;
      const total = list.reduce((s, g) => s + g.attributes.position.count, 0);
      const pos = new Float32Array(total * 3); let o = 0;
      for (const g of list) { pos.set(g.attributes.position.array as Float32Array, o * 3); o += g.attributes.position.count; }
      const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.computeVertexNormals();
      return out;
    };
    const litGeo = merge(groups.lit); const plainGeo = merge(groups.plain);
    const litMesh = litGeo ? new THREE.Mesh(litGeo, new THREE.MeshLambertMaterial({ color: LIT, side: THREE.DoubleSide })) : null;
    const plainMat = new THREE.MeshLambertMaterial({ color: lit ? FAINT : STEEL, transparent: !!lit, opacity: lit ? 0.28 : 1, depthWrite: !lit, side: THREE.DoubleSide });
    const plainMesh = plainGeo ? new THREE.Mesh(plainGeo, plainMat) : null;
    if (plainMesh) scene.add(plainMesh);
    if (litMesh) scene.add(litMesh);
    const edges = litGeo ? new THREE.LineSegments(new THREE.EdgesGeometry(litGeo, 30), new THREE.LineBasicMaterial({ color: 0x7a3e0c })) : null;
    if (edges) scene.add(edges);
    const pickGeo = merge(pickGeoms);
    const pickMesh = pickGeo ? new THREE.Mesh(pickGeo, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })) : null;
    if (pickMesh) scene.add(pickMesh);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.12; controls.screenSpacePanning = true;

    // Frame the lit level (or the whole model) from a three-quarter view.
    const fit = () => {
      const target = litMesh && (only || litCount < model.elements.length) ? litGeo! : (plainGeo ?? litGeo!);
      const bb = new THREE.Box3();
      if (litGeo) bb.union(new THREE.Box3().setFromBufferAttribute(litGeo.attributes.position as THREE.BufferAttribute));
      if (!litGeo || !only) {
        if (!litGeo && plainGeo) bb.union(new THREE.Box3().setFromBufferAttribute(plainGeo.attributes.position as THREE.BufferAttribute));
      }
      if (bb.isEmpty() && target) bb.setFromBufferAttribute(target.attributes.position as THREE.BufferAttribute);
      const c = bb.getCenter(new THREE.Vector3()); const r = Math.max(bb.getSize(new THREE.Vector3()).length() / 2, 500);
      const dist = r / Math.sin((camera.fov * Math.PI) / 360) * 1.05;
      camera.position.copy(c).add(new THREE.Vector3(-0.55, -0.75, 0.42).normalize().multiplyScalar(dist));
      camera.near = dist / 200; camera.far = dist * 20; camera.updateProjectionMatrix();
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
      setPicked(o ? `${o.e.label ?? o.e.mark}${o.e.mark ? ` · ${o.e.mark}` : ''}` : null);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    const ro = new ResizeObserver(() => { const s = size(); renderer.setSize(s.w, s.h); camera.aspect = s.w / s.h; camera.updateProjectionMatrix(); });
    ro.observe(el);
    let raf = 0;
    const tick = () => {
      if (plainMesh) plainMesh.visible = !(only && litMesh);
      controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(tick);
    };
    tick();
    setReady(true);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp);
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mat = m.material as THREE.Material | undefined; mat?.dispose?.(); });
      renderer.dispose(); renderer.domElement.remove(); api.current = null;
    };
    // `only` is read each frame (no rebuild); the scene is rebuilt for a new model or a new lit level.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, lit]);

  // "Only this level" frames it.
  useEffect(() => { api.current?.fit(); }, [only]);

  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', display: 'flex' }} data-testid="model3d">
      <Box ref={host} sx={{ flex: 1, minWidth: 0, minHeight: 0, cursor: 'grab', '&:active': { cursor: 'grabbing' }, touchAction: 'none' }} />
      {!ready && <Box role="status" sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, color: 'var(--c-text-2)' }}><CircularProgress size={18} /> Building the 3D view…</Box>}
      <Box sx={{ position: 'absolute', left: 12, top: 10, right: 12, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', pointerEvents: 'none' }}>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', background: 'var(--c-surface)', px: 1, py: 0.25, borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)' }} data-testid="model3d-lit">
          {lit ? `${lit} lit · ${litCount} of ${model.elements.length} pieces` : `${model.elements.length} pieces — this level is not in the model`}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: 'flex', gap: 0.5, pointerEvents: 'auto' }}>
          {lit && <Button size="small" variant={only ? 'contained' : 'outlined'} onClick={() => setOnly((x) => !x)} data-testid="model3d-only">Only this level</Button>}
          <Button size="small" variant="outlined" onClick={() => api.current?.fit()} data-testid="model3d-fit">Fit</Button>
        </Box>
      </Box>
      <Typography sx={{ position: 'absolute', left: 12, bottom: 8, fontSize: 12, color: 'var(--c-text-3)', background: 'var(--c-surface)', px: 1, borderRadius: 'var(--r-sm)' }}>
        {picked ?? 'Drag to turn · scroll to zoom · right-drag to pan · click a piece to name it'}
      </Typography>
    </Box>
  );
}

export default Model3DView;
