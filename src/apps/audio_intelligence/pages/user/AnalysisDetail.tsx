/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const */
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Container,
  Typography,
  Chip,
  Alert,
  CircularProgress,
  Card,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useLocation, useParams, useNavigate, Link as RouterLink } from "react-router-dom";
import { query } from "@core/api-builder";
import { useFlow } from "@apps/audio_intelligence/contexts/FlowContext";
import FlowBreadcrumb from "@apps/audio_intelligence/components/FlowBreadcrumb";

type Detail = {
  id: number;
  title?: string;
  created_at?: string;
  audio_url?: string | null;
  processed_url?: string | null;
  transcription?: string | null;
  analysis?: string | null;
  score?: number | null;
  keywords_of_improvement?: string | null;
  medicine?: string | null;
};

type ScoreSection = {
  score: number;
  max: number;
  met: string[];
  missed: string[];
};

function normalizeSections(rawSections: any): Record<string, ScoreSection> {
  const result: Record<string, ScoreSection> = {};

  // Section key mapping from backend PascalCase to frontend snake_case
  const sectionKeyMap: Record<string, string> = {
    Model_Communication_Compliance: "model_communication_compliance",
    Language_Tonality: "language_quality_clarity",
    Medical_Scientific_Accuracy: "medical_scientific_accuracy",
    Closing_Action_Orientation: "closing_action_orientation",
  };

  for (const [sectionKey, sectionValue] of Object.entries(rawSections || {})) {
    const sec: any = sectionValue;
    const normalizedKey = sectionKeyMap[sectionKey] || sectionKey;

    // Try to get the total score from various possible fields
    const sectionScore = sec.total ?? sec.score ?? 0;

    let met: string[] = [];
    let missed: string[] = [];

    // Handle new schema: subsections with positive/negative fields
    for (const [subKey, subValue] of Object.entries(sec)) {
      if (subKey === "total" || subKey === "score") continue;
      if (typeof subValue === "object" && subValue !== null) {
        const sub: any = subValue;

        // Extract positive items as "met"
        if (
          sub.positive &&
          typeof sub.positive === "string" &&
          sub.positive.trim()
        ) {
          met.push(sub.positive.trim());
        }

        // Extract negative items as "missed"
        if (
          sub.negative &&
          typeof sub.negative === "string" &&
          sub.negative.trim()
        ) {
          missed.push(sub.negative.trim());
        }
      }
    }

    result[normalizedKey] = {
      score: sectionScore,
      max: getMaxForSection(normalizedKey),
      met,
      missed,
    };
  }

  return result;
}

function getMaxForSection(sectionKey: string): number {
  const maxValues: Record<string, number> = {
    model_communication_compliance: 30,
    language_quality_clarity: 25,
    medical_scientific_accuracy: 25,
    closing_action_orientation: 20,
  };
  return maxValues[sectionKey] || 0;
}

