/**
 * ActualsReport.tsx — the monthly progress report, written to be printed.
 *
 * The last piece of Phase 4, and the only screen on this board whose audience is
 * OUTSIDE the shop. A bridge fabricator sends its client a progress report every
 * month; until now that meant somebody reading the Actuals Board and retyping it
 * into a document, which is how a number stops matching its source.
 *
 * PRINT IS THE PRIMARY MEDIUM, NOT AN AFTERTHOUGHT
 * ------------------------------------------------
 * So the layout is A4 portrait first and a web page second: a fixed measure, a
 * table that repeats its header across pages and never splits a row, and no
 * app chrome in the output. `window.print()` to PDF is the whole export path —
 * no PDF library, because the browser already has one and a second renderer
 * would be a second thing that can disagree with the screen.
 *
 * IT MUST SURVIVE BEING PRINTED IN BLACK AND WHITE
 * ------------------------------------------------
 * Which the design already does, by luck turned into intent: the S-curve
 * distinguishes plan from actual by DASH versus SOLID rather than by hue, and
 * the status column is a word. A greyscale office printer loses the violet and
 * loses nothing else. `print-color-adjust: exact` keeps the colour where the
 * printer offers it, but nothing depends on it arriving.
 *
 * EVERY FIGURE COMES FROM THE BOARD'S OWN ENDPOINT
 * -----------------------------------------------
 * Same request, same window, same roll-up — `unitProgress` is emitted from the
 * very loop that counts the headline figures. A report that recomputed its own
 * totals would eventually disagree with the screen it was printed from, and the
 * client would be holding the version that disagrees.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, GlobalStyles, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, Typography,
} from '@mui/material';
import PrintRounded from '@mui/icons-material/PrintRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';

import { usePermission } from '@core/hooks/usePermission';
import { useAuth } from '@core/contexts/AuthContext';
import { isAdminRole } from '@core/utils/roles';

import {
  getActualsBoard, ACTUALS_LEVEL_LABEL, ACTUALS_LEVELS,
  type ActualsBoardResponse, type ActualsLevel,
} from '../api/actuals';
import { EmptyState, ListSkeleton } from '../components';
import { SCurve } from '../components/actuals/SCurve';
import { buildActualsGrouping } from '../components/actuals/actualsModel';
import { buildScale, monthStartYMD, daysInMonth, todayYMD } from '../components/planner/plannerTime';

/**
 * Chrome off, ink on.
 *
 * The visibility trick rather than `display:none` on the shell: the report lives
 * inside the app's layout, and hiding an ancestor would take the report with it.
 * Making everything invisible and then re-showing the report subtree leaves the
 * boxes in place but paints only what belongs on the page.
 */
const printCss = (
  <GlobalStyles
    styles={{
      '@media print': {
        '@page': { size: 'A4 portrait', margin: '14mm' },
        'body *': { visibility: 'hidden' },
        '#fab-report, #fab-report *': {
          visibility: 'visible',
          printColorAdjust: 'exact',
          WebkitPrintColorAdjust: 'exact',
        },
        '#fab-report': { position: 'absolute', left: 0, top: 0, width: '100%' },
        '.no-print': { display: 'none !important' },
        // A row split across a page break is unreadable, and a table that loses
        // its header on page two is worse.
        thead: { display: 'table-header-group' },
        tr: { breakInside: 'avoid' },
        '.break-before': { breakBefore: 'page' },
      },
    }}
  />
);

