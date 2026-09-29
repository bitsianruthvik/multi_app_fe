import { useEffect, type ReactNode } from 'react';
import { Box, Button, ButtonBase, Typography } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { addMin, hhmm, PRIMARY_H, resolveClock, TOUCH } from './floorModel';

/**
 * The machine log's building blocks. Made for a gloved hand on a shared tablet:
 * nothing under 48 px, primary actions 56 px, numbers big, colour never the only
 * signal. They live here, not in a screen, so every floor screen presses the
 * same way.
 */
export function BigButton({ children, onClick, disabled, tone = 'primary', variant = 'contained', startIcon, fullWidth, label, sx }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; tone?: 'primary' | 'success' | 'neutral' | 'warning';
  variant?: 'contained' | 'outlined' | 'text'; startIcon?: ReactNode; fullWidth?: boolean; label?: string; sx?: object;
}) {
  const bg = { primary: 'var(--c-primary-600)', success: 'var(--c-success-600)', warning: 'var(--c-warning-600)', neutral: 'var(--c-neutral-600)' }[tone];
  return (
    <Button onClick={onClick} disabled={disabled} variant={variant} startIcon={startIcon} fullWidth={fullWidth} aria-label={label}
      sx={{
        minHeight: PRIMARY_H, px: 3, fontSize: 18, fontWeight: 600, textTransform: 'none', borderRadius: 'var(--r-md)', boxShadow: 'none',
        ...(variant === 'contained' ? { background: bg, color: '#fff', '&:hover': { background: bg, filter: 'brightness(0.95)', boxShadow: 'none' } }
          : { color: 'var(--c-text)', borderColor: 'var(--c-border)', borderWidth: 2, '&:hover': { borderWidth: 2, background: 'var(--c-surface-2)' } }),
        '&.Mui-disabled': { opacity: 0.45, color: variant === 'contained' ? '#fff' : undefined },
        ...sx,
      }}>
      {children}
    </Button>
  );
}

/** A tappable pill — a reason, a person, a choice. `selected` fills it; 56 px tall so it is hard to miss. */
export function Choice({ children, selected = false, onClick, sub, sx }: { children: ReactNode; selected?: boolean; onClick: () => void; sub?: ReactNode; sx?: object }) {
  return (
    <ButtonBase onClick={onClick} aria-pressed={selected} sx={{
      minHeight: PRIMARY_H, px: 2.5, py: 1, borderRadius: 999, fontSize: 17, fontWeight: 600, fontFamily: 'var(--font-ui)', textAlign: 'center', flexDirection: 'column',
      border: '2px solid', borderColor: selected ? 'var(--c-primary-600)' : 'var(--c-border)', background: selected ? 'var(--c-primary-600)' : 'var(--c-surface)',
      color: selected ? '#fff' : 'var(--c-text)', '&:hover': { background: selected ? 'var(--c-primary-600)' : 'var(--c-surface-2)' }, ...sx,
    }}>
      {children}
      {sub && <Box component="span" sx={{ fontSize: 12.5, fontWeight: 500, opacity: 0.85 }}>{sub}</Box>}
    </ButtonBase>
  );
}

export const ChoiceRow = ({ children }: { children: ReactNode }) => <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>{children}</Box>;

/** A card that is one big tap target (a machine, a person, a job to start). */
export function TapCard({ children, onClick, selected = false, ariaLabel, checked, sx }: { children: ReactNode; onClick: () => void; selected?: boolean; ariaLabel?: string; checked?: boolean; sx?: object }) {
  return (
    <ButtonBase onClick={onClick} aria-label={ariaLabel} {...(checked !== undefined ? { role: 'checkbox', 'aria-checked': checked } : {})} sx={{
      width: '100%', minHeight: 72, p: 2, borderRadius: 'var(--r-md)', textAlign: 'left', justifyContent: 'flex-start', alignItems: 'center', gap: 1.5,
      border: '2px solid', borderColor: selected ? 'var(--c-primary-600)' : 'var(--c-border)', background: selected ? 'var(--c-primary-50)' : 'var(--c-surface)',
      color: 'var(--c-text)', '&:hover': { background: selected ? 'var(--c-primary-50)' : 'var(--c-surface-2)' }, ...sx,
    }}>
      {children}
    </ButtonBase>
  );
}

