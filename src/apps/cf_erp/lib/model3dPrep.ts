import * as THREE from 'three';
import type { Model3DElement } from '../api/drawings';
import { boxMatrix, localMember, localPlate, memberMatrix, plateMatrix } from './model3dGeometry';

/*
 * A MODEL MADE READY TO DRAW (user, 2026-11-08: "Same parts should of course be built once"; "Holes should just be an
 * easy construct… all we need is their locations and their dimensions").
 *
 * Every distinct shape is built ONCE in its own axes (a plate part by its part id; a member by its section; a loose box;
 * a stud) and each piece is that shape and a matrix. Holes are not cut: each shape keeps its holes' (x, y, Ø) and the
 * view draws them as small dark markers. Everything is typed arrays, so it can be built in a Web Worker
 * (model3dPrep.worker.ts), handed over without a copy and kept in IndexedDB (model3dPrepare.ts).
 *
 * Pure: no DOM, no React.
 */

/** Bumped whenever what is built changes, so no stale copy is read back from the browser's store. */
export const PREP_VERSION = 1;

export interface PrepGeom {
  key: string;
  /** non-indexed triangles: x, y, z per corner, and its normal */
  pos: Float32Array;
  nrm: Float32Array;
  /** its feature edges (pairs of points), for the outline of the lit pieces */
  edges: Float32Array;
  /** its box in its own axes: min x, y, z, max x, y, z */
  box: Float32Array;
  /** a plate's holes in its own axes (x, y, Ø per hole) and its thickness; empty for anything else */
  holes: Float32Array;
  t: number;
}

export interface PreparedModel {
  version: number;
  /** the model's fingerprint (hashModel) */
  hash: string;
  geoms: PrepGeom[];
  /** element i is geoms[elGeom[i]] placed by elMat[16 i …]; -1 = nothing to draw (no shape, or a NaN in it) */
  elGeom: Int32Array;
  /** column-major 4×4 per element (THREE.Matrix4.elements order) */
  elMat: Float32Array;
  /** each element's box in model mm: min x, y, z, max x, y, z (an empty box for nothing drawn) */
  elBox: Float32Array;
  holeCount: number;
  /** ms it took to build (0 when read from the store) */
  buildMs: number;
}

type El = Model3DElement & { part?: string };

const allFinite = (a: ArrayLike<number>) => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false; return true; };

/** cyrb53, two 32-bit lanes as hex: a fast fingerprint of a string. Pure. */
export function hashString(s: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed; let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/**
 * The model's fingerprint: its elements as drawn (a plate part's shape counted once, by its part id) and the build
 * version. Two models with the same fingerprint draw the same. Pure.
 */
export function hashModel(model: { elements: Model3DElement[] }): string {
  const parts = new Map<string, unknown>();
  const els = JSON.stringify(model.elements, function (this: unknown, k, v) {
    if (k === 'plate' && this && (this as El).part) {
      const id = (this as El).part as string;
      if (!parts.has(id)) parts.set(id, v);
      return undefined;
    }
    // Words that do not change the drawing stay out.
    if (k === 'src' || k === 'label') return undefined;
    return v;
  });
  const ps = JSON.stringify([...parts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  return `${PREP_VERSION}-${model.elements.length}-${hashString(els)}${hashString(ps, 7)}`;
}

/** The shape a piece is drawn with: its key (one per distinct shape) and how to build it. */
function shapeOf(e: El): { key: string; build: () => THREE.BufferGeometry[]; holes?: [number, number, number][]; t?: number; m: THREE.Matrix4 } | null {
  if (e.plate) {
    const pl = e.plate;
    const m = plateMatrix(pl);
    // A mirrored placement keeps its faces outward with its triangles turned the other way round.
    const mirror = m.determinant() < 0 ? '|m' : '';
    const id = e.part ? `p:${e.part}` : `q:${hashString(JSON.stringify([pl.pts, pl.t, pl.holes ?? [], pl.cuts ?? []]))}`;
    return { key: id + mirror, m, holes: pl.holes ?? [], t: pl.t, build: () => { const g = localPlate(pl, false); return g ? [mirror ? flipped(g) : g] : []; } };
  }
  if (e.box) return { key: 'box', m: boxMatrix(e.box), build: () => [new THREE.BoxGeometry(1, 1, 1)] };
  if (e.member) {
    const m = memberMatrix(e.member);
    if (!m) return null;
    const s = e.member.section;
    return { key: `m:${JSON.stringify(s)}`, m, build: () => localMember(s) };
  }
  return null;
}

/** The same triangles wound the other way (for a mirrored placement). */
function flipped(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const f = g.index ? g.toNonIndexed() : g;
  for (const name of ['position', 'normal']) {
    const a = f.attributes[name]?.array as Float32Array | undefined;
    if (!a) continue;
    for (let t = 0; t < a.length; t += 9) for (let k = 0; k < 3; k++) { const x = a[t + 3 + k]; a[t + 3 + k] = a[t + 6 + k]; a[t + 6 + k] = x; }
  }
  return f;
}

/** Many local geometries as one non-indexed position + normal pair. */
function flatten(list: THREE.BufferGeometry[]): { pos: Float32Array; nrm: Float32Array } {
  const flat = list.map((g) => { const f = g.index ? g.toNonIndexed() : g; if (!f.attributes.normal) f.computeVertexNormals(); return f; });
  const n = flat.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3); const nrm = new Float32Array(n * 3); let o = 0;
  for (const g of flat) { pos.set(g.attributes.position.array as ArrayLike<number>, o); nrm.set(g.attributes.normal.array as ArrayLike<number>, o); o += g.attributes.position.count * 3; }
  return { pos, nrm };
}

function makeGeom(key: string, list: THREE.BufferGeometry[], holes: [number, number, number][] | undefined, t: number | undefined): PrepGeom | null {
  if (!list.length) return null;
  const { pos, nrm } = flatten(list);
  if (!pos.length || !allFinite(pos)) return null;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const edges = new Float32Array(new THREE.EdgesGeometry(g, 30).attributes.position.array as ArrayLike<number>);
  g.computeBoundingBox(); const b = g.boundingBox!;
  const hs = (holes ?? []).filter((h) => h.length >= 3 && allFinite(h) && h[2] > 0);
  const hf = new Float32Array(hs.length * 3); hs.forEach((h, i) => hf.set(h.slice(0, 3), i * 3));
  return { key, pos, nrm, edges, box: new Float32Array([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]), holes: hf, t: Number.isFinite(t) ? (t as number) : 0 };
}

/** A box (min, max) through a matrix: the box of its 8 corners. */
export function boxThrough(local: ArrayLike<number>, m: ArrayLike<number>, out: Float32Array | number[], at = 0) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let c = 0; c < 8; c++) {
    const x = c & 1 ? local[3] : local[0]; const y = c & 2 ? local[4] : local[1]; const z = c & 4 ? local[5] : local[2];
    const wx = m[0] * x + m[4] * y + m[8] * z + m[12]; const wy = m[1] * x + m[5] * y + m[9] * z + m[13]; const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
    if (wx < x0) x0 = wx; if (wy < y0) y0 = wy; if (wz < z0) z0 = wz; if (wx > x1) x1 = wx; if (wy > y1) y1 = wy; if (wz > z1) z1 = wz;
  }
  out[at] = x0; out[at + 1] = y0; out[at + 2] = z0; out[at + 3] = x1; out[at + 4] = y1; out[at + 5] = z1;
}

