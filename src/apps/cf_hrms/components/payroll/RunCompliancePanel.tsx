/**
 * The run's compliance panel (CF_HRMS_HIRING_SPEC.md §36.2): every breach per person before the lock.
 * A HARD breach blocks the lock; a WARN needs an acknowledgement with a reason (kept with who gave it).
 * People with only notes ("cannot be checked") fold under one line.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Collapse, Stack, Typography } from '@mui/material';
import { ErrorNotice, PromptDialog, SectionCard, ToneBadge, useToast } from '@shared/ui';
import { complianceChecksApi, type RunCompliance } from '../../api/complianceChecks';
import { ComplianceChecks } from './ComplianceChecks';

export function RunCompliancePanel({ runId, company, version, canEdit, onChanged }: {
  runId: number; company: string; version: string | null; canEdit: boolean; onChanged?: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<RunCompliance | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [asking, setAsking] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const load = useCallback(() => { complianceChecksApi.runCompliance(runId).then((d) => { setData(d); setError(null); }).catch(setError); }, [runId]);
  useEffect(load, [load, version]);
  if (error) return <ErrorNotice error={error} fallback="The compliance panel could not be loaded." onRetry={load} />;
  if (!data) return null;
  const c = data.counts;
  const withIssues = data.people.filter((p) => p.results.some((r) => r.severity !== 'INFO'));
  const notesOnly = data.people.filter((p) => p.results.every((r) => r.severity === 'INFO'));
  const shown = showAll ? withIssues : withIssues.slice(0, 8);
  const tone = c.hard ? 'danger' : c.warnOpen ? 'warning' : 'success';
  const summary = c.hard
    ? `${c.hard} breach${c.hard === 1 ? '' : 'es'} of the law — the lock is blocked until they are fixed.`
    : c.warnOpen ? `${c.warnOpen} warning${c.warnOpen === 1 ? '' : 's'} to acknowledge with a reason before the lock.`
      : c.warn ? 'Every warning acknowledged. Nothing blocks the lock.' : 'Nothing found against the law in force.';
  return (
    <SectionCard
      title="Compliance"
      subtitle={summary}
      actions={(
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <ToneBadge tone={tone} label={c.hard ? 'Blocked' : c.warnOpen ? 'To acknowledge' : 'Clear'} />
          <Button size="small" component={RouterLink} to={`/${company}/cf_hrms/payroll-compliance`}>To-dos</Button>
          {canEdit && c.warnOpen > 0 && !['LOCKED', 'RELEASED', 'PAID'].includes(data.status) && (
            <Button size="small" variant="contained" onClick={() => setAsking(true)} data-action="acknowledge-warnings">Acknowledge warnings</Button>
          )}
        </Box>
      )}
    >
      <Box data-testid="run-compliance">
        {withIssues.length === 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No breach and no warning for anybody in this run.</Typography>}
        <Stack spacing={1.75}>
          {shown.map((p) => (
            <Box key={p.employee.id} sx={{ borderTop: '1px solid var(--c-divider)', pt: 1.25 }} data-person={p.employee.code}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.5 }}>{p.employee.name} <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{p.employee.code}{p.place.zone ? ` · ${p.place.state} zone ${p.place.zone}` : ''}{p.place.skill ? ` · ${p.place.skill.toLowerCase().replace('_', '-')}` : ''}</Typography></Typography>
              <ComplianceChecks results={p.results.filter((r) => r.severity !== 'INFO' || !/cannot be checked/.test(r.message))} dense />
            </Box>
          ))}
        </Stack>
        {withIssues.length > 8 && <Button size="small" onClick={() => setShowAll((v) => !v)} sx={{ mt: 1 }}>{showAll ? 'Show fewer' : `Show all ${withIssues.length} people`}</Button>}
        {notesOnly.length + withIssues.filter((p) => p.results.some((r) => /cannot be checked/.test(r.message))).length > 0 && (
          <Box sx={{ mt: 1.25 }}>
            <Button size="small" color="inherit" onClick={() => setShowNotes((v) => !v)}>
              {showNotes ? 'Hide' : 'Show'} notes ({data.people.filter((p) => p.results.some((r) => r.severity === 'INFO')).length} people: the minimum wage could not be checked, or a top-up)
            </Button>
            <Collapse in={showNotes}>
              <Stack spacing={0.5} sx={{ mt: 0.75 }}>
                {data.people.filter((p) => p.results.some((r) => r.severity === 'INFO')).slice(0, 60).map((p) => (
                  <Typography key={p.employee.id} sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                    {p.employee.name}: {p.results.filter((r) => r.severity === 'INFO').map((r) => r.message).join(' ')}
                  </Typography>
                ))}
              </Stack>
            </Collapse>
          </Box>
        )}
      </Box>
      <PromptDialog
        open={asking}
        title="Acknowledge the warnings"
        body={`${c.warnOpen} warning${c.warnOpen === 1 ? '' : 's'} in this run. The reason is kept with the run, with your name; a breach of the law (HARD) cannot be acknowledged.`}
        label="Why they are accepted"
        required
        multiline
        confirmLabel="Acknowledge"
        onClose={() => setAsking(false)}
        onConfirm={async (reason) => {
          const r = await complianceChecksApi.acknowledgeRun(runId, reason);
          setData(r.panel);
          setAsking(false);
          toast.success(`${r.acknowledged} warning${r.acknowledged === 1 ? '' : 's'} acknowledged.`);
          onChanged?.();
        }}
      />
    </SectionCard>
  );
}

export default RunCompliancePanel;
