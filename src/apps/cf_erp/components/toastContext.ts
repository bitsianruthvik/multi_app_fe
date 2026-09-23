import { createContext, useContext } from 'react';

export interface ToastApi { success: (text: string) => void; error: (text: string) => void; info: (text: string) => void }

export const ToastContext = createContext<ToastApi>({ success: () => {}, error: () => {}, info: () => {} });

/** Say whether something worked (DESIGN_SYSTEM.md §5.7-2/11). Provided by ToastProvider. */
export const useToast = () => useContext(ToastContext);
