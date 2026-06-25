/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Container, Typography, Button, Chip, Alert, CircularProgress,
  Card, LinearProgress, Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import api, { API_HOST } from '@core/utils/axiosConfig';

// ---------------------------------------------------------------------------
// Helpers copied verbatim from AnalysisDetail.tsx
// ---------------------------------------------------------------------------

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

    const met: string[] = [];
    const missed: string[] = [];

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ManagerRecordingView() {
  const { recordingId } = useParams<{ recordingId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean);
  const company = parts[0];
  const app = parts[1];

  // Suppress unused variable warnings
  void company;
  void app;

  const [rec, setRec] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!recordingId) return;
      try {
        const resp = await api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query',
          resource: 'audio_recordings',
          fields: ['id', 'title', 'created_at', 'audio_url', 'processed_url', 'transcription', 'analysis', 'score', 'medicine', 'recorded_by'],
          filters: { 'id.eq': Number(recordingId) },
        });
        const rows: any[] = Array.isArray(resp.data?.data) ? resp.data.data : Array.isArray(resp.data) ? resp.data : [];
        if (mounted) setRec(rows[0] ?? null);
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load recording');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [recordingId]);

  const { score, label, sections } = useMemo(() => {
    const empty = { score: 0, label: '', sections: null as any };
    if (!rec?.analysis) return empty;
    try {
      const obj = typeof rec.analysis === 'string' ? JSON.parse(rec.analysis) : rec.analysis;
      return {
        score: obj.overall_score || rec.score || 0,
        label: obj.overall_label || '',
        sections: normalizeSections(obj.sections),
      };
    } catch { return { ...empty, score: rec?.score || 0 }; }
  }, [rec]);

  const metricDefs = [
    { key: 'model_communication_compliance', title: 'Model Communication Compliance' },
    { key: 'language_quality_clarity', title: 'Language Quality & Communication Clarity' },
    { key: 'medical_scientific_accuracy', title: 'Medical / Scientific Accuracy' },
    { key: 'closing_action_orientation', title: 'Closing & Action Orientation' },
  ];

  if (loading) return (
    <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
      <CircularProgress />
    </Container>
  );

  if (error) return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Alert severity="error">{error}</Alert>
    </Container>
  );

  if (!rec) return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Alert severity="warning">Recording not found.</Alert>
    </Container>
  );

  const audioSrc = rec.processed_url || rec.audio_url;

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      {/* Back */}
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
        Back
      </Button>

      {/* Header */}
      <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
        {rec.title || `Recording #${rec.id}`}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {rec.recorded_by && <Chip label={rec.recorded_by} size="small" />}
        {rec.medicine && <Chip label={rec.medicine} size="small" variant="outlined" />}
        {rec.created_at && (
          <Chip label={new Date(rec.created_at).toLocaleDateString()} size="small" variant="outlined" />
        )}
      </Box>

      {/* Audio player */}
      {audioSrc && (
        <Box component="audio" controls sx={{ width: '100%', mb: 3 }} src={audioSrc} />
      )}

      {/* Transcription */}
      <Accordion elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: '8px !important' }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography fontWeight={600}>Transcription</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {rec.transcription ? (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{rec.transcription}</Typography>
          ) : (
            <Typography variant="body2" color="text.secondary" fontStyle="italic">Not yet available.</Typography>
          )}
        </AccordionDetails>
      </Accordion>

      {/* Analysis scores */}
      {sections ? (
        <>
          {/* 2x2 category score cards */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', mb: '20px' }}>
            {metricDefs.map((m) => {
              const sec = sections[m.key] as ScoreSection;
              if (!sec) return null;
              const percent = (sec.score / sec.max) * 100;
              const barColor = percent >= 70 ? '#22c55e' : percent >= 50 ? '#d97706' : '#ef4444';
              return (
                <Card key={m.key} elevation={0} sx={{ p: '12px 14px', borderRadius: 2, border: '1px solid', borderColor: 'divider', boxShadow: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, mb: '8px', lineHeight: 1.35 }}>
                    {m.title}
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: '10px' }}>
                    {sec.score} / {sec.max}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={percent}
                    sx={{ height: 6, borderRadius: 999, '& .MuiLinearProgress-bar': { backgroundColor: barColor, borderRadius: 999 } }}
                  />
                </Card>
              );
            })}
          </Box>

          {/* Overall compliance score */}
          <Card elevation={0} sx={{ p: '18px 16px', borderRadius: 2, border: '1px solid', borderColor: 'divider', boxShadow: 1, mb: '20px', textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: '8px' }}>
              Compliance Score
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
              <CircularProgress
                variant="determinate"
                value={score}
                size={100}
                color={score >= 80 ? 'success' : score >= 60 ? 'warning' : 'error'}
              />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
              {score}
            </Typography>
            {label && (
              <Chip label={label} sx={{ mt: '12px', fontWeight: 600, fontSize: '13px', px: 1.5, height: '24px', borderRadius: 999 }} />
            )}
          </Card>
        </>
      ) : (
        <Alert severity="info">Analysis not yet available for this recording.</Alert>
      )}
    </Container>
  );
}
