/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, no-dupe-else-if, react-hooks/exhaustive-deps */
import React, { useEffect, useState } from "react";
import {
  Container,
  Typography,
  Paper,
  Button,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Alert,
  Tabs,
  Tab,
  TextField,
  Card,
  Box,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import api, { buildFullApiUrl, API_HOST } from "@core/utils/axiosConfig";
import { apiPost } from "@core/api/client";

export default function CompanyDocuments() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"company" | "team">("company");
  const [teamId, setTeamId] = useState<string | "">("");
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [medicineInput, setMedicineInput] = useState("");
  const [savingMedicine, setSavingMedicine] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      let resource = "company_documents";
      const filters: any = {};
      if (tab === "team") {
        resource = "team_documents";
        if (String(teamId).match(/^\d+$/)) filters.team_id = Number(teamId);
      }
      const payload = { operation: "query", resource, filters };
      const url = `${API_HOST}/api/query/v1/base_resource`;
      const resp = await api.post(url, payload);
      let rows: any[] = [];
      if (resp && resp.data) {
        const d = resp.data;
        if (Array.isArray(d)) rows = d;
        else if (d && Array.isArray(d.data)) rows = d.data;
        else if (d && d.success && Array.isArray(d.data)) rows = d.data;
        else rows = [];
      }
      setDocs(rows || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tab, teamId]);

  const handleFile = async (f: File) => {
    setError(null);
    setSuccess(null);
    try {
      const fd = new FormData();
      fd.append("doc_file", f);
      const resource = tab === "team" ? "team_documents" : "company_documents";
      fd.append("resource", resource);
      if (tab === "team" && String(teamId).match(/^\d+$/))
        fd.append("team_id", String(teamId));
      fd.append("medicine", medicineInput.trim());

      const url = `${API_HOST}/api/query/v1/documents/upload`;
      console.debug("Uploading document to:", url);
      const token = localStorage.getItem("token");
      const resp = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });

      if (!resp.ok) {
        const txt = await resp.text();
        try {
          const parsed = JSON.parse(txt);
          setError(parsed?.error || `Upload failed (status ${resp.status})`);
        } catch (e) {
          const snippet =
            txt && txt.length > 200 ? txt.slice(0, 200) + "..." : txt;
          setError(`Upload failed (status ${resp.status}): ${snippet}`);
        }
        return;
      }

      let json: any = null;
      try {
        json = await resp.json();
      } catch (e) {
        const txt = await resp.text();
        setError(`Upload succeeded but returned invalid JSON: ${txt}`);
        return;
      }

      if (json && json.success) {
        setSuccess("Uploaded successfully");
        load();
      } else {
        setError(
          json?.error ||
            `Upload failed (status ${resp.status})` ||
            "Upload failed"
        );
      }
    } catch (e: any) {
      setError(e?.message || "Upload error");
    }
  };

  const handleDelete = async (id: number) => {
    setError(null);
    try {
      const resource = tab === "team" ? "team_documents" : "company_documents";
      const payload = { operation: "delete", resource, data: { id } };
      const url = `${API_HOST}/api/query/v1/base_resource`;
      const resp = await api.post(url, payload);
      if (resp && resp.data) {
        setSuccess("Deleted");
        load();
      }
    } catch (e: any) {
      setError(e?.message || "Delete failed");
    }
  };

  const handleSaveMedicine = async () => {
    if (!selectedDocId || !medicineInput.trim()) {
      setError("Select a document and enter a medicine name");
      return;
    }

    setSavingMedicine(true);
    setError(null);
    try {
      const resp = await apiPost("/api/query/v1/documents/update_medicine", {
        document_id: selectedDocId,
        medicine: medicineInput.trim(),
      });

      if (resp && resp.success) {
        setSuccess("Medicine tagged successfully");
        setMedicineInput("");
        setSelectedDocId(null);
        setTimeout(() => load(), 500);
      } else {
        setError(resp?.error || "Failed to save medicine tag");
      }
    } catch (e: any) {
      setError(e?.message || "Error saving medicine tag");
    } finally {
      setSavingMedicine(false);
    }
  };

  // Suppress unused import warnings
  void React;
  void buildFullApiUrl;

  return (
    <Container>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>
        Clinical Reference Library
      </Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Company" value="company" />
        <Tab label="Team" value="team" />
      </Tabs>

      <Paper elevation={2} sx={{ p: 3, mb: 2, bgcolor: 'background.paper' }}>
        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}

        {tab === "team" && (
          <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
            <TextField
              label="Filter by team id"
              value={teamId}
              onChange={(e) =>
                setTeamId(String(e.target.value).replace(/\D/g, ""))
              }
              size="small"
              inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
            />
            <Button
              variant="outlined"
              onClick={() => load()}
            >
              Refresh
            </Button>
          </Box>
        )}

        {/* Medicine Tagging Card */}
        <Card sx={{ p: 2, mb: 3 }}>
          <Typography fontWeight={600} fontSize={14} mb={1}>
            Tag Document with Medicine
          </Typography>

          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <TextField
              placeholder="Medicine name"
              size="small"
              fullWidth
              value={medicineInput}
              onChange={(e) => setMedicineInput(e.target.value)}
            />
            <Button
              variant="contained"
              size="small"
              onClick={handleSaveMedicine}
              disabled={savingMedicine || !selectedDocId}
              sx={{ whiteSpace: "nowrap" }}
            >
              {savingMedicine ? "Saving..." : "Save Medicine"}
            </Button>
          </Box>
        </Card>

        <List>
          {loading && <Typography sx={{ p: 2 }}>Loading...</Typography>}
          {docs.map((doc) => (
            <ListItem
              key={doc.id}
              secondaryAction={
                <IconButton edge="end" onClick={() => handleDelete(doc.id)}>
                  <DeleteIcon />
                </IconButton>
              }
              onClick={() => setSelectedDocId(doc.id)}
              selected={selectedDocId === doc.id}
              sx={{ cursor: "pointer", bgcolor: selectedDocId === doc.id ? "action.selected" : "inherit" }}
            >
              <ListItemText
                primary={doc.medicines || doc.medicine || `Doc #${doc.id}`}
                secondary={doc.doc_path || doc.uploaded_at}
              />
            </ListItem>
          ))}
          {!loading && docs.length === 0 && (
            <Typography sx={{ p: 2, color: "text.secondary" }}>No documents uploaded yet.</Typography>
          )}
        </List>

        <input
          id={tab === "team" ? "team-doc-upload" : "company-doc-upload"}
          type="file"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files && e.target.files[0];
            if (f) handleFile(f);
          }}
        />
        <label
          htmlFor={tab === "team" ? "team-doc-upload" : "company-doc-upload"}
        >
          <Button
            component="span"
            variant="contained"
            startIcon={<UploadFileIcon />}
          >
            Upload Document
          </Button>
        </label>
      </Paper>
    </Container>
  );
}
