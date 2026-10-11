import { createContext, useContext } from 'react';

/**
 * Opens a hiring as a pop-up over whatever screen asked for it (the org chart,
 * a position, the Departments sheet) — CF_HRMS_HIRING_SPEC.md §3.2.
 *
 * It is a context, and the dialog lives at the shell, for one reason: the
 * thing that opens a hiring is usually a row in a panel that REDRAWS when the
 * hiring changes the position (vacant -> hiring -> filled). A dialog owned by
 * that row would vanish with it, mid-flow. Owned by the shell, it stays until
 * the person closes it, and only then is the opener told to refresh.
 */
export interface HiringDialogApi {
  /** `onClosed` runs once, when the pop-up is closed: reload what is behind it. */
  open: (hiringId: number, onClosed?: () => void) => void;
}

export const HiringDialogContext = createContext<HiringDialogApi | null>(null);

/** Null outside the cf_hrms shell; a caller then falls back to the page. */
export const useHiringDialog = (): HiringDialogApi | null => useContext(HiringDialogContext);
