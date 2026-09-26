import { useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import type { CfApiError } from '../../api/client';
import type { CodegenEntity, RecordList, RuleSelection, RuleVerdict } from '../../api/types';
import type { FlatNode } from '../../lib/tree';
import { Badge, Mono, SkeletonRows, type Family } from '../ui';
import { cap, conditionSentence, entityWords } from './guide';

const VERDICT: Record<RuleVerdict['verdict'], { family: Family; label: string }> = {
  wins: { family: 'success', label: 'Wins' },
  tied: { family: 'danger', label: 'Tied' },
  beaten: { family: 'neutral', label: 'Applies, beaten' },
  no: { family: 'neutral', label: 'Does not apply' },
  off: { family: 'neutral', label: 'Switched off' },
  unfinished: { family: 'warning', label: 'Not finished' },
};

const who = (r: { code: string; draft: boolean }) => (r.draft ? 'This rule' : r.code);
const whom = (r: { code: string; draft: boolean } | null) => (!r ? 'the next rule' : r.draft ? 'this rule' : r.code);
const points = (n: number | null | undefined) => `${n ?? 0} point${n === 1 ? '' : 's'}`;
const list = (names: string[]) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** The answer in one or two sentences — built from what the engine decided, never guessed here. */
function verdictWords(sel: RuleSelection, what: string): { family: Family; lead: string; draftNote: string | null } {
  const winner = sel.rules.find((r) => r.verdict === 'wins');
  const draft = sel.rules.find((r) => r.draft);
  let family: Family = 'info';
  let lead: string;
  switch (sel.decidedBy) {
    case 'none':
      family = 'neutral';
      lead = `No rule applies to this record, so its ${what} is typed in by hand.`;
      break;
    case 'only':
      lead = `${who(sel.winner!)} makes the ${what}: it is the only rule that applies.`;
      break;
    case 'weight':
      lead = `${who(sel.winner!)} wins with ${points(winner?.weight)}, against ${points(sel.runnerUp?.weight)} for ${whom(sel.runnerUp)}.`;
      break;
    case 'priority':
      lead = `${who(sel.winner!)} wins on priority: it scores ${points(winner?.weight)}, the same as ${whom(sel.runnerUp)}, and its priority ${winner?.priority} beats ${sel.runnerUp?.priority}.`;
      break;
    case 'tie': {
      family = 'danger';
      const tied = sel.rules.filter((r) => r.verdict === 'tied');
      lead = `${cap(list(tied.map((r) => whom(r))))} apply equally — ${points(tied[0]?.weight)} and priority ${tied[0]?.priority} each — so no ${what} can be made for this record. Make one more specific, or give one a higher priority.`;
      break;
    }
    default:
      lead = '';
  }
  if (sel.winner?.draft) family = 'success';
  else if (draft && sel.decidedBy !== 'tie' && sel.decidedBy !== 'none') family = 'warning';

  let draftNote: string | null = null;
  if (draft && !sel.winner?.draft) {
    if (draft.verdict === 'no') {
      const failing = draft.conditions.filter((k) => !k.ok).length;
      draftNote = `This rule does not apply here: ${failing === 1 ? 'one of its conditions does not hold' : `${failing} of its conditions do not hold`}.`;
    } else if (draft.verdict === 'beaten') draftNote = `This rule applies, with ${points(draft.weight)}, but is beaten.`;
    else if (draft.verdict === 'off') draftNote = `This rule is switched off, so it takes no part. ${draft.applies ? `Switched on, it would apply with ${points(draft.weight)}.` : 'It would not apply here anyway.'}`;
    else if (draft.verdict === 'unfinished') draftNote = 'This rule is not finished, so it is left out until its conditions are filled in.';
  }
  return { family, lead, draftNote };
}

function RuleCard({ r, entity, flat, templates }: { r: RuleVerdict; entity: CodegenEntity | undefined; flat: FlatNode[]; templates: RecordList | null }) {
  const v = VERDICT[r.verdict];
  return (
    <Box component="li" sx={{
      listStyle: 'none', border: '1px solid', borderColor: r.draft ? 'var(--c-primary-200)' : 'var(--c-divider)', borderRadius: 'var(--r-sm)', p: 1.25,
      background: r.verdict === 'wins' ? 'var(--c-success-50)' : 'var(--c-surface)',
    }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <Badge family={v.family} label={v.label} />
        <Mono sx={{ fontSize: 13, color: 'var(--c-text)' }}>{r.code || 'New rule'}</Mono>
        {r.draft && <Badge family="info" label="This rule" noIcon />}
        {r.name && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', minWidth: 0 }}>{r.name}</Typography>}
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', ml: 'auto', whiteSpace: 'nowrap' }}>
          {r.applies ? <><b>{points(r.weight)}</b> · </> : null}priority {r.priority}
        </Typography>
      </Box>
      {r.problems?.length ? (
        <Box component="ul" sx={{ m: 0, mt: 0.75, pl: 2.5, fontSize: 12, color: 'var(--c-warning-800)' }}>{r.problems.map((p) => <li key={p}>{p}</li>)}</Box>
      ) : r.conditions.length === 0 ? (
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.75 }}>No conditions, so it applies to all {entityWords(entity)} — with 0 points, the least specific rule there is.</Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, mt: 0.75, p: 0, display: 'grid', gap: 0.5 }}>
          {r.conditions.map((k, i) => (
            <Box component="li" key={i} sx={{ listStyle: 'none', display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) auto', gap: 0.75, alignItems: 'start', fontSize: 13 }}>
              {k.ok
                ? <CheckRounded aria-hidden sx={{ fontSize: 18, color: 'var(--c-success-600)' }} />
                : <CloseRounded aria-hidden sx={{ fontSize: 18, color: 'var(--c-danger-600)' }} />}
              <Box sx={{ minWidth: 0, color: k.ok ? 'var(--c-text)' : 'var(--c-text-2)', wordBreak: 'break-word' }}>{cap(conditionSentence(k, entity, flat, templates))}</Box>
              <Box sx={{ fontSize: 12, whiteSpace: 'nowrap', color: k.ok ? 'var(--c-success-800)' : 'var(--c-danger-800)' }}>{k.ok ? `holds · +${k.weight}` : 'does not hold'}</Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

/**
 * "Which rule wins for this record": every active rule for the entity and
 * field, tested on the chosen record by the backend with the same code that
 * makes the codes (POST /codegen/explain), the rule being edited among them as
 * it will be once saved. Each condition held or not, each rule's points and
 * priority, the winner and why.
 */
export function WhichRuleWins({ selection, loading, error, hasSample, entity, targetField, flat, templates, priority, onPriority }: {
  selection: RuleSelection | null; loading: boolean; error: CfApiError | null; hasSample: boolean; entity: CodegenEntity | undefined;
  targetField: 'code' | 'name'; flat: FlatNode[]; templates: RecordList | null; priority: string; onPriority: (p: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const what = targetField === 'name' ? 'name' : 'code';
  const shown = selection ? selection.rules.filter((r) => showAll || r.applies || r.draft) : [];
  const hidden = selection ? selection.rules.length - shown.length : 0;
  const words = selection ? verdictWords(selection, what) : null;

  return (
    <Box sx={{ display: 'grid', gap: 1.25, minWidth: 0 }}>
      <Box>
        <Typography sx={{ fontWeight: 500 }}>Which rule wins for this record</Typography>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
          Every active rule for {entityWords(entity)} is tested on the chosen record, this one as it will be once saved — decided exactly the way {what}s are made.
          Each condition that holds scores points, more for a more specific one; the rule with the most points wins. Priority only settles a draw.
        </Typography>
      </Box>

      {!hasSample ? (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Choose a record above to see which rule it gets, and why.</Typography>
      ) : error ? (
        <Typography sx={{ fontSize: 13, color: 'var(--c-danger-600)' }}>{error.problems.length ? error.problems.join(' · ') : error.message}</Typography>
      ) : !selection || !words ? (
        loading ? <SkeletonRows rows={2} height={48} /> : null
      ) : (
        <>
          <Box role="status" sx={{ borderLeft: '3px solid', borderColor: `var(--c-${words.family}-600)`, background: `var(--c-${words.family}-50)`, px: 1.5, py: 1, borderRadius: 0 }}>
            <Typography sx={{ fontSize: 14, color: `var(--c-${words.family}-800)` }}>{words.lead}</Typography>
            {words.draftNote && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.25 }}>{words.draftNote}</Typography>}
          </Box>
          <Box component="ul" sx={{ m: 0, p: 0, display: 'grid', gap: 0.75 }}>
            {shown.map((r) => <RuleCard key={`${r.draft ? 'draft' : r.id}`} r={r} entity={entity} flat={flat} templates={templates} />)}
          </Box>
          {(hidden > 0 || showAll) && selection.rules.some((r) => !r.applies && !r.draft) && (
            <Button size="small" onClick={() => setShowAll((s) => !s)} sx={{ justifySelf: 'start' }}>
              {showAll ? 'Hide the rules that do not apply' : `Show ${hidden} more rule${hidden === 1 ? '' : 's'} that do${hidden === 1 ? 'es' : ''} not apply`}
            </Button>
          )}
        </>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '160px 1fr' }, gap: 1.5, alignItems: 'center', pt: 0.5 }}>
        <TextField size="small" label="Priority" type="number" value={priority} onChange={(e) => onPriority(e.target.value)} />
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
          Settles a draw: when two rules score the same points, the higher priority wins. It never beats more points. Two rules still level make no {what} at all.
        </Typography>
      </Box>
    </Box>
  );
}
