import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Paper, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import api, { API_HOST } from '@core/utils/axiosConfig';
import NodeTreeView, { buildTree, type TreeNode } from '../components/NodeTreeView';

export default function TreeView() {
  const { company, planId } = useParams<{ company: string; planId: string }>();
  const navigate            = useNavigate();

  const [roots, setRoots]   = useState<TreeNode[]>([]);
  const [planName, setPlanName] = useState('');
  const [loading, setLoading]  = useState(true);
  const [error, setError]      = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [planRes, nodeRes, relRes] = await Promise.all([
          api.post(`${API_HOST}/api/query/v1/base_resource`, {
            operation: 'query', resource: 'fab_project_plans',
            fields: ['id','planName','planRevision','status'],
            filters: { id: Number(planId) },
          }),
          api.post(`${API_HOST}/api/query/v1/base_resource`, {
            operation: 'query', resource: 'fab_nodes',
            fields: ['id','nodeCode','displayName','levelName','quantity','unit'],
            filters: { projectPlanId: Number(planId) },
            pagination: { limit: 2000 },
          }),
          api.post(`${API_HOST}/api/query/v1/base_resource`, {
            operation: 'query', resource: 'fab_node_relationships',
            fields: ['id','parentNodeId','childNodeId','isPrimary'],
            filters: { projectPlanId: Number(planId) },
            pagination: { limit: 5000 },
          }),
        ]);

        const plan  = (planRes.data?.data ?? planRes.data)?.[0];
        const nodes = nodeRes.data?.data ?? nodeRes.data ?? [];
        const rels  = relRes.data?.data ?? relRes.data ?? [];

        setPlanName(plan ? `${plan.planName} (${plan.planRevision})` : '');
        setRoots(buildTree(nodes, rels));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [planId]);

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/${company}/fab_flow/plans/${planId}`)}>
          Back
        </Button>
        <Typography variant="h6" fontWeight={700}>Tree View — {planName}</Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
      ) : (
        <Paper sx={{ p: 2 }}>
          <NodeTreeView nodes={roots} />
        </Paper>
      )}
    </Box>
  );
}
