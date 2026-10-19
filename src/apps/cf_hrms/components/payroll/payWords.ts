/**
 * Payroll words and numbers (CF_HRMS_HIRING_SPEC.md §25.2) — one place for how
 * money, a month, a run's status, a component's kind and a warning read, so
 * every payroll screen and My pay say them the same way.
 */
import type { BadgeTone } from '@shared/ui';
import type { ComponentKind, PfMode, RunStatus, StatutoryKind } from '../../api/payroll';

const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** "₹12,34,567" — Indian grouping; paise only when there are any. A missing amount reads "—". */
export function rupees(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n < 0 ? '−' : ''}₹${INR.format(Math.abs(n))}`;
}

/** A typed amount: "5,000", "₹ 5000" → 5000; '' → null; not a number → NaN. */
export function parseAmount(s: string): number | null {
  const t = s.replace(/[₹,\s]/g, '');
  if (!t) return null;
  return Number(t);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** '2026-09' → "September 2026". */
export function monthWord(month: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(month ?? '');
  if (!m) return month ?? '';
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** A server timestamp → "19 Oct 2026" in the reader's own calendar. */
export function stampDay(s: string | null | undefined): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── runs ─────────────────────────────────────────────────────────────── */

export const RUN_STATUS: Record<RunStatus, { label: string; tone: BadgeTone; hint: string }> = {
  DRAFT: { label: 'Draft', tone: 'warning', hint: 'Not calculated yet.' },
  CALCULATED: { label: 'Calculated', tone: 'info', hint: 'Review it, then lock it.' },
  LOCKED: { label: 'Locked', tone: 'info', hint: 'Frozen. Download the bank file, then release the payslips.' },
  RELEASED: { label: 'Payslips released', tone: 'success', hint: 'People can see their payslips. Mark it paid once the bank has paid.' },
  PAID: { label: 'Paid', tone: 'success', hint: 'Done.' },
};

/** What each warning code on a person means, as a short chip. The full sentence is the server's. */
export const WARNING_WORDS: Record<string, { label: string; tone: BadgeTone }> = {
  NO_SALARY: { label: 'No salary', tone: 'danger' },
  BAD_STRUCTURE: { label: 'Structure problem', tone: 'danger' },
  NEGATIVE_NET: { label: 'Net below zero', tone: 'danger' },
  UNSALARIED_DAYS: { label: 'Days with no salary', tone: 'warning' },
  NO_BANK: { label: 'No bank details', tone: 'warning' },
  NO_PAN: { label: 'No PAN', tone: 'warning' },
  JOINED_MID: { label: 'Joined in the month', tone: 'info' },
  LEFT_MID: { label: 'Left in the month', tone: 'info' },
  LOP: { label: 'Leave without pay', tone: 'info' },
  ARREARS: { label: 'Arrears', tone: 'info' },
  CHECK: { label: 'Check', tone: 'warning' },
  TDS_NO_PAN: { label: 'TDS at the higher rate', tone: 'danger' },
  TDS_MANUAL: { label: 'TDS set by hand', tone: 'info' },
  TDS_NO_RULES: { label: 'No tax rules', tone: 'warning' },
  INACTIVE: { label: 'Inactive, no exit date', tone: 'danger' },
  EPS_58: { label: 'Turns 58', tone: 'info' },
};
export const warningWord = (code: string) => WARNING_WORDS[code] ?? { label: code.toLowerCase().replace(/_/g, ' '), tone: 'warning' as BadgeTone };

/* ── components ───────────────────────────────────────────────────────── */

export const KIND_ORDER: ComponentKind[] = ['EARNING', 'REIMBURSEMENT', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION'];
export const KIND_WORD: Record<ComponentKind, string> = {
  EARNING: 'Earning',
  REIMBURSEMENT: 'Reimbursement',
  DEDUCTION: 'Deduction',
  EMPLOYER_CONTRIBUTION: 'Employer contribution',
};
export const KIND_PLURAL: Record<ComponentKind, string> = {
  EARNING: 'Earnings',
  REIMBURSEMENT: 'Reimbursements',
  DEDUCTION: 'Deductions',
  EMPLOYER_CONTRIBUTION: 'Employer contributions',
};
export const kindWord = (k: string | null | undefined) => (k && KIND_WORD[k as ComponentKind]) || (k ?? '');

export const TAXABLE_WORD: Record<string, string> = { YES: 'Taxable', PARTLY: 'Partly taxable', NO: 'Not taxable' };

/* ── salaries ─────────────────────────────────────────────────────────── */

export const PF_MODE_WORD: Record<PfMode, string> = {
  CEILING: 'PF on the wage up to the ceiling (usual)',
  FULL: 'PF on the full wage (opted in)',
  NONE: 'Not a PF member',
};

/* ── statutory ────────────────────────────────────────────────────────── */

export const STATUTORY_KIND_WORD: Record<StatutoryKind, string> = {
  PF: 'Provident fund (PF)',
  ESI: 'Employees’ state insurance (ESI)',
  PT: 'Professional tax',
  LWF: 'Labour welfare fund',
};
