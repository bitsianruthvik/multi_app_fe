/* eslint-disable @typescript-eslint/no-explicit-any, no-empty, react-hooks/exhaustive-deps */
import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Container,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  CircularProgress,
  LinearProgress,
  Chip,
  Breadcrumbs,
  Link,
  Paper,
  Button,
} from "@mui/material";
import { Link as RouterLink, useParams, useLocation } from "react-router-dom";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { LineChart } from "@mui/x-charts/LineChart";
import { query } from "@core/api-builder";
import { useFlow } from "@apps/audio_intelligence/contexts/FlowContext";

export default function MyProgress() {
  const { actionId, brandName } = useParams<{ actionId?: string; brandName?: string }>();
  const decodedBrand = brandName ? decodeURIComponent(brandName) : undefined;
  const location = useLocation();
  const parts = location.pathname.split("/").filter(Boolean);
  const company = parts[0];
  const app = parts[1];
  const { actionName } = useFlow();

  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBrands, setSelectedBrands] = useState<string[]>(
    decodedBrand ? [decodedBrand] : []
  );

  useEffect(() => {
    loadProgress();
  }, [actionId, brandName]);

  const loadProgress = async () => {
    try {
      setLoading(true);
      setError(null);
      const filters: Record<string, any> = {};
      if (actionId) filters.action_id = Number(actionId);
      // Do NOT filter by medicine — fetch all action recordings, filter client-side

      const response = await query({
        resource: "audio_recordings",
        fields: ["id", "title", "created_at", "score", "analysis", "medicine", "action_id"],
        filters,
        sort: { created_at: "desc" },
        limit: 100,
      });

      const rows: any[] = Array.isArray((response as any)?.data)
        ? (response as any).data
        : Array.isArray(response as any)
        ? (response as any)
        : [];

      setRecordings(rows);
    } catch (err: any) {
      setError(err?.message || "Failed to load progress data");
    } finally {
      setLoading(false);
    }
  };

  // Derive available brands from loaded recordings
  const availableBrands = useMemo(
    () =>
      [...new Set(recordings.map((r: any) => r.medicine?.trim()).filter(Boolean))] as string[],
    [recordings]
  );

  // Filter displayed recordings for chart/list
  const filteredRecordings = useMemo(
    () =>
      selectedBrands.length > 0
        ? recordings.filter((r: any) => selectedBrands.includes(r.medicine?.trim()))
        : recordings,
    [recordings, selectedBrands]
  );

  // Chart data — sorted chronologically
  const chartData = useMemo(() => {
    const sorted = [...filteredRecordings].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    return sorted.map((r: any, idx: number) => ({ x: idx + 1, y: r.score ?? 0 }));
  }, [filteredRecordings]);

  // Pre-compute sorted oldest-first for rolling mean
  const sortedOldestFirst = useMemo(
    () =>
      [...filteredRecordings].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    [filteredRecordings]
  );

  function getRollingMean(currentRec: any, sectionKey: string): number {
    const currentIdx = sortedOldestFirst.findIndex((r: any) => r.id === currentRec.id);
    if (currentIdx < 0) return 0;
    const window = sortedOldestFirst.slice(Math.max(0, currentIdx - 4), currentIdx + 1);
    const sum = window.reduce((acc: number, r: any) => {
      try {
        const parsed = typeof r.analysis === "string" ? JSON.parse(r.analysis) : r.analysis;
        const s = parsed?.sections ?? parsed ?? {};
        return acc + (s[sectionKey]?.score ?? 0);
      } catch {
        return acc;
      }
    }, 0);
    return Math.round(sum / window.length);
  }

  const sectionDefs = [
    { key: "model_communication_compliance", label: "Model Communication", maxScore: 40 },
    { key: "language_quality_clarity", label: "Language Quality", maxScore: 25 },
    { key: "medical_scientific_accuracy", label: "Medical Accuracy", maxScore: 15 },
    { key: "closing_action_orientation", label: "Closing & Action", maxScore: 20 },
  ];

  // Page title
  const pageTitle =
    selectedBrands.length > 0
      ? `Performance — ${selectedBrands.join(", ")}`
      : actionId && actionName
      ? `Performance — ${actionName}`
      : "My Performance Overview";

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ py: 4, textAlign: "center" }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading your progress...</Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      </Container>
    );
  }

  // Overview stats derived from filteredRecordings
  const totalSessions = filteredRecordings.length;
  const averageScore =
    totalSessions > 0
      ? Math.round(
          (filteredRecordings.reduce((sum, r) => sum + (r.score ?? 0), 0) / totalSessions) * 10
        ) / 10
      : 0;
  const sortedDesc = [...filteredRecordings].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const latestScore = sortedDesc[0]?.score ?? 0;
  const oldestScore = sortedDesc[sortedDesc.length - 1]?.score ?? 0;
  const trend = latestScore - oldestScore;

  // Newest-first for accordion list
  const displayedRecordings = [...filteredRecordings].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* Breadcrumb */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link
          component={RouterLink}
          to={`/${company}/${app}/dashboard`}
          color="inherit"
          underline="hover"
        >
          Home
        </Link>
        {actionId && actionName && (
          <Link
            component={RouterLink}
            to={`/${company}/${app}/flow/${actionId}`}
            color="inherit"
            underline="hover"
          >
            {actionName}
          </Link>
        )}
        {decodedBrand && actionId && (
          <Link
            component={RouterLink}
            to={`/${company}/${app}/flow/${actionId}/${brandName}`}
            color="inherit"
            underline="hover"
          >
            {decodedBrand}
          </Link>
        )}
        <Typography color="text.primary">Performance</Typography>
      </Breadcrumbs>

      {/* Back link */}
      {actionId && decodedBrand ? (
        <Box sx={{ mb: 2 }}>
          <Link
            component={RouterLink}
            to={`/${company}/${app}/flow/${actionId}/${brandName}`}
            underline="hover"
          >
            ← Back to recordings
          </Link>
        </Box>
      ) : actionId ? (
        <Box sx={{ mb: 2 }}>
          <Link
            component={RouterLink}
            to={`/${company}/${app}/flow/${actionId}`}
            underline="hover"
          >
            ← Back to brands
          </Link>
        </Box>
      ) : null}

      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
          {pageTitle}
        </Typography>
      </Box>

      {/* Overview Stats */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 1fr 1fr 1fr" },
            gap: 3,
          }}
        >
          <Box>
            <Typography variant="h4" fontWeight={700}>
              {totalSessions}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total Sessions
            </Typography>
          </Box>
          <Box>
            <Typography variant="h4" fontWeight={700}>
              {averageScore}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Average Score
            </Typography>
          </Box>
          <Box>
            <Typography variant="h4" fontWeight={700}>
              {latestScore}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Latest Score
            </Typography>
          </Box>
          <Box>
            <Typography
              variant="h4"
              fontWeight={700}
              color={trend > 0 ? "success.main" : trend < 0 ? "error.main" : "text.primary"}
            >
              {trend > 0 ? `+${trend}` : trend}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Trend
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Score Trend Chart */}
      {chartData.length >= 2 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Score Trend
          </Typography>
          <LineChart
            xAxis={[{ data: chartData.map((d) => d.x), label: "Session" }]}
            series={[{ data: chartData.map((d) => d.y), label: "Score", color: "#1d5fa8" }]}
            height={220}
          />
        </Paper>
      )}

      {/* Brand Filter Chips */}
      {availableBrands.length > 1 && (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            flexWrap: "wrap",
            mb: 2,
            alignItems: "center",
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
            Filter by brand:
          </Typography>
          {availableBrands.map((brand) => (
            <Chip
              key={brand}
              label={brand}
              onClick={() =>
                setSelectedBrands((prev) =>
                  prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
                )
              }
              color={selectedBrands.includes(brand) ? "primary" : "default"}
              variant={selectedBrands.includes(brand) ? "filled" : "outlined"}
              size="small"
            />
          ))}
          {selectedBrands.length > 0 && (
            <Chip
              label="Clear filters"
              onClick={() => setSelectedBrands([])}
              size="small"
              variant="outlined"
            />
          )}
        </Box>
      )}

      {/* Session History */}
      <Typography variant="h6" fontWeight={600} sx={{ mt: 2, mb: 2 }}>
        Session History
      </Typography>

      <Box sx={{ mb: 4 }}>
        {displayedRecordings.length === 0 ? (
          <Alert severity="info">
            No detailing sessions yet. Start your first practice session to see your performance.
          </Alert>
        ) : (
          displayedRecordings.map((rec, idx) => {
            let sections: any = {};
            try {
              const parsed =
                typeof rec.analysis === "string" ? JSON.parse(rec.analysis) : rec.analysis;
              sections = parsed?.sections ?? parsed ?? {};
            } catch {}

            return (
              <Accordion key={rec.id ?? idx}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      pr: 2,
                      flexWrap: "wrap",
                      gap: 1,
                    }}
                  >
                    <Box>
                      <Typography variant="body1" fontWeight={600}>
                        {new Date(rec.created_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </Typography>
                      {rec.medicine && (
                        <Chip
                          label={rec.medicine}
                          size="small"
                          variant="outlined"
                          sx={{ mt: 0.5 }}
                        />
                      )}
                    </Box>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        flexWrap: "wrap",
                      }}
                    >
                      {sectionDefs.map((def) => {
                        const score = sections[def.key]?.score ?? 0;
                        const mean = getRollingMean(rec, def.key);
                        return (
                          <Chip
                            key={def.key}
                            label={`${def.label.split(" ")[0]}: ${score}/${def.maxScore} (avg:${mean})`}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: "11px" }}
                          />
                        );
                      })}
                      <Chip
                        label={rec.score ?? 0}
                        color={
                          (rec.score ?? 0) >= 80
                            ? "success"
                            : (rec.score ?? 0) >= 60
                            ? "warning"
                            : "error"
                        }
                        size="small"
                        sx={{ fontWeight: 700 }}
                      />
                    </Box>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                      gap: 2,
                    }}
                  >
                    {sectionDefs.map((def) => {
                      const score = sections[def.key]?.score ?? 0;
                      const feedback = sections[def.key]?.feedback ?? "";
                      return (
                        <Box key={def.key}>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            fontWeight={600}
                            sx={{ mb: 0.5 }}
                          >
                            {def.label} — {score}/{def.maxScore}
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={(score / def.maxScore) * 100}
                            sx={{ height: 6, borderRadius: 1, mb: 0.5 }}
                          />
                          {feedback ? (
                            <Typography variant="caption" color="text.secondary">
                              {feedback}
                            </Typography>
                          ) : (
                            <Typography variant="caption" color="text.disabled">
                              Analysis pending
                            </Typography>
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                  {rec.medicine && actionId && (
                    <Box sx={{ mt: 2 }}>
                      <Button
                        component={RouterLink}
                        to={`/${company}/${app}/flow/${actionId}/${encodeURIComponent(
                          rec.medicine.trim()
                        )}/recording/${rec.id}`}
                        size="small"
                        variant="outlined"
                      >
                        Review Session
                      </Button>
                    </Box>
                  )}
                </AccordionDetails>
              </Accordion>
            );
          })
        )}
      </Box>
    </Container>
  );
}
