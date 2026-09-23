import type { Kind } from '../api/types';

/** Where a record opens: items and definitions each have their own screen. */
export const recordPath = (kind: Kind, id: number) => `${kind === 'template' || kind === 'selection' ? 'definitions' : 'items'}/${id}`;
