/**
 * The compliance checks of a structure, salary, policy or run (CF_HRMS_HIRING_SPEC.md §36.2), as a list:
 * each says what breaks, in words, the rule it ran against (title, version, effective date), a link to
 * its source, and whether the rule is verified — an unverified rule warns and never blocks.
 */
import { Box, Link, Stack, Typography } from '@mui/material';
import { ToneBadge } from '@shared/ui';
import { SEVERITY_TONE, SEVERITY_WORD, type CheckResult } from '../../api/complianceChecks';

const day = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

export function RuleLine({ rule }: { rule: CheckResult['rule'] }) {
  if (!rule) return null;
  const parts = [rule.title ?? rule.domain, rule.version ? `version ${rule.version}` : null, rule.effectiveFrom ? `from ${day(rule.effectiveFrom)}` : null].filter(Boolean);
  return (
    <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
      {parts.join(' · ')}
      {rule.id != null && (rule.verified ? ' · verified' : ' · not verified')}
      {rule.sourceUrl && <> · <Link href={rule.sourceUrl} target="_blank" rel="noopener noreferrer" sx={{ fontSize: 12 }}>source</Link></>}
    </Typography>
  );
}

export function ComplianceChecks({ results, empty, dense = false, testId }: { results: CheckResult[]; empty?: string; dense?: boolean; testId?: string }) {
  if (!results.length) return empty ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }} data-testid={testId}>{empty}</Typography> : null;
  return (
    <Stack spacing={dense ? 0.75 : 1.1} data-testid={testId}>
      {results.map((r, i) => (
        <Box key={`${r.check}-${r.rule?.id ?? 'x'}-${i}`} sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 1, alignItems: 'start' }} data-check={r.check} data-severity={r.severity}>
          <ToneBadge tone={SEVERITY_TONE[r.severity]} label={r.severity === 'WARN' && r.acknowledged ? 'Accepted' : SEVERITY_WORD[r.severity]} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{r.title}</Typography>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{r.message}</Typography>
            {r.unverifiedNote && <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>{r.unverifiedNote}</Typography>}
            {r.acknowledged && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Accepted{r.acknowledged.by ? ` by ${r.acknowledged.by}` : ''}: “{r.acknowledged.reason}”</Typography>}
            <RuleLine rule={r.rule} />
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

export default ComplianceChecks;
