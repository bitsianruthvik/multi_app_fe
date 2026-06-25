/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Alert,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@mui/material";
import api from "@core/utils/axiosConfig";

interface ErrorLog {
  id: number;
  level?: string;
  message?: string;
  created_at?: string;
  context?: string;
}

export default function ErrorLogs() {
  const [logs, setLogs] = useState<ErrorLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // "admin/error-logs" (no leading slash) is relative to the dynamic baseURL
    // → resolves to /api/:company/:app/admin/error-logs
    api.get<ErrorLog[]>("admin/error-logs")
      .then((res) => {
        const list: ErrorLog[] = Array.isArray(res.data)
          ? res.data
          : [];
        setLogs(list);
      })
      .catch(() => {
        setError("Failed to load error logs");
        setLogs([]);
      });
  }, []);

  return (
    <Box sx={{ maxWidth: 1100, mx: "auto" }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3, color: "text.primary" }}>
        System Diagnostic Log
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper elevation={2} sx={{ overflow: "hidden" }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Level</TableCell>
              <TableCell>Message</TableCell>
              <TableCell>Context</TableCell>
              <TableCell>Timestamp</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs === null && (
              <TableRow>
                <TableCell colSpan={5} sx={{ py: 3, textAlign: "center", color: "text.secondary" }}>
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {logs?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} sx={{ py: 3, textAlign: "center", color: "text.secondary" }}>
                  No error logs found
                </TableCell>
              </TableRow>
            )}
            {logs?.map((log) => (
              <TableRow key={log.id} sx={{ "&:hover": { bgcolor: "grey.50" } }}>
                <TableCell>{log.id}</TableCell>
                <TableCell sx={{ color: log.level === "error" ? "error.main" : "text.primary" }}>
                  {log.level ?? "—"}
                </TableCell>
                <TableCell>{log.message ?? "—"}</TableCell>
                <TableCell sx={{ color: "text.secondary", fontSize: 12 }}>{log.context ?? "—"}</TableCell>
                <TableCell sx={{ color: "text.secondary", fontSize: 12 }}>{log.created_at ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
