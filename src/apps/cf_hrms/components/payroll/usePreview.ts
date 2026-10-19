import { useEffect, useState } from 'react';
import { payrollApi, type Breakdown, type PreviewInput } from '../../api/payroll';

/**
 * The live preview of a structure for a CTC (POST /payroll/structures/preview),
 * asked again ~400 ms after the last change. The server writes nothing and
 * answers problems in words inside the result, not as an error.
 *
 * `input` null = nothing to ask yet.
 */
export function usePreview(input: PreviewInput | null, delay = 400): { result: Breakdown | null; busy: boolean; error: unknown } {
  const sig = input ? JSON.stringify(input) : '';
  const [state, setState] = useState<{ sig: string; result: Breakdown | null; error: unknown }>({ sig: '', result: null, error: null });

  useEffect(() => {
    if (!sig) return undefined;
    let live = true;
    const t = window.setTimeout(() => {
      payrollApi.preview(JSON.parse(sig) as PreviewInput)
        .then((result) => { if (live) setState({ sig, result, error: null }); })
        .catch((error: unknown) => { if (live) setState((s) => ({ sig, result: s.result, error })); });
    }, delay);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [sig, delay]);

  return { result: sig ? state.result : null, busy: !!sig && state.sig !== sig, error: state.error };
}
