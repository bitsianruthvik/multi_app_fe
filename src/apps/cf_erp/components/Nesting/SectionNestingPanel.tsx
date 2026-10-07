import { useRef, useState, type ChangeEvent } from 'react';
import { Alert, Box, Button, CircularProgress, Tooltip, Typography } from '@mui/material';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import { CfApiError } from '../../api/client';
import { fileToBase64 } from '../../api/bomSheet';
import {
  acceptSectionNesting, downloadSectionSheet, getSectionNesting, planSectionNesting, previewSectionSheet, saveSectionSheet, takeBackSectionNesting,
  type SectionNestingView, type SectionProfile, type SectionSheetResult,
} from '../../api/sectionNesting';
import { useLoad } from '../../hooks/useLoad';
import { mm, pct } from '../../lib/nesting';
import { Badge, CapsLabel, ErrorNotice, Mono, SectionCard, SkeletonRows } from '../ui';
import { ConfirmDialog } from '../ConfirmDialog';
import { useToast } from '../toastContext';
import { BarCaption, BarDiagram } from './SectionBars';
import { SectionSheetDialog } from './SectionSheetDialog';

/**
 * THE SECTIONS PART OF NESTING (CF_ERP_CUT_FROM_PLAN.md §4): the line's section
 * pieces cut to length from stock bars, one profile at a time, with saw kerf and
 * end trim; what is left over is kept as a bar offcut and used first next time.
 *
 * The same four rules as plates: a look is a look (opening reads the saved
 * plan), suggest then accept (Propose writes nothing), the screen says what
 * each button does, and a sheet is read before it is saved.
 */

const noun = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ProfileCard({ profile, kerfMm }: { profile: SectionProfile; kerfMm: number }) {
  const needed = profile.pieces.reduce((a, p) => a + p.quantity, 0);
  const plan = profile.plan;
  const scale = plan ? Math.max(...plan.bars.map((b) => b.lengthMm), 1) : 1;
  return (
    <Box data-testid="section-profile" sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', p: 1.5, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.25, minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'baseline', flexWrap: 'wrap', minWidth: 0 }}>
        <Box sx={{ fontSize: 14.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{profile.label}</Box>
        {profile.grade && <Mono chip>{profile.grade}</Mono>}
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
          {noun(needed, 'piece')} needed in {noun(profile.pieces.length, 'length')}
          {profile.stockLengths.length > 0 && <> · stock {profile.stockLengths.map((s) => mm(s.lengthMm)).join(', ')} mm</>}
          {profile.offcuts.length > 0 && <> · {noun(profile.offcuts.length, 'offcut')} to use first</>}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
        {profile.pieces.map((p) => (
          <Box key={p.cutPieceId} title={p.parts.join(', ') || undefined} sx={{
            display: 'inline-flex', gap: 0.6, alignItems: 'center', fontSize: 12, maxWidth: '100%',
            background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', px: 0.75, py: 0.2,
          }}>
            <Mono sx={{ overflowWrap: 'anywhere' }}>{p.code ?? `#${p.cutPieceId}`}</Mono>
            <span>{mm(p.lengthMm)} mm</span>
            <Box component="span" sx={{ color: 'var(--c-text-2)' }}>×{p.quantity}</Box>
          </Box>
        ))}
      </Box>
      {plan ? (
        <>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', fontSize: 13 }} data-testid="section-profile-totals">
            <span><strong>{plan.barsBought}</strong> {plan.barsBought === 1 ? 'bar' : 'bars'} to buy</span>
            <span><strong>{plan.barsFromOffcuts}</strong> from offcuts</span>
            <span>waste <strong>{pct(plan.wastePct)}</strong></span>
            <span><strong>{plan.keptOffcuts}</strong> {plan.keptOffcuts === 1 ? 'offcut' : 'offcuts'} kept</span>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1 }}>
            {plan.bars.map((b, i) => (
              <Box key={`${b.lotId ?? 'n'}-${i}`} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.4, minWidth: 0 }}>
                <BarCaption bar={b} index={i} />
                <BarDiagram bar={b} scale={scale} kerfMm={kerfMm} />
              </Box>
            ))}
          </Box>
        </>
      ) : (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No bars are laid out for this profile yet.</Typography>
      )}
    </Box>
  );
}

