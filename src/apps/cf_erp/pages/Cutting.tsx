import { useEffect, useMemo, useState } from 'react';
import { Alert, Autocomplete, Box, Button, CircularProgress, TextField, Typography, type AutocompleteRenderInputParams } from '@mui/material';
import { CfApiError, cfApi } from '../api/client';
import { getCutPlaces, saveCutPlaces, saveCutPlateFlow, type CutPlace, type CutPlaces, type NodeRef } from '../api/cutting';
import type { ScreenTree } from '../api/types';
import { screenTreePath } from '../lib/classificationScreens';
import { flattenTree } from '../lib/tree';
import { useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { ErrorNotice, Mono, PageHeader, SectionCard, SkeletonRows } from '../components/ui';
import { useToast } from '../components/toastContext';
import { FlowPicker } from '../components/FlowPicker';

/**
 * Setup › Cutting (CF_ERP_CUT_FROM_PLAN.md §3.4, §4.4). Where cut pieces are
 * filed, where the raw stock is, where offcuts go, and — for sections — the
 * saw's kerf, the end trim and the shortest offcut worth keeping. These are
 * places (nodes of the classification tree), not codes: rename a branch and
 * nothing stops. A missing place is said here in words, and again on the
 * Freeze checklist and on Nesting.
 */

type Opt = { id: number; code: string | null; name: string; path: string };

/** A classification node, chosen by its path. Several at once for raw stock. */
function NodeField({ label, helperText, options, value, multiple, disabled, onChange, testId }: {
  label: string; helperText?: string; options: Opt[]; multiple: boolean; disabled: boolean; testId: string;
  value: Opt[];
  onChange: (next: Opt[]) => void;
}) {
  // A node set earlier but missing from the tree read (a hidden branch) is still shown, so saving does not drop it.
  const all = [...options, ...value.filter((v) => !options.some((o) => o.id === v.id))];
  const props = {
    size: 'small' as const, fullWidth: true, options: all, disabled, openOnFocus: true,
    getOptionLabel: (o: Opt) => o.path,
    isOptionEqualToValue: (a: Opt, b: Opt) => a.id === b.id,
    noOptionsText: 'No branch matches',
    renderInput: (params: AutocompleteRenderInputParams) => (
      <TextField {...params} label={label} helperText={helperText} placeholder={multiple ? (value.length ? '' : 'Choose branches') : 'Choose a branch'}
        inputProps={{ ...params.inputProps, 'data-testid': testId }} />
    ),
  };
  return multiple
    ? <Autocomplete<Opt, true> {...props} multiple value={value} onChange={(_, v) => onChange(v)} />
    : <Autocomplete<Opt, false> {...props} value={value[0] ?? null} onChange={(_, v) => onChange(v ? [v] : [])} />;
}

const asOpt = (n: NodeRef): Opt => ({ id: n.id, code: n.code, name: n.name, path: n.path || n.name });

interface Draft { blanks: Opt[]; offcut: Opt[]; stock: Opt[] }
const draftOf = (p: CutPlace): Draft => ({ blanks: p.blanksNode ? [asOpt(p.blanksNode)] : [], offcut: p.offcutNode ? [asOpt(p.offcutNode)] : [], stock: p.stockNodes.map(asOpt) });
const placeBody = (d: Draft) => ({ blanksNodeId: d.blanks[0]?.id ?? null, offcutNodeId: d.offcut[0]?.id ?? null, stockNodeIds: d.stock.map((n) => n.id) });

function PlaceCard({ title, subtitle, draft, onDraft, options, disabled, kind, flowId, onFlow }: {
  title: string; subtitle: string; draft: Draft; onDraft: (d: Draft) => void; options: Opt[]; disabled: boolean; kind: 'plate' | 'section';
  flowId: number | null; onFlow: (id: number | null) => void;
}) {
  return (
    <SectionCard title={title} subtitle={subtitle}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
        <NodeField testId={`${kind}-blanks`} label="Cut pieces are filed under" options={options} multiple={false} disabled={disabled} value={draft.blanks}
          helperText={kind === 'plate' ? 'The rectangles a plate part is cut as.' : 'The bars-to-length a section part is cut as.'}
          onChange={(v) => onDraft({ ...draft, blanks: v })} />
        <NodeField testId={`${kind}-stock`} label="Raw stock is under" options={options} multiple disabled={disabled} value={draft.stock}
          helperText={kind === 'plate' ? 'Where the plates nesting draws on are filed.' : 'Angles, beams, channels — every branch holding stock bars. Subbranches count.'}
          onChange={(v) => onDraft({ ...draft, stock: v })} />
        <NodeField testId={`${kind}-offcut`} label="Offcuts are filed under" options={options} multiple={false} disabled={disabled} value={draft.offcut}
          helperText={kind === 'plate' ? 'What is left of a cut plate.' : 'What is left of a cut bar.'}
          onChange={(v) => onDraft({ ...draft, offcut: v })} />
        <Box data-testid={`${kind}-flow`}>
          <FlowPicker value={flowId} onChange={onFlow} label="Flow for new cut pieces" disabled={disabled}
            helperText={kind === 'plate' ? 'The flow a new cut plate is made by.' : 'The flow a new cut section is made by.'} />
          {kind === 'section' && flowId == null && (
            <Alert severity="warning" sx={{ mt: 1 }} data-testid="section-no-flow">Cut sections have no flow — release will refuse them until one is chosen.</Alert>
          )}
        </Box>
      </Box>
    </SectionCard>
  );
}

const numText = (v: number | null) => (v == null ? '' : String(v));
const numOf = (s: string): number | null => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s));

