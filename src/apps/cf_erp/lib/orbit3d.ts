import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/*
 * The 3D views' camera handling, shared by components/Drawings/Model3DView.tsx and components/Production/Progress3D.tsx
 * (user, 2026-11-01: "mouse click + Ctrl to move around — right now it is pinned to the centre"):
 *   left drag                     turn (about the orbit centre)
 *   Ctrl / Shift / ⌘ + left drag  pan            middle drag, right drag   pan
 *   wheel                         zoom towards the cursor (not the centre)
 *   click                         pick            double-click a piece      it becomes the centre, framed
 *   double-click empty space      fit everything
 */

/** OrbitControls set up the same way in every 3D view. */
export function createOrbit(camera: THREE.PerspectiveCamera, dom: HTMLElement): OrbitControls {
  const c = new OrbitControls(camera, dom);
  c.enableDamping = true; c.dampingFactor = 0.12; c.screenSpacePanning = true;
  // Middle drag pans (three's default is dolly); OrbitControls turns a left drag with Ctrl / Shift / ⌘ into a pan itself.
  c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
  c.zoomToCursor = true;
  // Zoom in as far as you like (user, 2026-11-07: "it is not letting me zoom beyond this"). Two things stopped it: the near
  // plane stayed where the first fit put it (1/300 of a whole span's distance, about 270 mm, so close steel was cut away),
  // and a dolly only halves the distance to the orbit centre, so it stalls there. The near plane now follows the camera,
  // and close to the centre a wheel step in carries the centre forward with the camera.
  c.addEventListener('change', () => {
    const d = camera.position.distanceTo(c.target);
    const near = Math.max(1, Math.min(d / 50, camera.far / 1000));
    if (Math.abs(near - camera.near) / camera.near > 0.2) { camera.near = near; camera.updateProjectionMatrix(); }
  });
  dom.addEventListener('wheel', (ev) => {
    if (ev.deltaY >= 0) return;
    const d = camera.position.distanceTo(c.target);
    if (d > CLOSE_MM) return;
    const step = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(Math.max(20, d * 0.6));
    c.target.add(step); camera.position.add(step);
  }, { passive: true, capture: true });
  return c;
}

/** Closer than this to the orbit centre, zooming in moves the centre forward too. */
const CLOSE_MM = 400;

/**
 * Frame a box: the camera looks at its centre from `dir` (default: the current viewing direction, so a double-click
 * does not swing the model round), far enough back to see all of it; the orbit centre moves to it.
 */
export function frameBox(camera: THREE.PerspectiveCamera, controls: OrbitControls, box: THREE.Box3, opts: { dir?: THREE.Vector3; margin?: number } = {}) {
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 200);
  const dist = (r / Math.sin((camera.fov * Math.PI) / 360)) * (opts.margin ?? 1.15);
  const dir = (opts.dir ?? camera.position.clone().sub(controls.target)).clone();
  if (dir.lengthSq() < 1e-9) dir.set(-0.55, -0.75, 0.48);
  camera.position.copy(c).add(dir.normalize().multiplyScalar(dist));
  camera.near = dist / 300; camera.far = dist * 30; camera.updateProjectionMatrix();
  controls.target.copy(c); controls.update();
}

/** The default three-quarter view direction. */
export const VIEW_DIR = new THREE.Vector3(-0.55, -0.75, 0.48);

/**
 * Clicks and double-clicks on a canvas, told apart from drags (a press that moves under 4 px is a click). Each gets
 * the pointer in normalised device coordinates. Returns the unbind function.
 */
export function bindClicks(dom: HTMLElement, on: { click?: (ndc: THREE.Vector2, ev: PointerEvent) => void; dblclick?: (ndc: THREE.Vector2, ev: MouseEvent) => void }) {
  let down: [number, number] | null = null;
  const ndc = (ev: MouseEvent) => { const r = dom.getBoundingClientRect(); return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); };
  const onDown = (ev: PointerEvent) => { down = ev.button === 0 ? [ev.clientX, ev.clientY] : null; };
  const onUp = (ev: PointerEvent) => {
    const d = down; down = null;
    if (!d || ev.button !== 0 || Math.hypot(ev.clientX - d[0], ev.clientY - d[1]) > 4) return;
    on.click?.(ndc(ev), ev);
  };
  const onDbl = (ev: MouseEvent) => { ev.preventDefault(); on.dblclick?.(ndc(ev), ev); };
  // A middle press pans; it must not start the browser's auto-scroll.
  const onMouseDown = (ev: MouseEvent) => { if (ev.button === 1) ev.preventDefault(); };
  dom.addEventListener('mousedown', onMouseDown);
  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('dblclick', onDbl);
  return () => { dom.removeEventListener('mousedown', onMouseDown); dom.removeEventListener('pointerdown', onDown); dom.removeEventListener('pointerup', onUp); dom.removeEventListener('dblclick', onDbl); };
}

/** A highlight material: a strong colour that glows a little, drawn just in front of the steel it covers. */
export const HIGHLIGHT = 0xd6338c;
export function highlightMaterial() {
  return new THREE.MeshLambertMaterial({ color: HIGHLIGHT, emissive: new THREE.Color(HIGHLIGHT), emissiveIntensity: 0.35, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}
