import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, MenuItem, TextField, Typography } from '@mui/material';
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded';
import TableViewRounded from '@mui/icons-material/TableViewRounded';
import SendRounded from '@mui/icons-material/SendRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import { cfApi, CfApiError } from '../../api/client';
import {
  checkAcceptance, createTemplate, getAcceptance, mrDocument, saveAcceptance, withdrawAcceptance,
  type Estimate, type TermTemplate, type Terms,
} from '../../api/acceptance';
import { setLineSupply, type MaterialSupply } from '../../api/requisitions';
import type { SalesOrder } from '../../api/types';
import { useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { useFullScreen } from '../../hooks/useFullScreen';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { applyTemplate, percentTotal, saveBlob, saveLabel, stateWords, templateRows, termsBody, termsOf, termInputSx as inputSx } from '../../lib/acceptance';
import { rupeeText } from '../../lib/money';
import { Badge, ErrorNotice, Mono, SectionCard, SkeletonRows } from '../ui';
import { FullScreenFrame, FullScreenToggle } from '../FullScreen';
import { DialogHeader } from '../FormDialog';
import { useToast } from '../toastContext';
import { StageChecklist } from './StageChecklist';
import { ChargesGrid, MilestonesGrid, StagesGrid } from './TermGrids';

/** The estimate, in a few figures. */
function EstimateBox({ e }: { e: Estimate }) {
  const figures: [string, string, string][] = [
    ['value', 'Order value', rupeeText(e.value)],
    ['material', 'Material we buy', e.materialCost == null ? 'not known' : rupeeText(e.materialCost)],
    ['margin', 'Margin over material', e.marginOverMaterial == null ? '—' : `${rupeeText(e.marginOverMaterial)}${e.marginPct != null ? ` (${e.marginPct} %)` : ''}`],
    ['weight', 'Weight', `${e.tonnes} t`],
  ];
  return (
    <Box data-testid="acc-estimate" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
      {figures.map(([k, label, v]) => (
        <Box key={k} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', p: 1.25, minWidth: 0 }}>
          <Typography sx={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>{label}</Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 600 }} data-testid={`acc-est-${k}`}>{v}</Typography>
        </Box>
      ))}
      <Typography sx={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--c-text-3)' }}>
        {e.materialCostNote}{e.unweighedLines.length ? ` Line ${e.unweighedLines.join(', ')} has no weight yet.` : ''}{e.milestonesNote ? ` ${e.milestonesNote}` : ''}
      </Typography>
    </Box>
  );
}

/**
 * CUSTOMER ACCEPTANCE — the sales order's confirm step (§73). After the MR is raised and shared with the customer
 * (PDF / Excel here), the customer's terms go here, in grids prefilled from the default templates: the CHARGES, the
 * PAYMENT MILESTONES and the POST-PRODUCTION STAGES, plus who supplies the material. Every change is checked and priced
 * by the server at once (a dry run). "Send for approval" sends them to Management; their approval confirms the order,
 * releases the MR to Purchase and locks the terms. A change after that is a rate change, approved again. Full screen.
 */
