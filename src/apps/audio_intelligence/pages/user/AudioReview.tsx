/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation, Link as RouterLink } from "react-router-dom";
import { apiPost } from "@core/api/client";
import { query } from "@core/api-builder";
import { useAuth } from "@core/contexts/AuthContext";
import { useFlow } from "@apps/audio_intelligence/contexts/FlowContext";
import FlowBreadcrumb from "@apps/audio_intelligence/components/FlowBreadcrumb";
import {
  Box,
  CircularProgress,
  Container,
  Typography,
  Card,
  Alert,
  Button,
} from "@mui/material";

type AudioRecord = {
  id: number;
  title?: string;
  audio_url?: string | null;
  processed_url?: string | null;
  processed_audio?: string | null;
  transcription?: string | null;
  score?: number | null;
  analysis?: string | null;
};

export default function AudioReview() {
  const { recordingId, actionId, brandName } = useParams<{ recordingId: string; actionId: string; brandName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { actionName } = useFlow();
  const { companySlug, appSlug } = useAuth();

  // Suppress unused variable warnings
  void navigate;
  void actionName;

  const parts = location.pathname.split('/').filter(Boolean);
  const company = parts[0];
  const app = parts[1];
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<AudioRecord | null>(null);
  const [transcriptions, setTranscriptions] = useState<any[]>([]);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [transcribeDebug, setTranscribeDebug] = useState<any | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!recordingId) throw new Error("Missing recordingId parameter");
        setLoading(true);
        const resp = await query({
          resource: "audio_recordings",
          fields: [
            "id",
            "title",
            "audio_url",
            "processed_url",
            "processed_audio",
            "transcription",
            "score",
            "analysis",
            "medicine",
          ],
          filters: { "id.eq": Number(recordingId) },
        });
        if (!mounted) return;
        if (!resp || !resp.success) {
          setError((resp && resp.error) || "Failed to fetch record");
          setRecord(null);
        } else {
          const row =
            Array.isArray(resp.data) && resp.data.length > 0
              ? resp.data[0]
              : null;
          setRecord(row);
        }
      } catch (e: any) {
        setError(e && e.message ? e.message : String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [recordingId]);

  const transcriptionText =
    (transcriptions && transcriptions.length && transcriptions[0].text) ||
    (record && record.transcription) ||
    null;

  if (loading)
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "50vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  if (error)
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="error">Error: {error}</Alert>
      </Container>
    );
  if (!record)
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="warning">No record found</Alert>
      </Container>
    );

  const runTranscription = async () => {
    setTranscribing(true);
    setTranscribeError(null);
    setTranscribeDebug(null);
    try {
      const tres = await apiPost(
        `/api/${companySlug}/${appSlug}/audio/transcribe`,
        { audio_id: record.id }
      );
      if (tres && tres.success) {
        if (tres.originalAudioUrl)
          setRecord((r) =>
            r ? { ...r, audio_url: tres.originalAudioUrl } : r
          );
        if (tres.processedAudioUrl)
          setRecord((r) =>
            r
              ? {
                  ...r,
                  processed_audio: tres.processedAudioUrl,
                  processed_url: tres.processedAudioUrl,
                }
              : r
          );
        if (tres.transcript)
          setRecord((r) => (r ? { ...r, transcription: tres.transcript } : r));
        if (tres.transcriptions && Array.isArray(tres.transcriptions))
          setTranscriptions(tres.transcriptions);
        if (tres.debug) setTranscribeDebug(tres.debug);
      } else {
        setTranscribeError(tres?.error || "Transcription failed");
        setTranscribeDebug(tres?.debug || null);
      }
    } catch (e: any) {
      console.warn("Transcription request failed:", e);
      setTranscribeError((e && e.message) || String(e));
    }
    setTranscribing(false);
  };

  // Suppress unused import warning
  void React;

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <FlowBreadcrumb recordingTitle={record?.title ?? `Recording #${recordingId}`} />

      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>
        Session Playback
      </Typography>

      {/* Audio Player Card */}
      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {record.title || "(no title)"}
        </Typography>

        <Box
          sx={{
            display: "flex",
            gap: 3,
            mb: 2,
            flexWrap: "wrap",
          }}
        >
          <Box sx={{ flex: 1, minWidth: 260 }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
              Original Audio
            </Typography>
            {record.audio_url ? (
              <Box
                component="audio"
                controls
                src={record.audio_url}
                sx={{ width: "100%", borderRadius: 1 }}
              />
            ) : (
              <Typography variant="body2" color="text.secondary">
                No original audio URL available
              </Typography>
            )}
          </Box>

          <Box sx={{ flex: 1, minWidth: 260 }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
              Processed Audio
            </Typography>
            {record.processed_url || record.processed_audio ? (
              <Box
                component="audio"
                controls
                src={record.processed_url || record.processed_audio || undefined}
                sx={{ width: "100%", borderRadius: 1 }}
              />
            ) : (
              <Typography variant="body2" color="text.secondary">
                No processed audio URL available
              </Typography>
            )}
          </Box>
        </Box>
      </Card>

      {/* Transcript Card */}
      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
          Transcription
        </Typography>

        {!transcriptionText && (
          <Box sx={{ mb: 2 }}>
            <Button
              variant="contained"
              onClick={runTranscription}
              disabled={transcribing}
            >
              {transcribing ? "Transcribing..." : "Run Transcription"}
            </Button>
          </Box>
        )}

        {transcriptionText ? (
          <Box
            component="pre"
            sx={{
              whiteSpace: "pre-wrap",
              bgcolor: "background.default",
              p: 2,
              borderRadius: 1,
              fontFamily: "monospace",
              fontSize: "0.875rem",
              color: "text.primary",
              m: 0,
            }}
          >
            {transcriptionText}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No transcription found for this audio.
          </Typography>
        )}

        {transcribeError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            <strong>Transcription error:</strong> {transcribeError}
            {transcribeDebug && (
              <Box
                component="pre"
                sx={{
                  whiteSpace: "pre-wrap",
                  bgcolor: "background.paper",
                  p: 1.5,
                  borderRadius: 1,
                  mt: 1,
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                }}
              >
                {JSON.stringify(transcribeDebug, null, 2)}
              </Box>
            )}
          </Alert>
        )}
      </Card>

      <Box sx={{ display: "flex", gap: 2, alignItems: "center", mt: 1 }}>
        <Button
          variant="outlined"
          component={RouterLink}
          to={`/${company}/${app}/flow/${actionId}/${brandName}`}
        >
          ← Back to recordings
        </Button>

        {(record.score != null || record.analysis != null) && (
          <Button
            variant="contained"
            component={RouterLink}
            to={`/${company}/${app}/flow/${actionId}/${brandName}/recording/${recordingId}/analysis`}
          >
            View Analysis
          </Button>
        )}
      </Box>
    </Container>
  );
}
