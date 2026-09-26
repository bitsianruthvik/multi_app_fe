import { useCallback, useState } from 'react';

/**
 * The line an order is being worked on — the "Working on" switcher above the
 * stage tabs. Stages are per line, so every mark on the tabs and every stage
 * screen below them is about this one line.
 *
 * Remembered for the session, per order, under the same key the old process
 * pop-up used, so a choice made before the tabs replaced it still stands.
 */
const lineKey = (orderId: number) => `cf_erp.process.line.${orderId}`;

function readLine(orderId: number): number | null {
  try { const v = sessionStorage.getItem(lineKey(orderId)); return v ? Number(v) || null : null; } catch { return null; }
}

function writeLine(orderId: number, lineId: number) {
  try { sessionStorage.setItem(lineKey(orderId), String(lineId)); } catch { /* private window, or storage off */ }
}

/**
 * [the remembered line id — or null, when nothing was chosen yet — and the way
 * to choose one]. The id is only a wish: the page falls back the moment it is
 * not one of the order's lines, so the switcher never sits on a value that is
 * not in its own list.
 */
export function useWorkingLine(orderId: number): [number | null, (lineId: number) => void] {
  const [picked, setPicked] = useState<{ orderId: number; lineId: number | null }>(() => ({ orderId, lineId: readLine(orderId) }));
  // The page is reused when a link leads from one order to another: that
  // order's own memory, never the last order's choice.
  const lineId = picked.orderId === orderId ? picked.lineId : readLine(orderId);
  const pick = useCallback((next: number) => {
    writeLine(orderId, next);
    setPicked({ orderId, lineId: next });
  }, [orderId]);
  return [lineId, pick];
}
