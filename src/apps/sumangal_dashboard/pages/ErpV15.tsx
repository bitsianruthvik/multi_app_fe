import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Autocomplete, Box, Button, Checkbox, Chip, LinearProgress, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { erpByPane, erpBySlug } from '../erpScreens';
import { loadData, useErpData } from '../erpLoad';

/**
 * The dashboard (V15). Its figures are worked out by the page built from the reviewed HTML
 * (public/sumangal-v15.html, made by tools/sumangal-v15/build.mjs), shown in a frame under the filter bar.
 *
 * One screen, one scroll, one place for filters (user, 2026-11-25):
 *  - the app's menu picks the screen (one route per screen, all this page; the frame keeps running between them);
 *    the tab's name is the title, its hover says what it shows, and the top bar says how fresh the data is;
 *  - the filters are this page's sticky bar: customers (several), order type, metal, kg / pieces, the age range on
 *    the aged screens, today / yesterday / this week / this month on Production, and History's one From–To that
 *    stays when you move between screens (kept for the browser tab). The frame's own filters are hidden;
 *  - the frame is as tall as its content, so only the app's page scrolls; a double-click shows its table under the
 *    screen and the page scrolls to it.
 * The frame takes the platform's fonts, colours and light/dark theme from this page (posted as CSS variables).
 */
type Opt = [string, string];
type Options = { cust: Opt[]; types: Opt[]; metals: Opt[]; end: string };
type Day = 'today' | 'yesterday' | 'week' | 'month';
type Filters = { cs: string[]; t: string; m: string; u: 'kg' | 'pcs'; amin: string; amax: string; from: string; to: string; day: Day };
const company = () => window.location.pathname.split('/').filter(Boolean)[0] ?? '';
const FRAME = '/sumangal-v15.html?v=4';
const KEEP = 'sumangal.ops.filters';
const NO_FILTERS: Filters = { cs: [], t: '', m: '', u: 'kg', amin: '15', amax: '45', from: '', to: '', day: 'today' };
const yearBefore = (d: string) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() - 364); return x.toISOString().slice(0, 10); };
function kept(): Filters {
  try { const v = { ...NO_FILTERS, ...JSON.parse(sessionStorage.getItem(KEEP) || '{}') }; return Array.isArray(v.cs) ? v : { ...v, cs: [] }; } catch { return NO_FILTERS; }
}

/** The platform tokens the frame's styles read (tokens.css), with their current light or dark values. */
const TOKENS = ['--c-primary-50', '--c-primary-100', '--c-primary-200', '--c-primary-600', '--c-primary-700', '--c-success-50', '--c-success-600', '--c-success-800', '--c-warning-50',
  '--c-warning-200', '--c-warning-600', '--c-warning-800', '--c-danger-50', '--c-danger-200', '--c-danger-600', '--c-danger-800', '--c-canvas', '--c-surface',
  '--c-surface-2', '--c-surface-3', '--c-text', '--c-text-2', '--c-text-3', '--c-border', '--c-divider', '--c-focus', '--c-chart-grid', '--c-chart-axis',
  '--c-chart-tooltip-bg', '--c-chart-tooltip-text', '--e-1', '--e-2', '--e-3', '--font-ui', '--font-mono', '--r-sm', '--r-md', '--r-lg'];
function themeMessage() {
  const html = document.documentElement;
  const cs = getComputedStyle(html);
  const vars: Record<string, string> = {};
  for (const t of TOKENS) vars[t] = cs.getPropertyValue(t).trim();
  return { type: 'sumangal-v15-theme', vars, dark: html.getAttribute('data-theme') === 'dark' };
}

const field = { '& .MuiInputBase-root': { minHeight: 36, fontSize: 13.5 } };
const toggle = { px: 1.5, textTransform: 'none', fontSize: 13 } as const;

