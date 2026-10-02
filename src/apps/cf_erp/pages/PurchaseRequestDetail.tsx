import { useEffect, useMemo, useState } from 'react';
import { Button, Typography } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import { deleteRequestLine, getRequest, putRequestLine, requestAction, type RequestDetail, type RequestLine } from '../api/procurement';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { appPath } from '../navMeta';
import { dayText, rupeeText } from '../lib/money';
import { Money } from '../components/Money';
import { DetailSkeleton, ErrorNotice, Fact, Mono, SectionCard } from '../components/ui';
import { DetailHeader, DetailLayout } from '../components/DetailLayout';
import { RequestStatusBadge } from '../components/ProcurementUi';
import { RequestActionBar, RequestHistory, RequestLinesGrid, type RequestActionKind } from '../components/RequestParts';
import { AddRequestLineDialog, MakeRfqDialog } from '../components/RfqDialogs';
import { PromptDialog } from '../components/PromptDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';
import { BuyingStageBar } from '../components/Buying/BuyingStageBar';


/** One purchase request: the lines, where it stands, and the next step for whoever may take it. */
export default function PurchaseRequestDetail() {
  const id = Number(useParams().id);
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const permitted = useIsPermitted();
  const canManage = permitted('cf_erp_inventory_manage');
  const canApprove = permitted('cf_erp_purchase_approve');
  const load = useLoad(() => getRequest(id), [id]);
  const r = load.data;
  useDetailTitle(r?.code ?? null);
  const [adding, setAdding] = useState(false);
  const [dialog, setDialog] = useState<'approve' | 'reject' | 'cancel' | 'rfq' | null>(null);
  const [removing, setRemoving] = useState<RequestLine | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const open = useMemo(() => (r?.lines ?? []).filter((l) => l.status === 'open'), [r]);
  // Every open line of an approved request starts ticked; the buyer unticks what should wait.
  useEffect(() => { setPicked(new Set(open.map((l) => l.id))); }, [open]);

  if (load.error) return <ErrorNotice error={load.error} onRetry={load.reload} />;
  if (!r) return <DetailSkeleton />;

  const set = (next: RequestDetail, message?: string) => { load.setData(next); if (message) toast.success(message); };
  const fail = (e: unknown) => toast.error((e as Error).message);
  const act = async (a: RequestActionKind) => {
    if (a === 'submit') { try { set(await requestAction(r.id, 'submit'), `${r.code} submitted for approval.`); } catch (e) { fail(e); } return; }
    setDialog(a === 'make-rfq' ? 'rfq' : a);
  };
  const run = async (kind: 'approve' | 'reject' | 'cancel', note?: string, message?: string) => set(await requestAction(r.id, kind, note), message);
  const editable = canManage && r.allowed.edit;
  const forRfq = r.allowed.makeRfq ? open.filter((l) => picked.has(l.id)) : [];

  return (
    <DetailLayout
      beforeTabs={<BuyingStageBar type="request" id={r.id} version={`${r.status}:${r.lines.map((l) => l.status).join()}`} />}
      header={
        <DetailHeader code={r.code} title="Purchase request" badges={<RequestStatusBadge status={r.status} />}
          subtitle={r.status === 'submitted' ? 'Waiting for one approver before anyone is asked for a price.' : r.status === 'approved' ? 'Approved. Choose the lines to ask suppliers about.' : r.decisionNote ? `“${r.decisionNote}”` : undefined}
          actions={<>
            {editable && <Button startIcon={<AddRounded />} onClick={() => setAdding(true)}>Add a line</Button>}
            <RequestActionBar request={r} canManage={canManage} canApprove={canApprove} makeRfqCount={forRfq.length} onAction={(a) => void act(a)} />
          </>}
          facts={<>
            <Fact label="Lines"><Mono>{r.lines.length}</Mono></Fact>
            <Fact label="Estimated"><Money value={r.unpricedLines === r.lines.length ? null : r.estTotal} digits={2} missing="no prices" strong />{(r.unpricedLines ?? 0) > 0 && r.unpricedLines !== r.lines.length && <Mono muted> + {r.unpricedLines} unpriced</Mono>}</Fact>
            <Fact label="Needed by"><Mono muted>{dayText(r.neededBy) || '—'}</Mono></Fact>
            <Fact label="Asked by">{r.requestedBy?.name ?? '—'}</Fact>
            {r.decidedBy && <Fact label="Decided by">{r.decidedBy.name}{r.decidedAt ? `, ${dayText(r.decidedAt)}` : ''}</Fact>}
          </>} />
      }>
      <SectionCard title="Lines" subtitle={editable ? 'Click a cell to change it, or paste a block from Excel. Nothing here is ordered yet.' : r.allowed.makeRfq ? 'Tick the lines that should go to suppliers for a quote.' : 'Read-only now.'}>
        <RequestLinesGrid request={r} company={company} editable={editable} picked={r.allowed.makeRfq ? picked : null}
          onPick={(lineId, on) => setPicked((p) => { const n = new Set(p); if (on) n.add(lineId); else n.delete(lineId); return n; })}
          onWrite={async (line, ch) => { try { set(await putRequestLine(line.id, ch)); } catch (e) { fail(e); load.reload(); } }}
          onRemove={setRemoving} />
      </SectionCard>
      {r.notes && <SectionCard title="Notes"><Typography sx={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{r.notes}</Typography></SectionCard>}
      <RequestHistory history={r.history ?? []} />
      <AddRequestLineDialog requestId={adding ? r.id : null} onClose={() => setAdding(false)} onAdded={(n) => { setAdding(false); set(n, 'Line added.'); }} />
      <PromptDialog open={dialog === 'approve'} title={`Approve ${r.code}?`} label="Note (optional)" required={false} confirmLabel="Approve"
        body={`${r.lines.length} ${r.lines.length === 1 ? 'line' : 'lines'}, about ${r.unpricedLines === r.lines.length ? 'no price known' : rupeeText(r.estTotal, 0)}. It can then go out for quotes.`}
        onClose={() => setDialog(null)} onConfirm={(note) => run('approve', note, `${r.code} approved.`)} />
      <PromptDialog open={dialog === 'reject'} title={`Reject ${r.code}?`} label="Why" confirmLabel="Reject" danger body="The person who asked will see this reason."
        onClose={() => setDialog(null)} onConfirm={(note) => run('reject', note, `${r.code} rejected.`)} />
      <ConfirmDialog open={dialog === 'cancel'} danger confirmLabel="Cancel the request" title={`Cancel ${r.code}?`} entityName={r.code}
        body="Nothing has been ordered from it. It stays on the list under Cancelled."
        onClose={() => setDialog(null)} onConfirm={async () => { await run('cancel', undefined, `${r.code} cancelled.`); }} />
      <MakeRfqDialog open={dialog === 'rfq'} lines={forRfq} requestCode={r.code} onClose={() => setDialog(null)}
        onMade={(rfq) => { setDialog(null); toast.success(`${rfq.code} made. Choose the suppliers to ask.`); navigate(appPath(company, `rfqs/${rfq.id}`)); }} />
      <ConfirmDialog open={!!removing} danger confirmLabel="Remove" title="Remove this line?" entityName={removing ? `${removing.item.code ?? removing.item.name}` : ''}
        body="It will not be asked for or bought." onClose={() => setRemoving(null)}
        onConfirm={async () => { if (!removing) return; set(await deleteRequestLine(removing.id), 'Line removed.'); setRemoving(null); }} />
    </DetailLayout>
  );
}
