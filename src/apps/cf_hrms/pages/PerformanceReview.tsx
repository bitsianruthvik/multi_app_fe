/**
 * One review (CF_HRMS_HIRING_SPEC.md §20.3): a check-in for one slot of a plan,
 * or the final review of the period.
 *
 * The same page serves three logins:
 *   mode 'hr'    /reviews/:id — performance view; writes the manager's part with edit
 *   mode 'team'  /my-place/team-reviews/:id — a manager on a review of someone below them
 *   mode 'self'  /my-place/reviews/:id — the person: writes ONLY their comment and blockers
 *                while the review is open, then says their part is done
 *
 * What each login may do is the server's answer (`review.can`); nothing here
 * decides it. A DONE review is read-only — the Owner may change the manager's part
 * with a reason, and the page says who changed it and why.
 *
 * Top to bottom: who and what; the plan's KPIs (target, actual, achievement, band)
 * and its score — the same numbers as the plan page; the person's part; the
 * manager's part and the rating; the actions; Close.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import {
  Callout, ConfirmDialog, DetailHeader, DetailLayout, DetailSkeleton, ErrorNotice, FactItem, FormDialog, PromptDialog, SectionCard,
  ToneBadge, useDetailTitle, useToast,
} from '@shared/ui';
import { REVIEW_SOURCES, type Action, type OwnerOption, type ReviewPage } from '../api/reviews';
import { ActionDialog, ActionsList, DueChip, ReviewKpiTable, ReviewStatusBadge } from '../components/performance/ReviewParts';
import { periodDates } from '../components/performance/planWords';
import { longDay } from '../components/jobDates';

export type ReviewMode = 'hr' | 'team' | 'self';

/** A text box that saves on demand, says "Saved", and shows the server's refusal. */
function PartField({ label, value, onChange, disabled, placeholder }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string }) {
  return (
    <TextField
      label={label} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
      multiline minRows={3} fullWidth placeholder={placeholder}
      slotProps={{ htmlInput: { maxLength: 4000 } }}
    />
  );
}

function ReadText({ label, text, empty }: { label: string; text: string | null; empty: string }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-2)', mb: 0.25 }}>{label}</Typography>
      {text
        ? <Typography sx={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{text}</Typography>
        : <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-3)' }}>{empty}</Typography>}
    </Box>
  );
}

