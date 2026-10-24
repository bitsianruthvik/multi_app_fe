// Run from multi_app_fe: node scripts/cf_erp_motion_test.mjs
// The motion foundation (src/apps/cf_erp/motion, TM/CF_ERP_MOTION_SPEC.md), rendered in jsdom: reduced motion read
// safely (no matchMedia → off, never throws), CountUp shows the final value (at once, and for screen readers while it
// counts), FlashOnChange flashes on a change only, Stagger caps at N, celebrate / nudge do nothing in jsdom and under
// reduced motion and clean up after themselves elsewhere, and the cf_erp MUI theme carries the motion overrides.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  try { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true }); } catch { /* skip */ }
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// No matchMedia to begin with (plain jsdom); tests install one when they need it.
delete dom.window.matchMedia;

const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client';
      export { React, createRoot };
      export * as M from './src/apps/cf_erp/motion';
      export { createCfErpTheme } from './src/apps/cf_erp/theme';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error', loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `motion-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, M, createCfErpTheme } = m;
const h = React.createElement;

let passed = 0;
let failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let root = null;
const host = () => document.getElementById('app');
async function render(el) {
  if (!root) root = createRoot(host());
  await React.act(async () => { root.render(el); await sleep(5); });
}
async function cleanup() {
  if (root) { await React.act(async () => { root.unmount(); }); root = null; }
  delete dom.window.matchMedia;
  setUA(null);
}
const settle = async (ms = 20) => { await React.act(async () => { await sleep(ms); }); };

const listeners = new Set();
function setReduced(on, { throws = false } = {}) {
  dom.window.matchMedia = (q) => {
    if (throws) throw new Error('no media queries here');
    return {
      matches: on && /reduced-motion/.test(q), media: q, onchange: null, dispatchEvent: () => false,
      addEventListener: (_t, f) => listeners.add(f), removeEventListener: (_t, f) => listeners.delete(f),
      addListener: (f) => listeners.add(f), removeListener: (f) => listeners.delete(f),
    };
  };
}
// Pretend to be a real browser (not jsdom) for the DOM-only effects.
const realUA = dom.window.navigator.userAgent;
function setUA(ua) {
  Object.defineProperty(dom.window.navigator, 'userAgent', { value: ua ?? realUA, configurable: true });
}

await check('reduced motion: no matchMedia → off, a throwing matchMedia → off, a match → on', async () => {
  assert.equal(typeof dom.window.matchMedia, 'undefined');
  assert.equal(M.prefersReducedMotion(), false);
  setReduced(true, { throws: true });
  assert.equal(M.prefersReducedMotion(), false);
  setReduced(true);
  assert.equal(M.prefersReducedMotion(), true);
  setReduced(false);
  assert.equal(M.prefersReducedMotion(), false);
  assert.equal(M.isJsdom(), true);
  assert.equal(M.motionOff(), true, 'jsdom: DOM-only motion is off');
  await cleanup();
});

await check('useReducedMotion renders without matchMedia and follows the OS setting', async () => {
  function Probe() { return h('span', { 'data-testid': 'rm' }, M.useReducedMotion() ? 'reduce' : 'full'); }
  await render(h(Probe));
  assert.equal(host().textContent, 'full');
  await cleanup();
  setReduced(false);
  await render(h(Probe));
  assert.equal(host().textContent, 'full');
  setReduced(true);
  await React.act(async () => { listeners.forEach((f) => f()); });
  assert.equal(host().textContent, 'reduce');
  await cleanup();
  listeners.clear();
});

await check('tokens: spec easings, durations within the rules', async () => {
  assert.equal(M.easing.standard, 'cubic-bezier(0.2, 0, 0, 1)');
  assert.equal(M.easing.exit, 'cubic-bezier(0.4, 0, 1, 1)');
  for (const k of ['fast', 'base', 'slow']) assert.ok(M.duration[k] >= 120 && M.duration[k] <= 280, k);
  assert.ok(M.duration.panel <= 300);
  assert.ok(M.duration.nudge <= 280);
  assert.ok(M.duration.countUp <= 800);
  assert.ok(M.duration.celebrate <= 1000);
  assert.equal(M.transition(['opacity', 'transform'], 160), 'opacity 160ms cubic-bezier(0.2, 0, 0, 1), transform 160ms cubic-bezier(0.2, 0, 0, 1)');
});

await check('CountUp: the final value is there at once in jsdom (formatted too), and later values show as they are', async () => {
  await render(h(M.CountUp, { value: 1234 }));
  assert.equal(host().textContent, '1234');
  await render(h(M.CountUp, { value: 1250 }));
  assert.equal(host().textContent, '1250');
  await cleanup();
  await render(h(M.CountUp, { value: 12.5, format: (n) => `₹${n.toFixed(1)}` }));
  assert.equal(host().textContent, '₹12.5');
  await cleanup();
});

