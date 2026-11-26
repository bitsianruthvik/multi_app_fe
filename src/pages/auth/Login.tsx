/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { useState, useEffect } from "react";
import { Box } from "@mui/material";
import { useFormik } from "formik";
import * as yup from "yup";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { AuthButton, AuthField, AuthFrame, AuthLink, AuthNote } from "@core/components/auth/AuthFrame";
import api, { API_HOST, buildFullApiUrl } from "@core/utils/axiosConfig";
import { useAuth } from "@core/contexts/AuthContext";
import { isAdminRole } from "@core/utils/roles";
import { usePublicBrand } from "@apps/cf_crm/usePublicBrand";

const validationSchema = yup.object({
  // An email, or a username for someone who has none (the server decides which it is).
  email: yup
    .string()
    .trim()
    .matches(/^([^\s@]+@[^\s@]+\.[^\s@]+|[A-Za-z0-9][A-Za-z0-9._-]{2,39})$/, "Enter your email or username")
    .required("Enter your email or username"),
  password: yup.string().required("Password is required"),
});

export default function Login() {
  const [error, setError] = useState("");
  const { login, isAuthenticated, isInitialized } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { company, app } = useParams<{ company: string; app: string }>();
  const from = location.state?.from?.pathname || "/";
  // cf_crm signs in under its customer's own name, logo and colour
  const brand = usePublicBrand(company, app);
  const accent = brand?.colors.accent || "";
  const isCrm = app === "cf_crm";

  // Redirect already-authenticated users away from login
  useEffect(() => {
    if (isInitialized && isAuthenticated) {
      const parts = window.location.pathname.split("/").filter(Boolean);
      const companySlug = parts[0];
      const appSlug = parts[1];
      // Quick Actions merged into dashboard
      navigate(`/${companySlug}/${appSlug}/dashboard?phase=quick`, {
        replace: true,
      });
    }
  }, [isInitialized, isAuthenticated, navigate]);

  // If the current URL does not include company and app slugs, force the
  // user to pick a company/app first. This prevents posting to `/api/auth/...`
  // which the server treats as a company slug and returns "Company not found: auth".
  useEffect(() => {
    try {
      const parts = window.location.pathname.split("/").filter(Boolean);

      // Expect the path to be /:company/:app/... when scoped. If not present,
      // redirect to the company selection page.
      if (parts.length < 2) {
        navigate("/", { replace: true });
      }
    } catch (e) {
      // ignore in non-browser environments
      // ignore in non-browser environments
    }
  }, [navigate]);

  const formik = useFormik({
    initialValues: {
      email: "",
      password: "",
    },
    validationSchema: validationSchema,
    onSubmit: async (values) => {
      try {
        // POST to the login route under the current company/app context
        // Build absolute URL to ensure company/app slugs are included
        const fullUrl = buildFullApiUrl("/login");
        const parts = window.location.pathname.split("/").filter(Boolean);
        let companySlug = parts[0];
        const appSlug = parts[1];
        let response;
        try {
          response = await api.post(fullUrl, values);
        } catch (err: any) {
          // cf_crm: one network, several companies. The password was right but
          // the login belongs to another company of the same customer: sign in
          // there instead of sending them off to find the other address.
          const wrongCompany = isCrm && err.response?.status === 403 && /not in this company/i.test(err.response?.data?.message || "");
          if (!wrongCompany) throw err;
          const where = await fetch(`${API_HOST}/api/${encodeURIComponent(companySlug)}/cf_crm/network-sign-in`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "omit",
            body: JSON.stringify(values),
          }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
          if (!where?.company) throw err;
          companySlug = where.company;
          response = await api.post(`${API_HOST}/api/${encodeURIComponent(companySlug)}/cf_crm/login`, values);
        }

        if (response.data.token) {

          login(response.data.token, response.data.user, companySlug, appSlug);

          // A password an admin set is changed before anything else.
          if (response.data.user?.mustChangePassword) {
            navigate(`/${companySlug}/apps/password`, { replace: true });
            return;
          }

          const isAdmin = isAdminRole(response.data.user?.role);

          const defaultDashboard = isAdmin
            ? `/${companySlug}/${appSlug}/admin/dashboard`
            : `/${companySlug}/${appSlug}/dashboard?phase=quick`;

          const dashboardRoute =
            response.data.dashboardRoute || defaultDashboard;
          const fromPath = (from || "").toString();
          const cleanedFrom =
            fromPath.includes("quick-actions") ||
            fromPath.includes("brand-detailing-practice")
              ? ""
              : fromPath;
          let target =
            cleanedFrom && cleanedFrom !== "/" ? cleanedFrom : dashboardRoute;
          if (
            !isAdmin &&
            target.includes("/dashboard") &&
            !target.includes("phase=")
          ) {
            const url = new URL(target, window.location.origin);
            url.searchParams.set("phase", "quick");
            target = `${url.pathname}${url.search}`;
          }

          navigate(target, { replace: true });
        }
      } catch (err: any) {
        setError(err.response?.data?.message || "Login failed");
      }
    },
  });

  // The same frame as the company sign-in (AuthFrame, 2026-11-26). No "Register": sign-up is closed, admins add people.
  return (
    <AuthFrame
      title="Sign in"
      subtitle={brand?.appName ? <>to {brand.appName}</> : <>to your workspace <b>{company}</b></>}
      badge={brand?.logo ? <Box component="img" src={brand.logo} alt={brand.appName || "Logo"} sx={{ height: 48, maxWidth: 200, objectFit: "contain", display: "block" }} /> : undefined}
      footer={
        isCrm
          // cf_crm accounts are made and reset by the customer's own owners
          ? "Forgot your password? Ask an owner of your team to reset it."
          : <AuthLink onClick={() => navigate(`/${company}/${app}/forgot-password`)}>Forgot password?</AuthLink>
      }
    >
      <form onSubmit={formik.handleSubmit} noValidate>
        {error && <AuthNote tone="error">{error}</AuthNote>}
        <AuthField
          label={isCrm ? "Email" : "Email or username"}
          id="email"
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
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={formik.values.password}
          onChange={formik.handleChange}
          onBlur={formik.handleBlur}
          error={formik.touched.password && Boolean(formik.errors.password)}
          helperText={formik.touched.password && formik.errors.password}
        />
        <AuthButton busy={formik.isSubmitting} color={accent || undefined}>{formik.isSubmitting ? "Signing in…" : "Sign in"}</AuthButton>
      </form>
    </AuthFrame>
  );
}
