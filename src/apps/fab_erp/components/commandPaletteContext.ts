import { createContext, useContext } from 'react';

/**
 * Context for the ⌘K palette, kept in its own module so both the provider
 * (CommandPalette.tsx) and consumers can import it without a component file
 * exporting a non-component (react-refresh/only-export-components).
 *
 * The default no-op means calling `useCommandPalette().open()` outside the
 * provider is inert rather than a crash — the palette is an accelerator, and a
 * missing accelerator must never break a screen.
 */
export const PaletteContext = createContext<{ open: () => void }>({ open: () => {} });

/** Opens the command palette from anywhere (e.g. the top-bar search field). */
export function useCommandPalette() {
  return useContext(PaletteContext);
}
