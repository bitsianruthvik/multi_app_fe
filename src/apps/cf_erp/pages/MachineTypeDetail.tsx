import { Box } from '@mui/material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import TableChartOutlined from '@mui/icons-material/TableChartOutlined';
import TuneRounded from '@mui/icons-material/TuneRounded';
import { getMachineTypeDetails } from '../api/charts';
import type { TreeNode } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { DetailSkeleton, EmptyState, ErrorNotice, Fact, Mono, SectionCard, StatusBadge } from '../components/ui';
import { CrossLink, DetailHeader, DetailLayout } from '../components/DetailLayout';
import { EntityList, EntityRow } from '../components/EntityList';
import { ClassificationRules } from '../components/ClassificationRules';
import { ChartsPanel } from '../components/Charts/ChartsPanel';
import { useDetailTitle } from '../components/shell/detailTitle';

/**
 * Record / Detail (§4.3) for a machine type: the specifications it makes every
 * machine of the type carry, the charts (lookup tables) they share, and the
 * machines that sit on it. Reached from the Machines screen.
 */
export default function MachineTypeDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const company = useCompanySlug();
  const navigate = useNavigate();
  const isPermitted = useIsPermitted();
  const canManage = isPermitted('cf_erp_production_manage');
  const canSetup = isPermitted('cf_erp_setup_manage');
  const d = useLoad(() => getMachineTypeDetails(id), [id]);
  const [tab, setTab] = useUrlParam('tab', 'specs');
  useDetailTitle(d.data?.node.code ?? null);

  if (d.error) return <ErrorNotice error={d.error} onRetry={d.reload} />;
  if (!d.data) return <DetailSkeleton />;
  const { node, path, machines, charts } = d.data;
  const to = (p: string) => appPath(company, p);
  // ClassificationRules reads only the id, depth, name and scope of the node it is for.
  const treeNode: TreeNode = {
    id: node.id, parentId: null, depth: node.depth, level: 'Machine type', scope: 'machine', code: node.code, name: node.name,
    description: node.description, sortOrder: 0, status: node.status, itemCount: 0, definitionCount: 0, ruleCount: 0, machineCount: machines.length, children: [],
  };

  const header = (
    <DetailHeader code={node.code} title={node.name} subtitle={node.description ?? undefined} badges={<StatusBadge status={node.status} />}
      facts={(
        <>
          <Fact label="Path"><Box component="span" data-testid="type-path">{path.map((p) => p.name).join(' › ')}</Box></Fact>
          <Fact label="Machines"><Mono>{machines.length}</Mono></Fact>
          <Fact label="Charts"><Mono>{charts.length}</Mono></Fact>
        </>
      )} />
  );
  const crossLinks = (
    <>
      <CrossLink icon={<PrecisionManufacturingRounded />} label="All machines" to={to('machines')} />
      <CrossLink icon={<TuneRounded />} label="Specifications" onClick={() => setTab('specs')} />
      <CrossLink icon={<TableChartOutlined />} label="Charts" count={charts.length} onClick={() => setTab('charts')} />
    </>
  );
  const tabs = [
    { value: 'specs', label: 'Specifications' },
    { value: 'charts', label: 'Charts', count: charts.length },
    { value: 'machines', label: 'Machines', count: machines.length },
  ];

  return (
    <DetailLayout header={header} crossLinks={crossLinks} tabs={tabs} active={tab} onTab={setTab}>
      {tab === 'specs' && <ClassificationRules key={node.id} node={treeNode} canManage={canSetup} onChanged={d.reload} />}
      {tab === 'charts' && <ChartsPanel subject={{ type: 'classification', id }} canManage={canManage} onChanged={d.reload} />}
      {tab === 'machines' && (
        <SectionCard title="Machines of this type" subtitle="Including the types below it.">
          {machines.length === 0 ? (
            <EmptyState icon={<PrecisionManufacturingRounded />} title="No machine of this type yet" hint="Add one on the Machines screen." />
          ) : (
            <EntityList>
              {machines.map((m) => (
                <EntityRow key={m.id} code={<Mono chip>{m.code}</Mono>} primary={<Box component={Link} to={to(`machines/${m.id}`)} sx={{ color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } }}>{m.name}</Box>} trailing={<StatusBadge status={m.status} />}
                  onClick={() => navigate(to(`machines/${m.id}`))} />
              ))}
            </EntityList>
          )}
        </SectionCard>
      )}
    </DetailLayout>
  );
}
