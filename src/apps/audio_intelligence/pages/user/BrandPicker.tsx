/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { useFlow } from '@apps/audio_intelligence/contexts/FlowContext';
import { useAuth } from '@core/contexts/AuthContext';
import api, { API_HOST } from '@core/utils/axiosConfig';
import AudioRecorder from '@apps/audio_intelligence/components/AudioRecorder';
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Typography,
  CircularProgress,
  Link,
  Button,
  Divider,
  Paper,
  Collapse,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  FormHelperText,
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';

export default function BrandPicker() {
  const { actionId } = useParams<{ actionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { actionName, setActionName } = useFlow();
  const { user } = useAuth();

  const parts = location.pathname.split('/').filter(Boolean);
  const company = parts[0];
  const app = parts[1];

  const [teamMedicines, setTeamMedicines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecorder, setShowRecorder] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState('');
  const [brandError, setBrandError] = useState('');

  useEffect(() => {
    if (!actionId) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [actionResp, docsResp] = await Promise.all([
          api.post(`${API_HOST}/api/query/v1/base_resource`, {
            operation: 'query',
            resource: 'actions',
            filters: { id: Number(actionId) },
          }),
          api.post(`${API_HOST}/api/query/v1/base_resource`, {
            operation: 'query',
            resource: 'team_documents',
            fields: ['medicines'],
            filters: { team_id: user?.team_id },
          }),
        ]);

        const actionRows = actionResp.data.data ?? actionResp.data;
        setActionName(actionRows[0]?.name ?? '');

        const docRows: any[] = docsResp.data.data ?? docsResp.data;
        const medicines = [
          ...new Set(
            docRows.map((r: any) => r.medicines?.trim()).filter(Boolean)
          ),
        ] as string[];
        setTeamMedicines(medicines);
      } catch (err) {
        console.error('BrandPicker fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [actionId, user?.team_id]);

  const handleRecordingComplete = (response: any) => {
    const newId = response?.id || response?.data?.[0]?.id || response?.data?.id;
    const brand = selectedBrand.trim();
    if (newId && brand) {
      navigate(`/${company}/${app}/flow/${actionId}/${encodeURIComponent(brand)}/recording/${newId}`);
    } else if (newId) {
      navigate(`/${company}/${app}/flow/${actionId}`);
    }
  };

  const handleStartRecording = () => {
    if (!selectedBrand) {
      setBrandError('Please select a medicine / brand first.');
      return;
    }
    setBrandError('');
    setShowRecorder(true);
  };

  const title = actionName || 'Select Brand';

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      {/* Breadcrumb */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        <Link component={RouterLink} to={`/${company}/${app}/dashboard`} underline="hover">
          Home
        </Link>
        {' > '}
        {title}
      </Typography>

      <Typography variant="h5" fontWeight={600} sx={{ mb: 3 }}>
        {title}
      </Typography>

      {/* ── New Recording ── */}
      <Paper variant="outlined" sx={{ p: 3, mb: 4 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
          New Recording
        </Typography>

        {loading ? (
          <CircularProgress size={24} />
        ) : teamMedicines.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No medicines have been assigned to your team yet. Ask your manager to upload documents for your team.
          </Typography>
        ) : (
          <>
            <FormControl fullWidth size="small" error={!!brandError} sx={{ mb: 2 }}>
              <InputLabel>Medicine / Brand name</InputLabel>
              <Select
                value={selectedBrand}
                label="Medicine / Brand name"
                onChange={(e) => { setSelectedBrand(e.target.value); setBrandError(''); setShowRecorder(false); }}
              >
                {teamMedicines.map((m) => (
                  <MenuItem key={m} value={m}>{m}</MenuItem>
                ))}
              </Select>
              {brandError && <FormHelperText>{brandError}</FormHelperText>}
            </FormControl>

            {!showRecorder && (
              <Button
                variant="contained"
                startIcon={<MicIcon />}
                onClick={handleStartRecording}
              >
                Start Recording
              </Button>
            )}

            <Collapse in={showRecorder}>
              {showRecorder && (
                <Box sx={{ mt: 2 }}>
                  <AudioRecorder
                    defaultTitle={selectedBrand}
                    actionId={actionId}
                    flowBrandName={selectedBrand}
                    onRecordingComplete={handleRecordingComplete}
                  />
                </Box>
              )}
            </Collapse>
          </>
        )}
      </Paper>

      <Divider sx={{ mb: 3 }}>
        <Typography variant="body2" color="text.secondary">
          or review existing recordings
        </Typography>
      </Divider>

      {/* ── Existing Brands ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <VideoLibraryIcon fontSize="small" color="action" />
        <Typography variant="subtitle1" fontWeight={600}>
          Past Recordings by Brand
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : teamMedicines.length === 0 ? (
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          No medicines assigned to your team yet.
        </Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 2,
          }}
        >
          {teamMedicines.map((brand) => (
            <Card key={brand} variant="outlined">
              <CardActionArea
                onClick={() =>
                  navigate(
                    `/${company}/${app}/flow/${actionId}/${encodeURIComponent(brand)}`
                  )
                }
              >
                <CardContent>
                  <Typography variant="h6">{brand}</Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      )}

      <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Link component={RouterLink} to={`/${company}/${app}/dashboard`} underline="hover">
          ← Back to Home
        </Link>
        <Link
          component={RouterLink}
          to={`/${company}/${app}/flow/${actionId}/performance`}
          underline="hover"
          color="text.secondary"
        >
          View Performance for this Action
        </Link>
      </Box>
    </Box>
  );
}
