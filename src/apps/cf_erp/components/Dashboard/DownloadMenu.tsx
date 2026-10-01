/**
 * "Download" on every dashboard tab: Excel (one workbook, a sheet per table) or
 * one CSV per table, built from the data the tab already holds and respecting its
 * filters and the period. `extra` adds an item that must fetch more first (the By
 * order tab's "every piece, all levels").
 */
import { useState } from 'react';
import { Button, Divider, ListItemText, Menu, MenuItem } from '@mui/material';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import { fileStem, saveCsv, saveXlsx, type Table } from '../../lib/dashboardExport';

export interface ExtraDownload { key: string; label: string; hint?: string; as: 'xlsx' | 'csv-all'; build: () => Promise<Table[]> }

export function DownloadMenu({ tab, from, to, tables, extra = [], disabled = false }: {
  tab: string; from: string; to: string; tables: () => Table[]; extra?: ExtraDownload[]; disabled?: boolean;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => setAnchor(null);
  const list = anchor ? tables() : [];
  const run = async (key: string, build: () => Promise<Table[]>, as: 'xlsx' | 'csv-all') => {
    setBusy(key); setError(null);
    try {
      const ts = await build();
      if (as === 'xlsx') saveXlsx(fileStem(tab, from, to), ts);
      else for (const t of ts) saveCsv(fileStem(tab, from, to, t.name), t);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The download failed.');
    } finally { setBusy(null); }
  };
  return (
    <>
      <Button size="small" variant="outlined" startIcon={<DownloadRounded />} onClick={(e) => setAnchor(e.currentTarget)} disabled={disabled}
        data-testid="download-button" aria-haspopup="menu" aria-expanded={!!anchor}>Download</Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={close} slotProps={{ list: { 'aria-label': 'Download this tab', dense: true } }}>
        <MenuItem data-testid="download-xlsx" onClick={() => { saveXlsx(fileStem(tab, from, to), tables()); close(); }}>
          <ListItemText primary="Excel workbook (.xlsx)" secondary={`${list.length} sheets: ${list.map((t) => t.name).join(', ')}`} />
        </MenuItem>
        <Divider />
        {list.map((t) => (
          <MenuItem key={t.name} data-testid="download-csv" data-table={t.name} onClick={() => { saveCsv(fileStem(tab, from, to, t.name), t); close(); }}>
            <ListItemText primary={`CSV — ${t.name}`} secondary={`${t.rows.length.toLocaleString('en-IN')} rows`} />
          </MenuItem>
        ))}
        {extra.length > 0 && <Divider />}
        {extra.map((x) => (
          <MenuItem key={x.key} data-testid={`download-${x.key}`} disabled={busy != null} onClick={() => { void run(x.key, x.build, x.as); }}>
            <ListItemText primary={busy === x.key ? 'Reading every piece…' : x.label} secondary={x.hint} />
          </MenuItem>
        ))}
        {error && <MenuItem disabled sx={{ color: 'var(--c-danger-800)', whiteSpace: 'normal', maxWidth: 320 }}>{error}</MenuItem>}
      </Menu>
    </>
  );
}
