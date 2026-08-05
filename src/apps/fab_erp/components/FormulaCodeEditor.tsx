/**
 * FormulaCodeEditor — CodeMirror 6 based inline formula editor.
 *
 * Features:
 *  - Namespaced autocomplete: typing "machine." shows all machine.* variables
 *  - Red wavy underline for unknown namespaced variables (machine.*, item.*, step.*, op.*)
 *  - Reports those same variables to the parent via `onUnknownVars`, so a form can
 *    refuse to save a formula the user can already see is wrong. An unresolved
 *    variable evaluates to 0 rather than failing, so nothing downstream will
 *    complain — the underline is the only warning that ever appears.
 *  - ThoughtSpot-style UX: inline suggestions, click to insert
 *  - readOnly mode for view-only display
 *
 * NOTE: Requires @codemirror/view @codemirror/state @codemirror/autocomplete @codemirror/lint
 * Install with: npm install @codemirror/view @codemirror/state @codemirror/autocomplete @codemirror/lint
 */

import { useEffect, useRef, useMemo } from 'react';
import { EditorView, keymap, highlightSpecialChars, drawSelection } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { linter, type Diagnostic } from '@codemirror/lint';
import { Box } from '@mui/material';
import type { FormulaVariables } from '../types';

// ── Theme ─────────────────────────────────────────────────────────────────────

const formulaTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    fontFamily: '"Roboto Mono", "Fira Code", monospace',
    minHeight: '38px',
    border: '1px solid var(--c-border)',
    borderRadius: '4px',
    width: '100%',
    backgroundColor: 'var(--c-surface)',
  },
  '&:focus-within': {
    border: '2px solid var(--c-focus)',
    borderRadius: '4px',
  },
  '.cm-content': { padding: '8px 10px', caretColor: 'var(--c-focus)' },
  '.cm-line': { lineHeight: '1.6' },
  '.cm-diagnostic-error': { textDecoration: 'underline wavy var(--c-danger-600)' },
  '.cm-tooltip-autocomplete': { zIndex: 9999 },
});

// ── Unknown-variable scanning ─────────────────────────────────────────────────
// Shared by the linter (which needs positions) and by the parent-facing report
// (which needs a de-duplicated list), so the underline and the Save gate can
// never disagree about what counts as unknown.

/**
 * A fresh matcher per call — a module-level /g regex carries `lastIndex` across
 * callers, and two scanners run over the same text.
 */
const identRe = () => /\b(machine|item|step|op)\.([a-zA-Z_]\w*)\b/g;

