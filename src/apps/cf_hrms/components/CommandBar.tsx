import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Link,
  Menu,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AutoFixHighRounded from '@mui/icons-material/AutoFixHighRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import { ConfirmDialog, ErrorNotice, Surface } from '@shared/ui';
import { commandsApi } from '../api/commands';
import type {
  ActionDef, ActionField, ApplyResult, CheckResult, CommandOptions, Option, Preview, Step, StepField,
} from '../api/commands';

/**
 * "Do it in words" (CF_HRMS_HIRING_SPEC.md §14.3). One text box; Read turns
 * the words into a plan of steps, each a sentence whose names are chips the
 * person can correct; beside it a small picture of what the chart will look
 * like. Apply is offered only when every step is clear — the server re-checks
 * and does all the steps in one go, or none.
 *
 * The words are read on our own server, by matching (no chat model). It will
 * guess wrong sometimes; every guess is shown and can be changed here.
 */

const EXAMPLES = [
  'Add a Quality Control section under Production and add a position Officer - Quality in it',
  'Add a KRA Customer complaints to the Production Manager role',
  'Put P159-1 on the night shift',
];

const MAKES: Record<string, string> = {
  add_department: 'department', add_role: 'role', add_position: 'position', add_kra: 'kra',
};

const blankField = (): StepField => ({ value: null, fromText: null, confidence: 1 });
const isSet = (f?: StepField) => Boolean(f && (f.ref || (f.value != null && f.value !== '')));

let stepSeq = 0;
const newStepId = () => {
  stepSeq += 1;
  return `n${Date.now().toString(36)}${stepSeq}`;
};

/** What an earlier step makes, as a drop-down entry ("Quality Control (new, step 1)"). */
function stepOptions(steps: Step[], upTo: number, kind: string): Option[] {
  return steps.slice(0, upTo).flatMap((s, i) => {
    if (MAKES[s.action ?? ''] !== kind) return [];
    const f = s.fields;
    const name = String(
      (s.action === 'add_department' ? f.name?.value
        : s.action === 'add_role' ? f.title?.value
          : s.action === 'add_kra' ? f.text?.value
            : f.role?.ref?.label ?? f.role?.value) ?? 'new',
    ).replace(/ \(new\)$/, '');
    return [{ id: -(i + 1), label: `${name} (new, step ${i + 1})`, stepId: s.id } as Option & { stepId: string }];
  });
}

function recordOptions(kind: string, opts: CommandOptions | null, step: Step): Option[] {
  if (!opts) return [];
  switch (kind) {
    case 'department': return opts.departments;
    case 'role': return opts.roles;
    case 'position': return opts.positions;
    case 'employee': return opts.employees;
    case 'shift': return opts.shifts;
    case 'kra': {
      const roleRef = step.fields.role?.ref;
      const posRef = step.fields.position?.ref;
      const roleId = roleRef && roleRef.kind === 'role' ? Number(roleRef.id)
        : posRef && posRef.kind === 'position' ? opts.positions.find((p) => p.id === Number(posRef.id))?.roleId : undefined;
      return roleId != null ? opts.roleKras[String(roleId)] ?? [] : [];
    }
    default: return [];
  }
}

/* ── one editable chip ─────────────────────────────────────────────────── */

