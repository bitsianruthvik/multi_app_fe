import * as THREE from 'three';
import type { Model3D } from '../api/drawings';
import { localPlate } from './model3dGeometry';
import { holeMatrices, type PreparedModel, type PrepGeom } from './model3dPrep';

/*
 * Drawing a prepared model (lib/model3dPrep.ts) with three.js: one InstancedMesh per distinct shape, the holes as one
 * InstancedMesh of small dark cylinders, the lit pieces' outlines, picking by instance, and — for a selection — the
 * pieces with their holes truly cut. Shared by components/Drawings/Model3DView.tsx and components/Production/Progress3D.tsx.
 */

/** One piece to draw: element `el` of the prepared model, moved by `pre` (a copy of a line in Progress3D), known to the caller as `tag`. */
export interface Placement { el: number; tag: number; pre?: THREE.Matrix4 | null; /** in the piece's own axes, after its placement (a band of it: sliceMatrix) */ post?: THREE.Matrix4 | null }

/** A shape's geometry (sharing the prepared arrays: no copy). */
export function geometryOf(g: PrepGeom): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(g.nrm, 3));
  geo.boundingBox = new THREE.Box3(new THREE.Vector3(g.box[0], g.box[1], g.box[2]), new THREE.Vector3(g.box[3], g.box[4], g.box[5]));
  geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
  return geo;
}

const M = new THREE.Matrix4();
/** Element `el`'s world matrix (after `pre`), into `out` at `at` (16 numbers). */
function worldMatrix(prep: PreparedModel, el: number, pre: THREE.Matrix4 | null | undefined, out: Float32Array, at: number, post?: THREE.Matrix4 | null) {
  if (!pre && !post) { out.set(prep.elMat.subarray(el * 16, el * 16 + 16), at); return; }
  M.fromArray(prep.elMat, el * 16);
  if (pre) M.premultiply(pre);
  if (post) M.multiply(post);
  M.toArray(out, at);
}

/**
 * Band i of n of a piece, along its longest own axis (2026-11-14, the vendor view: two vendors on one piece share it
 * 50-50, three a third each). The matrix squeezes the piece into its band; use it as a Placement's post.
 */
