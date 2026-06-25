import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Divider, Grid, Stack, Tab, Tabs, Typography,
} from '@mui/material';
import AccountTreeIcon   from '@mui/icons-material/AccountTree';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import UploadFileIcon   from '@mui/icons-material/UploadFile';
import DownloadIcon     from '@mui/icons-material/Download';
import RateReviewIcon   from '@mui/icons-material/RateReview';
import CheckCircleIcon  from '@mui/icons-material/CheckCircle';
import HistoryIcon      from '@mui/icons-material/History';
import AddIcon          from '@mui/icons-material/Add';
import RouteIcon        from '@mui/icons-material/Route';
import MapIcon           from '@mui/icons-material/Map';
import TableChartIcon    from '@mui/icons-material/TableChart';
import api, { API_HOST } from '@core/utils/axiosConfig';
import { usePermission } from '@core/hooks/usePermission';
import PlanMap from './PlanMap';
import PlanSchedule from './PlanSchedule';
import ScheduleTrackingMap from '../components/ScheduleTrackingMap';

interface Plan {
  id: number; projectCode: string; projectName: string; clientName: string;
  siteLocation: string; planName: string; planRevision: string;
  status: string; source: string; notes: string;
  createdByName: string; approvedByName: string; approvedAt: string; createdAt: string;
  calendarId: number | null; plannedStartDate: string | null; targetEndDate: string | null;
  schedulingMode: string | null;
}
interface Stats {
  nodeCount: number; routeCount: number; totalMinutes: number;
  levelBreakdown: Record<string, number>;
}

const STATUS_COLOR: Record<string, 'warning' | 'success' | 'default'> = {
  Draft: 'warning', Approved: 'success', Superseded: 'default',
};

