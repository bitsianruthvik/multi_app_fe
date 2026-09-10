/**
 * BlankNesting — nesting as blanks, and the sheets they come off.
 *
 * ── WHY THIS REPLACES THE BOARD AND THE SUGGESTOR ────────────────────────────
 *
 * Both of those linked a plate straight to a finished part. So an order needing
 * 960 identical stiffeners was 960 cards on a board, and the fact that they are
 * ONE rectangle cut 960 times appeared nowhere. Here a row is that rectangle:
 * 25 part names on the KEPL order become 24 rows.
 *
 * ── TWO VIEWS, BECAUSE THERE ARE TWO QUESTIONS ───────────────────────────────
 *
 *   What has to be cut   the blanks, with the parts that draw on each
 *   How it gets cut      the sheets, each carrying a MIX of rectangles
 *
 * They are not the same list and neither substitutes for the other. A sheet
 * holding a web plate and forty stiffeners is where the steel is saved — on
 * this order 43 of 130 sheets carry more than one rectangle, and packing them
 * separately costs 49 tonnes — so the sheet view has to exist. But "how many
 * stiffeners does this job need" is answered only by the blank view.
 *
 * ── WHAT ACCEPTING DOES ──────────────────────────────────────────────────────
 *
 * Creates the blanks as real items, records every (blank, sheet) pair, points
 * each part at its blank, and raises the cutting work on a production order of
 * its own — separate from fabrication, because cutting waits on plate arriving
 * and fabrication waits on shop capacity.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, IconButton, LinearProgress,
  MenuItem, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import { fabQuery } from '../api/client';
import {
  getBlankPlan, acceptBlankPlan, downloadPlanSheet, uploadPlanSheet,
  type Blank, type Nest, type BlankSummary, type Effort,
} from '../api/blanks';
import { backendMessage } from '../components';

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
  const [nests, setNests] = useState<Nest[]>([]);
  const [summary, setSummary] = useState<BlankSummary | null>(null);
  const [skipped, setSkipped] = useState<{ name: string; reason: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [effort, setEffort] = useState<Effort>('standard');
  const [flowOverride, setFlowOverride] = useState<Record<string, number>>({});

  const [flows, setFlows] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    fabQuery<{ data: { id: number; name: string }[] }>('fabErpOperationFlow', {
      filters: { active: 1 },
      orderBy: [{ field: 'name', direction: 'asc' }],
      pagination: { limit: 200 },
    }).then((r) => setFlows(r.data ?? [])).catch(() => setFlows([]));
  }, []);

  const load = useCallback(async (how: Effort = effort) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getBlankPlan(orderId, how);
      setBlanks(res.blanks ?? []);
      setNests(res.nests ?? []);
      setSummary(res.summary ?? null);
      setSkipped(res.skipped ?? []);
    } catch (err) {
      setError(backendMessage(err, 'Could not work out what this order needs cutting.'));
      setBlanks([]); setNests([]); setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, effort]);

  useEffect(() => { void load(); }, [load]);

  const toggle = useCallback((k: string) => setOpen((o) => {
    const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n;
  }), []);

  const accept = useCallback(async () => {
    setAccepting(true);
    setError(null);
    setResult(null);
    try {
      const res = await acceptBlankPlan(orderId, { nests, flows: flowOverride });
      setResult(
        `${res.blanks} blanks across ${res.sheets} sheets on ${res.cuttingOrderNumber}. `
        + `${res.partsRepointed} part rows now come off a blank.`,
      );
      await load();
      onStageChanged?.();
    } catch (err) {
      setError(backendMessage(err, 'That plan could not be accepted.'));
    } finally {
      setAccepting(false);
    }
  }, [nests, flowOverride, orderId, load, onStageChanged]);

  /**
   * THE SECOND WAY IN.
   *
   * The packer does not know that the 40 mm is stacked behind the 25 mm, or that
   * the cutter wants every diaphragm plate in one setup. A planner who cannot
   * say so keeps the real plan in a spreadsheet beside the software — and then
   * the software is describing a job nobody is doing.
   *
   * So the suggestion is a STARTING POINT that can be taken away, edited and
   * brought back, rather than the only thing the screen will accept.
   */
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const download = useCallback(async () => {
    try {
      await downloadPlanSheet(orderId, effort);
    } catch (err) {
      setError(backendMessage(err, 'Could not produce the sheet.'));
    }
  }, [orderId, effort]);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const res = await uploadPlanSheet(orderId, file);
      const short = res.fromSheet?.short ?? [];
      setResult(
        `Your plan applied: ${res.fromSheet?.sheets ?? res.sheets} sheets from ${res.fromSheet?.rows ?? 0} rows, `
        + `on ${res.cuttingOrderNumber}.`
        + (short.length
          ? ` ${short.length} blank${short.length === 1 ? '' : 's'} not fully covered — `
            + short.slice(0, 3).map((x) => `${x.rect} (${x.planned} of ${x.needed})`).join(', ')
            + (short.length > 3 ? ', and more' : '') + '.'
          : ''),
      );
      await load();
      onStageChanged?.();
    } catch (err) {
      setError(backendMessage(err, 'That sheet could not be read.'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [orderId, load, onStageChanged]);

  const shortBlanks = useMemo(() => blanks.filter((b) => b.short > 0), [blanks]);

  if (loading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress size={24} />
        <Typography sx={{ mt: 1.5, fontSize: 13, color: 'var(--c-text-2)' }}>
          Working out which sheets waste least…
        </Typography>
      </Box>
    );
  }

  if (!blanks.length) {
    return (
      <Box sx={{ p: 2 }}>
        {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
        <Alert severity="info" variant="outlined">
          Nothing to nest yet. Nesting groups this order&rsquo;s parts into rectangles, and a part
          needs a size before it can be one. Fill the sizes in on the Structure step.
          {skipped.length > 0 && (
            <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2.5 }}>
              {skipped.slice(0, 6).map((s, i) => <li key={i}><b>{s.name}</b> — {s.reason}</li>)}
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
        {([
          ['Blanks', String(summary?.blanks ?? 0), null],
          ['Pieces', (summary?.pieces ?? 0).toLocaleString(), null],
          ['Sheets', String(summary?.plates ?? 0), null],
          ['Mixed sheets', String(summary?.mixedPlates ?? 0), 'var(--c-primary-600)'],
          ['Steel bought', t(summary?.boughtKg ?? 0), null],
          ['Yield', `${((summary?.yield ?? 0) * 100).toFixed(1)}%`, yieldColour(summary?.yield ?? 0)],
          ['Drop', t(summary?.dropKg ?? 0), null],
        ] as [string, string, string | null][]).map(([k, v, colour]) => (
          <Box key={k} sx={{ px: 2, py: 1.25, borderRight: '1px solid var(--c-divider)', minWidth: 112 }}>
            <Typography sx={{
              fontSize: 10.5, fontWeight: 600, letterSpacing: '.075em',
              textTransform: 'uppercase', color: 'var(--c-text-3)',
            }}>{k}</Typography>
            <Typography sx={{
              fontFamily: 'var(--font-mono, monospace)', fontSize: 20, fontWeight: 600,
              fontVariantNumeric: 'tabular-nums', color: colour ?? 'var(--c-text)',
            }}>{v}</Typography>
          </Box>
        ))}
      </Stack>

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap' }}>
        {shortBlanks.length > 0 && (
          <Chip size="small" color="error" variant="outlined"
            label={`${shortBlanks.length} blank${shortBlanks.length === 1 ? '' : 's'} not fully placed`} />
        )}
        {(summary?.mixedPlates ?? 0) > 0 && (
          <Tooltip title="A sheet carrying more than one rectangle. This is where the steel is saved.">
            <Chip size="small" color="primary" variant="outlined"
              label={`${summary?.mixedPlates} sheets carry a mix`} />
          </Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        <TextField
          select size="small" label="How hard to look" value={effort}
          onChange={(e) => { const v = e.target.value as typeof effort; setEffort(v); void load(v); }}
          sx={{ width: 168 }}
        >
          <MenuItem value="quick">Quick</MenuItem>
          <MenuItem value="standard">Standard</MenuItem>
          <MenuItem value="deep">Deep</MenuItem>
        </TextField>
        <Button size="small" startIcon={<RefreshIcon />} onClick={() => void load()}>Re-pack</Button>
        <Button size="small" startIcon={<DownloadIcon />} onClick={() => void download()}>
          Download plan
        </Button>
        {canManage && (
          <Button
            size="small" startIcon={<UploadFileIcon />} disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? 'Reading…' : 'Upload my plan'}
          </Button>
        )}
        <input
          ref={fileRef} type="file" accept=".xlsx" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
        />
      </Stack>

      {/*
        * Said out loud, because a screen that opens on a suggestion looks like a
        * screen that only accepts one.
        */}
      <Alert severity="info" variant="outlined" sx={{ mb: 1.5, py: 0.5 }}>
        This is a <b>suggestion</b>. Accept it, or download it, rearrange it in Excel and
        upload your own — the plan that gets built is whichever you accept last.
      </Alert>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1, minHeight: 36 }}>
        <Tab label={`What has to be cut (${blanks.length})`} sx={{ minHeight: 36, fontSize: 13 }} />
        <Tab label={`How it gets cut (${nests.length} sheets)`} sx={{ minHeight: 36, fontSize: 13 }} />
      </Tabs>

      {/* ── the blanks ───────────────────────────────────────────────────── */}
      {tab === 0 && (
        <Box sx={{
          border: '1px solid var(--c-border)', borderRadius: '10px',
          overflowX: 'auto', overflowY: 'hidden',
        }}>
          <Stack direction="row" spacing={1} sx={{
            px: 1.5, py: 0.75, background: 'var(--c-surface-2)', minWidth: 760,
            borderBottom: '1px solid var(--c-border)',
          }}>
            <Box sx={{ width: 26, flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}><Hd>Blank</Hd></Box>
            <Box sx={{ width: 70, flexShrink: 0, textAlign: 'right' }}><Hd>Need</Hd></Box>
            <Box sx={{ width: 210, flexShrink: 0 }}><Hd>Cut from</Hd></Box>
            <Box sx={{ width: 80, flexShrink: 0, textAlign: 'right' }}><Hd>Sheets</Hd></Box>
            <Box sx={{ width: 160, flexShrink: 0 }}><Hd>Cut by</Hd></Box>
          </Stack>

          {blanks.map((b) => {
            const isOpen = open.has(b.key);
            return (
              <Box key={b.key} sx={{ borderBottom: '1px solid var(--c-divider)' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{
                  px: 1.5, py: 0.85, minWidth: 760,
                  background: b.short > 0 ? 'var(--c-danger-50, #FCE9EC)' : undefined,
                  '&:hover': { background: 'var(--c-surface-2)' },
                }}>
                  <IconButton size="small" sx={{ p: 0.25 }} onClick={() => toggle(b.key)}>
                    {isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                  </IconButton>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {/*
                      * nowrap: "28 × 2995 × 12000" is ONE value and was breaking
                      * after every ×, turning a row into four lines of digits.
                      */}
                    <Typography noWrap sx={{
                      fontFamily: 'var(--font-mono, monospace)', fontSize: 13.5, fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}>{rect(b)}</Typography>
                    {/*
                      * A BLANK IS A SIZE, NOT A PART. Listing the part names here
                      * read as "this blank belongs to these parts" — it does not;
                      * this one serves eight part rows. The count says the
                      * relationship correctly and the names are one click away.
                      */}
                    <Typography noWrap sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                      {b.material} {b.grade} · serves {b.partCount} part row{b.partCount === 1 ? '' : 's'}
                    </Typography>
                  </Box>

                  <Box sx={{ width: 70, flexShrink: 0, textAlign: 'right' }}>
                    <Mono bold>{b.qty}</Mono>
                    {b.short > 0 && (
                      <Typography sx={{ fontSize: 11, color: 'var(--c-danger-600)' }}>
                        {b.short} short
                      </Typography>
                    )}
                  </Box>

                  <Box sx={{ width: 210, flexShrink: 0 }}>
                    {b.plateSizes.length === 0 ? (
                      <Tooltip title={b.reason ?? 'No sheet could hold it'}>
                        <Chip size="small" color="error" variant="outlined" label="nothing fits" />
                      </Tooltip>
                    ) : (
                      <>
                        <Typography noWrap sx={{
                          fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5,
                        }}>{b.plateSizes[0]}</Typography>
                        <Typography noWrap sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                          {b.plateSizes.length > 1
                            ? `and ${b.plateSizes.length - 1} other size${b.plateSizes.length > 2 ? 's' : ''}`
                            : `${b.material ?? ''} ${b.grade ?? ''}`.trim()}
                        </Typography>
                      </>
                    )}
                  </Box>

                  <Box sx={{ width: 80, flexShrink: 0, textAlign: 'right' }}>
                    <Mono>{b.plateCount || '—'}</Mono>
                    {b.sharesPlates > 0 && (
                      <Tooltip title={`${b.sharesPlates} of them also carry another rectangle`}>
                        <Typography sx={{ fontSize: 11, color: 'var(--c-primary-600)' }}>
                          {b.sharesPlates} shared
                        </Typography>
                      </Tooltip>
                    )}
                  </Box>

                  {/*
                    * THE FLOW, per blank. Almost everything is cut and nothing
                    * else — but a rectangle that also gets drilled while it is
                    * flat belongs on a different flow, and that is a fact about
                    * the rectangle rather than about the sheet it came off.
                    */}
                  <Box sx={{ width: 160, flexShrink: 0 }}>
                    <TextField
                      select size="small" fullWidth disabled={!canManage}
                      value={flowOverride[b.key] ?? ''}
                      onChange={(e) => setFlowOverride((f) => ({ ...f, [b.key]: Number(e.target.value) }))}
                      slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: 12.5 } } }}
                    >
                      <MenuItem value=""><em>Cutting (default)</em></MenuItem>
                      {flows.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
                    </TextField>
                  </Box>
                </Stack>

                <Collapse in={isOpen} unmountOnExit>
                  <Box sx={{ px: 5, py: 1.5, background: 'var(--c-surface-2)' }}>
                    <Stack direction="row" spacing={3} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
                      <Kv k="Blank code" v={b.code} />
                      <Kv k="Used by" v={`${b.partCount} part row${b.partCount === 1 ? '' : 's'}`} />
                      <Kv k="Steel in parts" v={t(b.totalWeightKg)} />
                      <Kv k="Each" v={`${b.unitWeightKg.toFixed(1)} kg`} />
                    </Stack>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 0.5 }}>
                      Parts cut from this rectangle:
                    </Typography>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                      {b.partNames.map((nm) => (
                        <Chip key={nm} size="small" variant="outlined" label={nm} />
                      ))}
                    </Stack>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 0.75 }}>
                      Cut across {b.nests.length} sheet{b.nests.length === 1 ? '' : 's'}:
                    </Typography>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                      {b.nests.slice(0, 24).map((n) => (
                        <Chip
                          key={n.nestNo} size="small"
                          variant={n.sharedWith > 0 ? 'filled' : 'outlined'}
                          color={n.isDrop ? 'success' : n.sharedWith > 0 ? 'primary' : 'default'}
                          label={`${n.nestNo} · ${n.qty}${n.sharedWith > 0 ? ` +${n.sharedWith}` : ''}`}
                        />
                      ))}
                      {b.nests.length > 24 && (
                        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', alignSelf: 'center' }}>
                          …and {b.nests.length - 24} more
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Box>
      )}

      {/* ── the sheets ───────────────────────────────────────────────────── */}
      {tab === 1 && (
        <Box sx={{ border: '1px solid var(--c-border)', borderRadius: '10px', overflow: 'hidden' }}>
          {nests.map((n) => (
            <Stack key={n.nestNo} direction="row" spacing={1.5} alignItems="center" sx={{
              px: 1.5, py: 0.85, borderBottom: '1px solid var(--c-divider)',
              '&:hover': { background: 'var(--c-surface-2)' },
            }}>
              <Typography sx={{
                fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5, width: 62, flexShrink: 0,
                color: 'var(--c-text-2)',
              }}>{n.nestNo}</Typography>

              <Box sx={{ width: 176, flexShrink: 0 }}>
                <Typography noWrap sx={{
                  fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5, fontWeight: 600,
                }}>{rect(n)}</Typography>
                <Typography noWrap sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                  {n.plateKg.toFixed(0)} kg{n.isDrop ? ' · offcut' : ''}
                </Typography>
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  {n.items.map((it) => (
                    <Chip key={it.key} size="small" variant="outlined"
                      label={`${it.qty} × ${it.rect}`} sx={{ fontFamily: 'var(--font-mono, monospace)' }} />
                  ))}
                </Stack>
              </Box>

              <Stack direction="row" spacing={1} alignItems="center" sx={{ width: 96, flexShrink: 0 }}>
                <Box sx={{
                  width: 40, height: 6, borderRadius: 3, flexShrink: 0,
                  background: 'var(--c-surface-3, #EFF1F8)', overflow: 'hidden',
                }}>
                  <Box sx={{
                    width: `${Math.round(n.usedPct * 100)}%`, height: '100%',
                    background: yieldColour(n.usedPct),
                  }} />
                </Box>
                <Typography sx={{
                  fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5, fontWeight: 600,
                  width: 34, textAlign: 'right',
                }}>{(n.usedPct * 100).toFixed(0)}%</Typography>
              </Stack>
            </Stack>
          ))}
        </Box>
      )}

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
            Accepting creates <b>{blanks.length} blanks</b> across <b>{nests.length} sheets</b>,
            points every part at its blank, and raises the cutting work on its own production
            order — separate from fabrication, because it waits on plate rather than on the shop.
          </Typography>
          <Button variant="contained" disabled={accepting || !nests.length} onClick={() => void accept()}>
            {accepting ? 'Working…' : 'Accept plan'}
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

function Mono({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return (
    <Typography sx={{
      fontFamily: 'var(--font-mono, monospace)', fontSize: bold ? 14 : 13,
      fontWeight: bold ? 600 : 400, fontVariantNumeric: 'tabular-nums',
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
