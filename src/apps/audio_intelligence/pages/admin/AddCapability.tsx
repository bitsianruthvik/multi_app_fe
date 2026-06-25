/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  Alert,
  Button,
  FormControl,
  FormLabel,
  FormGroup,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import { useFormik } from "formik";
import * as yup from "yup";
import api, { buildPublicApiUrl } from "@core/utils/axiosConfig";
import { mutate } from "@core/api-builder";

interface Feature {
  id: number;
  feature_name: string;
  type: string;
}

const validationSchema = yup.object({
  features_json: yup.array().min(1, "Select at least one feature"),
});

export default function AddCapability() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [features, setFeatures] = useState<Feature[]>([]);

  // Fetch available features when component mounts
  useEffect(() => {
    const fetchFeatures = async () => {
      try {
        // load features via admin GET; backend will expose /features (added server-side)
        const response = await api.get<Feature[]>(buildPublicApiUrl("/features"));
        setFeatures(response.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || `Failed to load features `);
        console.error(err);
      }
    };
    fetchFeatures();
  }, []);

  const formik = useFormik({
    initialValues: {
      features_json: [] as number[],
    },
    validationSchema: validationSchema,
    onSubmit: async (values) => {
      try {
        // Group all selected features under a single capability_id (timestamp-based, backend may regenerate).
        const capability_id = Date.now();
        for (const feature_id of values.features_json) {
          await mutate({
            resource: "features_capability",
            fields: ["id", "feature_id", "capability_id"],
            data: { feature_id, capability_id },
          });
        }
        setSuccess("Capability added successfully!");
        setError("");
        formik.resetForm();
      } catch (err: any) {
        setError(err?.message || "Failed to add capability");
        setSuccess("");
      }
    },
  });

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>
        Define Permission Group
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
          <FormControl
            component="fieldset"
            error={
              formik.touched.features_json &&
              Boolean(formik.errors.features_json)
            }
            sx={{ width: "100%" }}
          >
            <FormLabel component="legend">Select Features</FormLabel>
            <FormGroup>
              {features.length === 0 && (
                <Typography variant="body2" sx={{ mb: 1 }}>
                  No features available
                </Typography>
              )}
              {features.map((feature: any) => (
                <FormControlLabel
                  key={feature.id}
                  control={
                    <Checkbox
                      checked={formik.values.features_json.includes(feature.id)}
                      onChange={(e) => {
                        const newFeatures = e.target.checked
                          ? [...formik.values.features_json, feature.id]
                          : formik.values.features_json.filter(
                              (id) => id !== feature.id
                            );
                        formik.setFieldValue("features_json", newFeatures);
                      }}
                    />
                  }
                  label={`${feature.feature_name} (${feature.type})`}
                />
              ))}
            </FormGroup>
          </FormControl>
          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            sx={{ mt: 1 }}
          >
            Create Permission Group
          </Button>
        </form>
      </Paper>
    </Box>
  );
}
