import { useEffect, useState } from 'react';

/**
 * Binds `?` to open the keyboard-shortcuts sheet, so a layout can mount the
 * overlay once and every screen inherits the binding.
 *
 * Ignores the key while the user is typing — otherwise a question mark in a
 * search box would pop a dialog instead of typing a character.
 */
export function useShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?') return;
      const t = e.target as HTMLElement | null;
      const typing =
        !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (typing) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return { open, setOpen, close: () => setOpen(false) };
}
