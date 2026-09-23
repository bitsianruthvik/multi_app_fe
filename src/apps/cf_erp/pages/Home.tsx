import type { ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRounded from '@mui/icons-material/RadioButtonUncheckedRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import WarehouseRounded from '@mui/icons-material/WarehouseRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import MarkEmailUnreadRounded from '@mui/icons-material/MarkEmailUnreadRounded';
import RequestQuoteRounded from '@mui/icons-material/RequestQuoteRounded';
import ChecklistRounded from '@mui/icons-material/ChecklistRounded';
import EditNoteRounded from '@mui/icons-material/EditNoteRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import TimerRounded from '@mui/icons-material/TimerRounded';
import PauseCircleRounded from '@mui/icons-material/PauseCircleRounded';
import PlayCircleRounded from '@mui/icons-material/PlayCircleRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import { useAuth } from '@core/contexts/AuthContext';
import { cfApi, qs } from '../api/client';
import type { CodeScheme, Formula, RecordList, SalesOrder, Specification, Tree } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { appPath } from '../navMeta';
import { DangerBadge, EmptyState, ErrorNotice, Mono, OrderStatusBadge, PageHeader, SectionCard, SkeletonRows, StatSkeleton, StatStrip, type Stat } from '../components/ui';
import { WorkQueueCard } from '../components/WorkQueueCard';
import { EntityList, EntityRow } from '../components/EntityList';
import { flattenTree } from '../lib/tree';

type QueueTone = 'primary' | 'warning' | 'danger' | 'info' | 'success';
interface Queue { key: string; title: string; count: number; unit: string; tone: QueueTone; description: string; actionLabel: string; path: string }
interface Cockpit { stats: { key: string; label: string; value: number }[]; queues: Queue[] }
interface Setup { tree: Tree; specs: Specification[]; formulas: Formula[]; schemes: CodeScheme[]; items: RecordList; definitions: RecordList }

const STAT_META: Record<string, { icon: ReactNode; path: string; tone?: Stat['tone'] }> = {
  openOrders: { icon: <ReceiptLongRounded />, path: 'orders' },
  confirmed: { icon: <TaskAltRounded />, path: 'orders?status=confirmed', tone: 'info' },
  inProgress: { icon: <SyncRounded />, path: 'tracker?status=in_progress', tone: 'info' },
  machines: { icon: <PrecisionManufacturingRounded />, path: 'machines' },
  stockLines: { icon: <WarehouseRounded />, path: 'stock' },
};

const QUEUE_ICON: Record<string, ReactNode> = {
  overdue: <WarningAmberRounded />, inquiries: <MarkEmailUnreadRounded />, quoted: <RequestQuoteRounded />, selections: <ChecklistRounded />,
  drafts: <EditNoteRounded />, flows: <RouteRounded />, shifts: <ScheduleRounded />, untimed: <TimerRounded />, held: <PauseCircleRounded />,
  ready: <PlayCircleRounded />, material: <LockRounded />, onhold: <PauseCircleRounded />, release: <RocketLaunchRounded />,
};

/** Any one panel failing (a missing permission, say) must not blank the cockpit. */
const soft = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

/**
 * Home — the cockpit (DESIGN_SYSTEM.md §4.1), as fab_erp's Factory Pulse.
 * Answers "what needs me today?": the live figures, each one a door to its
 * screen; then the queues of waiting work, each with the one screen that
 * clears it; then how far setup has got and the newest open orders.
 * A to-do surface, not a chart dashboard.
 */
export default function Home() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isPermitted = useIsPermitted();
  const go = (path: string) => navigate(appPath(company, path));

  const { data, error, loading, reload } = useLoad(async () => {
    const [cockpit, tree, specs, formulas, schemes, items, definitions, orders] = await Promise.all([
      cfApi.get<Cockpit>('/cockpit'),
      soft(cfApi.get<Tree>('/classification')),
      soft(cfApi.get<Specification[]>('/specifications')),
      soft(cfApi.get<Formula[]>('/formulas')),
      soft(cfApi.get<CodeScheme[]>('/codegen/schemes')),
      soft(cfApi.get<RecordList>(`/records${qs({ recordKind: 'item', limit: 500 })}`)),
      soft(cfApi.get<RecordList>(`/records${qs({ recordKind: 'definition', limit: 1 })}`)),
      isPermitted('cf_erp_orders_view') ? soft(cfApi.get<SalesOrder[]>(`/orders${qs({ open: 1, limit: 6 })}`)) : Promise.resolve(null),
    ]);
    const setup: Setup | null = tree && specs && formulas && schemes && items && definitions ? { tree, specs, formulas, schemes, items, definitions } : null;
    return { cockpit, setup, orders };
  }, []);

  const firstName = user?.name?.split(' ')[0] || 'there';
  const stats: Stat[] = (data?.cockpit.stats ?? []).map((s) => {
    const meta = STAT_META[s.key];
    return { label: s.label, value: s.value, icon: meta?.icon, tone: meta?.tone, onClick: meta ? () => go(meta.path) : undefined };
  });
  const queues = (data?.cockpit.queues ?? []).filter((q) => q.count > 0);

  const setup = data?.setup ?? null;
  const flat = flattenTree(setup?.tree ?? null);
  const variants = flat.filter((n) => n.isLeaf).length;
  const activeItems = setup?.items.rows.filter((r) => r.status === 'active').length ?? 0;
  const steps = setup ? [
    { done: variants > 0, label: 'Classification', detail: `${flat.filter((n) => n.depth === 0).length} families · ${variants} variants`, path: 'classification' },
    { done: setup.specs.length > 0, label: 'Specifications', detail: `${setup.specs.length} in the library`, path: 'specifications' },
    { done: setup.formulas.length > 0, label: 'Formulas', detail: `${setup.formulas.length} reusable formulas`, path: 'formulas' },
    { done: setup.schemes.length > 0, label: 'Coding rules', detail: setup.schemes.length ? `${setup.schemes.length} rules` : 'None yet — codes will need typing in', path: 'coding-rules' },
    { done: setup.items.total > 0, label: 'Catalog items', detail: `${setup.items.total} items · ${activeItems} active`, path: 'items' },
    { done: setup.definitions.total > 0, label: 'Definitions', detail: `${setup.definitions.total} templates and selections`, path: 'definitions' },
  ] : [];
  const stepsDone = steps.filter((s) => s.done).length;

  return (
    <Box sx={{ maxWidth: 1280 }}>
      <PageHeader title={`Welcome back, ${firstName}`} subtitle="Here's what needs you today."
        actions={<Button size="small" startIcon={<RefreshRounded />} onClick={reload} disabled={loading} sx={{ color: 'var(--c-text-2)' }}>Refresh</Button>} />
      <ErrorNotice error={error} onRetry={reload} />

      {loading && !data ? (
        <>
          <StatSkeleton count={4} />
          <SkeletonRows rows={3} height={120} />
        </>
      ) : data && (
        <>
          {stats.length > 0 && <StatStrip stats={stats} />}

          <Typography component="h2" sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1.5 }}>
            Waiting on you
          </Typography>
          {queues.length === 0 ? (
            <EmptyState icon={<CheckCircleRounded />} title="Nothing is waiting on you"
              hint="Overdue orders, inquiries to quote, drafts, machines without shifts and stock on hold show up here." />
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 1.5, alignItems: 'stretch' }}>
              {queues.map((q) => (
                <WorkQueueCard key={q.key} icon={QUEUE_ICON[q.key] ?? <ChecklistRounded />} title={q.title} count={q.count} unit={q.unit}
                  description={q.description} actionLabel={q.actionLabel} onAction={() => go(q.path)} tone={q.tone} />
              ))}
            </Box>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2, mt: 3 }}>
            {data.orders && (
              <SectionCard title="Open orders" subtitle="Inquiries being designed, quotations out, confirmed work — the newest first."
                actions={<Button component={Link} to={appPath(company, 'orders')} size="small" endIcon={<ArrowForwardRounded />}>All orders</Button>}>
                {data.orders.length === 0 ? (
                  <Typography sx={{ color: 'var(--c-text-2)', py: 2 }}>No open orders.</Typography>
                ) : (
                  <EntityList>
                    {data.orders.map((o) => (
                      <EntityRow key={o.id} onClick={() => go(`orders/${o.id}`)} code={<Mono chip>{o.code}</Mono>}
                        primary={o.title ?? o.customer?.name ?? 'Stock order'} secondary={o.title ? o.customer?.name : undefined}
                        trailing={<>{o.overdue && <DangerBadge label="Past date" />}<OrderStatusBadge status={o.status} /></>} />
                    ))}
                  </EntityList>
                )}
              </SectionCard>
            )}
            {setup && (
              <SectionCard title="Setup" subtitle={`${stepsDone} of ${steps.length} in place — what the catalog is built from, in the order it is usually set up.`}>
                <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>
                  {steps.map((s) => (
                    <Box component="li" key={s.label}>
                      <Box component={Link} to={appPath(company, s.path)} sx={{
                        display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25, borderRadius: 'var(--r-sm)', color: 'var(--c-text)', textDecoration: 'none',
                        '&:hover': { background: 'var(--c-surface-2)' },
                      }}>
                        {s.done
                          ? <CheckCircleRounded sx={{ color: 'var(--c-success-600)' }} aria-label="Done" />
                          : <RadioButtonUncheckedRounded sx={{ color: 'var(--c-text-3)' }} aria-label="Not yet" />}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 500, fontSize: 14 }}>{s.label}</Typography>
                          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{s.detail}</Typography>
                        </Box>
                        <ArrowForwardRounded sx={{ color: 'var(--c-text-3)', fontSize: 18 }} />
                      </Box>
                    </Box>
                  ))}
                </Box>
              </SectionCard>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
