/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Box, Typography, Paper, TextField, Button, Card, CardContent,
  Link, CircularProgress, Alert, Divider,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import api, { API_HOST } from '@core/utils/axiosConfig';
import { useAuth } from '@core/contexts/AuthContext';

interface BrandDoc {
  id: number;
  medicines: string;
  doc_path: string | null;
  doc_name: string | null;
}

export default function BrandManagement() {
  const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean);
  const company = parts[0];
  const app = parts[1];
  void company; void app;

  const { user } = useAuth();

  const [brands, setBrands] = useState<BrandDoc[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  // Add new brand state
  const [addBrandName, setAddBrandName] = useState('');
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const addFileRef = useRef<HTMLInputElement>(null);

  // Rename state
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);

  // Re-upload state
  const [reuploadId, setReuploadId] = useState<number | null>(null);
  const [reuploadFile, setReuploadFile] = useState<File | null>(null);
  const [reuploadLoading, setReuploadLoading] = useState(false);
  const reuploadFileRef = useRef<HTMLInputElement>(null);

  const fetchBrands = async () => {
    setListLoading(true);
    setListError('');
    try {
      const resp = await api.post(`${API_HOST}/api/query/v1/base_resource`, {
        operation: 'query',
        resource: 'team_documents',
        fields: ['id', 'medicines', 'doc_path', 'doc_name'],
        filters: { team_id: user?.team_id },
        orderBy: [{ field: 'uploaded_at', direction: 'DESC' }],
      });
      const rows: BrandDoc[] = resp.data?.data ?? resp.data;
      setBrands(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      setListError(e?.message || 'Failed to load brands');
    } finally {
      setListLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchBrands(); }, [user?.team_id]);

  const handleAddBrand = async () => {
    if (!addBrandName.trim()) { setAddError('Brand name is required.'); return; }
    if (!addFile) { setAddError('Please select a call flow document.'); return; }
    setAddError('');
    setAddLoading(true);
    try {
      const formData = new FormData();
      formData.append('resource', 'team_documents');
      formData.append('medicine', addBrandName.trim());
      if (user?.team_id != null) formData.append('team_id', String(user.team_id));
      formData.append('doc_file', addFile);
      await api.post(`${API_HOST}/api/query/v1/documents/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAddBrandName('');
      setAddFile(null);
      if (addFileRef.current) addFileRef.current.value = '';
      await fetchBrands();
    } catch (e: any) {
      setAddError(e?.message || 'Upload failed. Please try again.');
    } finally {
      setAddLoading(false);
    }
  };

  const handleRename = async (brandId: number) => {
    if (!renameValue.trim()) return;
    setRenameLoading(true);
    try {
      await api.post(`${API_HOST}/api/query/v1/documents/update_medicine`, {
        document_id: brandId,
        medicine: renameValue.trim(),
      });
      setRenamingId(null);
      setRenameValue('');
      await fetchBrands();
    } catch (e: any) {
      console.error('Rename failed', e);
    } finally {
      setRenameLoading(false);
    }
  };

  const handleReupload = async (brand: BrandDoc) => {
    if (!reuploadFile) return;
    setReuploadLoading(true);
    try {
      const formData = new FormData();
      formData.append('resource', 'team_documents');
      formData.append('id', String(brand.id));
      formData.append('medicine', brand.medicines);
      formData.append('doc_file', reuploadFile);
      await api.post(`${API_HOST}/api/query/v1/documents/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setReuploadId(null);
      setReuploadFile(null);
      if (reuploadFileRef.current) reuploadFileRef.current.value = '';
      await fetchBrands();
    } catch (e: any) {
      console.error('Re-upload failed', e);
    } finally {
      setReuploadLoading(false);
    }
  };

  const docUrl = (path: string) =>
    path.startsWith('http') ? path : `${API_HOST}/${path.replace(/^\//, '')}`;

  return (
    <Box>
      {/* Add New Brand */}
      <Paper variant="outlined" sx={{ p: 3, mb: 4 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
          Add New Brand
        </Typography>
        <TextField
          label="Brand / Medicine Name"
          value={addBrandName}
          onChange={(e) => { setAddBrandName(e.target.value); setAddError(''); }}
          size="small"
          fullWidth
          sx={{ mb: 2 }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <input
            type="file"
            accept=".pdf,application/pdf"
            ref={addFileRef}
            style={{ display: 'none' }}
            onChange={(e) => { setAddFile(e.target.files?.[0] ?? null); setAddError(''); }}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<AttachFileIcon />}
            onClick={() => addFileRef.current?.click()}
          >
            {addFile ? addFile.name : 'Attach Call Flow PDF'}
          </Button>
        </Box>
        {addError && <Alert severity="error" sx={{ mb: 1 }}>{addError}</Alert>}
        <Button
          variant="contained"
          onClick={handleAddBrand}
          disabled={addLoading}
        >
          {addLoading ? <CircularProgress size={20} /> : 'Add Brand'}
        </Button>
      </Paper>

      <Divider sx={{ mb: 3 }}>
        <Typography variant="body2" color="text.secondary">Existing Brands</Typography>
      </Divider>

      {/* Existing brands list */}
      {listLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : listError ? (
        <Alert severity="error">{listError}</Alert>
      ) : brands.length === 0 ? (
        <Typography color="text.secondary">No brands assigned to your team yet.</Typography>
      ) : (
        brands.map((brand) => (
          <Card key={brand.id} variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              {/* Brand name row */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                {renamingId === brand.id ? (
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextField
                      size="small"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      autoFocus
                    />
                    <Button size="small" variant="contained" onClick={() => handleRename(brand.id)} disabled={renameLoading}>
                      Save
                    </Button>
                    <Button size="small" onClick={() => { setRenamingId(null); setRenameValue(''); }}>
                      Cancel
                    </Button>
                  </Box>
                ) : (
                  <Typography variant="h6">{brand.medicines}</Typography>
                )}
                {brand.doc_path && (
                  <Link href={docUrl(brand.doc_path)} target="_blank" rel="noopener" underline="hover" variant="body2">
                    View Call Flow ↗
                  </Link>
                )}
              </Box>

              {/* Action buttons */}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                {renamingId !== brand.id && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setRenamingId(brand.id);
                      setRenameValue(brand.medicines);
                      setReuploadId(null);
                    }}
                  >
                    Rename
                  </Button>
                )}
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    if (reuploadId === brand.id) {
                      setReuploadId(null);
                      setReuploadFile(null);
                    } else {
                      setReuploadId(brand.id);
                      setReuploadFile(null);
                      setRenamingId(null);
                    }
                  }}
                >
                  Re-upload Doc
                </Button>
              </Box>

              {/* Re-upload inline */}
              {reuploadId === brand.id && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    ref={reuploadFileRef}
                    style={{ display: 'none' }}
                    onChange={(e) => setReuploadFile(e.target.files?.[0] ?? null)}
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<AttachFileIcon />}
                    onClick={() => reuploadFileRef.current?.click()}
                  >
                    {reuploadFile ? reuploadFile.name : 'Select new PDF'}
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={!reuploadFile || reuploadLoading}
                    onClick={() => handleReupload(brand)}
                  >
                    {reuploadLoading ? <CircularProgress size={18} /> : 'Upload'}
                  </Button>
                  <Button size="small" onClick={() => { setReuploadId(null); setReuploadFile(null); }}>
                    Cancel
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </Box>
  );
}
