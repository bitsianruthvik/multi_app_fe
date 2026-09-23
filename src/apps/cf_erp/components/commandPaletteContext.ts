import { createContext, useContext } from 'react';

/** The ⌘K palette's context; outside the provider `open()` is inert, never a crash. */
export const PaletteContext = createContext<{ open: () => void }>({ open: () => {} });

export function useCommandPalette() {
  return useContext(PaletteContext);
}
