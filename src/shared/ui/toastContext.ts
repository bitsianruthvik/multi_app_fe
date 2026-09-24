import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastApi {
  /** The general form: `toast('Saved', 'success')`. */
  toast: (text: string, tone?: ToastTone) => void;
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
}

const noop = () => {};

/**
 * Kept in its own module so both the provider and its consumers can import it
 * without a component file exporting a non-component
 * (react-refresh/only-export-components).
 *
 * The default no-ops mean calling `useToast()` outside the provider is inert
 * rather than a crash — a missing confirmation must never break a save.
 */
export const ToastContext = createContext<ToastApi>({
  toast: noop,
  success: noop,
  error: noop,
  info: noop,
});

/** Say whether something worked (DESIGN_SYSTEM.md §5.7-2/11). */
export const useToast = () => useContext(ToastContext);