export default function AnalysisDetail() {
  const location = useLocation();
  const { recordingId, actionId, brandName } = useParams<{
    recordingId: string;
    actionId: string;
    brandName: string;
  }>();

  const navigate = useNavigate();
  const { actionName } = useFlow();
  const parts = location.pathname.split('/').filter(Boolean);
  const company = parts[0];
  const app = parts[1];

  // Suppress unused variable warnings
  void navigate;
  void actionName;

  const prefetch = (location.state as any)?.prefetch as Detail | undefined;
  const [loading, setLoading] = useState(!prefetch);
  const [error, setError] = useState<string>("");
  const [rec, setRec] = useState<Detail | null>(prefetch || null);

  // Derived scorecard data — memoized over rec.analysis to avoid re-parsing
  // on unrelated re-renders.
  const rawAnalysis = rec?.analysis ?? null;
  const { score, label, sections, improvementPlan } = useMemo(() => {
    const empty = {
      score: 0,
      label: "",
      sections: null as Record<string, ScoreSection> | null,
      improvementPlan: [] as string[],
    };
    if (!rawAnalysis) return empty;
    try {
      const analysisObj =
        typeof rawAnalysis === "string"
          ? JSON.parse(rawAnalysis)
          : rawAnalysis;
      return {
        score: analysisObj.overall_score || rec?.score || 0,
        label: analysisObj.overall_label || "",
        sections: normalizeSections(analysisObj.sections),
        improvementPlan: analysisObj.summary?.improvement_areas || [],
      };
    } catch (e) {
      console.warn("Failed to parse analysis JSON:", e);
      return { ...empty, score: rec?.score || 0 };
    }
  }, [rawAnalysis, rec?.score]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!recordingId) return;
      if (!prefetch) setLoading(true);
      setError("");
      try {
        const resp = await query({
          resource: "audio_recordings",
          fields: [
            "id",
            "title",
            "created_at",
            "audio_url",
            "processed_url",
            "transcription",
            "analysis",
            "score",
            "keywords_of_improvement",
            "medicine",
          ],
          filters: { "id.eq": Number(recordingId) },
        });
        const rows: any[] = Array.isArray((resp as any)?.data)
          ? (resp as any).data
          : Array.isArray(resp as any)
            ? (resp as any)
            : [];

        if (mounted) {
          const record = rows[0] || null;
          setRec(record);
        }
      } catch (e: any) {
        if (mounted) setError(e?.message || "Failed to load analysis");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [recordingId, prefetch]);

  // Weakest section key (lowest score/max ratio) — used to auto-expand.
  const weakestKey = useMemo(() => {
    if (!sections) return null;
    let lowestKey: string | null = null;
    let lowestPct = Infinity;
    for (const [key, sec] of Object.entries(sections)) {
      const max = sec.max || 1;
      const pct = (sec.score / max) * 100;
      if (pct < lowestPct) {
        lowestPct = pct;
        lowestKey = key;
      }
    }
    return lowestKey;
  }, [sections]);

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  useEffect(() => {
    setExpandedKey(weakestKey);
  }, [weakestKey]);

  // Back navigation handled by global AppShell Back button

  if (loading)
    return (
      <Container maxWidth="md" sx={{ py: 6, textAlign: "center" }}>
        <CircularProgress />
      </Container>
    );

  if (error)
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      </Container>
    );

  if (!rec)
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="warning">Recording not found.</Alert>
      </Container>
    );

  const metricDefs = [
    {
      key: "model_communication_compliance",
      title: "Model Communication Compliance",
    },
    {
      key: "language_quality_clarity",
      title: "Language Quality & Communication Clarity",
    },
    {
      key: "medical_scientific_accuracy",
      title: "Medical / Scientific Accuracy",
    },
    {
      key: "closing_action_orientation",
      title: "Closing & Action Orientation",
    },
  ];

  // Suppress unused import warning
  void React;

  return (
    <Box sx={{ bgcolor: "background.paper", minHeight: "100vh", py: "18px" }}>
      <Container
        maxWidth="sm"
        sx={{
          px: "18px",
        }}
      >
        <FlowBreadcrumb recordingTitle={rec?.title ?? `Recording #${recordingId}`} showAnalysis />

        {/* Header */}
        <Box sx={{ mb: "16px" }}>
          <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
            Detailing Session Report
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {rec.title || `Recording #${rec.id}`}
          </Typography>
        </Box>

        {/* Score Grid */}
        {sections && (
          <>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
                mb: "20px",
              }}
            >
              {metricDefs.map((m) => {
                const sec = sections[m.key] as ScoreSection;
                if (!sec) return null;
                const percent = (sec.score / sec.max) * 100;
                const barColor =
                  percent >= 70
                    ? "#22c55e"
                    : percent >= 50
                      ? "#d97706"
                      : "#ef4444";
                return (
                  <Card
                    key={m.key}
                    elevation={0}
                    sx={{
                      p: "12px 14px",
                      borderRadius: 2,
                      border: "1px solid",
                      borderColor: "divider",
                      bgcolor: "background.paper",
                      boxShadow: 1,
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 500,
                        color: "text.primary",
                        mb: "8px",
                        lineHeight: 1.35,
                      }}
                    >
                      {m.title}
                    </Typography>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 700,
                        color: "text.primary",
                        mb: "10px",
                      }}
                    >
                      {sec.score} / {sec.max}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={percent}
                      sx={{
                        height: 6,
                        borderRadius: 999,
                        "& .MuiLinearProgress-bar": {
                          backgroundColor: barColor,
                          borderRadius: 999,
                        },
                      }}
                    />
                  </Card>
                );
              })}
            </Box>

            {/* Overall Score */}
            <Card
              elevation={0}
              sx={{
                p: "18px 16px",
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.default",
                boxShadow: 1,
                mb: "20px",
                textAlign: "center",
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontWeight: 600, mb: "8px" }}
              >
                Compliance Score
              </Typography>
              <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
                <CircularProgress
                  variant="determinate"
                  value={score}
                  size={100}
                  color={score >= 80 ? "success" : score >= 60 ? "warning" : "error"}
                />
              </Box>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 700,
                  color: "text.primary",
                  lineHeight: 1.1,
                }}
              >
                {score}
              </Typography>
              <Chip
                label={label || ""}
                sx={{
                  mt: "12px",
                  fontWeight: 600,
                  fontSize: "13px",
                  px: 1.5,
                  height: "24px",
                  borderRadius: 999,
                }}
              />
            </Card>

            {/* Detailed Summary */}
            <Typography variant="h6" fontWeight={600} sx={{ mt: 4, mb: 2 }}>
              Detailed Summary
            </Typography>
            <Box sx={{ mb: "20px" }}>
              {metricDefs.map((m) => {
                const sec = sections[m.key] as ScoreSection;
                if (!sec) return null;
                return (
                  <Card
                    key={m.key}
                    elevation={0}
                    sx={{
                      bgcolor: "background.paper",
                      borderRadius: 2,
                      mb: "10px",
                      border: "1px solid",
                      borderColor: "divider",
                      boxShadow: 1,
                    }}
                  >
                    <Accordion
                      elevation={0}
                      disableGutters
                      expanded={expandedKey === m.key}
                      onChange={(_e, isExpanded) =>
                        setExpandedKey(isExpanded ? m.key : null)
                      }
                      sx={{
                        bgcolor: "transparent",
                        "&:before": { display: "none" },
                      }}
                    >
                      <AccordionSummary
                        expandIcon={
                          <ExpandMoreIcon
                            sx={{ fontSize: 18, color: "text.secondary" }}
                          />
                        }
                        sx={{ px: "14px", py: "10px" }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "100%",
                            gap: 1,
                          }}
                        >
                          <Box>
                            <Typography
                              variant="body1"
                              sx={{
                                fontWeight: 700,
                                color: "text.primary",
                              }}
                            >
                              {m.title}
                            </Typography>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ mt: "2px" }}
                            >
                              {sec.score} / {sec.max} points
                            </Typography>
                          </Box>
                          {(() => {
                            const pct = sec.max
                              ? (sec.score / sec.max) * 100
                              : 0;
                            const chipColor: "error" | "warning" | "success" =
                              pct < 50
                                ? "error"
                                : pct < 75
                                  ? "warning"
                                  : "success";
                            return (
                              <Chip
                                size="small"
                                color={chipColor}
                                label={`${Math.round(pct)}%`}
                                sx={{
                                  fontWeight: 700,
                                  fontSize: "11px",
                                  height: "22px",
                                }}
                              />
                            );
                          })()}
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails sx={{ px: "14px", pb: "14px" }}>
                        <Box sx={{ mb: "12px" }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 700,
                              mb: "6px",
                              color: "text.primary",
                            }}
                          >
                            ✓ Met Criteria
                          </Typography>
                          <Box
                            component="ul"
                            sx={{
                              pl: 2.25,
                              m: 0,
                              color: "success.main",
                              lineHeight: 1.6,
                            }}
                          >
                            {(sec.met || []).map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </Box>
                        </Box>
                        <Box>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 700,
                              mb: "6px",
                              color: "text.primary",
                            }}
                          >
                            ✗ Missed Elements
                          </Typography>
                          <Box
                            component="ul"
                            sx={{
                              pl: 2.25,
                              m: 0,
                              color: "error.main",
                              lineHeight: 1.6,
                            }}
                          >
                            {(sec.missed || []).map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </Box>
                        </Box>
                      </AccordionDetails>
                    </Accordion>
                  </Card>
                );
              })}
            </Box>

            {/* Improvement Plan */}
            {improvementPlan.length > 0 && (
              <>
                <Typography variant="h6" fontWeight={600} sx={{ mt: 4, mb: 2 }}>
                  Next Session Improvement Plan
                </Typography>

                <Card
                  elevation={0}
                  sx={{
                    p: "16px",
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    bgcolor: "background.paper",
                    boxShadow: 1,
                    mb: "16px",
                  }}
                >
                  {improvementPlan.map((item, i) => (
                    <Box
                      key={i}
                      sx={{ display: "flex", gap: "10px", mb: "12px" }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          color: "primary.main",
                          fontWeight: 700,
                        }}
                      >
                        →
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          color: "text.primary",
                          lineHeight: 1.6,
                        }}
                      >
                        {item}
                      </Typography>
                    </Box>
                  ))}
                </Card>
              </>
            )}

            {/* CTA */}
            <Box sx={{ mt: 3, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                component={RouterLink}
                to={`/${company}/${app}/flow/${actionId}/${brandName}/recording/${recordingId}`}
              >
                ← Back to Recording
              </Button>
              <Button
                variant="contained"
                component={RouterLink}
                to={`/${company}/${app}/dashboard`}
              >
                Start New Session
              </Button>
            </Box>
          </>
        )}

        {/* No analysis fallback */}
        {!sections && rec.analysis && (
          <Card sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Analysis data is available but could not be parsed. Please
              refresh.
            </Typography>
          </Card>
        )}

        {!rec.analysis && !sections && (
          <Card sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No analysis available yet. Check back soon.
            </Typography>
          </Card>
        )}
      </Container>
    </Box>
  );
}
