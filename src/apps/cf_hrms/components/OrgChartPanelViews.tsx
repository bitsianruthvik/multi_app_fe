import type { ReactNode } from 'react';
import { DetailSkeleton, ErrorNotice } from '@shared/ui';
import type { ChartModel } from './orgChartLayout';
import { OrgChartPersonView } from './OrgChartPersonView';
import { OrgChartVacantPositionView } from './OrgChartVacantPositionView';
import { OrgChartRoleView } from './OrgChartRoleView';
import { usePositionCard } from './usePositionCard';
import type { PanelNav, PanelView } from './orgChartPanelNav';

/**
 * The body of the org chart's floating panel: whichever view is on top of the
 * stack (spec §17, two-level model). The page owns the stack, the title and
 * Back; this only picks the view and hands it what it needs from the chart's
 * own model.
 *
 *   role      a card's headline            → OrgChartRoleView
 *   position  a row of a card              → the person in it (OrgChartPersonView)
 *                                            or the vacancy (OrgChartVacantPositionView)
 *   person    someone named on a line      → OrgChartPersonView
 */

interface Shared {
  model: ChartModel | null;
  asOf: string;
  company: string;
  nav: PanelNav;
  onClose: () => void;
  onStartFrom: (positionId: number) => void;
  onChanged: () => void;
}

/** A position: filled → its person; vacant → the vacancy. Decided by the chart, or by the server for one off the chart. */
function PositionView({ positionId, ...p }: Shared & { positionId: number }) {
  const node = p.model?.positions.get(positionId) ?? null;
  // A position that is not on the chart (closed, another date, outside the
  // employee's slice) is asked for; one on the chart is not fetched here.
  const lookup = usePositionCard(node ? null : positionId, p.asOf, '');
  const titleOf = (id: number) => p.model?.positions.get(id)?.displayTitle;
  const cardIdOfPosition = (id: number) => p.model?.cardOf.get(id) ?? null;

  if (!node && !lookup.card) {
    return lookup.error ? <ErrorNotice error={lookup.error} fallback="That position could not be loaded." /> : <DetailSkeleton />;
  }
  const occupant = node ? (node.occupants?.[0] ?? null) : (lookup.card?.occupants?.[0] ?? null);
  if (occupant) {
    return (
      <OrgChartPersonView
        view={{
          kind: 'person',
          employeeId: occupant.employeeId,
          title: occupant.name,
          employeeCode: occupant.employeeCode,
          positionId,
        }}
        node={node}
        asOf={p.asOf}
        company={p.company}
        nav={p.nav}
        titleOf={titleOf}
        cardIdOfPosition={cardIdOfPosition}
        onStartFrom={p.onStartFrom}
        onClose={p.onClose}
        onChanged={p.onChanged}
      />
    );
  }
  return (
    <OrgChartVacantPositionView
      positionId={positionId}
      node={node}
      asOf={p.asOf}
      company={p.company}
      nav={p.nav}
      titleOf={titleOf}
      onStartFrom={p.onStartFrom}
      onClose={p.onClose}
      onChanged={p.onChanged}
    />
  );
}

export function OrgChartPanelViews({
  view,
  onOpenCard,
  viewOptions,
  ...shared
}: Shared & {
  view: PanelView;
  /** Re-centres the chart on a card and opens its role view. */
  onOpenCard?: (cardId: number) => void;
  /** Drawn at the bottom of a card's role view — the viewer's own options for that card. */
  viewOptions?: (cardId: number) => ReactNode;
}) {
  const { model, asOf, company, nav, onChanged, onStartFrom, onClose } = shared;
  switch (view.kind) {
    case 'role':
      return (
        <OrgChartRoleView
          view={view}
          model={model}
          asOf={asOf}
          company={company}
          nav={nav}
          onChanged={onChanged}
          onOpenCard={onOpenCard}
        >
          {view.cardId != null ? viewOptions?.(view.cardId) : null}
        </OrgChartRoleView>
      );
    case 'position':
      return <PositionView key={view.positionId} positionId={view.positionId} {...shared} />;
    default:
      return (
        <OrgChartPersonView
          view={view}
          node={view.positionId != null ? (model?.positions.get(view.positionId) ?? null) : null}
          asOf={asOf}
          company={company}
          nav={nav}
          titleOf={(id) => model?.positions.get(id)?.displayTitle}
          cardIdOfPosition={(id) => model?.cardOf.get(id) ?? null}
          onStartFrom={onStartFrom}
          onClose={onClose}
          onChanged={onChanged}
        />
      );
  }
}

export default OrgChartPanelViews;
