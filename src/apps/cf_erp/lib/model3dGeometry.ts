import * as THREE from 'three';
import type { Model3DElement, Model3DSection } from '../api/drawings';

/*
 * The 3D views' shared geometry (components/Drawings/Model3DView.tsx, components/Production/Progress3D.tsx): the meshes
 * of one model element, merging many into one geometry, and a label sprite.
 *
 * Every shape is built in its OWN axes first (a plate in its outline's x, y with its thickness along z; a member along x,
 * 1 m long, centred) and placed by a matrix — so the same part is built once and drawn many times
 * (lib/model3dPrep.ts; user, 2026-11-08: "Same parts should of course be built once").
 */

const finite = (g: THREE.BufferGeometry) => {
  const a = g.attributes.position?.array;
  if (!a) return false;
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  return true;
};
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

type Plate = NonNullable<Model3DElement['plate']>;
type PlateShape = Pick<Plate, 'pts' | 'holes' | 'cuts' | 't'>;

/** A member's shapes are built this long (mm) along x and stretched to the member's length by its matrix. */
export const MEMBER_UNIT = 1000;

/**
 * A plate in its own axes: the outline (and its cut-outs) extruded `t` along z. Its bolt holes go right through only
 * when `withHoles` (one part on its own, a selection); the overview draws them as markers instead.
 */
export function localPlate(pl: PlateShape, withHoles: boolean): THREE.BufferGeometry | null {
  if (!pl.pts || pl.pts.length < 3) return null;
  const shape = new THREE.Shape(pl.pts.map(([x, y]) => new THREE.Vector2(x, y)));
  if (withHoles) for (const [hx, hy, hd] of pl.holes ?? []) shape.holes.push(new THREE.Path().absarc(hx, hy, hd / 2, 0, Math.PI * 2, true));
  for (const c of pl.cuts ?? []) shape.holes.push(new THREE.Path(c.map(([x, y]) => new THREE.Vector2(x, y))));
  return new THREE.ExtrudeGeometry(shape, { depth: pl.t, bevelEnabled: false, curveSegments: 8 });
}

/** A plate's matrix: its outline's x along u, y along v, thickness along w, (0,0,0) at o. */
export function plateMatrix(pl: Pick<Plate, 'o' | 'u' | 'v' | 'w'>): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...pl.u), new THREE.Vector3(...pl.v), new THREE.Vector3(...pl.w));
  return m.setPosition(pl.o[0], pl.o[1], pl.o[2]);
}

/** A member's section in its own axes: MEMBER_UNIT long along x, centred; its depth along y (up), its width along z. */
export function localMember(s: Model3DSection): THREE.BufferGeometry[] {
  const L = MEMBER_UNIT;
  const plate = (len: number, depth: number, width: number, dy: number, dz: number) => { const g = new THREE.BoxGeometry(len, depth, width); g.translate(0, dy, dz); return g; };
  if (s.type === 'pipe') { const g = new THREE.CylinderGeometry(s.d / 2, s.d / 2, L, s.d < 40 ? 6 : 20, 1, false); g.rotateZ(-Math.PI / 2); return [g]; }
  const h = s.h;
  // A section given only by its outside sizes (a bearing block, a pedestal) is drawn solid.
  const solid = s.type === 'box' ? ![s.tTop, s.tBot, s.tw].every(num) : s.type === 'I' ? ![s.tTop, s.tBot, s.tw, s.bTop, s.bBot].every(num) : false;
  if (solid) {
    const sw = s.type === 'box' ? s.w : undefined;
    const w = num(sw) ? sw : num(s.bTop) ? s.bTop : h;
    return num(h) && num(w) ? [plate(L, h, w, 0, 0)] : [];
  }
  if (s.type === 'I') {
    const webH = h - s.tTop - s.tBot;
    return [plate(L, s.tTop, s.bTop, h / 2 - s.tTop / 2, 0), plate(L, s.tBot, s.bBot, -h / 2 + s.tBot / 2, 0), plate(L, webH, s.tw, (s.tBot - s.tTop) / 2, 0)];
  }
  const w = s.w;
  const webBot = -h / 2 + (s.bBot > w ? s.tBot : 0); const webTop = h / 2 - (s.bTop > w ? s.tTop : 0);
  const webH = webTop - webBot; const webY = (webTop + webBot) / 2;
  return [plate(L, s.tTop, s.bTop, h / 2 - s.tTop / 2, 0), plate(L, s.tBot, s.bBot, -h / 2 + s.tBot / 2, 0), plate(L, webH, s.tw, webY, w / 2 - s.tw / 2), plate(L, webH, s.tw, webY, -w / 2 + s.tw / 2)];
}

/** A member's matrix: x along a→b stretched to its length, y its `up` (square to the axis), z the side; null when it has no length. */
export function memberMatrix(m: NonNullable<Model3DElement['member']>): THREE.Matrix4 | null {
  const a = new THREE.Vector3(...m.a); const b = new THREE.Vector3(...m.b);
  const axis = b.clone().sub(a); const L = axis.length();
  if (!(L >= 1)) return null;
  axis.normalize();
  const up = new THREE.Vector3(...m.up);
  up.sub(axis.clone().multiplyScalar(up.dot(axis)));
  if (up.lengthSq() < 1e-9) up.set(axis.z === 0 ? 0 : 1, 0, axis.z === 0 ? 1 : 0);
  up.normalize();
  const side = new THREE.Vector3().crossVectors(axis, up).normalize();
  const mid = a.clone().add(b).multiplyScalar(0.5);
  return new THREE.Matrix4().makeBasis(axis.multiplyScalar(L / MEMBER_UNIT), up, side).setPosition(mid);
}

/** A loose box's matrix: the unit cube stretched to its size, at its centre. */
export const boxMatrix = (b: NonNullable<Model3DElement['box']>) => new THREE.Matrix4().makeScale(b.size[0], b.size[1], b.size[2]).setPosition(b.c[0], b.c[1], b.c[2]);

/**
 * The meshes of one element, in model millimetres (z up), with every hole cut. A mesh with a NaN corner is left out: one
 * piece with a missing size must never blank the whole view (user, 2026-11-07: "nothing is coming in the 3D view" — the
 * OWG's 4 POT bearings were boxes with no wall thickness, and the scene's bounds became NaN).
 */
export function elementGeometries(e: Model3DElement): THREE.BufferGeometry[] {
  let out: THREE.BufferGeometry[];
  try { out = rawGeometries(e); } catch { return []; }
  return out.filter(finite);
}

function rawGeometries(e: Model3DElement): THREE.BufferGeometry[] {
  if (e.plate) {
    const g = localPlate(e.plate, true);
    return g ? [g.applyMatrix4(plateMatrix(e.plate))] : [];
  }
  if (e.box) return [new THREE.BoxGeometry(1, 1, 1).applyMatrix4(boxMatrix(e.box))];
  if (!e.member) return [];
  const m = memberMatrix(e.member);
  return m ? localMember(e.member.section).map((g) => g.applyMatrix4(m)) : [];
}

export const merge = (list: THREE.BufferGeometry[]) => {
  if (!list.length) return null;
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = flat.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3); let o = 0;
  for (const g of flat) { pos.set(g.attributes.position.array as Float32Array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.computeVertexNormals();
  return out;
};

/** A text label that always faces the camera; `h` = its height in model mm. */
export function label(text: string, h: number, color = '#1d2733', bg = 'rgba(255,255,255,0.85)') {
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
