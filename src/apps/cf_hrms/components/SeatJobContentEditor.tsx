/**
 * A seat's job content — what its role says, with this seat's own changes
 * applied and marked — and the three things a seat may do about it.
 *
 * THE RULE (the client's, 2026-10-10): KRAs are fixed at the ROLE. A seat may
 * expand, change or contract the responsibilities, the KPIs and a KPI's target.
 * So this editor offers, in plain words and for this seat only:
 *
 *   Add         a responsibility or a KPI, under one of the role's KRAs
 *   Change      a line's wording, or a KPI's target
 *   Switch off  a line of the role that does not apply here
 *   Undo        any of the three — back to what the role says
 *
 * and says in a sentence that KRAs are changed on the role, with a link there.
 *
 * It replaced the "Overrides" tab, which exposed the storage: ADD / OVERRIDE /
 * SUPPRESS badges, a definition picker and a raw JSON box. The rows underneath
 * are the same (`hrms_position_content_overrides`, written through
 * `/positions/:id/job-content/*`); what changed is that nobody has to know the
 * three verbs or type JSON to say "this seat's target is 99%".
 */
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Button, IconButton, ListItemText, Menu, MenuItem, Skeleton, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import DoneRounded from '@mui/icons-material/DoneRounded';
import { Callout, ErrorNotice, FormDialog, SectionCard, useToast } from '@shared/ui';
import {
  jobContentApi, type JobContentData, type JobKra, type JobLine, type JobLineKind, type TargetInput,
} from '../api/jobContent';
import { positionsApi } from '../api/positions';
import { JobContent } from './JobContent';
import { useJobContent } from './useJobContent';

const NOUN: Record<JobLineKind, string> = { RESPONSIBILITY: 'responsibility', KPI: 'KPI' };
const OPERATORS: { value: string; label: string }[] = [
  { value: 'GTE', label: 'At least' },
  { value: 'LTE', label: 'At most' },
  { value: 'EQ', label: 'Exactly' },
  { value: 'BETWEEN', label: 'Between' },
  { value: 'INFO', label: 'Tracked, no target' },
];

interface TargetDraft {
  operator: string;
  value: string;
  min: string;
  max: string;
}

/** Karni's KPIs are all sentences ("95%", "Zero rejections"); a numeric KPI gets an operator. */
const isSentence = (measurementType?: string | null) => !measurementType || measurementType === 'TEXT';

function draftOf(line: JobLine | null): TargetDraft {
  const v = line?.targetValue;
  const range = v && typeof v === 'object' ? v : null;
  return {
    operator: line?.targetOperator ?? (isSentence(line?.measurementType) ? 'EQ' : 'GTE'),
    value: v == null || typeof v === 'object' ? '' : String(v),
    min: range ? String(range.min) : '',
    max: range ? String(range.max) : '',
  };
}

function targetOf(d: TargetDraft, measurementType?: string | null): TargetInput {
  if (isSentence(measurementType)) return { operator: 'EQ', value: d.value.trim() };
  if (d.operator === 'INFO') return { operator: 'INFO', value: null };
  if (d.operator === 'BETWEEN') return { operator: 'BETWEEN', value: { min: Number(d.min), max: Number(d.max) } };
  return { operator: d.operator, value: d.value.trim() };
}

const sameTarget = (a: TargetDraft, b: TargetDraft) =>
  a.operator === b.operator && a.value.trim() === b.value.trim() && a.min === b.min && a.max === b.max;

