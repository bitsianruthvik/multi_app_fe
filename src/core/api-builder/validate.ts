import { getResource} from './registry';

type FieldSelection = (string | { path: string; as?: string })[];

export function validateFields(resourceName: string, fields: FieldSelection) {
  const res = getResource(resourceName);
  const allowed = new Set(res.fields);

  for (const f of fields) {
    const path = typeof f === 'string' ? f.split(':')[0] : f.path;
    if (!allowed.has(path)) {
      throw new Error(`Field not allowed on resource ${resourceName}: ${path}`);
    }
  }
}

// filters is an object where keys are "<field>.<op>" and values are primitives/arrays/ranges
export function validateFilters(resourceName: string, filters?: Record<string, unknown>) {
  if (!filters) return;
  const res = getResource(resourceName);
  const filterOps = (res.allowedOps && res.allowedOps.filters) || {};

  for (const key of Object.keys(filters)) {
    // support nested dots in field names; op is last segment
    const parts = key.split('.');
    if (parts.length < 2) throw new Error(`Invalid filter key: ${key}`);
    const op = parts.pop() as string;
    const field = parts.join('.');

    const allowed = filterOps[field];
    if (!allowed || !Array.isArray(allowed) || !allowed.includes(op)) {
      throw new Error(`Filter op not allowed for ${field}: ${op}`);
    }
  }
}
