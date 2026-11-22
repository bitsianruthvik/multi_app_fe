import { useState } from 'react';
import { Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import PrintRounded from '@mui/icons-material/PrintRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import { cfApi, qs } from '../../api/client';
import type { LedgerRow } from '../../api/storesDesk';

/**
 * Stores › Stock › PRINT / DOWNLOAD (user 2026-11-23: "In case MD asks the store guy for a bunch of stock, he should be able
 * to print it"). Every row the screen's filters give (not only the page shown), either GROUPED family › sub-family ›
 * variant with a heading each, or as ONE TABLE whose first columns are family, sub-family and variant. Print opens the
 * browser's print (Save as PDF there); Download gives the same as a CSV that Excel opens.
 */
type Col = 'opening' | 'in' | 'out' | 'balance' | 'onOrder' | 'reserved' | 'outWith' | 'min';
const COLS: { key: Col; label: string; get: (r: LedgerRow) => number | null }[] = [
  { key: 'opening', label: 'Opening', get: (r) => r.opening },
  { key: 'in', label: 'In', get: (r) => r.in },
  { key: 'out', label: 'Out', get: (r) => r.out },
  { key: 'balance', label: 'Balance', get: (r) => r.balance },
  { key: 'onOrder', label: 'On order', get: (r) => r.onOrder },
  { key: 'reserved', label: 'Reserved', get: (r) => r.reserved },
  { key: 'outWith', label: 'Out with', get: (r) => r.outWith },
  { key: 'min', label: 'Minimum', get: (r) => r.min },
];
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const n = (v: number | null) => (v == null ? '' : String(Number(v.toFixed(3))));

export function StockPrintDialog({ open, onClose, query, title, filterWords }: {
  open: boolean; onClose: () => void;
  /** The screen's own filters (familyIds, subfamilyIds, variantIds, show, owner, areaId, search, from, to). */
  query: Record<string, string | number | undefined>;
  title: string;
  /** What the filters say, in words, for the page's head. */
  filterWords: string;
}) {
  const [layout, setLayout] = useState<'grouped' | 'table'>('grouped');
  const [cols, setCols] = useState<Col[]>(['opening', 'in', 'out', 'balance']);
  const [busy, setBusy] = useState<'print' | 'csv' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chosen = COLS.filter((c) => cols.includes(c.key));

  const rowsAll = async () => {
    const r = await cfApi.get<{ rows: LedgerRow[] }>(`/stores-desk/ledger${qs({ ...query, paged: 1, all: 1 })}`);
    return r.rows;
  };

  const print = async () => {
    setBusy('print'); setError(null);
    try {
      const rows = await rowsAll();
      const head = `<tr>${layout === 'table' ? '<th>Family</th><th>Sub-family</th><th>Variant</th>' : ''}<th>Code</th><th>Item</th><th>Unit</th>${chosen.map((c) => `<th class="n">${esc(c.label)}</th>`).join('')}</tr>`;
      const line = (r: LedgerRow) => `<tr>${layout === 'table' ? `<td>${esc(r.group.family)}</td><td>${esc(r.group.subfamily)}</td><td>${esc(r.group.variant)}</td>` : ''}<td class="c">${esc(r.item.code)}</td><td>${esc(r.item.name)}</td><td>${esc(r.item.uom)}</td>${chosen.map((c) => `<td class="n">${n(c.get(r))}</td>`).join('')}</tr>`;
      let body = '';
      if (layout === 'table') body = `<table><thead>${head}</thead><tbody>${rows.map(line).join('')}</tbody></table>`;
      else {
        const fam = new Map<string, Map<string, Map<string, LedgerRow[]>>>();
        for (const r of rows) {
          const f = r.group.family ?? 'Not filed'; const s = r.group.subfamily ?? '—'; const v = r.group.variant ?? '—';
          if (!fam.has(f)) fam.set(f, new Map()); const sm = fam.get(f)!;
          if (!sm.has(s)) sm.set(s, new Map()); const vm = sm.get(s)!;
          if (!vm.has(v)) vm.set(v, []); vm.get(v)!.push(r);
        }
        for (const [f, sm] of fam) {
          body += `<h2>${esc(f)}</h2>`;
          for (const [s, vm] of sm) {
            body += `<h3>${esc(s)}</h3>`;
            for (const [v, list] of vm) body += `<h4>${esc(v)} <span>(${list.length} item${list.length === 1 ? '' : 's'})</span></h4><table><thead>${head}</thead><tbody>${list.map(line).join('')}</tbody></table>`;
          }
        }
      }
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
        body{font:12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:24px}
        h1{font-size:18px;margin:0 0 4px} .sub{color:#555;margin:0 0 16px}
        h2{font-size:15px;margin:18px 0 4px;border-bottom:2px solid #333;padding-bottom:2px} h3{font-size:13px;margin:12px 0 4px;color:#333}
        h4{font-size:12px;margin:8px 0 4px;color:#555} h4 span{font-weight:400}
        table{border-collapse:collapse;width:100%;margin-bottom:8px;page-break-inside:auto} tr{page-break-inside:avoid}
        th,td{border:1px solid #bbb;padding:3px 6px;text-align:left} th{background:#eee} .n{text-align:right;font-variant-numeric:tabular-nums} .c{font-family:ui-monospace,Consolas,monospace;white-space:nowrap}
        @page{size:A4;margin:12mm} @media print{body{margin:0}}
      </style></head><body><h1>${esc(title)}</h1><p class="sub">${esc(filterWords)} · ${rows.length} item${rows.length === 1 ? '' : 's'} · printed ${esc(new Date().toLocaleString())}</p>${body}
      </body></html>`;
      // printed from a hidden frame of this page: no pop-up for a blocker to stop (the rows are read first, after the click)
      document.querySelectorAll('iframe[data-stock-print]').forEach((x) => x.remove());
      const frame = document.createElement('iframe');
      frame.setAttribute('data-stock-print', '1');
      Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
      document.body.appendChild(frame);
      const doc = frame.contentWindow?.document;
      if (!doc) { setError('The page could not be prepared for printing.'); return; }
      doc.open(); doc.write(html); doc.close();
      window.setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); }, 250);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };

  const csv = async () => {
    setBusy('csv'); setError(null);
    try {
      const rows = await rowsAll();
      const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [['Family', 'Sub-family', 'Variant', 'Code', 'Item', 'Unit', ...chosen.map((c) => c.label)].map(q).join(','),
        ...rows.map((r) => [r.group.family, r.group.subfamily, r.group.variant, r.item.code, r.item.name, r.item.uom, ...chosen.map((c) => n(c.get(r)))].map(q).join(','))];
      const blob = new Blob([String.fromCharCode(0xfeff) + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });   // BOM: Excel reads it as UTF-8
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${title.replace(/[^A-Za-z0-9 _-]+/g, '').replace(/\s+/g, '-')}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Print or download the stock</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Every item the filters give ({filterWords}) — not only the page on screen.</Typography>
        <Box>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mb: 0.75 }}>Layout</Typography>
          <ToggleButtonGroup exclusive size="small" value={layout} onChange={(_, v) => v && setLayout(v)}>
            <ToggleButton value="grouped" data-testid="print-grouped">Grouped: family › sub-family › variant</ToggleButton>
            <ToggleButton value="table" data-testid="print-table">One table</ToggleButton>
          </ToggleButtonGroup>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.5 }}>{layout === 'grouped' ? 'A heading for each family, sub-family and variant, its items under it.' : 'One table; its first columns are family, sub-family and variant.'}</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Columns (code, item and unit always)</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
            {COLS.map((c) => (
              <FormControlLabel key={c.key} label={c.label} control={<Checkbox size="small" checked={cols.includes(c.key)} onChange={(e) => setCols((x) => (e.target.checked ? [...x, c.key] : x.filter((k) => k !== c.key)))} />} />
            ))}
          </Box>
        </Box>
        {error && <Typography sx={{ color: 'var(--c-danger-700, #b42318)', fontSize: 13.5 }}>{error}</Typography>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={!!busy}>Cancel</Button>
        <Button variant="outlined" startIcon={busy === 'csv' ? <CircularProgress size={14} /> : <DownloadRounded />} disabled={!!busy} onClick={() => void csv()} data-testid="stock-download">Download (Excel)</Button>
        <Button variant="contained" startIcon={busy === 'print' ? <CircularProgress size={14} color="inherit" /> : <PrintRounded />} disabled={!!busy} onClick={() => void print()} data-testid="stock-print">Print / save as PDF</Button>
      </DialogActions>
    </Dialog>
  );
}