await check('CountUp in a real browser: counts ≤ 800 ms with the final value kept for screen readers, lands exactly', async () => {
  setUA('Mozilla/5.0 Chrome');
  await render(h(M.CountUp, { value: 900, ms: 5000 }));
  const hidden = host().querySelector('[aria-hidden="true"]');
  assert.ok(hidden, 'moving digits are aria-hidden');
  assert.ok(host().textContent.includes('900'), 'final value present for screen readers');
  await settle(950);
  assert.equal(host().textContent, '900');
  assert.equal(host().querySelector('[aria-hidden="true"]'), null);
  await cleanup();
  setUA('Mozilla/5.0 Chrome');
  setReduced(true);
  await render(h(M.CountUp, { value: 900 }));
  assert.equal(host().textContent, '900', 'reduced motion: no count');
  assert.equal(host().querySelector('[aria-hidden="true"]'), null);
  await cleanup();
});

await check('FlashOnChange: no flash on first render or the same value; a flash on a change, restarted on the next, then gone', async () => {
  const el = () => host().firstChild;
  await render(h(M.FlashOnChange, { value: 1, className: 'num' }, '1'));
  assert.equal(el().className, 'num');
  await render(h(M.FlashOnChange, { value: 1, className: 'num' }, '1'));
  assert.equal(el().className, 'num');
  await render(h(M.FlashOnChange, { value: 2, className: 'num' }, '2'));
  assert.equal(el().className, 'num cfm-flash');
  await render(h(M.FlashOnChange, { value: 3, className: 'num' }, '3'));
  assert.equal(el().className, 'num cfm-flash-b');
  await settle(M.duration.flash + 60);
  assert.equal(el().className, 'num');
  assert.equal(el().textContent, '3');
  await cleanup();
  setReduced(true);
  await render(h(M.FlashOnChange, { value: 'Open' }, 'Open'));
  await render(h(M.FlashOnChange, { value: 'Closed' }, 'Closed'));
  assert.equal(el().getAttribute('class'), null, 'reduced motion: no flash');
  await cleanup();
});

await check('Stagger: only the first N children animate, capped at 12, ≤ 400 ms in all, no wrapper, classes kept', async () => {
  const kids = (n) => Array.from({ length: n }, (_, i) => h('li', { key: i, className: 'row', 'data-testid': `r${i}` }, `Row ${i}`));
  await render(h('ul', null, h(M.Stagger, { max: 5 }, kids(20))));
  const lis = [...host().querySelectorAll('li')];
  assert.equal(lis.length, 20);
  assert.equal(host().querySelector('ul').children.length, 20, 'no wrapper');
  assert.equal(lis.filter((li) => li.classList.contains('cfm-rise-in')).length, 5);
  assert.ok(lis.every((li) => li.classList.contains('row')));
  assert.equal(lis[5].getAttribute('style'), null);
  assert.equal(lis[4].style.animationDelay, `${M.stagger.step * 4}ms`);
  await render(h('ul', null, h(M.Stagger, { max: 50, step: 100, variant: 'fade' }, ['text', ...kids(30)])));
  const all = [...host().querySelectorAll('li')];
  assert.equal(all.filter((li) => li.classList.contains('cfm-fade-in')).length, 12, 'capped at 12');
  const delays = all.slice(0, 12).map((li) => parseInt(li.style.animationDelay, 10));
  assert.ok(Math.max(...delays) <= 400, `total ${Math.max(...delays)}`);
  assert.ok(host().textContent.startsWith('text'), 'non-elements pass through');
  await cleanup();
});

await check('FadeIn and SuccessCheck: content present at once, only styled', async () => {
  await render(h(M.FadeIn, { variant: 'rise', as: 'section', 'data-testid': 'f', delay: 40 }, 'Saved'));
  const f = host().querySelector('[data-testid="f"]');
  assert.equal(f.tagName, 'SECTION');
  assert.equal(f.className, 'cfm-rise-in');
  assert.equal(f.style.animationDelay, '40ms');
  assert.equal(f.textContent, 'Saved');
  await render(h(M.SuccessCheck, { size: 24 }));
  const svg = host().querySelector('svg');
  assert.equal(svg.getAttribute('role'), 'img');
  assert.equal(svg.getAttribute('aria-label'), 'Done');
  assert.ok(svg.classList.contains('cfm-check'));
  await render(h(M.SuccessCheck, { label: '' }));
  assert.equal(host().querySelector('svg').getAttribute('aria-hidden'), 'true');
  await cleanup();
});

