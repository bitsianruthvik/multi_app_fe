import { useEffect, useRef, useState } from 'react';
import { Box, TextField } from '@mui/material';
import type { GstinCheck, LineTax } from '../api/gst';
import { hsnChipText, lineTaxText, normGstin } from '../lib/gst';
import { Mono } from './ui';

type Verdict = { gstin: string; r: GstinCheck } | { gstin: string; failed: string };

/**
 * A GSTIN box with its verdict under it, live. It asks the server as soon as 15
 * characters are there; `onResult` hands back the state so a form can fill it.
 * `check` is given, not imported, so the field can be tested without a server.
 */
export function GstinField({ value, onChange, check, onResult, label = 'GSTIN', disabled, debounceMs = 350, helperText, required }: {
  value: string;
  onChange: (v: string) => void;
  check: (gstin: string) => Promise<GstinCheck>;
  onResult?: (r: GstinCheck) => void;
  label?: string;
  disabled?: boolean;
  debounceMs?: number;
  helperText?: string;
  required?: boolean;
}) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [checking, setChecking] = useState(false);
  const give = useRef(onResult);
  give.current = onResult;
  const text = normGstin(value);
  useEffect(() => {
    if (text.length !== 15) { setChecking(false); return; }
    let alive = true;
    setChecking(true);
    const t = setTimeout(() => {
      check(text).then((r) => { if (!alive) return; setVerdict({ gstin: text, r }); if (r.valid) give.current?.(r); })
        .catch((e) => { if (alive) setVerdict({ gstin: text, failed: e instanceof Error ? e.message : 'Could not check it just now.' }); })
        .finally(() => { if (alive) setChecking(false); });
    }, debounceMs);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, debounceMs]);

  const here = verdict && verdict.gstin === text ? verdict : null;
  let tone: 'ok' | 'bad' | 'none' = 'none';
  let feedback = helperText ?? 'Leave empty if they have none.';
  if (text.length > 0 && text.length < 15) feedback = `A GSTIN has 15 characters — ${text.length} so far.`;
  else if (text.length > 15) { feedback = `A GSTIN has 15 characters — this has ${text.length}.`; tone = 'bad'; }
  else if (text.length === 15) {
    if (checking || !here) feedback = 'Checking…';
    else if ('failed' in here) { feedback = here.failed; tone = 'bad'; }
    else if (here.r.valid) {
      feedback = `Valid${here.r.stateName ? ` — ${here.r.stateName}${here.r.stateCode ? ` (${here.r.stateCode})` : ''}` : ''}${here.r.pan ? ` · PAN ${here.r.pan}` : ''}`;
      tone = 'ok';
    } else { feedback = here.r.message ?? 'This GSTIN is not valid.'; tone = 'bad'; }
  }
  return (
    <TextField label={label} value={value} disabled={disabled} required={required} onChange={(e) => onChange(normGstin(e.target.value))} error={tone === 'bad'}
      inputProps={{ maxLength: 20, style: { fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }, 'data-testid': 'gstin-input' }}
      helperText={<span data-testid="gstin-feedback" data-tone={tone} style={tone === 'ok' ? { color: 'var(--c-success-700)' } : undefined}>{feedback}</span>} />
  );
}

/** Under an order line's amount: a muted "GST 18% ₹1,80,000", or why there is none. */
export function LineTaxNote({ tax }: { tax: Pick<LineTax, 'gstRate' | 'taxTotal' | 'taxNote'> | null | undefined }) {
  const text = lineTaxText(tax);
  if (!text) return null;
  const isNote = !(tax?.taxTotal != null && tax?.gstRate != null);
  return <Box data-testid="line-tax" sx={{ fontSize: 11.5, color: isNote ? 'var(--c-warning-800)' : 'var(--c-text-3)', textAlign: 'right', whiteSpace: 'normal' }}>{text}</Box>;
}

/** "HSN 7308 · GST 18%" in a chip; nothing when neither is set. */
export function HsnChip({ hsn, rate, isService }: { hsn: string | null | undefined; rate: number | null | undefined; isService?: boolean }) {
  const text = hsnChipText(hsn, rate, isService);
  if (!text) return null;
  return <Mono chip muted={rate == null}><span data-testid="hsn-chip">{text}</span></Mono>;
}

/** The amount in words, as the server wrote it, under the grand total. */
export function AmountInWords({ words }: { words: string | null | undefined }) {
  if (!words) return null;
  return <Box data-testid="in-words" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', textAlign: 'right' }}>{words}</Box>;
}
