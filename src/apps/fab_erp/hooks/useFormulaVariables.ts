/**
 * useFormulaVariables — fetches all known formula variables from the backend.
 *
 * Calls GET /api/:company/fab_erp/formula/variables
 * Returns machine.* vars from fab_resource_type_properties + static item.* vars.
 *
 * Usage:
 *   const { vars, loading, error } = useFormulaVariables();
 *   <FormulaCodeEditor variables={vars} ... />
 */

import { useState, useEffect } from 'react';
import api, { API_HOST } from '@core/utils/axiosConfig';
import type { FormulaVariables } from '../types';

const EMPTY: FormulaVariables = { machine: [], item: [] };

export function useFormulaVariables(): {
  vars:    FormulaVariables;
  loading: boolean;
  error:   string;
} {
  const [vars,    setVars]    = useState<FormulaVariables>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    const companySlug = localStorage.getItem('companySlug');
    if (!companySlug) {
      setError('No company selected');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    api
      .get<FormulaVariables>(`${API_HOST}/api/${companySlug}/fab_erp/formula/variables`)
      .then((res) => setVars(res.data ?? EMPTY))
      .catch((e: unknown) => {
        const err = e as { response?: { data?: { error?: string } }; message?: string };
        setError(err.response?.data?.error ?? err.message ?? 'Failed to load formula variables');
      })
      .finally(() => setLoading(false));
  }, []);   // fetch once on mount

  return { vars, loading, error };
}
