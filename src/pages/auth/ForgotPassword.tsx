/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import {
  Box,
  Button,
  Container,
  Paper,
  TextField,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
} from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import api, { buildFullApiUrl } from "@core/utils/axiosConfig";

type Stage = "email" | "otp" | "done";

const fieldSx = {
  "& .MuiOutlinedInput-root": {
    bgcolor: "#f9fafb",
    borderRadius: 1.5,
    "& fieldset": { borderColor: "#e5e7eb" },
    "&:hover fieldset": { borderColor: "#d1d5db" },
  },
  "& .MuiOutlinedInput-input::placeholder": { color: "#9ca3af", opacity: 1 },
};

export default function ForgotPassword() {
  const [stage, setStage] = useState<Stage>("email");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");

  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const navigate = useNavigate();
  const { company, app } = useParams<{ company: string; app: string }>();

  const handleRequestOtp = async () => {
    setError("");
    setEmailError("");
    if (!email) { setEmailError("Email is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEmailError("Enter a valid email"); return; }

    setLoading(true);
    try {
      const res = await api.post(buildFullApiUrl("/auth/forgot-password"), { email });
      if (res.data.otp) {
        setOtp(res.data.otp);
      }
      setStage("otp");
    } catch (err: any) {
      setError(err.response?.data?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError("");
    setOtpError("");
    setNewPasswordError("");
    setConfirmPasswordError("");

    let valid = true;
    if (!otp || otp.length !== 6) { setOtpError("Enter the 6-digit OTP"); valid = false; }
    if (!newPassword || newPassword.length < 8) { setNewPasswordError("Password must be at least 8 characters"); valid = false; }
    if (newPassword !== confirmPassword) { setConfirmPasswordError("Passwords do not match"); valid = false; }
    if (!valid) return;

    setLoading(true);
    try {
      await api.post(buildFullApiUrl("/auth/reset-password"), { email, otp, password: newPassword });
      setStage("done");
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container
      component="main"
      maxWidth="xs"
      sx={{
        minHeight: "calc(100vh - 180px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: 6,
      }}
    >
      <Box sx={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Paper
          elevation={0}
          sx={{
            p: 4,
            width: "100%",
            maxWidth: 400,
            borderRadius: 3,
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            textAlign: "center",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 80,
              height: 80,
              mx: "auto",
              mb: 2,
              bgcolor: "#f3f4f6",
              borderRadius: 3,
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              SC
            </Typography>
          </Box>

          {/* Stage: email */}
          {stage === "email" && (
            <>
              <Typography variant="h4" component="h1" sx={{ fontWeight: 800, color: "#1f2937", mb: 1 }}>
                Forgot Password
              </Typography>
              <Typography variant="body2" sx={{ color: "#6b7280", mb: 3 }}>
                Enter your email and we'll send you an OTP
              </Typography>

              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" sx={{ textAlign: "left", fontWeight: 600, color: "#374151", mb: 1 }}>
                  Email
                </Typography>
                <TextField
                  fullWidth
                  size="medium"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={Boolean(emailError)}
                  helperText={emailError}
                  sx={fieldSx}
                />
              </Box>

              <Button
                fullWidth
                variant="contained"
                size="large"
                onClick={handleRequestOtp}
                disabled={loading}
                sx={{
                  py: 1.5,
                  bgcolor: "#2563eb",
                  color: "white",
                  fontWeight: 700,
                  borderRadius: 1.5,
                  textTransform: "none",
                  fontSize: "1rem",
                  "&:hover": { bgcolor: "#1d4ed8" },
                }}
              >
                {loading ? "Sending…" : "Send OTP"}
              </Button>
            </>
          )}

          {/* Stage: otp */}
          {stage === "otp" && (
            <>
              <Typography variant="h4" component="h1" sx={{ fontWeight: 800, color: "#1f2937", mb: 1 }}>
                Enter OTP
              </Typography>
              <Typography variant="body2" sx={{ color: "#6b7280", mb: 3 }}>
                Check the API response for your OTP (dev mode)
              </Typography>

              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

              <Box sx={{ mb: 2.5 }}>
                <Typography variant="body2" sx={{ textAlign: "left", fontWeight: 600, color: "#374151", mb: 1 }}>
                  OTP (6 digits)
                </Typography>
                <TextField
                  fullWidth
                  size="medium"
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  error={Boolean(otpError)}
                  helperText={otpError}
                  inputProps={{ maxLength: 6, inputMode: "numeric" }}
                  sx={fieldSx}
                />
              </Box>

              <Box sx={{ mb: 2.5 }}>
                <Typography variant="body2" sx={{ textAlign: "left", fontWeight: 600, color: "#374151", mb: 1 }}>
                  New Password
                </Typography>
                <TextField
                  fullWidth
                  size="medium"
                  placeholder="Min. 8 characters"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  error={Boolean(newPasswordError)}
                  helperText={newPasswordError}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowNewPassword(!showNewPassword)} edge="end" sx={{ color: "#6b7280" }}>
                          {showNewPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={fieldSx}
                />
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" sx={{ textAlign: "left", fontWeight: 600, color: "#374151", mb: 1 }}>
                  Confirm Password
                </Typography>
                <TextField
                  fullWidth
                  size="medium"
                  placeholder="Repeat your new password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  error={Boolean(confirmPasswordError)}
                  helperText={confirmPasswordError}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowConfirmPassword(!showConfirmPassword)} edge="end" sx={{ color: "#6b7280" }}>
                          {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={fieldSx}
                />
              </Box>

              <Button
                fullWidth
                variant="contained"
                size="large"
                onClick={handleResetPassword}
                disabled={loading}
                sx={{
                  py: 1.5,
                  bgcolor: "#2563eb",
                  color: "white",
                  fontWeight: 700,
                  borderRadius: 1.5,
                  textTransform: "none",
                  fontSize: "1rem",
                  "&:hover": { bgcolor: "#1d4ed8" },
                }}
              >
                {loading ? "Resetting…" : "Reset Password"}
              </Button>

              <Typography variant="body2" sx={{ mt: 2, color: "#6b7280" }}>
                <Box
                  component="span"
                  onClick={() => { setStage("email"); setError(""); }}
                  sx={{ color: "#2563eb", fontWeight: 600, cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
                >
                  Request a new OTP
                </Box>
              </Typography>
            </>
          )}

          {/* Stage: done */}
          {stage === "done" && (
            <>
              <Typography variant="h4" component="h1" sx={{ fontWeight: 800, color: "#1f2937", mb: 1 }}>
                Password Reset
              </Typography>
              <Alert severity="success" sx={{ mb: 3, textAlign: "left" }}>
                Your password has been reset successfully. You can now log in with your new password.
              </Alert>
              <Button
                fullWidth
                variant="contained"
                size="large"
                onClick={() => navigate(`/${company}/${app}/login`)}
                sx={{
                  py: 1.5,
                  bgcolor: "#2563eb",
                  color: "white",
                  fontWeight: 700,
                  borderRadius: 1.5,
                  textTransform: "none",
                  fontSize: "1rem",
                  "&:hover": { bgcolor: "#1d4ed8" },
                }}
              >
                Back to Login
              </Button>
            </>
          )}

          {stage !== "done" && (
            <Typography variant="body2" sx={{ mt: 2.5, color: "#6b7280" }}>
              Remember your password?{" "}
              <Box
                component="span"
                onClick={() => navigate(`/${company}/${app}/login`)}
                sx={{ color: "#2563eb", fontWeight: 600, cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
              >
                Sign in
              </Box>
            </Typography>
          )}
        </Paper>
      </Box>
    </Container>
  );
}
