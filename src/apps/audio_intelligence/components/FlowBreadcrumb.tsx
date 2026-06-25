import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Breadcrumbs, Link, Typography } from '@mui/material';
import { useFlow } from '@apps/audio_intelligence/contexts/FlowContext';

interface FlowBreadcrumbProps {
  recordingTitle?: string;
  showAnalysis?: boolean;
  showPerformance?: boolean;
}

export default function FlowBreadcrumb({
  recordingTitle,
  showAnalysis,
  showPerformance,
}: FlowBreadcrumbProps) {
  const { actionId, brandName, recordingId, actionName } = useFlow();
  const location = useLocation();

  // Extract company and app from pathname
  const parts = location.pathname.split('/').filter(Boolean);
  const company = parts[0];
  const app = parts[1];

  // Build breadcrumb segments
  interface Segment {
    label: string;
    path?: string;
    isActive: boolean;
  }

  const segments: Segment[] = [];

  // 1. Home (always shown)
  segments.push({
    label: 'Home',
    path: `/${company}/${app}/dashboard`,
    isActive: false,
  });

  // 2. Action name (shown if actionId is present)
  if (actionId && actionName) {
    segments.push({
      label: actionName,
      path: `/${company}/${app}/flow/${actionId}`,
      isActive: false,
    });
  }

  // 3. Brand name (shown if brandName is present)
  if (brandName && actionId) {
    segments.push({
      label: brandName,
      path: `/${company}/${app}/flow/${actionId}/${encodeURIComponent(brandName)}`,
      isActive: false,
    });
  }

  // 4. Recording title (shown if provided)
  if (recordingTitle && recordingId && brandName && actionId) {
    segments.push({
      label: recordingTitle,
      path: `/${company}/${app}/flow/${actionId}/${encodeURIComponent(brandName)}/recording/${recordingId}`,
      isActive: false,
    });
  }

  // 5. Analysis or Performance (final segment, shown if applicable)
  if (showAnalysis) {
    segments.push({
      label: 'Analysis',
      isActive: true,
    });
  } else if (showPerformance) {
    segments.push({
      label: 'Performance',
      isActive: true,
    });
  } else if (recordingTitle && recordingId) {
    // If recordingTitle exists and no analysis/performance flag, mark it as active
    segments[segments.length - 1].isActive = true;
  } else if (brandName && actionId && !recordingTitle) {
    // If brandName exists and no recording/analysis/performance, mark it as active
    segments[segments.length - 1].isActive = true;
  } else if (actionName && actionId && !brandName) {
    // If actionName exists and no brand/recording, mark it as active
    segments[segments.length - 1].isActive = true;
  }

  return (
    <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
      {segments.map((segment, index) => (
        segment.isActive ? (
          <Typography key={index} color="text.primary">
            {segment.label}
          </Typography>
        ) : (
          <Link
            key={index}
            component={RouterLink}
            to={segment.path || '#'}
            color="inherit"
            underline="hover"
          >
            {segment.label}
          </Link>
        )
      ))}
    </Breadcrumbs>
  );
}
