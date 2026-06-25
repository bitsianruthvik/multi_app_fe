import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  Grid, TextField, Typography,
} from '@mui/material';
import AddIcon      from '@mui/icons-material/Add';
import FactoryIcon   from '@mui/icons-material/Factory';
import api, { API_HOST } from '@core/utils/axiosConfig';
import { useAuth } from '@core/contexts/AuthContext';

interface Plan {
  id: number;
  projectCode: string;
  projectName: string;
  clientName: string;
  planName: string;
  planRevision: string;
  status: 'Draft' | 'Approved' | 'Superseded';
  source: string;
  createdByName: string;
  createdAt: string;
}

const STATUS_COLOR: Record<string, 'warning' | 'success' | 'default'> = {
  Draft: 'warning', Approved: 'success', Superseded: 'default',
};

export default function Home() {
  const { company } = useParams<{ company: string }>();
  const navigate    = useNavigate();
  const { user }    = useAuth();

  const [plans, setPlans]       = useState<Plan[]>([]);
  const [loading, setLoading]   = useState(true);
  const [dialogOpen, setDialog] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState({
    project_code: '', project_name: '', client_name: '',
    site_location: '', plan_name: '', plan_revision: 'Rev 0', notes: '',
  });

  async function fetchPlans() {
    if (!user) return;
    setLoading(true);
    try {
      const res = await api.post(`${API_HOST}/api/query/v1/base_resource`, {
        operation: 'query',
        resource:  'fab_project_plans',
        fields:    ['id','projectCode','projectName','clientName','planName','planRevision','status','source','createdByName','createdAt'],
        orderBy:   [{ field: 'createdAt', direction: 'desc' }],
      });
      const rows = res.data?.data;
      setPlans(Array.isArray(rows) ? rows : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPlans(); }, [user]);

  async function createPlan() {
    setSaving(true);
    try {
      await api.post(`${API_HOST}/api/query/v1/base_resource`, {
        operation: 'insert',
        resource:  'fab_project_plans',
        data: { ...form, company_id: companyId, created_by: user?.id },
      });
      setDialog(false);
      setForm({ project_code:'',project_name:'',client_name:'',site_location:'',plan_name:'',plan_revision:'Rev 0',notes:'' });
      fetchPlans();
    } catch (err: any) {
      alert(err.response?.data?.error ?? err.message);
    } finally {
      setSaving(false);
    }
  }

  const stats = {
    total:     plans.length,
    draft:     plans.filter((p) => p.status === 'Draft').length,
    approved:  plans.filter((p) => p.status === 'Approved').length,
    superseded:plans.filter((p) => p.status === 'Superseded').length,
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>FabFlow</Typography>
          <Typography color="text.secondary">Fabrication Project Plans</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<FactoryIcon />}
            onClick={() => navigate(`/${company}/fab_flow/capacity`)}
          >
            Capacity Master
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog(true)}>
            New Project Plan
          </Button>
        </Box>
      </Box>

      {/* Stats row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Plans', value: stats.total, color: '#1e3a5f' },
          { label: 'Draft',       value: stats.draft,     color: '#ed6c02' },
          { label: 'Approved',    value: stats.approved,  color: '#2e7d32' },
          { label: 'Superseded',  value: stats.superseded,color: '#757575' },
        ].map((s) => (
          <Grid size={{ xs: 6, sm: 3 }} key={s.label}>
            <Card sx={{ textAlign: 'center', py: 1.5, borderTop: `3px solid ${s.color}` }}>
              <Typography variant="h4" fontWeight={700} sx={{ color: s.color }}>{s.value}</Typography>
              <Typography variant="body2" color="text.secondary">{s.label}</Typography>
            </Card>
          </Grid>
        ))}
      </Grid>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
      ) : plans.length === 0 ? (
        <Box sx={{ textAlign: 'center', mt: 8 }}>
          <Typography color="text.secondary" gutterBottom>No plans yet.</Typography>
          <Button variant="outlined" onClick={() => setDialog(true)}>Create your first plan</Button>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {plans.map((plan) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={plan.id}>
              <Card sx={{ height: '100%' }}>
                <CardActionArea sx={{ height: '100%' }} onClick={() => navigate(`/${company}/fab_flow/plans/${plan.id}`)}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Chip label={plan.status} color={STATUS_COLOR[plan.status]} size="small" />
                      <Typography variant="caption" color="text.secondary">{plan.planRevision}</Typography>
                    </Box>
                    <Typography variant="subtitle1" fontWeight={700} noWrap>{plan.planName}</Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>{plan.projectCode} · {plan.projectName}</Typography>
                    {plan.clientName && (
                      <Typography variant="body2" color="text.secondary" noWrap>{plan.clientName}</Typography>
                    )}
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="caption" color="text.secondary">
                      {plan.source} · {plan.createdByName} · {new Date(plan.createdAt).toLocaleDateString()}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create plan dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Project Plan</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {(['project_code','project_name','client_name','site_location','plan_name','plan_revision'] as const).map((field) => (
            <TextField
              key={field}
              label={field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              value={(form as any)[field]}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              required={['project_code','project_name','plan_name'].includes(field)}
              size="small"
            />
          ))}
          <TextField label="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} multiline rows={2} size="small" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={createPlan} disabled={saving || !form.project_code || !form.project_name || !form.plan_name}>
            {saving ? <CircularProgress size={18} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
