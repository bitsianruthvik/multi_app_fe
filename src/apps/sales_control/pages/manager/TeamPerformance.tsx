import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Card,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
  Button,
  Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import type { Dayjs } from 'dayjs';
import api, { API_HOST } from '@core/utils/axiosConfig';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SubScores {
  modelCommunication: number | null;
  languageQuality: number | null;
  medicalAccuracy: number | null;
  closingAction: number | null;
}

interface Aggregates {
  totalRecordings: number;
  avgScore: number | null;
  avgSubScores: SubScores;
}

interface ActionGroup {
  actionId: number;
  actionName: string;
  count: number;
  brands: string[];
}

interface SalesmanRow {
  id: number;
  name: string;
  totalRecordings: number;
  avgScore: number | null;
  byAction: ActionGroup[];
}

interface ApiResponse {
  aggregates: Aggregates;
  salesmen: SalesmanRow[];
}

interface DrillRecording {
  id: number;
  title: string;
  score: number | null;
  medicine: string;
  action_id: number;
  status: string;
  created_at: string;
  action_name: string;
}

// ── MetricCard helper ──────────────────────────────────────────────────────────

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card
      elevation={0}
      sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, boxShadow: 1 }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      <Typography variant="h6" fontWeight={700}>
        {value}
      </Typography>
    </Card>
  );
}

// ── Score colour helper ────────────────────────────────────────────────────────

function scoreColor(score: number | null): 'success' | 'warning' | 'error' | 'default' {
  if (score == null) return 'default';
  if (score >= 70) return 'success';
  if (score >= 50) return 'warning';
  return 'error';
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TeamPerformance() {
  const location = useLocation();
  const navigate = useNavigate();

  const parts = location.pathname.split('/').filter(Boolean);
  const company = parts[0];
  const app = parts[1];

  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [drillData, setDrillData] = useState<DrillRecording[] | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillTitle, setDrillTitle] = useState('');

  // ── Fetch aggregate performance ──────────────────────────────────────────────

  const fetchPerformance = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await api.post(
        `${API_HOST}/api/${company}/${app}/user/manager/team-performance`,
        {
          dateFrom: dateFrom?.toISOString() ?? null,
          dateTo: dateTo?.toISOString() ?? null,
        },
      );
      setData(resp.data);
      setDrillData(null);
      setExpandedIdx(null);
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Failed to load team performance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPerformance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  // ── Drill down ───────────────────────────────────────────────────────────────

  const handleDrill = async (salesman: SalesmanRow, action: ActionGroup, brand: string) => {
    setDrillLoading(true);
    setDrillTitle(`${salesman.name} — ${action.actionName} — ${brand}`);
    setDrillData(null);
    try {
      const resp = await api.post(
        `${API_HOST}/api/${company}/${app}/user/manager/team-recordings`,
        {
          salesmanName: salesman.name,
          actionId: action.actionId,
          medicine: brand,
          dateFrom: dateFrom?.toISOString() ?? null,
          dateTo: dateTo?.toISOString() ?? null,
        },
      );
      setDrillData(resp.data?.recordings ?? []);
    } catch {
      setDrillData([]);
    } finally {
      setDrillLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Date filter */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <DatePicker
          label="From"
          value={dateFrom}
          onChange={setDateFrom}
          slotProps={{ textField: { size: 'small' } }}
        />
        <DatePicker
          label="To"
          value={dateTo}
          onChange={setDateTo}
          slotProps={{ textField: { size: 'small' } }}
        />
        {(dateFrom || dateTo) && (
          <Button
            size="small"
            onClick={() => {
              setDateFrom(null);
              setDateTo(null);
            }}
          >
            Clear
          </Button>
        )}
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {data && (
        <>
          {/* Aggregate metric cards */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 2,
              mb: 4,
            }}
          >
            <MetricCard label="Total Recordings" value={String(data.aggregates.totalRecordings)} />
            <MetricCard
              label="Avg Score"
              value={data.aggregates.avgScore != null ? String(data.aggregates.avgScore) : '—'}
            />
            <MetricCard
              label="Comm"
              value={
                data.aggregates.avgSubScores.modelCommunication != null
                  ? `${data.aggregates.avgSubScores.modelCommunication} / 30`
                  : '—'
              }
            />
            <MetricCard
              label="Lang"
              value={
                data.aggregates.avgSubScores.languageQuality != null
                  ? `${data.aggregates.avgSubScores.languageQuality} / 25`
                  : '—'
              }
            />
            <MetricCard
              label="Medical"
              value={
                data.aggregates.avgSubScores.medicalAccuracy != null
                  ? `${data.aggregates.avgSubScores.medicalAccuracy} / 25`
                  : '—'
              }
            />
            <MetricCard
              label="Closing"
              value={
                data.aggregates.avgSubScores.closingAction != null
                  ? `${data.aggregates.avgSubScores.closingAction} / 20`
                  : '—'
              }
            />
          </Box>

          {/* Salesman table */}
          <Table size="small" sx={{ mb: 3 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Salesman</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">
                  Recordings
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">
                  Avg Score
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  Details
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.salesmen.map((sm, idx) => (
                <React.Fragment key={sm.id}>
                  <TableRow hover>
                    <TableCell>{sm.name}</TableCell>
                    <TableCell align="center">{sm.totalRecordings}</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={sm.avgScore != null ? sm.avgScore : '—'}
                        color={scoreColor(sm.avgScore)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={expandedIdx === idx ? 'Collapse' : 'Expand'}>
                        <IconButton
                          size="small"
                          onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                        >
                          {expandedIdx === idx ? (
                            <ExpandLessIcon fontSize="small" />
                          ) : (
                            <ExpandMoreIcon fontSize="small" />
                          )}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>

                  {expandedIdx === idx && (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ bgcolor: 'action.hover', px: 3, py: 2 }}>
                        {sm.byAction.length === 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            No recordings yet.
                          </Typography>
                        ) : (
                          sm.byAction.map((action) => (
                            <Box key={action.actionId} sx={{ mb: 1.5 }}>
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  mb: 0.5,
                                }}
                              >
                                <Typography variant="body2" fontWeight={600}>
                                  {action.actionName}
                                </Typography>
                                <Chip label={action.count} size="small" variant="outlined" />
                              </Box>
                              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                                {action.brands.map((brand) => (
                                  <Chip
                                    key={brand}
                                    label={brand}
                                    size="small"
                                    clickable
                                    icon={<KeyboardArrowRightIcon fontSize="small" />}
                                    onClick={() => handleDrill(sm, action, brand)}
                                  />
                                ))}
                              </Box>
                            </Box>
                          ))
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>

          {/* Drill panel */}
          {(drillData !== null || drillLoading) && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                {drillTitle}
              </Typography>
              {drillLoading ? (
                <CircularProgress size={24} />
              ) : drillData && drillData.length === 0 ? (
                <Typography color="text.secondary">
                  No recordings found for this selection.
                </Typography>
              ) : (
                drillData?.map((rec) => (
                  <Box
                    key={rec.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      py: 1,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      flexWrap: 'wrap',
                      gap: 1,
                    }}
                  >
                    <Box>
                      <Typography variant="body2" fontWeight={600}>
                        {rec.title || `Recording #${rec.id}`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(rec.created_at).toLocaleDateString()} · {rec.medicine}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Chip
                        label={rec.score != null ? rec.score : '—'}
                        color={scoreColor(rec.score)}
                        size="small"
                      />
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() =>
                          navigate(`/${company}/${app}/manager/recording/${rec.id}`)
                        }
                      >
                        View
                      </Button>
                    </Box>
                  </Box>
                ))
              )}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
