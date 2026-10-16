/**
 * THE KPI target input (CF_HRMS_HIRING_SPEC.md §24 step 2) — one component wherever a KPI target is
 * typed: a role's KPI line, a position's or a person's own target (the job content editor, also in
 * the org chart panel), and a plan's KPI.
 *
 *   The KPI says how it is measured  a number box with the unit and the which-way mark around it
 *   (measured in + which way)        ("▲ at least [ 95 ] %"), two boxes for a range, a date for a
 *                                    milestone, nothing to type for "done or not".
 *   It does not (or "in words")      a text box: "95%", "Max 30 minutes", "₹10–12 L", "by 30 Nov 2026"
 *                                    are read as they are typed; anything else stays words.
 *
 * Under it, always, the live sentence: "At least 95% — higher is better", "Between ₹10 L and ₹12 L —
 * inside the range is met", "Done by 30 Nov 2026", or "Kept as words — met or not met". The server reads
 * the target again on save (kpiTarget.ts says why this is only a preview).
 */
import { Box, Button, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import {
  BETTER_MARK, BETTER_WORDS, MEASURE_WORDS, readDraft, ruleIsSet, sentenceOf,
  type TargetDraft, type TargetRule,
} from './kpiTarget';

const LEAD: Record<string, string> = { HIGHER_BETTER: 'at least', LOWER_BETTER: 'at most', EXACT: 'exactly' };

/** The unit drawn after the number: "%", "minutes", "cylinders" (rupees go before it; "count" says nothing). */
const unitAfter = (unit: string | null) => (unit && unit !== '₹' && unit !== 'count' ? unit : null);

export function KpiTargetInput({
  rule,
  draft,
  onChange,
  kpiName = '',
  label = 'Target',
  helper,
  allowWords = true,
  autoFocus = false,
  disabled = false,
  readWords = true,
}: {
  /** What the library KPI says (ruleOf(definition)); an unset rule takes free text. */
  rule: TargetRule;
  draft: TargetDraft;
  onChange: (d: TargetDraft) => void;
  /** Read for the which-way guess when the KPI does not say ("Scrap" is lower). */
  kpiName?: string;
  label?: string;
  /** A line under the input, e.g. "The role's target is: 95%". '' = none (default: where the rule comes from). */
  helper?: string;
  /** Offer "write it in words instead". */
  allowWords?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Read typed words into a number (default). A plan KPI set to "written as words" keeps them as words. */
  readWords?: boolean;
}) {
  const structured = ruleIsSet(rule) && !draft.words;
  const read = !readWords && (draft.words || !ruleIsSet(rule))
    ? { spec: null, problem: null, empty: !draft.text.trim() }
    : readDraft(draft, rule, kpiName);
  const set = (patch: Partial<TargetDraft>) => onChange({ ...draft, ...patch });
  const rupees = rule.unit === '₹';
  const unit = unitAfter(rule.unit);
  const mark = rule.direction ? BETTER_MARK[rule.direction] : null;

  const numberBox = (key: 'value' | 'min' | 'max', boxLabel: string, lead: string | null) => (
    <TextField
      label={boxLabel}
      value={draft[key]}
      onChange={(e) => set({ [key]: e.target.value })}
      size="small"
      fullWidth
      autoFocus={autoFocus && key !== 'max'}
      disabled={disabled}
      error={Boolean(read.problem)}
      slotProps={{
        htmlInput: { inputMode: 'decimal', 'aria-label': `${boxLabel}${unit ? ` (${unit})` : rupees ? ' (₹)' : ''}` },
        input: {
          startAdornment: lead || rupees ? (
            <InputAdornment position="start" sx={{ '& p': { fontSize: 13, color: 'var(--c-text-2)', whiteSpace: 'nowrap' } }}>
              {[lead, rupees ? '₹' : null].filter(Boolean).join(' ')}
            </InputAdornment>
          ) : undefined,
          endAdornment: unit ? <InputAdornment position="end" sx={{ '& p': { fontSize: 13 } }}>{unit}</InputAdornment> : undefined,
        },
      }}
    />
  );

  let sentence: string | null = null;
  let tone: 'ok' | 'words' | 'problem' | 'empty' = 'empty';
  if (read.problem) { sentence = read.problem; tone = 'problem'; } else if (read.spec) {
    sentence = sentenceOf(read.spec);
    tone = 'ok';
  } else if (!read.empty) {
    sentence = ruleIsSet(rule) && draft.words
      ? 'Kept as words — it does not read as this KPI\'s target, so it is scored met or not met.'
      : 'Kept as words — scored as met or not met.';
    tone = 'words';
  } else sentence = 'No target yet.';

  return (
    <Box data-kpitarget="">
      {structured && rule.measure === 'BOOLEAN' && (
        <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
          {MEASURE_WORDS.BOOLEAN}: nothing to type — it is met when it is done.
        </Typography>
      )}
      {structured && rule.measure === 'DATE' && (
        <TextField
          type="date"
          label={`${label} — done by`}
          value={draft.date}
          onChange={(e) => set({ date: e.target.value })}
          size="small"
          fullWidth
          autoFocus={autoFocus}
          disabled={disabled}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      )}
      {structured && rule.direction === 'TARGET_RANGE' && rule.measure !== 'DATE' && rule.measure !== 'BOOLEAN' && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          {numberBox('min', `${label} — lowest`, mark)}
          {numberBox('max', 'Highest', null)}
        </Stack>
      )}
      {structured && rule.direction && rule.direction !== 'TARGET_RANGE' && rule.measure !== 'DATE' && rule.measure !== 'BOOLEAN' && (
        numberBox('value', label, `${mark ?? ''} ${LEAD[rule.direction] ?? ''}`.trim())
      )}
      {!structured && (
        <TextField
          label={label}
          value={draft.text}
          onChange={(e) => set({ text: e.target.value.slice(0, 500) })}
          size="small"
          fullWidth
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={'95% · Max 30 minutes · ₹10–12 L · by 30 Nov 2026'}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      )}

      <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mt: 0.75, flexWrap: 'wrap' }} aria-live="polite">
        <Typography
          data-kpitarget-sentence=""
          sx={{
            fontSize: 13,
            fontWeight: tone === 'ok' ? 600 : 400,
            color: tone === 'problem' ? 'var(--c-danger-600)' : tone === 'ok' ? 'var(--c-text)' : 'var(--c-text-2)',
            flex: '1 1 auto',
            minWidth: 0,
          }}
        >
          {tone === 'ok' && !structured ? `Reads as: ${sentence}` : sentence}
        </Typography>
        {allowWords && ruleIsSet(rule) && !disabled && (
          <Button
            size="small"
            variant="text"
            onClick={() => set({ words: !draft.words })}
            sx={{ fontSize: 12.5, px: 0.5, minWidth: 0, whiteSpace: 'nowrap' }}
          >
            {draft.words ? 'Type a number instead' : 'Write it in words instead'}
          </Button>
        )}
      </Stack>
      {helper !== '' && (helper || (ruleIsSet(rule) && structured)) && (
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.25 }}>
          {helper ?? `${rule.measure ? MEASURE_WORDS[rule.measure] : ''}${rule.direction ? ` · ${BETTER_WORDS[rule.direction].toLowerCase()}` : ''} — set on the KPI in Libraries.`}
        </Typography>
      )}
    </Box>
  );
}