export function sliceMatrix(prep: PreparedModel, el: number, i: number, n: number): THREE.Matrix4 | null {
  const g = prep.elGeom[el];
  if (n <= 1 || g === undefined || g < 0) return null;
  const b = prep.geoms[g].box;
  const len = [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
  const ax = len[0] >= len[1] && len[0] >= len[2] ? 0 : len[1] >= len[2] ? 1 : 2;
  const lo = b[ax]; const w = len[ax] / n;
  const sc = [1, 1, 1]; sc[ax] = 1 / n;
  const to = [0, 0, 0]; to[ax] = lo + i * w;
  const back = [0, 0, 0]; back[ax] = -lo;
  return new THREE.Matrix4().makeTranslation(to[0], to[1], to[2])
    .multiply(new THREE.Matrix4().makeScale(sc[0], sc[1], sc[2]))
    .multiply(new THREE.Matrix4().makeTranslation(back[0], back[1], back[2]));
}

/**
 * The pieces as InstancedMeshes, one per distinct shape (`geos` keeps each shape's geometry for the scene). Each mesh's
 * `userData.tags[instanceId]` is the piece's tag.
 */
export function instancedMeshes(prep: PreparedModel, items: Placement[], material: THREE.Material, geos: Map<number, THREE.BufferGeometry>): THREE.InstancedMesh[] {
  const byGeom = new Map<number, Placement[]>();
  for (const it of items) {
    const g = prep.elGeom[it.el];
    if (g === undefined || g < 0) continue;
    const list = byGeom.get(g); if (list) list.push(it); else byGeom.set(g, [it]);
  }
  const out: THREE.InstancedMesh[] = [];
  for (const [g, list] of byGeom) {
    let geo = geos.get(g); if (!geo) { geo = geometryOf(prep.geoms[g]); geos.set(g, geo); }
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    const arr = mesh.instanceMatrix.array as Float32Array; const tags = new Int32Array(list.length);
    list.forEach((it, i) => { worldMatrix(prep, it.el, it.pre, arr, i * 16, it.post); tags[i] = it.tag; });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.tags = tags;
    mesh.computeBoundingSphere(); mesh.computeBoundingBox();
    out.push(mesh);
  }
  return out;
}

const W = new Float32Array(16);
/** How many hole markers these pieces have. */
export function holeCountOf(prep: PreparedModel, items: Placement[]) {
  let n = 0;
  for (const it of items) { const g = prep.elGeom[it.el]; if (g >= 0) n += prep.geoms[g].holes.length / 3; }
  return n;
}

let markerGeo: THREE.BufferGeometry | null = null;
/**
 * The one hole marker: two unit octagons, at z = ±½ (scaled to stand 1 mm proud of each face) — 12 triangles, no
 * walls (they would be 1 mm tall). Kept for the page's life.
 */
function marker() {
  if (markerGeo) return markerGeo;
  const pos: number[] = []; const nrm: number[] = []; const S = 8;
  for (const z of [-0.5, 0.5]) {
    const ring = Array.from({ length: S }, (_, k) => [Math.cos((k / S) * Math.PI * 2), Math.sin((k / S) * Math.PI * 2)]);
    for (let k = 1; k < S - 1; k++) {
      const tri = z > 0 ? [ring[0], ring[k], ring[k + 1]] : [ring[0], ring[k + 1], ring[k]];
      for (const [x, y] of tri) { pos.push(x, y, z); nrm.push(0, 0, Math.sign(z)); }
    }
  }
  markerGeo = new THREE.BufferGeometry();
  markerGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  markerGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  markerGeo.computeBoundingSphere();
  return markerGeo;
}

/** The largest hole of these pieces (mm), to tell when the holes are big enough on screen to draw. */
export function largestHole(prep: PreparedModel, items: Placement[]): number {
  const seen = new Set<number>(); let d = 0;
  for (const it of items) {
    const g = prep.elGeom[it.el]; if (g < 0 || seen.has(g)) continue; seen.add(g);
    const h = prep.geoms[g].holes; for (let k = 2; k < h.length; k += 3) if (h[k] > d) d = h[k];
  }
  return d;
}

/** How many screen pixels `mm` spans at `distance` from a camera (its view height in pixels). */
export const pixelsOf = (mm: number, distance: number, camera: THREE.PerspectiveCamera, viewHeightPx: number) =>
  (mm * viewHeightPx) / (2 * Math.max(distance, 1e-6) * Math.tan((camera.fov * Math.PI) / 360));

/** Under this many pixels across, a hole is a speck: the markers are not drawn (whole-span views stay smooth). */
export const HOLE_MIN_PX = 1.5;

/** The pieces' holes as one InstancedMesh of dark cylinders standing just proud of both faces; null when there are none. Not pickable. */
export function holeMarkers(prep: PreparedModel, items: Placement[], material: THREE.Material): THREE.InstancedMesh | null {
  const n = holeCountOf(prep, items);
  if (!n) return null;
  const mesh = new THREE.InstancedMesh(marker(), material, n);
  const arr = mesh.instanceMatrix.array as Float32Array; let at = 0;
  for (const it of items) {
    const g = prep.elGeom[it.el]; if (g < 0 || !prep.geoms[g].holes.length) continue;
    worldMatrix(prep, it.el, it.pre, W, 0, it.post);
    at = holeMatrices(prep.geoms[g], W, arr, at);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.raycast = () => {};
  // The shared marker geometry must outlive this scene.
  mesh.userData.keepGeometry = true;
  return mesh;
}

/** The pieces' outlines (feature edges) as one LineSegments position array, in model mm. */
export function edgeLines(prep: PreparedModel, items: Placement[]): Float32Array {
  let n = 0;
  for (const it of items) { const g = prep.elGeom[it.el]; if (g >= 0) n += prep.geoms[g].edges.length; }
  const out = new Float32Array(n); let o = 0;
  for (const it of items) {
    const g = prep.elGeom[it.el]; if (g < 0) continue;
    worldMatrix(prep, it.el, it.pre, W, 0, it.post);
    const e = prep.geoms[g].edges;
    for (let k = 0; k < e.length; k += 3) {
      const x = e[k], y = e[k + 1], z = e[k + 2];
      out[o++] = W[0] * x + W[4] * y + W[8] * z + W[12]; out[o++] = W[1] * x + W[5] * y + W[9] * z + W[13]; out[o++] = W[2] * x + W[6] * y + W[10] * z + W[14];
    }
  }
  return out;
}

/** Element `el`'s box in model mm (moved by `pre`); empty when it is not drawn. */
export function pieceBox(prep: PreparedModel, el: number, pre?: THREE.Matrix4 | null): THREE.Box3 {
  const b = prep.elBox; const i = el * 6;
  const box = new THREE.Box3();
  if (prep.elGeom[el] < 0 || !(b[i] <= b[i + 3])) return box;
  box.min.set(b[i], b[i + 1], b[i + 2]); box.max.set(b[i + 3], b[i + 4], b[i + 5]);
  return pre ? box.applyMatrix4(pre) : box;
}

/** The box round several pieces. */
export function piecesBox(prep: PreparedModel, els: Iterable<number>, pre?: THREE.Matrix4 | null): THREE.Box3 {
  const box = new THREE.Box3();
  for (const el of els) { const b = pieceBox(prep, el, pre); if (!b.isEmpty()) box.union(b); }
  return box;
}

const cutCache = new WeakMap<PreparedModel, Map<number, THREE.BufferGeometry | null>>();
/** A shape with its holes truly cut, in its own axes (built once per shape, on demand). */
function cutLocal(prep: PreparedModel, model: Model3D, el: number): THREE.BufferGeometry | null {
  const g = prep.elGeom[el]; if (g < 0) return null;
  let cache = cutCache.get(prep); if (!cache) { cache = new Map(); cutCache.set(prep, cache); }
  if (cache.has(g)) return cache.get(g) ?? null;
  const pl = model.elements[el]?.plate; const shape = prep.geoms[g];
  let geo: THREE.BufferGeometry | null = null;
  try {
    geo = pl && shape.holes.length ? localPlate(pl, true) : null;
    if (geo) geo = geo.index ? geo.toNonIndexed() : geo;
    const a = geo?.attributes.position.array;
    if (a) for (let k = 0; k < a.length; k++) if (!Number.isFinite(a[k])) { geo = null; break; }
  } catch { geo = null; }
  // Anything without holes is its prepared shape.
  if (!geo) { geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(shape.pos, 3)); }
  cache.set(g, geo);
  return geo;
}

/** Several pieces as one geometry, holes cut, in model mm (a selection's highlight); its outline too. Null when nothing is drawn. */
export function cutPieces(prep: PreparedModel, model: Model3D, items: Placement[]): { mesh: THREE.BufferGeometry; edges: THREE.BufferGeometry } | null {
  const parts: { pos: ArrayLike<number>; m: Float32Array }[] = []; let n = 0;
  const edgeParts: { e: Float32Array; m: Float32Array }[] = []; let ne = 0;
  const edgeCache = new Map<THREE.BufferGeometry, Float32Array>();
  for (const it of items) {
    const g = cutLocal(prep, model, it.el); if (!g) continue;
    const m = new Float32Array(16); worldMatrix(prep, it.el, it.pre, m, 0);
    const pos = g.attributes.position.array; parts.push({ pos, m }); n += pos.length;
    let e = edgeCache.get(g); if (!e) { e = new Float32Array(new THREE.EdgesGeometry(g, 30).attributes.position.array as ArrayLike<number>); edgeCache.set(g, e); }
    edgeParts.push({ e, m }); ne += e.length;
  }
  if (!n) return null;
  const through = (src: ArrayLike<number>, m: Float32Array, out: Float32Array, o: number) => {
    for (let k = 0; k < src.length; k += 3) {
      const x = src[k], y = src[k + 1], z = src[k + 2];
      out[o++] = m[0] * x + m[4] * y + m[8] * z + m[12]; out[o++] = m[1] * x + m[5] * y + m[9] * z + m[13]; out[o++] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
    return o;
  };
  const pos = new Float32Array(n); let o = 0; for (const p of parts) o = through(p.pos, p.m, pos, o);
  const ep = new Float32Array(ne); o = 0; for (const p of edgeParts) o = through(p.e, p.m, ep, o);
  const mesh = new THREE.BufferGeometry(); mesh.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mesh.computeVertexNormals(); mesh.computeBoundingBox();
  const edges = new THREE.BufferGeometry(); edges.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  return { mesh, edges };
}

/** The pieces under a ray, nearest first: each hit's tag (several meshes, one InstancedMesh per shape). */
export function pickTags(ray: THREE.Raycaster, meshes: THREE.Object3D[]): number[] {
  const out: number[] = [];
  for (const hit of ray.intersectObjects(meshes, false)) {
    const tags = (hit.object as THREE.InstancedMesh).userData?.tags as Int32Array | undefined;
    if (tags && hit.instanceId != null && hit.instanceId < tags.length) out.push(tags[hit.instanceId]);
  }
  return out;
}
