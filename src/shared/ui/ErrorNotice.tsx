import { Alert, Box, Button } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import { errorMessage, errorProblems } from './errorMessage';

/**
 * A failed request, in words — the backend's own message, plus every problem it
 * itemised.
 *
 * A validating backend that returns four reasons a save was refused should show
 * four reasons, not the first one and not "Bad Request". Renders nothing when
 * there is no error, so it can sit unconditionally at the top of a form.
 */
export function ErrorNotice({
  error,
  fallback,
  onRetry,
  sx,
}: {
  error: unknown;
  fallback?: string;
  onRetry?: () => void;
  sx?: SxProps<Theme>;
}) {
  if (!error) return null;
  const problems = errorProblems(error);
  return (
    <Alert
      severity="error"
      sx={{ mb: 2, ...(sx as object) }}
      action={
        onRetry ? (
          <Button color="inherit" size="small" onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    >
      <Box>{errorMessage(error, fallback)}</Box>
      {problems.length > 0 && (
        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </Box>
      )}
    </Alert>
  );
}
