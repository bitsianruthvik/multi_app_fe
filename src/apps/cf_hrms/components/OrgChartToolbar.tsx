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
import ViewSidebarRounded from '@mui/icons-material/ViewSidebarRounded';
import { DetailTabs, Surface } from '@shared/ui';
import type { ShiftFilter } from './orgChartLayout';

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
  zoom,
  onZoom,
  onFit,
  collapsedCount,
  onExpandAll,
  panelOpen,
  onPanel,
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
  zoom: number;
  onZoom: (z: number) => void;
  onFit: () => void;
  collapsedCount: number;
  onExpandAll: () => void;
  panelOpen: boolean;
  onPanel: (v: boolean) => void;
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
            sx={{ minWidth: 260, flex: '1 1 260px', maxWidth: 380 }}
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

          <FormControlLabel
            control={
              <Switch size="small" checked={colours} onChange={(e) => onColours(e.target.checked)} />
            }
            label={<Typography sx={{ fontSize: 13 }}>Attendance colours</Typography>}
          />

          <Box sx={{ flex: 1 }} />

          {collapsedCount > 0 && (
            <Button size="small" startIcon={<UnfoldMoreRounded />} onClick={onExpandAll}>
              {collapsedCount} branch{collapsedCount === 1 ? '' : 'es'} folded — expand all
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

          <Tooltip title={panelOpen ? 'Hide the side panel' : 'Show the side panel'}>
            <IconButton
              size="small"
              onClick={() => onPanel(!panelOpen)}
              aria-label={panelOpen ? 'Hide the side panel' : 'Show the side panel'}
              aria-pressed={panelOpen}
            >
              <ViewSidebarRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Surface>
  );
}
