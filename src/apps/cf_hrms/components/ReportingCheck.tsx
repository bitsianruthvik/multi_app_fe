import { useEffect, useState } from 'react';
import { Autocomplete, Box, Button, Stack, TextField, Typography } from '@mui/material';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import { ErrorNotice, ListSkeleton, SideSheet, ToneBadge, useToast } from '@shared/ui';
import {
  orgApi,
  type Consistency,
  type ConsistencyFinding,
  type ConsistencyFix,
  type FindingKind,
  type PosRef,
} from '../api/organisation';
import { posLine, posTitle, posWho } from './unitReportingText';
import { unitLabel } from './orgUnits';

/**
 * The reporting check (CF_HRMS_HIRING_SPEC.md §40.5): what the org unit tree
 * and the reporting lines disagree about, each with its one-click fixes.
 *
 *   <ReportingCheckCallout>  "3 things to check in reporting" — on the Org units
 *                            page and in the org chart's Edit mode; hidden at 0.
 *   <ReportingCheckSheet>    the list, by kind: lines outside the tree without a
 *                            reason, units with no head and nothing to report
 *                            into, positions left with no manager, loops.
 *
 * A fix is the server's (POST /organisation/consistency/fix): it answers with
 * the check as it now stands, which replaces the list. Only a login that may
 * change org units or positions sees the fix buttons.
 */

const KIND_TITLE: Record<FindingKind, string> = {
  CROSS_TREE: 'Outside the org unit tree, with no reason',
  UNIT_NO_HEAD: 'Org units with no head and nothing to report into',
  NO_MANAGER: 'Positions with no manager',
  LOOP: 'Loops',
};
const KIND_HINT: Record<FindingKind, string> = {
  CROSS_TREE: 'The manager is not in the same org unit or one above it. Use the default, pick someone above, or say why it is meant.',
  UNIT_NO_HEAD: 'Its positions have nobody to report to. Give it a head, or say where it reports into.',
  NO_MANAGER: 'Nobody is above these positions. The head of a top unit is the top of the organisation and is not listed.',
  LOOP: 'These positions report to each other in a circle, so nobody at the top approves for them.',
};
const ORDER: FindingKind[] = ['LOOP', 'CROSS_TREE', 'NO_MANAGER', 'UNIT_NO_HEAD'];

export function ReportingCheckCallout({ count, onOpen }: { count: number | null | undefined; onOpen: () => void }) {
  if (!count) return null;
  return (
    <Box
      data-reporting-check=""
      role="status"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        flexWrap: 'wrap',
        p: 1.25,
        px: 1.75,
        mb: 2,
        borderRadius: 'var(--r-md)',
        border: '1px solid var(--c-border)',
        borderLeft: '3px solid var(--c-warning-600)',
        background: 'var(--c-surface-2)',
      }}
    >
      <FactCheckRounded sx={{ color: 'var(--c-warning-700)', fontSize: 20 }} aria-hidden />
      <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', flex: '1 1 200px' }}>
        {count === 1 ? '1 thing to check in reporting' : `${count} things to check in reporting`}
      </Typography>
      <Button size="small" variant="outlined" onClick={onOpen}>
        See them
      </Button>
    </Box>
  );
}

function FixRow({
  finding,
  fix,
  onFix,
}: {
  finding: ConsistencyFinding;
  fix: ConsistencyFix;
  onFix: (body: { positionId?: number; reason?: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<PosRef | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const needsInput = fix.needsPosition || fix.needsReason;
  const run = async () => {
    setBusy(true);
    try {
      await onFix({
        ...(fix.needsPosition && pick ? { positionId: pick.positionId } : {}),
        ...(fix.needsReason ? { reason: reason.trim() } : {}),
      });
    } finally {
      setBusy(false);
    }
  };
  const ready = (!fix.needsPosition || !!pick) && (!fix.needsReason || !!reason.trim());
  if (!needsInput) {
    return (
      <Box>
        <Button size="small" variant="outlined" disabled={busy} onClick={() => void run()} data-fix={fix.action}>
          {fix.label}
        </Button>
        {(fix.target || fix.hint) && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.25 }}>
            {fix.target ? `It becomes ${posLine(fix.target)}.` : fix.hint}
          </Typography>
        )}
      </Box>
    );
  }
  if (!open) {
    return (
      <Button size="small" variant="outlined" onClick={() => setOpen(true)} data-fix={fix.action}>
        {fix.label}…
      </Button>
    );
  }
  return (
    <Stack spacing={1} sx={{ width: '100%', p: 1.25, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)' }}>
      {fix.hint && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{fix.hint}</Typography>}
      {fix.needsPosition && (
        <Autocomplete
          size="small"
          openOnFocus
          options={fix.candidates}
          value={pick}
          onChange={(_, v) => setPick(v)}
          groupBy={(p) => unitLabel(p.unitName ?? 'No org unit', p.unitType)}
          getOptionLabel={(p) => posTitle(p)}
          getOptionKey={(p) => p.positionId}
          isOptionEqualToValue={(a, b) => a.positionId === b.positionId}
          renderOption={(props, p) => {
            const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
            return (
              <li key={key} {...rest}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, overflowWrap: 'anywhere' }}>{posTitle(p)}</Typography>
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{posWho(p)}</Typography>
                </Box>
              </li>
            );
          }}
          renderInput={(p) => <TextField {...p} autoFocus label={fix.action === 'SET_HEAD' ? 'Head' : 'Position'} />}
        />
      )}
      {fix.needsReason && (
        <TextField
          size="small"
          label="Why it is meant"
          value={reason}
          autoFocus={!fix.needsPosition}
          onChange={(e) => setReason(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 500 } }}
          placeholder={finding.kind === 'CROSS_TREE' ? 'e.g. Quality signs off for the plant, not for Production' : undefined}
        />
      )}
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="contained" disabled={!ready || busy} onClick={() => void run()}>
          {fix.label}
        </Button>
        <Button size="small" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </Stack>
    </Stack>
  );
}

