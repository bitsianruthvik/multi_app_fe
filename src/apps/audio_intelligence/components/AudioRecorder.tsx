/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, no-empty */
import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Button,
  TextField,
  Typography,
  CircularProgress,
  Alert,
  LinearProgress,
} from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import SaveIcon from "@mui/icons-material/Save";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import Tooltip from "@mui/material/Tooltip";
import { query } from "@core/api-builder";
import { formatAnalysis } from "@apps/audio_intelligence/utils/analysisFormatter";
import { uuidv4 } from "@core/api-builder/security";
import { useAuth } from "@core/contexts/AuthContext";

interface AudioRecorderProps {
  onRecordingComplete: (recording: any) => void;
  defaultTitle?: string;
  actionId?: string;
  flowBrandName?: string;
}

export default function AudioRecorder({
  onRecordingComplete,
  defaultTitle,
  actionId,
  flowBrandName,
}: AudioRecorderProps) {
  const { user, companySlug, appSlug } = useAuth();
  const navigate = useNavigate();
  const { company, app } = useParams<{ company?: string; app?: string }>();
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcription, setTranscription] = useState("");
  const [savedRecordingId, setSavedRecordingId] = useState<
    number | string | null
  >(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisErrorState, setAnalysisErrorState] = useState("");
  const [savedAnalysis, setSavedAnalysis] = useState<any>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [recordingMode, setRecordingMode] = useState<"near" | "far">("far");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const highpassRef = useRef<BiquadFilterNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const origStreamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Lazily create the AudioContext + processing nodes on first recording start.
  function ensureAudioContext(): AudioContext {
    if (audioContextRef.current) return audioContextRef.current;
    const AudioCtx =
      window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx({ sampleRate: 48000 });
    audioContextRef.current = ctx;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.5;
    gainNodeRef.current = gainNode;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 120;
    highpassRef.current = hp;

    return ctx;
  }

  // Cleanup AudioContext + rAF on unmount.
  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      try {
        audioContextRef.current?.close().catch(() => {});
      } catch (e) {}
      audioContextRef.current = null;
      gainNodeRef.current = null;
      highpassRef.current = null;
    };
  }, []);

  // Prefill title from parent when provided
  useEffect(() => {
    if (defaultTitle) setTitle(defaultTitle);
  }, [defaultTitle]);

  const startRecording = async () => {
    try {
      setError("");
      setSuccess("");
      setTranscription("");
      // Ensure getUserMedia is available (must be served over HTTPS or localhost)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError(
          "Microphone access is not available. Open the app on https or localhost and ensure your browser supports getUserMedia.",
        );
        console.error("navigator.mediaDevices.getUserMedia is not available");
        return;
      }

      // Configure audio constraints based on recording mode
      const constraints: MediaStreamConstraints = {
        audio:
          recordingMode === "near"
            ? ({
                // Near mode: optimized for close-range voice, suppress background
                autoGainControl: true,
                noiseSuppression: true,
                echoCancellation: true,
                channelCount: 1,
                sampleRate: 48000,
              } as any)
            : ({
                // Far mode: more sensitive, captures distant voices
                autoGainControl: false,
                noiseSuppression: false,
                echoCancellation: false,
                channelCount: 1,
                sampleRate: 48000,
              } as any),
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (getErr: any) {
        // Provide a clearer message for permission or insecure-context errors
        console.error("getUserMedia error:", getErr);
        if (getErr && getErr.name === "NotAllowedError") {
          setError(
            "Microphone permission denied. Please allow microphone access in your browser.",
          );
        } else if (getErr && getErr.name === "NotFoundError") {
          setError(
            "No microphone found. Please attach a microphone and try again.",
          );
        } else if (
          getErr &&
          getErr.message &&
          getErr.message.includes("Only secure origins are allowed")
        ) {
          setError(
            "Microphone access requires a secure context (https) or localhost. Open the app at http://localhost:5173 or use https.",
          );
        } else {
          setError(
            "Failed to access microphone. Please grant permission or check your browser settings.",
          );
        }
        return;
      }
      origStreamRef.current = stream;

      // Lazily create audio context and processing chain (gain + highpass)
      const audioCtx = ensureAudioContext();
      const gainNode = gainNodeRef.current!;
      const hp = highpassRef.current!;

      const source = audioCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const dest = audioCtx.createMediaStreamDestination();
      destRef.current = dest;

      // Connect chain: source -> gain -> highpass -> dest
      source.connect(gainNode);
      gainNode.connect(hp);
      hp.connect(dest);

      // Use the processed stream for MediaRecorder
      const processedStream = dest.stream;
      const mediaRecorder = new MediaRecorder(processedStream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        setAudioBlob(audioBlob);
        // stop original tracks
        try {
          origStreamRef.current?.getTracks().forEach((track) => track.stop());
        } catch (e) {}
        // disconnect processing graph (keep AudioContext alive for reuse;
        // it is closed on component unmount).
        try {
          sourceNodeRef.current?.disconnect();
        } catch (e) {}
        try {
          destRef.current?.disconnect();
        } catch (e) {}
        // stop any pending waveform animation frame
        if (rafIdRef.current != null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      setError("Failed to access microphone. Please grant permission.");
      console.error("Recording error:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const saveRecording = async () => {
    // Use custom title if provided, otherwise use defaultTitle
    const finalTitle = title.trim() || defaultTitle || "";

    if (!audioBlob || !finalTitle) {
      setError(
        "Please provide a medicine name or custom title for the recording",
      );
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      // Upload via multipart FormData to the documented audio upload endpoint.
      // apiFetch JSON-stringifies bodies, so we use fetch directly here.
      const idempotencyKey = uuidv4();
      const fd = new FormData();
      fd.append("audio_file", audioBlob, "recording.webm");
      if (finalTitle) fd.append("title", finalTitle);
      fd.append("status", "completed");
      fd.append("idempotencyKey", idempotencyKey);
      if (defaultTitle || finalTitle)
        fd.append("medicine", defaultTitle || finalTitle);
      if (user?.name) fd.append("recorded_by", user.name);
      if (user?.role) fd.append("recorded_by_role", user.role);
      if (recordingTime)
        fd.append("duration_seconds", String(recordingTime));
      if (transcription && transcription.trim())
        fd.append("transcription", transcription.trim());
      if (actionId)
        fd.append("action_id", actionId);

      const baseUrl = (
        (import.meta as any).env.VITE_API_BASE_URL || ""
      ).replace(/\/$/, "");
      const token = localStorage.getItem("token");
      const uploadRes = await fetch(
        `${baseUrl}/api/${companySlug}/${appSlug}/audio/upload`,
        {
          method: "POST",
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        }
      );
      if (!uploadRes.ok) {
        const text = await uploadRes.text().catch(() => "");
        throw new Error(
          `Upload failed (${uploadRes.status}): ${text || uploadRes.statusText}`
        );
      }
      const response = await uploadRes.json().catch(() => ({}));

      setSuccess("Recording saved successfully!");

      // Extract id from response
      console.log("Save response:", response);
      let newId = null;
      if (response?.id) newId = response.id;
      else if (response?.insertId) newId = response.insertId;
      else if (response?.data?.[0]?.id) newId = response.data[0].id;
      else if (response?.data?.id) newId = response.data.id;

      console.log("Extracted newId:", newId);
      if (newId) {
        setSavedRecordingId(newId);
        setIsSaved(true);
        console.log("Set savedRecordingId to:", newId);
      }

      if (onRecordingComplete) {
        onRecordingComplete(response);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to save recording");
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  const fetchAnalysis = async (id?: number | string) => {
    const rowId = id ?? savedRecordingId;
    if (!rowId) {
      setAnalysisErrorState("No recording id available to fetch analysis");
      return;
    }

    setAnalysisLoading(true);
    setAnalysisErrorState("");
    try {
      const resp = await query({
        resource: "audio_recordings",
        fields: ["analysis"],
        filters: { "id.eq": rowId },
        limit: 1,
        timeoutMs: 10000,
      });

      // backend can return { data: [...] } or an array/object directly
      const row = Array.isArray((resp as any)?.data)
        ? (resp as any).data[0]
        : ((resp as any).data ?? (Array.isArray(resp) ? resp[0] : resp));

      const analysis = row?.analysis ?? null;
      setSavedAnalysis(analysis);
    } catch (err: any) {
      console.error("Failed to fetch analysis:", err);
      setAnalysisErrorState(err?.message || String(err));
    } finally {
      setAnalysisLoading(false);
    }
  };

  // Suppress unused variable warnings for formatAnalysis and transcription
  void formatAnalysis;
  void transcription;

  return (
    <Box className="card fade-in">
      {/* Realtime transcription removed; server-side transcription will be used if available. */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      {/* Recording Controls */}
      <Box sx={{ mb: 3, textAlign: "center" }}>
        {!isRecording && !audioBlob && (
          <>
            {/* Recording Mode Toggle */}
            <Box
              sx={{
                mb: 3,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1.5,
              }}
            >
              <Typography
                sx={{
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  color: "#64748b",
                }}
              >
                Recording Distance
              </Typography>
              <Box
                sx={{
                  display: "inline-flex",
                  bgcolor: "#f1f5f9",
                  borderRadius: 999,
                  p: 0.5,
                  border: "1px solid #e2e8f0",
                }}
              >
                <Tooltip
                  title="Holding the phone close to your mouth."
                  arrow
                >
                  <Button
                    onClick={() => setRecordingMode("near")}
                    endIcon={
                      <InfoOutlinedIcon
                        sx={{ fontSize: 14, opacity: 0.7 }}
                      />
                    }
                    sx={{
                      borderRadius: 999,
                      px: 3,
                      py: 0.75,
                      textTransform: "none",
                      fontWeight: 600,
                      fontSize: "0.9rem",
                      transition: "all 0.2s",
                      bgcolor:
                        recordingMode === "near" ? "#1f5df5" : "transparent",
                      color: recordingMode === "near" ? "white" : "#64748b",
                      boxShadow:
                        recordingMode === "near"
                          ? "0 2px 8px rgba(31,93,245,0.25)"
                          : "none",
                      "&:hover": {
                        bgcolor:
                          recordingMode === "near" ? "#1b52da" : "#e2e8f0",
                      },
                    }}
                  >
                    Near
                  </Button>
                </Tooltip>
                <Tooltip
                  title="Phone on a desk or speaker distance."
                  arrow
                >
                  <Button
                  onClick={() => setRecordingMode("far")}
                  sx={{
                    borderRadius: 999,
                    px: 3,
                    py: 0.75,
                    textTransform: "none",
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    transition: "all 0.2s",
                    bgcolor:
                      recordingMode === "far" ? "#1f5df5" : "transparent",
                    color: recordingMode === "far" ? "white" : "#64748b",
                    boxShadow:
                      recordingMode === "far"
                        ? "0 2px 8px rgba(31,93,245,0.25)"
                        : "none",
                    "&:hover": {
                      bgcolor: recordingMode === "far" ? "#1b52da" : "#e2e8f0",
                    },
                  }}
                >
                  Far
                </Button>
                </Tooltip>
              </Box>
              <Typography
                sx={{
                  fontSize: "0.75rem",
                  color: "#94a3b8",
                  textAlign: "center",
                  maxWidth: 280,
                }}
              >
                {recordingMode === "near"
                  ? "Optimized for voices close to the device"
                  : "Captures voices from across the room"}
              </Typography>
            </Box>

            <Button
              onClick={startRecording}
              variant="contained"
              startIcon={<MicIcon />}
              sx={{
                py: 1.25,
                px: 4,
                borderRadius: 999,
                background: "#1f5df5",
                color: "#ffffff",
                fontWeight: 700,
                textTransform: "none",
                fontSize: "1rem",
                boxShadow: "0 8px 18px rgba(31,93,245,0.25)",
                "&:hover": { background: "#1b52da" },
                "&:active": { background: "#184ac6" },
              }}
            >
              Start Recording
            </Button>
          </>
        )}

        {isRecording && (
          <Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                bgcolor: "#f3f4f6",
                px: 2,
                py: 1.5,
                borderRadius: 2,
                mb: 2,
                gap: 1.5,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: "#ef4444",
                    animation: "pulse 1.5s infinite",
                  }}
                />
                <Typography
                  sx={{ fontWeight: 600, color: "#64748b", fontSize: "0.9rem" }}
                >
                  Recording
                </Typography>
                <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                  {[0, 1, 2].map((i) => (
                    <Box
                      key={i}
                      sx={{
                        width: 2,
                        height: [8, 12, 10][i],
                        background: "#2563eb",
                        borderRadius: 1,
                        animation: `pulse 0.6s ease-in-out infinite`,
                        animationDelay: `${i * 0.1}s`,
                      }}
                    />
                  ))}
                </Box>
              </Box>
              <Typography
                sx={{
                  fontWeight: 600,
                  color: "#64748b",
                  fontSize: "0.9rem",
                  minWidth: 40,
                  textAlign: "right",
                }}
              >
                {formatTime(recordingTime)}
              </Typography>
            </Box>
            <LinearProgress
              color="error"
              sx={{ mb: 3, height: 6, borderRadius: 3 }}
            />

            {/* No realtime transcription (disabled) */}

            <Button
              onClick={stopRecording}
              variant="contained"
              startIcon={<StopIcon sx={{ fontSize: 20 }} />}
              fullWidth
              sx={{
                py: 0.9,
                borderRadius: 999,
                background: "#1f5df5",
                color: "#ffffff",
                fontWeight: 600,
                textTransform: "none",
                fontSize: "0.95rem",
                boxShadow: "0 4px 12px rgba(31,93,245,0.2)",
                "&:hover": {
                  background: "#1b52da",
                  boxShadow: "0 6px 16px rgba(31,93,245,0.3)",
                },
                "&:active": { background: "#184ac6" },
              }}
            >
              Stop Recording
            </Button>
          </Box>
        )}

        {audioBlob && !isRecording && !isSaved && (
          <Box>
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: "0.95rem",
                color: "#1f2937",
                mb: 2,
                textAlign: "center",
              }}
            >
              Recording Complete ({formatTime(recordingTime)})
            </Typography>

            {/* Audio Preview */}
            <Box
              sx={{
                mb: 2.5,
                p: 1.5,
                bgcolor: "#f3f4f6",
                borderRadius: 2,
                "& audio": {
                  width: "100%",
                  height: 36,
                  borderRadius: 1,
                },
              }}
            >
              <audio controls src={URL.createObjectURL(audioBlob)} />
            </Box>

            {/* Transcription disabled */}

            {/* Medicine Name Display */}
            {defaultTitle && (
              <Box sx={{ mb: 2.5, textAlign: "center" }}>
                <Typography
                  sx={{
                    fontWeight: 700,
                    color: "#1f5df5",
                    fontSize: "1rem",
                    mb: 0.5,
                  }}
                >
                  Medicine: {defaultTitle}
                </Typography>
              </Box>
            )}

            {/* Custom Title Input */}
            <TextField
              fullWidth
              label="Custom Title (Optional)"
              placeholder={defaultTitle || "e.g., Doctor Visit - John Doe"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              sx={{
                mb: 2.5,
                "& .MuiOutlinedInput-root": {
                  borderRadius: 1.5,
                  fontSize: "0.9rem",
                  padding: "8px 12px",
                  background: "#fafafa",
                },
                "& .MuiInputLabel-root": {
                  fontSize: "0.85rem",
                },
                "& .MuiFormHelperText-root": {
                  fontSize: "0.8rem",
                  marginTop: "4px",
                },
              }}
              helperText="Add a custom title to describe this recording"
            />

            {/* Save/Discard Buttons */}
            <Box
              sx={{
                display: "flex",
                gap: 1.5,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Button
                onClick={saveRecording}
                disabled={saving || (!defaultTitle && !title.trim())}
                variant="contained"
                startIcon={
                  saving ? (
                    <CircularProgress size={14} sx={{ color: "white" }} />
                  ) : (
                    <SaveIcon sx={{ fontSize: 18 }} />
                  )
                }
                sx={{
                  py: 0.8,
                  px: 3,
                  borderRadius: 999,
                  background: "#1f5df5",
                  color: "#ffffff",
                  fontWeight: 700,
                  textTransform: "none",
                  fontSize: "0.9rem",
                  boxShadow: "0 2px 8px rgba(31,93,245,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.8,
                  flex: 1,
                  "&:hover": {
                    background: "#1b52da",
                    boxShadow: "0 4px 12px rgba(31,93,245,0.4)",
                  },
                  "&:active": { background: "#184ac6" },
                  "&.Mui-disabled": {
                    background: "#93c5fd",
                    color: "#ffffff",
                  },
                }}
              >
                {saving ? "Saving..." : "Save Recording"}
              </Button>

              <Button
                onClick={() => {
                  setAudioBlob(null);
                  setTitle("");
                  setRecordingTime(0);
                }}
                disabled={saving}
                variant="outlined"
                sx={{
                  py: 0.8,
                  px: 3,
                  borderRadius: 999,
                  borderColor: "#cbd5e1",
                  color: "#64748b",
                  fontWeight: 700,
                  textTransform: "none",
                  fontSize: "0.9rem",
                  border: "1.5px solid",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: 1,
                  "&:hover": {
                    borderColor: "#94a3b8",
                    color: "#334155",
                    background: "#f8fafc",
                  },
                }}
              >
                Discard
              </Button>
            </Box>
          </Box>
        )}

        {isSaved && savedRecordingId && (
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              Recording saved! ID: {savedRecordingId}
            </Alert>

            {/* Show Analysis Button and result */}
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: "flex", gap: 1.5, mb: 2 }}>
                <Button
                  onClick={() => {
                    if (company && app && savedRecordingId && actionId && flowBrandName) {
                      navigate(
                        `/${company}/${app}/flow/${actionId}/${encodeURIComponent(flowBrandName)}/recording/${savedRecordingId}`,
                      );
                    } else if (company && app && actionId) {
                      navigate(`/${company}/${app}/flow/${actionId}`);
                    }
                  }}
                  disabled={analysisLoading}
                  variant="contained"
                  sx={{
                    flex: 1,
                    py: 0.8,
                    px: 2,
                    borderRadius: 999,
                    background: "#1f5df5",
                    color: "#ffffff",
                    fontWeight: 700,
                    textTransform: "none",
                    fontSize: "0.9rem",
                    boxShadow: "0 2px 8px rgba(31,93,245,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    "&:hover": {
                      background: "#1b52da",
                      boxShadow: "0 4px 12px rgba(31,93,245,0.4)",
                    },
                    "&:active": { background: "#184ac6" },
                    "&.Mui-disabled": {
                      background: "#93c5fd",
                      color: "#ffffff",
                    },
                  }}
                >
                  {analysisLoading ? "Loading..." : "Show Analysis"}
                </Button>
                <Button
                  onClick={() => fetchAnalysis(savedRecordingId)}
                  disabled={analysisLoading}
                  variant="outlined"
                  sx={{
                    flex: 1,
                    py: 0.8,
                    px: 2,
                    borderRadius: 999,
                    borderColor: "#cbd5e1",
                    color: "#64748b",
                    fontWeight: 700,
                    textTransform: "none",
                    fontSize: "0.9rem",
                    border: "1.5px solid",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    "&:hover": {
                      borderColor: "#94a3b8",
                      color: "#334155",
                      background: "#f8fafc",
                    },
                  }}
                >
                  Refresh
                </Button>
                <Button
                  onClick={() => {
                    setIsSaved(false);
                    setAudioBlob(null);
                    setTitle("");
                    setRecordingTime(0);
                    setSavedRecordingId(null);
                    setSavedAnalysis(null);
                    setSuccess("");
                  }}
                  variant="outlined"
                  sx={{
                    flex: 1,
                    py: 0.8,
                    px: 2,
                    borderRadius: 999,
                    borderColor: "#cbd5e1",
                    color: "#64748b",
                    fontWeight: 700,
                    textTransform: "none",
                    fontSize: "0.9rem",
                    border: "1.5px solid",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    "&:hover": {
                      borderColor: "#94a3b8",
                      color: "#334155",
                      background: "#f8fafc",
                    },
                  }}
                >
                  New Recording
                </Button>
              </Box>

              {analysisErrorState && (
                <Alert severity="error" sx={{ mb: 1 }}>
                  {analysisErrorState}
                </Alert>
              )}

              {savedAnalysis !== null && (
                <Box sx={{ bgcolor: "grey.50", p: 2, borderRadius: 1, mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Analysis
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      whiteSpace: "pre-wrap",
                      wordWrap: "break-word",
                      fontFamily: '"Courier New", monospace',
                      fontSize: "0.85rem",
                      backgroundColor: "background.paper",
                      p: 2,
                      borderRadius: 1,
                      border: "1px solid",
                      borderColor: "divider",
                      overflowX: "auto",
                      maxHeight: "600px",
                      overflowY: "auto",
                    }}
                  >
                    {typeof savedAnalysis === "string"
                      ? savedAnalysis
                      : JSON.stringify(savedAnalysis, null, 2)}
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>

      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}
      </style>
    </Box>
  );
}
