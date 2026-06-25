/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  Alert,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Chip,
} from "@mui/material";
import { useFormik } from "formik";
import * as yup from "yup";
import { mutate, query } from "@core/api-builder";

interface Role {
  id: number;
  name: string;
}

interface Capability {
  capability_id: number;
  name: string;
}

const validationSchema = yup.object({
  role_id: yup.number().required("Role is required"),
  capabilities: yup.array().min(1, "Select at least one capability"),
});

export default function RoleMapping() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [selectedCapabilities, setSelectedCapabilities] = useState<number[]>(
    []
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [rolesResponse, capabilitiesResponse] = await Promise.all([
          query({ resource: "roles", fields: ["id", "name", "role_tag"] }),
          query({ resource: "features_capability", fields: ["capability_id", "name"] }),
        ]);
        setRoles(rolesResponse.data || []);
        setCapabilities(capabilitiesResponse.data || []);
      } catch (err: any) {
        console.error(err);
        setError("Failed to load data fe");
      }
    };
    fetchData();
  }, []);

  const formik = useFormik({
    initialValues: {
      role_id: "" as string | number,
      capabilities: [] as number[],
    },
    validationSchema: validationSchema,
    onSubmit: async (values: {
      role_id: string | number;
      capabilities: number[];
    }) => {
      try {
        const role_id =
          roles.find((r) => r.name === values.role_id)?.id ??
          (typeof values.role_id === "number" ? values.role_id : undefined);
        for (const capability_id of selectedCapabilities) {
          await mutate({
            resource: "role_capability",
            fields: ["id", "role_id", "capability_id"],
            data: { role_id, capability_id },
          });
        }

        setSuccess("Role mapping updated successfully!");
        setError("");
        formik.resetForm();
        setSelectedCapabilities([]);
      } catch (err: any) {
        setError(err?.message || "Failed to update role mapping");
        setSuccess("");
      }
    },
  });

  const handleCapabilityToggle = (capabilityId: number) => {
    setSelectedCapabilities((prev) => {
      const isSelected = prev.includes(capabilityId);
      if (isSelected) {
        return prev.filter((id) => id !== capabilityId);
      } else {
        return [...prev, capabilityId];
      }
    });
    formik.setFieldValue("capabilities", selectedCapabilities);
  };

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>
        Permission Assignment
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
            fullWidth
            error={formik.touched.role_id && Boolean(formik.errors.role_id)}
            sx={{ mb: 3 }}
          >
            <InputLabel>Select Role</InputLabel>
            <Select
              name="role_id"
              value={formik.values.role_id}
              onChange={formik.handleChange}
              label="Select Role"
            >
              {roles.length === 0 && (
                <MenuItem disabled value="">
                  No roles available
                </MenuItem>
              )}
              {roles.map((role) => (
                <MenuItem key={role.id} value={role.name}>
                  {role.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Typography variant="subtitle1" gutterBottom>
            Select Capabilities
          </Typography>
          <Box sx={{ mb: 3 }}>
            <Grid container spacing={1}>
              {capabilities.length === 0 && (
                <Typography variant="body2" sx={{ pl: 1 }}>
                  No capabilities available
                </Typography>
              )}
              {capabilities.map((capability) => (
                <Grid
                  key={capability.capability_id}
                  sx={{ display: "inline-block", m: 0.5 }}
                >
                  <Chip
                    label={capability.name || `Capability ${capability.capability_id}`}
                    onClick={() => handleCapabilityToggle(capability.capability_id)}
                    color={
                      selectedCapabilities.includes(capability.capability_id)
                        ? "primary"
                        : "default"
                    }
                  />
                </Grid>
              ))}
            </Grid>
          </Box>

          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            sx={{ mt: 1 }}
            disabled={selectedCapabilities.length === 0}
          >
            Save Permission Assignment
          </Button>
        </form>
      </Paper>
    </Box>
  );
}
