import { duration } from './tokens';
import { motionOff } from './useReducedMotion';

/**
 * A single small side-to-side "nope" (≤ 250 ms) on an element whose action was
 * refused — pair it with the message that says why. Restarts if called again;
 * cleans its class up. Does nothing for a missing element, under reduced
 * motion, or in jsdom. Never throws.
 */
export function nudge(el: Element | null | undefined): void {
  try {
    if (!el || motionOff()) return;
    el.classList.remove('cfm-nudge');
    void (el as HTMLElement).offsetWidth; // restart the animation
    el.classList.add('cfm-nudge');
    window.setTimeout(() => el.classList.remove('cfm-nudge'), duration.nudge + 40);
  } catch {
    /* never break the caller */
  }
}
