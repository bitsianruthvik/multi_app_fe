/**
 * A position's job content — what its role says, with this position's own changes
 * applied and marked — and the three things a position may do about it.
 *
 * THE RULE (the client's, 2026-10-10): KRAs are fixed at the ROLE. A position may
 * expand, change or contract the responsibilities, the KPIs and a KPI's target.
 * So this editor offers, in plain words and for this position only:
 *
 *   Add         a responsibility or a KPI, under one of the role's KRAs
 *   Change      a line's wording, or a KPI's target
 *   Switch off  a line of the role that does not apply here
 *   Undo        any of the three — back to what the role says
 *
 * and says in a sentence that KRAs are changed on the role, with a link there.
 *
 * THE SAME EDITOR, ONE LAYER DOWN (spec §16.2): given an `employeeId` it edits
 * ONE PERSON's job — their position's, with their own changes on top — with the
 * same four verbs, said "for this person". A position's own changes show on a
 * person's job marked as the position's; only the person's own can be undone here.
 *
 * EVERY CHANGE IS DATED (spec §16.1): each dialog has "Takes effect" — today by
 * default, a later day if chosen, a past day only for the Owner with a reason.
 * Given an `asOf` other than today the job is shown read-only.
 *
 * It replaced the "Overrides" tab, which exposed the storage: ADD / OVERRIDE /
 * SUPPRESS badges, a definition picker and a raw JSON box. The rows underneath
 * are the same (`hrms_position_content_overrides`, written through
 * `/positions/:id/job-content/*`); what changed is that nobody has to know the
 * three verbs or type JSON to say "this position's target is 99%".
 */
import { useEffect, useState, type ReactNode } from 'react';
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
  jobContentApi, type JobContentData, type JobContentScope, type JobKra, type JobLine, type JobLineKind, type JobSubject, type TargetInput,
} from '../api/jobContent';
import { TakesEffectField } from './JobDating';
import { datedBody, longDay, takesEffectReady, todayIso } from './jobDates';
import { positionsApi } from '../api/positions';
import { useCan } from '../access/can';
import { JobContent } from './JobContent';
import { useJobContent } from './useJobContent';
import { KpiTargetInput } from './KpiTargetInput';
import { EMPTY_DRAFT, draftOf, ruleOf, sameDraft, targetBody, type TargetDraft, type TargetRule } from './kpiTarget';

const NOUN: Record<JobLineKind, string> = { RESPONSIBILITY: 'responsibility', KPI: 'KPI' };
/** A KPI line's rule — its library KPI's measured in, unit and which way. A KPI added here has its own (unset) one. */
const lineRule = (line: JobLine | null): TargetRule => ruleOf(line ? { measurementType: line.measurementType, unit: line.unit, direction: line.direction } : null);
const NO_RULE: TargetRule = { measure: null, unit: null, direction: null };
/** A draft -> what is sent. Emptied: "tracked, no target" (the older form says it). */
function targetOf(d: TargetDraft, rule: TargetRule): TargetInput {
  return targetBody(d, rule) ?? { operator: 'INFO', value: null };
}

type DialogState =
  | { mode: 'add'; kind: JobLineKind; kra: JobKra | null }
  | { mode: 'change'; line: JobLine }
  | { mode: 'off'; line: JobLine }
  | null;

/**
 * The frame round the editor: a card on the position page, nothing but the
 * Edit / Done button in the org chart panel (which has its own heading).
 */
function Shell({ embedded, action, children, person }: { embedded: boolean; action: ReactNode; children: ReactNode; person: boolean }) {
  if (embedded) {
    return (
      <Box data-seateditor="">
        {action && (
          <Stack direction="row" justifyContent="flex-end" sx={{ mb: 0.75 }}>
            {action}
          </Stack>
        )}
        {children}
      </Box>
    );
  }
  return (
    <SectionCard
      title="Job content"
      subtitle={
        person
          ? 'What this person is expected to do: their position’s KRAs, responsibilities and KPIs, with anything changed for them alone marked on the line.'
          : 'The KRAs, responsibilities and KPIs of this position: what its role says, with anything this position does differently marked on the line.'
      }
      action={action}
    >
      {children}
    </SectionCard>
  );
}

