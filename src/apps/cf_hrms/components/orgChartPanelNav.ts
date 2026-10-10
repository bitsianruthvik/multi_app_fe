/**
 * What the org chart's floating panel can be showing, and how it moves between
 * them (spec §17). The panel is a small STACK: a seat at the bottom (the box
 * that was clicked), and whatever was opened from it on top — a person, an open
 * seat, the role, another seat — each with a Back.
 */
export type PanelView =
  | { kind: 'seat'; positionId: number; title: string }
  | {
      kind: 'person';
      employeeId: number;
      title: string;
      employeeCode: string | null;
      /** The seat and shift they were opened from — what the chart knows without asking. */
      positionId: number | null;
      shiftCode: string | null;
    }
  | { kind: 'open'; positionId: number; shift: 'G' | 'D' | 'N'; title: string }
  | { kind: 'role'; roleId: number; title: string };

export interface PanelNav {
  /** Open something on top of the current view. */
  push: (view: PanelView) => void;
  /** One level back. A no-op at the bottom of the stack. */
  back: () => void;
}

export const SHIFT_WORD: Record<string, string> = { G: 'General shift', D: 'Day shift', N: 'Night shift', DN: 'Day & night shifts' };
export const SHIFT_SHORT: Record<string, string> = { G: 'General', D: 'Day', N: 'Night' };

/** What a view is, in two words — the small line above its title. */
export function viewKind(view: PanelView): string {
  switch (view.kind) {
    case 'seat':
      return 'Position';
    case 'person':
      return 'Person';
    case 'open':
      return 'Open seat';
    default:
      return 'Role';
  }
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
