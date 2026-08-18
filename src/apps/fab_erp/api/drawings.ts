/**
 * drawings.ts — item drawings, and the ancestors' drawings that come with them.
 *
 * The list never carries bytes: a dozen PDFs would be tens of megabytes of
 * JSON. `drawingFileUrl` gives a plain URL the browser fetches when somebody
 * actually opens one, which also means a PDF renders in a tab instead of being
 * marshalled through JavaScript.
 */

import api, { API_HOST } from '@core/utils/axiosConfig';
import { fabGet } from './client';

const base = () => `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp`;

export interface Drawing {
  id: number;
  itemId: number;
  fileName: string;
  sizeBytes: number;
  revision: string | null;
  notes: string | null;
  createdAt: string;
  itemName: string | null;
  itemCode: string | null;
  levelKind: string | null;
  /** True when it belongs to an ancestor rather than this item. */
  inherited: boolean;
  /** 0 = this item, 1 = its parent, and so on. */
  depth: number;
}

export const getItemDrawings = (itemId: number) =>
  fabGet<{ drawings: Drawing[] }>(`items/${itemId}/drawings`);

/** What an operator sees from a task: its item's drawings plus every ancestor's. */
export const getTaskDrawings = (taskId: number) =>
  fabGet<{ drawings: Drawing[] }>(`tasks/${taskId}/drawings`);

export const drawingFileUrl = (id: number) => `${base()}/drawings/${id}/file`;

export async function uploadDrawing(
  itemId: number, file: File, meta: { revision?: string; notes?: string } = {},
) {
  const form = new FormData();
  form.append('file', file);
  if (meta.revision) form.append('revision', meta.revision);
  if (meta.notes) form.append('notes', meta.notes);
  const res = await api.post(`${base()}/items/${itemId}/drawings`, form);
  return res.data as { id: number; fileName: string; sizeBytes: number; storedBytes: number };
}

export async function deleteDrawing(id: number) {
  const res = await api.delete(`${base()}/drawings/${id}`);
  return res.data as { id: number };
}

export const fmtSize = (b: number) =>
  (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
