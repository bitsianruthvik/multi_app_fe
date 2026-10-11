import { createContext } from 'react';

/** The order line a screen is about, so a part of it needs only its own id to find its drawing (the nesting screen). */
export const LineDrawingContext = createContext<{ orderId: number; lineId: number } | null>(null);
