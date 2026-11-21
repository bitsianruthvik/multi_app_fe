import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, LinearProgress, Typography } from '@mui/material';
import { apiFetch } from '@core/api/client';

/**
 * The ERP dashboard (V15): the page merged from V13 and the rebuild review, served as /sumangal-v15.html
 * (made by tools/sumangal-v15/build.mjs) and shown in a frame. Its data comes from this app's API behind the
 * login (GET /v15/data, ~11 MB, sent gzipped) and is handed to the frame with postMessage; the frame works every
 * figure out in the browser, exactly as the reviewed HTML did.
 */
type Payload = { D: unknown; S: unknown; H: unknown };
let cached: Promise<Payload> | null = null;
function loadData(): Promise<Payload> {
  const company = window.location.pathname.split('/').filter(Boolean)[0] ?? '';
  if (!cached) {
    cached = apiFetch<Payload>(`/api/${company}/sumangal_dashboard/v15/data`, { method: 'GET', timeout: 180000 }).catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}

export default function ErpV15() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const send = useCallback(async () => {
    try {
      const payload = await loadData();
      frame.current?.contentWindow?.postMessage({ type: 'sumangal-v15-data', payload }, window.location.origin);
      setState('ready');
    } catch (e) {
      setError((e as Error).message);
      setState('error');
    }
  }, []);
  useEffect(() => { loadData().catch(() => undefined); }, []);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 96px)', minHeight: 480 }}>
      {state === 'loading' && (
        <Box sx={{ mb: 1 }}>
          <LinearProgress />
          <Typography variant="caption" color="text.secondary">Loading the ERP dashboard data (about 2 MB)…</Typography>
        </Box>
      )}
      {state === 'error' && <Alert severity="error" sx={{ mb: 1 }}>The ERP dashboard could not load its data: {error}</Alert>}
      <Box
        component="iframe"
        ref={frame}
        title="ERP dashboard (V15)"
        src="/sumangal-v15.html?v=1"
        onLoad={send}
        sx={{ flex: 1, width: '100%', border: 0, borderRadius: 1, bgcolor: '#f6f7f9' }}
      />
    </Box>
  );
}
