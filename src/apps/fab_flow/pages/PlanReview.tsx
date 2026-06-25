import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Divider, List, ListItem, ListItemText, Typography,
} from '@mui/material';
import ArrowBackIcon     from '@mui/icons-material/ArrowBack';
import CheckCircleIcon   from '@mui/icons-material/CheckCircle';
import WarningIcon       from '@mui/icons-material/Warning';
import ErrorOutlineIcon  from '@mui/icons-material/ErrorOutline';
import api, { API_HOST } from '@core/utils/axiosConfig';

interface ReviewIssue { type: string; severity: 'error' | 'warning'; message: string; nodeId?: number; nodeCode?: string }

export default function PlanReview() {
  const { company, planId } = useParams<{ company: string; planId: string }>();
  const navigate            = useNavigate();

  const [issues, setIssues]     = useState<ReviewIssue[]>([]);
  const [loading, setLoading]   = useState(true);
  const [planName, setPlanName] = useState('');

  const runReview = useCallback(async () => {
    setLoading(true);
    try {
      // Readiness endpoint gives us steps + node maps in one call
      const [readinessRes, nodeRes, relRes] = await Promise.all([
        api.get(`${API_HOST}/api/${company}/fab_flow/plans/${planId}/readiness`),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_nodes',
          fields: ['id','nodeCode','displayName','levelName'],
          filters: { projectPlanId: Number(planId) }, pagination: { limit: 2000 },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_node_relationships',
          fields: ['id','parentNodeId','childNodeId'],
          filters: { projectPlanId: Number(planId) }, pagination: { limit: 5000 },
        }),
      ]);

      const rd    = readinessRes.data?.data ?? readinessRes.data;
      const steps: any[] = rd?.steps ?? [];
      const nodes: any[] = nodeRes.data?.data ?? nodeRes.data ?? [];
      const rels:  any[] = relRes.data?.data  ?? relRes.data  ?? [];

      setPlanName(rd?.planName ?? '');

      const found: ReviewIssue[] = [];

      // No nodes at all
      if (nodes.length === 0) {
        found.push({ type: 'structure', severity: 'error', message: 'Plan has no nodes.' });
      }

      // Nodes with no process assignment and no children
      const nodeIdsWithProcesses = new Set(
        steps.flatMap((s: any) => (s.nodeMaps ?? []).map((nm: any) => nm.nodeId)),
      );
      const nodeIdsWithChildren = new Set(rels.map((r: any) => r.parentNodeId));
      nodes.forEach((n: any) => {
        if (!nodeIdsWithProcesses.has(n.id) && !nodeIdsWithChildren.has(n.id)) {
          found.push({
            type: 'process_route', severity: 'warning',
            message: `Node ${n.nodeCode} (${n.displayName}) has no process step and no children.`,
            nodeId: n.id, nodeCode: n.nodeCode,
          });
        }
      });

      // Process steps with no estimated time
      steps.forEach((s: any) => {
        if (!s.estimatedTimeValue) {
          const primaryNode = (s.nodeMaps ?? [])[0];
          found.push({
            type: 'missing_time', severity: 'warning',
            message: `Process step "${s.processName}"${primaryNode ? ` (on ${primaryNode.nodeCode})` : ''} has no estimated time.`,
            nodeId: primaryNode?.nodeId, nodeCode: primaryNode?.nodeCode,
          });
        }
      });

      // Nodes missing level name
      nodes.forEach((n: any) => {
        if (!n.levelName) {
          found.push({
            type: 'missing_level', severity: 'warning',
            message: `Node ${n.nodeCode} has no level name.`,
            nodeId: n.id, nodeCode: n.nodeCode,
          });
        }
      });

      setIssues(found);
    } finally {
      setLoading(false);
    }
  }, [company, planId]);

  useEffect(() => { runReview(); }, [runReview]);

  const errors   = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/${company}/fab_flow/plans/${planId}`)}>Back</Button>
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>Plan Review — {planName}</Typography>
        <Button size="small" onClick={runReview}>Re-run Review</Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
      ) : (
        <>
          {/* Summary */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            {errors.length === 0 && warnings.length === 0 ? (
              <Alert severity="success" icon={<CheckCircleIcon />} sx={{ flex: 1 }}>
                No issues found — plan is ready to approve.
              </Alert>
            ) : (
              <>
                {errors.length > 0 && (
                  <Alert severity="error" icon={<ErrorOutlineIcon />} sx={{ flex: 1 }}>
                    {errors.length} error{errors.length !== 1 ? 's' : ''} must be fixed before approval.
                  </Alert>
                )}
                {warnings.length > 0 && (
                  <Alert severity="warning" icon={<WarningIcon />} sx={{ flex: 1 }}>
                    {warnings.length} warning{warnings.length !== 1 ? 's' : ''} — review recommended.
                  </Alert>
                )}
              </>
            )}
          </Box>

          {/* Errors */}
          {errors.length > 0 && (
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <ErrorOutlineIcon color="error" fontSize="small" />
                  <Typography variant="subtitle2" color="error.main">Errors ({errors.length})</Typography>
                </Box>
                <Divider sx={{ mb: 1 }} />
                <List dense disablePadding>
                  {errors.map((issue, i) => (
                    <ListItem key={i} disablePadding sx={{ py: 0.3 }}
                      secondaryAction={
                        issue.nodeId && (
                          <Button size="small" onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/nodes/${issue.nodeId}`)}>
                            Fix
                          </Button>
                        )
                      }
                    >
                      <ListItemText
                        primary={issue.message}
                        secondary={<Chip label={issue.type.replace(/_/g,' ')} size="small" variant="outlined" sx={{ mt: 0.3 }} />}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <WarningIcon color="warning" fontSize="small" />
                  <Typography variant="subtitle2" color="warning.main">Warnings ({warnings.length})</Typography>
                </Box>
                <Divider sx={{ mb: 1 }} />
                <List dense disablePadding>
                  {warnings.map((issue, i) => (
                    <ListItem key={i} disablePadding sx={{ py: 0.3 }}
                      secondaryAction={
                        issue.nodeId && (
                          <Button size="small" onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/nodes/${issue.nodeId}`)}>
                            Review
                          </Button>
                        )
                      }
                    >
                      <ListItemText
                        primary={issue.message}
                        secondary={<Chip label={issue.type.replace(/_/g,' ')} size="small" variant="outlined" sx={{ mt: 0.3 }} />}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Box>
  );
}
