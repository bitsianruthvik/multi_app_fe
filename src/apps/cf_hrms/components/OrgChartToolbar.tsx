import {
  Autocomplete,
  Box,
  Button,
  Chip,
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
import type { ReactNode } from 'react';
import { Surface } from '@shared/ui';
import type { ChartShow, ShiftFilter } from './orgChartLayout';

/**
 * Every control that changes what the chart shows (spec §4), on one solid bar.
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

/** An org unit "Start from" offers (spec §34.2): "Printing (Section)", in tree order, in its kind's colour. */
export interface UnitOption {
  id: number;
  label: string;
  depth: number;
  colour?: { fill: string; edge: string; text: string } | null;
}

/** One entry of the Start from box: an org unit (one or more may be picked) or a role card (one, on its own). */
type StartOption =
  | { kind: 'unit'; id: number; label: string; depth: number; code: null; colour?: UnitOption['colour'] }
  | { kind: 'role'; id: number; label: string; depth: number; code: string | null; colour?: undefined };

const SHOW_KEYS: { key: keyof ChartShow; label: string; hint: string }[] = [
  { key: 'departments', label: 'Org units', hint: 'Org units (departments, sections, machines …) as boxes around their people, each with its kind. Off: the plain reporting tree.' },
  { key: 'roles', label: 'Roles', hint: 'The role on each card.' },
  { key: 'people', label: 'People', hint: 'The position rows of each card: a name, or Vacant, with the shift.' },
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
  rootOptions,
  root,
  onRoot,
  unitOptions = [],
  units = [],
  onUnits,
  shift,
  onShift,
  shifts,
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
  labels,
}: {
  rootOptions: RootOption[];
  root: number | '';
  onRoot: (id: number | '') => void;
  /** The org units Start from offers; with none (an older payload) it offers roles only, as before. */
  unitOptions?: UnitOption[];
  /** The picked org units (each drawn with everything under it). Empty = no unit picked. */
  units?: number[];
  onUnits?: (ids: number[]) => void;
  shift: ShiftFilter;
  onShift: (s: ShiftFilter) => void;
  /** The shifts positions are on (General, Day, Night, …) — the filter's choices. */
  shifts: { code: string; name: string }[];
  colours: boolean;
  onColours: (v: boolean) => void;
  /** What is drawn (spec §16). */
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
  /** The chart's label options (Colour by, Show only) — spec §15.4. Absent when the company has no labels to offer. */
  labels?: ReactNode;
}) {
  const startOptions: StartOption[] = [
    ...(onUnits ? unitOptions.map((u): StartOption => ({ kind: 'unit', id: u.id, label: u.label, depth: u.depth, code: null, colour: u.colour })) : []),
    ...rootOptions.map((o): StartOption => ({ kind: 'role', id: o.id, label: o.label, depth: o.depth, code: o.code })),
  ];
  const picked: StartOption[] = units.length
    ? units.map((id) => startOptions.find((o) => o.kind === 'unit' && o.id === id)).filter((o): o is StartOption => !!o)
    : startOptions.filter((o) => o.kind === 'role' && o.id === root);
  // A role is a start on its own; org units add up. Picking a role replaces the units, and the other way round.
  const onPick = (next: StartOption[]) => {
    const addedRole = next.find((o) => o.kind === 'role' && !picked.some((q) => q.kind === 'role' && q.id === o.id));
    if (addedRole) {
      onUnits?.([]);
      onRoot(addedRole.id);
      return;
    }
    const nextUnits = next.filter((o) => o.kind === 'unit').map((o) => o.id);
    if (nextUnits.length) {
      onRoot('');
      onUnits?.(nextUnits);
    } else {
      onUnits?.([]);
      onRoot('');
    }
  };

  return (
    <Surface e={1} sx={{ overflow: 'hidden' }}>
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
            multiple
            size="small"
            disableCloseOnSelect
            data-startfrom=""
            options={startOptions}
            value={picked}
            onChange={(_, v) => onPick(v)}
            groupBy={onUnits && unitOptions.length ? (o) => (o.kind === 'unit' ? 'Org units' : 'Roles') : undefined}
            getOptionLabel={(o) => o.label}
            getOptionKey={(o) => `${o.kind}${o.id}`}
            isOptionEqualToValue={(a, b) => a.kind === b.kind && a.id === b.id}
            sx={{ minWidth: 200, flex: '1 1 220px', maxWidth: 460 }}
            renderInput={(p) => (
              <TextField
                {...p}
                label="Start from"
                placeholder={picked.length ? '' : onUnits && unitOptions.length ? 'Whole organisation — pick org units or a role' : 'Whole organisation'}
              />
            )}
            renderValue={(vals, getItemProps) =>
              vals.map((o, index) => {
                const { key, ...itemProps } = getItemProps({ index });
                return (
                  <Chip
                    key={key}
                    size="small"
                    label={o.label}
                    data-startchip={o.kind}
                    {...itemProps}
                    sx={o.colour ? { background: o.colour.fill, color: o.colour.text, border: `1px solid ${o.colour.edge}`, '& .MuiChip-deleteIcon': { color: o.colour.text } } : undefined}
                  />
                );
              })
            }
            renderOption={(props, o, { selected: on }) => {
              const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
              return (
                <li key={key} {...rest}>
                  <Box sx={{ pl: `${o.depth * (o.kind === 'unit' ? 14 : 10)}px`, minWidth: 0, display: 'flex', alignItems: 'center' }}>
                    {o.colour && (
                      <Box component="span" aria-hidden sx={{ width: 10, height: 10, borderRadius: '50%', mr: 1, flexShrink: 0, background: o.colour.fill, border: `2px solid ${o.colour.edge}` }} />
                    )}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 13.5, fontWeight: on ? 600 : 400 }}>{o.label}</Typography>
                      {o.code && (
                        <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>{o.code}</Typography>
                      )}
                    </Box>
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
            {/* Positions on that shift only. Worth offering only when there is more than one. */}
            {shifts.length > 1 &&
              shifts.map((s) => (
                <ToggleButton key={s.code} value={s.code}>
                  {s.name}
                </ToggleButton>
              ))}
          </ToggleButtonGroup>

          <ShowSwitches show={show} onShow={onShow} />

          <FormControlLabel
            control={
              <Switch size="small" checked={colours} onChange={(e) => onColours(e.target.checked)} />
            }
            title="Colour each position by attendance on this date"
            label={<Typography sx={{ fontSize: 13 }}>Attendance</Typography>}
          />

          {labels}

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
    </Surface>
  );
}
