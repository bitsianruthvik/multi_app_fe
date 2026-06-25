/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import * as yup from "yup";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { API_HOST } from "@core/utils/axiosConfig";
import { useAuth } from "@core/contexts/AuthContext";
import api from "@core/utils/axiosConfig";

// ── shared glass styles ──────────────────────────────────────────────────────
const glass = {
  background: "rgba(255,255,255,0.07)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 24,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  fontSize: 15,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 12,
  color: "#fff",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.2s",
};

const inputFocusStyle: React.CSSProperties = {
  borderColor: "rgba(139,92,246,0.7)",
  background: "rgba(255,255,255,0.1)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "rgba(255,255,255,0.7)",
  marginBottom: 6,
  letterSpacing: "0.03em",
};

const btnPrimary: React.CSSProperties = {
  width: "100%",
  padding: "13px",
  fontSize: 15,
  fontWeight: 700,
  background: "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)",
  color: "#fff",
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
  letterSpacing: "0.02em",
  transition: "opacity 0.2s, transform 0.1s",
};

const errorBubble: React.CSSProperties = {
  background: "rgba(239,68,68,0.15)",
  border: "1px solid rgba(239,68,68,0.3)",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 13,
  color: "#fca5a5",
  marginBottom: 16,
};

const successBubble: React.CSSProperties = {
  background: "rgba(16,185,129,0.12)",
  border: "1px solid rgba(16,185,129,0.3)",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 13,
  color: "#6ee7b7",
  marginBottom: 16,
};

// ── FocusInput helper ────────────────────────────────────────────────────────
function FocusInput({
  label,
  type = "text",
  value,
  onChange,
  onBlur,
  name,
  placeholder,
  error,
  rightSlot,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  name: string;
  placeholder?: string;
  error?: string;
  rightSlot?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          style={{
            ...inputStyle,
            ...(focused ? inputFocusStyle : {}),
            ...(error ? { borderColor: "rgba(239,68,68,0.6)" } : {}),
            paddingRight: rightSlot ? 48 : 16,
          }}
          autoComplete="off"
        />
        {rightSlot && (
          <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "rgba(255,255,255,0.4)" }}>
            {rightSlot}
          </div>
        )}
      </div>
      {error && <p style={{ color: "#fca5a5", fontSize: 12, margin: "4px 0 0", paddingLeft: 2 }}>{error}</p>}
    </div>
  );
}

// ── Tab button ───────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "9px 0",
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        background: active ? "rgba(255,255,255,0.12)" : "transparent",
        border: "none",
        borderRadius: 10,
        color: active ? "#fff" : "rgba(255,255,255,0.45)",
        cursor: "pointer",
        transition: "all 0.2s",
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </button>
  );
}

