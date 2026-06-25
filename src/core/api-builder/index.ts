/* eslint-disable @typescript-eslint/no-explicit-any */
// Minimal API Builder MVP for day-one use

import { getResource } from "./registry";
import { validateFields, validateFilters } from "./validate";
// serializePost is no longer used because mutate builds the backend body directly
// keep the import commented for future use
// import { serializePost } from './serialize';
import { send } from "./client";

type FieldSelection = (string | { path: string; as?: string })[];
type Filters = Record<string, unknown>;
type SortSpec = Record<string, "asc" | "desc">;

type AggregateSpec = {
  functions: Array<{ fn: string; field: string; alias: string }>;
  groupBy?: string[];
  having?: any;
};

// When `aggregate` is set, caller must pass `fields: []`; raw-field validation is skipped because aliases are computed columns.
export async function query(opts: {
  resource: string;
  fields: FieldSelection;
  filters?: Filters;
  sort?: SortSpec;
  limit?: number;
  cursor?: string;
  timeoutMs?: number;
  aggregate?: AggregateSpec;
  groupBy?: string[];
}) {
  const {
    resource,
    fields,
    filters,
    sort,
    limit,
    cursor,
    timeoutMs,
    aggregate,
    groupBy,
  } = opts;

  // validation
  if (!aggregate) {
    validateFields(resource, fields);
  }
  validateFilters(resource, filters as any);

  const resDef = getResource(resource);

  // Build request body matching backend base_resource POST API
  const body: any = {
    operation: "query",
    resource,
    fields: (fields as (string | { path: string; as?: string })[]).map((f) =>
      typeof f === "string" ? f : f.as ? `${f.path}:${f.as}` : f.path
    ),
  };

  if (filters) body.filters = filters;
  if (sort) body.orderBy = sort;
  if (limit !== undefined || cursor) body.pagination = { limit, cursor };
  if (aggregate) body.aggregate = aggregate;
  if (groupBy) body.groupBy = groupBy;

  return send({ method: "POST", url: resDef.endpoint, body, timeoutMs });
}

export async function mutate(opts: {
  resource: string;
  fields: FieldSelection;
  data: Record<string, unknown>;
  method?: "POST" | "PUT";
  idempotencyKey?: string;
  timeoutMs?: number;
}) {
  const {
    resource,
    fields,
    data,
    method = "POST",
    idempotencyKey,
    timeoutMs,
  } = opts;

  validateFields(resource, fields);
  // we don't validate data keys here; aliases drive mapping on the backend
  const resDef = getResource(resource);

  // Build a backend-compatible body for insert/update operations
  const operation = method === "POST" ? "insert" : "update";
  const body: any = {
    operation,
    resource,
    data,
  };

  return send({
    method: "POST",
    url: resDef.endpoint,
    body,
    idempotencyKey,
    timeoutMs,
  });
}
