/* eslint-disable @typescript-eslint/no-explicit-any, no-dupe-else-if */
import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Alert,
  CircularProgress,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import api, { API_HOST } from "@core/utils/axiosConfig";

interface Action {
  id: number;
  name: string;
  description: string | null;
  display_order: number;
  created_at?: string;
}

interface EditState {
  name: string;
  description: string;
  display_order: number;
}

export default function Actions() {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New action form state
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDisplayOrder, setNewDisplayOrder] = useState<number>(0);
  const [creating, setCreating] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState>({ name: "", description: "", display_order: 0 });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        operation: "query",
        resource: "actions",
        orderBy: [{ field: "display_order", direction: "ASC" }],
      };
      const url = `${API_HOST}/api/query/v1/base_resource`;
      const resp = await api.post(url, payload);
      let rows: Action[] = [];
      if (resp && resp.data) {
        const d = resp.data;
        if (Array.isArray(d)) rows = d;
        else if (d && Array.isArray(d.data)) rows = d.data;
        else if (d && d.success && Array.isArray(d.data)) rows = d.data;
      }
      setActions(rows);
    } catch (e: any) {
      setError(e?.message || "Failed to load actions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      setError("Name is required");
      return;
    }
    clearMessages();
    setCreating(true);
    try {
      const payload = {
        operation: "insert",
        resource: "actions",
        data: {
          name: newName.trim(),
          description: newDescription.trim() || null,
          display_order: newDisplayOrder,
        },
      };
      const url = `${API_HOST}/api/query/v1/base_resource`;
      await api.post(url, payload);
      setSuccess("Action created successfully");
      setNewName("");
      setNewDescription("");
      setNewDisplayOrder(0);
      load();
    } catch (e: any) {
      setError(e?.message || "Failed to create action");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    clearMessages();
    try {
      const payload = {
        operation: "delete",
        resource: "actions",
        filters: { id },
      };
      const url = `${API_HOST}/api/query/v1/base_resource`;
      await api.post(url, payload);
      setSuccess("Action deleted");
      load();
    } catch (e: any) {
      setError(e?.message || "Failed to delete action");
    }
  };

  const startEdit = (action: Action) => {
    setEditingId(action.id);
    setEditState({
      name: action.name,
      description: action.description ?? "",
      display_order: action.display_order,
    });
    clearMessages();
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleSave = async (id: number) => {
    if (!editState.name.trim()) {
      setError("Name is required");
      return;
    }
    clearMessages();
    setSaving(true);
    try {
      const payload = {
        operation: "update",
        resource: "actions",
        filters: { id },
        data: {
          name: editState.name.trim(),
          description: editState.description.trim() || null,
          display_order: editState.display_order,
        },
      };
      const url = `${API_HOST}/api/query/v1/base_resource`;
      await api.post(url, payload);
      setSuccess("Action updated successfully");
      setEditingId(null);
      load();
    } catch (e: any) {
      setError(e?.message || "Failed to update action");
    } finally {
      setSaving(false);
    }
  };

  // Suppress unused import warning
  void React;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>
        Actions Management
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={clearMessages}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={clearMessages}>
          {success}
        </Alert>
      )}

      {/* Create New Action */}
      <Paper elevation={2} sx={{ p: 3, mb: 3, bgcolor: "background.paper" }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
          Add New Action
        </Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "flex-start" }}>
          <TextField
            label="Name"
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            size="small"
            sx={{ minWidth: 200 }}
          />
          <TextField
            label="Description"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            size="small"
            sx={{ minWidth: 260 }}
          />
          <TextField
            label="Display Order"
            type="number"
            value={newDisplayOrder}
            onChange={(e) => setNewDisplayOrder(Number(e.target.value))}
            size="small"
            sx={{ width: 140 }}
            inputProps={{ min: 0 }}
          />
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={creating}
            startIcon={creating ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {creating ? "Creating…" : "Create Action"}
          </Button>
        </Box>
      </Paper>

      {/* Actions Table */}
      <Paper elevation={2} sx={{ bgcolor: "background.paper" }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Display Order</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={28} />
                </TableCell>
              </TableRow>
            )}
            {!loading && actions.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 4, color: "text.secondary" }}>
                  No actions found. Create one above.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              actions.map((action) =>
                editingId === action.id ? (
                  <TableRow key={action.id}>
                    <TableCell>
                      <TextField
                        value={editState.name}
                        onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
                        size="small"
                        required
                        sx={{ minWidth: 160 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={editState.description}
                        onChange={(e) => setEditState((s) => ({ ...s, description: e.target.value }))}
                        size="small"
                        sx={{ minWidth: 220 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        value={editState.display_order}
                        onChange={(e) =>
                          setEditState((s) => ({ ...s, display_order: Number(e.target.value) }))
                        }
                        size="small"
                        sx={{ width: 100 }}
                        inputProps={{ min: 0 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        color="primary"
                        onClick={() => handleSave(action.id)}
                        disabled={saving}
                        title="Save"
                      >
                        {saving ? <CircularProgress size={18} /> : <SaveIcon />}
                      </IconButton>
                      <IconButton onClick={cancelEdit} title="Cancel" disabled={saving}>
                        <CancelIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={action.id} hover>
                    <TableCell>{action.name}</TableCell>
                    <TableCell sx={{ color: action.description ? "text.primary" : "text.secondary" }}>
                      {action.description || "—"}
                    </TableCell>
                    <TableCell>{action.display_order}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        color="primary"
                        onClick={() => startEdit(action)}
                        title="Edit"
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        color="error"
                        onClick={() => handleDelete(action.id)}
                        title="Delete"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                )
              )}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
