/** Number formats for the By flow dashboard. */
/** Tonnes or pieces with a space and the unit. */
export const fmtT = (v: number | null | undefined) => (v == null ? '—' : `${v.toLocaleString('en-IN', { maximumFractionDigits: 1 })} t`);
export const fmtN = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
export const fmtDays = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v)} d`);
export const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(0)}%`);
export const fmtCr = (v: number | null | undefined) => (v == null ? '—' : `₹${(v / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`);