/**
 * Build the model ready to draw, a slice at a time: a generator that yields how far it is (0…1) every `chunk` pieces and
 * returns the result — run straight through in a worker, or with a pause between slices on the page. Pure.
 */
export function* prepareSteps(model: { elements: Model3DElement[] }, hash: string, chunk = 400): Generator<number, PreparedModel, void> {
  const t0 = Date.now();
  const els = model.elements as El[]; const n = els.length;
  const geoms: PrepGeom[] = []; const byKey = new Map<string, number>();
  const elGeom = new Int32Array(n).fill(-1); const elMat = new Float32Array(n * 16); const elBox = new Float32Array(n * 6);
  let holeCount = 0;
  for (let i = 0; i < n; i++) {
    elBox.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], i * 6);
    try {
      const s = shapeOf(els[i]);
      if (s && allFinite(s.m.elements)) {
        let gi = byKey.get(s.key);
        if (gi === undefined) {
          let g: PrepGeom | null = null;
          try { g = makeGeom(s.key, s.build(), s.holes, s.t); } catch { g = null; }
          gi = g ? geoms.push(g) - 1 : -1;
          byKey.set(s.key, gi);
        }
        if (gi >= 0) {
          elGeom[i] = gi; elMat.set(s.m.elements, i * 16);
          boxThrough(geoms[gi].box, s.m.elements, elBox, i * 6);
          holeCount += geoms[gi].holes.length / 3;
        }
      }
    } catch { elGeom[i] = -1; }
    if ((i + 1) % chunk === 0) yield (i + 1) / n;
  }
  return { version: PREP_VERSION, hash, geoms, elGeom, elMat, elBox, holeCount, buildMs: Date.now() - t0 };
}

/** The same, all at once. Pure. */
export function prepareModel(model: { elements: Model3DElement[] }, hash = hashModel(model)): PreparedModel {
  const it = prepareSteps(model, hash, Number.MAX_SAFE_INTEGER);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}

/** The buffers a prepared model is made of (handed to the page without a copy). */
export function transferables(p: PreparedModel): ArrayBuffer[] {
  const out = new Set<ArrayBuffer>([p.elGeom.buffer, p.elMat.buffer, p.elBox.buffer] as ArrayBuffer[]);
  for (const g of p.geoms) for (const a of [g.pos, g.nrm, g.edges, g.box, g.holes]) out.add(a.buffer as ArrayBuffer);
  return [...out];
}

/**
 * A hole marker's matrix for each hole of element `el` (its world matrix `m`, column-major), written at `out[at…]`:
 * a unit cylinder along z scaled to the hole's Ø and the plate's thickness + 2 mm (it shows on both faces), at the
 * hole's centre half-way through. Returns the next free slot. Pure.
 */
export function holeMatrices(g: PrepGeom, m: ArrayLike<number>, out: Float32Array, at: number): number {
  const h = g.holes; const len = g.t + 2;
  for (let k = 0; k < h.length; k += 3) {
    const x = h[k]; const y = h[k + 1]; const r = h[k + 2] / 2; const z = g.t / 2; const o = at * 16;
    out[o] = m[0] * r; out[o + 1] = m[1] * r; out[o + 2] = m[2] * r; out[o + 3] = 0;
    out[o + 4] = m[4] * r; out[o + 5] = m[5] * r; out[o + 6] = m[6] * r; out[o + 7] = 0;
    out[o + 8] = m[8] * len; out[o + 9] = m[9] * len; out[o + 10] = m[10] * len; out[o + 11] = 0;
    out[o + 12] = m[0] * x + m[4] * y + m[8] * z + m[12]; out[o + 13] = m[1] * x + m[5] * y + m[9] * z + m[13]; out[o + 14] = m[2] * x + m[6] * y + m[10] * z + m[14]; out[o + 15] = 1;
    at++;
  }
  return at;
}
