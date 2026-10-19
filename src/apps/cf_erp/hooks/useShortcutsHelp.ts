import { useState } from 'react';

/**
 * The keyboard-shortcuts sheet's open state. `?` used to open it; since the in-app help (2026-10-19) `?` opens the
 * help panel (help/HelpProvider.tsx), and the sheet is opened from the panel's keyboard button.
 */
export function useShortcutsHelp() {
  const [open, setOpen] = useState(false);
  return { open, setOpen, show: () => setOpen(true), close: () => setOpen(false) };
}
