/**
 * BlankNesting — nesting as one table of BLANKS.
 *
 * ── WHY THIS REPLACES THE BOARD AND THE SUGGESTOR ────────────────────────────
 *
 * Both of those link a plate straight to a finished part. So an order needing
 * 960 identical stiffeners holds 960 separate claims on steel, and the fact that
 * they are ONE rectangle cut 960 times is nowhere on screen — you had to read it
 * off a drag-and-drop board 960 cards long.
 *
 * A row here is a BLANK: material, grade and a rectangle, with a count. On the
 * KEPL order that turns 25 part names into 24 rows.
 *
 * ── WHAT ACCEPTING DOES ──────────────────────────────────────────────────────
 *
 * Creates the blanks as real items, records which plate each is cut from, points
 * every part at its blank, and raises the cutting work on the order's own
 * production order. Not a separate document — cutting is ordinary work.
 *
 * ── YIELD IS THE NUMBER TO ARGUE WITH ────────────────────────────────────────
 *
 * Green is fine, amber is worth a look, red says the plate is wrong. It is the
 * one column that turns "the computer chose a plate" into a decision somebody
 * can overrule, which is why the alternatives sit one click away on every row
 * rather than behind a separate "suggest" flow.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, IconButton, LinearProgress,
  MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RefreshIcon from '@mui/icons-material/Refresh';

import { fabGet, fabPost, fabQuery } from '../api/client';
import { backendMessage } from '../components';

interface Candidate {
  plateCatalogItemId: number;
  code: string | null;
  name: string;
  thickness: number;
  width: number;
  length: number;
  isDrop: boolean;
  perPlate: number;
  plates: number;
  coversAll: boolean;
  buyKg: number;
  grossKg: number;
  yield: number;
}

interface Blank {
  key: string;
  code: string;
  name: string;
  material: string | null;
  grade: string | null;
  thickness: number;
  width: number;
  length: number;
  qty: number;
  unitWeightKg: number;
  totalWeightKg: number;
  partNames: string[];
  partCount: number;
  catalogItemId: number | null;
  nestNo: string | null;
  flowId: number | null;
  chosen: Candidate | null;
  chosenIsSaved: boolean;
  alternatives: Candidate[];
  candidateCount: number;
}

interface Summary {
  blanks: number; pieces: number; plates: number;
  boughtKg: number; usedKg: number; dropKg: number; yield: number; unplaced: number;
}

const t = (kg: number) => `${(kg / 1000).toFixed(1)} t`;
const rect = (o: { thickness: number; width: number; length: number }) =>
  `${o.thickness} × ${o.width} × ${o.length}`;

/** Green above 90, amber above 75, red below. Steel is expensive. */
const yieldColour = (y: number) =>
  (y >= 0.9 ? 'var(--c-success-600)' : y >= 0.75 ? 'var(--c-warning-600)' : 'var(--c-danger-600)');