function fmtHours(h: number): string {
  return `${Math.round(h).toLocaleString()} h`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

const STATE_LABEL: Record<string, string> = {
  complete: 'Complete',
  in_progress: 'In progress',
  not_started: 'Not started',
};

export default function ActualsReport() {
  const { company } = useParams<{ company: string }>();
  const { user } = useAuth();
  const canView = usePermission('fab_erp_actuals_view') || isAdminRole(user?.role);
  const [params] = useSearchParams();

  const [board, setBoard] = useState<ActualsBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const level = (ACTUALS_LEVELS as readonly string[]).includes(params.get('level') ?? '')
    ? (params.get('level') as ActualsLevel)
    : 'girder';
  const timeZone = board?.timezone ?? 'UTC';
  const monthParam = params.get('month');
  const anchor = monthParam && /^\d{4}-\d{2}$/.test(monthParam)
    ? `${monthParam}-01`
    : monthStartYMD(todayYMD('UTC'));

  const scale = useMemo(
    () => buildScale('month', monthStartYMD(anchor), timeZone, daysInMonth(anchor)),
    [anchor, timeZone],
  );

  const load = useCallback(async () => {
    if (!canView) return;
    try {
      const res = await getActualsBoard({
        from: new Date(scale.startMs).toISOString(),
        to: new Date(scale.endMs).toISOString(),
        // Rolled-up mode: a report is read by unit, never by machine.
        mode: 'unit',
        level,
        withPlan: true,
      });
      setBoard(res);
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to load the report.');
    } finally {
      setLoading(false);
    }
  }, [canView, scale.startMs, scale.endMs, level]);

  useEffect(() => { void load(); }, [load]);

  const grouping = useMemo(
    () => (board ? buildActualsGrouping(board, level) : null),
    [board, level],
  );

  /**
   * One row per unit, ordered by code.
   *
   * Sourced from `unitProgress`, which covers every unit of the touched orders —
   * including the ones that saw no work at all. A progress report that silently
   * omits the girder nobody touched is the report a client should not trust, and
   * it is the row they will look for first.
   */
  const rows = useMemo(() => {
    if (!board || !grouping) return [];
    const labelOf = new Map(grouping.groups.map((g) => [g.key, g]));
    const workMsOf = new Map(board.units.map((u) => [u.key, u.workMs]));
    return Object.entries(board.unitProgress ?? {})
      .map(([key, p]) => ({
        key,
        label: labelOf.get(key)?.label ?? key,
        sublabel: labelOf.get(key)?.sublabel ?? '',
        ...p,
        pct: p.total > 0 ? Math.round((p.done / p.total) * 100) : 0,
        tonnes: board.unitTonnes?.[key] ?? 0,
        hours: (workMsOf.get(key) ?? 0) / 3600000,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [board, grouping]);

  const monthLabel = new Date(`${anchor}T12:00:00Z`)
    .toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const orderLine = (board?.orders ?? [])
    .map((o) => o.orderNumber).filter(Boolean).join(', ');
  const customerLine = [...new Set((board?.orders ?? [])
    .map((o) => o.customerName).filter(Boolean))].join(', ');

  if (!canView) {
    return (
      <Box sx={{ p: 3 }}>
        <EmptyState title="No access" hint="You do not have permission to view this report." />
      </Box>
    );
  }

  const s = board?.stats;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {printCss}

      <Stack direction="row" spacing={1} className="no-print" sx={{ mb: 2 }}>
        <Button
          size="small"
          startIcon={<ArrowBackRounded />}
          component={RouterLink}
          to={`/${company}/fab_erp/actuals`}
        >
          Back to the board
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="contained"
          startIcon={<PrintRounded />}
          onClick={() => window.print()}
          disabled={!board}
        >
          Print / Save as PDF
        </Button>
      </Stack>

      {error && <Alert severity="error" className="no-print" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && !board && <ListSkeleton rows={6} />}

      {board && s && (
        <Box
          id="fab-report"
          sx={{
            maxWidth: 880,
            mx: 'auto',
            bgcolor: 'background.paper',
            color: 'text.primary',
            p: { xs: 2, md: 4 },
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            '@media print': { border: 0, p: 0, maxWidth: 'none' },
          }}
        >
          {/* ── masthead ───────────────────────────────────────────────── */}
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>Monthly Progress Report</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {monthLabel}
                {orderLine ? ` · ${orderLine}` : ''}
              </Typography>
              {customerLine && (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{customerLine}</Typography>
              )}
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                Reported by {ACTUALS_LEVEL_LABEL[level].toLowerCase()}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                Generated {new Date().toLocaleDateString()}
              </Typography>
            </Box>
          </Stack>

          {board.stats.degraded && (
            <Alert severity="info" sx={{ mb: 2 }}>
              This window touches more items than the roll-up will load, so tonnage and the
              per-{ACTUALS_LEVEL_LABEL[level].toLowerCase()} table are omitted.
            </Alert>
          )}

          {/* ── headline figures ───────────────────────────────────────── */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
              gap: 2,
              mb: 3,
              '@media print': { gridTemplateColumns: 'repeat(4, 1fr)' },
            }}
          >
            {[
              { label: 'Steel progressed', value: s.tonnes == null ? '—' : `${s.tonnes.toFixed(s.tonnes >= 10 ? 0 : 1)} t` },
              { label: 'Hours worked', value: fmtHours(s.hours) },
              { label: 'Operations completed', value: s.tasksCompleted.toLocaleString() },
              {
                label: `${ACTUALS_LEVEL_LABEL[level]}s completed`,
                value: `${s.unitsCompleted} of ${s.unitsCompleted + s.unitsOpen}`,
              },
            ].map((f) => (
              <Box key={f.label} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  {f.label}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>{f.value}</Typography>
              </Box>
            ))}
          </Box>

          {/* ── the curve ──────────────────────────────────────────────── */}
          {board.plan && (
            <Box sx={{ mb: 3 }}>
              <SCurve curve={board.plan.curve} nowYMD={null} />
            </Box>
          )}

          {/* ── the table ──────────────────────────────────────────────── */}
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Progress by {ACTUALS_LEVEL_LABEL[level].toLowerCase()}
          </Typography>
          {rows.length === 0 ? (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              No {ACTUALS_LEVEL_LABEL[level].toLowerCase()} progress is available for this window.
            </Typography>
          ) : (
            /*
             * FIXED LAYOUT, and it is load-bearing rather than tidiness.
             * Measured at the real printable width — A4 portrait less 14 mm
             * margins, about 690 px — the auto-laid table came out 752 px inside
             * a 636 px page, so "Started" and "Finished" ran off the right edge
             * of the paper. Nothing on screen showed it, because the screen just
             * scrolls.
             *
             * A unit's code is a long unbroken token
             * (BRDG-SO-20260820-0002-SPAN1-G1) and that is what forced the first
             * column wide, so it gets a share and is allowed to break.
             */
            <Table
              size="small"
              sx={{
                tableLayout: 'fixed',
                width: '100%',
                '& td, & th': { py: 0.6, px: 0.75 },
                '@media print': { fontSize: '9pt' },
              }}
            >
              {/* Headers WRAP rather than run together. Fixed columns this
                  narrow cannot hold "Operations" on one line, and the default
                  nowrap ran three headings into each other
                  ("COMPLETOPERATIONSONNES") — legible on no printer anywhere. */}
              <TableHead
                sx={{ '& th': { whiteSpace: 'normal', lineHeight: 1.2, verticalAlign: 'bottom' } }}
              >
                <TableRow>
                  <TableCell sx={{ width: '26%' }}>{ACTUALS_LEVEL_LABEL[level]}</TableCell>
                  <TableCell align="right" sx={{ width: '10%' }}>% done</TableCell>
                  <TableCell align="right" sx={{ width: '13%' }}>Ops done</TableCell>
                  <TableCell align="right" sx={{ width: '9%' }}>Tonnes</TableCell>
                  <TableCell align="right" sx={{ width: '8%' }}>Hours</TableCell>
                  <TableCell sx={{ width: '13%' }}>Status</TableCell>
                  <TableCell align="right" sx={{ width: '10.5%' }}>Started</TableCell>
                  <TableCell align="right" sx={{ width: '10.5%' }}>Finished</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell sx={{ overflowWrap: 'anywhere' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 'inherit' }}>
                        {r.label}
                      </Typography>
                      {r.sublabel && (
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.2 }}
                        >
                          {r.sublabel}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.pct}%</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {r.done} / {r.total}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {r.tonnes ? r.tonnes.toFixed(r.tonnes >= 10 ? 0 : 1) : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {r.hours ? Math.round(r.hours) : '—'}
                    </TableCell>
                    {/* A WORD, not a colour — this is printed in black and white. */}
                    <TableCell>{STATE_LABEL[r.state] ?? r.state}</TableCell>
                    <TableCell align="right">{fmtDate(r.firstStart)}</TableCell>
                    <TableCell align="right">{fmtDate(r.lastEnd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <Typography variant="caption" sx={{ display: 'block', mt: 3, color: 'text.secondary' }}>
            Percentages are of operations completed. Hours and tonnes are the work done inside
            {' '}{monthLabel} only — a unit part-built in an earlier month is credited for the
            share done here, not for the whole of it.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