/** De-duplicated unknown variables in `text`, in source order. */
function findUnknownVars(text: string, known: Set<string>, lintable: Set<string>): string[] {
  const out: string[] = [];
  const re = identRe();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!lintable.has(m[1]) || known.has(m[0]) || out.includes(m[0])) continue;
    out.push(m[0]);
  }
  return out;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** Current formula string (dot-notation: machine.speed * item.length) */
  value:     string;
  /** Called on every change */
  onChange:  (v: string) => void;
  /** Known variables grouped by namespace (from useFormulaVariables hook) */
  variables: FormulaVariables;
  /**
   * Extra step.* variable keys defined for this step (no "step." prefix).
   * Omit entirely when the editor has no step context — step.* is then left
   * unlinted rather than reported unknown (see `lintable` below).
   */
  stepVars?: string[];
  /** Extra op.* variable keys (operation's own variables, no "op." prefix). Same omission rule as `stepVars`. */
  opVars?: string[];
  /** If true, disables editing */
  readOnly?: boolean;
  /** Called with the currently red-underlined variables whenever that set changes. */
  onUnknownVars?: (unknown: string[]) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FormulaCodeEditor({
  value,
  onChange,
  variables,
  stepVars,
  opVars,
  readOnly = false,
  onUnknownVars,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef      = useRef<EditorView | null>(null);

  // Compute known variable keys for linting — memoised to avoid recreating on every render
  const knownKeys = useMemo(() => {
    const keys = new Set<string>();
    variables.machine.forEach((v) => keys.add(v.key));
    variables.item.forEach((v) => keys.add(v.key));
    stepVars?.forEach((k) => keys.add(`step.${k}`));
    opVars?.forEach((k) => keys.add(`op.${k}`));
    return keys;
  }, [variables, stepVars, opVars]);

  // Namespaces we hold a catalogue for, and may therefore judge. A caller that
  // passes no `stepVars` is saying "no step context here", not "this step has no
  // variables" — underlining step.* on that basis would flag names the server's
  // validator deliberately accepts, and a red line the user cannot clear is worse
  // than no line at all.
  const lintable = useMemo(() => {
    const ns = new Set(['machine', 'item']);
    if (stepVars) ns.add('step');
    if (opVars)   ns.add('op');
    return ns;
  }, [stepVars, opVars]);

  // Keep latest refs so the CodeMirror extensions (created once on mount) can
  // always access the current values without re-creating the editor.
  const knownKeysRef  = useRef(knownKeys);
  const lintableRef   = useRef(lintable);
  const variablesRef  = useRef(variables);
  const stepVarsRef   = useRef(stepVars);
  const opVarsRef     = useRef(opVars);
  const onChangeRef   = useRef(onChange);

  useEffect(() => { knownKeysRef.current  = knownKeys;   }, [knownKeys]);
  useEffect(() => { lintableRef.current   = lintable;    }, [lintable]);
  useEffect(() => { variablesRef.current  = variables;   }, [variables]);
  useEffect(() => { stepVarsRef.current   = stepVars;    }, [stepVars]);
  useEffect(() => { opVarsRef.current     = opVars;      }, [opVars]);
  useEffect(() => { onChangeRef.current   = onChange;    }, [onChange]);

  // Report the same set the linter paints. Memoised, so the effect below fires
  // only when the set actually changes rather than on every keystroke.
  const unknownList = useMemo(
    () => findUnknownVars(value, knownKeys, lintable),
    [value, knownKeys, lintable],
  );
  const onUnknownVarsRef = useRef(onUnknownVars);
  useEffect(() => { onUnknownVarsRef.current = onUnknownVars; }, [onUnknownVars]);
  useEffect(() => { onUnknownVarsRef.current?.(unknownList); }, [unknownList]);

  // Create the CodeMirror editor once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    // ── Autocomplete ──────────────────────────────────────────────────────────
    function formulaComplete(ctx: CompletionContext): CompletionResult | null {
      const word = ctx.matchBefore(/[\w.]+/);
      if (!word || (word.from === word.to && !ctx.explicit)) return null;

      const vars  = variablesRef.current;
      const sVars = stepVarsRef.current ?? [];
      const oVars = opVarsRef.current ?? [];

      const options = [
        ...vars.machine.map((v) => ({
          label:  v.key,
          detail: v.unit ? `${v.label} (${v.unit})` : v.label,
          type:   'variable' as const,
        })),
        ...vars.item.map((v) => ({
          label:  v.key,
          detail: v.unit ? `${v.label} (${v.unit})` : v.label,
          type:   'variable' as const,
        })),
        ...sVars.map((k) => ({
          label:  `step.${k}`,
          detail: 'step parameter',
          type:   'variable' as const,
        })),
        ...oVars.map((k) => ({
          label:  `op.${k}`,
          detail: 'operation variable',
          type:   'variable' as const,
        })),
        {
          label:  'IF(condition, true_val, false_val)',
          detail: 'conditional expression',
          type:   'function' as const,
        },
      ];

      const matching = options.filter((o) => o.label.startsWith(word.text));
      if (!matching.length) return null;
      return { from: word.from, options: matching };
    }

    // ── Linter ────────────────────────────────────────────────────────────────
    // Flag unknown namespaced variables (machine.*, item.*, step.*) with red underline.
    // Bare words (no dot) are NOT flagged — they could be numeric literals, etc.
    const formulaLinter = linter((view: EditorView) => {
      const text        = view.state.doc.toString();
      const diagnostics: Diagnostic[] = [];
      const re          = identRe();
      let m: RegExpExecArray | null;

      while ((m = re.exec(text)) !== null) {
        const token = m[0];
        if (!lintableRef.current.has(m[1]) || knownKeysRef.current.has(token)) continue;
        diagnostics.push({
          from:     m.index,
          to:       m.index + token.length,
          severity: 'error',
          message:  `Unknown variable: ${token}`,
        });
      }
      return diagnostics;
    });

    // ── Editor state ──────────────────────────────────────────────────────────
    const state = EditorState.create({
      doc: value,
      extensions: [
        highlightSpecialChars(),
        drawSelection(),
        autocompletion({ override: [formulaComplete] }),
        formulaLinter,
        formulaTheme,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        EditorView.updateListener.of((update: any) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorState.readOnly.of(readOnly),
        keymap.of([]),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  // Intentionally empty dep array — editor is created once on mount.
  // Current values are accessed via refs updated by the effects above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external `value` changes into the editor without destroying it
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        '& .cm-editor': { width: '100%' },
        '& .cm-scroller': { overflow: 'auto' },
      }}
    />
  );
}