export default function BlankNesting({
  orderId, canManage, onStageChanged,
}: {
  orderId: number | string;
  canManage: boolean;
  onStageChanged?: () => void;
}) {
  const [blanks, setBlanks] = useState<Blank[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [skipped, setSkipped] = useState<{ name: string; reason: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  /** Plate overrides made on screen, not yet saved. */
  const [override, setOverride] = useState<Record<string, number>>({});
  /** Flow overrides, same. */
  const [flowOverride, setFlowOverride] = useState<Record<string, number>>({});

  const [flows, setFlows] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    fabQuery<{ data: { id: number; name: string }[] }>('fabErpOperationFlow', {
      filters: { active: 1 },
      orderBy: [{ field: 'name', direction: 'asc' }],
      pagination: { limit: 200 },
    }).then((r) => setFlows(r.data ?? [])).catch(() => setFlows([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fabGet<{ blanks: Blank[]; summary: Summary; skipped: typeof skipped }>(
        `orders/${orderId}/blanks`,
      );
      setBlanks(res.blanks ?? []);
      setSummary(res.summary ?? null);
      setSkipped(res.skipped ?? []);
      setOverride({});
      setFlowOverride({});
    } catch (err) {
      setError(backendMessage(err, 'Could not work out what this order needs cutting.'));
      setBlanks([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const plateFor = useCallback((b: Blank): Candidate | null => {
    const id = override[b.key];
    if (id != null) return b.alternatives.find((c) => c.plateCatalogItemId === id) ?? b.chosen;
    return b.chosen;
  }, [override]);

  /**
   * The totals as they stand ON SCREEN, including unsaved overrides — otherwise
   * changing a plate would show its effect on one row and not on the figure the
   * decision is actually made against.
   */
  const live = useMemo(() => {
    let plates = 0; let boughtKg = 0; let usedKg = 0; let unplaced = 0;
    for (const b of blanks) {
      usedKg += b.totalWeightKg;
      const c = plateFor(b);
      if (!c) { unplaced += 1; continue; }
      plates += c.plates;
      boughtKg += c.grossKg;
    }
    return {
      plates, boughtKg, usedKg, unplaced,
      dropKg: Math.max(0, boughtKg - usedKg),
      yield: boughtKg > 0 ? usedKg / boughtKg : 0,
    };
  }, [blanks, plateFor]);

  const dirty = Object.keys(override).length > 0 || Object.keys(flowOverride).length > 0;
  const anySaved = blanks.some((b) => b.chosenIsSaved);

  const accept = useCallback(async () => {
    setAccepting(true);
    setError(null);
    setResult(null);
    try {
      const plan: Record<string, unknown> = {};
      for (const b of blanks) {
        const c = plateFor(b);
        if (!c) continue;
        plan[b.key] = {
          plateCatalogItemId: c.plateCatalogItemId,
          plates: c.plates,
          perPlate: c.perPlate,
          plateWidth: c.width,
          plateLength: c.length,
          flowId: flowOverride[b.key] ?? b.flowId ?? undefined,
        };
      }
      const res = await fabPost<{
        productionOrderNumber: string; blanks: number; tasks: number; partsRepointed: number;
      }>(`orders/${orderId}/blanks/accept`, { plan });
      setResult(
        `${res.blanks} blanks on ${res.productionOrderNumber} — `
        + `${res.tasks} task${res.tasks === 1 ? '' : 's'} raised, `
        + `${res.partsRepointed} part rows now come off a blank.`,
      );
      await load();
      onStageChanged?.();
    } catch (err) {
      setError(backendMessage(err, 'That plan could not be accepted.'));
    } finally {
      setAccepting(false);
    }
  }, [blanks, plateFor, flowOverride, orderId, load, onStageChanged]);

  if (loading) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={24} /></Box>;
  }

  if (!blanks.length) {
    return (
      <Box sx={{ p: 2 }}>
        {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
        <Alert severity="info" variant="outlined">
          Nothing to nest yet. Nesting groups the order&rsquo;s parts into rectangles, and a part
          needs a size before it can be one. Fill the sizes in on the Structure step.
          {skipped.length > 0 && (
            <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2.5 }}>
              {skipped.slice(0, 6).map((s, i) => (
                <li key={i}><b>{s.name}</b> — {s.reason}</li>
              ))}
              {skipped.length > 6 && <li>…and {skipped.length - 6} more</li>}
            </Box>
          )}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      {error && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {result && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setResult(null)}>{result}</Alert>}

      {/* ── the numbers ──────────────────────────────────────────────────── */}
      <Stack direction="row" spacing={0} sx={{
        mb: 2, border: '1px solid var(--c-border)', borderRadius: '10px',
        overflow: 'hidden', background: 'var(--c-surface-2)', flexWrap: 'wrap',
      }}>
        {[
          ['Blanks', String(summary?.blanks ?? blanks.length), null],
          ['Pieces to cut', (live.usedKg > 0 ? blanks.reduce((a, b) => a + b.qty, 0) : 0).toLocaleString(), null],
          ['Plates', String(live.plates), null],
          ['Steel bought', t(live.boughtKg), null],
          ['Yield', `${(live.yield * 100).toFixed(1)}%`, yieldColour(live.yield)],
          ['Drop', t(live.dropKg), null],
        ].map(([k, v, colour]) => (
          <Box key={String(k)} sx={{
            px: 2, py: 1.25, borderRight: '1px solid var(--c-divider)', minWidth: 118,
          }}>
            <Typography sx={{
              fontSize: 10.5, fontWeight: 600, letterSpacing: '.075em',
              textTransform: 'uppercase', color: 'var(--c-text-3)',
            }}>{k}</Typography>
            <Typography sx={{
              fontFamily: 'var(--font-mono, monospace)', fontSize: 20, fontWeight: 600,
              fontVariantNumeric: 'tabular-nums', color: (colour as string) ?? 'var(--c-text)',
            }}>{v}</Typography>
          </Box>
        ))}
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap' }}>
        <Chip
          size="small"
          color={anySaved && !dirty ? 'success' : 'warning'}
          variant="outlined"
          label={dirty ? 'Changed — not saved' : anySaved ? 'Plan accepted' : 'Plan not accepted'}
        />
        {live.unplaced > 0 && (
          <Chip size="small" color="error" variant="outlined"
            label={`${live.unplaced} with no plate that fits`} />
        )}
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<RefreshIcon />} onClick={() => void load()}>Recalculate</Button>
      </Stack>

      {/* ── one row per blank ────────────────────────────────────────────── */}
      <Box sx={{ border: '1px solid var(--c-border)', borderRadius: '10px', overflow: 'hidden' }}>
        <Stack direction="row" spacing={1} sx={{
          px: 1.5, py: 0.75, background: 'var(--c-surface-2)',
          borderBottom: '1px solid var(--c-border)',
        }}>
          <Box sx={{ width: 26, flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}><Hd>Blank</Hd></Box>
          <Box sx={{ width: 70, flexShrink: 0, textAlign: 'right' }}><Hd>Need</Hd></Box>
          <Box sx={{ width: 190, flexShrink: 0 }}><Hd>Cut from</Hd></Box>
          <Box sx={{ width: 62, flexShrink: 0, textAlign: 'right' }}><Hd>Per</Hd></Box>
          <Box sx={{ width: 62, flexShrink: 0, textAlign: 'right' }}><Hd>Plates</Hd></Box>
          <Box sx={{ width: 96, flexShrink: 0, textAlign: 'right' }}><Hd>Yield</Hd></Box>
          <Box sx={{ width: 150, flexShrink: 0 }}><Hd>Cut by</Hd></Box>
        </Stack>

        {blanks.map((b) => {
          const c = plateFor(b);
          const isOpen = open.has(b.key);
          const changed = override[b.key] != null || flowOverride[b.key] != null;
          return (
            <Box key={b.key} sx={{ borderBottom: '1px solid var(--c-divider)' }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{
                px: 1.5, py: 0.85,
                background: changed ? 'var(--c-primary-50)' : undefined,
                '&:hover': { background: changed ? 'var(--c-primary-50)' : 'var(--c-surface-2)' },
              }}>
                <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setOpen((o) => {
                  const n = new Set(o); if (n.has(b.key)) n.delete(b.key); else n.add(b.key); return n;
                })}>
                  {isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                </IconButton>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{
                    fontFamily: 'var(--font-mono, monospace)', fontSize: 13.5, fontWeight: 600,
                  }}>{rect(b)}</Typography>
                  <Typography noWrap sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                    {b.partNames.join(' · ')}
                  </Typography>
                </Box>

                <Box sx={{ width: 70, flexShrink: 0, textAlign: 'right' }}>
                  <Typography sx={{
                    fontFamily: 'var(--font-mono, monospace)', fontSize: 14, fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}>{b.qty}</Typography>
                </Box>

                <Box sx={{ width: 190, flexShrink: 0 }}>
                  {c ? (
                    <>
                      <Typography noWrap sx={{
                        fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5,
                      }}>{rect(c)}</Typography>
                      <Typography noWrap sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                        {c.isDrop ? 'from an offcut' : `${b.material ?? ''} ${b.grade ?? ''}`.trim()}
                      </Typography>
                    </>
                  ) : (
                    <Chip size="small" color="error" variant="outlined" label="nothing fits" />
                  )}
                </Box>

                <Box sx={{ width: 62, flexShrink: 0, textAlign: 'right' }}>
                  <Mono>{c?.perPlate ?? '—'}</Mono>
                </Box>
                <Box sx={{ width: 62, flexShrink: 0, textAlign: 'right' }}>
                  <Mono>{c?.plates ?? '—'}</Mono>
                </Box>

                <Box sx={{ width: 96, flexShrink: 0 }}>
                  {c && (
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
                      <Box sx={{
                        width: 40, height: 6, borderRadius: 3, flexShrink: 0,
                        background: 'var(--c-surface-3, #EFF1F8)', overflow: 'hidden',
                      }}>
                        <Box sx={{
                          width: `${Math.round(c.yield * 100)}%`, height: '100%',
                          background: yieldColour(c.yield),
                        }} />
                      </Box>
                      <Typography sx={{
                        fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5, fontWeight: 600,
                        width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                      }}>{(c.yield * 100).toFixed(0)}%</Typography>
                    </Stack>
                  )}
                </Box>

                {/*
                  * THE FLOW, per blank. Almost everything is cut and nothing
                  * else, which is why the default is one step — but a rectangle
                  * that also gets drilled while it is flat belongs on a
                  * different flow, and that is a per-blank fact.
                  */}
                <Box sx={{ width: 150, flexShrink: 0 }}>
                  <TextField
                    select size="small" fullWidth disabled={!canManage}
                    value={flowOverride[b.key] ?? b.flowId ?? ''}
                    onChange={(e) => setFlowOverride((f) => ({
                      ...f, [b.key]: Number(e.target.value),
                    }))}
                    slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: 12.5 } } }}
                  >
                    <MenuItem value=""><em>Cutting (default)</em></MenuItem>
                    {flows.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
                  </TextField>
                </Box>
              </Stack>

              {/* ── the alternatives ───────────────────────────────────── */}
              <Collapse in={isOpen} unmountOnExit>
                <Box sx={{ px: 5, py: 1.5, background: 'var(--c-surface-2)' }}>
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 1 }}>
                    {b.candidateCount} plate size{b.candidateCount === 1 ? '' : 's'} could hold this
                    rectangle. Cheapest steel first; an offcut costs nothing because it is already
                    paid for.
                  </Typography>
                  <Stack spacing={0.75}>
                    {b.alternatives.map((a) => {
                      const on = (override[b.key] ?? c?.plateCatalogItemId) === a.plateCatalogItemId;
                      return (
                        <Stack
                          key={a.plateCatalogItemId}
                          direction="row" spacing={1.5} alignItems="center"
                          onClick={canManage ? () => setOverride((o) => ({
                            ...o, [b.key]: a.plateCatalogItemId,
                          })) : undefined}
                          sx={{
                            px: 1.25, py: 0.75, borderRadius: '8px', cursor: canManage ? 'pointer' : 'default',
                            border: `1px solid ${on ? 'var(--c-primary-500)' : 'var(--c-border)'}`,
                            background: on ? 'var(--c-primary-50)' : 'var(--c-surface)',
                          }}
                        >
                          <Box sx={{
                            width: 13, height: 13, borderRadius: '50%', flexShrink: 0,
                            border: `1.5px solid ${on ? 'var(--c-primary-600)' : 'var(--c-text-3)'}`,
                            display: 'grid', placeItems: 'center',
                          }}>
                            {on && <Box sx={{
                              width: 7, height: 7, borderRadius: '50%', background: 'var(--c-primary-600)',
                            }} />}
                          </Box>
                          <Typography sx={{
                            fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5, flex: 1, minWidth: 0,
                          }} noWrap>{rect(a)}</Typography>
                          {a.isDrop && <Chip size="small" color="success" variant="outlined" label="offcut" />}
                          {!a.coversAll && (
                            <Tooltip title="This size cannot hold the whole quantity on its own.">
                              <Chip size="small" color="warning" variant="outlined" label="partial" />
                            </Tooltip>
                          )}
                          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', width: 190, textAlign: 'right' }}>
                            {a.perPlate}/plate · {a.plates} plate{a.plates === 1 ? '' : 's'} · {t(a.grossKg)}
                          </Typography>
                          <Typography sx={{
                            fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5, fontWeight: 600,
                            width: 42, textAlign: 'right', color: yieldColour(a.yield),
                          }}>{(a.yield * 100).toFixed(0)}%</Typography>
                        </Stack>
                      );
                    })}
                  </Stack>

                  <Stack direction="row" spacing={3} sx={{ mt: 1.5 }}>
                    <Kv k="Blank code" v={b.code} />
                    <Kv k="Used by" v={`${b.partCount} part row${b.partCount === 1 ? '' : 's'}`} />
                    <Kv k="Steel in parts" v={t(b.totalWeightKg)} />
                    {b.nestNo && <Kv k="Nest" v={b.nestNo} />}
                  </Stack>
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </Box>

      {skipped.length > 0 && (
        <Alert severity="warning" variant="outlined" sx={{ mt: 2 }}>
          {skipped.length} part row{skipped.length === 1 ? '' : 's'} could not be turned into a
          blank: {skipped.slice(0, 3).map((s) => `${s.name} (${s.reason})`).join(', ')}
          {skipped.length > 3 && `, and ${skipped.length - 3} more`}.
        </Alert>
      )}

      {/* ── accept ───────────────────────────────────────────────────────── */}
      {canManage && (
        <Stack direction="row" spacing={2} alignItems="center" sx={{
          mt: 2, p: 1.75, borderRadius: '10px', background: 'var(--c-surface-2)',
          border: '1px solid var(--c-border)', flexWrap: 'wrap',
        }}>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', flex: '1 1 320px', minWidth: 0 }}>
            Accepting creates <b>{blanks.length} blanks</b>, records which plate each is cut from,
            points every part at its blank, and raises the cutting work on this order&rsquo;s
            production order.
          </Typography>
          <Button
            variant="contained"
            disabled={accepting || live.unplaced === blanks.length}
            onClick={() => void accept()}
          >
            {accepting ? 'Working…' : anySaved && !dirty ? 'Re-accept plan' : 'Accept plan'}
          </Button>
        </Stack>
      )}
      {accepting && <LinearProgress sx={{ mt: 1 }} />}
    </Box>
  );
}

function Hd({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{
      fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em',
      textTransform: 'uppercase', color: 'var(--c-text-3)',
    }}>{children}</Typography>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{
      fontFamily: 'var(--font-mono, monospace)', fontSize: 13,
      fontVariantNumeric: 'tabular-nums',
    }}>{children}</Typography>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <Box>
      <Typography sx={{
        fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em',
        textTransform: 'uppercase', color: 'var(--c-text-3)',
      }}>{k}</Typography>
      <Typography sx={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5 }}>{v}</Typography>
    </Box>
  );
}