export default function PerformanceReview({ mode = 'hr' }: { mode?: ReviewMode }) {
  const { company = '', id } = useParams<{ company: string; id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const reviewId = Number(id);
  const src = REVIEW_SOURCES[mode];

  const [data, setData] = useState<ReviewPage | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  // The person's part
  const [own, setOwn] = useState({ comment: '', blockers: '' });
  // The manager's part
  const [mgr, setMgr] = useState<{ comment: string; rating: number | '' }>({ comment: '', rating: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [closing, setClosing] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [amending, setAmending] = useState(false);
  const [amend, setAmend] = useState<{ comment: string; rating: number | ''; reason: string }>({ comment: '', rating: '', reason: '' });
  const [owners, setOwners] = useState<OwnerOption[] | null>(null);
  const [actionDialog, setActionDialog] = useState<{ action: Action | null } | null>(null);

  const load = useCallback(async () => {
    if (!Number.isInteger(reviewId) || reviewId <= 0) { setError(new Error('That is not a review.')); setLoading(false); return; }
    try {
      const r = await src.review(reviewId);
      setData(r);
      setOwn({ comment: r.review.employeeComment ?? '', blockers: r.review.blockers ?? '' });
      setMgr({ comment: r.review.managerComment ?? '', rating: r.review.ratingValue ?? '' });
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [reviewId, src]);
  useEffect(() => { void load(); }, [load]);

  const rv = data?.review;
  useDetailTitle(rv ? `${rv.employeeName} · ${rv.title}` : undefined);

  const backTo = mode === 'hr' ? `/${company}/cf_hrms/reviews` : `/${company}/cf_hrms/my-place`;
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate(backTo));
  const backLabel = mode === 'hr' ? 'Back to reviews' : 'Back to my place';

  const ensureOwners = async () => {
    if (owners || !src.planReviews || !rv) return owners ?? [];
    const pr = await src.planReviews(rv.planId);
    setOwners(pr.owners);
    return pr.owners;
  };

  if (loading && !data) return <DetailSkeleton />;
  if (!data || !rv) {
    return (
      <>
        <Button startIcon={<ArrowBackRounded />} size="small" onClick={goBack}>{backLabel}</Button>
        <Box sx={{ mt: 2 }}><ErrorNotice error={error} onRetry={() => void load()} /></Box>
      </>
    );
  }
  const c = rv.can;
  const isFinal = rv.kind === 'FINAL';
  const scale = data.ratingScale;
  const planPath = mode === 'hr' ? `/${company}/cf_hrms/plans/${rv.planId}` : mode === 'team' ? `/${company}/cf_hrms/my-place/team-plans/${rv.planId}` : null;
  const personWord = mode === 'self' ? 'Your part' : `${rv.employeeName.split(' ')[0] || 'The person'}’s part`;

  const ownDirty = own.comment !== (rv.employeeComment ?? '') || own.blockers !== (rv.blockers ?? '');
  const mgrDirty = mgr.comment !== (rv.managerComment ?? '') || (isFinal && mgr.rating !== (rv.ratingValue ?? ''));

  const saveOwn = async () => {
    if (!src.writeOwn) return;
    setSaving(true); setSaveError(null);
    try {
      await src.writeOwn(reviewId, { employeeComment: own.comment, blockers: own.blockers });
      toast.success('Saved.');
      await load();
    } catch (e) { setSaveError(e); } finally { setSaving(false); }
  };
  const saveMgr = async () => {
    if (!src.writeManager) return;
    setSaving(true); setSaveError(null);
    try {
      await src.writeManager(reviewId, { managerComment: mgr.comment, ...(isFinal && mgr.rating !== (rv.ratingValue ?? '') ? { rating: mgr.rating === '' ? null : mgr.rating } : {}) });
      toast.success('Saved.');
      await load();
    } catch (e) { setSaveError(e); } finally { setSaving(false); }
  };

  const banner = rv.status === 'DONE'
    ? (
      <Callout tone="success" title={`Done${rv.closedAt ? ` on ${longDay(rv.closedAt)}` : ''}${rv.closedBy ? ` — closed by ${rv.closedBy}` : ''}`}>
        {rv.amendedAt
          ? `Changed after closing by ${rv.amendedBy ?? 'the Owner'} on ${longDay(rv.amendedAt)}: ${rv.amendReason}`
          : 'It is kept as it was closed.'}
      </Callout>
    )
    : rv.status === 'CANCELLED'
      ? <Callout tone="neutral" title="This review was cancelled">{rv.cancelReason ?? 'It is kept as it was.'}</Callout>
      : rv.status === 'EMPLOYEE_DONE'
        ? <Callout tone="info" title={mode === 'self' ? 'You have finished your part' : `${rv.employeeName} has written their part`}>{mode === 'self' ? 'Your manager closes the review.' : 'Read it, write yours and close the review.'}</Callout>
        : null;

  return (
    <>
      <Button startIcon={<ArrowBackRounded />} size="small" onClick={goBack} sx={{ mb: 1 }}>{backLabel}</Button>
      {error != null && <ErrorNotice error={error} sx={{ mb: 2 }} />}
      <DetailLayout
        header={(
          <DetailHeader
            code={rv.employeeCode ?? undefined}
            title={rv.employeeName}
            badges={<><ToneBadge tone="neutral" label={rv.kindLabel} noIcon /><ReviewStatusBadge status={rv.status} /></>}
            subtitle={[[rv.positionCode, rv.positionTitle ?? rv.roleTitle].filter(Boolean).join(' · '), rv.departmentName].filter(Boolean).join(' — ') || undefined}
            actions={(c.close || c.cancel || c.amend) && (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {c.close && <Button size="small" variant="contained" onClick={() => setClosing(true)}>Close review</Button>}
                {c.cancel && <Button size="small" variant="outlined" color="error" onClick={() => setCancelling(true)}>Cancel check-in</Button>}
                {c.amend && (
                  <Button size="small" variant="outlined" onClick={() => { setAmend({ comment: rv.managerComment ?? '', rating: rv.ratingValue ?? '', reason: '' }); setAmending(true); }}>
                    Change after closing
                  </Button>
                )}
              </Stack>
            )}
            facts={(
              <>
                <FactItem label={isFinal ? 'Period' : 'Check-in for'}>
                  <Box component="span">{rv.slot ? rv.slot.name : rv.periodName}</Box>
                  <Typography component="span" sx={{ display: 'block', fontSize: 12.5, color: 'var(--c-text-2)' }}>
                    {rv.slot ? periodDates(rv.slot.start, rv.slot.end) : periodDates(rv.period.start, rv.period.end)}
                  </Typography>
                </FactItem>
                <FactItem label="Due"><DueChip bare dueDate={rv.dueDate} overdue={rv.overdue} daysOverdue={rv.daysOverdue} open={rv.status === 'OPEN' || rv.status === 'EMPLOYEE_DONE'} /></FactItem>
                <FactItem label="Manager" value={rv.managerName ?? (rv.managerPositionCode ? `${rv.managerPositionCode} — vacant` : 'None recorded')} />
                {isFinal && <FactItem label="Rating" value={rv.rating ? `${rv.rating.value} — ${rv.rating.label}` : 'Not rated yet'} />}
                {planPath && (
                  <FactItem label="Plan">
                    <Box component={RouterLink} to={planPath} sx={{ color: 'var(--c-primary-600)' }}>Open the plan</Box>
                  </FactItem>
                )}
              </>
            )}
          />
        )}
        beforeTabs={banner ? <Box sx={{ mb: 1 }}>{banner}</Box> : undefined}
      >
        <Stack spacing={2}>
          <SectionCard title="How the plan is going" subtitle="Targets, actuals and achievement, read-only — the same numbers as the plan.">
            <ReviewKpiTable rows={data.kpis} planScore={data.planScore} line={data.tableLine} />
          </SectionCard>

          <SectionCard
            title={personWord}
            subtitle={mode === 'self' && c.writeOwn ? 'Write how the period went for you, and anything in your way. Only you can write this part.' : 'Written by the person.'}
          >
            {mode === 'self' && c.writeOwn ? (
              <Stack spacing={1.5} data-own-part="">
                <PartField label="Your comment" value={own.comment} onChange={(v) => setOwn((o) => ({ ...o, comment: v }))} disabled={saving} placeholder="What went well, what did not" />
                <PartField label="Blockers and support needed" value={own.blockers} onChange={(v) => setOwn((o) => ({ ...o, blockers: v }))} disabled={saving} placeholder="Anything in your way; help you need" />
                {saveError != null && <ErrorNotice error={saveError} />}
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                  <Button size="small" variant="outlined" disabled={!ownDirty || saving} onClick={() => void saveOwn()}>{saving ? 'Saving…' : 'Save'}</Button>
                  {c.finishOwn && (
                    <Button size="small" variant="contained" disabled={saving || ownDirty || !(rv.employeeComment ?? '').trim()} onClick={() => setFinishing(true)}>
                      My part is done
                    </Button>
                  )}
                  {ownDirty && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Save first, then say your part is done.</Typography>}
                </Stack>
              </Stack>
            ) : (
              <>
                <ReadText label="Comment" text={rv.employeeComment} empty={rv.status === 'OPEN' ? 'Not written yet.' : 'Nothing written.'} />
                <ReadText label="Blockers and support needed" text={rv.blockers} empty="None given." />
              </>
            )}
          </SectionCard>

          <SectionCard title="The manager’s part" subtitle={c.writeManager ? (isFinal ? 'Your comment and the rating. Close the review when both are done.' : 'Your comment. Close the check-in when you are done.') : undefined}>
            {c.writeManager ? (
              <Stack spacing={1.5} data-manager-part="">
                <PartField label="Manager’s comment" value={mgr.comment} onChange={(v) => setMgr((m) => ({ ...m, comment: v }))} disabled={saving} />
                {isFinal && (
                  <TextField select label="Rating" slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} value={mgr.rating} onChange={(e) => setMgr((m) => ({ ...m, rating: e.target.value === '' ? '' : Number(e.target.value) }))} disabled={saving} sx={{ maxWidth: 360 }}>
                    <MenuItem value="">Not rated</MenuItem>
                    {scale.map((s) => <MenuItem key={s.value} value={s.value}>{s.value} — {s.label}</MenuItem>)}
                  </TextField>
                )}
                {saveError != null && mode !== 'self' && <ErrorNotice error={saveError} />}
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" disabled={!mgrDirty || saving} onClick={() => void saveMgr()}>{saving ? 'Saving…' : 'Save'}</Button>
                </Stack>
              </Stack>
            ) : (
              <>
                <ReadText label="Comment" text={rv.managerComment} empty={rv.status === 'DONE' ? 'Nothing written.' : 'Not written yet.'} />
                {isFinal && <ReadText label="Rating" text={rv.rating ? `${rv.rating.value} — ${rv.rating.label}` : null} empty="Not rated yet." />}
              </>
            )}
          </SectionCard>

          <SectionCard
            title="Actions"
            subtitle={mode === 'self' ? 'What was agreed. Mark the ones you own done from My place.' : 'What was agreed — who does it, by when.'}
            actions={c.addAction && src.addAction ? (
              <Button size="small" onClick={async () => { try { await ensureOwners(); setActionDialog({ action: null }); } catch (e) { setError(e); } }}>Add an action</Button>
            ) : undefined}
          >
            <ActionsList
              actions={data.actions}
              empty="No actions yet."
              onDone={src.actionDone && mode !== 'self' ? async (a, note) => { await src.actionDone!(a.id, note); toast.success('Action done.'); await load(); } : undefined}
              onDrop={src.dropAction ? async (a, note) => { await src.dropAction!(a.id, note); toast.success('Action dropped.'); await load(); } : undefined}
              onChange={src.changeAction ? (a) => { void ensureOwners().then(() => setActionDialog({ action: a })).catch(setError); } : undefined}
            />
          </SectionCard>
        </Stack>
      </DetailLayout>

      {actionDialog && owners && (
        <ActionDialog
          open
          action={actionDialog.action}
          owners={owners}
          onClose={() => setActionDialog(null)}
          onSubmit={async (body) => {
            if (actionDialog.action) await src.changeAction!(actionDialog.action.id, body);
            else await src.addAction!(rv.planId, { ...body, reviewId });
            toast.success(actionDialog.action ? 'Action changed.' : 'Action added.');
            await load();
          }}
        />
      )}

      <ConfirmDialog
        open={closing}
        title={isFinal ? 'Close this final review?' : 'Close this check-in?'}
        entityName={`${rv.employeeName} · ${rv.title}`}
        body={`${isFinal ? (mgr.rating === '' ? 'Choose a rating first — a final review is closed with one. ' : `Rating: ${scale.find((s) => s.value === mgr.rating)?.label ?? mgr.rating}. `) : ''}Once closed, the review is kept as it is${mgrDirty ? '; what you have typed is saved with it' : ''}.`}
        confirmLabel="Close review"
        onClose={() => setClosing(false)}
        onConfirm={async () => {
          await src.close!(reviewId, mgrDirty ? { managerComment: mgr.comment, ...(isFinal && mgr.rating !== '' ? { rating: mgr.rating } : {}) } : {});
          toast.success('Review closed.');
          await load();
        }}
      />
      <ConfirmDialog
        open={finishing}
        title="Is your part done?"
        body="Your manager is told it is ready. After this you cannot change your comment or blockers."
        confirmLabel="My part is done"
        onClose={() => setFinishing(false)}
        onConfirm={async () => { await src.finishOwn!(reviewId); toast.success('Your part is done.'); await load(); }}
      />
      <PromptDialog
        open={cancelling}
        title="Cancel this check-in?"
        body="A cancelled check-in is kept, read-only. Its slot can have a new one."
        label="Reason (optional)"
        required={false}
        confirmLabel="Cancel check-in"
        danger
        onClose={() => setCancelling(false)}
        onConfirm={async (reason) => { await src.cancel!(reviewId, reason.trim() || undefined); toast.success('Check-in cancelled.'); await load(); }}
      />
      <FormDialog
        open={amending}
        title="Change a review that is done"
        subtitle="Only the Owner can. The review stays done; the change and its reason are recorded."
        onClose={() => setAmending(false)}
        submitLabel="Save the change"
        enterSubmits={false}
        submitDisabled={!amend.reason.trim()}
        onSubmit={async () => {
          await src.writeManager!(reviewId, {
            managerComment: amend.comment,
            ...(isFinal && amend.rating !== (rv.ratingValue ?? '') ? { rating: amend.rating === '' ? null : amend.rating } : {}),
            reason: amend.reason.trim(),
          });
          toast.success('Review changed.');
          await load();
        }}
      >
        <TextField label="Manager’s comment" value={amend.comment} onChange={(e) => setAmend((a) => ({ ...a, comment: e.target.value }))} multiline minRows={3} />
        {isFinal && (
          <TextField select label="Rating" value={amend.rating} onChange={(e) => setAmend((a) => ({ ...a, rating: e.target.value === '' ? '' : Number(e.target.value) }))}>
            {scale.map((s) => <MenuItem key={s.value} value={s.value}>{s.value} — {s.label}</MenuItem>)}
          </TextField>
        )}
        <TextField label="Why is it changed?" value={amend.reason} onChange={(e) => setAmend((a) => ({ ...a, reason: e.target.value }))} required multiline minRows={2} />
      </FormDialog>
    </>
  );
}