// ── Animated background particles ───────────────────────────────────────────
function Particles() {
  const count = 18;
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      {Array.from({ length: count }).map((_, i) => {
        const size = 3 + Math.random() * 4;
        const left = Math.random() * 100;
        const delay = Math.random() * 8;
        const duration = 10 + Math.random() * 12;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: size,
              height: size,
              borderRadius: "50%",
              background: i % 3 === 0 ? "rgba(139,92,246,0.5)" : i % 3 === 1 ? "rgba(37,99,235,0.4)" : "rgba(255,255,255,0.2)",
              left: `${left}%`,
              bottom: "-10px",
              animation: `floatUp ${duration}s ${delay}s infinite linear`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0) scale(1); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.6; }
          100% { transform: translateY(-105vh) scale(0.5); opacity: 0; }
        }
        @keyframes gradientShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        input::placeholder { color: rgba(255,255,255,0.25) !important; }
      `}</style>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
type Tab = "login" | "register" | "forgot";

export default function CompanyLanding() {
  const { company: companySlug } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const { login, isAuthenticated, isInitialized, companySlug: authCompany } = useAuth();

  const [tab, setTab] = useState<Tab>("login");
  const [companyName, setCompanyName] = useState<string>("");
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companyNotFound, setCompanyNotFound] = useState(false);

  // Redirect if already authenticated for this company
  useEffect(() => {
    if (isInitialized && isAuthenticated && authCompany === companySlug) {
      navigate(`/${companySlug}/apps`, { replace: true });
    }
  }, [isInitialized, isAuthenticated, authCompany, companySlug, navigate]);

  // Load company name
  useEffect(() => {
    if (!companySlug) return;
    api.get(`${API_HOST}/api/public/companies/${companySlug}`)
      .then((r) => setCompanyName(r.data.name || companySlug))
      .catch(() => setCompanyNotFound(true))
      .finally(() => setCompanyLoading(false));
  }, [companySlug]);

  if (companyLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f0c29", color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  if (companyNotFound) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#0f0c29,#302b63,#24243e)", color: "#fff", textAlign: "center", padding: 24 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🔍</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 8px" }}>Company Not Found</h1>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 15 }}>There's no workspace at <code style={{ background: "rgba(255,255,255,0.1)", padding: "2px 8px", borderRadius: 6 }}>{companySlug}</code>.</p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        background: "linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%)",
        backgroundSize: "400% 400%",
        animation: "gradientShift 12s ease infinite",
        position: "relative",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <Particles />

      <div
        style={{
          ...glass,
          width: "100%",
          maxWidth: 420,
          padding: "36px 32px 32px",
          position: "relative",
          zIndex: 1,
          boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
        }}
      >
        {/* Brand mark */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "linear-gradient(135deg,#7c3aed,#2563eb)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 800,
              color: "#fff",
              marginBottom: 12,
              boxShadow: "0 8px 24px rgba(124,58,237,0.4)",
            }}
          >
            {companyName.slice(0, 2).toUpperCase()}
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
            {companyName}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            Your workspace portal
          </p>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            background: "rgba(0,0,0,0.25)",
            borderRadius: 13,
            padding: 4,
            marginBottom: 24,
          }}
        >
          <TabBtn active={tab === "login"} onClick={() => setTab("login")}>Sign In</TabBtn>
          <TabBtn active={tab === "register"} onClick={() => setTab("register")}>Register</TabBtn>
          <TabBtn active={tab === "forgot"} onClick={() => setTab("forgot")}>Reset Password</TabBtn>
        </div>

        {/* Tab content */}
        {tab === "login" && <LoginTab companySlug={companySlug!} companyName={companyName} onLogin={(token, user) => { login(token, user, companySlug!); navigate(`/${companySlug}/apps`); }} />}
        {tab === "register" && <RegisterTab companySlug={companySlug!} onSuccess={() => setTab("login")} />}
        {tab === "forgot" && <ForgotTab companySlug={companySlug!} />}
      </div>
    </div>
  );
}

// ── Login tab ────────────────────────────────────────────────────────────────
function LoginTab({ companySlug, companyName, onLogin }: { companySlug: string; companyName: string; onLogin: (token: string, user: any) => void }) {
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const formik = useFormik({
    initialValues: { email: "", password: "" },
    validationSchema: yup.object({
      email: yup.string().email("Enter a valid email").required("Email is required"),
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
      {error && <div style={errorBubble}>{error}</div>}
      <FocusInput
        label="Email address"
        name="email"
        type="email"
        placeholder="you@company.com"
        value={formik.values.email}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        error={formik.touched.email ? formik.errors.email : undefined}
      />
      <FocusInput
        label="Password"
        name="password"
        type={showPw ? "text" : "password"}
        placeholder="••••••••"
        value={formik.values.password}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        error={formik.touched.password ? formik.errors.password : undefined}
        rightSlot={
          <span onClick={() => setShowPw(!showPw)} style={{ display: "flex" }}>
            {showPw ? <VisibilityOff sx={{ fontSize: 18 }} /> : <Visibility sx={{ fontSize: 18 }} />}
          </span>
        }
      />
      <button
        type="submit"
        disabled={loading}
        style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }}
      >
        {loading ? "Signing in…" : `Sign in to ${companyName}`}
      </button>
    </form>
  );
}

// ── Register tab ─────────────────────────────────────────────────────────────
function RegisterTab({ companySlug, onSuccess }: { companySlug: string; onSuccess: () => void }) {
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const formik = useFormik({
    initialValues: { name: "", email: "", password: "" },
    validationSchema: yup.object({
      name: yup.string().min(2, "At least 2 characters").required("Full name is required"),
      email: yup.string().email("Enter a valid email").required("Email is required"),
      password: yup.string().min(8, "Minimum 8 characters").required("Password is required"),
    }),
    onSubmit: async (values) => {
      setError("");
      setLoading(true);
      try {
        await api.post(`${API_HOST}/api/${companySlug}/auth/register`, values);
        onSuccess();
      } catch (err: any) {
        setError(err.response?.data?.message || "Registration failed. Please try again.");
      } finally {
        setLoading(false);
      }
    },
  });

  return (
    <form onSubmit={formik.handleSubmit} noValidate>
      {error && <div style={errorBubble}>{error}</div>}
      <FocusInput
        label="Full name"
        name="name"
        placeholder="Jane Smith"
        value={formik.values.name}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        error={formik.touched.name ? formik.errors.name : undefined}
      />
      <FocusInput
        label="Email address"
        name="email"
        type="email"
        placeholder="you@company.com"
        value={formik.values.email}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        error={formik.touched.email ? formik.errors.email : undefined}
      />
      <FocusInput
        label="Password"
        name="password"
        type={showPw ? "text" : "password"}
        placeholder="Min 8 characters"
        value={formik.values.password}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        error={formik.touched.password ? formik.errors.password : undefined}
        rightSlot={
          <span onClick={() => setShowPw(!showPw)} style={{ display: "flex" }}>
            {showPw ? <VisibilityOff sx={{ fontSize: 18 }} /> : <Visibility sx={{ fontSize: 18 }} />}
          </span>
        }
      />
      <button
        type="submit"
        disabled={loading}
        style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }}
      >
        {loading ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

// ── Forgot password tab ───────────────────────────────────────────────────────
function ForgotTab({ companySlug }: { companySlug: string }) {
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
      token: yup.string().required("Reset token is required"),
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
        setError(err.response?.data?.message || "Reset failed. Token may have expired.");
      } finally {
        setLoading(false);
      }
    },
  });

  if (stage === "done") {
    return (
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
        <p style={{ color: "#6ee7b7", fontWeight: 600, fontSize: 15, margin: "0 0 6px" }}>Password reset successfully!</p>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>You can now sign in with your new password.</p>
      </div>
    );
  }

  if (stage === "reset") {
    return (
      <form onSubmit={resetFormik.handleSubmit} noValidate>
        <div style={successBubble}>Reset link sent. Enter the token below to set a new password.</div>
        {error && <div style={errorBubble}>{error}</div>}
        {devToken && (
          <div style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 16, wordBreak: "break-all" }}>
            <strong style={{ color: "rgba(139,92,246,0.9)" }}>Dev token:</strong> {devToken}
          </div>
        )}
        <FocusInput label="Reset token" name="token" placeholder="Paste token here" value={resetFormik.values.token} onChange={resetFormik.handleChange} onBlur={resetFormik.handleBlur} error={resetFormik.touched.token ? resetFormik.errors.token : undefined} />
        <FocusInput label="New password" name="password" type="password" placeholder="Min 8 characters" value={resetFormik.values.password} onChange={resetFormik.handleChange} onBlur={resetFormik.handleBlur} error={resetFormik.touched.password ? resetFormik.errors.password : undefined} />
        <FocusInput label="Confirm password" name="confirm" type="password" placeholder="Repeat password" value={resetFormik.values.confirm} onChange={resetFormik.handleChange} onBlur={resetFormik.handleBlur} error={resetFormik.touched.confirm ? resetFormik.errors.confirm : undefined} />
        <button type="submit" disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }}>
          {loading ? "Resetting…" : "Reset password"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={emailFormik.handleSubmit} noValidate>
      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, margin: "0 0 20px", lineHeight: 1.6 }}>
        Enter your email and we'll send you a link to reset your password.
      </p>
      {error && <div style={errorBubble}>{error}</div>}
      <FocusInput label="Email address" name="email" type="email" placeholder="you@company.com" value={emailFormik.values.email} onChange={emailFormik.handleChange} onBlur={emailFormik.handleBlur} error={emailFormik.touched.email ? emailFormik.errors.email : undefined} />
      <button type="submit" disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }}>
        {loading ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
