import type { ChartModel } from './orgChartLayout';

/**
 * What the org chart's floating panel can be showing, and how it moves between
 * them (spec §17, reshaped 2026-10-10 for the two-level model).
 *
 * TWO THINGS ON THE CHART, TWO VIEWS:
 *   a ROLE     — what a card's headline opens. The job: its positions in this
 *                card, its purpose, and its KRAs → responsibilities and KPIs,
 *                edited at ROLE level.
 *   a POSITION — what a row of a card opens. One chair for one person on one
 *                shift: the person in it (or the vacancy), and the position's
 *                responsibilities and KPIs, edited at POSITION level. KRAs are
 *                shown and fixed.
 *
 * The panel is a small STACK: the card's role at the bottom, and whatever was
 * opened from it on top — a position, another role, a manager — each with Back.
 * `person` is someone reached without going through one of their positions'
 * rows (a manager named on a reporting line); it shows the same person view.
 */
export type PanelView =
  | {
      kind: 'role';
      roleId: number | null;
      /** The card it was opened from — its positions are the ones listed. Null when opened away from a card. */
      cardId: number | null;
      title: string;
    }
  | { kind: 'position'; positionId: number; title: string }
  | {
      kind: 'person';
      employeeId: number;
      title: string;
      employeeCode: string | null;
      /** The position they were reached through, when there is one. */
      positionId: number | null;
    };

export interface PanelNav {
  /** Open something on top of the current view. */
  push: (view: PanelView) => void;
  /** One level back. A no-op at the bottom of the stack. */
  back: () => void;
}

/** What a view is, in one word — the small line above its title. */
export function viewKind(view: PanelView): string {
  switch (view.kind) {
    case 'position':
      return 'Position';
    case 'person':
      return 'Person';
    default:
      return 'Role';
  }
}

/** The view a card's headline opens: its role, with this card's positions. */
export function roleViewOfCard(model: ChartModel, cardId: number): PanelView {
  const card = model.byId.get(cardId);
  return {
    kind: 'role',
    roleId: card?.roleId ?? null,
    cardId,
    title: card?.displayTitle || card?.title || 'Role',
  };
}

/**
 * A position's title in the panel: the person in it, or that it is vacant.
 * Read from the chart every time, so the header follows an assignment.
 */
export function positionTitle(model: ChartModel | null, positionId: number, fallback = 'Position'): string {
  const node = model?.positions.get(positionId);
  if (!node) return fallback;
  const who = node.occupants?.[0]?.name?.trim();
  return who || `Vacant — ${node.displayTitle || node.title}`;
}

/** The view a position row opens. */
export function positionView(model: ChartModel | null, positionId: number, fallback?: string): PanelView {
  return { kind: 'position', positionId, title: positionTitle(model, positionId, fallback) };
}

/** The title to print for a view now (a position's follows the chart; the others are as pushed). */
export function viewTitle(model: ChartModel | null, view: PanelView): string {
  return view.kind === 'position' ? positionTitle(model, view.positionId, view.title) : view.title;
}

/** The tiny caps label the panel's fact strips use. */
export const smallLabel = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '.05em',
  textTransform: 'uppercase' as const,
  color: 'var(--c-text-2)',
};

/** A text-styled button: opens something IN the panel (never a page). */
export const inPanelLink = {
  border: 0,
  background: 'none',
  p: 0,
  font: 'inherit',
  textAlign: 'left' as const,
  cursor: 'pointer',
  color: 'var(--c-primary-700)',
  overflowWrap: 'anywhere' as const,
  '&:hover': { textDecoration: 'underline' },
  '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 2, borderRadius: '4px' },
};

/** "Changes the role X — 2 positions". One sentence, used everywhere a ROLE edit is confirmed. */
export function reachSentence(roleTitle: string, positions: number): string {
  return `Changes the role ${roleTitle} — ${positions} position${positions === 1 ? '' : 's'}`;
}
