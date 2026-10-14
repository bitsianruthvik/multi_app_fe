import { useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { CfApiError } from '../../api/client';
import { addNestPlates, type NestMissingPlate, type NestPlatesAdded, type NestPlateToAdd } from '../../api/nesting';
import { mm } from '../../lib/nesting';
import { Mono } from '../ui';

/**
 * PLATE SIZES THE FILES USE THAT THE CATALOG DOES NOT HAVE.
 *
 * The preview lists them; this adds them, by default as custom sizes. "Add all" is
 * the short way (one confirmation); "Choose…" is the long one: tick which, make
 * some standard, change a code. The server decides what each size is called and
 * whether it can be made — a size it cannot make is listed with its reason and
 * is never sent. A refusal (a code already taken, a grade that is not an option)
 * is shown in the server's own words and the dialog stays open to correct it.
 * When it is done the preview runs again by itself, so the blocker goes away.
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** 10 mm × 6,000 × 2,000 — the thickness is left out when the file did not give one. */
const sizeText = (p: NestMissingPlate) => `${p.thickness != null ? `${mm(p.thickness)} mm × ` : ''}${mm(p.length)} × ${mm(p.width)}`;
const gradeText = (p: NestMissingPlate) => [p.grade, p.impactClass].filter(Boolean).join(' ');
const listWords = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/** "Added A and B to the catalog as custom sizes, and C as a standard size." */
function addedSentence(created: NestPlatesAdded['created']): string {
  const custom = created.filter((c) => c.kind !== 'standard').map((c) => c.code);
  const standard = created.filter((c) => c.kind === 'standard').map((c) => c.code);
  const sizes = (list: string[], kind: string) => (list.length === 1 ? `a ${kind} size` : `${kind} sizes`);
  if (custom.length && standard.length) {
    return `Added ${listWords(custom)} to the catalog as ${sizes(custom, 'custom')}, and ${listWords(standard)} as ${sizes(standard, 'standard')}.`;
  }
  if (standard.length) return `Added ${listWords(standard)} to the catalog as ${sizes(standard, 'standard')}.`;
  return `Added ${listWords(custom)} to the catalog as ${sizes(custom, 'custom')}.`;
}

/** What the add left: said once, above the files, and kept while the preview runs again. */
export function MissingAdded({ added }: { added: NestPlatesAdded }) {
  const said = added.created.length > 0;
  return (
    <Alert severity={said ? 'success' : 'warning'} data-testid="missing-added" sx={{ overflowWrap: 'anywhere' }}>
      {said && <Box>{addedSentence(added.created)}</Box>}
      {added.skipped.length > 0 && (
        <>
          <Box sx={{ fontWeight: 600 }}>Not added:</Box>
          <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.3 }}>
            {added.skipped.map((s) => <li key={s.key}>{s.why}</li>)}
          </Box>
        </>
      )}
    </Alert>
  );
}

/** The server's refusal, in its words: the message, then every problem it listed. */
function ErrorBlock({ error }: { error: CfApiError }) {
  return (
    <Alert severity="error" data-testid="missing-error" sx={{ overflowWrap: 'anywhere' }}>
      <Box sx={{ fontWeight: 600 }}>{error.message}</Box>
      {error.problems.length > 0 && (
        <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.3 }}>
          {error.problems.map((p) => <li key={p}>{p}</li>)}
        </Box>
      )}
    </Alert>
  );
}

interface Pick { on: boolean; code: string; kind: 'custom' | 'standard' }

