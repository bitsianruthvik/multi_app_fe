/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Box, Container, Typography, TextField, Button, Chip,
  Paper, Divider, Alert, CircularProgress,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import LockIcon from '@mui/icons-material/Lock';
import api, { API_HOST } from '@core/utils/axiosConfig';
import { useAuth } from '@core/contexts/AuthContext';

interface UserProfile {
  id: number;
  name: string;
  email: string;
  role: string | null;
  team: string | null;
}

export default function ProfilePage() {
  const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean);
  const company = parts[0];
  const app = parts[1];

  const { user: authUser } = useAuth();

  // ── Profile state ────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Password state ────────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Fetch profile ─────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const resp = await api.get(`${API_HOST}/api/${company}/${app}/user/me`);
        const data: UserProfile = resp.data;
        setProfile(data);
        setName(data.name ?? '');
        setEmail(data.email ?? '');
      } catch (e: any) {
        setProfileMsg({ type: 'error', text: e?.message || 'Failed to load profile' });
      } finally {
        setLoadingProfile(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save profile ──────────────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    setProfileMsg(null);
    setProfileSaving(true);
    try {
      await api.put(`${API_HOST}/api/${company}/${app}/user/profile`, { name, email });
      setProfileMsg({ type: 'success', text: 'Profile updated successfully.' });
      setProfile((p) => p ? { ...p, name, email } : p);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Update failed';
      setProfileMsg({ type: 'error', text: msg });
    } finally {
      setProfileSaving(false);
    }
  };

  // ── Change password ───────────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    setPwMsg(null);
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (newPassword.length < 8) {
      setPwMsg({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    setPwSaving(true);
    try {
      await api.put(`${API_HOST}/api/${company}/${app}/user/change-password`, {
        currentPassword,
        newPassword,
      });
      setPwMsg({ type: 'success', text: 'Password changed successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Password change failed';
      setPwMsg({ type: 'error', text: msg });
    } finally {
      setPwSaving(false);
    }
  };

  if (loadingProfile) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        My Profile
      </Typography>

      {/* ── Profile info ── */}
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
          <PersonIcon fontSize="small" color="primary" />
          <Typography variant="subtitle1" fontWeight={600}>Personal Information</Typography>
        </Box>

        {/* Read-only role / team chips */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2.5, flexWrap: 'wrap' }}>
          {(profile?.role ?? authUser?.role) && (
            <Chip
              label={(profile?.role ?? authUser?.role ?? '').replace('_', ' ')}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
          {(profile?.team ?? authUser?.team) && (
            <Chip
              label={profile?.team ?? authUser?.team ?? ''}
              size="small"
              variant="outlined"
            />
          )}
        </Box>

        <TextField
          label="Display Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
        />
        <TextField
          label="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
          size="small"
          type="email"
          sx={{ mb: 2 }}
        />

        {profileMsg && (
          <Alert severity={profileMsg.type} sx={{ mb: 2 }}>{profileMsg.text}</Alert>
        )}

        <Button
          variant="contained"
          onClick={handleSaveProfile}
          disabled={profileSaving || (!name.trim() && !email.trim())}
        >
          {profileSaving ? <CircularProgress size={20} /> : 'Save Changes'}
        </Button>
      </Paper>

      <Divider sx={{ mb: 3 }} />

      {/* ── Change password ── */}
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
          <LockIcon fontSize="small" color="primary" />
          <Typography variant="subtitle1" fontWeight={600}>Change Password</Typography>
        </Box>

        <TextField
          label="Current Password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          fullWidth
          size="small"
          type="password"
          autoComplete="current-password"
          sx={{ mb: 2 }}
        />
        <TextField
          label="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          fullWidth
          size="small"
          type="password"
          autoComplete="new-password"
          sx={{ mb: 2 }}
        />
        <TextField
          label="Confirm New Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          fullWidth
          size="small"
          type="password"
          autoComplete="new-password"
          sx={{ mb: 2 }}
        />

        {pwMsg && (
          <Alert severity={pwMsg.type} sx={{ mb: 2 }}>{pwMsg.text}</Alert>
        )}

        <Button
          variant="contained"
          onClick={handleChangePassword}
          disabled={pwSaving || !currentPassword || !newPassword || !confirmPassword}
        >
          {pwSaving ? <CircularProgress size={20} /> : 'Change Password'}
        </Button>
      </Paper>
    </Container>
  );
}
