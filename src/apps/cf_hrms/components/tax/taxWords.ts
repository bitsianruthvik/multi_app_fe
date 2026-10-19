/** Words and small hooks the tax screens share (CF_HRMS_HIRING_SPEC.md §25.4). */
import { useEffect, useState } from 'react';
import type { BadgeTone } from '@shared/ui';
import { taxApi, type Regime } from '../../api/tax';

export const LINE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  DECLARED: { label: 'Declared — no proof yet', tone: 'neutral' },
  SUBMITTED: { label: 'Proof submitted', tone: 'info' },
  VERIFIED: { label: 'Verified', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
};
export const REGIME_WORD: Record<Regime, string> = { NEW: 'New regime', OLD: 'Old regime' };
export const WINDOW_WORD = { NOT_YET: 'not open yet', OPEN: 'open', CLOSED: 'closed' } as const;
export const CHALLAN_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  NO_RUN: { label: 'No payroll', tone: 'neutral' },
  NOT_LOCKED: { label: 'Payroll not locked', tone: 'neutral' },
  NO_TDS: { label: 'No TDS', tone: 'neutral' },
  PAID: { label: 'Paid', tone: 'success' },
  SHORT: { label: 'Part paid', tone: 'warning' },
  UNPAID: { label: 'Not paid', tone: 'danger' },
};

/** The tax years HR can work in, and the one chosen (the current year first). */
export function useTaxYears(): { years: string[]; year: string; setYear: (y: string) => void; error: unknown } {
  const [years, setYears] = useState<string[]>([]);
  const [year, setYear] = useState('');
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    taxApi.years().then((r) => { setYears(r.years); setYear(r.years.includes(r.current) ? r.current : r.years[0] ?? r.current); }).catch(setError);
  }, []);
  return { years, year, setYear, error };
}
