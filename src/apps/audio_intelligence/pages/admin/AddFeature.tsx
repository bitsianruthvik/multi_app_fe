/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import {
  Box,
  Paper,
  TextField,
  Typography,
  Alert,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { useFormik } from "formik";
import * as yup from "yup";
import { mutate } from "@core/api-builder";

const validationSchema = yup.object({
  feature_name: yup.string().required("Feature name is required"),
  feature_tag: yup.string().required("Feature tag is required"),
  type: yup.string().required("Type is required"),
});

export default function AddFeature() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const formik = useFormik({
    initialValues: {
      feature_name: "",
      feature_tag: "",
      type: "",
    },
    validationSchema: validationSchema,
    onSubmit: async (values) => {
      try {
        const response = await mutate({
          resource: "features",
          fields: ["id", "name", "feature_tag", "type"],
          data: {
            name: values.feature_name,
            feature_tag: values.feature_tag,
            type: values.type,
          },
        });
        if (response) {
          setSuccess("Feature added successfully!");
          setError("");
          formik.resetForm();
        }
      } catch (err: any) {
        setError(err?.message || "Failed to add feature");
        setSuccess("");
      }
    },
  });

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>
        Register Feature
      </Typography>
      <Paper elevation={3} sx={{ p: 3 }}>
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
            id="feature_name"
            name="feature_name"
            label="Feature Name"
            value={formik.values.feature_name}
            onChange={formik.handleChange}
            error={
              formik.touched.feature_name && Boolean(formik.errors.feature_name)
            }
            helperText={
              formik.touched.feature_name && formik.errors.feature_name
            }
          />
          <TextField
            fullWidth
            margin="normal"
            id="feature_tag"
            name="feature_tag"
            label="Feature Tag"
            value={formik.values.feature_tag}
            onChange={formik.handleChange}
            error={
              formik.touched.feature_tag && Boolean(formik.errors.feature_tag)
            }
            helperText={formik.touched.feature_tag && formik.errors.feature_tag}
          />
          <FormControl fullWidth margin="normal">
            <InputLabel id="type-label">Type</InputLabel>
            <Select
              labelId="type-label"
              id="type"
              name="type"
              value={formik.values.type}
              label="Type"
              onChange={formik.handleChange}
              error={formik.touched.type && Boolean(formik.errors.type)}
            >
              <MenuItem value="frontend">Frontend</MenuItem>
              <MenuItem value="backend">Backend</MenuItem>
            </Select>
          </FormControl>
          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            sx={{ mt: 1 }}
          >
            Register Feature
          </Button>
        </form>
      </Paper>
    </Box>
  );
}