export function NestMissingPlates({ plates, orderId, lineId, canEditCatalog, onAdded }: {
  plates: NestMissingPlate[];
  orderId: number;
  lineId: number;
  canEditCatalog: boolean;
  onAdded: (out: NestPlatesAdded) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [choose, setChoose] = useState(false);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);

  const creatable = plates.filter((p) => p.canCreate);
  const nAll = creatable.length;
  const ticked = creatable.filter((p) => picks[p.key]?.on);

  const send = async (body: NestPlateToAdd[]) => {
    setBusy(true); setError(null);
    try {
      const out = await addNestPlates(orderId, lineId, body);
      setConfirm(false); setChoose(false);
      onAdded(out);
    } catch (e) { setError(e as CfApiError); } finally { setBusy(false); }
  };
  const addAll = () => send(creatable.map((p) => ({ key: p.key, kind: 'custom' as const })));
  const addChosen = () => send(ticked.map((p) => {
    const pick = picks[p.key];
    const code = pick.code.trim();
    // The code goes only when the user changed it (or typed one where there was none).
    return { key: p.key, kind: pick.kind, ...(code && code !== (p.suggestedCode ?? '') ? { code } : {}) };
  }));

  const openChoose = () => {
    setPicks(Object.fromEntries(creatable.map((p) => [p.key, { on: true, code: p.suggestedCode ?? '', kind: 'custom' as const }])));
    setError(null); setChoose(true);
  };
  const setPick = (key: string, change: Partial<Pick>) => setPicks((o) => ({ ...o, [key]: { ...o[key], ...change } }));
  const setAll = (on: boolean) => setPicks((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { ...v, on }])));

  const spinner = busy ? <CircularProgress size={15} color="inherit" /> : undefined;

  return (
    <>
    <Alert severity="warning" data-testid="missing-plates" sx={{ overflowWrap: 'anywhere', minWidth: 0 }}>
      <Box sx={{ fontWeight: 600 }}>
        {plates.length === 1 ? '1 plate size in these files is not in your catalog' : `${plates.length} plate sizes in these files are not in your catalog`}
      </Box>
      <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, display: 'grid', gap: 0.4, fontSize: 13 }}>
        {plates.map((p) => (
          <li key={p.key} data-testid="missing-plate" data-key={p.key}>
            <span>{[sizeText(p), gradeText(p) || null, `used by ${plural(p.plates, 'plate', 'plates')}`].filter(Boolean).join(' · ')}</span>
            {!p.canCreate && p.why && <Box component="span" sx={{ color: 'var(--c-danger-700, var(--c-danger-800))' }}>{` — cannot be added here: ${p.why}`}</Box>}
            {p.note && <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{p.note}</Box>}
          </li>
        ))}
      </Box>
      {!canEditCatalog && (
        <Typography data-testid="missing-ask" sx={{ fontSize: 13, mt: 1 }}>Ask someone who manages the catalog to add them.</Typography>
      )}
      {canEditCatalog && nAll > 0 && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
          <Button variant="contained" size="small" data-testid="missing-add-all" disabled={busy}
            onClick={() => { setError(null); setConfirm(true); }}>
            {nAll === 1 ? 'Add it to the catalog' : `Add all ${nAll} to the catalog`}
          </Button>
          <Button variant="outlined" size="small" data-testid="missing-choose" disabled={busy} onClick={openChoose}>Choose…</Button>
        </Box>
      )}
      {!choose && !confirm && error && <Box sx={{ mt: 1 }}><ErrorBlock error={error} /></Box>}
    </Alert>

      {/* "Add all": one sentence of consequence, then the call. */}
      <Dialog open={confirm} onClose={busy ? undefined : () => setConfirm(false)} maxWidth="sm" fullWidth data-testid="missing-confirm" aria-labelledby="missing-confirm-title">
        <DialogTitle id="missing-confirm-title">{nAll === 1 ? 'Add this plate size to the catalog?' : `Add ${nAll} plate sizes to the catalog?`}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 1, minWidth: 0 }}>
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.4, fontSize: 13.5, overflowWrap: 'anywhere' }}>
              {creatable.map((p) => (
                <li key={p.key}>
                  {p.suggestedCode ? <Mono>{p.suggestedCode}</Mono> : sizeText(p)}
                  <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{' as a custom size'}</Box>
                </li>
              ))}
            </Box>
            <Typography sx={{ fontSize: 13 }}>They are added as custom sizes — you can make one standard later, in Items.</Typography>
            {error && confirm && <ErrorBlock error={error} />}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)} disabled={busy}>Go back</Button>
          <Button variant="contained" data-testid="missing-confirm-add" onClick={addAll} disabled={busy} startIcon={spinner}>
            {nAll === 1 ? 'Add 1 plate' : `Add ${nAll} plates`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* "Choose…": every missing size, with what the user can settle per size. */}
      <Dialog open={choose} onClose={busy ? undefined : () => setChoose(false)} maxWidth="md" fullWidth data-testid="missing-dialog" aria-labelledby="missing-dialog-title">
        <DialogTitle id="missing-dialog-title">Add plate sizes to the catalog</DialogTitle>
        <DialogContent dividers sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
              Tick the sizes to add. Each is a custom size unless you make it standard — a line set to nest on standard plates only uses just those.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" data-testid="missing-all" disabled={busy} onClick={() => setAll(true)}>Select all</Button>
              <Button size="small" data-testid="missing-none" disabled={busy} onClick={() => setAll(false)}>Select none</Button>
            </Box>
            <Box sx={{ overflowX: 'auto', minWidth: 0 }}>
              <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, '& th': { textAlign: 'left', fontWeight: 600, color: 'var(--c-text-2)' }, '& th, & td': { p: 0.75, borderBottom: '1px solid var(--c-divider)', verticalAlign: 'middle' } }}>
                <thead>
                  <tr>
                    <th><span style={{ position: 'absolute', left: -9999 }}>Add</span></th>
                    <th>Size</th><th>Grade</th><th>Impact class</th><th>Used by</th><th>Code</th><th>Kind</th>
                  </tr>
                </thead>
                <tbody>
                  {plates.map((p) => {
                    const pick = picks[p.key];
                    const words = `${sizeText(p)} ${gradeText(p)}`.trim();
                    return (
                      <tr key={p.key} data-testid="missing-row" data-key={p.key}>
                        {p.canCreate && pick ? (
                          <>
                            <td><Checkbox size="small" checked={pick.on} disabled={busy} onChange={(e) => setPick(p.key, { on: e.target.checked })} slotProps={{ input: { 'aria-label': `Add ${words}` } }} /></td>
                            <td>{sizeText(p)}</td>
                            <td>{p.grade ?? '—'}</td>
                            <td>{p.impactClass ?? '—'}</td>
                            <td>{plural(p.plates, 'plate', 'plates')}</td>
                            <td>
                              <TextField size="small" value={pick.code} disabled={busy || !pick.on} onChange={(e) => setPick(p.key, { code: e.target.value })}
                                slotProps={{ htmlInput: { 'aria-label': `Code for ${words}` } }} sx={{ minWidth: 190 }} />
                            </td>
                            <td>
                              <ToggleButtonGroup size="small" exclusive value={pick.kind} disabled={busy || !pick.on} aria-label={`Kind for ${words}`}
                                onChange={(_, v) => { if (v) setPick(p.key, { kind: v }); }}>
                                <ToggleButton value="custom">Custom</ToggleButton>
                                <ToggleButton value="standard">Standard</ToggleButton>
                              </ToggleButtonGroup>
                            </td>
                          </>
                        ) : (
                          <>
                            <td />
                            <td>{sizeText(p)}</td>
                            <td>{p.grade ?? '—'}</td>
                            <td>{p.impactClass ?? '—'}</td>
                            <td>{plural(p.plates, 'plate', 'plates')}</td>
                            <td colSpan={2} style={{ color: 'var(--c-danger-700, var(--c-danger-800))', overflowWrap: 'anywhere' }}>{p.why ?? 'This size cannot be added here.'}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </Box>
            </Box>
            {error && choose && <ErrorBlock error={error} />}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChoose(false)} disabled={busy}>Cancel</Button>
          <Button variant="contained" data-testid="missing-dialog-add" onClick={addChosen} disabled={busy || ticked.length === 0} startIcon={spinner}>
            {ticked.length === 1 ? 'Add 1 plate' : `Add ${ticked.length} plates`}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