/** A bottom sheet. Closing it (Cancel, backdrop, Escape) never saves; the screen decides what the primary button does. */
export function Sheet({ open, title, onClose, children, footer }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <Box role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} sx={{ position: 'fixed', inset: 0, zIndex: 1300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <Box data-testid="sheet-backdrop" onClick={onClose} sx={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      <Box sx={{
        position: 'relative', width: '100%', maxWidth: 640, maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: 'var(--c-surface)',
        borderRadius: 'var(--r-lg) var(--r-lg) 0 0', boxShadow: 'var(--e-3)',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2.5, pt: 2, pb: 1, gap: 1 }}>
          <Typography component="h2" sx={{ flex: 1, fontSize: 22, fontWeight: 700, color: 'var(--c-text)' }}>{title}</Typography>
          <ButtonBase onClick={onClose} aria-label="Close" sx={{ width: TOUCH, height: TOUCH, borderRadius: '50%', color: 'var(--c-text-2)' }}><CloseRounded /></ButtonBase>
        </Box>
        <Box sx={{ px: 2.5, pb: 2, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 }}>{children}</Box>
        {footer && <Box sx={{ px: 2.5, py: 2, borderTop: '1px solid var(--c-border)', display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>{footer}</Box>}
      </Box>
    </Box>
  );
}

/** A whole number with big − / + buttons; the number itself can also be typed. */
export function Stepper({ label, value, onChange, max, placeholder }: { label: string; value: number | null; onChange: (n: number) => void; max?: number; placeholder?: string }) {
  const set = (n: number) => onChange(Math.max(0, max != null ? Math.min(max, n) : n));
  const base = value ?? 0;
  const btn = (text: string, aria: string, by: number, small = false) => (
    <ButtonBase onClick={() => set(base + by)} aria-label={aria} sx={{
      width: small ? TOUCH : PRIMARY_H, flexShrink: 0, height: small ? TOUCH : PRIMARY_H, borderRadius: 'var(--r-md)', border: '2px solid var(--c-border)',
      fontSize: small ? 15 : 28, fontWeight: 700, color: 'var(--c-text)', background: 'var(--c-surface-2)',
    }}>{text}</ButtonBase>
  );
  return (
    <Box>
      <Typography sx={{ fontSize: 16, fontWeight: 600, color: 'var(--c-text-2)', mb: 1 }}>{label}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 }, justifyContent: 'center' }}>
        {btn('−10', `${label}: 10 less`, -10, true)}
        {btn('−', `${label}: one less`, -1)}
        <Box component="input" type="number" inputMode="numeric" min={0} aria-label={label} value={value ?? ''} placeholder={placeholder}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => set(Math.floor(Number(e.target.value) || 0))}
          sx={{ width: { xs: 84, sm: 110 }, minWidth: 0, height: PRIMARY_H, textAlign: 'center', fontSize: 40, fontWeight: 700, fontFamily: 'var(--font-mono)', border: 'none', background: 'transparent', color: 'var(--c-text)', outline: 'none', MozAppearance: 'textfield', '&::-webkit-inner-spin-button': { display: 'none' } }} />
        {btn('+', `${label}: one more`, 1)}
        {btn('+10', `${label}: 10 more`, 10, true)}
      </Box>
    </Box>
  );
}

/**
 * A clock time as a date-time. Type it (the tablet's own time keyboard) or nudge
 * it 15 minutes; a time earlier than `windowStart` means the next day, which is
 * how a night shift's 02:00 stays on the right side of midnight.
 */
export function TimeField({ label, value, onChange, windowStart, extra }: { label: string; value: Date; onChange: (d: Date) => void; windowStart: Date; extra?: ReactNode }) {
  const nudge = (m: number) => onChange(addMin(value, m));
  const btn = (text: string, m: number) => (
    <ButtonBase onClick={() => nudge(m)} aria-label={`${label}: ${Math.abs(m) === 60 ? '1 hour' : '15 minutes'} ${m < 0 ? 'earlier' : 'later'}`} sx={{
      minWidth: { xs: 0, sm: PRIMARY_H }, height: PRIMARY_H, px: 1, borderRadius: 'var(--r-md)', border: '2px solid var(--c-border)', fontSize: 16, fontWeight: 700,
      color: 'var(--c-text)', background: 'var(--c-surface-2)',
    }}>{text}</ButtonBase>
  );
  return (
    <Box>
      <Typography sx={{ fontSize: 16, fontWeight: 600, color: 'var(--c-text-2)', mb: 1 }}>{label}</Typography>
      {/* Phone: the time on its own line, the four nudges under it in equal columns. Tablet and up: one row. */}
      <Box sx={{ display: { xs: 'grid', sm: 'flex' }, gridTemplateColumns: 'repeat(4, 1fr)', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        {btn('−1 h', -60)}
        {btn('−15', -15)}
        <Box component="input" type="time" aria-label={label} value={hhmm(value)}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const d = resolveClock(e.target.value, windowStart); if (d) onChange(d); }}
          sx={{ height: PRIMARY_H, width: { xs: '100%', sm: 176 }, gridColumn: '1 / -1', gridRow: 1, minWidth: 0, boxSizing: 'border-box', textAlign: 'center', fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-mono)', border: '2px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface)', color: 'var(--c-text)' }} />
        {btn('+15', 15)}
        {btn('+1 h', 60)}
        {extra && <Box sx={{ gridColumn: '1 / -1' }}>{extra}</Box>}
      </Box>
    </Box>
  );
}

/** A quiet, never-red note: what is true and what to do, in a sentence. */
export function Calm({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' }) {
  return (
    <Box role="status" sx={{
      px: 2, py: 1.25, borderRadius: 'var(--r-md)', fontSize: 15, background: `var(--c-${tone}-50)`, border: '1px solid', borderColor: `var(--c-${tone}-200)`, color: 'var(--c-text)',
    }}>{children}</Box>
  );
}
