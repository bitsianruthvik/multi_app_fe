import type { LedgerGroup } from '../../api/storesDesk';

/** Helpers of ClassTreePicker (a family › sub-family › variant tree; see that file). */
export interface TreePick { fam: number[]; sub: number[]; var: number[] }
export const EMPTY_PICK: TreePick = { fam: [], sub: [], var: [] };
export const pickFromParams = (fam: string, sub: string, vr: string): TreePick => {
  const ids = (s: string) => s.split(',').map(Number).filter((x) => Number.isInteger(x) && x > 0);
  return { fam: ids(fam), sub: ids(sub), var: ids(vr) };
};

export interface Fam { id: number; name: string; items: number; subs: Sub[] }
export interface Sub { id: number; name: string; familyId: number; items: number; vars: Var[] }
export interface Var { id: number; name: string; subId: number; familyId: number; items: number }

export function treeOf(groups: LedgerGroup[]): Fam[] {
  const fams = new Map<number, Fam>();
  for (const g of groups) {
    if (g.familyId == null || g.subfamilyId == null || g.variantId == null) continue;
    const f = fams.get(g.familyId) ?? (fams.set(g.familyId, { id: g.familyId, name: g.family ?? '', items: 0, subs: [] }), fams.get(g.familyId)!);
    let s = f.subs.find((x) => x.id === g.subfamilyId);
    if (!s) { s = { id: g.subfamilyId, name: g.subfamily ?? '', familyId: f.id, items: 0, vars: [] }; f.subs.push(s); }
    s.vars.push({ id: g.variantId, name: g.variant ?? '', subId: s.id, familyId: f.id, items: g.items });
    s.items += g.items; f.items += g.items;
  }
  return [...fams.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The leaves (variants) a pick covers. */
export function leavesOf(tree: Fam[], p: TreePick): Set<number> {
  const out = new Set<number>(p.var);
  for (const f of tree) {
    if (p.fam.includes(f.id)) f.subs.forEach((s) => s.vars.forEach((v) => out.add(v.id)));
    for (const s of f.subs) if (p.sub.includes(s.id)) s.vars.forEach((v) => out.add(v.id));
  }
  return out;
}
/** The smallest pick that covers these leaves. */
export function pickOf(tree: Fam[], leaves: Set<number>): TreePick {
  const p: TreePick = { fam: [], sub: [], var: [] };
  for (const f of tree) {
    const all = f.subs.every((s) => s.vars.every((v) => leaves.has(v.id)));
    if (all && f.subs.length) { p.fam.push(f.id); continue; }
    for (const s of f.subs) {
      if (s.vars.length && s.vars.every((v) => leaves.has(v.id))) p.sub.push(s.id);
      else s.vars.forEach((v) => { if (leaves.has(v.id)) p.var.push(v.id); });
    }
  }
  return p;
}

/** Each pick in words, as a path. */
export function pickWords(groups: LedgerGroup[], p: TreePick): { key: string; label: string; kind: keyof TreePick; id: number }[] {
  const out: { key: string; label: string; kind: keyof TreePick; id: number }[] = [];
  for (const f of treeOf(groups)) {
    if (p.fam.includes(f.id)) out.push({ key: `f${f.id}`, label: f.name, kind: 'fam', id: f.id });
    for (const s of f.subs) {
      if (p.sub.includes(s.id)) out.push({ key: `s${s.id}`, label: `${f.name} › ${s.name}`, kind: 'sub', id: s.id });
      for (const v of s.vars) if (p.var.includes(v.id)) out.push({ key: `v${v.id}`, label: `${f.name} › ${s.name} › ${v.name}`, kind: 'var', id: v.id });
    }
  }
  return out;
}

