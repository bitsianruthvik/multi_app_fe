import { createContext, useContext } from 'react';

/** What a HelpButton asks the panel to show. */
export interface HelpRequest {
  /** Open this topic first. */
  topic?: string;
  /** The tab / stage the user is on, when the URL does not say (a page's default tab, the order's stage). */
  tab?: string | null;
}

export interface HelpApi {
  open: (req?: HelpRequest) => void;
}

export const HelpContext = createContext<HelpApi | null>(null);
export const useHelp = () => useContext(HelpContext);
