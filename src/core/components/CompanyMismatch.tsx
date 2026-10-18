import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import LockOutlined from '@mui/icons-material/LockOutlined';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@core/contexts/AuthContext';

/**
 * Shown instead of a page when the address names a company the signed-in
 * login does not belong to. The backend refuses that company's data anyway;
 * this stops the screen from rendering one company's login under another
 * company's address (e.g. a Northeast session at /karni/apps).
 */
export function CompanyMismatch({ requested, signedIn }: { requested: string; signedIn: string }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <Box sx={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Paper variant="outlined" sx={{ p: 4, maxWidth: 440, textAlign: 'center' }}>
        <LockOutlined color="action" sx={{ fontSize: 40, mb: 1 }} />
        <Typography variant="h6" gutterBottom>You don't have access to this company</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          You are signed in to <b>{signedIn}</b>, not <b>{requested}</b>. To open {requested}, sign out and
          sign in with a {requested} login.
        </Typography>
        <Stack direction="row" spacing={1.5} justifyContent="center">
          <Button variant="outlined" onClick={() => navigate(`/${signedIn}/apps`, { replace: true })}>
            Go to {signedIn}
          </Button>
          <Button variant="contained" onClick={() => { logout(); navigate(`/${requested}`, { replace: true }); }}>
            Sign out
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
