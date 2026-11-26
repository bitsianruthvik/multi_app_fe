/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import * as yup from "yup";
import { API_HOST } from "@core/utils/axiosConfig";
import { useAuth } from "@core/contexts/AuthContext";
import api from "@core/utils/axiosConfig";
import { AuthButton, AuthField, AuthFrame, AuthLink, AuthNote } from "@core/components/auth/AuthFrame";

/**
 * /:company — the company sign-in. Same frame as every other sign-in page (AuthFrame, 2026-11-26).
 * The address's own word, never the server's answer (2026-11-24): the page shows nothing that tells whether a company
 * is there, and any address gets the same sign-in (a wrong one simply fails to sign in).
 */
type Mode = "login" | "forgot";

export default function CompanyLanding() {
  const { company: companySlug = "" } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const { login, isAuthenticated, isInitialized, companySlug: authCompany } = useAuth();
  const [mode, setMode] = useState<Mode>("login");

  // Redirect if already authenticated for this company
  useEffect(() => {
    if (isInitialized && isAuthenticated && authCompany === companySlug) {
      navigate(`/${companySlug}/apps`, { replace: true });
    }
  }, [isInitialized, isAuthenticated, authCompany, companySlug, navigate]);

  if (mode === "forgot") {
    return (
      <AuthFrame
        title="Reset your password"
        subtitle="Enter the email you sign in with. We'll send you a code to set a new password."
        footer={<AuthLink onClick={() => setMode("login")}>Back to sign in</AuthLink>}
      >
        <ForgotForm companySlug={companySlug} />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Sign in"
      subtitle={<>to your workspace <b>{companySlug}</b></>}
      footer={<AuthLink onClick={() => setMode("forgot")}>Forgot password?</AuthLink>}
    >
      <LoginForm companySlug={companySlug} onLogin={(token, user) => { login(token, user, companySlug); navigate(`/${companySlug}/apps`); }} />
    </AuthFrame>
  );
}

function LoginForm({ companySlug, onLogin }: { companySlug: string; onLogin: (token: string, user: any) => void }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const formik = useFormik({
    initialValues: { email: "", password: "" },
    validationSchema: yup.object({
      email: yup.string().trim().matches(/^([^\s@]+@[^\s@]+\.[^\s@]+|[A-Za-z0-9][A-Za-z0-9._-]{2,39})$/, "Enter your email or username").required("Enter your email or username"),
      password: yup.string().min(8, "Minimum 8 characters").required("Password is required"),
    }),
    onSubmit: async (values) => {
      setError("");
      setLoading(true);
      try {
        const res = await api.post(`${API_HOST}/api/${companySlug}/auth/login`, values);
        onLogin(res.data.token, res.data.user);
      } catch (err: any) {
        setError(err.response?.data?.message || "Login failed. Please try again.");
      } finally {
        setLoading(false);
      }
    },
  });

  return (
    <form onSubmit={formik.handleSubmit} noValidate>
      {error && <AuthNote tone="error">{error}</AuthNote>}
      <AuthField
        label="Email or username"
        name="email"
        autoComplete="username"
        autoFocus
        value={formik.values.email}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        error={formik.touched.email && Boolean(formik.errors.email)}
        helperText={formik.touched.email && formik.errors.email}
      />
      <AuthField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={formik.values.password}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        error={formik.touched.password && Boolean(formik.errors.password)}
        helperText={formik.touched.password && formik.errors.password}
      />
      <AuthButton busy={loading}>{loading ? "Signing in…" : "Sign in"}</AuthButton>
    </form>
  );
}

function ForgotForm({ companySlug }: { companySlug: string }) {
  const [stage, setStage] = useState<"email" | "reset" | "done">("email");
  const [devToken, setDevToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const emailFormik = useFormik({
    initialValues: { email: "" },
    validationSchema: yup.object({ email: yup.string().email("Enter a valid email").required("Email is required") }),
    onSubmit: async (values) => {
      setError("");
      setLoading(true);
      try {
        const res = await api.post(`${API_HOST}/api/${companySlug}/auth/forgot-password`, values);
        if (res.data.devResetToken) setDevToken(res.data.devResetToken);
        setStage("reset");
      } catch (err: any) {
        setError(err.response?.data?.message || "Something went wrong.");
      } finally {
        setLoading(false);
      }
    },
  });

  const resetFormik = useFormik({
    initialValues: { token: devToken, password: "", confirm: "" },
    enableReinitialize: true,
    validationSchema: yup.object({
      token: yup.string().required("Reset code is required"),
      password: yup.string().min(8, "Minimum 8 characters").required("Password is required"),
      confirm: yup.string().oneOf([yup.ref("password")], "Passwords must match").required("Please confirm your password"),
    }),
    onSubmit: async (values) => {
      setError("");
      setLoading(true);
      try {
        await api.post(`${API_HOST}/api/${companySlug}/auth/reset-password`, { token: values.token, password: values.password });
        setStage("done");
      } catch (err: any) {
        setError(err.response?.data?.message || "Reset failed. The code may have expired.");
      } finally {
        setLoading(false);
      }
    },
  });

  if (stage === "done") {
    return <AuthNote tone="ok">Your password is reset. You can now sign in with the new one.</AuthNote>;
  }

  if (stage === "reset") {
    return (
      <form onSubmit={resetFormik.handleSubmit} noValidate>
        <AuthNote tone="ok">If that email has an account here, a reset code is on its way. Enter it below with your new password.</AuthNote>
        {error && <AuthNote tone="error">{error}</AuthNote>}
        {devToken && <AuthNote tone="info"><b>Dev code:</b> {devToken}</AuthNote>}
        <AuthField label="Reset code" name="token" value={resetFormik.values.token} onChange={resetFormik.handleChange} onBlur={resetFormik.handleBlur} error={resetFormik.touched.token && Boolean(resetFormik.errors.token)} helperText={resetFormik.touched.token && resetFormik.errors.token} />
        <AuthField label="New password" name="password" type="password" autoComplete="new-password" value={resetFormik.values.password} onChange={resetFormik.handleChange} onBlur={resetFormik.handleBlur} error={resetFormik.touched.password && Boolean(resetFormik.errors.password)} helperText={(resetFormik.touched.password && resetFormik.errors.password) || "At least 8 characters"} />
        <AuthField label="New password again" name="confirm" type="password" autoComplete="new-password" value={resetFormik.values.confirm} onChange={resetFormik.handleChange} onBlur={resetFormik.handleBlur} error={resetFormik.touched.confirm && Boolean(resetFormik.errors.confirm)} helperText={resetFormik.touched.confirm && resetFormik.errors.confirm} />
        <AuthButton busy={loading}>{loading ? "Resetting…" : "Reset password"}</AuthButton>
      </form>
    );
  }

  return (
    <form onSubmit={emailFormik.handleSubmit} noValidate>
      {error && <AuthNote tone="error">{error}</AuthNote>}
      <AuthField label="Email" name="email" type="email" autoComplete="email" autoFocus value={emailFormik.values.email} onChange={emailFormik.handleChange} onBlur={emailFormik.handleBlur} error={emailFormik.touched.email && Boolean(emailFormik.errors.email)} helperText={emailFormik.touched.email && emailFormik.errors.email} />
      <AuthButton busy={loading}>{loading ? "Sending…" : "Send reset code"}</AuthButton>
    </form>
  );
}
