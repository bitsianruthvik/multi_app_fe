import { cfApi, qs } from './client';
import type { Brand, BrandRef } from './types';

/** §117: the company's brand list (Unbranded first). */
export const listBrands = (q: { search?: string; withUse?: boolean } = {}) =>
  cfApi.get<Brand[]>(`/brands${qs({ search: q.search, withUse: q.withUse ? 1 : undefined })}`);
/** The brand by this name: the existing one when it is the same brand; SIMILAR (422) when it looks like one on the list. */
export const addBrand = (name: string, confirm = false) =>
  cfApi.post<{ brand: BrandRef; created: boolean }>('/brands', { name, ...(confirm ? { confirm: true } : {}) });
export const renameBrand = (id: number, name: string) => cfApi.put<BrandRef>(`/brands/${id}`, { name });
export const mergeBrand = (id: number, intoId: number) => cfApi.post<{ into: BrandRef; lotsMoved: number }>(`/brands/${id}/merge`, { intoId });
