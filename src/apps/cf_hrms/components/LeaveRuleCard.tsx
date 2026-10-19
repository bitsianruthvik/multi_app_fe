import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Button, Checkbox, FormControlLabel, IconButton, InputAdornment, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { Surface, ToneBadge, errorProblems } from '@shared/ui';
import { leaveApi, ruleInputOf, type LeaveAccrual, type LeaveBasis, type NoticeTier, type Rule } from '../api/leave';

/**
 * One leave type inside a leave policy (CF_HRMS_HIRING_SPEC.md §8.4).
 *
 * THE SENTENCE COMES FIRST, AND IT IS THE SERVER'S. "12 days a year, earned a
 * day each month. Unused days lapse at the year end." A person checks a policy
 * by reading that line, not by reading twenty fields — so it sits at the top of
 * the card and is asked for again (`preview-summary`, a moment after typing
 * stops) every time the rule changes. Nothing here writes a sentence of its own.
 *
 * THREE SHORT GROUPS under it: how it is earned · unused leave at the year end ·
 * when it is taken.
 *
 * A FIELD THAT DOES NOT APPLY IS NOT DRAWN — not greyed out. Leave without pay
 * has no number of days, so there is no days box; leave given per event is not
 * carried forward, so that group is gone. What is on the card is what matters
 * for this kind of leave, and nothing else.
 */

const BASIS_LABEL: Record<LeaveBasis, string> = {
  PER_YEAR: 'A number of days each year',
  PER_EVENT: 'A number of days each time it happens',
  UNLIMITED_UNPAID: 'As many days as needed, without pay',
};

const ACCRUAL_LABEL: Record<LeaveAccrual, string> = {
  UPFRONT: 'All at the start of the leave year',
  MONTHLY: 'A share each month',
  PER_DAYS_WORKED: 'One day for every so many days worked',
  ON_REQUEST: 'Given when it happens',
  EARNED_BY_WORK: 'Credited when a holiday or weekly off is worked',
  HALF_YEARLY: 'Twice a year (start of the year and of month 7)',
};

/** Which ways of earning go with which basis. */
const ACCRUALS: Record<LeaveBasis, LeaveAccrual[]> = {
  PER_YEAR: ['UPFRONT', 'MONTHLY', 'HALF_YEARLY', 'PER_DAYS_WORKED', 'EARNED_BY_WORK'],
  PER_EVENT: ['ON_REQUEST'],
  UNLIMITED_UNPAID: ['ON_REQUEST'],
};

const groupTitle = { fontSize: 13, fontWeight: 600, color: 'var(--c-text)', mb: 1 };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 1.5, alignItems: 'start' };

/** A whole number with its unit after it; blank means "no limit" / "not set". */
function DaysField({
  label,
  value,
  onChange,
  unit = 'days',
  helperText,
  disabled,
  required,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  unit?: string;
  helperText?: string;
  disabled: boolean;
  required?: boolean;
}) {
  return (
    <TextField
      size="small"
      label={label}
      required={required}
      disabled={disabled}
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.]/g, '');
        onChange(raw === '' ? null : Number(raw));
      }}
      helperText={helperText}
      slotProps={{
        input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> },
        htmlInput: { inputMode: 'decimal' },
        inputLabel: { shrink: true },
      }}
    />
  );
}

function Tick({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <FormControlLabel
      sx={{ m: 0, alignItems: 'flex-start' }}
      control={<Checkbox size="small" sx={{ py: 0.25 }} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />}
      label={<Typography sx={{ fontSize: 13.5, lineHeight: 1.45, pt: '2px' }}>{label}</Typography>}
    />
  );
}

/**
 * The notice by length (§23.1): one row per step — "Up to 3 days: ask 7 days ahead" —
 * and the last row for anything longer. Steps are added before the last.
 */
