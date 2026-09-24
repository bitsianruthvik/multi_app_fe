import type { KeyboardEvent } from 'react';

/**
 * The form dialogs' Enter rule.
 *
 * Enter saves from any field — but not in a textarea (it makes a new line), not
 * on a button (it has its own action), not while a picker's list is open (Enter
 * chooses the option), and not when a control already handled the key. Exported
 * because dialogs that lay out their own actions need the same rule; FormDialog
 * uses it too.
 */
export function enterSubmits(submit: () => void, blocked = false) {
  return (e: KeyboardEvent) => {
    if (blocked || e.key !== 'Enter' || e.shiftKey || e.defaultPrevented) return;
    const t = e.target as HTMLElement;
    if (
      t.tagName === 'TEXTAREA' ||
      t.tagName === 'BUTTON' ||
      t.getAttribute('aria-expanded') === 'true'
    ) {
      return;
    }
    e.preventDefault();
    submit();
  };
}
