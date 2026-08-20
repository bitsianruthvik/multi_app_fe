import { useCallback, useMemo, useState } from 'react';
import {
  Alert, AlertTitle, Box, Button, Checkbox, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  LinearProgress, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  Tooltip, Typography,
} from '@mui/material';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';

import { useToast, backendMessage } from '../components';
import {
  suggestNesting, acceptNesting,
  type NestingSuggestion, type SuggestedNest,
} from '../api/nestingSuggest';

/**
 * A nesting suggestor — a third way to fill the board, not a replacement.
 *
 * Nesting arrives three ways now: the Excel sheet, dragging plates by hand, and
 * this. Somebody who already knows what they want keeps doing it; somebody
 * staring at four hundred parts gets a starting point they can edit. Nothing
 * here writes until nests are ticked and accepted, and accepting drops the
 * result onto the same board, where every plate can still be rearranged.
 *
 * WHAT IT IS OPTIMISING is waste, and it says so in those terms — square metres
 * bought against square metres cut. A utilisation percentage per plate is the
 * number a nester argues with, so it is on every row rather than summarised
 * away.
 *
 * PROBLEMS ARE NOT HIDDEN. A part the suggestor cannot place is the most useful
 * thing on the screen: it usually means the drawing needs a plate nobody
 * stocks, and finding that out here is far cheaper than finding it out at the
 * torch. Unplaced and skipped parts are shown with the reason, every time,
 * even when the rest of the suggestion is fine.
 */

interface Props {
  orderId: number;
  /** Called after nests are accepted, so the board can reload. */
  onAccepted?: () => void;
  disabled?: boolean;
}

const m2 = (mm2: number) => (mm2 / 1e6).toFixed(2);