function CuttingForm({ places, tree, canEdit, onSaved }: { places: CutPlaces; tree: ScreenTree | null; canEdit: boolean; onSaved: (p: CutPlaces) => void }) {
  const toast = useToast();
  const options = useMemo<Opt[]>(() => flattenTree(tree).map((n) => ({ id: n.id, code: n.code, name: n.name, path: n.path })), [tree]);
  const [plate, setPlate] = useState<Draft>(() => draftOf(places.plate));
  const [section, setSection] = useState<Draft>(() => draftOf(places.section));
  const [plateFlow, setPlateFlow] = useState<number | null>(places.flows.plate?.id ?? null);
  const [sectionFlow, setSectionFlow] = useState<number | null>(places.flows.section?.id ?? null);
  const [kerf, setKerf] = useState(numText(places.sectionSettings.sawKerfMm));
  const [trim, setTrim] = useState(numText(places.sectionSettings.endTrimMm));
  const [minOff, setMinOff] = useState(numText(places.sectionSettings.minOffcutMm));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => {
    setPlate(draftOf(places.plate)); setSection(draftOf(places.section));
    setPlateFlow(places.flows.plate?.id ?? null); setSectionFlow(places.flows.section?.id ?? null);
    setKerf(numText(places.sectionSettings.sawKerfMm)); setTrim(numText(places.sectionSettings.endTrimMm)); setMinOff(numText(places.sectionSettings.minOffcutMm));
  }, [places]);
  const bad = [kerf, trim, minOff].some((v) => v.trim() !== '' && (numOf(v) == null || (numOf(v) as number) < 0));
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const out = await saveCutPlaces({
        plate: placeBody(plate), section: placeBody(section),
        sectionSettings: { sawKerfMm: numOf(kerf), endTrimMm: numOf(trim), minOffcutMm: numOf(minOff) },
        ...((places.flows.section?.id ?? null) !== sectionFlow ? { sectionFlowId: sectionFlow } : {}),
      });
      // The plate flow has its own endpoint; only written when it changed.
      if ((places.flows.plate?.id ?? null) !== plateFlow) out.flows.plate = (await saveCutPlateFlow(plateFlow)).flow ?? null;
      toast.success('Cutting setup saved.');
      onSaved(out);
    } catch (e) { setError(e instanceof CfApiError ? e : new CfApiError(0, String(e))); } finally { setBusy(false); }
  };
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, maxWidth: 880 }}>
      {places.problems.length > 0 && (
        <Alert severity="warning" data-testid="cut-problems">
          <Box sx={{ fontWeight: 600, mb: 0.5 }}>Something is not set up yet</Box>
          <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.4, overflowWrap: 'anywhere' }}>
            {places.problems.map((p) => <li key={p}>{p}</li>)}
          </Box>
        </Alert>
      )}
      <ErrorNotice error={error} />
      <PlaceCard kind="plate" title="Plate" subtitle="Parts cut flat from a plate. Nesting lays them out on the plates under raw stock."
        draft={plate} onDraft={setPlate} options={options} disabled={!canEdit} flowId={plateFlow} onFlow={setPlateFlow} />
      <PlaceCard kind="section" title="Section" subtitle="Parts cut to length from a stock bar — angles, beams, channels. Nesting lays the lengths out on bars."
        draft={section} onDraft={setSection} options={options} disabled={!canEdit} flowId={sectionFlow} onFlow={setSectionFlow} />
      <SectionCard title="Sawing a section" subtitle="Used when section parts are laid out on bars. All in millimetres.">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
          <TextField label="Saw kerf (mm)" size="small" disabled={!canEdit} value={kerf} onChange={(e) => setKerf(e.target.value)} inputProps={{ inputMode: 'decimal', 'data-testid': 'saw-kerf' }}
            helperText="The width of the cut, lost at every cut." />
          <TextField label="End trim (mm)" size="small" disabled={!canEdit} value={trim} onChange={(e) => setTrim(e.target.value)} inputProps={{ inputMode: 'decimal', 'data-testid': 'end-trim' }}
            helperText="Cut off each end of a bar before the first piece." />
          <TextField label="Smallest offcut kept (mm)" size="small" disabled={!canEdit} value={minOff} onChange={(e) => setMinOff(e.target.value)} inputProps={{ inputMode: 'decimal', 'data-testid': 'min-offcut' }}
            helperText="A leftover shorter than this is scrap, not stock." />
        </Box>
      </SectionCard>
      {canEdit ? (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="contained" onClick={save} disabled={busy || bad} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
            {busy ? 'Saving…' : 'Save cutting setup'}
          </Button>
        </Box>
      ) : (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>You can read this setup but not change it. Ask for the catalog permission.</Typography>
      )}
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
        Which parts are cut from a plate or a section is set on each definition (Cut from). <Mono muted>Setup</Mono> only says where things are filed.
      </Typography>
    </Box>
  );
}

/** Setup › Cutting. */
export default function Cutting() {
  const canEdit = useIsPermitted()('cf_erp_catalog_manage');
  const places = useLoad(() => getCutPlaces(), []);
  const tree = useLoad(() => cfApi.get<ScreenTree>(screenTreePath('items', true)).catch(() => null), []);
  return (
    <Box>
      <PageHeader title="Cutting" subtitle="Where cut pieces, raw stock and offcuts are filed, and how a section is sawn." />
      <ErrorNotice error={places.error} onRetry={places.reload} />
      {places.loading && !places.data ? <SkeletonRows rows={6} /> : places.data && (
        <CuttingForm places={places.data} tree={tree.data} canEdit={canEdit} onSaved={(p) => places.setData(p)} />
      )}
    </Box>
  );
}
