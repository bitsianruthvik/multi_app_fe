/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Container, Typography, Paper, ToggleButtonGroup, ToggleButton,
  Alert, Snackbar,
} from '@mui/material';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';
import { useThemePreference, type ThemePreference } from '@core/contexts/ThemeContext';
import api, { API_HOST } from '@core/utils/axiosConfig';

export default function SettingsPage() {
  const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean);
  const company = parts[0];
  const app = parts[1];

  const { preference, setPreference } = useThemePreference();
  const [toast, setToast] = useState<string | null>(null);

  const handleThemeChange = async (_: React.MouseEvent<HTMLElement>, value: ThemePreference | null) => {
    if (!value) return; // don't allow deselecting all
    setPreference(value); // instant UI update
    try {
      await api.put(`${API_HOST}/api/${company}/${app}/user/preferences`, {
        preferences: { theme: value },
      });
      setToast('Appearance saved');
    } catch (e: any) {
      setToast(e?.response?.data?.message || 'Failed to save preference');
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        Settings
      </Typography>

      {/* ── Appearance ── */}
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
          Appearance
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          Choose how the interface looks. "System" follows your device preference.
        </Typography>

        <ToggleButtonGroup
          value={preference}
          exclusive
          onChange={handleThemeChange}
          aria-label="theme preference"
          sx={{ gap: 1, flexWrap: 'wrap' }}
        >
          <ToggleButton value="light" aria-label="light mode" sx={{ gap: 1, px: 2.5 }}>
            <LightModeIcon fontSize="small" />
            <Typography variant="body2" fontWeight={500}>Light</Typography>
          </ToggleButton>
          <ToggleButton value="dark" aria-label="dark mode" sx={{ gap: 1, px: 2.5 }}>
            <DarkModeIcon fontSize="small" />
            <Typography variant="body2" fontWeight={500}>Dark</Typography>
          </ToggleButton>
          <ToggleButton value="system" aria-label="system preference" sx={{ gap: 1, px: 2.5 }}>
            <SettingsBrightnessIcon fontSize="small" />
            <Typography variant="body2" fontWeight={500}>System</Typography>
          </ToggleButton>
        </ToggleButtonGroup>
      </Paper>

      <Snackbar
        open={!!toast}
        autoHideDuration={2500}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setToast(null)} sx={{ width: '100%' }}>
          {toast}
        </Alert>
      </Snackbar>
    </Container>
  );
}
