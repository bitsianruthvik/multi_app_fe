import { useState, type ReactNode } from 'react';
import { Box, IconButton, InputAdornment, TextField, type TextFieldProps } from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { CF } from '@core/brand/ceofactory';

/**
 * The ONE frame of every page around signing in (2026-11-26): company sign-in (/:company), app sign-in
 * (/:company/:app/login), forgot / reset password, and choosing your own password. Before, the company page was dark
 * purple and the app page white, so a person moved between two different-looking sign-ins (user: "switching between a
 * white and a blue login page"). CEOFactory's navy and white, from the website. Nothing here names a company beyond
 * the word in the address (see core/brand/ceofactory.ts).
 */
export function AuthFrame({ title, subtitle, children, footer, badge }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; badge?: ReactNode }) {
  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
        bgcolor: CF.ink,
        backgroundImage: `linear-gradient(120deg, ${CF.ink} 35%, ${CF.brand})`,
        fontFamily: CF.font,
        color: CF.text,
      }}
    >
      {/* Left (top on phones): who runs this */}
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', px: { xs: 3, md: 8 }, pt: { xs: 5, md: 0 }, pb: { xs: 3, md: 0 } }}>
        <Box component="img" src={CF.logoWhite} alt="CEOFactory" sx={{ width: { xs: 150, md: 210 }, height: 'auto', display: 'block' }} />
        <Box sx={{ display: { xs: 'none', md: 'block' }, mt: 4, maxWidth: 420 }}>
          <Box component="p" sx={{ m: 0, fontSize: 30, lineHeight: 1.2, fontWeight: 700, color: '#fff' }}>Your business, run in one place.</Box>
          <Box component="p" sx={{ mt: 2, mb: 0, fontSize: 16, lineHeight: 1.6, color: CF.textOnDarkMuted }}>
            Sign in to the apps your company uses.
          </Box>
        </Box>
      </Box>

      {/* Right: the card */}
      <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', md: 'center' }, justifyContent: 'center', px: 2, pb: { xs: 5, md: 0 } }}>
        <Box sx={{ width: '100%', maxWidth: 420, bgcolor: CF.surface, borderRadius: `${CF.radius}px`, boxShadow: CF.shadow, p: { xs: 3, sm: 4 } }}>
          {/* only cf_crm passes one: its white-label customer's logo (that app's own feature, kept) */}
          {badge && <Box sx={{ mb: 2 }}>{badge}</Box>}
          <Box component="h1" sx={{ m: 0, fontSize: 24, fontWeight: 700, color: CF.ink, letterSpacing: '-0.01em' }}>{title}</Box>
          {subtitle && <Box sx={{ mt: 0.75, mb: 0, fontSize: 14.5, lineHeight: 1.55, color: CF.textMuted }}>{subtitle}</Box>}
          <Box sx={{ mt: 3 }}>{children}</Box>
          {footer && <Box sx={{ mt: 2.5, fontSize: 14, color: CF.textMuted, textAlign: 'center' }}>{footer}</Box>}
        </Box>
      </Box>
    </Box>
  );
}

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: CF.surfaceAlt,
    borderRadius: `${CF.radiusSm}px`,
    '& fieldset': { borderColor: CF.line },
    '&:hover fieldset': { borderColor: CF.textMuted },
    '&.Mui-focused fieldset': { borderColor: CF.accent, borderWidth: 2 },
  },
  '& .MuiInputLabel-root.Mui-focused': { color: CF.accent },
};

/** A text field in the frame's style. type="password" gets the eye that shows what was typed. */
export function AuthField(props: TextFieldProps) {
  const [show, setShow] = useState(false);
  const isPw = props.type === 'password';
  return (
    <TextField
      fullWidth
      margin="none"
      {...props}
      type={isPw && show ? 'text' : props.type}
      sx={{ ...fieldSx, mb: 2, ...(props.sx as object) }}
      slotProps={{
        ...props.slotProps,
        input: isPw
          ? {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShow((s) => !s)}
                    onMouseDown={(e) => e.preventDefault()}
                    edge="end"
                    aria-label={show ? 'Hide password' : 'Show password'}
                    title={show ? 'Hide password' : 'Show password'}
                    sx={{ color: CF.textMuted }}
                  >
                    {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }
          : props.slotProps?.input,
      }}
    />
  );
}

export function AuthButton({ children, busy, disabled, type = 'submit', onClick, testId, color }: { children: ReactNode; busy?: boolean; disabled?: boolean; type?: 'submit' | 'button'; onClick?: () => void; testId?: string; color?: string }) {
  return (
    <Box
      component="button"
      type={type}
      disabled={disabled || busy}
      onClick={onClick}
      data-testid={testId}
      sx={{
        width: '100%', py: 1.6, mt: 0.5, border: 0, borderRadius: `${CF.radiusSm}px`, cursor: 'pointer',
        bgcolor: color || CF.brand, color: '#fff', fontFamily: CF.font, fontSize: 16, fontWeight: 700,
        transition: 'background-color .18s ease, filter .18s ease',
        '&:hover:not(:disabled)': color ? { filter: 'brightness(0.92)' } : { bgcolor: CF.accent },
        '&:focus-visible': { outline: `3px solid ${CF.accentSoft}`, outlineOffset: 2 },
        '&:disabled': { opacity: 0.6, cursor: 'default' },
      }}
    >
      {children}
    </Box>
  );
}

export function AuthNote({ tone, children }: { tone: 'error' | 'ok' | 'info'; children: ReactNode }) {
  const c = tone === 'error' ? { bg: CF.dangerBg, fg: CF.dangerText } : tone === 'ok' ? { bg: CF.okBg, fg: CF.okText } : { bg: CF.surfaceAlt, fg: CF.text };
  return (
    <Box role={tone === 'error' ? 'alert' : 'status'} sx={{ bgcolor: c.bg, color: c.fg, borderRadius: `${CF.radiusSm}px`, px: 1.75, py: 1.25, mb: 2, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
      {children}
    </Box>
  );
}

/** A link-looking button (Forgot password?, Back to sign in). */
export function AuthLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Box component="button" type="button" onClick={onClick} sx={{ p: 0, border: 0, bgcolor: 'transparent', cursor: 'pointer', fontFamily: CF.font, fontSize: 14, fontWeight: 600, color: CF.brand, '&:hover': { color: CF.accent, textDecoration: 'underline' } }}>
      {children}
    </Box>
  );
}
