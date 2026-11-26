/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AuthButton, AuthField, AuthFrame, AuthLink, AuthNote } from "@core/components/auth/AuthFrame";
import api, { buildFullApiUrl } from "@core/utils/axiosConfig";

type Stage = "email" | "otp" | "done";

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

  // The same frame as every sign-in page (AuthFrame, 2026-11-26).
  const back = () => navigate(`/${company}/${app}/login`);
  if (stage === "done") {
    return (
      <AuthFrame title="Password reset">
        <AuthNote tone="ok">Your password has been reset. You can now sign in with the new one.</AuthNote>
        <AuthButton type="button" onClick={back}>Back to sign in</AuthButton>
      </AuthFrame>
    );
  }
  if (stage === "otp") {
    return (
      <AuthFrame
        title="Enter the code"
        subtitle="We sent a 6-digit code to your email. Enter it with your new password."
        footer={<><AuthLink onClick={() => { setStage("email"); setError(""); }}>Send a new code</AuthLink>{" · "}<AuthLink onClick={back}>Back to sign in</AuthLink></>}
      >
        <form onSubmit={(e) => { e.preventDefault(); void handleResetPassword(); }} noValidate>
          {error && <AuthNote tone="error">{error}</AuthNote>}
          <AuthField label="Code (6 digits)" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} error={Boolean(otpError)} helperText={otpError} autoFocus slotProps={{ htmlInput: { maxLength: 6, inputMode: "numeric" } }} />
          <AuthField label="New password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} error={Boolean(newPasswordError)} helperText={newPasswordError || "At least 8 characters"} />
          <AuthField label="New password again" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} error={Boolean(confirmPasswordError)} helperText={confirmPasswordError} />
          <AuthButton busy={loading}>{loading ? "Resetting…" : "Reset password"}</AuthButton>
        </form>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame
      title="Reset your password"
      subtitle="Enter the email you sign in with. We'll send you a code to set a new password."
      footer={<AuthLink onClick={back}>Back to sign in</AuthLink>}
    >
      <form onSubmit={(e) => { e.preventDefault(); void handleRequestOtp(); }} noValidate>
        {error && <AuthNote tone="error">{error}</AuthNote>}
        <AuthField label="Email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} error={Boolean(emailError)} helperText={emailError} />
        <AuthButton busy={loading}>{loading ? "Sending…" : "Send code"}</AuthButton>
      </form>
    </AuthFrame>
  );
}