function NoticeTiers({ tiers, onChange, disabled }: { tiers: NoticeTier[]; onChange: (next: NoticeTier[]) => void; disabled: boolean }) {
  const setTier = (i: number, patch: Partial<NoticeTier>) => onChange(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const addStep = () => {
    const before = tiers.slice(0, -1);
    const longest = before.length ? (before[before.length - 1].upToDays ?? 0) : 0;
    onChange([...before, { upToDays: longest + 1, days: tiers[tiers.length - 1]?.days ?? 0 }, tiers[tiers.length - 1] ?? { upToDays: null, days: 0 }]);
  };
  return (
    <Box data-noticetiers="" sx={{ display: 'grid', gap: 1, gridColumn: '1 / -1' }}>
      {tiers.map((t, i) => {
        const last = i === tiers.length - 1;
        return (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            {last ? (
              <Typography sx={{ fontSize: 13.5, minWidth: 150 }}>{tiers.length > 1 ? 'Anything longer' : 'Any length'}</Typography>
            ) : (
              <Box sx={{ width: 150 }}>
                <DaysField label="Up to" value={t.upToDays} disabled={disabled} onChange={(upToDays) => setTier(i, { upToDays })} />
              </Box>
            )}
            <Box sx={{ width: 190 }}>
              <DaysField label="Ask at least" unit="days ahead" value={t.days} disabled={disabled} onChange={(v) => setTier(i, { days: v ?? 0 })} />
            </Box>
            {!last && !disabled && (
              <Tooltip title="Remove this step">
                <IconButton size="small" aria-label={`Remove the step up to ${t.upToDays ?? ''} days`} onClick={() => onChange(tiers.filter((_, j) => j !== i))}>
                  <CloseRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        );
      })}
      {!disabled && tiers.length < 10 && (
        <Box>
          <Button size="small" startIcon={<AddRounded />} onClick={addStep}>Add a step</Button>
        </Box>
      )}
    </Box>
  );
}

export function LeaveRuleCard({
  rule,
  onChange,
  onRemove,
  canEdit,
  canRemove,
  leaveTypes = [],
}: {
  rule: Rule;
  onChange: (next: Rule) => void;
  onRemove: () => void;
  canEdit: boolean;
  canRemove: boolean;
  /** The company's leave types — for "Cannot be next to". */
  leaveTypes?: { id: number; name: string; status?: string }[];
}) {
  const [summary, setSummary] = useState(rule.summary ?? '');
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const disabled = !canEdit;

  // The sentence, from the server, a moment after the rule stops changing. A
  // reply that arrives after a newer question is dropped.
  const input = JSON.stringify(ruleInputOf(rule, rule.sortOrder));
  const first = useRef(true);
  const asked = useRef(0);
  useEffect(() => {
    // As loaded, the rule already carries its sentence; ask only once it has changed (or has none).
    if (first.current) {
      first.current = false;
      if (rule.summary) return undefined;
    }
    const n = ++asked.current;
    setPending(true);
    const t = window.setTimeout(() => {
      leaveApi
        .previewSummary(JSON.parse(input))
        .then((r) => {
          if (n !== asked.current) return;
          setSummary(r.summary ?? '');
          setProblems(r.problems ?? []);
        })
        .catch((e) => {
          if (n !== asked.current) return;
          // A refusal of the rule is worth saying; a server without the route leaves the last sentence standing.
          const list = errorProblems(e);
          if (list.length) setProblems(list);
        })
        .finally(() => {
          if (n === asked.current) setPending(false);
        });
    }, 450);
    return () => window.clearTimeout(t);
    // `input` is the rule, as sent.
  }, [input]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<Rule>) => onChange({ ...rule, ...patch });

  const setBasis = (basis: LeaveBasis) => {
    const accrual = ACCRUALS[basis].includes(rule.accrual) ? rule.accrual : ACCRUALS[basis][0];
    set({
      basis,
      accrual,
      // What the new basis has no use for is cleared, so nothing hidden is saved.
      ...(basis === 'UNLIMITED_UNPAID' ? { days: null } : {}),
      ...(basis !== 'PER_YEAR' ? { carryForward: 'NONE' as const, carryForwardCapDays: null, encashable: false, encashCapDays: null, prorateOnJoining: false, daysWorkedPerLeaveDay: null, expiresAfterDays: null, joiningCutoffDay: null, creditInArrears: false, minPresentDaysForCredit: null } : {}),
      ...(basis !== 'PER_EVENT' ? { maxTimesInService: null } : {}),
    });
  };
  const setAccrual = (accrual: LeaveAccrual) =>
    set({
      accrual,
      ...(accrual !== 'PER_DAYS_WORKED' ? { daysWorkedPerLeaveDay: null } : { days: null }),
      ...(accrual !== 'EARNED_BY_WORK' ? { expiresAfterDays: null } : { days: null, prorateOnJoining: false }),
      ...(accrual !== 'MONTHLY' ? { creditInArrears: false, minPresentDaysForCredit: null } : {}),
      ...(accrual === 'PER_DAYS_WORKED' || accrual === 'EARNED_BY_WORK' || (accrual !== 'MONTHLY' && !rule.prorateOnJoining) ? { joiningCutoffDay: null } : {}),
    });

  const perYear = rule.basis === 'PER_YEAR';
  const perEvent = rule.basis === 'PER_EVENT';
  const unpaid = rule.basis === 'UNLIMITED_UNPAID';
  const fixedDays = !unpaid && rule.accrual !== 'PER_DAYS_WORKED' && rule.accrual !== 'EARNED_BY_WORK';
  const keepsABalance = perYear;
  const prorates = perYear && (rule.accrual === 'UPFRONT' || rule.accrual === 'MONTHLY' || rule.accrual === 'HALF_YEARLY');
  // The joining cut-off: a MONTHLY rule always skips a late joining month; the others only when they prorate.
  const showCutoff = perYear && (rule.accrual === 'MONTHLY' || ((rule.accrual === 'UPFRONT' || rule.accrual === 'HALF_YEARLY') && rule.prorateOnJoining));
  const tiers = rule.noticeTiers?.length ? rule.noticeTiers : null;
  const otherTypes = leaveTypes.filter((t) => t.id !== rule.leaveTypeId && (t.status !== 'INACTIVE' || rule.notWithLeaveTypeIds.includes(t.id)));
  const nameOfType = (id: number) => leaveTypes.find((t) => t.id === id)?.name ?? `Leave type ${id}`;

  return (
    <Surface e={1} data-leaverule={rule.leaveTypeCode} sx={{ p: { xs: 1.5, sm: 2 } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography component="h3" sx={{ fontSize: 16, fontWeight: 600 }}>{rule.leaveTypeName}</Typography>
            <ToneBadge tone="neutral" noIcon label={rule.isPaid ? 'Paid' : 'Unpaid'} />
          </Box>
          <Typography
            data-rulesummary=""
            aria-live="polite"
            sx={{ fontSize: 14.5, lineHeight: 1.5, mt: 0.5, color: pending ? 'var(--c-text-2)' : 'var(--c-text)', overflowWrap: 'anywhere' }}
          >
            {summary || (pending ? 'Working it out…' : 'Fill in the details below and this line will say what the leave is.')}
          </Typography>
          {problems.length > 0 && (
            <Box component="ul" data-ruleproblems="" sx={{ m: 0, mt: 0.5, pl: 2.5, fontSize: 13, color: 'var(--c-warning-800)', lineHeight: 1.5 }}>
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </Box>
          )}
        </Box>
        {canRemove && (
          <Tooltip title="Take this leave type out of the policy">
            <IconButton size="small" aria-label={`Remove ${rule.leaveTypeName} from this policy`} onClick={onRemove}>
              <DeleteOutlineRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* ── How it is earned ─────────────────────────────────────────────── */}
      <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid var(--c-divider)' }}>
        <Typography sx={groupTitle}>How it is earned</Typography>
        <Box sx={grid}>
          <TextField select size="small" label="How much" value={rule.basis} disabled={disabled} onChange={(e) => setBasis(e.target.value as LeaveBasis)}>
            {(Object.keys(BASIS_LABEL) as LeaveBasis[]).map((b) => (
              <MenuItem key={b} value={b}>{BASIS_LABEL[b]}</MenuItem>
            ))}
          </TextField>
          {perYear && (
            <TextField select size="small" label="When it is given" value={rule.accrual} disabled={disabled} onChange={(e) => setAccrual(e.target.value as LeaveAccrual)}>
              {ACCRUALS.PER_YEAR.map((a) => (
                <MenuItem key={a} value={a}>{ACCRUAL_LABEL[a]}</MenuItem>
              ))}
            </TextField>
          )}
          {fixedDays && (
            <DaysField
              label={perEvent ? 'Days each time' : 'Days a year'}
              required
              value={rule.days}
              disabled={disabled}
              onChange={(days) => set({ days })}
            />
          )}
          {rule.accrual === 'PER_DAYS_WORKED' && (
            <DaysField
              label="One day of leave for every"
              required
              unit="days worked"
              value={rule.daysWorkedPerLeaveDay}
              disabled={disabled}
              onChange={(daysWorkedPerLeaveDay) => set({ daysWorkedPerLeaveDay })}
            />
          )}
          {rule.accrual === 'EARNED_BY_WORK' && (
            <DaysField
              label="Must be used within"
              value={rule.expiresAfterDays}
              disabled={disabled}
              helperText="Blank: it does not run out."
              onChange={(expiresAfterDays) => set({ expiresAfterDays })}
            />
          )}
          {!unpaid && (
            <DaysField
              label="Starts after"
              unit="days in the job"
              value={rule.waitDaysAfterJoining || null}
              disabled={disabled}
              helperText="Blank: from the first day."
              onChange={(v) => set({ waitDaysAfterJoining: v ?? 0 })}
            />
          )}
          {perYear && rule.accrual === 'MONTHLY' && (
            <DaysField
              label="A month needs … present days"
              unit="present days"
              value={rule.minPresentDaysForCredit ?? null}
              disabled={disabled}
              helperText="Read from attendance once it is live. Blank: every month counts."
              onChange={(minPresentDaysForCredit) => set({ minPresentDaysForCredit })}
            />
          )}
          {showCutoff && (
            <DaysField
              label="Joined after day … of a month"
              unit="of the month"
              value={rule.joiningCutoffDay}
              disabled={disabled}
              helperText="That month does not count. Blank: it always counts."
              onChange={(joiningCutoffDay) => set({ joiningCutoffDay })}
            />
          )}
        </Box>
        {!unpaid && (
          <Box sx={{ display: 'grid', gap: 0.25, mt: 1 }}>
            {prorates && (
              <Tick
                label={rule.accrual === 'HALF_YEARLY'
                  ? 'Someone who joins part-way through a half-year gets a share for the months left in it'
                  : 'Someone who joins part-way through the year gets a share for the months left'}
                checked={rule.prorateOnJoining}
                disabled={disabled}
                onChange={(prorateOnJoining) => set({ prorateOnJoining, ...(!prorateOnJoining && rule.accrual !== 'MONTHLY' ? { joiningCutoffDay: null } : {}) })}
              />
            )}
            {perYear && rule.accrual === 'MONTHLY' && (
              <Tick
                label="Credited at the start of the next month (a month’s share is given once the month is over)"
                checked={rule.creditInArrears}
                disabled={disabled}
                onChange={(creditInArrears) => set({ creditInArrears })}
              />
            )}
            <Tick label="Can be taken during probation" checked={rule.allowedInProbation} disabled={disabled} onChange={(allowedInProbation) => set({ allowedInProbation })} />
          </Box>
        )}
      </Box>

      {/* ── Unused leave at the year end — only leave that keeps a balance ── */}
      {keepsABalance && (
        <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid var(--c-divider)' }}>
          <Typography sx={groupTitle}>Unused leave at the year end</Typography>
          <Box sx={grid}>
            <TextField
              select
              size="small"
              label="What happens to it"
              value={rule.carryForward}
              disabled={disabled}
              onChange={(e) => {
                const carryForward = e.target.value as Rule['carryForward'];
                set({ carryForward, ...(carryForward !== 'CAPPED' ? { carryForwardCapDays: null } : {}) });
              }}
            >
              <MenuItem value="NONE">It lapses</MenuItem>
              <MenuItem value="CAPPED">It carries forward, up to a limit</MenuItem>
              <MenuItem value="ALL">All of it carries forward</MenuItem>
            </TextField>
            {rule.carryForward === 'CAPPED' && (
              <DaysField label="Carries forward up to" required value={rule.carryForwardCapDays} disabled={disabled} onChange={(carryForwardCapDays) => set({ carryForwardCapDays })} />
            )}
            {rule.encashable && (
              <DaysField
                label="Paid out up to"
                value={rule.encashCapDays}
                disabled={disabled}
                helperText="Blank: no limit."
                onChange={(encashCapDays) => set({ encashCapDays })}
              />
            )}
          </Box>
          <Box sx={{ mt: 1 }}>
            <Tick
              label="Unused days can be paid out instead"
              checked={rule.encashable}
              disabled={disabled}
              onChange={(encashable) => set({ encashable, ...(encashable ? {} : { encashCapDays: null }) })}
            />
          </Box>
        </Box>
      )}

      {/* ── When it is taken ─────────────────────────────────────────────── */}
      <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid var(--c-divider)' }}>
        <Typography sx={groupTitle}>When it is taken</Typography>
        <Box sx={grid}>
          <DaysField
            label="Longest stretch at once"
            value={rule.maxDaysAtOnce}
            disabled={disabled}
            helperText="Blank: no limit."
            onChange={(maxDaysAtOnce) => set({ maxDaysAtOnce })}
          />
          {!tiers && (
            <DaysField
              label="Ask at least"
              unit="days ahead"
              value={rule.minNoticeDays || null}
              disabled={disabled}
              helperText="Blank: no notice needed."
              onChange={(v) => set({ minNoticeDays: v ?? 0 })}
            />
          )}
          <DaysField
            label="Proof needed beyond"
            value={rule.proofAfterDays}
            disabled={disabled}
            helperText="Blank: never. For sick leave, a medical certificate."
            onChange={(proofAfterDays) => set({ proofAfterDays })}
          />
          <TextField select size="small" label="Who it is for" value={rule.appliesTo} disabled={disabled} onChange={(e) => set({ appliesTo: e.target.value as Rule['appliesTo'] })}>
            <MenuItem value="ANYONE">Everyone</MenuItem>
            <MenuItem value="WOMEN">Women</MenuItem>
            <MenuItem value="MEN">Men</MenuItem>
          </TextField>
          {perEvent && (
            <DaysField
              label="At most"
              unit="times in service"
              value={rule.maxTimesInService}
              disabled={disabled}
              helperText="Blank: no limit. Marriage leave is usually once."
              onChange={(maxTimesInService) => set({ maxTimesInService })}
            />
          )}
          {otherTypes.length > 0 && (
            <TextField
              select
              size="small"
              label="Cannot be next to"
              value={rule.notWithLeaveTypeIds}
              disabled={disabled}
              helperText="Not touching it, even with only days off between. Blank: any."
              slotProps={{
                inputLabel: { shrink: true },
                select: {
                  multiple: true,
                  displayEmpty: true,
                  renderValue: (v) => {
                    const ids = v as number[];
                    return ids.length ? ids.map(nameOfType).join(', ') : <Box component="span" sx={{ color: 'var(--c-text-2)' }}>Any leave</Box>;
                  },
                },
              }}
              onChange={(e) => {
                const v = e.target.value as unknown;
                const ids = (Array.isArray(v) ? v : String(v).split(',')).map(Number).filter((n) => Number.isInteger(n) && n > 0);
                set({ notWithLeaveTypeIds: [...new Set(ids)].sort((a, b) => a - b) });
              }}
            >
              {otherTypes.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  <Checkbox size="small" sx={{ py: 0, pl: 0 }} checked={rule.notWithLeaveTypeIds.includes(t.id)} />
                  {t.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          {tiers && <NoticeTiers tiers={tiers} disabled={disabled} onChange={(noticeTiers) => set({ noticeTiers })} />}
        </Box>
        <Box sx={{ display: 'grid', gap: 0.25, mt: 1 }}>
          <Tick
            label="The notice depends on how long the leave is"
            checked={!!tiers}
            disabled={disabled}
            onChange={(on) =>
              set(
                on
                  ? { noticeTiers: [{ upToDays: 3, days: rule.minNoticeDays || 0 }, { upToDays: null, days: rule.minNoticeDays || 0 }], minNoticeDays: 0 }
                  : { noticeTiers: null, minNoticeDays: tiers?.[0]?.days ?? 0 },
              )
            }
          />
          <Tick label="Half days can be taken" checked={rule.halfDayAllowed} disabled={disabled} onChange={(halfDayAllowed) => set({ halfDayAllowed })} />
          <Tick
            label="A weekly off or holiday between two leave days counts as leave"
            checked={rule.countDaysOffBetween}
            disabled={disabled}
            onChange={(countDaysOffBetween) => set({ countDaysOffBetween })}
          />
          {keepsABalance && (
            <Tick
              label="Can be taken before it is earned (the balance may go below zero)"
              checked={rule.negativeBalanceAllowed}
              disabled={disabled}
              onChange={(negativeBalanceAllowed) => set({ negativeBalanceAllowed })}
            />
          )}
        </Box>
        <TextField
          size="small"
          fullWidth
          label="Note (optional)"
          value={rule.notes ?? ''}
          disabled={disabled}
          onChange={(e) => set({ notes: e.target.value || null })}
          sx={{ mt: 1.5 }}
        />
      </Box>
    </Surface>
  );
}

export default LeaveRuleCard;
