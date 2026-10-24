import { duration } from './tokens';
import { motionOff } from './useReducedMotion';

const GLYPHS = ['✓', '✦', '•', '✓', '✦', '•', '✓', '✦', '•', '✓'];
const COLORS = ['var(--c-success-600, #0E9F6E)', 'var(--c-primary-600, #6D28D9)', 'var(--c-warning-600, #D97706)'];

let lastAt = 0;

/**
 * A small one-time burst of ticks and sparkles for a rare milestone (order
 * fully paid, PO dispatched, last approval cleared…). DOM only, no deps:
 * appends a pointer-events:none layer at the anchor's centre (or the middle of
 * the screen), removes it after ≤ 900 ms. Never blocks anything. Does nothing
 * under reduced motion, in jsdom, or if a burst started < 900 ms ago (one per action).
 */
export function celebrate(anchor?: Element | null): void {
  try {
    if (motionOff() || !document.body) return;
    const now = Date.now();
    if (now - lastAt < duration.celebrate) return;
    lastAt = now;

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    if (anchor && typeof anchor.getBoundingClientRect === 'function') {
      const r = anchor.getBoundingClientRect();
      if (r.width || r.height) { x = r.left + r.width / 2; y = r.top + r.height / 2; }
    }

    const layer = document.createElement('div');
    layer.className = 'cfm-burst';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    GLYPHS.forEach((g, i) => {
      const s = document.createElement('span');
      const angle = (i / GLYPHS.length) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 28 + Math.random() * 26;
      s.textContent = g;
      s.style.color = COLORS[i % COLORS.length];
      s.style.setProperty('--dx', `${Math.round(Math.cos(angle) * dist)}px`);
      s.style.setProperty('--dy', `${Math.round(Math.sin(angle) * dist)}px`);
      s.style.setProperty('--rot', `${Math.round((Math.random() - 0.5) * 90)}deg`);
      s.style.animationDelay = `${Math.round(Math.random() * 120)}ms`;
      layer.appendChild(s);
    });
    document.body.appendChild(layer);
    window.setTimeout(() => layer.remove(), duration.celebrate);
  } catch {
    /* motion must never break the action it decorates */
  }
}
