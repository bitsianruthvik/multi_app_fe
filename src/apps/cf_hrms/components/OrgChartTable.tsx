import { useMemo } from 'react';
import { Box, Stack, Tooltip, Typography } from '@mui/material';
import { DataTable, EmptyState, Mono, StatusBadge } from '@shared/ui';
import type { DataColumn } from '@shared/ui';
import type { OrgChartEdge } from '../api/orgchart';
import { rowsOf, type ChartModel, type ShiftFilter } from './orgChartLayout';

/**
 * The chart as a table — and the reason this screen passes DESIGN_SYSTEM.md
 * §4.5 and §6.4, which require a canvas to have a keyboard/list alternative.
 *
 * It is NOT a cut-down version. It carries the same positions, under the same
 * "start from" root and the same shift filter, with the same seat maths, so the
 * vacancy totals in the strip above are true of whichever view is open. A
 * fallback that shows less than the picture is a fallback nobody can rely on.
 */

interface Row {
  id: number;
  code: string | null;
  title: string;
  manager: string;
  managerId: number | null;
  contexts: string;
  secondary: string;
  shift: string;
  seats: number;
  filled: number;
  vacant: number;
  present: number;
  absent: number;
  occupants: string;
  department: string;
  location: string;
  status: string;
  depth: number;
  openPoints: number;
}

const SHIFT_LABEL: Record<string, string> = {
  G: 'General',
  D: 'Day',
  N: 'Night',
  DN: 'Day & Night',
};

