import { createContext, useContext, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box } from '@mui/material';
import { DetailTabs, PageHeader } from '@shared/ui';

/**
 * One screen holding several small screens as tabs (Setup › Libraries, Setup ›
 * Logins and access — CF_HRMS_HIRING_SPEC.md §10).
 *
 * The tab lives in the address (`?tab=kpis`) so a link, a redirect from an old
 * address and the browser's back button all land on the right one.
 *
 * Each tab's content is a component that used to be a whole page with its own
 * `PageHeader`. Inside a tabbed screen it calls `ScreenHeader` instead, which
 * drops the title (the tab already says it) and keeps the one-line description
 * and the buttons.
 */
const EmbeddedContext = createContext(false);

export interface ScreenTab {
  value: string;
  label: string;
  render: () => ReactNode;
}

export function TabbedScreen({
  title,
  subtitle,
  tabs,
}: {
  title: string;
  subtitle?: string;
  tabs: ScreenTab[];
}) {
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  const active = tabs.find((t) => t.value === asked) ?? tabs[0];

  const pick = (value: string) => {
    // Only the tab survives: another tab's `?new=1` or filter means nothing here.
    setParams({ tab: value }, { replace: true });
  };

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <DetailTabs tabs={tabs.map((t) => ({ value: t.value, label: t.label }))} active={active.value} onTab={pick} />
      <EmbeddedContext.Provider value={true}>
        {/* Keyed, so one tab's search box and open dialog never leak into the next. */}
        <Box key={active.value} role="tabpanel">
          {active.render()}
        </Box>
      </EmbeddedContext.Provider>
    </>
  );
}

/**
 * The header of a screen that may be shown on its own or as a tab. On its own
 * it is the kit's `PageHeader`; as a tab it is one line of description with the
 * buttons beside it.
 */
export function ScreenHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const embedded = useContext(EmbeddedContext);
  if (!embedded) return <PageHeader title={title} subtitle={subtitle} actions={actions} />;
  if (!subtitle && !actions) return null;
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        flexWrap: 'wrap',
        mb: 2,
      }}
    >
      <Box sx={{ fontSize: 14, color: 'var(--c-text-2)', flex: '1 1 280px', minWidth: 0, maxWidth: 820 }}>{subtitle}</Box>
      {actions && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>}
    </Box>
  );
}