function TargetFields({
  draft,
  onChange,
  measurementType,
  unit,
  helper,
}: {
  draft: TargetDraft;
  onChange: (d: TargetDraft) => void;
  measurementType?: string | null;
  unit?: string | null;
  helper?: string;
}) {
  if (isSentence(measurementType)) {
    return (
      <TextField
        label="Target"
        value={draft.value}
        onChange={(e) => onChange({ ...draft, value: e.target.value })}
        fullWidth
        size="small"
        helperText={helper ?? 'As you would say it — "95%", "Zero rejections", "Within 2 days".'}
      />
    );
  }
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
      <TextField
        select
        label="Target"
        value={draft.operator}
        onChange={(e) => onChange({ ...draft, operator: e.target.value })}
        size="small"
        sx={{ minWidth: 170 }}
      >
        {OPERATORS.map((o) => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
      </TextField>
      {draft.operator === 'BETWEEN' ? (
        <>
          <TextField label="From" value={draft.min} onChange={(e) => onChange({ ...draft, min: e.target.value })} size="small" fullWidth />
          <TextField label="To" value={draft.max} onChange={(e) => onChange({ ...draft, max: e.target.value })} size="small" fullWidth />
        </>
      ) : draft.operator !== 'INFO' ? (
        <TextField
          label={unit ? `Value (${unit})` : 'Value'}
          value={draft.value}
          onChange={(e) => onChange({ ...draft, value: e.target.value })}
          size="small"
          fullWidth
          helperText={helper}
        />
      ) : null}
    </Stack>
  );
}

type DialogState =
  | { mode: 'add'; kind: JobLineKind; kra: JobKra | null }
  | { mode: 'change'; line: JobLine }
  | { mode: 'off'; line: JobLine }
  | null;

export function SeatJobContentEditor({
  positionId,
  company,
  canManage,
  startEditing = false,
  onChanged,
}: {
  positionId: number;
  company: string;
  /** Holds `cf_hrms_org_manage`. Without it the tab is the read-only view. */
  canManage: boolean;
  /** Arrive in edit mode (the Departments screen's Edit button). */
  startEditing?: boolean;
  /** After any change, so the page can refresh what it shows about the seat. */
  onChanged?: (content: JobContentData) => void;
}) {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useJobContent({ type: 'position', id: positionId });
  const [editing, setEditing] = useState(startEditing && canManage);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; line: JobLine } | null>(null);

  // Form state, shared by the three dialogs (only one is ever open).
  const [text, setText] = useState('');
  const [kraId, setKraId] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState<TargetDraft>(draftOf(null));

  useEffect(() => {
    if (!dialog) return;
    setReason('');
    if (dialog.mode === 'add') {
      setText('');
      setKraId(dialog.kra?.definitionId ?? '');
      setTarget(draftOf(null));
    } else {
      setText(dialog.line.name);
      setTarget(draftOf(dialog.line));
    }
  }, [dialog]);

  const done = (content: JobContentData, message: string) => {
    setData(content);
    onChanged?.(content);
    toast.success(message);
  };

  const undo = async (line: JobLine) => {
    if (line.definitionId == null) return;
    try {
      done(
        await jobContentApi.seatUndo(positionId, { kind: line.kind, definitionId: line.definitionId }),
        line.mark === 'ADDED' ? 'Removed from this seat.' : 'Back to what the role says.',
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That could not be undone.');
    }
  };

  const submit = async () => {
    if (!dialog) return;
    const why = reason.trim() || undefined;
    if (dialog.mode === 'add') {
      const body = {
        kind: dialog.kind,
        text: text.trim(),
        parentKraDefinitionId: kraId === '' ? null : kraId,
        target: dialog.kind === 'KPI' && target.value.trim() ? targetOf(target, 'TEXT') : null,
        reason: why,
      };
      done(await jobContentApi.seatAdd(positionId, body), `Added for this seat only.`);
    } else if (dialog.mode === 'change') {
      const { line } = dialog;
      if (line.definitionId == null) return;
      const reworded = text.trim() !== line.name.trim();
      const retargeted = line.kind === 'KPI' && !sameTarget(target, draftOf(line));
      done(
        await jobContentApi.seatChange(positionId, {
          kind: line.kind,
          definitionId: line.definitionId,
          ...(reworded ? { text: text.trim() } : {}),
          ...(retargeted ? { target: targetOf(target, line.measurementType) } : {}),
          reason: why,
        }),
        'Changed for this seat only.',
      );
    } else {
      const { line } = dialog;
      if (line.definitionId == null) return;
      done(
        await jobContentApi.seatSwitchOff(positionId, { kind: line.kind, definitionId: line.definitionId, reason: why }),
        'Switched off for this seat.',
      );
    }
    setDialog(null);
  };

  // Said in every dialog, so "this seat only" has a number beside it.
  const otherSeats = data?.otherSeatsOnRole ?? null;
  const others =
    otherSeats == null
      ? 'The role, and every other seat holding it, stays as it is.'
      : otherSeats === 0
        ? 'This is the only seat holding the role — the role itself stays as it is.'
        : `The role and the ${otherSeats} other seat${otherSeats === 1 ? '' : 's'} holding it stay as they are.`;

  const changeDirty =
    dialog?.mode === 'change' &&
    (text.trim() !== dialog.line.name.trim() || (dialog.line.kind === 'KPI' && !sameTarget(target, draftOf(dialog.line))));

  const lineActions = (line: JobLine) => (
    <Tooltip title="Change for this seat">
      <IconButton
        size="small"
        aria-label={`Actions for: ${line.name}`}
        aria-haspopup="menu"
        onClick={(e) => setMenu({ anchor: e.currentTarget, line })}
      >
        <MoreVertRounded sx={{ fontSize: 18 }} />
      </IconButton>
    </Tooltip>
  );

  const sectionFooter = (kra: JobKra | null) => (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
      <Button size="small" startIcon={<AddRounded sx={{ fontSize: 16 }} />} onClick={() => setDialog({ mode: 'add', kind: 'RESPONSIBILITY', kra })} sx={{ textTransform: 'none' }}>
        Add a responsibility for this seat
      </Button>
      <Button size="small" startIcon={<AddRounded sx={{ fontSize: 16 }} />} onClick={() => setDialog({ mode: 'add', kind: 'KPI', kra })} sx={{ textTransform: 'none' }}>
        Add a KPI for this seat
      </Button>
    </Stack>
  );

  const roleLink = data?.roleId ? (
    <Box component={RouterLink} to={`/${company}/cf_hrms/roles/${data.roleId}?tab=content`} sx={{ color: 'var(--c-primary-700)' }}>
      {`Open the role${data.roleTitle ? ` “${data.roleTitle}”` : ''}`}
    </Box>
  ) : null;

  return (
    <SectionCard
      title="Job content"
      subtitle="The KRAs, responsibilities and KPIs of this seat: what its role says, with anything this seat does differently marked on the line."
      action={
        canManage && data ? (
          editing ? (
            <Button size="small" variant="contained" startIcon={<DoneRounded />} onClick={() => setEditing(false)}>
              Done
            </Button>
          ) : (
            <Button size="small" variant="outlined" startIcon={<EditRounded />} onClick={() => setEditing(true)}>
              Edit for this seat
            </Button>
          )
        ) : undefined
      }
    >
      {loading && !data && (
        <Stack spacing={1} aria-busy="true">
          <Skeleton variant="rounded" height={48} />
          <Skeleton variant="rounded" height={48} />
        </Stack>
      )}
      {!!error && <ErrorNotice error={error} fallback="The job content could not be loaded." onRetry={reload} />}

      {data && (
        <>
          <Typography data-krarule="" sx={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.6, mb: 1.5, maxWidth: 760 }}>
            {editing
              ? 'For this seat alone you can add a responsibility or a KPI, change a line’s wording or a KPI’s target, or switch off a line that does not apply — use the ⋮ on a line. '
              : ''}
            KRAs are set on the role and are the same for every seat that holds it, so they cannot be added or removed
            here. {roleLink}
            {roleLink ? ' to change them.' : ''}
          </Typography>

          {(data.kraExceptions?.length ?? 0) > 0 && (
            <Callout tone="warning" title="This seat has an older exception on a KRA">
              <Box sx={{ fontSize: 13, lineHeight: 1.6 }}>
                It was recorded before KRAs were fixed at the role. Remove it to bring this seat’s KRAs back in line
                with the role.
              </Box>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {data.kraExceptions!.map((x) => (
                  <Stack key={x.overrideId} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography sx={{ fontSize: 13 }}>
                      {x.action === 'ADD' ? 'Added' : x.action === 'SUPPRESS' ? 'Switched off' : 'Changed'}: {x.name ?? 'a KRA'}
                    </Typography>
                    {canManage && (
                      <Button
                        size="small"
                        onClick={async () => {
                          await positionsApi.removeOverride(x.overrideId);
                          toast.success('Exception removed.');
                          reload();
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </Stack>
                ))}
              </Stack>
            </Callout>
          )}

          <JobContent
            content={data}
            initiallyOpen="all"
            lineActions={editing ? lineActions : undefined}
            sectionFooter={editing ? sectionFooter : undefined}
          />

          {(data.ignored?.length ?? 0) > 0 && (
            <Box sx={{ mt: 1.5, fontSize: 12.5, color: 'var(--c-text-2)' }}>
              {data.ignored!.map((i) => (
                <Box key={i.overrideId}>
                  A change recorded on this seat is not taking effect{i.name ? ` (${i.name})` : ''}: {i.why}
                </Box>
              ))}
            </Box>
          )}
        </>
      )}

      {/* One menu for every line; what it offers depends on the line's mark. */}
      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        {menu && menu.line.mark !== 'OFF' && (
          <MenuItem
            onClick={() => {
              setDialog({ mode: 'change', line: menu.line });
              setMenu(null);
            }}
          >
            <ListItemText
              primary={menu.line.kind === 'KPI' ? 'Change the wording or target…' : 'Change the wording…'}
              secondary="For this seat only"
            />
          </MenuItem>
        )}
        {menu && menu.line.mark == null && (
          <MenuItem
            onClick={() => {
              setDialog({ mode: 'off', line: menu.line });
              setMenu(null);
            }}
          >
            <ListItemText primary="Switch off for this seat…" secondary="The role keeps it; this seat does not do it" />
          </MenuItem>
        )}
        {menu && menu.line.mark != null && (
          <MenuItem
            onClick={() => {
              void undo(menu.line);
              setMenu(null);
            }}
          >
            <ListItemText
              primary={
                menu.line.mark === 'ADDED'
                  ? 'Remove from this seat'
                  : menu.line.mark === 'OFF'
                    ? 'Undo — switch it back on'
                    : 'Undo — back to what the role says'
              }
            />
          </MenuItem>
        )}
      </Menu>

      <FormDialog
        open={dialog?.mode === 'add'}
        title={dialog?.mode === 'add' ? `Add a ${NOUN[dialog.kind]} for this seat` : ''}
        subtitle={`Only this seat gets it. ${others}`}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitLabel="Add for this seat"
        submitDisabled={!text.trim()}
        enterSubmits={false}
      >
        {dialog?.mode === 'add' && (
          <>
            <TextField
              label={dialog.kind === 'KPI' ? 'The KPI — what is measured' : 'The responsibility — what is done'}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 2000))}
              required
              autoFocus
              fullWidth
              multiline
              minRows={2}
              size="small"
              helperText="One sentence, as it should read in the job description."
            />
            {dialog.kind === 'KPI' && <TargetFields draft={target} onChange={setTarget} measurementType="TEXT" />}
            <TextField
              select
              label="Under which KRA"
              value={kraId}
              onChange={(e) => setKraId(e.target.value === '' ? '' : Number(e.target.value))}
              fullWidth
              size="small"
              helperText={
                (data?.kras.length ?? 0) === 0
                  ? 'The role has no KRAs yet, so it will sit under none. KRAs are written on the role.'
                  : 'One of the role’s KRAs. A seat cannot have a KRA of its own.'
              }
            >
              <MenuItem value="">
                <em>Not under a KRA</em>
              </MenuItem>
              {(data?.kras ?? [])
                .filter((k) => k.definitionId != null)
                .map((k) => (
                  <MenuItem key={k.key} value={k.definitionId!}>
                    {k.name}
                  </MenuItem>
                ))}
            </TextField>
            <TextField
              label="Why this seat differs (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              fullWidth
              size="small"
              helperText="Printed beside the line, and in the seat’s job description."
            />
          </>
        )}
      </FormDialog>

      <FormDialog
        open={dialog?.mode === 'change'}
        title={dialog?.mode === 'change' ? `Change this ${NOUN[dialog.line.kind]} for this seat` : ''}
        subtitle={`Only this seat changes. ${others}`}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitLabel="Change for this seat"
        submitDisabled={!text.trim() || !changeDirty}
        enterSubmits={false}
      >
        {dialog?.mode === 'change' && (
          <>
            <TextField
              label="Wording for this seat"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 2000))}
              required
              autoFocus
              fullWidth
              multiline
              minRows={2}
              size="small"
              helperText={
                dialog.line.mark == null
                  ? 'Rewording it switches the role’s line off for this seat and puts yours in its place.'
                  : 'This line belongs to this seat only.'
              }
            />
            {dialog.line.kind === 'KPI' && (
              <TargetFields
                draft={target}
                onChange={setTarget}
                measurementType={dialog.line.measurementType}
                unit={dialog.line.unit}
                helper={dialog.line.mark == null ? `The role’s target is: ${dialog.line.targetText ?? 'not set'}` : undefined}
              />
            )}
            <TextField
              label="Why this seat differs (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              fullWidth
              size="small"
            />
          </>
        )}
      </FormDialog>

      <FormDialog
        open={dialog?.mode === 'off'}
        title={dialog?.mode === 'off' ? `Switch off this ${NOUN[dialog.line.kind]} for this seat?` : ''}
        subtitle={`The role keeps it. ${others} You can switch it back on at any time.`}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitLabel="Switch off for this seat"
      >
        {dialog?.mode === 'off' && (
          <>
            <Box
              sx={{
                fontSize: 13.5,
                lineHeight: 1.5,
                p: 1.25,
                background: 'var(--c-surface-2)',
                border: '1px solid var(--c-border)',
                borderRadius: 'var(--r-sm)',
                overflowWrap: 'anywhere',
              }}
            >
              {dialog.line.name}
            </Box>
            <TextField
              label="Why it does not apply here (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
              fullWidth
              size="small"
            />
          </>
        )}
      </FormDialog>
    </SectionCard>
  );
}

export default SeatJobContentEditor;
