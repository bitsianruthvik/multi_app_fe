/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { useFlow } from '@apps/audio_intelligence/contexts/FlowContext';
import api, { API_HOST } from '@core/utils/axiosConfig';
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Link,
} from '@mui/material';

interface Recording {
  id: number;
  title: string;
  status: string;
  score: number;
  medicine: string;
  created_at: string;
  action_id: number;
  analysis?: string | null;
}

interface CategoryScore {
  label: string;
  score: number;
  max: number;
}

const SECTION_KEY_MAP: Record<string, { label: string; max: number }> = {
  Model_Communication_Compliance: { label: 'Comm', max: 30 },
  Language_Tonality: { label: 'Lang', max: 25 },
  Medical_Scientific_Accuracy: { label: 'Med', max: 25 },
  Closing_Action_Orientation: { label: 'Close', max: 20 },
};

function parseCategoryScores(analysis: string | null | undefined): CategoryScore[] | null {
  if (!analysis) return null;
  try {
    const obj = typeof analysis === 'string' ? JSON.parse(analysis) : analysis;
    if (!obj?.sections) return null;
    const scores: CategoryScore[] = [];
    for (const [key, meta] of Object.entries(SECTION_KEY_MAP)) {
      const sec = (obj.sections as Record<string, any>)[key];
      if (sec == null) continue;
      scores.push({ label: meta.label, score: sec.total ?? sec.score ?? 0, max: meta.max });
    }
    return scores.length === 4 ? scores : null;
  } catch {
    return null;
  }
}

export default function RecordingsInContext() {
  const { actionId, brandName } = useParams<{ actionId: string; brandName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { actionName } = useFlow();

  const decodedBrand = decodeURIComponent(brandName ?? '');
  const parts = location.pathname.split('/').filter(Boolean);
  const company = parts[0];
  const app = parts[1];

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!actionId || !brandName) return;

    const fetchRecordings = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query',
          resource: 'audio_recordings',
          fields: ['id', 'title', 'status', 'score', 'medicine', 'created_at', 'action_id', 'analysis'],
          filters: { action_id: Number(actionId), medicine: decodedBrand },
          orderBy: [{ field: 'created_at', direction: 'DESC' }],
        });
        const rows: Recording[] = resp.data.data ?? resp.data;
        setRecordings(Array.isArray(rows) ? rows : []);
      } catch (err) {
        console.error('RecordingsInContext fetch error:', err);
        setError('Failed to load recordings. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchRecordings();
  }, [actionId, brandName]);

  const scoreChipColor = (score: number): 'success' | 'warning' | 'error' => {
    if (score >= 70) return 'success';
    if (score >= 50) return 'warning';
    return 'error';
  };

  const displayActionName = actionName ?? 'Action';

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      {/* Breadcrumb */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        <Link component={RouterLink} to={`/${company}/${app}/dashboard`} underline="hover">
          Home
        </Link>
        {' > '}
        <Link
          component={RouterLink}
          to={`/${company}/${app}/flow/${actionId}`}
          underline="hover"
        >
          {displayActionName}
        </Link>
        {' > '}
        {decodedBrand}
      </Typography>

      <Typography variant="h5" fontWeight={600} sx={{ mb: 3 }}>
        Recordings — {decodedBrand}
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : recordings.length === 0 ? (
        <Typography color="text.secondary">
          No recordings yet for {decodedBrand} in this action.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {recordings.map((rec) => {
            const categoryScores = parseCategoryScores(rec.analysis);
            return (
              <Card key={rec.id} variant="outlined">
                <CardActionArea
                  onClick={() =>
                    navigate(
                      `/${company}/${app}/flow/${actionId}/${brandName}/recording/${rec.id}`
                    )
                  }
                >
                  <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                      <Box>
                        <Typography fontWeight={600}>{rec.title}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {new Date(rec.created_at).toLocaleDateString()}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Chip
                          label={`Score: ${rec.score}`}
                          color={scoreChipColor(rec.score)}
                          size="small"
                        />
                        <Chip label={rec.status} variant="outlined" size="small" />
                      </Box>
                    </Box>
                    {categoryScores && (
                      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                        {categoryScores.map((cat) => (
                          <Chip
                            key={cat.label}
                            label={`${cat.label} ${cat.score}/${cat.max}`}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.7rem', height: 22 }}
                          />
                        ))}
                      </Box>
                    )}
                  </CardContent>
                </CardActionArea>
              </Card>
            );
          })}
        </Box>
      )}

      <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Link
          component={RouterLink}
          to={`/${company}/${app}/flow/${actionId}/${brandName}/performance`}
          underline="hover"
        >
          View Performance for this Brand
        </Link>
        <Link
          component={RouterLink}
          to={`/${company}/${app}/flow/${actionId}`}
          underline="hover"
        >
          ← Back to {displayActionName}
        </Link>
      </Box>
    </Box>
  );
}