await check('celebrate / nudge: no-ops in jsdom and on nothing, never throw', async () => {
  const btn = document.createElement('button');
  document.body.appendChild(btn);
  M.celebrate();
  M.celebrate(btn);
  M.celebrate(null);
  assert.equal(document.querySelector('.cfm-burst'), null);
  M.nudge(btn);
  M.nudge(null);
  M.nudge(undefined);
  assert.equal(btn.classList.contains('cfm-nudge'), false);
  btn.remove();
});

await check('celebrate / nudge in a real browser: one burst ≤ 900 ms then removed, once per action; nudge class cleans up; off under reduced motion', async () => {
  setUA('Mozilla/5.0 Chrome');
  const btn = document.createElement('button');
  document.body.appendChild(btn);
  M.celebrate(btn);
  M.celebrate(btn);
  assert.equal(document.querySelectorAll('.cfm-burst').length, 1, 'one burst per action');
  const burst = document.querySelector('.cfm-burst');
  assert.equal(burst.getAttribute('aria-hidden'), 'true');
  assert.ok(burst.children.length > 0 && burst.children.length <= 12);
  M.nudge(btn);
  assert.equal(btn.classList.contains('cfm-nudge'), true);
  await sleep(M.duration.celebrate + 30);
  assert.equal(document.querySelector('.cfm-burst'), null, 'cleaned up');
  assert.equal(btn.classList.contains('cfm-nudge'), false, 'nudge class removed');
  setReduced(true);
  M.celebrate(btn);
  M.nudge(btn);
  assert.equal(document.querySelector('.cfm-burst'), null);
  assert.equal(btn.classList.contains('cfm-nudge'), false);
  btn.remove();
  await cleanup();
});

await check('cf_erp theme: transitions from the tokens, press feedback, menu/drawer timings, existing overrides kept', async () => {
  for (const mode of ['light', 'dark']) {
    const t = createCfErpTheme(mode);
    assert.equal(t.transitions.duration.enteringScreen, M.duration.slow);
    assert.equal(t.transitions.duration.leavingScreen, M.duration.base);
    assert.equal(t.transitions.duration.standard, M.duration.slow);
    assert.equal(t.transitions.easing.easeOut, M.easing.standard);
    assert.equal(t.transitions.easing.easeIn, M.easing.exit);
    assert.match(t.transitions.create('opacity'), new RegExp(`${M.duration.slow}ms`));
    const btn = t.components.MuiButton.styleOverrides.root;
    assert.equal(btn.borderRadius, '8px', 'existing Button override kept');
    assert.equal(btn['&:active:not(.Mui-disabled)'].transform, 'scale(0.98)');
    assert.ok(t.components.MuiIconButton.styleOverrides.root['&:active:not(.Mui-disabled)']);
    assert.ok(t.components.MuiCard.styleOverrides.root.border, 'existing Card override kept');
    assert.ok(Object.keys(t.components.MuiCard.styleOverrides.root).some((k) => k.includes(':hover')));
    assert.ok(t.components.MuiDialog.styleOverrides.paper.boxShadow, 'existing Dialog override kept');
    assert.match(t.components.MuiDialog.styleOverrides.paper.animation, /cfm-rise-in/);
    assert.deepEqual(t.components.MuiMenu.defaultProps.transitionDuration, { enter: M.duration.base, exit: M.duration.fast });
    assert.ok(t.components.MuiDrawer.defaultProps.transitionDuration.enter <= 300);
    assert.equal(typeof t.components.MuiBackdrop.styleOverrides.root, 'function', 'backdrop override untouched');
  }
});

await check('motion.css: every keyframe, the reduced-motion kill-switch, loaded once by the shell', async () => {
  const css = readFileSync('src/apps/cf_erp/motion/motion.css', 'utf8');
  for (const k of ['fade-in', 'rise-in', 'pop', 'check-draw', 'shimmer', 'highlight-flash', 'nudge']) assert.match(css, new RegExp(`@keyframes cfm-${k}\\b`), k);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  const scope = readFileSync('src/apps/cf_erp/components/shell/CfErpThemeScope.tsx', 'utf8');
  assert.match(scope, /import '\.\.\/\.\.\/motion\/motion\.css'/);
  const srcFiles = ['FadeIn.tsx', 'Stagger.tsx', 'FlashOnChange.tsx', 'CountUp.tsx', 'SuccessCheck.tsx', 'celebrate.ts', 'nudge.ts'];
  for (const f of srcFiles) assert.doesNotMatch(readFileSync(`src/apps/cf_erp/motion/${f}`, 'utf8'), /\.css'/, `${f} must not import CSS (tests bundle it)`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