function FindingCard({
  finding,
  canFix,
  onFix,
}: {
  finding: ConsistencyFinding;
  canFix: boolean;
  onFix: (finding: ConsistencyFinding, fix: ConsistencyFix, body: { positionId?: number; reason?: string }) => Promise<void>;
}) {
  return (
    <Box
      data-finding={finding.key}
      sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', p: 1.5, background: 'var(--c-surface)' }}
    >
      <Typography sx={{ fontSize: 14, color: 'var(--c-text)', overflowWrap: 'anywhere' }}>{finding.sentence}</Typography>
      {finding.loop && finding.loop.length > 0 && (
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5, overflowWrap: 'anywhere' }}>
          {finding.loop.map((p) => posTitle(p)).join(' → ')} → {posTitle(finding.loop[0])}
        </Typography>
      )}
      {canFix && finding.fixes.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}>
          {finding.fixes.map((fix, i) => (
            <FixRow key={`${fix.action}-${fix.edgeId ?? fix.unitId ?? i}`} finding={finding} fix={fix} onFix={(b) => onFix(finding, fix, b)} />
          ))}
        </Stack>
      )}
    </Box>
  );
}

export function ReportingCheckSheet({
  open,
  onClose,
  data,
  error,
  canFix,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  data: Consistency | null;
  error?: unknown;
  canFix: boolean;
  /** The check as it stands after a fix (the caller replaces its copy, and reloads what shows reporting). */
  onChanged: (next: Consistency) => void;
}) {
  const { success } = useToast();
  const [fixError, setFixError] = useState<unknown>(null);
  useEffect(() => { if (!open) setFixError(null); }, [open]);
  const fix = async (finding: ConsistencyFinding, f: ConsistencyFix, body: { positionId?: number; reason?: string }) => {
    setFixError(null);
    try {
      const r = await orgApi.consistency.fix({
        key: finding.key,
        action: f.action,
        ...body,
        ...(f.edgeId != null ? { edgeId: f.edgeId } : {}),
        ...(f.unitId != null ? { unitId: f.unitId } : {}),
      });
      success(`${f.label}: done.`);
      onChanged(r.consistency);
    } catch (e) {
      setFixError(e);
    }
  };
  const groups = ORDER.map((kind) => ({ kind, items: (data?.findings ?? []).filter((x) => x.kind === kind) })).filter((g) => g.items.length);
  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title="Reporting check"
      subtitle="Where the org units and the reporting lines disagree"
      width={520}
    >
      <Box data-check-sheet="">
        <ErrorNotice error={error ?? fixError} fallback="The check could not be read." />
        {!data && !error ? (
          <ListSkeleton rows={4} />
        ) : data && data.counts.total === 0 ? (
          <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>Nothing to check: every position has a manager the org units explain.</Typography>
        ) : (
          <Stack spacing={2.5}>
            {groups.map((g) => (
              <Box key={g.kind} component="section" aria-label={KIND_TITLE[g.kind]}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography component="h3" sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>
                    {KIND_TITLE[g.kind]}
                  </Typography>
                  <ToneBadge tone={g.kind === 'LOOP' ? 'danger' : 'warning'} noIcon label={String(g.items.length)} />
                </Stack>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mb: 1 }}>{KIND_HINT[g.kind]}</Typography>
                <Stack spacing={1}>
                  {g.items.map((f) => (
                    <FindingCard key={f.key} finding={f} canFix={canFix} onFix={fix} />
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </SideSheet>
  );
}

export default ReportingCheckSheet;
