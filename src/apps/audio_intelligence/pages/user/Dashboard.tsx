/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/rules-of-hooks */
import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Container,
  Skeleton,
  Typography,
} from "@mui/material";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@core/contexts/AuthContext";
import api, { API_HOST } from "@core/utils/axiosConfig";
import { isAdminRole } from "@core/utils/roles";

type Action = {
  id: number;
  name: string;
  description?: string;
  display_order?: number;
};

export default function UserDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (
    isAdminRole(user?.role) &&
    !location.pathname.includes("/admin/")
  ) {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const company = parts[0];
      const app = parts[1];
      return <Navigate to={`/${company}/${app}/admin/dashboard`} replace />;
    }
  }

  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const fetchActions = async () => {
      setLoading(true);
      setError("");
      try {
        const resp = await api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: "query",
          resource: "actions",
          orderBy: [{ field: "display_order", direction: "ASC" }],
        });
        const rows: Action[] = Array.isArray(resp?.data?.data)
          ? resp.data.data
          : Array.isArray(resp?.data)
            ? resp.data
            : [];
        setActions(rows);
      } catch (e: any) {
        setError(e?.message || "Failed to load actions");
      } finally {
        setLoading(false);
      }
    };
    fetchActions();
  }, []);

  const parts = location.pathname.split("/").filter(Boolean);
  const company = parts[0];
  const app = parts[1];

  const handleActionClick = (action: Action) => {
    navigate(`/${company}/${app}/flow/${action.id}`);
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 1, color: "text.primary" }}>
        What would you like to do?
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Select an action to get started.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 2,
        }}
      >
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent>
                  <Skeleton variant="text" width="60%" height={32} />
                  <Skeleton variant="text" width="90%" />
                  <Skeleton variant="text" width="75%" />
                </CardContent>
              </Card>
            ))
          : actions.map((action) => (
              <Card
                key={action.id}
                sx={{
                  transition: "all 160ms ease",
                  "&:hover": {
                    transform: "translateY(-2px)",
                    boxShadow: 6,
                  },
                }}
              >
                <CardActionArea
                  onClick={() => handleActionClick(action)}
                  sx={{ p: 2, height: "100%" }}
                >
                  <Typography variant="h6" fontWeight={600} color="text.primary">
                    {action.name}
                  </Typography>
                  {action.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {action.description}
                    </Typography>
                  )}
                </CardActionArea>
              </Card>
            ))}
      </Box>

      {!loading && !error && actions.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 4 }}>
          No actions configured yet. Ask your admin to add actions.
        </Typography>
      )}
    </Container>
  );
}
