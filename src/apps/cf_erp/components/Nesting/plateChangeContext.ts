import { createContext, useContext } from 'react';
import { isRequested, type LinePlateChanges, type PlateChangeFields, type PlateChangeRequested } from '../../api/plateChanges';

/**
 * The line's plate-change gate (init.sql §62), shared by every save on the Nesting screen. The provider is
 * PlateChangeProvider (PlateChange.tsx); this file holds only the context, so components stay hot-reloadable.
 */
export type Submit = <T>(
  what: string,
  call: (fields: PlateChangeFields) => Promise<T | PlateChangeRequested>,
  opts?: SubmitOptions,
) => Promise<T | null>;

export interface SubmitOptions {
  /** false: do not ask a line with no PO for the before / after (a change that moves no plate). */
  impact?: boolean;
  /** Send without a reason first, even with a PO: the server decides (pieces cut from offcuts). */
  tryFirst?: boolean;
  /** Called when the save became a request (it resolves null then, as it does when the reason is not given). */
  onSent?: () => void;
}

export interface PlateChangeApi {
  data: LinePlateChanges | null;
  /** Read the gate and the requests again. */
  reload: () => void;
  /** Something was decided (approved / rejected / withdrawn): the gate, and the screen that shows the plates. */
  changed: () => void;
  /**
   * Every plate save goes through here. No PO: the save as before (with `impact` for the before / after sheet).
   * A PO: the reason is asked first, the request is sent, the sheet shows it — resolves null (nothing saved).
   * `tryFirst`: send without a reason first — the server decides (pieces cut from offcuts).
   */
  submit: Submit;
}

export const PlateChangeContext = createContext<PlateChangeApi | null>(null);

/** Outside a provider a save is sent as it is (the dialogs keep working on their own). */
const bare: PlateChangeApi = {
  data: null, reload: () => undefined, changed: () => undefined,
  submit: async (_what, call) => { const out = await call({}); return isRequested(out) ? null : out; },
};

export const usePlateChange = (): PlateChangeApi => useContext(PlateChangeContext) ?? bare;
