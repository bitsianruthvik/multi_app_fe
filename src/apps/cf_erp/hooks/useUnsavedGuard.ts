import { useEffect, useRef, useState } from 'react';

/**
 * UNSAVED EDITS — never lost by a click (walkthrough 2026-10-18 step 11). While `active`, a click that would take the
 * screen away from the edits is held and the person is asked "Save / Discard / Stay":
 *
 *   - a link that navigates (not one opening a new tab or a download);
 *   - a tab that is not the selected one (or Enter / Space on it);
 *   - a button marked `data-guard-line` with this screen's line id, or "all" (folding the line's group unmounts it).
 *
 * Save runs `onSave` and, when it worked, lets the held click through; Discard runs `onDiscard` and lets it through;
 * Stay drops it. The click is let through by clicking the same element again, so a router link or a tab does exactly
 * what it would have done. Closing or reloading the browser tab still gets the browser's own question (it allows
 * no other). The browser's Back button is the one way out this does not catch.
 *
 * Pure decision (which element is "leaving") is `leavingTarget`, exported for the tests.
 */
export function leavingTarget(el: Element | null, lineId: string | number | null): HTMLElement | null {
  if (!el || el.closest('.MuiAutocomplete-popper, [role="dialog"]')) return null;
  const link = el.closest('a[href]');
  if (link) return link.getAttribute('target') !== '_blank' && !link.hasAttribute('download') ? link as HTMLElement : null;
  const tab = el.closest('[role="tab"][aria-selected="false"]');
  if (tab) return tab as HTMLElement;
  const guarded = el.closest('[data-guard-line]');
  if (guarded) {
    const v = guarded.getAttribute('data-guard-line');
    if (v === 'all' || (lineId != null && v === String(lineId))) return guarded as HTMLElement;
  }
  return null;
}

export function useUnsavedGuard({ active, lineId = null, onSave, onDiscard }: {
  active: boolean;
  lineId?: string | number | null;
  /** Saves the edits; true when they were saved (the held click then goes on). */
  onSave: () => Promise<boolean>;
  onDiscard: () => void;
}) {
  const [held, setHeld] = useState<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const letThrough = useRef(false);
  const handlers = useRef({ onSave, onDiscard });
  useEffect(() => { handlers.current = { onSave, onDiscard }; }, [onSave, onDiscard]);

  useEffect(() => {
    if (!active) return undefined;
    const hold = (e: Event, target: HTMLElement) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); setHeld(target); };
    const onClick = (e: MouseEvent) => {
      if (letThrough.current || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = leavingTarget(e.target instanceof Element ? e.target : null, lineId);
      if (target) hold(e, target);
    };
    const onKey = (e: KeyboardEvent) => {
      if (letThrough.current || (e.key !== 'Enter' && e.key !== ' ')) return;
      const el = e.target instanceof Element ? e.target : null;
      const tab = el?.closest('[role="tab"][aria-selected="false"]');
      if (tab) hold(e, tab as HTMLElement);
    };
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [active, lineId]);

  const goOn = (target: HTMLElement) => {
    letThrough.current = true;
    try { target.click(); } finally { letThrough.current = false; }
  };
  const stay = () => { if (!saving) setHeld(null); };
  const discard = () => {
    const target = held;
    setHeld(null);
    handlers.current.onDiscard();
    if (target) goOn(target);
  };
  const save = async () => {
    const target = held;
    setSaving(true);
    let ok = false;
    try { ok = await handlers.current.onSave(); } finally { setSaving(false); }
    setHeld(null);
    if (ok && target?.isConnected) goOn(target);
  };
  return { held: !!held, saving, stay, discard, save };
}

