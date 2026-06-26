import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, IconButton, MenuItem, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow,
  Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ClearIcon from '@mui/icons-material/Clear';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';

import { fabQuery, fabMutate } from '@apps/fab_erp/api/client';
import type {
  FabPlant, FabResource, FabResourceCustomField, FabResourceType, FabResourceTypeProperty, FabStockLocation,
} from '@apps/fab_erp/types';
import { usePermission } from '@core/hooks/usePermission';
import { PageHeader, Mono, EmptyState, ListSkeleton, useToast, EntityList, EntityRow, type SortableField } from '../components';

interface QueryResult<T> { data: T[]; total?: number }

const th = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
const td = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

function errMsg(e: unknown): string {
  const ax = e as { response?: { data?: { message?: string; error?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.response?.data?.error ?? ax.message ?? 'Something went wrong';
}

const CREATE_NEW_TYPE = '__create_new_type__';
interface ResourceTypeOption { id: number | typeof CREATE_NEW_TYPE; label: string }

const RESOURCE_SORT_FIELDS: SortableField<FabResource>[] = [
  { key: 'name', label: 'Name' },
  { key: 'code', label: 'Code' },
];
const RESOURCE_TYPE_SORT_FIELDS: SortableField<FabResourceType>[] = [
  { key: 'name', label: 'Name' },
  { key: 'code', label: 'Code' },
];

const STD_FIELDS = [
  { key: 'capacityHrsPerDay', label: 'Available Hours/Day', unit: 'hrs', inputType: 'number', section: 'Capacity' },
  { key: 'numUnits', label: 'Number of Units', unit: 'units', inputType: 'number', section: 'Capacity' },
  { key: 'utilizationPct', label: 'Utilization %', unit: '%', inputType: 'number', section: 'Capacity' },
  { key: 'efficiencyPct', label: 'Efficiency %', unit: '%', inputType: 'number', section: 'Capacity' },
  { key: 'overloadPct', label: 'Overload Allowed %', unit: '%', inputType: 'number', section: 'Capacity' },
  { key: 'setupTimeHrs', label: 'Setup Time', unit: 'hrs', inputType: 'number', section: 'Scheduling' },
  { key: 'teardownTimeHrs', label: 'Teardown Time', unit: 'hrs', inputType: 'number', section: 'Scheduling' },
  { key: 'queueTimeHrs', label: 'Queue Time', unit: 'hrs', inputType: 'number', section: 'Scheduling' },
  { key: 'moveTimeHrs', label: 'Move Time', unit: 'hrs', inputType: 'number', section: 'Scheduling' },
  { key: 'schedulingBasis', label: 'Scheduling Basis', unit: '', inputType: 'select', options: ['machine', 'labor'], section: 'Scheduling' },
  { key: 'costPerHour', label: 'Cost per Hour', unit: '', inputType: 'number', section: 'Costing' },
  { key: 'currency', label: 'Currency', unit: '', inputType: 'text', section: 'Costing' },
] as const;

type StdKey = typeof STD_FIELDS[number]['key'];
type StdDraft = Record<StdKey, string>;

function blankStd(): StdDraft {
  return {
    capacityHrsPerDay: '', numUnits: '', utilizationPct: '', efficiencyPct: '', overloadPct: '',
    setupTimeHrs: '', teardownTimeHrs: '', queueTimeHrs: '', moveTimeHrs: '',
    schedulingBasis: '', costPerHour: '', currency: '',
  };
}
function fromRtStd(rt: FabResourceType): StdDraft {
  return {
    capacityHrsPerDay: rt.capacityHrsPerDay != null ? String(rt.capacityHrsPerDay) : '',
    numUnits: rt.numUnits != null ? String(rt.numUnits) : '',
    utilizationPct: rt.utilizationPct != null ? String(rt.utilizationPct) : '',
    efficiencyPct: rt.efficiencyPct != null ? String(rt.efficiencyPct) : '',
    overloadPct: rt.overloadPct != null ? String(rt.overloadPct) : '',
    setupTimeHrs: rt.setupTimeHrs != null ? String(rt.setupTimeHrs) : '',
    teardownTimeHrs: rt.teardownTimeHrs != null ? String(rt.teardownTimeHrs) : '',
    queueTimeHrs: rt.queueTimeHrs != null ? String(rt.queueTimeHrs) : '',
    moveTimeHrs: rt.moveTimeHrs != null ? String(rt.moveTimeHrs) : '',
    schedulingBasis: rt.schedulingBasis ?? '',
    costPerHour: rt.costPerHour != null ? String(rt.costPerHour) : '',
    currency: rt.currency ?? '',
  };
}
function fromResStd(r: FabResource): StdDraft {
  return {
    capacityHrsPerDay: r.capacityHrsPerDay != null ? String(r.capacityHrsPerDay) : '',
    numUnits: r.numUnits != null ? String(r.numUnits) : '',
    utilizationPct: r.utilizationPct != null ? String(r.utilizationPct) : '',
    efficiencyPct: r.efficiencyPct != null ? String(r.efficiencyPct) : '',
    overloadPct: r.overloadPct != null ? String(r.overloadPct) : '',
    setupTimeHrs: r.setupTimeHrs != null ? String(r.setupTimeHrs) : '',
    teardownTimeHrs: r.teardownTimeHrs != null ? String(r.teardownTimeHrs) : '',
    queueTimeHrs: r.queueTimeHrs != null ? String(r.queueTimeHrs) : '',
    moveTimeHrs: r.moveTimeHrs != null ? String(r.moveTimeHrs) : '',
    schedulingBasis: r.schedulingBasis ?? '',
    costPerHour: r.costPerHour != null ? String(r.costPerHour) : '',
    currency: r.currency ?? '',
  };
}
function toStdPayload(d: StdDraft): Record<string, number | string | null> {
  return {
    capacity_hrs_per_day: d.capacityHrsPerDay !== '' ? Number(d.capacityHrsPerDay) : null,
    num_units: d.numUnits !== '' ? Number(d.numUnits) : null,
    utilization_pct: d.utilizationPct !== '' ? Number(d.utilizationPct) : null,
    efficiency_pct: d.efficiencyPct !== '' ? Number(d.efficiencyPct) : null,
    overload_pct: d.overloadPct !== '' ? Number(d.overloadPct) : null,
    setup_time_hrs: d.setupTimeHrs !== '' ? Number(d.setupTimeHrs) : null,
    teardown_time_hrs: d.teardownTimeHrs !== '' ? Number(d.teardownTimeHrs) : null,
    queue_time_hrs: d.queueTimeHrs !== '' ? Number(d.queueTimeHrs) : null,
    move_time_hrs: d.moveTimeHrs !== '' ? Number(d.moveTimeHrs) : null,
    scheduling_basis: d.schedulingBasis || null,
    cost_per_hour: d.costPerHour !== '' ? Number(d.costPerHour) : null,
    currency: d.currency || null,
  };
}

function StdFieldsSection({ draft, onChange, typeDefaults, canEdit }: {
  draft: StdDraft; onChange: (k: StdKey, v: string) => void; typeDefaults?: StdDraft; canEdit: boolean;
}) {
  const sections = ['Capacity', 'Scheduling', 'Costing'] as const;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {sections.map((section) => (
        <Box key={section}>
          <Typography sx={{ mb: 1, fontWeight: 700, fontSize: 13, color: 'var(--c-primary-700)' }}>{section}</Typography>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ background: 'var(--c-surface-2)' }}>
                <TableCell sx={th}>Field</TableCell>
                {typeDefaults && <TableCell sx={th}>Type default</TableCell>}
                <TableCell sx={th}>{typeDefaults ? 'Resource override' : 'Default value'}</TableCell>
                {typeDefaults && <TableCell sx={th}>Effective</TableCell>}
                <TableCell sx={{ ...th, width: 80 }}>Unit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {STD_FIELDS.filter((f) => f.section === section).map((f) => {
                const inherited = typeDefaults?.[f.key] ?? '';
                const overridden = draft[f.key];
                const effective = overridden !== '' ? overridden : inherited;

                return (
                  <TableRow key={f.key} hover>
                    <TableCell sx={td}>{f.label}</TableCell>
                    {typeDefaults && (
                      <TableCell sx={td}>
                        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{inherited !== '' ? inherited : '—'}</Typography>
                      </TableCell>
                    )}
                    <TableCell sx={td}>
                      {!canEdit ? (
                        <Typography sx={{ fontSize: 13 }}>{overridden || '—'}</Typography>
                      ) : f.inputType === 'select' ? (
                        <TextField select size="small" value={overridden} onChange={(e) => onChange(f.key as StdKey, e.target.value)} sx={{ minWidth: 120 }}>
                          {typeDefaults && <MenuItem value=""><em>— Inherit from type —</em></MenuItem>}
                          {(f as { options?: readonly string[] }).options?.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                        </TextField>
                      ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <TextField type={f.inputType} size="small" value={overridden} onChange={(e) => onChange(f.key as StdKey, e.target.value)}
                            placeholder={typeDefaults ? (inherited || 'inherit') : ''} sx={{ width: 150 }} />
                          {typeDefaults && overridden !== '' && (
                            <Tooltip title="Clear override (revert to type default)">
                              <IconButton size="small" onClick={() => onChange(f.key as StdKey, '')}><ClearIcon fontSize="small" /></IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      )}
                    </TableCell>
                    {typeDefaults && (
                      <TableCell sx={td}>
                        {effective !== '' ? <Mono chip>{effective}</Mono> : <Typography sx={{ color: 'var(--c-text-3)' }}>—</Typography>}
                      </TableCell>
                    )}
                    <TableCell sx={td}><Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{f.unit || '—'}</Typography></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      ))}
    </Box>
  );
}

interface CfDraft { id?: number; fieldKey: string; fieldLabel: string; fieldType: 'text' | 'number' | 'date' | 'dropdown'; fieldValue: string }
const BLANK_CF = (): CfDraft => ({ fieldKey: '', fieldLabel: '', fieldType: 'text', fieldValue: '' });
const MAX_CF = 10;

function CustomFieldsEditor({ level, levelId, canManage }: { level: 'resource_type' | 'resource'; levelId: number; canManage: boolean }) {
  const [fields, setFields] = useState<FabResourceCustomField[]>([]);
  const [loading, setLoading] = useState(false);
  const [addDlg, setAddDlg] = useState<CfDraft | null>(null);
  const [editDlg, setEditDlg] = useState<{ draft: CfDraft; id: number } | null>(null);
  const [delTarget, setDelTarget] = useState<FabResourceCustomField | null>(null);
  const [cfErr, setCfErr] = useState('');
  const [cfSaving, setCfSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fabQuery<QueryResult<FabResourceCustomField>>('fabErpResourceCustomField', { filters: { level, levelId }, orderBy: [{ field: 'sortOrder', direction: 'asc' }], pagination: { limit: 20 } });
      setFields(res.data ?? []);
    } catch { setFields([]); } finally { setLoading(false); }
  }, [level, levelId]);

  useEffect(() => { load(); }, [load]);

  async function saveField(draft: CfDraft, editId?: number) {
    if (!draft.fieldKey.trim() || !draft.fieldLabel.trim()) { setCfErr('Key and label are required.'); return; }
    setCfSaving(true); setCfErr('');
    try {
      const payload = {
        level, level_id: levelId,
        field_key: draft.fieldKey.trim().replace(/\s+/g, '_').toLowerCase(),
        field_label: draft.fieldLabel.trim(), field_type: draft.fieldType, field_value: draft.fieldValue || null,
        sort_order: editId ? (fields.find((f) => f.id === editId)?.sortOrder ?? fields.length) : fields.length,
      };
      if (editId) await fabMutate('fabErpResourceCustomField', 'update', { id: editId, ...payload });
      else await fabMutate('fabErpResourceCustomField', 'insert', payload);
      setAddDlg(null); setEditDlg(null);
      await load();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setCfErr(err.response?.data?.error ?? err.message ?? 'Save failed');
    } finally { setCfSaving(false); }
  }

  async function deleteField(f: FabResourceCustomField) {
    await fabMutate('fabErpResourceCustomField', 'delete', { id: f.id });
    setDelTarget(null); await load();
  }

  const currentDlg = addDlg ?? editDlg?.draft ?? null;
  const currentDlgId = editDlg?.id;
  const setCurrentDlgField = (k: keyof CfDraft, v: string) => {
    if (addDlg) setAddDlg((d) => (d ? { ...d, [k]: v } : d));
    else if (editDlg) setEditDlg((d) => (d ? { draft: { ...d.draft, [k]: v }, id: d.id } : d));
  };

  return (
    <Box>
      {loading ? <CircularProgress size={20} /> : (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{fields.length}/{MAX_CF} custom fields</Typography>
            {canManage && fields.length < MAX_CF && (
              <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => { setCfErr(''); setAddDlg(BLANK_CF()); }}>Add custom field</Button>
            )}
          </Box>
          {fields.length === 0 ? (
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No custom fields defined. {canManage ? 'Click "Add custom field" to add up to 10.' : ''}</Typography>
          ) : (
            <Table size="small">
              <TableHead><TableRow sx={{ background: 'var(--c-surface-2)' }}>
                <TableCell sx={th}>Key</TableCell><TableCell sx={th}>Label</TableCell><TableCell sx={th}>Type</TableCell>
                <TableCell sx={th}>Default value</TableCell>{canManage && <TableCell sx={{ ...th, width: 80 }} />}
              </TableRow></TableHead>
              <TableBody>
                {fields.map((f) => (
                  <TableRow key={f.id} hover>
                    <TableCell sx={td}><Mono>{f.fieldKey}</Mono></TableCell>
                    <TableCell sx={td}>{f.fieldLabel}</TableCell>
                    <TableCell sx={td}><Mono chip>{f.fieldType}</Mono></TableCell>
                    <TableCell sx={td}>{f.fieldValue ?? '—'}</TableCell>
                    {canManage && (
                      <TableCell sx={td}>
                        <Stack direction="row" spacing={0.5}>
                          <Tooltip title="Edit"><IconButton size="small" onClick={() => { setCfErr(''); setEditDlg({ id: f.id, draft: { fieldKey: f.fieldKey, fieldLabel: f.fieldLabel, fieldType: f.fieldType, fieldValue: f.fieldValue ?? '' } }); }}><EditRounded fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDelTarget(f)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}

      <Dialog open={!!currentDlg} onClose={() => { setAddDlg(null); setEditDlg(null); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>{currentDlgId ? 'Edit custom field' : 'Add custom field'}</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {cfErr && <Alert severity="error">{cfErr}</Alert>}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Field key" size="small" fullWidth required value={currentDlg?.fieldKey ?? ''}
                onChange={(e) => setCurrentDlgField('fieldKey', e.target.value.replace(/\s+/g, '_').toLowerCase())}
                disabled={!!currentDlgId} helperText="Unique identifier, e.g. material_grade" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Label" size="small" fullWidth required value={currentDlg?.fieldLabel ?? ''}
                onChange={(e) => setCurrentDlgField('fieldLabel', e.target.value)} helperText="Display name for this field" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select label="Type" size="small" fullWidth value={currentDlg?.fieldType ?? 'text'} onChange={(e) => setCurrentDlgField('fieldType', e.target.value)}>
                <MenuItem value="text">Text</MenuItem><MenuItem value="number">Number</MenuItem><MenuItem value="date">Date</MenuItem><MenuItem value="dropdown">Dropdown</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Default value" size="small" fullWidth value={currentDlg?.fieldValue ?? ''} onChange={(e) => setCurrentDlgField('fieldValue', e.target.value)} helperText="Optional default value" />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAddDlg(null); setEditDlg(null); }}>Cancel</Button>
          <Button variant="contained" disabled={cfSaving} onClick={() => currentDlg && saveField(currentDlg, currentDlgId)}>
            {cfSaving ? <CircularProgress size={16} color="inherit" /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!delTarget} onClose={() => setDelTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Delete custom field</DialogTitle>
        <DialogContent><Typography>Delete <strong>{delTarget?.fieldLabel}</strong> ({delTarget?.fieldKey})? This cannot be undone.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDelTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => delTarget && deleteField(delTarget)}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

interface PropertyDraft { property_key: string; property_label: string; unit: string; default_value: string }
const BLANK_PROP = (): PropertyDraft => ({ property_key: '', property_label: '', unit: '', default_value: '' });

function FormulaPropertiesEditor({ rtId, canManage }: { rtId: number; canManage: boolean }) {
  const [props, setProps] = useState<FabResourceTypeProperty[]>([]);
  const [loading, setLoading] = useState(false);
  const [propDlg, setPropDlg] = useState<{ open: boolean; item: FabResourceTypeProperty | null }>({ open: false, item: null });
  const [propDraft, setPropDraft] = useState<PropertyDraft>(BLANK_PROP());
  const [propErr, setPropErr] = useState('');
  const [propSaving, setPropSaving] = useState(false);
  const [delTarget, setDelTarget] = useState<FabResourceTypeProperty | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fabQuery<QueryResult<FabResourceTypeProperty>>('fabErpResourceTypeProperty', { filters: { resourceTypeId: rtId }, orderBy: [{ field: 'propertyKey', direction: 'asc' }], pagination: { limit: 200 } });
      setProps(res.data ?? []);
    } catch { setProps([]); } finally { setLoading(false); }
  }, [rtId]);

  useEffect(() => { load(); }, [load]);

  async function saveProp() {
    if (!propDraft.property_key.trim() || !propDraft.property_label.trim()) { setPropErr('Key and label are required.'); return; }
    setPropSaving(true); setPropErr('');
    try {
      const payload = {
        resource_type_id: rtId, property_key: propDraft.property_key.trim(), property_label: propDraft.property_label.trim(),
        unit: propDraft.unit.trim() || null, default_value: propDraft.default_value !== '' ? Number(propDraft.default_value) : null,
      };
      if (propDlg.item) await fabMutate('fabErpResourceTypeProperty', 'update', { id: propDlg.item.id, ...payload });
      else await fabMutate('fabErpResourceTypeProperty', 'insert', payload);
      setPropDlg({ open: false, item: null });
      await load();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setPropErr(err.response?.data?.error ?? err.message ?? 'Save failed');
    } finally { setPropSaving(false); }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
        <InfoOutlinedIcon fontSize="small" sx={{ mt: 0.3, color: 'var(--c-info-600)' }} />
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
          Formula properties define <Mono>machine.*</Mono> variables available in routing formulas, e.g. <Mono>machine.speed</Mono>, <Mono>machine.feed_rate</Mono>.
        </Typography>
      </Box>

      {loading ? <CircularProgress size={20} /> : (
        <>
          {canManage && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
              <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => { setPropDraft(BLANK_PROP()); setPropErr(''); setPropDlg({ open: true, item: null }); }}>Add property</Button>
            </Box>
          )}
          {props.length === 0 ? (
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No formula properties defined yet.</Typography>
          ) : (
            <Table size="small">
              <TableHead><TableRow sx={{ background: 'var(--c-surface-2)' }}>
                <TableCell sx={th}>Key (formula variable)</TableCell><TableCell sx={th}>Label</TableCell><TableCell sx={th}>Unit</TableCell>
                <TableCell sx={th}>Default value</TableCell>{canManage && <TableCell sx={{ ...th, width: 80 }} />}
              </TableRow></TableHead>
              <TableBody>
                {props.map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell sx={td}><Mono>machine.{p.propertyKey}</Mono></TableCell>
                    <TableCell sx={td}>{p.propertyLabel}</TableCell>
                    <TableCell sx={td}>{p.unit ?? '—'}</TableCell>
                    <TableCell sx={td}>{p.defaultValue ?? '—'}</TableCell>
                    {canManage && (
                      <TableCell sx={td}>
                        <Stack direction="row" spacing={0.5}>
                          <Tooltip title="Edit"><IconButton size="small" onClick={() => { setPropDraft({ property_key: p.propertyKey, property_label: p.propertyLabel, unit: p.unit ?? '', default_value: p.defaultValue != null ? String(p.defaultValue) : '' }); setPropErr(''); setPropDlg({ open: true, item: p }); }}><EditRounded fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDelTarget(p)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}

      <Dialog open={propDlg.open} onClose={() => setPropDlg({ open: false, item: null })} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>{propDlg.item ? `Edit — ${propDlg.item.propertyKey}` : 'Add formula property'}</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {propErr && <Alert severity="error">{propErr}</Alert>}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Property key" size="small" fullWidth required value={propDraft.property_key}
                onChange={(e) => setPropDraft((d) => ({ ...d, property_key: e.target.value.replace(/\s/g, '_') }))}
                disabled={!!propDlg.item} helperText='e.g. "speed" → machine.speed in formulas' />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Label" size="small" fullWidth required value={propDraft.property_label} onChange={(e) => setPropDraft((d) => ({ ...d, property_label: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Unit" size="small" fullWidth value={propDraft.unit} onChange={(e) => setPropDraft((d) => ({ ...d, unit: e.target.value }))} placeholder="e.g. mm/min" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Default value" type="number" size="small" fullWidth value={propDraft.default_value} onChange={(e) => setPropDraft((d) => ({ ...d, default_value: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPropDlg({ open: false, item: null })}>Cancel</Button>
          <Button variant="contained" disabled={propSaving} onClick={saveProp}>{propSaving ? <CircularProgress size={16} color="inherit" /> : 'Save'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!delTarget} onClose={() => setDelTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Delete property</DialogTitle>
        <DialogContent><Typography>Delete <strong>{delTarget?.propertyKey}</strong>? This cannot be undone.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDelTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={async () => { if (!delTarget) return; await fabMutate('fabErpResourceTypeProperty', 'delete', { id: delTarget.id }); setDelTarget(null); await load(); }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

interface RtBasicDraft { name: string; code: string; category: string; plantId: number | null }

function ResourceTypeDetailDialog({ open, initial, plants, canManage, onClose, onSaved }: {
  open: boolean; initial: FabResourceType | null; plants: FabPlant[]; canManage: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [tab, setTab] = useState(0);
  const [basic, setBasic] = useState<RtBasicDraft>({ name: '', code: '', category: '', plantId: null });
  const [std, setStd] = useState<StdDraft>(blankStd());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    setTab(0); setErr('');
    if (initial) { setBasic({ name: initial.name, code: initial.code, category: initial.category ?? '', plantId: initial.plantId ?? null }); setStd(fromRtStd(initial)); }
    else { setBasic({ name: '', code: '', category: '', plantId: null }); setStd(blankStd()); }
  }, [open, initial]);

  async function save() {
    if (!basic.name.trim() || !basic.code.trim()) { setErr('Name and code are required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = { name: basic.name.trim(), code: basic.code.trim(), category: basic.category.trim() || null, plant_id: basic.plantId, ...toStdPayload(std) };
      if (isNew) await fabMutate('fabErpResourceType', 'insert', payload);
      else await fabMutate('fabErpResourceType', 'update', { id: initial!.id, ...payload });
      onSaved();
      if (isNew) onClose();
    } catch (e) {
      const e2 = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(e2.response?.data?.error ?? e2.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  const tabLabels = isNew ? ['Basic Info', 'Capacity & Scheduling'] : ['Basic Info', 'Capacity & Scheduling', 'Custom Fields (10)', 'Formula Properties'];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{isNew ? 'New resource type' : `Resource type — ${initial?.code} · ${initial?.name}`}</DialogTitle>
      <Box sx={{ borderBottom: '1px solid var(--c-divider)', px: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>{tabLabels.map((l, i) => <Tab key={i} label={l} />)}</Tabs>
      </Box>
      <DialogContent dividers sx={{ minHeight: 400 }}>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        {tab === 0 && (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}><TextField label="Code *" size="small" fullWidth value={basic.code} onChange={(e) => setBasic((d) => ({ ...d, code: e.target.value }))} disabled={!canManage} /></Grid>
            <Grid size={{ xs: 12, sm: 4 }}><TextField label="Name *" size="small" fullWidth value={basic.name} onChange={(e) => setBasic((d) => ({ ...d, name: e.target.value }))} disabled={!canManage} /></Grid>
            <Grid size={{ xs: 12, sm: 4 }}><TextField label="Category" size="small" fullWidth value={basic.category} onChange={(e) => setBasic((d) => ({ ...d, category: e.target.value }))} disabled={!canManage} helperText="e.g. Machine, Labor, Tool" /></Grid>
            <Grid size={{ xs: 12 }}>
              <TextField select label="Plant" size="small" fullWidth value={basic.plantId ?? ''} onChange={(e) => setBasic((d) => ({ ...d, plantId: e.target.value === '' ? null : Number(e.target.value) }))} helperText="Leave blank for company-wide" disabled={!canManage}>
                <MenuItem value="">— (company-wide)</MenuItem>
                {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.code} — {p.name}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        )}
        {tab === 1 && <StdFieldsSection draft={std} onChange={(k, v) => setStd((d) => ({ ...d, [k]: v }))} canEdit={canManage} />}
        {tab === 2 && !isNew && initial && <CustomFieldsEditor level="resource_type" levelId={initial.id} canManage={canManage} />}
        {tab === 3 && !isNew && initial && <FormulaPropertiesEditor rtId={initial.id} canManage={canManage} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {canManage && (tab === 0 || tab === 1) && (
          <Button variant="contained" onClick={save} disabled={saving}>{saving ? <CircularProgress size={16} color="inherit" /> : (isNew ? 'Create' : 'Save changes')}</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

interface ResDraft { name: string; code: string; resourceTypeId: number | null; plantId: number | null; stockLocationId: number | null; shiftCalendarId: number | null }
interface FabShiftCalendarOption { id: number; name: string; code: string; plantId: number | null }

interface NewTypeDraft { name: string; code: string }
const BLANK_NEW_TYPE = (): NewTypeDraft => ({ name: '', code: '' });

function AddResourceDialog({ open, resourceTypes, plants, onClose, onSaved, onTypeCreated }: {
  open: boolean; resourceTypes: FabResourceType[]; plants: FabPlant[];
  onClose: () => void; onSaved: () => void; onTypeCreated: () => Promise<void>;
}) {
  const [basic, setBasic] = useState<ResDraft>({ name: '', code: '', resourceTypeId: null, plantId: null, stockLocationId: null, shiftCalendarId: null });
  const [typeInput, setTypeInput] = useState<ResourceTypeOption | null>(null);
  const [creatingType, setCreatingType] = useState(false);
  const [newType, setNewType] = useState<NewTypeDraft>(BLANK_NEW_TYPE());
  const [newTypeSaving, setNewTypeSaving] = useState(false);
  const [newTypeErr, setNewTypeErr] = useState('');
  const [stockLocations, setStockLocations] = useState<FabStockLocation[]>([]);
  const [shiftCalendars, setShiftCalendars] = useState<FabShiftCalendarOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setBasic({ name: '', code: '', resourceTypeId: null, plantId: null, stockLocationId: null, shiftCalendarId: null });
    setTypeInput(null);
    setCreatingType(false); setNewType(BLANK_NEW_TYPE()); setNewTypeErr('');
    setErr('');
  }, [open]);

  useEffect(() => {
    if (!open || basic.plantId == null) { setStockLocations([]); return; }
    fabQuery<QueryResult<FabStockLocation>>('fabErpStockLocation', { filters: { plantId: basic.plantId }, orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 } })
      .then((res) => setStockLocations(res.data ?? [])).catch(() => setStockLocations([]));
  }, [open, basic.plantId]);

  useEffect(() => {
    if (!open) return;
    fabQuery<QueryResult<FabShiftCalendarOption>>('fabErpShiftCalendar', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 200 } })
      .then((res) => setShiftCalendars(res.data ?? [])).catch(() => setShiftCalendars([]));
  }, [open]);

  const typeOptions: ResourceTypeOption[] = resourceTypes.map((rt) => ({ id: rt.id, label: `${rt.code} — ${rt.name}` }));

  function selectType(option: ResourceTypeOption | null) {
    if (!option) { setTypeInput(null); setBasic((d) => ({ ...d, resourceTypeId: null })); return; }
    if (option.id === CREATE_NEW_TYPE) { setCreatingType(true); setNewType(BLANK_NEW_TYPE()); setNewTypeErr(''); return; }
    setTypeInput(option);
    setBasic((d) => ({ ...d, resourceTypeId: option.id as number }));
  }

  async function saveNewType() {
    if (!newType.name.trim() || !newType.code.trim()) { setNewTypeErr('Name and code are required.'); return; }
    setNewTypeSaving(true); setNewTypeErr('');
    try {
      const res = await fabMutate<{ ok: boolean; id: number }>('fabErpResourceType', 'insert', { name: newType.name.trim(), code: newType.code.trim() });
      await onTypeCreated();
      const label = `${newType.code.trim()} — ${newType.name.trim()}`;
      setTypeInput({ id: res.id, label });
      setBasic((d) => ({ ...d, resourceTypeId: res.id }));
      setCreatingType(false);
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        try {
          const existing = await fabQuery<QueryResult<{ id: number; name: string; code: string }>>('fabErpResourceType', { filters: { code: newType.code.trim() }, pagination: { limit: 1 } });
          const match = existing.data?.[0];
          if (match) {
            await onTypeCreated();
            setTypeInput({ id: match.id, label: `${match.code} — ${match.name}` });
            setBasic((d) => ({ ...d, resourceTypeId: match.id }));
            setCreatingType(false);
            return;
          }
        } catch { /* fall through to showing the original error */ }
      }
      setNewTypeErr(errMsg(e));
    } finally { setNewTypeSaving(false); }
  }

  async function save() {
    if (!basic.name.trim() || !basic.code.trim() || !basic.resourceTypeId) { setErr('Name, code and resource type are required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        name: basic.name.trim(), code: basic.code.trim(), resource_type_id: basic.resourceTypeId,
        plant_id: basic.plantId, stock_location_id: basic.stockLocationId, shift_calendar_id: basic.shiftCalendarId,
      };
      await fabMutate('fabErpResource', 'insert', payload);
      onSaved();
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>New resource</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Alert severity="info" icon={<InfoOutlinedIcon fontSize="small" />}>
          A resource is the actual physical machine or worker, e.g. "Lathe Machine 1". If its category doesn't exist yet, create it inline below.
        </Alert>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}><TextField label="Code *" size="small" fullWidth value={basic.code} onChange={(e) => setBasic((d) => ({ ...d, code: e.target.value }))} /></Grid>
          <Grid size={{ xs: 12, sm: 8 }}><TextField label="Name *" size="small" fullWidth value={basic.name} onChange={(e) => setBasic((d) => ({ ...d, name: e.target.value }))} /></Grid>
          <Grid size={{ xs: 12 }}>
            <Autocomplete
              options={typeOptions}
              value={typeInput}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              onChange={(_, value) => selectType(value)}
              filterOptions={(options, state) => {
                const filtered = options.filter((o) => o.label.toLowerCase().includes(state.inputValue.toLowerCase()));
                filtered.push({ id: CREATE_NEW_TYPE, label: '+ Create new type…' });
                return filtered;
              }}
              renderOption={(props, option) => (
                <li {...props} key={option.id}>
                  {option.id === CREATE_NEW_TYPE ? <em>{option.label}</em> : option.label}
                </li>
              )}
              renderInput={(params) => <TextField {...params} label="Resource type *" size="small" placeholder="Select or create a type…" />}
            />
          </Grid>
          {creatingType && (
            <Grid size={{ xs: 12 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
                {newTypeErr && <Alert severity="error" sx={{ py: 0 }}>{newTypeErr}</Alert>}
                <Typography variant="subtitle2" color="text.secondary">New resource type</Typography>
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  <TextField label="Name" value={newType.name} size="small" sx={{ flex: 2 }} autoFocus
                    onChange={(e) => setNewType((d) => ({ ...d, name: e.target.value }))} />
                  <TextField label="Code" value={newType.code} size="small" sx={{ flex: 1 }}
                    onChange={(e) => setNewType((d) => ({ ...d, code: e.target.value }))} />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                  <Button size="small" onClick={() => setCreatingType(false)}>Cancel</Button>
                  <Button size="small" variant="contained" onClick={saveNewType} disabled={newTypeSaving}>
                    {newTypeSaving ? <CircularProgress size={14} /> : 'Create type'}
                  </Button>
                </Box>
              </Box>
            </Grid>
          )}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField select label="Plant" size="small" fullWidth value={basic.plantId ?? ''} onChange={(e) => setBasic((d) => ({ ...d, plantId: e.target.value === '' ? null : Number(e.target.value), stockLocationId: null }))} helperText="Leave blank for company-wide">
              <MenuItem value="">— (company-wide)</MenuItem>
              {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.code} — {p.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField select label="Stock location" size="small" fullWidth value={basic.stockLocationId ?? ''} onChange={(e) => setBasic((d) => ({ ...d, stockLocationId: e.target.value === '' ? null : Number(e.target.value) }))} disabled={basic.plantId == null} helperText={basic.plantId == null ? 'Select a plant first' : 'Optional'}>
              <MenuItem value="">— (none)</MenuItem>
              {stockLocations.map((sl) => <MenuItem key={sl.id} value={sl.id}>{sl.code} — {sl.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField select label="Shift calendar" size="small" fullWidth value={basic.shiftCalendarId ?? ''} onChange={(e) => setBasic((d) => ({ ...d, shiftCalendarId: e.target.value === '' ? null : Number(e.target.value) }))} helperText="Working hours / shift pattern for this machine">
              <MenuItem value="">— (none)</MenuItem>
              {shiftCalendars.map((sc) => <MenuItem key={sc.id} value={sc.id}>{sc.code} — {sc.name}</MenuItem>)}
            </TextField>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{saving ? <CircularProgress size={16} color="inherit" /> : 'Create resource'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function ResourceDetailDialog({ open, initial, resourceTypes, plants, canManage, onClose, onSaved }: {
  open: boolean; initial: FabResource | null; resourceTypes: FabResourceType[]; plants: FabPlant[]; canManage: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [tab, setTab] = useState(0);
  const [basic, setBasic] = useState<ResDraft>({ name: '', code: '', resourceTypeId: null, plantId: null, stockLocationId: null, shiftCalendarId: null });
  const [std, setStd] = useState<StdDraft>(blankStd());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [stockLocations, setStockLocations] = useState<FabStockLocation[]>([]);
  const [shiftCalendars, setShiftCalendars] = useState<FabShiftCalendarOption[]>([]);
  const isNew = !initial;

  const selectedType = resourceTypes.find((rt) => rt.id === basic.resourceTypeId);
  const typeDefaults = selectedType ? fromRtStd(selectedType) : undefined;

  useEffect(() => {
    if (!open) return;
    setTab(0); setErr('');
    if (initial) {
      setBasic({ name: initial.name, code: initial.code, resourceTypeId: initial.resourceTypeId, plantId: initial.plantId ?? null, stockLocationId: initial.stockLocationId ?? null, shiftCalendarId: (initial as unknown as { shiftCalendarId?: number }).shiftCalendarId ?? null });
      setStd(fromResStd(initial));
    } else {
      setBasic({ name: '', code: '', resourceTypeId: null, plantId: null, stockLocationId: null, shiftCalendarId: null });
      setStd(blankStd());
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open || basic.plantId == null) { setStockLocations([]); return; }
    fabQuery<QueryResult<FabStockLocation>>('fabErpStockLocation', { filters: { plantId: basic.plantId }, orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 } })
      .then((res) => setStockLocations(res.data ?? [])).catch(() => setStockLocations([]));
  }, [open, basic.plantId]);

  useEffect(() => {
    if (!open) return;
    fabQuery<QueryResult<FabShiftCalendarOption>>('fabErpShiftCalendar', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 200 } })
      .then((res) => setShiftCalendars(res.data ?? [])).catch(() => setShiftCalendars([]));
  }, [open]);

  useEffect(() => {
    if (basic.stockLocationId == null) return;
    if (!stockLocations.some((l) => l.id === basic.stockLocationId)) setBasic((d) => ({ ...d, stockLocationId: null }));
  }, [stockLocations, basic.stockLocationId]);

  async function save() {
    if (!basic.name.trim() || !basic.code.trim() || !basic.resourceTypeId) { setErr('Name, code and resource type are required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        name: basic.name.trim(), code: basic.code.trim(), resource_type_id: basic.resourceTypeId,
        plant_id: basic.plantId, stock_location_id: basic.stockLocationId, shift_calendar_id: basic.shiftCalendarId, ...toStdPayload(std),
      };
      if (isNew) await fabMutate('fabErpResource', 'insert', payload);
      else await fabMutate('fabErpResource', 'update', { id: initial!.id, ...payload });
      onSaved();
      if (isNew) onClose();
    } catch (e) {
      const e2 = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(e2.response?.data?.error ?? e2.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  const tabLabels = isNew ? ['Basic Info', 'Capacity & Scheduling'] : ['Basic Info', 'Capacity & Scheduling', 'Custom Fields (10)'];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{isNew ? 'New resource' : `Resource — ${initial?.code} · ${initial?.name}`}</DialogTitle>
      <Box sx={{ borderBottom: '1px solid var(--c-divider)', px: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>{tabLabels.map((l, i) => <Tab key={i} label={l} />)}</Tabs>
      </Box>
      <DialogContent dividers sx={{ minHeight: 400 }}>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        {tab === 0 && (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}><TextField label="Code *" size="small" fullWidth value={basic.code} onChange={(e) => setBasic((d) => ({ ...d, code: e.target.value }))} disabled={!canManage} /></Grid>
            <Grid size={{ xs: 12, sm: 8 }}><TextField label="Name *" size="small" fullWidth value={basic.name} onChange={(e) => setBasic((d) => ({ ...d, name: e.target.value }))} disabled={!canManage} /></Grid>
            <Grid size={{ xs: 12 }}>
              <TextField select label="Resource type *" size="small" fullWidth value={basic.resourceTypeId ?? ''} onChange={(e) => setBasic((d) => ({ ...d, resourceTypeId: e.target.value === '' ? null : Number(e.target.value) }))} disabled={!canManage}>
                <MenuItem value="">— Select type —</MenuItem>
                {resourceTypes.map((rt) => <MenuItem key={rt.id} value={rt.id}>{rt.code} — {rt.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select label="Plant" size="small" fullWidth value={basic.plantId ?? ''} onChange={(e) => setBasic((d) => ({ ...d, plantId: e.target.value === '' ? null : Number(e.target.value) }))} helperText="Leave blank for company-wide" disabled={!canManage}>
                <MenuItem value="">— (company-wide)</MenuItem>
                {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.code} — {p.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select label="Stock location" size="small" fullWidth value={basic.stockLocationId ?? ''} onChange={(e) => setBasic((d) => ({ ...d, stockLocationId: e.target.value === '' ? null : Number(e.target.value) }))} disabled={!canManage || basic.plantId == null} helperText={basic.plantId == null ? 'Select a plant first' : 'Optional'}>
                <MenuItem value="">— (none)</MenuItem>
                {stockLocations.map((sl) => <MenuItem key={sl.id} value={sl.id}>{sl.code} — {sl.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField select label="Shift calendar" size="small" fullWidth value={basic.shiftCalendarId ?? ''} onChange={(e) => setBasic((d) => ({ ...d, shiftCalendarId: e.target.value === '' ? null : Number(e.target.value) }))} helperText="Working hours / shift pattern for this machine" disabled={!canManage}>
                <MenuItem value="">— (none)</MenuItem>
                {shiftCalendars.map((sc) => <MenuItem key={sc.id} value={sc.id}>{sc.code} — {sc.name}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        )}
        {tab === 1 && (
          <>
            {selectedType ? (
              <Box sx={{ mb: 2, p: 1.5, background: 'var(--c-info-50)', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-info-200)' }}>
                <Typography sx={{ fontSize: 13, color: 'var(--c-info-700)' }}>
                  Showing defaults from resource type <strong>{selectedType.code} — {selectedType.name}</strong>. Leave a field empty to inherit the type's default. Fill it in to override for this specific resource.
                </Typography>
              </Box>
            ) : (
              <Alert severity="warning" sx={{ mb: 2 }}>Select a resource type first to see inherited defaults.</Alert>
            )}
            <StdFieldsSection draft={std} onChange={(k, v) => setStd((d) => ({ ...d, [k]: v }))} typeDefaults={typeDefaults} canEdit={canManage} />
          </>
        )}
        {tab === 2 && !isNew && initial && <CustomFieldsEditor level="resource" levelId={initial.id} canManage={canManage} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {canManage && (tab === 0 || tab === 1) && (
          <Button variant="contained" onClick={save} disabled={saving}>{saving ? <CircularProgress size={16} color="inherit" /> : (isNew ? 'Create' : 'Save changes')}</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function DeleteDialog({ open, label, onClose, onConfirm }: { open: boolean; label: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Confirm delete</DialogTitle>
      <DialogContent><Typography>Delete <strong>{label}</strong>? This action cannot be undone.</Typography></DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" onClick={onConfirm}>Delete</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function ResourceTypes() {
  const canManage = usePermission('fab_erp_resources_manage');
  const { toast } = useToast();

  const [tab, setTab] = useState(0); // 0 = Resources (default), 1 = Resource Types
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [plants, setPlants] = useState<FabPlant[]>([]);
  const [resourceTypes, setResourceTypes] = useState<FabResourceType[]>([]);
  const [resources, setResources] = useState<FabResource[]>([]);
  const [stockLocations, setStockLocations] = useState<FabStockLocation[]>([]);

  const [rtDetail, setRtDetail] = useState<{ open: boolean; item: FabResourceType | null }>({ open: false, item: null });
  const [rtDelete, setRtDelete] = useState<FabResourceType | null>(null);
  const [rtDeleting, setRtDeleting] = useState(false);

  const [resDetail, setResDetail] = useState<{ open: boolean; item: FabResource | null }>({ open: false, item: null });
  const [addResOpen, setAddResOpen] = useState(false);
  const [resDelete, setResDelete] = useState<FabResource | null>(null);
  const [resDeleting, setResDeleting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [plantsRes, rtRes, resRes, slRes] = await Promise.all([
        fabQuery<QueryResult<FabPlant>>('fabErpPlant', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 } }),
        fabQuery<QueryResult<FabResourceType>>('fabErpResourceType', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 } }),
        fabQuery<QueryResult<FabResource>>('fabErpResource', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 } }),
        fabQuery<QueryResult<FabStockLocation>>('fabErpStockLocation', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 } }),
      ]);
      setPlants(plantsRes.data ?? []);
      setResourceTypes(rtRes.data ?? []);
      setResources(resRes.data ?? []);
      setStockLocations(slRes.data ?? []);
    } catch (e) { setError((e as Error).message ?? 'Failed to load data'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function onSaved() { fetchAll(); }

  const plantMap = new Map(plants.map((p) => [p.id, p]));
  const rtMap = new Map(resourceTypes.map((rt) => [rt.id, rt]));
  const slMap = new Map(stockLocations.map((sl) => [sl.id, sl]));

  async function handleDeleteResourceType() {
    if (!rtDelete) return;
    setRtDeleting(true);
    try { await fabMutate('fabErpResourceType', 'delete', { id: rtDelete.id }); setRtDelete(null); fetchAll(); toast('Resource type deleted'); }
    catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err.response?.data?.error ?? err.message ?? 'Delete failed'); setRtDelete(null);
    } finally { setRtDeleting(false); }
  }

  async function handleDeleteResource() {
    if (!resDelete) return;
    setResDeleting(true);
    try { await fabMutate('fabErpResource', 'delete', { id: resDelete.id }); setResDelete(null); fetchAll(); toast('Resource deleted'); }
    catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err.response?.data?.error ?? err.message ?? 'Delete failed'); setResDelete(null);
    } finally { setResDeleting(false); }
  }

  return (
    <Box sx={{ maxWidth: 1300, mx: 'auto' }}>
      <PageHeader title="Resource Catalog" subtitle="Resource types with capacity/scheduling/costing defaults · individual resources with overrides · custom fields" />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Mono chip>{resourceTypes.length} resource types</Mono>
        <Mono chip>{resources.length} resources</Mono>
      </Stack>

      <Box sx={{ borderBottom: '1px solid var(--c-divider)', mb: 2.5 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Resources" />
          <Tab label="Resource Types" />
        </Tabs>
      </Box>

      {loading ? <ListSkeleton rows={5} /> : (
        <>
          {tab === 0 && (
            <>
              <Alert severity="info" icon={<InfoOutlinedIcon fontSize="small" />} sx={{ mb: 2 }}>
                Resources are the actual physical machines or workers, e.g. "Lathe Machine 1", "Lathe Machine 2". Each resource belongs to a Resource Type — a category like "Lathe" — managed in the Resource Types tab.
              </Alert>
              {canManage && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddResOpen(true)}>New resource</Button>
                </Box>
              )}
              {resources.length === 0 ? (
                <EmptyState icon={<PrecisionManufacturingRounded />} title="No resources defined" hint='Click "New resource" to add one.' />
              ) : (
                <>
                  <EntityList
                    rows={resources}
                    sortableFields={RESOURCE_SORT_FIELDS}
                    defaultSortKey="name"
                    renderRow={(r) => {
                      const rt = rtMap.get(r.resourceTypeId);
                      const plant = r.plantId != null ? plantMap.get(r.plantId) : undefined;
                      const sl = r.stockLocationId != null ? slMap.get(r.stockLocationId) : undefined;
                      return (
                        <EntityRow
                          key={r.id}
                          code={<Mono chip>{r.code}</Mono>}
                          primary={r.name}
                          secondary={[sl?.code, rt ? `${rt.code} — ${rt.name}` : null, plant ? `${plant.code} — ${plant.name}` : 'Company-wide'].filter(Boolean).join(' · ')}
                          trailing={(<>
                            {r.capacityHrsPerDay != null && <Mono chip>{r.capacityHrsPerDay} hrs/day</Mono>}
                            {r.costPerHour != null && <Mono chip>{r.costPerHour} {r.currency ?? 'INR'}/hr</Mono>}
                          </>)}
                          onClick={() => setResDetail({ open: true, item: r })}
                          actions={canManage ? (
                            <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setResDelete(r)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                          ) : undefined}
                        />
                      );
                    }}
                  />
                  <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'var(--c-text-3)' }}>Click a row to view/edit details and override capacity/scheduling/costing values. Mono chips indicate resource-specific overrides.</Typography>
                </>
              )}
            </>
          )}

          {tab === 1 && (
            <>
              <Alert severity="info" icon={<InfoOutlinedIcon fontSize="small" />} sx={{ mb: 2 }}>
                Resource Types are categories of equipment, e.g. "Lathe". They hold shared capacity/scheduling/costing defaults. Individual machines (e.g. "Lathe Machine 1", "Lathe Machine 2") are created in the Resources tab.
              </Alert>
              {canManage && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => setRtDetail({ open: true, item: null })}>New resource type</Button>
                </Box>
              )}
              {resourceTypes.length === 0 ? (
                <EmptyState icon={<PrecisionManufacturingRounded />} title="No resource types defined" hint='Click "New resource type" to add one.' />
              ) : (
                <>
                  <EntityList
                    rows={resourceTypes}
                    sortableFields={RESOURCE_TYPE_SORT_FIELDS}
                    defaultSortKey="name"
                    renderRow={(rt) => {
                      const plant = rt.plantId != null ? plantMap.get(rt.plantId) : undefined;
                      return (
                        <EntityRow
                          key={rt.id}
                          code={<Mono chip>{rt.code}</Mono>}
                          primary={rt.name}
                          secondary={[rt.category, plant ? `${plant.code} — ${plant.name}` : 'Company-wide'].filter(Boolean).join(' · ')}
                          trailing={(<>
                            {rt.capacityHrsPerDay != null && <Mono chip>{rt.capacityHrsPerDay} hrs × {rt.numUnits ?? 1} units</Mono>}
                            {rt.costPerHour != null && <Mono chip>{rt.costPerHour} {rt.currency ?? 'INR'}/hr</Mono>}
                          </>)}
                          onClick={() => setRtDetail({ open: true, item: rt })}
                          actions={canManage ? (
                            <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setRtDelete(rt)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                          ) : undefined}
                        />
                      );
                    }}
                  />
                  <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'var(--c-text-3)' }}>Click a row to view/edit details, custom fields, and formula properties.</Typography>
                </>
              )}
            </>
          )}
        </>
      )}

      <ResourceTypeDetailDialog open={rtDetail.open} initial={rtDetail.item} plants={plants} canManage={canManage} onClose={() => setRtDetail({ open: false, item: null })} onSaved={onSaved} />
      <ResourceDetailDialog open={resDetail.open} initial={resDetail.item} resourceTypes={resourceTypes} plants={plants} canManage={canManage} onClose={() => setResDetail({ open: false, item: null })} onSaved={onSaved} />
      <AddResourceDialog open={addResOpen} resourceTypes={resourceTypes} plants={plants} onClose={() => setAddResOpen(false)} onSaved={onSaved} onTypeCreated={fetchAll} />

      <DeleteDialog open={!!rtDelete} label={rtDelete ? `${rtDelete.code} — ${rtDelete.name}` : ''} onClose={() => setRtDelete(null)} onConfirm={handleDeleteResourceType} />
      {rtDeleting && <CircularProgress size={20} sx={{ position: 'fixed', bottom: 24, right: 24 }} />}
      <DeleteDialog open={!!resDelete} label={resDelete ? `${resDelete.code} — ${resDelete.name}` : ''} onClose={() => setResDelete(null)} onConfirm={handleDeleteResource} />
      {resDeleting && <CircularProgress size={20} sx={{ position: 'fixed', bottom: 24, right: 24 }} />}
    </Box>
  );
}