export default function PlanDashboard() {
  const { company, planId } = useParams<{ company: string; planId: string }>();
  const navigate            = useNavigate();
  const canApprove          = usePermission('fab_approve_plan');

  const [plan, setPlan]           = useState<Plan | null>(null);
  const [stats, setStats]         = useState<Stats | null>(null);
  const [loading, setLoading]     = useState(true);
  const [actionLoading, setAL]    = useState('');
  const [exporting, setExporting] = useState(false);
  const [error, setError]         = useState('');
  const [activeTab, setActiveTab] = useState(0);

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    try {
      const [planRes, nodeRes, routeRes] = await Promise.all([
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_project_plans',
          fields: [
            'id','projectCode','projectName','clientName','siteLocation','planName','planRevision',
            'status','source','notes','createdByName','approvedByName','approvedAt','createdAt',
            'calendarId','plannedStartDate','targetEndDate','schedulingMode',
          ],
          filters: { id: Number(planId) },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_nodes',
          fields: ['id','levelName'],
          filters: { projectPlanId: Number(planId) },
          pagination: { limit: 2000 },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_process_steps',
          fields: ['id','estimatedTimeValue','estimatedTimeUnit'],
          filters: { projectPlanId: Number(planId) },
          pagination: { limit: 5000 },
        }),
      ]);

      const p = (planRes.data?.data ?? planRes.data)?.[0];
      setPlan(p ?? null);

      const nodes:  Record<string, unknown>[] = nodeRes.data?.data ?? nodeRes.data ?? [];
      const routes: Record<string, unknown>[] = routeRes.data?.data ?? routeRes.data ?? [];

      const levelBreakdown: Record<string, number> = {};
      nodes.forEach((n) => {
        const key = (n.levelName as string | null) ?? 'Unclassified';
        levelBreakdown[key] = (levelBreakdown[key] ?? 0) + 1;
      });

      const totalMinutes = routes.reduce((sum: number, r) => {
        const unit = ((r.estimatedTimeUnit as string | null) ?? 'min').toLowerCase();
        const val  = Number(r.estimatedTimeValue ?? 0);
        return sum + (unit === 'hr' ? val * 60 : val);
      }, 0);

      setStats({ nodeCount: nodes.length, routeCount: routes.length, totalMinutes, levelBreakdown });
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  async function handleApprove() {
    setAL('approve');
    try {
      await api.post(`/plans/${planId}/approve`);
      fetchPlan();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ?? (err as Error).message);
    } finally {
      setAL('');
    }
  }

  async function handleRevise() {
    setAL('revise');
    try {
      const res = await api.post(`/plans/${planId}/revise`);
      navigate(`/${company}/fab_flow/plans/${res.data.data.id}`);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ?? (err as Error).message);
    } finally {
      setAL('');
    }
  }

  async function downloadExport() {
    setExporting(true);
    try {
      const res = await api.get(`/plans/${planId}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `FabFlow_Plan_${planId}_export.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Export failed — could not download the current plan.');
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (!plan)   return <Box sx={{ p: 3 }}><Alert severity="error">Plan not found.</Alert></Box>;

  const isDraft    = plan.status === 'Draft';
  const isApproved = plan.status === 'Approved';
  const hours = Math.floor((stats?.totalMinutes ?? 0) / 60);
  const mins  = Math.round((stats?.totalMinutes ?? 0) % 60);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {error && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Compact header */}
      <Box sx={{ px: 3, pt: 1.5, pb: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label={plan.status} color={STATUS_COLOR[plan.status]} size="small" />
              <Typography variant="caption" color="text.secondary">{plan.planRevision}</Typography>
              <Typography variant="h6" fontWeight={700} sx={{ ml: 0.5 }}>{plan.planName}</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">{plan.projectCode} · {plan.projectName}
              {plan.clientName ? ` · ${plan.clientName}` : ''}
            </Typography>
          </Box>

          <Stack direction="row" spacing={0.5} flexWrap="wrap" justifyContent="flex-end">
            <Button size="small" startIcon={<AccountTreeIcon />} onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/tree`)}>
              Tree
            </Button>
            <Button size="small" variant="outlined" color="primary" startIcon={<CalendarMonthIcon />}
              onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/schedule`)}>
              Schedule
            </Button>
            <Button size="small" startIcon={<RouteIcon />} onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/process-steps`)}>
              Steps
            </Button>
            {isDraft && (
              <>
                <Button size="small" startIcon={<AddIcon />} onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/nodes/new`)}>
                  Add Node
                </Button>
                <Button size="small" startIcon={<UploadFileIcon />} onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/excel-upload`)}>
                  Upload
                </Button>
                <Button
                  size="small" variant="outlined" startIcon={<RateReviewIcon />}
                  onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/review`)}
                >
                  Review
                </Button>
                {canApprove && (
                  <Button
                    size="small" variant="contained" color="success" startIcon={<CheckCircleIcon />}
                    onClick={handleApprove} disabled={actionLoading === 'approve'}
                  >
                    {actionLoading === 'approve' ? <CircularProgress size={14} /> : 'Approve'}
                  </Button>
                )}
              </>
            )}
            {isApproved && (
              <Button
                size="small" variant="outlined" startIcon={<HistoryIcon />}
                onClick={handleRevise} disabled={actionLoading === 'revise'}
              >
                {actionLoading === 'revise' ? <CircularProgress size={14} /> : 'Revise'}
              </Button>
            )}
            <Button
              size="small"
              startIcon={exporting ? <CircularProgress size={14} /> : <DownloadIcon />}
              onClick={downloadExport}
              disabled={exporting}
            >
              Export
            </Button>
          </Stack>
        </Box>
      </Box>

      {/* Tabs — order: Overview · Nodes Mapping · Tracking · Schedule */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0, px: 2 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ minHeight: 40 }}>
          <Tab label="Overview" sx={{ minHeight: 40, py: 0.5, fontSize: '0.8rem' }} />
          <Tab
            icon={<MapIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Nodes Mapping"
            sx={{ minHeight: 40, py: 0.5, fontSize: '0.8rem' }}
          />
          <Tab
            icon={<TableChartIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Tracking"
            sx={{ minHeight: 40, py: 0.5, fontSize: '0.8rem' }}
          />
          <Tab
            icon={<CalendarMonthIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Schedule"
            sx={{ minHeight: 40, py: 0.5, fontSize: '0.8rem' }}
          />
        </Tabs>
      </Box>

      {/* Tab content */}
      <Box>
        {/* Overview tab */}
        {activeTab === 0 && (
          <Box sx={{ height: '100%', overflow: 'auto', p: 3, maxWidth: 1200, mx: 'auto', width: '100%' }}>
            {/* Stats */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {[
                { label: 'Nodes',         value: stats?.nodeCount ?? 0 },
                { label: 'Process Steps', value: stats?.routeCount ?? 0 },
                { label: 'Est. Time',     value: `${hours}h ${mins}m` },
                { label: 'Source',        value: plan.source },
              ].map((s) => (
                <Grid size={{ xs: 6, sm: 3 }} key={s.label}>
                  <Card sx={{ textAlign: 'center', py: 1.5 }}>
                    <Typography variant="h5" fontWeight={700}>{s.value}</Typography>
                    <Typography variant="body2" color="text.secondary">{s.label}</Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>

            {/* Scheduling info */}
            {(plan.calendarId || plan.plannedStartDate || plan.targetEndDate || plan.schedulingMode) && (
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="subtitle2" gutterBottom>Scheduling</Typography>
                  <Divider sx={{ mb: 1 }} />
                  <Grid container spacing={1}>
                    {[
                      ['Scheduling Mode', plan.schedulingMode],
                      ['Planned Start',   plan.plannedStartDate ? new Date(plan.plannedStartDate).toLocaleDateString() : null],
                      ['Target End',      plan.targetEndDate    ? new Date(plan.targetEndDate).toLocaleDateString()    : null],
                    ].filter(([, v]) => v).map(([label, value]) => (
                      <Grid size={{ xs: 12, sm: 4 }} key={label as string}>
                        <Typography variant="caption" color="text.secondary">{label}</Typography>
                        <Typography variant="body2">{value}</Typography>
                      </Grid>
                    ))}
                  </Grid>
                </CardContent>
              </Card>
            )}

            {/* Level breakdown */}
            {stats && Object.keys(stats.levelBreakdown).length > 0 && (
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="subtitle2" gutterBottom>Nodes by Level</Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {Object.entries(stats.levelBreakdown).map(([level, count]) => (
                      <Chip key={level} label={`${level}: ${count}`} size="small" variant="outlined" />
                    ))}
                  </Box>
                </CardContent>
              </Card>
            )}

            {/* Plan meta */}
            <Card>
              <CardContent>
                <Typography variant="subtitle2" gutterBottom>Plan Details</Typography>
                <Divider sx={{ mb: 1 }} />
                <Grid container spacing={1}>
                  {[
                    ['Project Code', plan.projectCode],
                    ['Project Name', plan.projectName],
                    ['Client',       plan.clientName],
                    ['Site',         plan.siteLocation],
                    ['Created By',   plan.createdByName],
                    ['Approved By',  plan.approvedByName],
                    ['Approved At',  plan.approvedAt ? new Date(plan.approvedAt).toLocaleString() : '—'],
                    ['Notes',        plan.notes],
                  ].filter(([, v]) => v).map(([label, value]) => (
                    <Grid size={{ xs: 12, sm: 6 }} key={label as string}>
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                      <Typography variant="body2">{value}</Typography>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          </Box>
        )}

        {/* Nodes Mapping tab */}
        {activeTab === 1 && (
          <PlanMap planId={planId!} company={company!} />
        )}

        {/* Tracking tab */}
        {activeTab === 2 && (
          <ScheduleTrackingMap planId={planId!} company={company!} />
        )}

        {/* Schedule tab — embedded Gantt; rootHeight accounts for dashboard header + tabs */}
        {activeTab === 3 && (
          <PlanSchedule rootHeight="calc(100vh - 130px)" />
        )}
      </Box>
    </Box>
  );
}
