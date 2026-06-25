import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@core/contexts/AuthContext";
import { apiGet } from "@core/api";
import { isAdminRole } from "@core/utils/roles";

interface App {
  id: number;
  name: string;
  slug: string;
  userRoleId?: number;
  uiPermissions?: string[];
}

const glass = {
  background: "rgba(255,255,255,0.07)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 20,
};

const appCardColors = [
  ["#7c3aed", "#2563eb"],
  ["#0891b2", "#6366f1"],
  ["#059669", "#0ea5e9"],
  ["#d97706", "#ef4444"],
  ["#7c3aed", "#ec4899"],
  ["#2563eb", "#06b6d4"],
];

function AppCard({ app, index, onClick }: { app: App; index: number; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [start, end] = appCardColors[index % appCardColors.length];
  const initial = app.name.slice(0, 2).toUpperCase();

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...glass,
        padding: "28px 24px",
        cursor: "pointer",
        transition: "transform 0.2s, box-shadow 0.2s, border 0.2s",
        transform: hovered ? "translateY(-4px) scale(1.01)" : "none",
        boxShadow: hovered
          ? `0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px ${start}55`
          : "0 4px 24px rgba(0,0,0,0.2)",
        border: `1px solid ${hovered ? `${start}55` : "rgba(255,255,255,0.14)"}`,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: `linear-gradient(135deg, ${start}, ${end})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          fontWeight: 800,
          color: "#fff",
          boxShadow: `0 8px 20px ${start}55`,
          flexShrink: 0,
        }}
      >
        {initial}
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 4, letterSpacing: "-0.01em" }}>
          {app.name}
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>
          /{app.slug}
        </div>
      </div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          color: hovered ? "#fff" : "rgba(255,255,255,0.45)",
          transition: "color 0.2s",
        }}
      >
        Open app
        <span style={{ fontSize: 14, transition: "transform 0.2s", transform: hovered ? "translateX(3px)" : "none", display: "inline-block" }}>→</span>
      </div>
    </div>
  );
}

function EmptyState({ onLogout }: { onLogout: () => void }) {
  return (
    <div
      style={{
        ...glass,
        padding: "52px 36px",
        textAlign: "center",
        maxWidth: 500,
        margin: "0 auto",
        boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
      }}
    >
      <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 15, lineHeight: 1.7, marginBottom: 20 }}>
        Your admin hasn't given you access to any apps yet.
        Contact your administrator.
      </p>
      <button
        onClick={onLogout}
        style={{
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: 8,
          padding: "8px 20px",
          color: "rgba(255,255,255,0.8)",
          fontSize: 14,
          cursor: "pointer",
          fontWeight: 500,
          transition: "all 0.2s",
        }}
      >
        Sign Out
      </button>
    </div>
  );
}

function Particles() {
  const count = 14;
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      {Array.from({ length: count }).map((_, i) => {
        const size = 3 + Math.random() * 5;
        const left = Math.random() * 100;
        const delay = Math.random() * 10;
        const duration = 12 + Math.random() * 10;
        return (
          <div key={i} style={{ position: "absolute", width: size, height: size, borderRadius: "50%", background: i % 2 === 0 ? "rgba(139,92,246,0.4)" : "rgba(37,99,235,0.35)", left: `${left}%`, bottom: "-10px", animation: `floatUp2 ${duration}s ${delay}s infinite linear` }} />
        );
      })}
      <style>{`
        @keyframes floatUp2 { 0%{transform:translateY(0) scale(1);opacity:0} 10%{opacity:1} 90%{opacity:.5} 100%{transform:translateY(-105vh) scale(.5);opacity:0} }
        @keyframes gradientShift2 { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
      `}</style>
    </div>
  );
}

export default function AppSelector() {
  const { company: companySlug } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, isInitialized, selectApp, logout } = useAuth();

  const [apps, setApps] = useState<App[]>([]);
  const companyName = user?.company || companySlug || "";
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      navigate(`/${companySlug}`, { replace: true });
    }
  }, [isInitialized, isAuthenticated, companySlug, navigate]);

  useEffect(() => {
    if (!companySlug || !isInitialized || !isAuthenticated) return;
    apiGet<App[]>(`/api/${companySlug}/apps`)
      .then((data) => {
        setApps(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setApps([]);
      })
      .finally(() => setLoading(false));
  }, [companySlug, isInitialized, isAuthenticated]);

  const handleAppSelect = (app: App) => {
    selectApp(app.slug);
    // Check per-app admin status: prefer uiPermissions from the /apps endpoint,
    // fall back to the user's global role name.
    const isAdmin =
      (Array.isArray(app.uiPermissions) && app.uiPermissions.includes('admin_dashboard')) ||
      isAdminRole(user?.role);
    navigate(
      isAdmin
        ? `/${companySlug}/${app.slug}/admin/dashboard`
        : `/${companySlug}/${app.slug}/dashboard?phase=quick`
    );
  };

  const handleLogout = () => {
    logout();
    navigate(`/${companySlug}`, { replace: true });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%)",
        backgroundSize: "400% 400%",
        animation: "gradientShift2 12s ease infinite",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        position: "relative",
      }}
    >
      <Particles />

      {/* Top bar */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 32px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: "linear-gradient(135deg,#7c3aed,#2563eb)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 800,
              color: "#fff",
            }}
          >
            {companyName.slice(0, 2).toUpperCase()}
          </div>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{companyName}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            {user?.name} · <span style={{ color: "rgba(139,92,246,0.8)", textTransform: "capitalize" }}>{user?.role}</span>
          </span>
          <button
            onClick={handleLogout}
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              padding: "6px 14px",
              color: "rgba(255,255,255,0.6)",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: 500,
              transition: "all 0.2s",
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ position: "relative", zIndex: 1, padding: "52px 32px", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: 40 }}>
          <h1
            style={{
              margin: "0 0 8px",
              fontSize: 32,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.03em",
            }}
          >
            Welcome back, {user?.name?.split(" ")[0]} 👋
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: "rgba(255,255,255,0.4)" }}>
            Select an app to continue
          </p>
        </div>

        {loading ? (
          <div style={{ display: "flex", gap: 16 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ ...glass, height: 160, flex: "1 1 200px", animation: "pulse 1.5s ease-in-out infinite alternate" }} />
            ))}
            <style>{`@keyframes pulse { from{opacity:.4} to{opacity:.8} }`}</style>
          </div>
        ) : apps.length === 0 ? (
          <EmptyState onLogout={handleLogout} />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            {apps.map((app, i) => (
              <AppCard key={app.id} app={app} index={i} onClick={() => handleAppSelect(app)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
