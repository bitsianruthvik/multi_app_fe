import { useState } from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { cfApi, qs } from '../api/client';
import type { Resolution, Rule, TreeNode } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { ErrorNotice, Mono, RuleBadge, SectionCard, SkeletonRows } from './ui';
import { RuleDialog } from './RuleDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { SpecsTable } from './SpecsTable';
import { useToast } from './toastContext';

/**
 * A classification node's specification rules and the defaults that reach it —
 * what Setup › Classification showed beside its tree, now shown inside the
 * Classification pop-up of the screen that uses the node. Writing rules and
 * defaults still needs the setup grant (`canManage`).
 */
export function ClassificationRules({ node, canManage, onChanged }: { node: TreeNode; canManage: boolean; onChanged?: () => void }) {
  const toast = useToast();
  const rules = useLoad(() => cfApi.get<Rule[]>(`/rules${qs({ subjectType: 'classification', subjectId: node.id })}`), [node.id]);
  const resolved = useLoad(() => cfApi.get<Resolution>(`/classification/${node.id}/resolved`), [node.id]);
  const [ruleDialog, setRuleDialog] = useState<{ open: boolean; rule: Rule | null }>({ open: false, rule: null });
  const [deleteRule, setDeleteRule] = useState<Rule | null>(null);
  const refresh = () => { rules.reload(); resolved.reload(); onChanged?.(); };

  return (
    // minmax(0, 1fr) stops the column growing to the specs table's minimum
    // width, so the table's own horizontal scroll engages instead of the page's.
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
      <SectionCard title="Specification rules set here"
        subtitle="Rules apply to everything below this node. A more specific level can override a rule or switch it off."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setRuleDialog({ open: true, rule: null })}>Add rule</Button>}>
        <ErrorNotice error={rules.error} onRetry={rules.reload} />
        {rules.loading && !rules.data ? <SkeletonRows rows={3} /> : (rules.data ?? []).length === 0 ? (
          <Typography sx={{ color: 'var(--c-text-2)' }}>No rules at this level{node.depth > 0 ? ' — rules from above still apply (see below).' : '.'}</Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.5 }}>
            {(rules.data ?? []).map((r) => (
              <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, borderRadius: 'var(--r-sm)', '&:hover': { background: 'var(--c-surface-2)' }, '&:hover .row-actions, &:focus-within .row-actions': { opacity: 1 } }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ fontWeight: 500 }}>{r.specName} <Mono muted>{r.specCode}</Mono></Box>
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                    {r.isApplicable
                      ? `${r.captureAt === 'item' ? 'On each item' : r.captureAt === 'batch' ? 'On each batch' : 'On each unit'}${r.isRequired ? ' · required' : ''}${r.formulaCode ? ` · ${r.formulaCode}` : ''}${r.optionValues.length ? ` · only ${r.optionValues.join(', ')}` : ''}`
                      : 'Switched off from here down'}
                  </Typography>
                </Box>
                {r.isApplicable && <RuleBadge rule={r.valueRule} />}
                {canManage && (
                  <Box className="row-actions" sx={{ opacity: 0, transition: 'opacity 140ms', display: 'flex' }}>
                    <IconButton size="small" aria-label={`Edit rule ${r.specCode}`} onClick={() => setRuleDialog({ open: true, rule: r })}><EditRounded fontSize="small" /></IconButton>
                    <IconButton size="small" aria-label={`Delete rule ${r.specCode}`} onClick={() => setDeleteRule(r)}><DeleteOutlineRounded fontSize="small" /></IconButton>
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        )}
      </SectionCard>

      <SectionCard title="Everything that reaches this node"
        subtitle="Rules from this node and above, merged. Values set here are defaults for what sits below — they take effect wherever a rule is Fixed or Defaulted.">
        <ErrorNotice error={resolved.error} onRetry={resolved.reload} />
        {resolved.loading && !resolved.data ? <SkeletonRows rows={4} /> : resolved.data && (
          <SpecsTable resolution={resolved.data} emptyHint="No rules reach this node yet. Add one above."
            onSave={canManage ? async (values) => {
              await cfApi.put(`/classification/${node.id}/values`, { values });
              toast.success('Defaults saved — everything below was updated.');
              refresh();
            } : undefined} />
        )}
      </SectionCard>

      <RuleDialog open={ruleDialog.open} existing={ruleDialog.rule} onClose={() => setRuleDialog({ open: false, rule: null })}
        onSaved={() => { toast.success('Rule saved.'); refresh(); }} subjectType="classification" subjectId={node.id} subjectLabel={`${node.level.toLowerCase()} ${node.name}`} forMachines={node.scope === 'machine'} />
      <ConfirmDialog open={!!deleteRule} title="Delete this rule?" danger confirmLabel="Delete rule"
        body={`${deleteRule?.specName} stops applying from ${node.name} down, unless a broader rule still covers it. Values it produced are recalculated.`}
        onClose={() => setDeleteRule(null)}
        onConfirm={async () => { await cfApi.del(`/rules/${deleteRule?.id}`); toast.success('Rule deleted.'); refresh(); }} />
    </Box>
  );
}