function FieldChip({
  def, field, step, steps, index, opts, onChange,
}: {
  def: ActionField;
  field?: StepField;
  step: Step;
  steps: Step[];
  index: number;
  opts: CommandOptions | null;
  onChange: (f: StepField | null) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const set = isSet(field);

  if (def.kind === 'newText' || def.kind === 'date') {
    const value = field?.value == null ? '' : String(field.value);
    return (
      <TextField
        variant="standard"
        size="small"
        type={def.kind === 'date' ? 'date' : 'text'}
        value={value}
        placeholder={def.required ? `${def.label.toLowerCase()}…` : `${def.label.toLowerCase()} (optional)`}
        onChange={(e) => onChange({ ...(field ?? blankField()), value: e.target.value, confidence: 1 })}
        inputProps={{ 'aria-label': def.label, size: Math.max(8, Math.min(60, value.length + 1)) }}
        InputLabelProps={def.kind === 'date' ? { shrink: true } : undefined}
        sx={{
          mx: 0.5,
          '& .MuiInputBase-input': { fontSize: 14, fontWeight: 600, py: 0.25 },
        }}
      />
    );
  }

  if (def.kind === 'labels') {
    // The labels of the company's other groups (spec §15.3): one small choice per group.
    // The field holds their ids, comma-separated.
    const others = (opts?.labelGroups ?? []).filter((g) => !g.isKind && g.labels.length > 0);
    if (!others.length) return null;
    const ids = String(field?.value ?? '').split(',').map((v) => Number(v)).filter((n) => n > 0);
    const setGroup = (groupId: number, labelId: number | '') => {
      const mine = new Set(others.find((g) => g.id === groupId)?.labels.map((l) => l.id));
      const next = [...ids.filter((id) => !mine.has(id)), ...(labelId === '' ? [] : [labelId])];
      onChange(next.length ? { ...(field ?? blankField()), value: next.join(','), confidence: 1 } : null);
    };
    return (
      <>
        {others.map((g) => {
          const value = g.labels.find((l) => ids.includes(l.id))?.id ?? '';
          return (
            <TextField
              key={g.id}
              select
              variant="standard"
              size="small"
              value={value}
              onChange={(e) => setGroup(g.id, e.target.value === '' ? '' : Number(e.target.value))}
              SelectProps={{ native: false, displayEmpty: true }}
              inputProps={{ 'aria-label': g.name }}
              sx={{ mx: 0.5, '& .MuiInputBase-input': { fontSize: 14, fontWeight: 600, py: 0.25 } }}
            >
              <MenuItem value="">
                <em>{g.isRequired ? `${g.name.toLowerCase()}: choose…` : `${g.name.toLowerCase()} (optional)`}</em>
              </MenuItem>
              {g.labels.map((l) => (
                <MenuItem key={l.id} value={l.id}>{g.name}: {l.name}</MenuItem>
              ))}
            </TextField>
          );
        })}
      </>
    );
  }

  if (def.kind === 'label') {
    const value = field?.value == null ? '' : String(field.value);
    return (
      <TextField
        select
        variant="standard"
        size="small"
        value={value}
        onChange={(e) => onChange({ ...(field ?? blankField()), value: e.target.value, confidence: 1 })}
        SelectProps={{ native: false }}
        inputProps={{ 'aria-label': def.label }}
        sx={{ mx: 0.5, '& .MuiInputBase-input': { fontSize: 14, fontWeight: 600, py: 0.25 } }}
      >
        {(opts?.labels ?? [value]).filter(Boolean).map((l) => (
          <MenuItem key={l} value={l}>{l.toLowerCase()}</MenuItem>
        ))}
      </TextField>
    );
  }

  const unsure = !set && Boolean(field?.candidates?.length);
  const label = set
    ? field?.ref?.label ?? String(field?.value ?? '')
    : unsure
      ? `which ${def.label.toLowerCase()}?`
      : def.required ? 'choose…' : `${def.label.toLowerCase()} (optional)`;
  const fromSteps = stepOptions(steps, index, def.kind);
  const candidates = (field?.candidates ?? []) as Option[];
  const all = recordOptions(def.kind, opts, step);
  const seen = new Set<string>();
  const options = [...fromSteps, ...candidates, ...all].filter((o) => {
    const k = `${(o as Option & { stepId?: string }).stepId ?? ''}:${o.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return (
    <>
      <Chip
        size="small"
        label={label}
        onClick={(e) => setAnchor(e.currentTarget)}
        onDelete={set && !def.required ? () => onChange(null) : undefined}
        color={set ? 'primary' : def.required || unsure ? 'warning' : 'default'}
        variant={set ? 'filled' : 'outlined'}
        sx={{ mx: 0.5, fontWeight: 600, maxWidth: 360 }}
        aria-label={`${def.label}: ${label}`}
      />
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1.5, width: 380, maxWidth: '90vw' }}>
          {field?.fromText && (
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 1 }}>
              You wrote “{field.fromText}”.{unsure ? ' More than one fits — pick one.' : ''}
            </Typography>
          )}
          <Autocomplete
            size="small"
            openOnFocus
            autoHighlight
            options={options}
            groupBy={(o) => ((o as Option & { stepId?: string }).stepId ? 'Made by this plan'
              : candidates.some((c) => c.id === o.id) ? 'Closest to what you wrote' : `All ${def.label.toLowerCase()}s`)}
            getOptionLabel={(o) => o.label}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_e, o) => {
              if (!o) return;
              const stepId = (o as Option & { stepId?: string }).stepId;
              onChange(stepId
                ? { value: null, ref: { kind: 'step', id: stepId, label: o.label }, fromText: field?.fromText ?? null, confidence: 1 }
                : { value: o.id, ref: { kind: def.kind, id: o.id, label: o.label }, fromText: field?.fromText ?? null, confidence: 1 });
              setAnchor(null);
            }}
            renderInput={(p) => <TextField {...p} autoFocus label={def.label} />}
          />
        </Box>
      </Popover>
    </>
  );
}

/* ── one step ──────────────────────────────────────────────────────────── */

function StepCard({
  step, steps, index, def, actions, opts, problems, onChange, onRemove, onMove,
}: {
  step: Step;
  steps: Step[];
  index: number;
  def: ActionDef | undefined;
  actions: ActionDef[];
  opts: CommandOptions | null;
  problems: string[];
  onChange: (s: Step) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const setField = (name: string, f: StepField | null) => {
    const fields = { ...step.fields };
    if (f) fields[name] = f; else delete fields[name];
    onChange({ ...step, fields });
  };

  let body: ReactNode;
  if (!def) {
    body = (
      <Stack spacing={1}>
        {step.sourceText && (
          <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>“{step.sourceText}”</Typography>
        )}
        <TextField
          select
          size="small"
          label="Choose what this should do"
          value=""
          onChange={(e) => onChange({ ...step, action: e.target.value, fields: {} })}
          sx={{ maxWidth: 320 }}
        >
          {actions.map((a) => <MenuItem key={a.key} value={a.key}>{a.label}</MenuItem>)}
        </TextField>
      </Stack>
    );
  } else {
    // The sentence: the template's words, each {field} a chip.
    const oneOf = def.oneOf ?? [];
    const oneOfChosen = oneOf.find((n) => isSet(step.fields[n])) ?? (oneOf.some((n) => step.fields[n]) ? oneOf.find((n) => step.fields[n]) : oneOf[0]);
    const parts = def.template.split(/(\{[a-zA-Z]+\})/).filter(Boolean);
    body = (
      <Box sx={{ fontSize: 15, lineHeight: 2.1, display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
        {parts.map((p, i) => {
          const m = /^\{([a-zA-Z]+)\}$/.exec(p);
          if (!m) return <span key={i}>{p}</span>;
          const fdef = def.fields.find((f) => f.name === m[1]);
          if (!fdef) return null;
          if (oneOf.includes(fdef.name) && fdef.name !== oneOfChosen) return null;
          const optionalEmpty = !fdef.required && !oneOf.includes(fdef.name) && !isSet(step.fields[fdef.name]);
          return (
            <Box component="span" key={i} sx={{ display: 'inline-flex', alignItems: 'center', opacity: optionalEmpty ? 0.75 : 1 }}>
              <FieldChip
                def={oneOf.includes(fdef.name) ? { ...fdef, required: true } : fdef}
                field={step.fields[fdef.name]}
                step={step}
                steps={steps}
                index={index}
                opts={opts}
                onChange={(f) => setField(fdef.name, f)}
              />
              {oneOf.includes(fdef.name) && (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => {
                    // The next way of saying who it is for: role -> one position -> one person (spec §16.2) -> role.
                    const other = oneOf[(oneOf.indexOf(fdef.name) + 1) % oneOf.length];
                    const fields = { ...step.fields };
                    delete fields[fdef.name];
                    fields[other] = blankField();
                    onChange({ ...step, fields });
                  }}
                  sx={{ fontSize: 12, minWidth: 0, px: 0.5, color: 'var(--c-text-3)' }}
                >
                  {(() => {
                    const next = oneOf[(oneOf.indexOf(fdef.name) + 1) % oneOf.length];
                    return next === 'position' ? 'or one position' : next === 'person' ? 'or one person' : 'or the whole role';
                  })()}
                </Button>
              )}
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <Surface e={1} sx={{ p: 1.5, borderLeft: problems.length ? '3px solid var(--c-warning-500, #e0a100)' : '3px solid transparent' }}>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text-3)', pt: 0.6, minWidth: 18 }}>{index + 1}.</Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {body}
          {problems.map((p, i) => (
            <Typography key={i} sx={{ fontSize: 12.5, color: 'var(--c-warning-800, #8a5a00)', mt: 0.25 }}>{p}</Typography>
          ))}
        </Box>
        <Stack direction="row" spacing={0}>
          <Tooltip title="Move up"><span><IconButton size="small" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move step up"><ArrowUpwardRounded fontSize="inherit" /></IconButton></span></Tooltip>
          <Tooltip title="Move down"><span><IconButton size="small" disabled={index === steps.length - 1} onClick={() => onMove(1)} aria-label="Move step down"><ArrowDownwardRounded fontSize="inherit" /></IconButton></span></Tooltip>
          <Tooltip title="Remove this step"><IconButton size="small" onClick={onRemove} aria-label="Remove step"><CloseRounded fontSize="inherit" /></IconButton></Tooltip>
        </Stack>
      </Stack>
    </Surface>
  );
}

/* ── the picture ───────────────────────────────────────────────────────── */

interface TreeNode {
  key: string;
  label: string;
  sub?: string;
  isNew: boolean;
  notes: string[];
  children: TreeNode[];
}

/** The part of the chart the plan touches: each change under its department path, new things marked. */
function buildTree(preview: Preview): TreeNode[] {
  const roots: TreeNode[] = [];
  const byKey = new Map<string, TreeNode>();
  const node = (key: string, label: string, isNew: boolean, parent: TreeNode | null, sub?: string): TreeNode => {
    const have = byKey.get(key);
    if (have) return have;
    const n: TreeNode = { key, label, sub, isNew, notes: [], children: [] };
    byKey.set(key, n);
    (parent ? parent.children : roots).push(n);
    return n;
  };
  const pathNode = (path: { id: number; name: string; label: string | null }[]) => {
    let parent: TreeNode | null = null;
    for (const p of path) parent = node(`d${p.id}`, p.name, false, parent, p.label && p.label !== 'Department' ? p.label.toLowerCase() : undefined);
    return parent;
  };
  for (const d of preview.departments) {
    const parent = d.parentKey ? byKey.get(`new:${d.parentKey}`) ?? null : pathNode(d.path);
    node(`new:${d.key}`, d.name || 'New department', true, parent, d.label?.toLowerCase());
  }
  for (const p of preview.positions) {
    const parent = p.departmentKey ? byKey.get(`new:${p.departmentKey}`) ?? null : pathNode(p.path);
    const n = node(`new:${p.key}`, p.title || 'New position', true, parent, ['vacant position', p.shiftName && !p.shiftLine ? `${p.shiftName} shift` : null].filter(Boolean).join(' · '));
    // The shift it will use, and why — the label default, the general shift, or the one asked for (spec §17.2).
    if (p.shiftLine) n.notes.push(p.shiftLine);
    if (p.reportsToName) n.notes.push(`reports to ${p.reportsToName}`);
  }
  for (const m of preview.moves) {
    const target = m.toKey ? byKey.get(`new:${m.toKey}`) : node(`m:${m.key}`, m.toName ?? 'Position', false, pathNode(m.toPath ?? []));
    if (target) target.notes.push(`${m.employeeName ?? 'someone'} moves in${m.fromName ? ` (from ${m.fromName})` : ''}${m.from ? ` on ${m.from}` : ''}`);
  }
  return roots;
}

function TreeView({ nodes, depth = 0 }: { nodes: TreeNode[]; depth?: number }) {
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, pl: depth ? 2 : 0, borderLeft: depth ? '1px solid var(--c-border, #ddd)' : 'none' }}>
      {nodes.map((n) => (
        <Box component="li" key={n.key} sx={{ mt: 0.75 }}>
          <Box
            sx={{
              display: 'inline-block',
              px: 1,
              py: 0.5,
              borderRadius: 1,
              border: n.isNew ? '2px solid var(--c-primary-500, #2962ff)' : '1px solid var(--c-border, #ddd)',
              background: n.isNew ? 'var(--c-primary-50, #eef3ff)' : 'var(--c-surface, transparent)',
              fontSize: 13,
              maxWidth: '100%',
            }}
          >
            <Typography component="span" sx={{ fontSize: 13, fontWeight: n.isNew ? 600 : 400 }}>{n.label}</Typography>
            {n.sub && <Typography component="span" sx={{ fontSize: 11.5, color: 'var(--c-text-3)', ml: 0.75 }}>{n.sub}</Typography>}
            {n.isNew && <Typography component="span" sx={{ fontSize: 10.5, fontWeight: 700, color: 'var(--c-primary-700, #1a47c8)', ml: 0.75, letterSpacing: '.06em' }}>NEW</Typography>}
            {n.notes.map((t, i) => (
              <Typography key={i} sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{t}</Typography>
            ))}
          </Box>
          {n.children.length > 0 && <TreeView nodes={n.children} depth={depth + 1} />}
        </Box>
      ))}
    </Box>
  );
}

function PlanPicture({ preview }: { preview: Preview }) {
  const tree = useMemo(() => buildTree(preview), [preview]);
  const lists: { title: string; rows: string[] }[] = [
    { title: 'New roles', rows: preview.roles.map((r) => r.title || 'New role') },
    {
      title: 'Job content added',
      rows: preview.lines.map((l) => `${l.kind === 'RESPONSIBILITY' ? 'Responsibility' : l.kind} “${l.text}”${l.target ? ` (target ${l.target})` : ''} → ${l.on === 'position' ? 'position ' : l.on === 'person' ? 'for the person ' : ''}${l.targetName || '…'}${l.kraName ? `, under ${l.kraName}` : ''}`),
    },
    { title: 'Shift changes', rows: preview.shifts.map((s) => `${s.positionName ?? '…'}: ${s.fromShift ?? '?'} → ${s.toShift ?? '…'}`) },
  ].filter((l) => l.rows.length);
  if (!tree.length && !lists.length) return null;
  return (
    <Surface e={0} sx={{ p: 1.5, background: 'var(--c-surface-2, transparent)' }}>
      <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.5 }}>
        On the chart afterwards
      </Typography>
      {tree.length > 0 && <TreeView nodes={tree} />}
      {lists.map((l) => (
        <Box key={l.title} sx={{ mt: 1.25 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{l.title}</Typography>
          {l.rows.map((r, i) => <Typography key={i} sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{r}</Typography>)}
        </Box>
      ))}
    </Surface>
  );
}

/* ── the bar ───────────────────────────────────────────────────────────── */

export function CommandBar({
  autoFocus = false,
  onApplied,
}: {
  autoFocus?: boolean;
  /** After a successful Apply: what was made (the chart refreshes and shows it). */
  onApplied?: (r: ApplyResult) => void;
}) {
  const { company } = useParams();
  const [text, setText] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [actions, setActions] = useState<ActionDef[]>([]);
  const [opts, setOpts] = useState<CommandOptions | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<ApplyResult | null>(null);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const [firstUse, setFirstUse] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const ensureLookups = useCallback(() => {
    if (!actions.length) commandsApi.actions().then((r) => setActions(r.actions)).catch(() => {});
    if (!opts) commandsApi.options().then(setOpts).catch(() => {});
  }, [actions.length, opts]);

  const read = () => {
    const t = text.trim();
    if (!t || reading) return;
    setFirstUse(false);
    setReading(true);
    setError(null);
    setDone(null);
    ensureLookups();
    commandsApi
      .read(t)
      .then((r) => {
        setSteps(r.plan.steps);
        setNotice(r.notice);
        setCheck(null);
      })
      .catch(setError)
      .finally(() => setReading(false));
  };

  // Every change to the plan is checked again (and the picture redrawn), a moment after the last edit.
  useEffect(() => {
    if (!steps) return;
    if (!steps.length) { setCheck(null); return; }
    let live = true;
    setChecking(true);
    const t = setTimeout(() => {
      commandsApi
        .check(steps)
        .then((r) => { if (live) setCheck(r); })
        .catch((e) => { if (live) setError(e); })
        .finally(() => { if (live) setChecking(false); });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [steps]);

  const problemsOf = (id: string) => check?.steps.find((s) => s.id === id)?.problems ?? [];
  const clear = Boolean(steps?.length) && Boolean(check?.clean) && !checking
    && (steps ?? []).every((s) => s.action) && (check?.steps.length ?? 0) === (steps?.length ?? -1);

  const apply = async () => {
    if (!steps) return;
    try {
      const r = await commandsApi.apply(steps, text);
      setDone(r);
      setSteps(null);
      setCheck(null);
      setText('');
      onApplied?.(r);
    } catch (e) {
      setError(e);
    }
  };

  const update = (i: number, s: Step) => setSteps((all) => (all ? all.map((x, k) => (k === i ? s : x)) : all));
  const remove = (i: number) => setSteps((all) => (all ? all.filter((_, k) => k !== i) : all));
  const move = (i: number, dir: -1 | 1) => setSteps((all) => {
    if (!all) return all;
    const next = [...all];
    const [s] = next.splice(i, 1);
    next.splice(i + dir, 0, s);
    return next;
  });
  const addStep = (key: string) => {
    setAddAnchor(null);
    setSteps((all) => [...(all ?? []), { id: newStepId(), action: key, fields: {}, sourceText: null, confidence: 1 }]);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      read();
    }
  };

  return (
    <Stack spacing={1.25}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }}>
        <TextField
          inputRef={inputRef}
          fullWidth
          size="small"
          multiline
          maxRows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onFocus={ensureLookups}
          label="Do it in words"
          placeholder="e.g. Add a Quality Control section under Production and add a position Officer - Quality in it"
          InputProps={{ startAdornment: <AutoFixHighRounded fontSize="small" sx={{ mr: 1, color: 'var(--c-text-3)' }} /> }}
        />
        <Button variant="contained" onClick={read} disabled={!text.trim() || reading} sx={{ flexShrink: 0, minWidth: 96 }}>
          {reading ? <CircularProgress size={18} color="inherit" /> : 'Read'}
        </Button>
      </Stack>

      {firstUse && !steps && !done && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mr: 0.5 }}>Try:</Typography>
          {EXAMPLES.map((x) => (
            <Chip key={x} size="small" variant="outlined" label={x} onClick={() => { setText(x); inputRef.current?.focus(); }} sx={{ maxWidth: '100%' }} />
          ))}
        </Box>
      )}

      {!!error && <ErrorNotice error={error} />}
      {notice && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{notice}</Typography>}

      {done && (
        <Surface e={1} sx={{ p: 1.5 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Done — {done.created.length === 1 ? 'one step' : `${done.created.length} steps`} carried out.</Typography>
          <Stack spacing={0.25} sx={{ mt: 0.5 }}>
            {done.created.map((c) => (
              <Typography key={c.stepId} sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                {c.kind === 'move' ? 'Moved into the position' : c.kind === 'shift' ? 'Shift changed' : `Created ${c.kind === 'kra' ? 'KRA' : c.kind === 'kpi' ? 'KPI' : c.kind}`}{' '}
                {c.link && company ? (
                  <Link component={RouterLink} to={`/${company}/cf_hrms/${c.link}`}>{c.name}</Link>
                ) : c.name}
                {c.code ? <Box component="span" sx={{ ml: 0.75, fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{c.code}</Box> : null}
              </Typography>
            ))}
          </Stack>
        </Surface>
      )}

      {steps && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 3fr) minmax(0, 2fr)' }, gap: 1.5 }}>
          <Stack spacing={1}>
            {steps.length === 0 && (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No steps. Add one, or write the change again.</Typography>
            )}
            {steps.map((s, i) => (
              <StepCard
                key={s.id}
                step={s}
                steps={steps}
                index={i}
                def={actions.find((a) => a.key === s.action)}
                actions={actions}
                opts={opts}
                problems={problemsOf(s.id)}
                onChange={(n) => update(i, n)}
                onRemove={() => remove(i)}
                onMove={(d) => move(i, d)}
              />
            ))}
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Button size="small" startIcon={<AddRounded />} onClick={(e) => setAddAnchor(e.currentTarget)} disabled={!actions.length}>
                Add a step
              </Button>
              <Menu anchorEl={addAnchor} open={Boolean(addAnchor)} onClose={() => setAddAnchor(null)}>
                {actions.map((a) => <MenuItem key={a.key} onClick={() => addStep(a.key)}>{a.label}</MenuItem>)}
              </Menu>
              <Box sx={{ flex: 1 }} />
              {checking && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Checking…</Typography>}
              {!checking && check && !check.clean && (
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Fix the marked steps to apply.</Typography>
              )}
              <Button size="small" onClick={() => { setSteps(null); setCheck(null); }}>Cancel</Button>
              <Button variant="contained" size="small" disabled={!clear} onClick={() => setConfirm(true)}>
                Apply
              </Button>
            </Stack>
          </Stack>
          {check && <PlanPicture preview={check.preview} />}
        </Box>
      )}

      <ConfirmDialog
        open={confirm}
        title="Apply this plan?"
        body={`All ${steps?.length ?? 0} step${steps?.length === 1 ? '' : 's'} will be done together — or, if one cannot be done, none of them.`}
        confirmLabel={`Apply ${steps?.length ?? 0} step${steps?.length === 1 ? '' : 's'}`}
        onConfirm={apply}
        onClose={() => setConfirm(false)}
      />
    </Stack>
  );
}
