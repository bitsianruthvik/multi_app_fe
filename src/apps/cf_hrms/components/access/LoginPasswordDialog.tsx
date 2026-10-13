import { useEffect, useRef, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from '@mui/material';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { Callout, CapsLabel, ConfirmDialog, FormDialog, Mono } from '@shared/ui';
import { accessApi, type AccessRole, type Login, type PersonWithoutLogin } from '../../api/access';

/**
 * The one dialog that ever holds a password (CF_HRMS_HIRING_SPEC.md §12.7).
 *
 * The server makes a password in two places — creating a login, and resetting
 * one — and answers with it exactly once. This component does both jobs from
 * start to finish, so the password never has to travel:
 *
 *   1. it asks (the Create login form, or "Reset the password of …?"),
 *   2. it makes the call itself,
 *   3. it shows the password, once, until the person presses "I have copied it".
 *
 * WHERE THE PASSWORD LIVES: in `password` below, and nowhere else. It is not
 * passed up to the screen (`onDone` carries no password), not put in a toast, an
 * address, browser storage, the console, an error message or any attribute. It
 * reaches the clipboard only when Copy is pressed. Closing clears it, and the
 * screen unmounts this component, so nothing outlives the dialog.
 */

export type PasswordJob =
  | {
      kind: 'create';
      person: PersonWithoutLogin;
      roles: AccessRole[];
      /** A guess at the email, from the person's name and the company's usual domain. May be ''. */
      suggestedEmail: string;
    }
  | { kind: 'reset'; login: Login };

export function LoginPasswordDialog({
  job,
  onDone,
  onClose,
}: {
  job: PasswordJob;
  /** The call worked: read the list again. Carries no password. */
  onDone: () => void;
  onClose: () => void;
}) {
  const name = job.kind === 'create' ? job.person.name : job.login.name;

  const [password, setPassword] = useState<string | null>(null);
  /** True from the moment a password has been issued — it carries no secret itself. */
  const issued = useRef(false);

  const [email, setEmail] = useState(job.kind === 'create' ? job.suggestedEmail : job.login.email);
  const [roleId, setRoleId] = useState<number | ''>(() => {
    if (job.kind !== 'create') return '';
    return job.roles.find((r) => r.templateKey === 'EMPLOYEE')?.roleId ?? '';
  });

  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const createLogin = async () => {
    if (job.kind !== 'create' || roleId === '') return;
    const res = await accessApi.createLogin({ employeeId: job.person.employeeId, email: email.trim(), roleId });
    issued.current = true;
    if (res.login?.email) setEmail(res.login.email);
    setPassword(res.password);
    onDone();
  };

  const resetPassword = async () => {
    if (job.kind !== 'reset') return;
    const res = await accessApi.resetPassword(job.login.userId);
    issued.current = true;
    setPassword(res.password);
    onDone();
  };

  /** The asking step closes itself after a success; only a real cancel closes the whole thing. */
  const closeAsk = () => {
    if (!issued.current) onClose();
  };

  const copy = async () => {
    if (password == null) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopyFailed(false);
      setCopied(true);
    } catch {
      setCopyFailed(true);
    }
  };

  const finish = () => {
    setPassword(null);
    onClose();
  };

  const emailLooksRight = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <>
      {job.kind === 'create' ? (
        <FormDialog
          open={password == null}
          title={`Create a login for ${name}`}
          subtitle="The password is made for you and shown once, on the next step."
          submitLabel="Create login"
          busyLabel="Creating…"
          submitDisabled={!emailLooksRight || roleId === ''}
          onClose={closeAsk}
          onSubmit={createLogin}
        >
          <TextField
            label="Email"
            size="small"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={!!email.trim() && !emailLooksRight}
            helperText={
              !email.trim()
                ? 'Needed. They sign in with this email.'
                : !emailLooksRight
                  ? 'This does not look like an email address.'
                  : job.suggestedEmail && email === job.suggestedEmail
                    ? 'A suggestion from their name — change it if it is not their email.'
                    : 'They sign in with this email.'
            }
            slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false } }}
          />
          <TextField
            select
            label="Access role"
            size="small"
            required
            value={roleId}
            onChange={(e) => setRoleId(e.target.value === '' ? '' : Number(e.target.value))}
            helperText={roleId === '' ? 'Needed. Choose what this login may do.' : undefined}
          >
            {job.roles.map((r) => (
              <MenuItem key={r.roleId} value={r.roleId}>
                {r.label}
              </MenuItem>
            ))}
          </TextField>
        </FormDialog>
      ) : (
        <ConfirmDialog
          open={password == null}
          title={`Reset the password of ${name}?`}
          body="Their current password stops working at once."
          confirmLabel="Reset password"
          onConfirm={resetPassword}
          onClose={closeAsk}
        />
      )}

      {/* Shown once. Neither the backdrop nor Esc closes it, so it cannot vanish by accident. */}
      <Dialog open={password != null} maxWidth="xs" fullWidth disableEscapeKeyDown onClose={() => undefined}>
        <DialogTitle sx={{ overflowWrap: 'anywhere' }}>Password for {name}</DialogTitle>
        <DialogContent>
          <CapsLabel sx={{ mb: 0.5 }}>Email</CapsLabel>
          <Box sx={{ fontSize: 14, mb: 2, overflowWrap: 'anywhere' }}>{email}</Box>

          <CapsLabel sx={{ mb: 0.5 }}>Password</CapsLabel>
          <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            <Mono
              sx={{
                flex: '1 1 180px',
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                fontSize: 16,
                px: 1.5,
                py: 1,
                background: 'var(--c-surface-2)',
                border: '1px solid var(--c-border)',
                borderRadius: 'var(--r-sm)',
                overflowWrap: 'anywhere',
                userSelect: 'all',
              }}
            >
              {password}
            </Mono>
            <Button
              variant="outlined"
              onClick={copy}
              startIcon={copied ? <CheckRounded /> : <ContentCopyRounded />}
              sx={{ minWidth: 104 }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </Box>
          {copyFailed && (
            <Box role="alert" sx={{ fontSize: 13, color: 'var(--c-danger-600)', mb: 2 }}>
              The browser did not allow copying. Select the password above and copy it by hand.
            </Box>
          )}

          <Callout tone="warning" icon={<WarningAmberRounded />} title="This password is shown only now." sx={{ mb: 0 }}>
            It will not be shown again — copy it and give it to the person. If it is lost, use Reset password.
          </Callout>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={finish}>
            I have copied it
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