export default function NestingSuggestor({ orderId, onAccepted, disabled }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [includeNested, setIncludeNested] = useState(false);
  const [suggestion, setSuggestion] = useState<NestingSuggestion | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());

  const run = useCallback(async (opts: { includeNested: boolean }) => {
    setLoading(true);
    try {
      const s = await suggestNesting(orderId, opts);
      setSuggestion(s);
      // Everything ticked to begin with: the common case is accepting the lot,
      // and un-ticking the one plate you disagree with is less work than
      // ticking the thirty you do not.
      setChosen(new Set(s.groups.map((_, i) => i)));
    } catch (err) {
      toast(backendMessage(err, 'Could not work out a nesting for this order.'), 'error');
      setSuggestion(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, toast]);

  const start = useCallback(() => {
    setOpen(true);
    void run({ includeNested: false });
  }, [run]);

  const accept = useCallback(async () => {
    if (!suggestion) return;
    const nests = suggestion.groups.filter((_, i) => chosen.has(i));
    if (!nests.length) return;
    setSaving(true);
    try {
      const res = await acceptNesting(orderId, nests as SuggestedNest[]);
      toast(`${res.nestsCreated} plate(s) nested, ${res.partsNested} part(s) placed`
        + (res.offcutsClaimed ? `, ${res.offcutsClaimed} offcut(s) claimed for this order.` : '.'),
      'success');
      setOpen(false);
      setSuggestion(null);
      onAccepted?.();
    } catch (err) {
      toast(backendMessage(err, 'Those nests could not be saved.'), 'error');
    } finally {
      setSaving(false);
    }
  }, [suggestion, chosen, orderId, toast, onAccepted]);

  const toggle = (i: number) => setChosen((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  const summary = suggestion?.summary;
  /** Plate area this suggestion takes off the shelf rather than buying. */
  const fromOffcuts = useMemo(() => {
    const picked = (suggestion?.groups ?? []).filter((g) => g.plate.isOffcut);
    return {
      plates: picked.length,
      area: picked.reduce((s, g) => s + g.plate.length * g.plate.width, 0),
    };
  }, [suggestion]);
  const chosenWaste = useMemo(() => {
    if (!suggestion) return null;
    const picked = suggestion.groups.filter((_, i) => chosen.has(i));
    if (!picked.length) return null;
    const used = picked.reduce((s, g) => s + g.usedAreaMm2, 0);
    const waste = picked.reduce((s, g) => s + g.wasteAreaMm2, 0);
    return { plates: picked.length, used, waste, pct: (waste / (used + waste)) * 100 };
  }, [suggestion, chosen]);

  return (
    <>
      <Tooltip title="Propose plates for the parts that have none. Nothing is saved until you accept.">
        <span>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AutoAwesomeRounded />}
            onClick={start}
            disabled={disabled}
          >
            Suggest nesting
          </Button>
        </span>
      </Tooltip>

      <Dialog open={open} onClose={() => !saving && setOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          Suggested nesting
          <Typography variant="body2" color="text.secondary">
            Plates chosen from the item catalog to waste as little as possible. Nothing is saved
            until you accept, and every plate can still be rearranged on the board afterwards.
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          {loading && (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Working out which plates waste least…
              </Typography>
            </Box>
          )}

          {!loading && suggestion && (
            <Stack spacing={2}>
              <FormControlLabel
                control={(
                  <Checkbox
                    size="small"
                    checked={includeNested}
                    onChange={(e) => {
                      setIncludeNested(e.target.checked);
                      void run({ includeNested: e.target.checked });
                    }}
                  />
                )}
                label="Re-plan parts that are already on a plate"
              />

              {suggestion.message && !suggestion.groups.length && (
                <Alert severity="info">{suggestion.message}</Alert>
              )}

              {summary && suggestion.groups.length > 0 && (
                <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Stat label="Plates" value={String(summary.plates)} />
                  <Stat label="Parts" value={`${summary.parts} (${summary.pieces} pieces)`} />
                  <Stat label="Plate bought" value={`${summary.plateAreaM2} m²`} />
                  <Stat label="Cut from it" value={`${summary.usedAreaM2} m²`} />
                  <Stat
                    label="Waste"
                    value={`${summary.wasteAreaM2} m² · ${summary.wastePct}%`}
                    emphasis={summary.wastePct > 20 ? 'warning' : 'good'}
                  />
                  {/*
                    Steel taken off the shelf instead of bought. Reported
                    separately from waste because it is a different kind of
                    saving: waste is plate you bought and did not use, this is
                    plate you did not have to buy at all.
                  */}
                  {fromOffcuts.plates > 0 && (
                    <Stat
                      label="From offcuts"
                      value={`${fromOffcuts.plates} plate(s) · ${m2(fromOffcuts.area)} m² not bought`}
                      emphasis="good"
                    />
                  )}
                </Box>
              )}

              {/* Problems first — they are the most useful thing here. */}
              {suggestion.unplaced.length > 0 && (
                <Alert severity="warning">
                  <AlertTitle>
                    {suggestion.unplaced.length} part(s) could not be placed
                  </AlertTitle>
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    {dedupe(suggestion.unplaced).map((u) => (
                      <Typography key={u.reason} variant="body2">
                        <strong>{u.count > 1 ? `${u.count} parts` : u.partCode ?? u.partName}</strong>
                        {' — '}{u.reason}
                      </Typography>
                    ))}
                  </Stack>
                </Alert>
              )}

              {suggestion.skipped.length > 0 && (
                <Alert severity="info">
                  <AlertTitle>{suggestion.skipped.length} part(s) were not considered</AlertTitle>
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    {dedupe(suggestion.skipped).map((u) => (
                      <Typography key={u.reason} variant="body2">
                        <strong>{u.count > 1 ? `${u.count} parts` : u.partCode ?? u.partName}</strong>
                        {' — '}{u.reason}
                      </Typography>
                    ))}
                  </Stack>
                </Alert>
              )}

              {suggestion.groups.length > 0 && (
                <>
                  <Divider />
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            checked={chosen.size === suggestion.groups.length}
                            indeterminate={chosen.size > 0 && chosen.size < suggestion.groups.length}
                            onChange={() => setChosen(
                              chosen.size === suggestion.groups.length
                                ? new Set()
                                : new Set(suggestion.groups.map((_, i) => i)),
                            )}
                          />
                        </TableCell>
                        <TableCell>Plate</TableCell>
                        <TableCell>Size</TableCell>
                        <TableCell align="right">Used</TableCell>
                        <TableCell align="right">Waste</TableCell>
                        <TableCell>Parts on it</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {suggestion.groups.map((g, i) => (
                        <TableRow key={`${g.plate.code}-${i}`} hover selected={chosen.has(i)}>
                          <TableCell padding="checkbox">
                            <Checkbox size="small" checked={chosen.has(i)} onChange={() => toggle(i)} />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <Typography variant="body2" fontWeight={600}>{g.plate.code}</Typography>
                              {/*
                                An offcut is a materially different statement
                                from a plate: this one is already in the yard
                                and already paid for. Saying so on the row is
                                the difference between a buying decision and a
                                fetching one.
                              */}
                              {g.plate.isOffcut && (
                                <Tooltip title={g.plate.estimatedSize
                                  ? 'Cut from an offcut already in stock. Its size was computed '
                                    + 'from the nesting that produced it, not measured — worth '
                                    + 'checking against the piece before cutting.'
                                  : 'Cut from an offcut already in stock, at its measured size.'}>
                                  <Chip
                                    size="small"
                                    color="success"
                                    variant="outlined"
                                    label={g.plate.estimatedSize ? 'offcut · est.' : 'offcut'}
                                  />
                                </Tooltip>
                              )}
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                              {g.thickness} mm{g.grade ? ` · ${g.grade}` : ''}
                            </Typography>
                          </TableCell>
                          <TableCell>{g.plate.width} × {g.plate.length}</TableCell>
                          <TableCell align="right" sx={{ minWidth: 120 }}>
                            <Typography variant="body2">{g.utilisationPct}%</Typography>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(100, g.utilisationPct)}
                              color={g.utilisationPct < 60 ? 'warning' : 'success'}
                              sx={{ height: 4, borderRadius: 2 }}
                            />
                          </TableCell>
                          <TableCell align="right">{m2(g.wasteAreaMm2)} m²</TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                              {g.parts.slice(0, 6).map((p) => (
                                <Chip
                                  key={p.linkId}
                                  size="small"
                                  variant="outlined"
                                  label={`${p.partCode ?? p.partName}${p.qty > 1 ? ` ×${p.qty}` : ''}`}
                                />
                              ))}
                              {g.parts.length > 6 && (
                                <Chip size="small" label={`+${g.parts.length - 6} more`} />
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
          <Typography variant="body2" color="text.secondary">
            {chosenWaste
              ? `${chosenWaste.plates} plate(s) selected · ${m2(chosenWaste.waste)} m² waste `
                + `(${chosenWaste.pct.toFixed(1)}%)`
              : 'Nothing selected'}
          </Typography>
          <Box>
            <Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button
              variant="contained"
              onClick={accept}
              disabled={saving || !chosen.size}
              sx={{ ml: 1 }}
            >
              {saving ? 'Saving…' : `Accept ${chosen.size || ''} plate(s)`}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
    </>
  );
}

function Stat({ label, value, emphasis }: {
  label: string; value: string; emphasis?: 'good' | 'warning';
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
      <Typography
        variant="h6"
        color={emphasis === 'warning' ? 'warning.main' : emphasis === 'good' ? 'success.main' : undefined}
      >
        {value}
      </Typography>
    </Box>
  );
}

/**
 * Collapse problems that share a reason.
 *
 * Forty webs that all need a plate nobody stocks is ONE fact, and listing it
 * forty times buries the other two problems underneath it.
 */
function dedupe<T extends { reason: string; partCode: string | null; partName: string }>(items: T[]) {
  const byReason = new Map<string, { reason: string; partCode: string | null; partName: string; count: number }>();
  for (const i of items) {
    const seen = byReason.get(i.reason);
    if (seen) seen.count++;
    else byReason.set(i.reason, { reason: i.reason, partCode: i.partCode, partName: i.partName, count: 1 });
  }
  return [...byReason.values()];
}
