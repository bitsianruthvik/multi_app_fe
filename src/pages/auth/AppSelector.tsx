import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box } from "@mui/material";
import { useAuth } from "@core/contexts/AuthContext";
import { apiGet } from "@core/api";
import { isAdminRole } from "@core/utils/roles";
import { CF } from "@core/brand/ceofactory";
import { useCompanyBrand } from "@core/brand/CompanyBrandContext";
import { inkOn, solidFor } from "@core/brand/companyBrand";

/**
 * /:company/apps — the app list, the first page after sign-in (2026-11-26). The company's own name, logo and colours
 * (admin panel › Branding) on CEOFactory's light layout; without a brand, CEOFactory's navy. Was a dark purple page
 * of its own, a third look between the sign-in and the apps.
 */
interface App {
  id: number;
  name: string;
  slug: string;
  userRoleId?: number;
  uiPermissions?: string[];
}

const btn = {
  border: `1px solid ${CF.line}`, bgcolor: CF.surface, color: CF.text, borderRadius: `${CF.radiusSm}px`, px: 1.75, py: 0.85,
  fontFamily: CF.font, fontSize: 13.5, fontWeight: 500, cursor: "pointer", "&:hover": { borderColor: CF.textMuted },
} as const;

function AppCard({ app, color, onClick }: { app: App; color: string; onClick: () => void }) {
  const tile = solidFor(color);
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        textAlign: "left", p: 3, display: "flex", flexDirection: "column", gap: 1.75, cursor: "pointer",
        bgcolor: CF.surface, border: `1px solid ${CF.line}`, borderRadius: `${CF.radius}px`, fontFamily: CF.font,
        transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease",
        "&:hover, &:focus-visible": { transform: "translateY(-3px)", boxShadow: "0 10px 30px rgb(9 17 51 / 0.10)", borderColor: tile, outline: "none" },
      }}
    >
      <Box sx={{ width: 48, height: 48, borderRadius: "12px", bgcolor: tile, color: inkOn(tile), display: "grid", placeItems: "center", fontSize: 18, fontWeight: 700 }}>
        {app.name.slice(0, 2).toUpperCase()}
      </Box>
      <Box>
        <Box sx={{ fontSize: 16, fontWeight: 700, color: CF.ink, mb: 0.5 }}>{app.name}</Box>
        <Box sx={{ fontSize: 13, color: CF.textMuted }}>Open app →</Box>
      </Box>
    </Box>
  );
}

export default function AppSelector() {
  const { company: companySlug } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, isInitialized, selectApp, logout } = useAuth();
  const { brand } = useCompanyBrand();

  const [apps, setApps] = useState<App[]>([]);
  const companyName = brand?.company?.name || user?.company || companySlug || "";
  const palette = brand && brand.colors.length >= 3 ? brand.colors : [CF.brand, CF.accent, CF.ink];
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

  const primary = solidFor(palette[0]);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: CF.surfaceAlt, fontFamily: CF.font, color: CF.text }}>
      {/* Top bar: the company (its logo when it has one) */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap", px: { xs: 2, md: 4 }, py: 1.75, bgcolor: CF.surface, borderBottom: `1px solid ${CF.line}`, borderTop: `4px solid ${primary}` }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
          {brand?.logo ? (
            <Box component="img" src={brand.logo} alt={`${companyName} logo`} sx={{ height: 36, width: "auto", maxWidth: 180, objectFit: "contain" }} />
          ) : (
            <Box sx={{ width: 34, height: 34, borderRadius: "9px", bgcolor: primary, color: inkOn(primary), display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700 }}>
              {companyName.slice(0, 2).toUpperCase()}
            </Box>
          )}
          <Box sx={{ fontWeight: 700, fontSize: 16, color: CF.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{companyName}</Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
          <Box sx={{ color: CF.textMuted, fontSize: 13.5 }}>
            {user?.name} · <Box component="span" sx={{ textTransform: "capitalize" }}>{user?.role}</Box>
          </Box>
          {(user?.isCompanyAdmin || isAdminRole(user?.role)) && (
            <Box component="button" type="button" onClick={() => navigate(`/${companySlug}/apps/admin`)} data-testid="open-admin" sx={{ ...btn, bgcolor: primary, color: inkOn(primary), borderColor: primary, "&:hover": { filter: "brightness(0.92)" } }}>
              Admin: people, roles, branding
            </Box>
          )}
          <Box component="button" type="button" onClick={() => navigate(`/${companySlug}/apps/password`)} sx={btn}>Change password</Box>
          <Box component="button" type="button" onClick={handleLogout} sx={btn}>Sign out</Box>
        </Box>
      </Box>

      {/* The apps */}
      <Box sx={{ px: { xs: 2, md: 4 }, py: { xs: 4, md: 6 }, maxWidth: 960, mx: "auto" }}>
        <Box component="h1" sx={{ m: 0, mb: 1, fontSize: { xs: 26, md: 32 }, fontWeight: 700, color: CF.ink, letterSpacing: "-0.02em" }}>
          Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
        </Box>
        <Box sx={{ mb: 4, fontSize: 15, color: CF.textMuted }}>Choose an app to continue.</Box>

        {loading ? (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 2 }}>
            {[1, 2, 3].map((i) => <Box key={i} sx={{ height: 150, borderRadius: `${CF.radius}px`, bgcolor: CF.line, opacity: 0.5 }} />)}
          </Box>
        ) : apps.length === 0 ? (
          <Box sx={{ p: 5, textAlign: "center", bgcolor: CF.surface, border: `1px solid ${CF.line}`, borderRadius: `${CF.radius}px`, maxWidth: 520, mx: "auto" }}>
            <Box sx={{ fontSize: 15, lineHeight: 1.7, mb: 2.5 }}>Your admin hasn't given you access to any apps yet. Please contact your administrator.</Box>
            <Box component="button" type="button" onClick={handleLogout} sx={btn}>Sign out</Box>
          </Box>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 2 }}>
            {apps.map((app, i) => (
              <AppCard key={app.id} app={app} color={palette[i % palette.length]} onClick={() => handleAppSelect(app)} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
