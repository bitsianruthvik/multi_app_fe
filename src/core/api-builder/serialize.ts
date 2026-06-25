import {getResource } from './registry';

export type FieldSelection = (string | { path: string; as?: string })[];
export type Filters = Record<string, unknown>;
export type SortSpec = Record<string, 'asc' | 'desc'>;

function serializeFields(fields: FieldSelection): string[] {
  return fields.map((f) => (typeof f === 'string' ? f : f.as ? `${f.path}:${f.as}` : f.path));
}

export function serializeGet(resource: string, fields: FieldSelection, filters?: Filters, sort?: SortSpec, limit?: number, cursor?: string): string {
  // Validate resource exists
  getResource(resource);

  const params = new URLSearchParams();
  serializeFields(fields).forEach((fs) => params.append('fields[]', fs));

  if (filters) {
    Object.entries(filters).forEach(([k, v]) => {
      const val = Array.isArray(v) ? JSON.stringify(v) : String(v);
      params.append(`filter[${k}]`, val);
    });
  }

  if (sort) {
    Object.entries(sort).forEach(([f, d]) => params.append(`sort[${f}]`, d));
  }

  if (limit !== undefined) params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);

  // include explicit table so backend can resolve base_resource
  params.set('table', resource);

  return params.toString();
}

export function serializePost(resource: string, data: Record<string, unknown>, fields: FieldSelection) {
  getResource(resource);
  return {
    resource,
    fields: serializeFields(fields),
    data,
  };
}
