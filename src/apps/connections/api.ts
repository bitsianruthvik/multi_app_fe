import { apiFetch } from '@core/api/client';

/** connections API. The server never sends a secret back; secretsSet says which are stored. */
function base(): string {
  const company = window.location.pathname.split('/').filter(Boolean)[0] ?? '';
  return `/api/${company}/connections`;
}

export interface ProviderField {
  key: string;
  label: string;
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  help?: string;
}

export interface Provider {
  key: string;
  label: string;
  description: string;
  setupHelp?: string;
  fields: ProviderField[];
}

export interface Connection {
  id: number;
  provider: string;
  providerLabel: string;
  name: string;
  config: Record<string, string>;
  secretsSet: string[];
  folderName: string | null;
  folderWebUrl: string | null;
  status: 'untested' | 'ok' | 'error';
  lastError: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
}

export interface RemoteFile {
  id: string;
  name: string;
  kind: 'file' | 'folder';
  size: number | null;
  modifiedAt: string | null;
  etag: string | null;
  webUrl: string | null;
}

export interface ConnectionInput {
  provider?: string;
  name: string;
  values: Record<string, string>;
}

/** apiFetch puts the raw answer in its message; the screens show only the server's own sentence. */
async function request<T>(path: string, options: Parameters<typeof apiFetch>[1]): Promise<T> {
  try {
    return await apiFetch<T>(`${base()}${path}`, options);
  } catch (e) {
    const raw = /^API request failed: \d+ [^-]* - (\{.*\})$/s.exec((e as Error).message)?.[1];
    if (!raw) throw e;
    let body: { error?: string; message?: string };
    try { body = JSON.parse(raw); } catch { throw e; }
    throw new Error(body.error ?? body.message ?? (e as Error).message);
  }
}

export const connApi = {
  providers: () => request<{ providers: Provider[] }>('/providers', { method: 'GET' }),
  list: () => request<{ connections: Connection[] }>('/connections', { method: 'GET' }),
  create: (body: ConnectionInput) => request<Connection>('/connections', { method: 'POST', body }),
  update: (id: number, body: ConnectionInput) => request<Connection>(`/connections/${id}`, { method: 'PUT', body }),
  remove: (id: number) => request<{ ok: true }>(`/connections/${id}`, { method: 'DELETE' }),
  test: (id: number) => request<{ connection: Connection; summary: string | null }>(`/connections/${id}/test`, { method: 'POST', timeout: 60000 }),
  files: (id: number, folder?: string) => request<{ files: RemoteFile[] }>(
    `/connections/${id}/files${folder ? `?folder=${encodeURIComponent(folder)}` : ''}`,
    { method: 'GET', timeout: 60000 },
  ),
};
