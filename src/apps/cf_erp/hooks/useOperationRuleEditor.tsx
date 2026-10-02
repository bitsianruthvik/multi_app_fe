import { useMemo, useState } from 'react';
import { Popover, Typography } from '@mui/material';
import { cfApi, CfApiError } from '../api/client';
import type { Formula, Specification, TimingRule, Tree } from '../api/types';
import { useLoad } from './useLoad';
import { useIsPermitted } from './useIsPermitted';
import { screenTreePath } from '../lib/classificationScreens';
import { fieldIndex, type BuilderField } from '../lib/formulaBuilder';
import { subjectText } from '../lib/production';
import { ClassificationPicker } from '../components/ClassificationPicker';
import { TimeBuilder, type TimeAssignment } from '../components/FormulaBuilder/TimeBuilder';
import { useToast } from '../components/toastContext';
import type { OpRef } from '../components/OperationRuleEditor';

/** The pickers and the builder behind OperationRuleEditor's cells, mounted once per page. */
interface TypeAsk { op: OpRef; rule: TimingRule | null; anchor: HTMLElement | null; then: 'setup' | 'work' | null }

export function useOperationRuleEditor(onChanged: () => void) {
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canManage = isPermitted('cf_erp_production_manage');
  const canMakeFormula = isPermitted('cf_erp_setup_manage');
  const formulas = useLoad(() => cfApi.get<Formula[]>('/formulas'), []);
  const specs = useLoad(() => cfApi.get<Specification[]>('/specifications'), []);
  const tree = useLoad(() => cfApi.get<Tree>(screenTreePath('machines')), []);
  const idx = useMemo(() => {
    const fields: BuilderField[] = (specs.data ?? []).map((sp) => ({ code: sp.code, name: sp.name, dataType: sp.dataType, measurementType: sp.measurementType, unit: sp.defaultUom }));
    return fieldIndex(fields, fields, fields);
  }, [specs.data]);
  const [builder, setBuilder] = useState<{ op: OpRef; rule: TimingRule; which: 'setup' | 'work' } | null>(null);
  const [ask, setAsk] = useState<TypeAsk | null>(null);

  const fail = (e: unknown) => toast.error(e instanceof CfApiError ? e.message : String(e));

  const pickType = (op: OpRef, rule: TimingRule | null, anchor: HTMLElement | null, then: 'setup' | 'work' | null = null) => setAsk({ op, rule, anchor, then });

  const chooseType = async (nodeId: number | null) => {
    const a = ask;
    setAsk(null);
    if (!a || nodeId == null) return;
    if (a.rule && a.rule.subject.type === 'classification' && a.rule.subject.id === nodeId) {
      if (a.then) setBuilder({ op: a.op, rule: a.rule, which: a.then });
      return;
    }
    try {
      const carry = a.rule ? {
        eligible: a.rule.eligible, effectiveFrom: a.rule.effectiveFrom, effectiveTo: a.rule.effectiveTo, notes: a.rule.notes,
        setupMinutes: a.rule.setup?.minutes ?? null, setupFormulaId: a.rule.setup?.formula?.id ?? null,
        workMinutes: a.rule.work?.minutes ?? null, workFormulaId: a.rule.work?.formula?.id ?? null,
      } : {};
      const made = await cfApi.post<TimingRule>(`/operations/${a.op.id}/rules`, { ...carry, subjectType: 'classification', subjectId: nodeId });
      if (a.rule) await cfApi.del(`/operation-rules/${a.rule.id}`);
      toast.success(a.rule ? `${a.op.code} now runs on ${made.subject.name ?? made.subject.code}.` : `${a.op.code} runs on ${made.subject.name ?? made.subject.code}.`);
      onChanged();
      if (a.then) setBuilder({ op: a.op, rule: made, which: a.then });
    } catch (e) { fail(e); }
  };

  const editTime = (op: OpRef, rule: TimingRule | null, which: 'setup' | 'work', anchor: HTMLElement | null) => {
    if (!rule) pickType(op, null, anchor, which); else setBuilder({ op, rule, which });
  };

  const ui = (
    <>
      <Popover open={!!ask} anchorEl={ask?.anchor ?? undefined} onClose={() => setAsk(null)}
        {...(ask?.anchor ? {} : { anchorReference: 'anchorPosition' as const, anchorPosition: { top: 160, left: 360 } })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} slotProps={{ paper: { sx: { p: 2, width: 340 } } }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.25 }} data-testid="type-prompt">{ask ? `${ask.op.code} · which machine type does it?` : ''}</Typography>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1.25 }}>
          {ask?.then ? 'A time belongs to a machine type — pick it first, then set the time.' : 'This decides which machines can run it.'}
        </Typography>
        <ClassificationPicker tree={tree.data} scope="machine" leafOnly={false} value={null} onChange={chooseType} autoFocus label="Machine type" screen="machines" />
      </Popover>
      {builder && (
        <TimeBuilder open onClose={() => setBuilder(null)} operation={builder.op}
          subject={{ type: builder.rule.subject.type, id: builder.rule.subject.id, label: subjectText(builder.rule.subject) }}
          which={builder.which} current={builder.which === 'setup' ? builder.rule.setup : builder.rule.work} ruleSetup={builder.which === 'work' ? builder.rule.setup : null}
          formulas={formulas.data ?? []} canMakeFormula={canMakeFormula} onFormulasChanged={formulas.reload}
          onAssign={async (a: TimeAssignment) => {
            const w = builder.which;
            const body: Record<string, unknown> = { [`${w}Minutes`]: a.minutes, [`${w}FormulaId`]: a.formulaId };
            if (w === 'work' && a.setupMinutes !== undefined) Object.assign(body, { setupMinutes: a.setupMinutes, setupFormulaId: null });
            await cfApi.put(`/operation-rules/${builder.rule.id}`, body);
            toast.success(a.formula ? `${a.formula.code} assigned to ${subjectText(builder.rule.subject)}.` : 'Time saved.');
            onChanged();
          }} />
      )}
    </>
  );
  return { ui, idx, canManage, pickType, editTime, formulas };
}