export function OrgChartTable({
  model,
  ids,
  filter,
  secondaryEdges,
  onOpen,
}: {
  model: ChartModel;
  ids: number[];
  filter: ShiftFilter;
  secondaryEdges: OrgChartEdge[];
  onOpen: (id: number) => void;
}) {
  const rows: Row[] = useMemo(() => {
    const byFrom = new Map<number, OrgChartEdge[]>();
    for (const e of secondaryEdges) {
      const list = byFrom.get(e.fromPositionId);
      if (list) list.push(e);
      else byFrom.set(e.fromPositionId, [e]);
    }
    return ids.flatMap((id) => {
      const n = model.byId.get(id);
      if (!n) return [];
      const seatRows = rowsOf(n, filter);
      const filled = seatRows.filter((r) => r.occupant).length;
      const present = seatRows.filter((r) => r.occupant?.attendanceStatus === 'PRESENT').length;
      const absent = seatRows.filter((r) => r.occupant?.attendanceStatus === 'ABSENT').length;
      const mgrId = model.parent.get(id) ?? null;
      const mgr = mgrId != null ? model.byId.get(mgrId) : null;
      return [
        {
          id,
          code: n.positionCode,
          title: n.displayTitle || n.title,
          manager: mgr ? mgr.displayTitle || mgr.title : '—',
          managerId: mgrId,
          contexts: (n.contexts ?? []).map((c) => c.name).join(', '),
          secondary: (byFrom.get(id) ?? [])
            .map((e) => {
              const to = model.byId.get(e.toPositionId);
              const who = to ? to.displayTitle || to.title : `#${e.toPositionId}`;
              const scope =
                e.scopeType && e.scopeType !== 'GENERAL' && e.scopeLabel ? ` — ${e.scopeLabel}` : '';
              return `${e.typeName} → ${who}${scope}`;
            })
            .join('; '),
          shift: SHIFT_LABEL[n.shiftPattern] ?? n.shiftPattern,
          seats: seatRows.length,
          filled,
          vacant: seatRows.length - filled,
          present,
          absent,
          occupants: seatRows
            .filter((r) => r.occupant)
            .map((r) => r.occupant!.name)
            .join(', '),
          department: n.departmentName ?? '—',
          location: n.locationName ?? '—',
          status: n.status,
          depth: model.depth.get(id) ?? 0,
          openPoints: n.counts?.openPoints ?? 0,
        },
      ];
    });
  }, [model, ids, filter, secondaryEdges]);

  const columns: DataColumn<Row>[] = useMemo(
    () => [
      {
        key: 'code',
        header: 'Code',
        width: 110,
        alwaysVisible: true,
        render: (r) => <Mono sx={{ fontSize: 12.5 }}>{r.code ?? '—'}</Mono>,
        sortValue: (r) => r.code ?? '',
        exportValue: (r) => r.code ?? '',
      },
      {
        key: 'title',
        header: 'Position',
        render: (r) => (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <Box sx={{ width: r.depth * 10, flexShrink: 0 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{r.title}</Typography>
            {r.openPoints > 0 && (
              <Tooltip title={`${r.openPoints} open point${r.openPoints === 1 ? '' : 's'}`}>
                <Box
                  component="span"
                  sx={{
                    fontSize: 11,
                    px: 0.75,
                    borderRadius: 'var(--r-sm)',
                    background: 'var(--c-warning-50)',
                    color: 'var(--c-warning-800)',
                  }}
                >
                  {r.openPoints}?
                </Box>
              </Tooltip>
            )}
          </Stack>
        ),
        sortValue: (r) => r.title,
        exportValue: (r) => r.title,
      },
      {
        key: 'manager',
        header: 'Reports to',
        render: (r) => r.manager,
        sortValue: (r) => r.manager,
        exportValue: (r) => r.manager,
      },
      {
        key: 'secondary',
        header: 'Other reporting',
        render: (r) => (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
            {r.secondary || '—'}
          </Typography>
        ),
        sortValue: (r) => r.secondary,
        exportValue: (r) => r.secondary,
      },
      {
        key: 'contexts',
        header: 'Works on',
        render: (r) => r.contexts || '—',
        sortValue: (r) => r.contexts,
        exportValue: (r) => r.contexts,
      },
      {
        key: 'shift',
        header: 'Shift',
        width: 120,
        render: (r) => r.shift,
        sortValue: (r) => r.shift,
        exportValue: (r) => r.shift,
      },
      {
        key: 'seats',
        header: 'Seats',
        numeric: true,
        align: 'right',
        width: 80,
        render: (r) => <Mono sx={{ fontSize: 13 }}>{r.seats}</Mono>,
        sortValue: (r) => r.seats,
        exportValue: (r) => r.seats,
      },
      {
        key: 'filled',
        header: 'Filled',
        numeric: true,
        align: 'right',
        width: 80,
        render: (r) => <Mono sx={{ fontSize: 13 }}>{r.filled}</Mono>,
        sortValue: (r) => r.filled,
        exportValue: (r) => r.filled,
      },
      {
        key: 'vacant',
        header: 'Vacant',
        numeric: true,
        align: 'right',
        width: 80,
        render: (r) => <Mono sx={{ fontSize: 13 }}>{r.vacant}</Mono>,
        sortValue: (r) => r.vacant,
        exportValue: (r) => r.vacant,
      },
      {
        key: 'present',
        header: 'Present',
        numeric: true,
        align: 'right',
        width: 90,
        defaultHidden: true,
        render: (r) => <Mono sx={{ fontSize: 13 }}>{r.present}</Mono>,
        sortValue: (r) => r.present,
        exportValue: (r) => r.present,
      },
      {
        key: 'absent',
        header: 'Absent',
        numeric: true,
        align: 'right',
        width: 90,
        defaultHidden: true,
        render: (r) => <Mono sx={{ fontSize: 13 }}>{r.absent}</Mono>,
        sortValue: (r) => r.absent,
        exportValue: (r) => r.absent,
      },
      {
        key: 'occupants',
        header: 'People',
        render: (r) => (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
            {r.occupants || 'Nobody assigned'}
          </Typography>
        ),
        sortValue: (r) => r.occupants,
        exportValue: (r) => r.occupants,
      },
      {
        key: 'department',
        header: 'Department',
        defaultHidden: true,
        render: (r) => r.department,
        sortValue: (r) => r.department,
        exportValue: (r) => r.department,
      },
      {
        key: 'location',
        header: 'Location',
        defaultHidden: true,
        render: (r) => r.location,
        sortValue: (r) => r.location,
        exportValue: (r) => r.location,
      },
      {
        key: 'status',
        header: 'Status',
        width: 110,
        render: (r) => <StatusBadge status={r.status} />,
        sortValue: (r) => r.status,
        exportValue: (r) => r.status,
      },
      {
        key: 'depth',
        header: 'Level',
        numeric: true,
        align: 'right',
        width: 80,
        defaultHidden: true,
        render: (r) => <Mono sx={{ fontSize: 13 }}>{r.depth}</Mono>,
        sortValue: (r) => r.depth,
        exportValue: (r) => r.depth,
      },
    ],
    [],
  );

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(r) => r.id}
      onRowClick={(r) => onOpen(r.id)}
      storageKey="orgchart-table"
      exportName="org-chart"
      pageSize={50}
      defaultSortKey="code"
      empty={
        <EmptyState
          title="No positions in this view"
          hint="Clear the start-from filter, or choose another shift."
        />
      }
    />
  );
}