export function AcceptanceStep({ order, onChanged }: { order: SalesOrder; onChanged?: () => void }) {
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canManage = isPermitted('cf_erp_orders_manage');
  const canSupply = isPermitted('cf_erp_inventory_manage') || canManage;
  const full = useFullScreen('so-acceptance');
  const loaded = useLoad(() => getAcceptance(order.id), [order.id]);
  const view = loaded.data;
  const [terms, setTerms] = useState<Terms | null>(null);
  const [check, setCheck] = useState<{ problems: string[]; estimate: Estimate; changes: string[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const [note, setNote] = useState('');
  const [saveTpl, setSaveTpl] = useState<TermTemplate['kind'] | null>(null);
  const [tplName, setTplName] = useState('');
  const seq = useRef(0);
  const original = useRef<string>('');

  useEffect(() => {
    if (!view) return;
    const t = termsOf(view);
    setTerms(t);
    original.current = JSON.stringify(t);
    setCheck(null);
  }, [view]);

  const editable = !!view?.editable && canManage;
  const dirty = !!terms && JSON.stringify(terms) !== original.current;
  // Checked and priced by the server a moment after each change (nothing is written).
  useEffect(() => {
    if (!terms || !view || !editable) return undefined;
    const my = ++seq.current;
    const t = window.setTimeout(async () => {
      setChecking(true);
      try { const r = await checkAcceptance(order.id, termsBody(terms)); if (seq.current === my) setCheck({ problems: r.problems, estimate: r.estimate, changes: r.changes }); }
      catch (e) { if (seq.current === my) setError(e as CfApiError); }
      finally { if (seq.current === my) setChecking(false); }
    }, 350);
    return () => window.clearTimeout(t);
  }, [terms, view, editable, order.id]);

  if (loaded.error) return <ErrorNotice error={loaded.error} onRetry={loaded.reload} />;
  if (!view || !terms) return <SkeletonRows rows={5} height={64} />;
  const estimate = check?.estimate ?? view.estimate;
  const problems = check?.problems ?? [];
  const sw = stateWords(view);
  const anyWeBuy = view.order.lines.some((l) => l.supply === 'we_buy');
  const up = (patch: Partial<Terms>) => setTerms((t) => (t ? { ...t, ...patch } : t));

  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError(e as CfApiError); } finally { setBusy(false); } };
  const send = () => run(async () => {
    const v = await saveAcceptance(order.id, termsBody(terms), note.trim() || undefined);
    loaded.setData(v);
    setNote('');
    invalidateNavCounts();
    toast.success(v.approved && v.pending ? 'Rate change sent to Management.' : 'Sent to Management for approval.');
    onChanged?.();
  });
  const takeBack = () => run(async () => { loaded.setData(await withdrawAcceptance(order.id)); invalidateNavCounts(); toast.success('Taken back. Change it and send again.'); onChanged?.(); });
  const download = (format: 'pdf' | 'xlsx') => run(async () => { saveBlob(await mrDocument(order.id, format), `MR-${order.code.replace(/[^A-Za-z0-9._-]+/g, '-')}.${format}`); });
  const changeOrderSupply = (v: MaterialSupply) => run(async () => { await cfApi.put<SalesOrder>(`/orders/${order.id}`, { materialSupply: v }); toast.success('Material supply saved.'); loaded.reload(); onChanged?.(); });
  const changeLineSupply = (lineId: number, v: string) => run(async () => { await setLineSupply(lineId, v === '' ? null : (v as MaterialSupply)); toast.success('Material supply saved.'); loaded.reload(); onChanged?.(); });
  const saveAsTemplate = () => run(async () => {
    if (!saveTpl || !tplName.trim()) return;
    await createTemplate({ kind: saveTpl, name: tplName.trim(), rows: templateRows(termsBody(terms), saveTpl) });
    toast.success('Template saved.'); setSaveTpl(null); setTplName(''); loaded.reload();
  });
  const templatePicker = (kind: TermTemplate['kind']) => {
    const list = view.templates.filter((t) => t.kind === kind);
    return editable && (
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
        {list.length > 0 && (
          <TextField select size="small" value="" label="Fill from template" sx={{ minWidth: 190, ...inputSx }} onChange={(e) => { const tpl = list.find((t) => t.id === Number(e.target.value)); if (tpl) setTerms(applyTemplate(terms, tpl)); }}
            inputProps={{ 'data-testid': `tpl-${kind}` }}>
            {list.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (default)' : ''}</MenuItem>)}
          </TextField>
        )}
        <Button size="small" onClick={() => { setSaveTpl(kind); setTplName(''); }} data-testid={`save-tpl-${kind}`}>Save as template</Button>
      </Box>
    );
  };

  return (
    <FullScreenFrame on={full.on} onExit={() => full.set(false)}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }} data-testid="acceptance-step">
        <SectionCard title="Customer acceptance" subtitle="The customer's terms. Management approves them; then the order is confirmed and Purchase starts."
          actions={(
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge family={sw.family} noIcon label={sw.label} />
              {editable && view.pending && <Button size="small" onClick={() => void takeBack()} disabled={busy} data-testid="acc-take-back">Take back</Button>}
              {editable && (
                <Button variant="contained" size="small" startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <SendRounded />}
                  disabled={busy || checking || problems.length > 0 || (!!view.approved && !dirty && !view.pending)}
                  onClick={() => void send()} data-testid="acc-send">{saveLabel(view)}</Button>
              )}
              <FullScreenToggle on={full.on} onToggle={full.toggle} />
            </Box>
          )}>
          <Box sx={{ display: 'grid', gap: 1.25 }}>
            <ErrorNotice error={error} sx={{ mb: 0 }} />
            {view.editReason && <Alert severity="info">{view.editReason}</Alert>}
            {view.sentBack?.status === 'rejected' && !view.pending && (
              <Alert severity="warning" data-testid="acc-sent-back">Sent back by {view.sentBack.decidedBy?.name ?? 'Management'}: {view.sentBack.decisionNote}. Change the terms and send again.</Alert>
            )}
            {view.pending && <Alert severity="info" data-testid="acc-pending">Waiting for Management since {new Date(view.pending.savedAt).toLocaleDateString('en-IN')}. {view.saveMeans}</Alert>}
            {view.locked && !view.pending && (
              <Box role="status" data-testid="acc-locked" sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 1, borderRadius: 'var(--r-md)', background: 'var(--c-success-50)', border: '1px solid var(--c-success-200)', fontSize: 13 }}>
                <LockRounded sx={{ fontSize: 17 }} aria-hidden />
                Accepted {view.approved?.decidedAt ? `on ${new Date(view.approved.decidedAt).toLocaleDateString('en-IN')}` : ''}{view.approved?.decidedBy?.name ? ` by ${view.approved.decidedBy.name}` : ''}. These terms are locked. {view.saveMeans}
              </Box>
            )}
            {view.confirmProblems.length > 0 && <Alert severity="warning" data-testid="acc-confirm-problems">{view.confirmProblems.map((p) => <Box key={p}>{p}</Box>)}</Alert>}
            <Box data-testid="acc-mr" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: '1 1 260px' }}>{view.mrNote}</Typography>
              {view.mrs.length > 0 && <>
                <Button size="small" variant="outlined" startIcon={<PictureAsPdfRounded />} onClick={() => void download('pdf')} data-testid="acc-mr-pdf">MR as PDF</Button>
                <Button size="small" variant="outlined" startIcon={<TableViewRounded />} onClick={() => void download('xlsx')} data-testid="acc-mr-xlsx">MR as Excel</Button>
              </>}
            </Box>
            {problems.length > 0 && <Alert severity="warning" data-testid="acc-problems">{problems.map((p) => <Box key={p}>{p}</Box>)}</Alert>}
            {check && check.changes.length > 0 && <Alert severity="info" data-testid="acc-changes">Changes from the approved terms: {check.changes.join(' ')}</Alert>}
            <EstimateBox e={estimate} />
            {editable && <TextField size="small" label="Note for Management (optional)" value={note} onChange={(e) => setNote(e.target.value)} inputProps={{ 'data-testid': 'acc-note' }} />}
          </Box>
        </SectionCard>

        <SectionCard title="Material" subtitle={view.supplyEditable ? 'Who supplies the steel. It can change until the acceptance is approved.' : 'Who supplies the steel. Fixed once the acceptance is approved (or an MR is with Purchase).'}>
          <Box sx={{ display: 'grid', gap: 1 }} data-testid="acc-supply">
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: 13.5, minWidth: 120 }}>The order</Typography>
              <TextField select size="small" value={view.order.materialSupply} disabled={!view.supplyEditable || !canSupply || busy} sx={{ minWidth: 200, ...inputSx }}
                onChange={(e) => void changeOrderSupply(e.target.value as MaterialSupply)} inputProps={{ 'data-testid': 'acc-order-supply' }}>
                <MenuItem value="we_buy">We buy</MenuItem>
                <MenuItem value="customer">Customer supplies</MenuItem>
              </TextField>
            </Box>
            {view.order.lines.map((l) => (
              <Box key={l.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 13, minWidth: 120 }}>Line {l.lineNo} · {l.name}</Typography>
                <TextField select size="small" value={l.ownSupply ?? ''} disabled={!view.supplyEditable || !canSupply || busy} sx={{ minWidth: 200, ...inputSx }}
                  onChange={(e) => void changeLineSupply(l.id, e.target.value)} SelectProps={{ displayEmpty: true }} inputProps={{ 'data-testid': 'acc-line-supply' }}>
                  <MenuItem value="">As the order</MenuItem>
                  <MenuItem value="we_buy">We buy</MenuItem>
                  <MenuItem value="customer">Customer supplies</MenuItem>
                </TextField>
                <Mono muted>{l.weightT == null ? 'no weight yet' : `${l.weightT} t`}</Mono>
              </Box>
            ))}
          </Box>
        </SectionCard>

        <SectionCard title="Charges" subtitle="One row per operation. By weight or by a formula of the BOM's values, at a rate per unit." actions={templatePicker('charges')}>
          <ChargesGrid terms={terms} onChange={up} lists={view.lists} editable={editable} estimate={estimate} showMaterial={anyWeBuy} materialTonnes={estimate.ourTonnes} />
        </SectionCard>

        <SectionCard title="Payment milestones" subtitle={`Billed on things the app tracks. They add up to ${percentTotal(terms.milestones)} %.`} actions={templatePicker('milestones')}>
          <MilestonesGrid terms={terms} onChange={up} lists={view.lists} editable={editable} estimate={estimate} />
        </SectionCard>

        <SectionCard title="Post-production stages" subtitle="What happens after dispatch, in order. A stage can be billed by a milestone." actions={templatePicker('stages')}>
          <StagesGrid terms={terms} onChange={up} editable={editable} />
          {view.postStages.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.5 }}>Checklist</Typography>
              <StageChecklist stages={view.postStages} canTick={canManage && view.order.status === 'confirmed'} onChanged={() => { loaded.reload(); onChanged?.(); }} />
            </Box>
          )}
        </SectionCard>

        {view.versions.length > 0 && (
          <SectionCard title="History" subtitle="Every version sent to Management.">
            <Box data-testid="acc-history" sx={{ display: 'grid', gap: 0.5 }}>
              {view.versions.map((v) => (
                <Typography key={v.id} sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                  v{v.version} · {v.kind === 'rate_change' ? 'rate change' : 'acceptance'} · <strong>{v.status}</strong> · sent {new Date(v.savedAt).toLocaleDateString('en-IN')}{v.savedBy?.name ? ` by ${v.savedBy.name}` : ''}
                  {v.decidedAt ? ` · ${v.status} ${new Date(v.decidedAt).toLocaleDateString('en-IN')}${v.decidedBy?.name ? ` by ${v.decidedBy.name}` : ''}` : ''}{v.decisionNote ? ` — ${v.decisionNote}` : ''}
                </Typography>
              ))}
            </Box>
          </SectionCard>
        )}

        <Dialog open={!!saveTpl} onClose={() => setSaveTpl(null)} maxWidth="xs" fullWidth>
          <DialogHeader title="Save as template" subtitle={saveTpl === 'charges' ? 'The charges, the material rate and the lump sums.' : saveTpl === 'milestones' ? 'The payment milestones.' : 'The post-production stages.'} onClose={() => setSaveTpl(null)} busy={busy} />
          <DialogContent><TextField autoFocus fullWidth size="small" label="Name" value={tplName} onChange={(e) => setTplName(e.target.value)} sx={{ mt: 1 }} inputProps={{ 'data-testid': 'tpl-name' }} /></DialogContent>
          <DialogActions><Button onClick={() => setSaveTpl(null)}>Cancel</Button><Button variant="contained" disabled={!tplName.trim() || busy} onClick={() => void saveAsTemplate()}>Save</Button></DialogActions>
        </Dialog>
      </Box>
    </FullScreenFrame>
  );
}
