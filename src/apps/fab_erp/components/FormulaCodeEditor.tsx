/**
 * FormulaCodeEditor — CodeMirror 6 based inline formula editor.
 *
 * Features:
 *  - Namespaced autocomplete: typing "machine." shows all machine.* variables
 *  - Red wavy underline for unknown namespaced variables (machine.*, item.*, step.*)
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
    border: '1px solid rgba(0,0,0,0.23)',
    borderRadius: '4px',
    width: '100%',
    backgroundColor: '#fff',
  },
  '&:focus-within': {
    border: '2px solid #1976d2',
    borderRadius: '4px',
  },
  '.cm-content': { padding: '8px 10px', caretColor: '#1976d2' },
  '.cm-line': { lineHeight: '1.6' },
  '.cm-diagnostic-error': { textDecoration: 'underline wavy red' },
  '.cm-tooltip-autocomplete': { zIndex: 9999 },
});

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** Current formula string (dot-notation: machine.speed * item.length) */
  value:     string;
  /** Called on every change */
  onChange:  (v: string) => void;
  /** Known variables grouped by namespace (from useFormulaVariables hook) */
  variables: FormulaVariables;
  /** Extra step.* variable keys defined for this step (no "step." prefix) */
  stepVars?: string[];
  /** If true, disables editing */
  readOnly?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FormulaCodeEditor({
  value,
  onChange,
  variables,
  stepVars = [],
  readOnly = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef      = useRef<EditorView | null>(null);

  // Compute known variable keys for linting — memoised to avoid recreating on every render
  const knownKeys = useMemo(() => {
    const keys = new Set<string>();
    variables.machine.forEach((v) => keys.add(v.key));
    variables.item.forEach((v) => keys.add(v.key));
    stepVars.forEach((k) => keys.add(`step.${k}`));
    return keys;
  }, [variables, stepVars]);

  // Keep latest refs so the CodeMirror extensions (created once on mount) can
  // always access the current values without re-creating the editor.
  const knownKeysRef  = useRef(knownKeys);
  const variablesRef  = useRef(variables);
  const stepVarsRef   = useRef(stepVars);
  const onChangeRef   = useRef(onChange);

  useEffect(() => { knownKeysRef.current  = knownKeys;   }, [knownKeys]);
  useEffect(() => { variablesRef.current  = variables;   }, [variables]);
  useEffect(() => { stepVarsRef.current   = stepVars;    }, [stepVars]);
  useEffect(() => { onChangeRef.current   = onChange;    }, [onChange]);

  // Create the CodeMirror editor once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    // ── Autocomplete ──────────────────────────────────────────────────────────
    function formulaComplete(ctx: CompletionContext): CompletionResult | null {
      const word = ctx.matchBefore(/[\w.]+/);
      if (!word || (word.from === word.to && !ctx.explicit)) return null;

      const vars  = variablesRef.current;
      const sVars = stepVarsRef.current;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formulaLinter = linter((view: any) => {
      const text        = view.state.doc.toString();
      const diagnostics: Diagnostic[] = [];
      const identRe     = /\b(machine|item|step)\.([a-zA-Z_]\w*)\b/g;
      let m: RegExpExecArray | null;

      while ((m = identRe.exec(text)) !== null) {
        const token = m[0];
        if (!knownKeysRef.current.has(token)) {
          diagnostics.push({
            from:     m.index,
            to:       m.index + token.length,
            severity: 'error',
            message:  `Unknown variable: ${token}`,
          });
        }
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
