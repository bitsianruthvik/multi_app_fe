import type { ToastApi } from '../toastContext';

/** One short toast from the engine's feedback lines (at most three), or a plain fallback. */
export function toastMessage(toast: ToastApi, lines: string[], fallback: string) {
  toast.info(lines.length ? lines.slice(0, 3).join(' · ') : fallback);
}
