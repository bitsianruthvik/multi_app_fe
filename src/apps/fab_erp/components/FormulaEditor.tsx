/**
 * FormulaEditor — dialog for creating / editing a single fab_erp formula.
 *
 * Live validation via POST /api/:companySlug/fab_erp/formula/validate
 * Stores expression_ast_json returned by validate; blocks save if invalid.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import api, { API_HOST } from '@core/utils/axiosConfig';
import { fabMutate } from '../api/client';
// Legacy stub — FabFormula type removed from types.ts; kept inline for backwards compat
interface FabFormula {
  id: number;
  name: string;
  resultMetricKey: string;
  expressionText: string;
  formulaSetId?: number;
  [key: string]: unknown;
}

// ── Variable-help categories shown in the helper panel ───────────────────────
const VAR_CATEGORIES = [
  {
    label: 'Item Metrics',
    description: 'Per-item measured values',
    examples: ['weight_kg', 'length_mm', 'weld_length_mm', 'cut_length_mm', 'surface_area_m2', 'num_holes', 'qty'],
  },
  {
    label: 'Resource-Type Metrics',
    description: 'Metrics attached to a resource type',
    examples: ['rt.<metric_key>  (e.g. rt.speed_m_per_min)'],
  },
  {
    label: 'Constants',
    description: 'Named constants from fab_constants',
    examples: ['const.<const_key>  (e.g. const.pi, const.efficiency_factor)'],
  },
  {
    label: 'System Values',
    description: 'Always-available system values',
    examples: ['working_minutes_per_day', 'working_minutes_per_shift'],
  },
];

// ── Validation state ──────────────────────────────────────────────────────────
type ValidationState =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'valid'; variables: string[]; astJson: unknown }
  | { status: 'invalid'; errors: string[] };

// ── Draft type ────────────────────────────────────────────────────────────────
interface FormulaDraft {
  name: string;
  resultMetricKey: string;
  expressionText: string;
}

const BLANK = (): FormulaDraft => ({ name: '', resultMetricKey: '', expressionText: '' });

// ── Props ─────────────────────────────────────────────────────────────────────
interface FormulaEditorProps {
  open: boolean;
  formulaSetId: number;
  initial: FabFormula | null;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function FormulaEditor({
  open, formulaSetId, initial, canManage, onClose, onSaved,
}: FormulaEditorProps) {
  const { company: companyParam } = useParams<{ company: string }>();
  const companySlug = companyParam ?? localStorage.getItem('companySlug') ?? '';

  const isNew = !initial;

  const [draft, setDraft]         = useState<FormulaDraft>(BLANK());
  const [saving, setSaving]       = useState(false);
  const [saveErr, setSaveErr]     = useState('');
  const [validation, setValidation] = useState<ValidationState>({ status: 'idle' });

  // Track the expression that was last validated so we can detect dirty edits
  const lastValidatedExpr = useRef<string | null>(null);

  // ── Populate on open ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({
        name:            initial.name,
        resultMetricKey: initial.resultMetricKey,
        expressionText:  initial.expressionText,
      });
      // If the record already has a stored AST treat it as pre-validated
      if (initial.expressionAstJson) {
        setValidation({ status: 'valid', variables: [], astJson: initial.expressionAstJson });
        lastValidatedExpr.current = initial.expressionText;
      } else {
        setValidation({ status: 'idle' });
        lastValidatedExpr.current = null;
      }
    } else {
      setDraft(BLANK());
      setValidation({ status: 'idle' });
      lastValidatedExpr.current = null;
    }
    setSaveErr('');
  }, [open, initial]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const set = (k: keyof FormulaDraft, v: string) =>
    setDraft((d) => ({ ...d, [k]: v }));

  function onExpressionChange(v: string) {
    set('expressionText', v);
    // Mark validation stale if the expression has been changed since last validate
    if (v !== lastValidatedExpr.current) {
      setValidation((prev) => (prev.status === 'idle' ? prev : { status: 'idle' }));
    }
  }

  // ── Validate ────────────────────────────────────────────────────────────────
  async function validate() {
    const expr = draft.expressionText.trim();
    if (!expr) return;
    setValidation({ status: 'validating' });
    try {
      const res = await api.post<
        { valid: true; variables: string[]; astJson: unknown } |
        { valid: false; errors: string[] }
      >(
        `${API_HOST}/api/${companySlug}/fab_erp/formula/validate`,
        { expressionText: expr },
      );
      const data = res.data;
      if (data.valid) {
        setValidation({ status: 'valid', variables: data.variables, astJson: data.astJson });
      } else {
        setValidation({ status: 'invalid', errors: data.errors });
      }
      lastValidatedExpr.current = expr;
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setValidation({
        status: 'invalid',
        errors: [e.response?.data?.error ?? e.message ?? 'Validation request failed'],
      });
      lastValidatedExpr.current = expr;
    }
  }

  // Validate on blur of the expression field
  async function onExpressionBlur() {
    const expr = draft.expressionText.trim();
    if (!expr || expr === lastValidatedExpr.current) return;
    await validate();
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  const saveBlocked =
    validation.status !== 'valid' ||
    draft.expressionText.trim() !== lastValidatedExpr.current;

  async function save() {
    if (!canManage) return;
    if (saveBlocked) { setSaveErr('Expression must be validated (and valid) before saving.'); return; }
    setSaving(true); setSaveErr('');
    try {
      const astJson = validation.status === 'valid' ? validation.astJson : null;

      if (isNew) {
        await fabMutate('fabErpFormula', 'insert', {
          formula_set_id:       formulaSetId,
          name:                 draft.name,
          result_metric_key:    draft.resultMetricKey,
          expression_text:      draft.expressionText,
          expression_ast_json:  JSON.stringify(astJson),
        });
      } else {
        await fabMutate('fabErpFormula', 'update', {
          id:                   initial!.id,
          formula_set_id:       formulaSetId,
          name:                 draft.name,
          result_metric_key:    draft.resultMetricKey,
          expression_text:      draft.expressionText,
          expression_ast_json:  JSON.stringify(astJson),
        });
      }
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setSaveErr(e.response?.data?.error ?? e.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const exprDirty =
    draft.expressionText.trim() !== lastValidatedExpr.current &&
    draft.expressionText.trim() !== '';

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {isNew ? 'New Formula' : `Edit Formula — ${initial?.name}`}
      </DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {saveErr && <Alert severity="error">{saveErr}</Alert>}

        {/* ── Identity fields ─────────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Formula Name"
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            size="small"
            sx={{ flex: 2, minWidth: 200 }}
            required
            disabled={!canManage}
          />
          <TextField
            label="Result Metric Key"
            value={draft.resultMetricKey}
            onChange={(e) => set('resultMetricKey', e.target.value)}
            size="small"
            sx={{ flex: 1, minWidth: 160 }}
            required
            placeholder="e.g. weld_hours"
            helperText="Metric produced by this formula"
            disabled={!canManage}
          />
        </Box>

        {/* ── Expression ──────────────────────────────────────────────────── */}
        <Box>
          <TextField
            label="Expression"
            value={draft.expressionText}
            onChange={(e) => onExpressionChange(e.target.value)}
            onBlur={onExpressionBlur}
            size="small"
            fullWidth
            multiline
            minRows={3}
            maxRows={8}
            required
            disabled={!canManage}
            placeholder="e.g.  weld_length_mm / 1000 * working_minutes_per_shift"
            helperText="Use the variable categories below. Validate before saving."
            inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
          />

          {/* Validate button + status indicator */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={validate}
              disabled={!draft.expressionText.trim() || validation.status === 'validating' || !canManage}
              startIcon={validation.status === 'validating' ? <CircularProgress size={14} /> : undefined}
            >
              {validation.status === 'validating' ? 'Validating…' : 'Validate'}
            </Button>

            {exprDirty && validation.status !== 'validating' && (
              <Typography variant="caption" color="warning.main">
                Expression changed — validate again before saving.
              </Typography>
            )}

            {/* Valid badge */}
            {validation.status === 'valid' && !exprDirty && (
              <Chip
                icon={<CheckCircleIcon />}
                label="Valid"
                color="success"
                size="small"
              />
            )}

            {/* Invalid badge */}
            {validation.status === 'invalid' && (
              <Chip
                icon={<ErrorOutlineIcon />}
                label="Invalid"
                color="error"
                size="small"
              />
            )}
          </Box>

          {/* Detected variables */}
          {validation.status === 'valid' && (validation as { status: 'valid'; variables: string[]; astJson: unknown }).variables?.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                Detected variables:
              </Typography>
              <Box sx={{ display: 'inline-flex', gap: 0.5, flexWrap: 'wrap' }}>
                {(validation as { status: 'valid'; variables: string[]; astJson: unknown }).variables.map((v) => (
                  <Chip key={v} label={v} size="small" variant="outlined" color="primary" />
                ))}
              </Box>
            </Box>
          )}

          {/* Error list */}
          {validation.status === 'invalid' && (
            <Alert severity="error" sx={{ mt: 1 }}>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {(validation as { status: 'invalid'; errors: string[] }).errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </Alert>
          )}
        </Box>

        {/* ── Variable reference panel ─────────────────────────────────────── */}
        <Divider />
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
            <HelpOutlineIcon fontSize="small" color="action" />
            <Typography variant="subtitle2">Available Variable Categories</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {VAR_CATEGORIES.map((cat) => (
              <Box
                key={cat.label}
                sx={{
                  flex: '1 1 200px',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 1.5,
                  bgcolor: 'action.hover',
                }}
              >
                <Typography variant="caption" fontWeight={700} color="primary.main">
                  {cat.label}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  {cat.description}
                </Typography>
                <Stack spacing={0.25}>
                  {cat.examples.map((ex) => (
                    <Tooltip key={ex} title="Click to insert" placement="top">
                      <Typography
                        variant="caption"
                        component="code"
                        onClick={() => {
                          if (!canManage) return;
                          const cur = draft.expressionText;
                          const ins = cur ? `${cur} ${ex}` : ex;
                          onExpressionChange(ins);
                        }}
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: 11,
                          bgcolor: 'background.paper',
                          px: 0.5,
                          borderRadius: 0.5,
                          display: 'block',
                          cursor: canManage ? 'pointer' : 'default',
                          '&:hover': canManage ? { bgcolor: 'primary.light', color: 'primary.contrastText' } : {},
                        }}
                      >
                        {ex}
                      </Typography>
                    </Tooltip>
                  ))}
                </Stack>
              </Box>
            ))}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        {canManage && (
          <Tooltip
            title={
              saveBlocked
                ? 'Validate the expression first, and ensure it is valid'
                : ''
            }
          >
            <span>
              <Button
                variant="contained"
                onClick={save}
                disabled={saving || saveBlocked || !draft.name || !draft.resultMetricKey || !draft.expressionText}
              >
                {saving ? <CircularProgress size={16} /> : (isNew ? 'Create Formula' : 'Save Changes')}
              </Button>
            </span>
          </Tooltip>
        )}
      </DialogActions>
    </Dialog>
  );
}
