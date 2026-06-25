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
import { useFormik } from "formik";
import * as yup from "yup";
import { useNavigate, useParams } from "react-router-dom";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import api, { buildFullApiUrl } from "@core/utils/axiosConfig";

const validationSchema = yup.object({
  name: yup.string().min(2, "Name must be at least 2 characters").required("Name is required"),
  email: yup.string().email("Enter a valid email").required("Email is required"),
  password: yup
    .string()
    .min(8, "Password must be at least 8 characters")
    .required("Password is required"),
});

const fieldSx = {
  "& .MuiOutlinedInput-root": {
    bgcolor: "#f9fafb",
    borderRadius: 1.5,
    "& fieldset": { borderColor: "#e5e7eb" },
    "&:hover fieldset": { borderColor: "#d1d5db" },
  },
  "& .MuiOutlinedInput-input::placeholder": { color: "#9ca3af", opacity: 1 },
};

export default function Register() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { company, app } = useParams<{ company: string; app: string }>();

  const formik = useFormik({
    initialValues: { name: "", email: "", password: "" },
    validationSchema,
    onSubmit: async (values) => {
      try {
        setError("");
        const url = buildFullApiUrl("/auth/register");
        await api.post(url, values);
        setSuccess(true);
        setTimeout(() => navigate(`/${company}/${app}/login`), 2000);
      } catch (err: any) {
        setError(err.response?.data?.message || "Registration failed. Please try again.");
      }
    },
  });

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

          <Typography variant="h4" component="h1" sx={{ fontWeight: 800, color: "#1f2937", mb: 1 }}>
            Create Account
          </Typography>
          <Typography variant="body2" sx={{ color: "#6b7280", mb: 3 }}>
            Register to get started
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Account created! Redirecting to login…
            </Alert>
          )}

          <form onSubmit={formik.handleSubmit}>
            <Box sx={{ mb: 2.5 }}>
              <Typography variant="body2" sx={{ textAlign: "left", fontWeight: 600, color: "#374151", mb: 1 }}>
                Full Name
              </Typography>
              <TextField
                fullWidth
                size="medium"
                placeholder="Enter your full name"
                id="name"
                name="name"
                value={formik.values.name}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={formik.touched.name && Boolean(formik.errors.name)}
                helperText={formik.touched.name && formik.errors.name}
                sx={fieldSx}
              />
            </Box>

            <Box sx={{ mb: 2.5 }}>
              <Typography variant="body2" sx={{ textAlign: "left", fontWeight: 600, color: "#374151", mb: 1 }}>
                Email
              </Typography>
              <TextField
                fullWidth
                size="medium"
                placeholder="Enter your email"
                id="email"
                name="email"
                value={formik.values.email}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={formik.touched.email && Boolean(formik.errors.email)}
                helperText={formik.touched.email && formik.errors.email}
                sx={fieldSx}
              />
            </Box>

            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" sx={{ textAlign: "left", fontWeight: 600, color: "#374151", mb: 1 }}>
                Password
              </Typography>
              <TextField
                fullWidth
                size="medium"
                placeholder="Min. 8 characters"
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={formik.values.password}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={formik.touched.password && Boolean(formik.errors.password)}
                helperText={formik.touched.password && formik.errors.password}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" sx={{ color: "#6b7280" }}>
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={fieldSx}
              />
            </Box>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={formik.isSubmitting || success}
              sx={{
                py: 1.5,
                bgcolor: "#2563eb",
                color: "white",
                fontWeight: 700,
                borderRadius: 1.5,
                textTransform: "none",
                fontSize: "1rem",
                "&:hover": { bgcolor: "#1d4ed8" },
                "&:active": { bgcolor: "#1e40af" },
              }}
            >
              Create Account
            </Button>
          </form>

          <Typography variant="body2" sx={{ mt: 2.5, color: "#6b7280" }}>
            Already have an account?{" "}
            <Box
              component="span"
              onClick={() => navigate(`/${company}/${app}/login`)}
              sx={{ color: "#2563eb", fontWeight: 600, cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
            >
              Sign in
            </Box>
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
}
