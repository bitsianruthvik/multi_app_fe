import {
  Autocomplete,
  Box,
  Button,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import ZoomInRounded from '@mui/icons-material/ZoomInRounded';
import ZoomOutRounded from '@mui/icons-material/ZoomOutRounded';
import FitScreenRounded from '@mui/icons-material/FitScreenRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import FullscreenRounded from '@mui/icons-material/FullscreenRounded';
import FullscreenExitRounded from '@mui/icons-material/FullscreenExitRounded';
import { DetailTabs, Surface } from '@shared/ui';
import type { ChartShow, ShiftFilter } from './orgChartLayout';

/** The four ways to read the organisation, as peer tabs (spec §13). */
export type OrgChartView = 'chart' | 'table' | 'departments' | 'doubts';

/**
 * Every control that changes what the chart shows (spec §4), on one solid bar,
 * under the tabs that pick the view.
 *
 * Chart / Table / Departments / Doubts are PEERS, the way the client's own tool
 * lays out Chart / Departments / Doubts: four answers to four questions about
 * one organisation, not a chart with modes. The chart controls below the tabs
 * belong to Chart and Table only — a zoom or a shift filter on the Departments
 * view would be a control that does nothing, which reads as a broken one.
 *
 * None of it is org data. Zoom, the folded set, the arrangement overrides, the
 * shift filter and the attendance tint are one viewer's way of reading a chart
 * on one screen, so they live in that viewer's storage and no `chart_arrange`
 * column exists to disagree with them (spec §9).
 */

export interface RootOption {
  id: number;
  label: string;
  code: string | null;
  depth: number;
}

const SHOW_KEYS: { key: keyof ChartShow; label: string; hint: string }[] = [
  { key: 'departments', label: 'Departments', hint: 'Departments as boxes around their people. Off: the plain reporting tree.' },
  { key: 'roles', label: 'Roles', hint: 'The title of each seat.' },
  { key: 'people', label: 'People', hint: 'The names in each seat, and its vacancies.' },
];

/**
 * Departments · Roles · People — what the chart DRAWS, not what it holds
 * (spec §16). Each is on or off; the last one left on cannot be switched off,
 * so the canvas is never empty. Shared with the employee chart.
 */
export function ShowSwitches({ show, onShow }: { show: ChartShow; onShow: (s: ChartShow) => void }) {
  const on = SHOW_KEYS.filter((k) => show[k.key]).map((k) => k.key);
  return (
    <ToggleButtonGroup
      size="small"
      value={on}
      onChange={(_, next: (keyof ChartShow)[]) => {
        if (!next.length) return;
        onShow({
          departments: next.includes('departments'),
          roles: next.includes('roles'),
          people: next.includes('people'),
        });
      }}
      aria-label="What the chart shows"
    >
      {SHOW_KEYS.map((k) => (
        <ToggleButton
          key={k.key}
          value={k.key}
          title={on.length === 1 && on[0] === k.key ? 'At least one of the three stays on.' : k.hint}
        >
          {k.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

export function OrgChartToolbar({
  view,
  onView,
  rootOptions,
  root,
  onRoot,
  shift,
  onShift,
  colours,
  onColours,
  show,
  onShow,
  foldedLabel,
  zoom,
  onZoom,
  onFit,
  collapsedCount,
  onExpandAll,
  fullscreen,
  onFullscreen,
  asOf,
  onAsOf,
  doubtsCount,
}: {
  view: OrgChartView;
  onView: (v: OrgChartView) => void;
  rootOptions: RootOption[];
  root: number | '';
  onRoot: (id: number | '') => void;
  shift: ShiftFilter;
  onShift: (s: ShiftFilter) => void;
  colours: boolean;
  onColours: (v: boolean) => void;
  /** What is drawn (spec §16). Chart only — the table always lists everything. */
  show: ChartShow;
  onShow: (s: ChartShow) => void;
  /** "3 departments closed" / "2 branches folded" — which fold is in force depends on `show`. */
  foldedLabel: string;
  zoom: number;
  onZoom: (z: number) => void;
  onFit: () => void;
  collapsedCount: number;
  onExpandAll: () => void;
  fullscreen: boolean;
  onFullscreen: (v: boolean) => void;
  asOf: string;
  onAsOf: (d: string) => void;
  /** Open points. Undefined while they load, so the tab never flashes a wrong 0. */
  doubtsCount?: number;
}) {
  const selected = rootOptions.find((o) => o.id === root) ?? null;
  const chartControls = view === 'chart' || view === 'table';

  return (
    <Surface e={1} sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          px: 1,
          // The kit's tab strip carries its own gap and rule for a detail page;
          // inside this bar the rule is only wanted when controls follow it.
          '& > [role=tablist]': {
            mb: 0,
            borderBottom: chartControls ? '1px solid var(--c-border)' : 'none',
          },
        }}
      >
        <DetailTabs
          active={view}
          onTab={(v) => onView(v as OrgChartView)}
          tabs={[
            { value: 'chart', label: 'Chart' },
            { value: 'table', label: 'Table' },
            { value: 'departments', label: 'Departments' },
            { value: 'doubts', label: 'Doubts', count: doubtsCount },
          ]}
        />
      </Box>

      {chartControls && (
        <Box
          sx={{
            p: 1.5,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1.5,
            rowGap: 1.5,
          }}
        >
          <Autocomplete
            size="small"
            options={rootOptions}
            value={selected}
            onChange={(_, v) => onRoot(v ? v.id : '')}
            getOptionLabel={(o) => o.label}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            sx={{ minWidth: 180, flex: '1 1 180px', maxWidth: 380 }}
            renderInput={(p) => (
              <TextField {...p} label="Start from" placeholder="Whole organisation" />
            )}
            renderOption={(props, o) => {
              const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
              return (
                <li key={key} {...rest}>
                  <Box sx={{ pl: `${o.depth * 10}px`, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13.5 }}>{o.label}</Typography>
                    {o.code && (
                      <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>{o.code}</Typography>
                    )}
                  </Box>
                </li>
              );
            }}
          />

          <TextField
            size="small"
            type="date"
            label="As at"
            value={asOf}
            onChange={(e) => onAsOf(e.target.value)}
            sx={{ width: 168 }}
            InputLabelProps={{ shrink: true }}
          />

          <ToggleButtonGroup
            size="small"
            exclusive
            value={shift}
            onChange={(_, v) => v && onShift(v as ShiftFilter)}
            aria-label="Shift shown"
          >
            <ToggleButton value="all">All shifts</ToggleButton>
            <ToggleButton value="D">Day</ToggleButton>
            <ToggleButton value="N">Night</ToggleButton>
          </ToggleButtonGroup>

          {view === 'chart' && <ShowSwitches show={show} onShow={onShow} />}

          <FormControlLabel
            control={
              <Switch size="small" checked={colours} onChange={(e) => onColours(e.target.checked)} />
            }
            title="Colour each seat by attendance on this date"
            label={<Typography sx={{ fontSize: 13 }}>Attendance</Typography>}
          />

          <Box sx={{ flex: 1 }} />

          {collapsedCount > 0 && (
            <Button size="small" startIcon={<UnfoldMoreRounded />} onClick={onExpandAll}>
              {foldedLabel}
            </Button>
          )}

          <Stack direction="row" spacing={0.5} alignItems="center">
            <Tooltip title="Zoom out">
              <span>
                <IconButton size="small" onClick={() => onZoom(zoom / 1.2)} aria-label="Zoom out">
                  <ZoomOutRounded fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Typography
              sx={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12.5,
                minWidth: 46,
                textAlign: 'center',
                color: 'var(--c-text-2)',
              }}
              aria-live="polite"
            >
              {Math.round(zoom * 100)}%
            </Typography>
            <Tooltip title="Zoom in">
              <span>
                <IconButton size="small" onClick={() => onZoom(zoom * 1.2)} aria-label="Zoom in">
                  <ZoomInRounded fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Fit the whole chart">
              <span>
                <IconButton size="small" onClick={onFit} aria-label="Fit the chart to the window">
                  <FitScreenRounded fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>

          {/* Entering is an icon beside Fit — the bar must stay one row at 1366px, or
              the chart loses a third of its height. LEAVING is a labelled, filled
              button: inside full screen it is the way out, and a way out must
              not need hunting for (Esc works too). */}
          {fullscreen ? (
            <Button
              size="small"
              variant="contained"
              startIcon={<FullscreenExitRounded />}
              onClick={() => onFullscreen(false)}
            >
              Exit full screen
            </Button>
          ) : (
            <Tooltip title="Full screen (Esc to leave)">
              <IconButton
                size="small"
                onClick={() => onFullscreen(true)}
                aria-label="Show the chart full screen"
              >
                <FullscreenRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
    </Surface>
  );
}
