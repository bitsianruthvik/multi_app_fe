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
 * ONE ROW PER POSITION — the rows the cards draw (`rowsOf`), under the same
 * "start from" root and the same shift filter. So the number of rows is the
 * strip's "Positions", the rows with a person are its "Filled" and the rows
 * that say Vacant are its "Vacant": nothing is counted here, and a fallback
 * that shows less than the picture is a fallback nobody can rely on.
 *
 * A row opens its POSITION; the role is one click further, in the panel.
 */

interface Row {
  id: number;
  cardId: number;
  code: string | null;
  role: string;
  person: string;
  vacant: boolean;
  shift: string;
  manager: string;
  contexts: string;
  secondary: string;
  attendance: string;
  department: string;
  location: string;
  status: string;
  depth: number;
  openPoints: number;
}

export function OrgChartTable({
  model,
  ids,
  filter,
  secondaryEdges,
  onOpen,
}: {
  model: ChartModel;
  /** CARD ids in view. */
  ids: number[];
  filter: ShiftFilter;
  /** Card → card lines other than the primary one. */
  secondaryEdges: OrgChartEdge[];
  /** Opens a POSITION (by position id). */
  onOpen: (positionId: number) => void;
}) {
  const rows: Row[] = useMemo(() => {
    const byFrom = new Map<number, OrgChartEdge[]>();
    for (const e of secondaryEdges) {
      const list = byFrom.get(e.fromPositionId);
      if (list) list.push(e);
      else byFrom.set(e.fromPositionId, [e]);
    }
    return ids.flatMap((id) => {
      const card = model.byId.get(id);
      if (!card) return [];
      const mgrId = model.parent.get(id);
      const mgr = mgrId != null ? model.byId.get(mgrId) : null;
      const secondary = (byFrom.get(id) ?? [])
        .map((e) => {
          const to = model.byId.get(e.toPositionId);
          const who = to ? to.displayTitle || to.title : `#${e.toPositionId}`;
          const scope = e.scopeType && e.scopeType !== 'GENERAL' && e.scopeLabel ? ` — ${e.scopeLabel}` : '';
          return `${e.typeName} → ${who}${scope}`;
        })
        .join('; ');
      return rowsOf(card, filter).flatMap((r) => {
        if (r.positionId == null) return [];
        const p = model.positions.get(r.positionId);
        const att = r.occupant?.attendanceStatus;
        return [
          {
            id: r.positionId,
            cardId: id,
            code: r.positionCode,
            role: card.displayTitle || card.title,
            person: r.occupant ? r.occupant.name?.trim() || 'Name not recorded' : '',
            vacant: !r.occupant,
            shift: r.shiftName,
            manager: mgr ? mgr.displayTitle || mgr.title : '—',
            contexts: (p?.contexts ?? card.contexts ?? []).map((c) => c.name).join(', '),
            secondary,
            attendance: att ? `${att.charAt(0)}${att.slice(1).toLowerCase()}` : '',
            department: card.departmentName ?? '—',
            location: p?.locationName ?? card.locationName ?? '—',
            status: p?.status ?? card.status,
            depth: model.depth.get(id) ?? 0,
            openPoints: p?.counts?.openPoints ?? 0,
          },
        ];
      });
    });
  }, [model, ids, filter, secondaryEdges]);

  const columns: DataColumn<Row>[] = useMemo(
    () => [
      {
        key: 'code',
        header: 'Position',
        width: 110,
        alwaysVisible: true,
        render: (r) => <Mono sx={{ fontSize: 12.5 }}>{r.code ?? '—'}</Mono>,
        sortValue: (r) => r.code ?? '',
        exportValue: (r) => r.code ?? '',
      },
      {
        key: 'role',
        header: 'Role',
        render: (r) => (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <Box sx={{ width: r.depth * 10, flexShrink: 0 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{r.role}</Typography>
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
        sortValue: (r) => r.role,
        exportValue: (r) => r.role,
      },
      {
        key: 'person',
        header: 'Person',
        render: (r) =>
          r.vacant ? (
            // A vacancy is a fact, not an alarm: muted, never a warning colour.
            <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)', fontStyle: 'italic' }}>Vacant</Typography>
          ) : (
            <Typography sx={{ fontSize: 13.5 }}>{r.person}</Typography>
          ),
        // Vacant rows sort together, after the names.
        sortValue: (r) => (r.vacant ? '￿' : r.person),
        exportValue: (r) => (r.vacant ? 'Vacant' : r.person),
      },
      {
        key: 'shift',
        header: 'Shift',
        width: 110,
        render: (r) => r.shift,
        sortValue: (r) => r.shift,
        exportValue: (r) => r.shift,
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
        key: 'attendance',
        header: 'Attendance',
        width: 110,
        defaultHidden: true,
        render: (r) => r.attendance || '—',
        sortValue: (r) => r.attendance,
        exportValue: (r) => r.attendance,
      },
      {
        key: 'department',
        header: 'Department',
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
        defaultHidden: true,
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
      // A new key: the columns changed shape on 2026-10-10 (one row per position).
      storageKey="orgchart-positions-table"
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
