/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Box, Typography, Card, Alert, Table, TableHead, TableBody, TableRow, TableCell, Chip, Container } from "@mui/material";
import GroupIcon from "@mui/icons-material/Group";
import MicIcon from "@mui/icons-material/Mic";
import ExtensionIcon from "@mui/icons-material/Extension";
import { query } from "@core/api-builder";
import { apiGet } from "@core/api/client";
import { usePermission } from "@core/hooks/usePermission";
import { useAuth } from "@core/contexts/AuthContext";
import { isAdminRole } from "@core/utils/roles";

interface QueueStatus {
  name: string;
  waiting?: number;
  active?: number;
  completed?: number;
  failed?: number;
  delayed?: number;
}

const COUNT_AGG = {
  functions: [{ fn: "COUNT", field: "*", alias: "total" }],
};

function extractTotal(res: any): number {
  // Accept several common shapes: array of rows, {data:[...]}, {result:[...]}
  const rows =
    (Array.isArray(res) && res) ||
    (Array.isArray(res?.data) && res.data) ||
    (Array.isArray(res?.result) && res.result) ||
    (Array.isArray(res?.rows) && res.rows) ||
    [];
  const first = rows[0] ?? {};
  const v = first.total ?? first.TOTAL ?? first["COUNT(*)"];
  return typeof v === "number" ? v : Number(v) || 0;
}

export default function Dashboard() {
  const location = useLocation();
  const { user } = useAuth();
  const hasPerm = usePermission("admin_dashboard");

  const [userCount, setUserCount] = useState<number | null>(null);
  const [audioCount, setAudioCount] = useState<number | null>(null);
  const [featureCount, setFeatureCount] = useState<number | null>(null);
  const [queues, setQueues] = useState<QueueStatus[] | null>(null);
  const [queueUnavailable, setQueueUnavailable] = useState(false);

  const parts = location.pathname.split('/').filter(Boolean);
  const appSlug = parts[1];
  const allowed = hasPerm || isAdminRole(user?.role);

  useEffect(() => {
    if (!allowed || appSlug !== 'audio_intelligence') return;
    let cancelled = false;

    Promise.all([
      query({ resource: "users", fields: [], aggregate: COUNT_AGG }).catch(
        () => null
      ),
      query({
        resource: "audio_recordings",
        fields: [],
        aggregate: COUNT_AGG,
      }).catch(() => null),
      query({ resource: "features", fields: [], aggregate: COUNT_AGG }).catch(
        () => null
      ),
    ]).then(([u, a, f]) => {
      if (cancelled) return;
      setUserCount(u ? extractTotal(u) : 0);
      setAudioCount(a ? extractTotal(a) : 0);
      setFeatureCount(f ? extractTotal(f) : 0);
    });

    apiGet<{ queues?: QueueStatus[] } | QueueStatus[]>("/admin/jobs/status")
      .then((res: any) => {
        if (cancelled) return;
        const list: QueueStatus[] = Array.isArray(res)
          ? res
          : Array.isArray(res?.queues)
            ? res.queues
            : [];
        setQueues(list);
      })
      .catch(() => {
        if (cancelled) return;
        setQueueUnavailable(true);
      });

    return () => {
      cancelled = true;
    };
  }, [allowed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (appSlug !== 'audio_intelligence') {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>Admin Dashboard</Typography>
        <Typography color="text.secondary">
          Select a section from the sidebar to manage this app.
        </Typography>
      </Box>
    );
  }

  if (!allowed) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">No access</Alert>
      </Container>
    );
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 4, color: 'text.primary' }}>
        Administration Console
      </Typography>

      {/* KPI Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 3, mb: 5 }}>
        <Card sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ width: 44, height: 44, borderRadius: '10px', bgcolor: 'primary.light', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <GroupIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            </Box>
            <Box>
              <Typography variant="h4" fontWeight={700}>{userCount ?? '—'}</Typography>
              <Typography variant="body2" color="text.secondary">Active Team Members</Typography>
            </Box>
          </Box>
        </Card>
        <Card sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ width: 44, height: 44, borderRadius: '10px', bgcolor: 'success.light', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MicIcon sx={{ color: 'success.main', fontSize: 24 }} />
            </Box>
            <Box>
              <Typography variant="h4" fontWeight={700}>{audioCount ?? '—'}</Typography>
              <Typography variant="body2" color="text.secondary">Detailing Sessions</Typography>
            </Box>
          </Box>
        </Card>
        <Card sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ width: 44, height: 44, borderRadius: '10px', bgcolor: 'info.light', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ExtensionIcon sx={{ color: 'info.main', fontSize: 24 }} />
            </Box>
            <Box>
              <Typography variant="h4" fontWeight={700}>{featureCount ?? '—'}</Typography>
              <Typography variant="body2" color="text.secondary">Registered Features</Typography>
            </Box>
          </Box>
        </Card>
      </Box>

      {/* Queue Health */}
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2, color: 'text.primary' }}>
        Queue Health
      </Typography>
      {queueUnavailable ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>Queue monitoring unavailable</Alert>
      ) : (
        <Card sx={{ overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow>
                {['Queue', 'Waiting', 'Active', 'Completed', 'Failed', 'Delayed'].map(h => (
                  <TableCell key={h} align={h === 'Queue' ? 'left' : 'right'}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {queues === null && (
                <TableRow><TableCell colSpan={6} sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>Loading…</TableCell></TableRow>
              )}
              {queues?.length === 0 && (
                <TableRow><TableCell colSpan={6} sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>No queues configured</TableCell></TableRow>
              )}
              {queues?.map(q => (
                <TableRow key={q.name} sx={{ '&:hover': { bgcolor: 'grey.50' } }}>
                  <TableCell sx={{ fontWeight: 500 }}>{q.name}</TableCell>
                  <TableCell align="right">{q.waiting ?? '—'}</TableCell>
                  <TableCell align="right">{q.active ?? '—'}</TableCell>
                  <TableCell align="right">{q.completed ?? '—'}</TableCell>
                  <TableCell align="right"><Chip label={q.failed ?? 0} size="small" color={q.failed ? 'error' : 'default'} /></TableCell>
                  <TableCell align="right">{q.delayed ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </Box>
  );
}