export function SeatJobContentEditor({
  positionId = 0,
  employeeId,
  company,
  canManage: canManageProp,
  startEditing = false,
  onChanged,
  embedded = false,
  onOpenRole,
  asOf,
  scope = 'hr',
}: {
  /**
   * `team`: a manager editing a position BELOW them, on their own chart. The
   * same four actions through `/user/me/team/…`; nothing here then points at a
   * role or any other HR screen, because that login cannot open one.
   */
  scope?: JobContentScope;
  /**
   * In the org chart's 500px panel: no card round it, tighter lines, sections
   * folded until opened. Same data, same four actions, same endpoints.
   */
  embedded?: boolean;
  /** Where "open the role" goes. Omitted: the role's page. The panel passes its own role view. */
  onOpenRole?: (roleId: number, title: string) => void;
  /** Read the content as at a date (the chart's). Default today. Another day is read-only. */
  asOf?: string;
  positionId?: number;
  /** One person's job instead of a position's (spec §16.2). */
  employeeId?: number;
  company: string;
  /**
   * The caller says the person may change this position's content. On the HR
   * screens that also needs `can.positions.edit`, checked again here; on the
   * `team` scope it is the employee's own team rule (spec §7), not an HR right.
   * Without it the tab is the read-only view.
   */
  canManage: boolean;
  /** Arrive in edit mode (the Departments screen's Edit button). */
  startEditing?: boolean;
  /** After any change, so the page can refresh what it shows about the position. */
  onChanged?: (content: JobContentData) => void;
}) {
  const person = employeeId != null;
  const subject: JobSubject = person ? { type: 'person', id: employeeId } : { type: 'position', id: positionId };
  const ownLayer = person ? 'PERSON' : 'POSITION';
  // One vocabulary everywhere. `t` says "this person" where the job is one person's.
  const t = (text: string) => (person ? text.replace(/this position/g, 'this person').replace(/This position/g, 'This person') : text);
  const toast = useToast();
  const { data, error, loading, reload, setData } = useJobContent({ type: person ? 'person' : 'position', id: subject.id }, asOf, scope);
  const team = scope === 'team';
  const can = useCan();
  // HR scope: positions.edit for a position, employees.edit for a person. Team scope: the server's team rule decides.
  // Another day than today is read-only: changes are made on today's view.
  const readOnly = Boolean(asOf) && asOf !== todayIso();
  const canManage = canManageProp && !readOnly && !(person && data?.notInPosition) && (team || (person ? can.employees.edit : can.positions.edit));
  const [editing, setEditing] = useState(startEditing && canManage);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; line: JobLine } | null>(null);

  // Form state, shared by the three dialogs (only one is ever open).
  const [text, setText] = useState('');
  const [kraId, setKraId] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState<TargetDraft>({ ...EMPTY_DRAFT, words: true });
  const [targetAtOpen, setTargetAtOpen] = useState<TargetDraft>({ ...EMPTY_DRAFT, words: true });
  const [day, setDay] = useState(todayIso());

  useEffect(() => {
    if (!dialog) return;
    setReason('');
    setDay(todayIso());
    if (dialog.mode === 'add') {
      setText('');
      setKraId(dialog.kra?.definitionId ?? '');
      setTarget({ ...EMPTY_DRAFT, words: true });
      setTargetAtOpen({ ...EMPTY_DRAFT, words: true });
    } else {
      setText(dialog.line.name);
      const start = draftOf(dialog.line, lineRule(dialog.line));
      setTarget(start);
      setTargetAtOpen(start);
    }
  }, [dialog]);

  const done = (content: JobContentData, message: string) => {
    setData(content);
    onChanged?.(content);
    toast.success(day > todayIso() ? `${message} It takes effect on ${longDay(day)}.` : message);
  };
  /** A line this layer wrote (or changed): what Undo takes back. */
  const owned = (line: JobLine) => line.mark != null && (line.markLayer ?? 'POSITION') === ownLayer;

  const undo = async (line: JobLine) => {
    if (line.definitionId == null) return;
    try {
      setDay(todayIso());
      done(
        await jobContentApi.undo(subject, { kind: line.kind, definitionId: line.definitionId }, scope),
        line.mark === 'ADDED' ? t('Removed from this position.') : person ? 'Back to what their position says.' : 'Back to what the role says.',
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That could not be undone.');
    }
  };

  const submit = async () => {
    if (!dialog) return;
    const dated = datedBody(day, reason);
    if (dialog.mode === 'add') {
      const body = {
        kind: dialog.kind,
        text: text.trim(),
        parentKraDefinitionId: kraId === '' ? null : kraId,
        target: dialog.kind === 'KPI' ? targetBody(target, NO_RULE) : null,
        ...dated,
      };
      done(await jobContentApi.add(subject, body, scope), t('Added for this position only.'));
    } else if (dialog.mode === 'change') {
      const { line } = dialog;
      if (line.definitionId == null) return;
      const reworded = text.trim() !== line.name.trim();
      const retargeted = line.kind === 'KPI' && !sameDraft(target, targetAtOpen);
      done(
        await jobContentApi.change(subject, {
          kind: line.kind,
          definitionId: line.definitionId,
          ...(reworded ? { text: text.trim() } : {}),
          ...(retargeted ? { target: targetOf(target, lineRule(line)) } : {}),
          ...dated,
        }, scope),
        t('Changed for this position only.'),
      );
    } else {
      const { line } = dialog;
      if (line.definitionId == null) return;
      done(
        await jobContentApi.switchOff(subject, { kind: line.kind, definitionId: line.definitionId, ...dated }, scope),
        t('Switched off for this position.'),
      );
    }
    setDialog(null);
  };

  // Said in every dialog, so "this position only" has a number beside it.
  const otherSeats = data?.otherSeatsOnRole ?? null;
  const others = person
    ? 'Their position, and everyone else holding the role, stays as it is. If they move to another position, these changes stay behind.'
    : otherSeats == null
      ? t('The role, and every other position holding it, stays as it is.')
      : otherSeats === 0
        ? t('This is the only position holding the role — the role itself stays as it is.')
        : t(`The role and the ${otherSeats} other position${otherSeats === 1 ? '' : 's'} holding it stay as they are.`);

  const changeDirty =
    dialog?.mode === 'change' &&
    (text.trim() !== dialog.line.name.trim() || (dialog.line.kind === 'KPI' && !sameDraft(target, targetAtOpen)));

  const whenField = (
    <TakesEffectField day={day} onDay={setDay} reason={reason} onReason={setReason} reasonLabel={null} />
  );
  const ready = takesEffectReady(day, reason);

  const lineActions = (line: JobLine) => (
    <Tooltip title={t('Change for this position')}>
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
        {t('Add a responsibility for this position')}
      </Button>
      <Button size="small" startIcon={<AddRounded sx={{ fontSize: 16 }} />} onClick={() => setDialog({ mode: 'add', kind: 'KPI', kra })} sx={{ textTransform: 'none' }}>
        {t('Add a KPI for this position')}
      </Button>
    </Stack>
  );

  // A link to the role is a link to another area: only with roles.view.
  const roleLink = team || !can.roles.view ? null : data?.roleId && onOpenRole ? (
    <Box
      component="button"
      type="button"
      data-openrole=""
      onClick={() => onOpenRole(data.roleId!, data.roleTitle ?? 'Role')}
      sx={{ border: 0, background: 'none', p: 0, font: 'inherit', cursor: 'pointer', color: 'var(--c-primary-700)', textDecoration: 'underline', textAlign: 'left' }}
    >
      {`Open the role${data.roleTitle ? ` “${data.roleTitle}”` : ''}`}
    </Box>
  ) : data?.roleId ? (
    <Box component={RouterLink} to={`/${company}/cf_hrms/roles/${data.roleId}?tab=content`} sx={{ color: 'var(--c-primary-700)' }}>
      {`Open the role${data.roleTitle ? ` “${data.roleTitle}”` : ''}`}
    </Box>
  ) : null;

  return (
    <Shell
      embedded={embedded}
      person={person}
      action={
        canManage && data ? (
          editing ? (
            <Button size="small" variant="contained" startIcon={<DoneRounded />} onClick={() => setEditing(false)}>
              Done
            </Button>
          ) : (
            <Button size="small" variant="outlined" startIcon={<EditRounded />} onClick={() => setEditing(true)}>
              {t('Edit for this position')}
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
          {editing && (
            <Box
              data-seatscope=""
              role="status"
              sx={{ fontSize: 13, lineHeight: 1.5, color: 'var(--c-info-800)', background: 'var(--c-info-50)', borderRadius: 'var(--r-sm)', px: 1.25, py: 0.75, mb: 1 }}
            >
              <strong>Changes here are for this position only.</strong> {others}
            </Box>
          )}
          <Typography data-krarule="" sx={{ fontSize: embedded ? 12.5 : 13, color: 'var(--c-text-2)', lineHeight: 1.6, mb: embedded ? 1 : 1.5, maxWidth: 760 }}>
            {editing
              ? t('For this position alone you can add a responsibility or a KPI, change a line’s wording or a KPI’s target, or switch off a line that does not apply — use the ⋮ on a line. ')
              : ''}
            {t('KRAs are set on the role and are the same for every position that holds it, so they cannot be added or removed')}{' '}
            here{person ? ' — nor for one person' : ''}. {roleLink}
            {roleLink ? ' to change them.' : ''}
          </Typography>

          {(data.kraExceptions?.length ?? 0) > 0 && (
            <Callout tone="warning" title={t('This position has an older exception on a KRA')}>
              <Box sx={{ fontSize: 13, lineHeight: 1.6 }}>
                {t('It was recorded before KRAs were fixed at the role. Remove it to bring this position’s KRAs back in line')}
                with the role.
              </Box>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {data.kraExceptions!.map((x) => (
                  <Stack key={x.overrideId} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography sx={{ fontSize: 13 }}>
                      {x.action === 'ADD' ? 'Added' : x.action === 'SUPPRESS' ? 'Switched off' : 'Changed'}: {x.name ?? 'a KRA'}
                    </Typography>
                    {canManage && !team && !person && (
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
            dense={embedded}
            initiallyOpen={embedded ? 'auto' : 'all'}
            lineActions={editing ? lineActions : undefined}
            sectionFooter={editing ? sectionFooter : undefined}
          />

          {(data.ignored?.length ?? 0) > 0 && (
            <Box sx={{ mt: 1.5, fontSize: 12.5, color: 'var(--c-text-2)' }}>
              {data.ignored!.map((i) => (
                <Box key={i.overrideId}>
                  {t('A change recorded on this position is not taking effect')}
                  {i.name ? ` (${i.name})` : ''}: {i.why}
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
              secondary={t('For this position only')}
            />
          </MenuItem>
        )}
        {menu && menu.line.mark !== 'OFF' && !owned(menu.line) && (
          <MenuItem
            onClick={() => {
              setDialog({ mode: 'off', line: menu.line });
              setMenu(null);
            }}
          >
            <ListItemText
              primary={t('Switch off for this position…')}
              secondary={person ? 'Their position keeps it; this person does not do it' : 'The role keeps it; this position does not do it'}
            />
          </MenuItem>
        )}
        {menu && owned(menu.line) && (
          <MenuItem
            onClick={() => {
              void undo(menu.line);
              setMenu(null);
            }}
          >
            <ListItemText
              primary={
                menu.line.mark === 'ADDED'
                  ? t('Remove from this position')
                  : menu.line.mark === 'OFF'
                    ? 'Undo — switch it back on'
                    : person
                      ? 'Undo — back to what their position says'
                      : 'Undo — back to what the role says'
              }
            />
          </MenuItem>
        )}
      </Menu>

      <FormDialog
        open={dialog?.mode === 'add'}
        title={dialog?.mode === 'add' ? t(`Add a ${NOUN[dialog.kind]} for this position`) : ''}
        subtitle={t(`Only this position gets it. ${others}`)}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitLabel={t('Add for this position')}
        submitDisabled={!text.trim() || !ready}
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
            {dialog.kind === 'KPI' && <KpiTargetInput rule={NO_RULE} draft={target} onChange={setTarget} kpiName={text} />}
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
                  : t('One of the role’s KRAs. A position cannot have a KRA of its own.')
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
              label={t('Why this position differs (optional)')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              fullWidth
              size="small"
              helperText={day < todayIso() ? 'Required for a day that has passed: why it is dated then.' : t('Printed beside the line, and in the position’s job description.')}
            />
            {whenField}
          </>
        )}
      </FormDialog>

      <FormDialog
        open={dialog?.mode === 'change'}
        title={dialog?.mode === 'change' ? t(`Change this ${NOUN[dialog.line.kind]} for this position`) : ''}
        subtitle={t(`Only this position changes. ${others}`)}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitLabel={t('Change for this position')}
        submitDisabled={!text.trim() || !changeDirty || !ready}
        enterSubmits={false}
      >
        {dialog?.mode === 'change' && (
          <>
            <TextField
              label={t('Wording for this position')}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 2000))}
              required
              autoFocus
              fullWidth
              multiline
              minRows={2}
              size="small"
              helperText={
                !owned(dialog.line)
                  ? t('Rewording it switches the role’s line off for this position and puts yours in its place.')
                  : t('This line belongs to this position only.')
              }
            />
            {dialog.line.kind === 'KPI' && (
              <KpiTargetInput
                rule={lineRule(dialog.line)}
                draft={target}
                onChange={setTarget}
                kpiName={dialog.line.name}
                label={t('Target for this position')}
                helper={!owned(dialog.line) ? `${person ? 'Their position’s' : 'The role’s'} target is: ${dialog.line.targetText ?? 'not set'}` : undefined}
              />
            )}
            <TextField
              label={t('Why this position differs (optional)')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              fullWidth
              size="small"
              helperText={day < todayIso() ? 'Required for a day that has passed: why it is dated then.' : undefined}
            />
            {whenField}
          </>
        )}
      </FormDialog>

      <FormDialog
        open={dialog?.mode === 'off'}
        title={dialog?.mode === 'off' ? t(`Switch off this ${NOUN[dialog.line.kind]} for this position?`) : ''}
        subtitle={`${person ? 'Their position keeps it.' : 'The role keeps it.'} ${others} You can switch it back on at any time.`}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitLabel={t('Switch off for this position')}
        submitDisabled={!ready}
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
              helperText={day < todayIso() ? 'Required for a day that has passed: why it is dated then.' : undefined}
            />
            {whenField}
          </>
        )}
      </FormDialog>
    </Shell>
  );
}

export default SeatJobContentEditor;