export default function ErpV15() {
  const { pathname } = useLocation();
  const screen = erpBySlug(pathname.split('/').filter(Boolean)[2]);
  const navigate = useNavigate();
  const data = useErpData();
  const frame = useRef<HTMLIFrameElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(900);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [opts, setOpts] = useState<Options | null>(null);
  const [f, setF] = useState<Filters>(kept);
  const pane = useRef(screen.pane);
  pane.current = screen.pane;
  const fRef = useRef(f);
  fRef.current = f;

  const post = useCallback((msg: unknown) => frame.current?.contentWindow?.postMessage(msg, window.location.origin), []);
  const set = (patch: Partial<Filters>) => setF((old) => ({ ...old, ...patch }));
  useEffect(() => {
    try { sessionStorage.setItem(KEEP, JSON.stringify(f)); } catch { /* not kept */ }
    if (f.from && f.to) post({ type: 'sumangal-v15-filters', filters: f });
  }, [f, post]);

  const send = useCallback(async () => {
    post(themeMessage());
    post({ type: 'sumangal-v15-pane', pane: pane.current });
    if (fRef.current.from) post({ type: 'sumangal-v15-filters', filters: fRef.current });
    try {
      const payload = await loadData();
      post({ type: 'sumangal-v15-data', payload });
      setState('ready');
    } catch (e) {
      setError((e as Error).message);
      setState('error');
    }
  }, [post]);

  // newer data taken (Refresh, or "show" in the top bar): restart the frame, which asks for the data again on load
  const reload = data?.reload ?? 0;
  const firstReload = useRef(reload);
  useEffect(() => {
    if (reload === firstReload.current || !frame.current) return;
    setState('loading');
    frame.current.src = `${FRAME}&t=${Date.now()}`;
  }, [reload]);

  // the menu picks the screen; the frame keeps running between screens
  useEffect(() => { post({ type: 'sumangal-v15-pane', pane: screen.pane }); }, [screen.pane, post]);
  // what the frame says: its options, its height, where to scroll, a screen it opened itself (a drill-down to Trace)
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow || !e.data) return;
      const d = e.data;
      if (d.type === 'sumangal-v15-height') setHeight(Math.max(300, Math.ceil(d.h)));
      else if (d.type === 'sumangal-v15-scroll') {
        const main = frame.current?.closest('main'), fr = frame.current;
        if (main && fr) {
          const barH = bar.current?.getBoundingClientRect().height ?? 0;
          const y = fr.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop + d.y - barH - 12;
          window.setTimeout(() => main.scrollTo({ top: y, behavior: 'smooth' }), 60);
        }
      } else if (d.type === 'sumangal-v15-options') {
        setOpts(d.options);
        setF((old) => {
          const end = d.options.end as string;
          const has = (v: string, list: Opt[]) => (list.some((o) => o[0] === v) ? v : '');
          return { ...old, cs: old.cs.filter((c) => d.options.cust.some((o: Opt) => o[0] === c)), t: has(old.t, d.options.types), m: has(old.m, d.options.metals),
            from: old.from && old.from <= end ? old.from : yearBefore(end), to: old.to && old.to <= end ? old.to : end };
        });
      } else if (d.type === 'sumangal-v15-pane-changed') {
        const to = erpByPane(d.pane);
        if (to && to.pane !== pane.current) navigate(`/${company()}/sumangal_dashboard/${to.slug}`);
      }
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [navigate]);
  // light / dark follows the platform
  useEffect(() => {
    const mo = new MutationObserver(() => post(themeMessage()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    return () => mo.disconnect();
  }, [post]);

  // customers by their code (the ERP's short name), several at once
  const custOpt = (opts?.cust ?? []).filter((o) => o[0] !== '').map(([v, l]) => ({ v, code: l.split(' · ')[0], name: l.split(' · ')[1] ?? '' }));
  const pick = (label: string, v: string, list: Opt[] | undefined, key: 't' | 'm') => (
    <TextField select size="small" label={label} value={v} onChange={(e) => set({ [key]: e.target.value })} sx={{ ...field, width: 140 }}>
      {(list ?? [['', 'All']]).map(([val, lab]) => <MenuItem key={val} value={val}>{lab}</MenuItem>)}
    </TextField>
  );
  const active = !!(f.cs.length || f.t || f.m);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', mt: { xs: -1, md: -1.5 } }}>
      <Stack
        ref={bar}
        direction="row" spacing={1.25} useFlexGap flexWrap="wrap" alignItems="center"
        sx={{ position: 'sticky', top: 0, zIndex: 3, mx: { xs: -2, md: -3 }, px: { xs: 2, md: 3 }, py: 1, mb: 1.5,
          background: 'var(--c-canvas)', borderBottom: '1px solid var(--c-border)' }}
      >
        <Autocomplete
          multiple size="small" disableCloseOnSelect limitTags={3} options={custOpt}
          value={custOpt.filter((o) => f.cs.includes(o.v))} getOptionLabel={(o) => o.code} isOptionEqualToValue={(a, b) => a.v === b.v}
          filterOptions={(list, st) => { const q = st.inputValue.trim().toLowerCase(); return q ? list.filter((o) => o.code.toLowerCase().includes(q) || o.name.toLowerCase().includes(q)) : list; }}
          onChange={(_, v) => set({ cs: v.map((o) => o.v) })}
          renderOption={(props, o, { selected }) => {
            const { key, ...rest } = props as typeof props & { key: string };
            return <li key={key} {...rest} title={o.name}><Checkbox size="small" checked={selected} sx={{ p: 0.25, mr: 0.75 }} />{o.code}</li>;
          }}
          renderTags={(vals, getTagProps) => vals.map((o, i) => { const { key, ...p } = getTagProps({ index: i }); return <Chip key={key} {...p} size="small" label={o.code} />; })}
          renderInput={(p) => <TextField {...p} label="Customers" placeholder={f.cs.length ? '' : 'All'} />}
          sx={{ ...field, width: 230 }}
        />
        {pick('Order type', f.t, opts?.types, 't')}
        {pick('Metal', f.m, opts?.metals, 'm')}
        <ToggleButtonGroup size="small" exclusive value={f.u} onChange={(_, v) => v && set({ u: v })} sx={{ height: 36 }}>
          <ToggleButton value="kg" sx={toggle}>kg</ToggleButton>
          <ToggleButton value="pcs" sx={toggle}>Pieces</ToggleButton>
        </ToggleButtonGroup>
        {screen.age && (
          <Stack direction="row" spacing={0.75} alignItems="center">
            <TextField size="small" type="number" label="Age from (days)" value={f.amin} onChange={(e) => set({ amin: e.target.value })} sx={{ ...field, width: 118 }} />
            <TextField size="small" type="number" label="to" placeholder="any" value={f.amax} onChange={(e) => set({ amax: e.target.value })} sx={{ ...field, width: 80 }} slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
        )}
        {screen.quick && (
          <ToggleButtonGroup size="small" exclusive value={f.day} onChange={(_, v) => v && set({ day: v })} sx={{ height: 36 }}>
            {([['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month']] as const).map(([v, l]) => (
              <ToggleButton key={v} value={v} sx={toggle}>{l}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}
        {screen.period && (
          <Stack direction="row" spacing={0.75} alignItems="center">
            <TextField size="small" type="date" label="From" value={f.from} onChange={(e) => e.target.value && set({ from: e.target.value })}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: f.to || opts?.end } }} sx={{ ...field, width: 150 }} />
            <TextField size="small" type="date" label="To" value={f.to} onChange={(e) => e.target.value && set({ to: e.target.value })}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: f.from, max: opts?.end } }} sx={{ ...field, width: 150 }} />
          </Stack>
        )}
        {active && <Button size="small" onClick={() => set({ cs: [], t: '', m: '' })} sx={{ textTransform: 'none' }}>Clear</Button>}
      </Stack>
      {state === 'loading' && (
        <Box sx={{ mb: 1 }}>
          <LinearProgress />
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.5 }}>Loading the ERP data…</Typography>
        </Box>
      )}
      {state === 'error' && <Alert severity="error" sx={{ mb: 1 }}>The dashboard could not load its data: {error}</Alert>}
      <Box
        component="iframe"
        ref={frame}
        title={screen.label}
        src={FRAME}
        onLoad={send}
        scrolling="no"
        sx={{ height, width: '100%', border: 0, background: 'transparent', display: 'block' }}
      />
    </Box>
  );
}
