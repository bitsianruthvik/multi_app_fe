import type { ReactNode } from 'react';
import type { ChartModel } from './orgChartLayout';
import { OrgChartSeatView } from './OrgChartSeatView';
import { OrgChartPersonView } from './OrgChartPersonView';
import { OrgChartOpenSeatView } from './OrgChartOpenSeatView';
import { OrgChartRoleView } from './OrgChartRoleView';
import type { PanelNav, PanelView } from './orgChartPanelNav';

/**
 * The body of the org chart's floating panel: whichever view is on top of the
 * stack (spec §17). The page owns the stack, the title and Back; this only
 * picks the view and hands it what it needs from the chart's own model.
 */
export function OrgChartPanelViews({
  view,
  model,
  asOf,
  company,
  nav,
  onClose,
  onStartFrom,
  onChanged,
  viewOptions,
}: {
  view: PanelView;
  model: ChartModel | null;
  asOf: string;
  company: string;
  nav: PanelNav;
  onClose: () => void;
  onStartFrom: (id: number) => void;
  onChanged: () => void;
  /** Drawn at the bottom of a seat view — the viewer's own options for that box. */
  viewOptions?: (positionId: number) => ReactNode;
}) {
  switch (view.kind) {
    case 'seat':
      return (
        <OrgChartSeatView
          positionId={view.positionId}
          node={model?.byId.get(view.positionId) ?? null}
          asOf={asOf}
          company={company}
          nav={nav}
          titleOf={(id) => model?.byId.get(id)?.displayTitle}
          onClose={onClose}
          onStartFrom={onStartFrom}
          onChanged={onChanged}
        >
          {viewOptions?.(view.positionId)}
        </OrgChartSeatView>
      );
    case 'person':
      return (
        <OrgChartPersonView
          view={view}
          asOf={asOf}
          company={company}
          nav={nav}
          titleOf={(id) => model?.byId.get(id)?.displayTitle}
          onChanged={onChanged}
        />
      );
    case 'open':
      return (
        <OrgChartOpenSeatView
          view={view}
          node={model?.byId.get(view.positionId) ?? null}
          asOf={asOf}
          company={company}
          nav={nav}
          onChanged={onChanged}
        />
      );
    default:
      return (
        <OrgChartRoleView view={view} model={model} asOf={asOf} company={company} nav={nav} onChanged={onChanged} />
      );
  }
}

export default OrgChartPanelViews;