export function SectionNestingPanel({ orderId, lineId, canManage, onChanged }: {
  orderId: number; lineId: number;
  /** The sales-order grant. Without it the screen is a look. */
  canManage: boolean;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const saved = useLoad(() => getSectionNesting(orderId, lineId), [orderId, lineId]);
  const [proposal, setProposal] = useState<SectionNestingView | null>(null);
  const [busy, setBusy] = useState<'plan' | 'accept' | 'take' | 'download' | 'preview' | 'save' | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [confirm, setConfirm] = useState<'accept' | 'take' | null>(null);
  const [sheet, setSheet] = useState<{ name: string; base64: string; result: SectionSheetResult } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // An older backend has no such route: the page then simply has no Sections part.
  if (saved.error && (saved.error.status === 404 || saved.error.status === 0)) return null;
  if (saved.error) return <ErrorNotice error={saved.error} onRetry={saved.reload} />;
  if (!saved.data) return <SectionCard title="Sections"><SkeletonRows rows={2} /></SectionCard>;

  const view = proposal ?? saved.data;
  const profiles = view.profiles;
  const lineName = `${view.line.orderCode ?? 'order'}_line${view.line.lineNo ?? lineId}`;
  const bars = profiles.flatMap((p) => p.plan?.bars ?? []);
  const bought = bars.filter((b) => b.source === 'catalog').length;
  const fromOffcuts = bars.length - bought;
  const totalMm = bars.reduce((a, b) => a + b.lengthMm, 0);
  const wasteMm = bars.reduce((a, b) => a + b.wasteMm, 0);
  const wastePct = totalMm > 0 ? (wasteMm / totalMm) * 100 : null;
  const planned = profiles.some((p) => p.plan);
  const none = profiles.length === 0;

  const run = async (what: 'plan' | 'accept' | 'take', fn: () => Promise<void>) => {
    setBusy(what); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof CfApiError ? e : new CfApiError(0, String(e))); throw e; } finally { setBusy(null); }
  };
  const propose = () => run('plan', async () => { setProposal(await planSectionNesting(orderId, lineId)); }).catch(() => undefined);
  const accept = () => run('accept', async () => {
    await acceptSectionNesting(orderId, lineId);
    setProposal(null); saved.reload(); onChanged?.();
    toast.success('Sections accepted. The bars are now the plan the saw cuts to.');
  });
  const takeBack = () => run('take', async () => {
    await takeBackSectionNesting(orderId, lineId);
    setProposal(null); saved.reload(); onChanged?.();
    toast.success('Section nesting taken back.');
  });
  const download = async () => {
    setBusy('download'); setError(null);
    try { await downloadSectionSheet(orderId, lineId, lineName); } catch (e) { setError(e as CfApiError); } finally { setBusy(null); }
  };
  const blockedBy = (e: unknown): SectionSheetResult | null => (e instanceof CfApiError && e.problems.length
    ? { applied: false, canSave: false, needsForce: false, problems: e.problems, bars: [], coverage: [] } : null);
  const chooseSheet = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('preview'); setError(null);
    let base64 = '';
    try {
      base64 = await fileToBase64(file);
      setSheet({ name: file.name, base64, result: await previewSectionSheet(orderId, lineId, base64, file.name) });
    } catch (e) {
      const result = blockedBy(e);
      if (result) setSheet({ name: file.name, base64, result }); else setError(e as CfApiError);
    } finally { setBusy(null); }
  };
  const saveSheet = async (force: boolean) => {
    if (!sheet) return;
    setBusy('save');
    try {
      await saveSectionSheet(orderId, lineId, sheet.base64, sheet.name, force);
      setSheet(null); setProposal(null); saved.reload(); onChanged?.();
      toast.success('Sheet saved. Its bars replace the ones this line had.');
    } catch (e) {
      const result = blockedBy(e);
      if (result) setSheet({ ...sheet, result }); else { setSheet(null); setError(e as CfApiError); }
    } finally { setBusy(null); }
  };

  const disabled = busy != null;
  const settings = view.settings;
  return (
    <SectionCard
      title="Sections"
      subtitle={none
        ? undefined
        : `Parts cut to length from stock bars · saw cut ${mm(settings.sawKerfMm)} mm · ${mm(settings.endTrimMm)} mm trimmed off each end · leftovers of ${mm(settings.minOffcutMm)} mm or more are kept`}
      actions={none ? undefined : (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Tooltip title="Lay the lengths out on stock bars. Nothing is written until you accept.">
            <span>
              <Button variant={proposal ? 'outlined' : 'contained'} disabled={!canManage || disabled} onClick={propose}
                startIcon={busy === 'plan' ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeRounded />}>Propose</Button>
            </span>
          </Tooltip>
          <Tooltip title={proposal ? 'Write this plan: the bars, the cuts and the offcuts.' : 'Propose first, then accept what you see.'}>
            <span>
              <Button variant="contained" disabled={!canManage || disabled || !proposal || !planned} onClick={() => setConfirm('accept')}
                startIcon={busy === 'accept' ? <CircularProgress size={14} color="inherit" /> : <TaskAltRounded />}>Accept</Button>
            </span>
          </Tooltip>
          {saved.data.accepted && (
            <Button variant="outlined" color="inherit" disabled={!canManage || disabled} onClick={() => setConfirm('take')}
              startIcon={busy === 'take' ? <CircularProgress size={14} color="inherit" /> : <UndoRounded />}>Take back</Button>
          )}
          <Button variant="outlined" disabled={disabled} onClick={download}
            startIcon={busy === 'download' ? <CircularProgress size={14} color="inherit" /> : <DownloadRounded />}>Download sheet</Button>
          <Button variant="outlined" disabled={!canManage || disabled} onClick={() => input.current?.click()}
            startIcon={busy === 'preview' ? <CircularProgress size={14} color="inherit" /> : <UploadFileRounded />}>Upload sheet</Button>
          <input ref={input} type="file" accept=".xlsx" hidden data-testid="section-sheet-input" onChange={chooseSheet} />
        </Box>
      )}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}>
        <ErrorNotice error={error} sx={{ mb: 0 }} />
        {view.problems.length > 0 && (
          <Alert severity="warning" data-testid="section-problems">
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.4, overflowWrap: 'anywhere' }}>
              {view.problems.map((p) => <li key={p}>{p}</li>)}
            </Box>
          </Alert>
        )}
        {none ? (
          <Typography data-testid="no-section-parts" sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>This line has no parts cut from sections.</Typography>
        ) : (
          <>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              {proposal
                ? <Badge family="info" label="A proposal — not saved" />
                : saved.data.accepted ? <Badge family="success" label={saved.data.acceptedAt ? `Accepted ${new Date(saved.data.acceptedAt).toLocaleDateString()}` : 'Accepted'} />
                  : <Badge family="neutral" label="Not nested yet" />}
              {planned && (
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', fontSize: 13 }} data-testid="section-totals">
                  <span><strong>{bought}</strong> {bought === 1 ? 'bar' : 'bars'} to buy</span>
                  <span><strong>{fromOffcuts}</strong> from offcuts</span>
                  <span>waste <strong>{pct(wastePct)}</strong></span>
                </Box>
              )}
            </Box>
            <CapsLabel>{noun(profiles.length, 'profile')}</CapsLabel>
            {profiles.map((p) => <ProfileCard key={p.key} profile={p} kerfMm={settings.sawKerfMm} />)}
          </>
        )}
      </Box>
      <ConfirmDialog open={confirm === 'accept'} title="Accept the section nesting?" confirmLabel="Accept"
        body={<>The bars below are written as the plan: <strong>{bought}</strong> to buy, <strong>{fromOffcuts}</strong> from offcuts, and the leftovers kept as offcuts. It replaces the bars this line had; plates are not touched.</>}
        onClose={() => setConfirm(null)} onConfirm={accept} />
      <ConfirmDialog open={confirm === 'take'} danger title="Take the section nesting back?" confirmLabel="Take back"
        body="The bars and the offcuts this nest made are removed, and the section pieces go back to being estimated. This works only while nothing is cut."
        onClose={() => setConfirm(null)} onConfirm={takeBack} />
      <SectionSheetDialog open={!!sheet} fileName={sheet?.name ?? ''} result={sheet?.result ?? null} busy={busy === 'save'}
        onClose={() => setSheet(null)} onSave={saveSheet} />
    </SectionCard>
  );
}
