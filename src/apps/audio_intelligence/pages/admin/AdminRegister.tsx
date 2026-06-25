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
} from "@mui/material";
import { useFormik } from "formik";
import * as yup from "yup";
import { useNavigate, useLocation } from "react-router-dom";
import api from "@core/utils/axiosConfig";
import { useAuth } from "@core/contexts/AuthContext";

const validationSchema = yup.object({
  name: yup.string().required("Name is required"),
  email: yup
    .string()
    .email("Enter a valid email")
    .required("Email is required"),
  password: yup
    .string()
    .min(8, "Password should be of minimum 8 characters length")
    .required("Password is required"),
});

export default function AdminRegister() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/admin";

  // Suppress unused variable warning
  void from;

  const formik = useFormik({
    initialValues: {
      name: "",
      email: "",
      password: "",
    },
    validationSchema: validationSchema,
    onSubmit: async (values: {
      name: string;
      email: string;
      password: string;
    }) => {
      try {
        // values will not contain company; backend will infer company from URL via appContext
        const payload = {
          name: values.name,
          email: values.email,
          password: values.password,
        };
        const response = await api.post("/admin/register", payload);
        if (response.data) {
          setSuccess("Registration successful!");
          setError("");
          const parts = window.location.pathname.split("/").filter(Boolean);
          const companySlug = parts[0];
          const appSlug = parts[1];
          const token = response.data.token;
          const user = response.data.user;
          if (token && user) {
            login(token, user, companySlug, appSlug);
          }
          const dashboardRoute =
            response.data.dashboardRoute ||
            `/${companySlug}/${appSlug}/admin/dashboard`;
          navigate(dashboardRoute, { replace: true });
        }
      } catch (err: any) {
        setError(err.response?.data?.message || "Registration failed");
        console.log(api);
        console.log(err);
        setSuccess("");
      }
    },
  });

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Typography component="h1" variant="h5">
          Admin Registration
        </Typography>
        <Paper
          className="card fade-in"
          elevation={3}
          sx={{ p: 3, mt: 3, width: "100%" }}
        >
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
          <form onSubmit={formik.handleSubmit}>
            <TextField
              fullWidth
              margin="normal"
              id="name"
              name="name"
              label="Name"
              value={formik.values.name}
              onChange={formik.handleChange}
              error={formik.touched.name && Boolean(formik.errors.name)}
              helperText={formik.touched.name && formik.errors.name}
            />
            <TextField
              fullWidth
              margin="normal"
              id="email"
              name="email"
              label="Email Address"
              value={formik.values.email}
              onChange={formik.handleChange}
              error={formik.touched.email && Boolean(formik.errors.email)}
              helperText={formik.touched.email && formik.errors.email}
            />
            <TextField
              fullWidth
              margin="normal"
              id="password"
              name="password"
              label="Password"
              type="password"
              value={formik.values.password}
              onChange={formik.handleChange}
              error={formik.touched.password && Boolean(formik.errors.password)}
              helperText={formik.touched.password && formik.errors.password}
            />
            {/* Company is derived from the URL and not entered manually */}
            <Button
              className="btn"
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
            >
              Register
            </Button>
          </form>
        </Paper>
      </Box>
    </Container>
  );
}
