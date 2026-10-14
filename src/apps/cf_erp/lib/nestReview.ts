import type { NestFileRead, NestFilesResult, NestProblem } from '../api/nesting';
import { compactNests, cutPieceNamer, jobWords, mm, type CutPieceName, type NestPlace } from './nesting';

/**
 * THE UPLOAD REVIEW'S GROUPS (2026-10-14): what must be fixed, what to check,
 * and what is only for information — grouped, so a thing said on 34 nests is
 * one line, not 34 sentences. The screen is components/Nesting/NestReview.tsx.
 *
 * Grouping: a problem is the same thing on several nests when its code and its
 * sentence (less the "<file> nest <n>, plate <code>: " it starts with) are the
 * same; "cut from a thicker plate" goes by cut piece, whatever the count on each
 * nest. A group of one says the server's sentence as it is; a larger one says it
 * once with its nests, and every sentence is a click away. A code this screen
 * does not know is grouped the same way and is never swallowed. "Nested more
 * than the line needs" is a table. Nothing here decides what can be saved — the
 * server's canSave / needsForce do.
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const uniq = <T,>(list: T[]): T[] => [...new Set(list)];

/** What each kind of problem is called, as a heading. A code not here is still shown, under its sentences. */
const KIND_TITLE: Record<string, string> = {
  OVER_COVERAGE: 'Nested more than the line needs',
  PART_THINNER_THAN_PLATE: 'Cut from a thicker plate',
  TOO_CLOSE: 'Parts closer than the kerf',
  IN_RIM: 'Parts in the plate rim',
  CURVE_APPROXIMATE: 'Curves read approximately',
  SHAPE_IGNORED: 'Shapes not read as parts',
  MARKING_UNSURE: 'Marking or cut-out?',
  CUTOUTS_FROM_FILE: 'Cut-outs taken from the file',
  PART_UNKNOWN: 'Parts that are no cut piece of the line',
  PART_AMBIGUOUS: 'Parts that could be more than one cut piece',
  PART_LABEL_MISMATCH: 'Labels that do not fit the shape',
  PART_WRONG_THICKNESS: 'Parts on the wrong thickness',
  PART_WRONG_GRADE: 'Parts on the wrong grade',
  CHOICE_INVALID: 'Choices that could not be used',
  OVERLAP: 'Parts that overlap',
  OUTSIDE_PLATE: 'Parts off the plate',
  OPEN_CONTOUR: 'Outlines that are not closed',
  MULTIPLE_PLATES: 'Several plates in one file',
  PLATE_NOT_FOUND: 'Plates not in the catalog',
  PLATE_AMBIGUOUS: 'Plates to name',
  PLATE_NOT_DRAWN: 'Plates the file does not draw',
  UNSUPPORTED_VERSION: 'Job files this cannot read',
  NEST_CHECK_FAILED: 'Job files that do not agree with themselves',
  DUPLICATE_FILE: 'The same file twice',
  DUPLICATE_NEST: 'Two files for one nest',
};

/** The names, places and words the review uses — worked out once per answer. */
export interface ReviewNames {
  name: (code: string) => CutPieceName;
  /** Where an entry is: its job's word and nest number, or a DXF's name. */
  place: (f: NestFileRead) => NestPlace;
  /** "16 mm nest 4", "N12.dxf". */
  where: (f: NestFileRead) => string;
  /** A name in `surplus[].on` ("<file> nest 8, plate 1 of 2", "N12 (saved)") as a place. */
  placeOfName: (name: string) => NestPlace;
}

export function reviewNames(result: NestFilesResult): ReviewNames {
  const codes = [
    ...result.cutPieces.map((c) => c.code), ...result.coverage.map((c) => c.cutPlateCode), ...result.leftOver.map((c) => c.cutPlateCode),
    ...result.surplus.map((c) => c.cutPlateCode), ...result.files.flatMap((f) => f.counts.map((c) => c.cutPlateCode)),
    ...result.jobs.flatMap((j) => j.partRows.flatMap((r) => r.candidates.map((c) => c.code))), ...result.dxfPartRows.flatMap((r) => r.candidates.map((c) => c.code)),
  ];
  const name = cutPieceNamer(codes, result.cutPieces);
  const memo = new Map<string, CutPieceName>();
  const jobFiles = uniq(result.files.filter((f) => f.sourceKind === 'pronest').map((f) => f.sourceFile ?? f.filename));
  const jobs = [...result.jobs, ...jobFiles.filter((n) => !result.jobs.some((j) => j.filename === n)).map((n) => ({ filename: n, jobName: null }))];
  const words = jobWords(jobs, result.files);
  const byName = new Map(result.files.map((f) => [f.filename, f]));
  const place = (f: NestFileRead): NestPlace => (f.sourceKind === 'pronest' && f.jobNestNo != null
    ? { group: words.get(f.sourceFile ?? f.filename) ?? (f.jobName || f.filename), nest: f.jobNestNo }
    : { group: f.sourceFile && f.sourceKind === 'pronest' ? f.sourceFile : f.filename, nest: null });
  return {
    name: (code) => { if (!memo.has(code)) memo.set(code, name(code)); return memo.get(code) as CutPieceName; },
    place,
    where: (f) => { const p = place(f); return p.nest != null ? `${p.group} nest ${p.nest}` : p.group; },
    placeOfName: (n) => {
      const f = byName.get(n.replace(/, plate \d+ of \d+$/, ''));
      return f ? place(f) : { group: n, nest: null };
    },
  };
}

/** One thing the files say, where it was said. */
interface Item { p: NestProblem; entry: NestFileRead | null; rest: string }

/** One line of a section: the same thing on one nest or many. */
export interface ReviewLine {
  key: string;
  code: string;
  /** What the line says. A group of one: the server's sentence. */
  text: string;
  /** The tooltip of the nests: what is on each. */
  nestsTitle?: string;
  /** Every sentence behind the line, in the server's words (shown on request when there is more than the line says). */
  detail: string[];
  cutPlateCode?: string;
}

export interface ReviewKind { code: string; title: string | null; lines: ReviewLine[]; surplus?: boolean }

export interface Review {
  fix: ReviewKind[];
  check: ReviewKind[];
  info: { key: string; text: string; testId?: string }[];
}

/** The sentence without the file / nest / plate it starts with, so the same thing on two nests reads the same. */
function restOf(message: string, entry: NestFileRead | null): string {
  if (!entry || !message.startsWith(entry.filename)) return message;
  const at = message.indexOf(': ', entry.filename.length);
  return at < 0 ? message : message.slice(at + 2);
}

/** Group what was said: by code, then by cut piece (thicker plate) or by the sentence. */
function kindsOf(items: Item[], names: ReviewNames, result: NestFilesResult | null): ReviewKind[] {
  const kinds = new Map<string, ReviewKind>();
  const groups = new Map<string, Item[]>();
  for (const it of items) {
    const code = it.p.code || 'UNKNOWN';
    const by = code === 'PART_THINNER_THAN_PLATE' && (it.p.cutPlateId != null || it.p.cutPlateCode)
      ? `cp${it.p.cutPlateId ?? it.p.cutPlateCode}`
      : it.rest.replace(/ The same goes for \d+ more pieces? of this part on the nest\.$/, '');
    const key = `${code}|${by}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(it);
    if (!kinds.has(code)) kinds.set(code, { code, title: KIND_TITLE[code] ?? null, lines: [] });
  }
  const surplusIds = new Set((result?.surplus ?? []).map((s) => s.cutPlateId));
  for (const [key, list] of groups) {
    const first = list[0];
    const code = first.p.code || 'UNKNOWN';
    const kind = kinds.get(code) as ReviewKind;
    // Over-coverage the table says is not said again as a sentence.
    if (code === 'OVER_COVERAGE' && first.p.cutPlateId != null && surplusIds.has(first.p.cutPlateId)) continue;
    const detail = uniq(list.map((i) => i.p.message || i.p.code));
    const placed = list.filter((i) => i.entry);
    const nests = uniq(placed.map((i) => names.where(i.entry as NestFileRead)));
    const p = first.p as NestProblem & { cutPlateThickness?: number; plateThickness?: number };
    let text: string;
    let nestsTitle: string | undefined;
    if (code === 'PART_THINNER_THAN_PLATE' && p.cutPlateCode && p.cutPlateThickness != null && p.plateThickness != null) {
      const n = names.name(p.cutPlateCode);
      // A nest cut on 4 plates holds its pieces 4 times.
      const per = placed.map((i) => ({ where: names.where(i.entry as NestFileRead), pieces: (i.p.parts?.length ?? i.p.count ?? 0) * ((i.entry as NestFileRead).nestQuantity ?? 1) }));
      const pieces = per.reduce((a, x) => a + x.pieces, 0);
      text = `${n.short}${n.part ? ` · ${n.part}` : ''} — ${mm(p.cutPlateThickness)} mm, cut from ${mm(p.plateThickness)} mm plate · ${plural(nests.length, 'nest', 'nests')}${pieces ? `, ${plural(pieces, 'piece', 'pieces')}` : ''}`;
      nestsTitle = per.map((x) => (x.pieces ? `${x.where}: ${plural(x.pieces, 'piece', 'pieces')}` : x.where)).join(' · ');
    } else if (detail.length === 1) {
      text = detail[0];
    } else {
      text = `${first.rest} — on ${compactNests(placed.map((i) => names.place(i.entry as NestFileRead)))}`;
      nestsTitle = nests.join(' · ');
    }
    kind.lines.push({ key, code, text, nestsTitle, detail: detail.length > 1 || text !== detail[0] ? detail : [], cutPlateCode: p.cutPlateCode });
  }
  if (result?.surplus.length) {
    const k = kinds.get('OVER_COVERAGE') ?? { code: 'OVER_COVERAGE', title: KIND_TITLE.OVER_COVERAGE, lines: [] };
    k.surplus = true;
    kinds.set('OVER_COVERAGE', k);
  }
  // Over-coverage first (it is about the line), then the codes in the order they came.
  return [...kinds.values()].filter((k) => k.lines.length || k.surplus).sort((a, b) => Number(!!b.surplus) - Number(!!a.surplus));
}

/** The whole review of one answer. */
export function reviewOf(result: NestFilesResult, names: ReviewNames): Review {
  const said = new Set<string>();
  const fix: Item[] = [];
  const check: Item[] = [];
  const take = (list: Item[], p: NestProblem, entry: NestFileRead | null) => {
    const m = p.message || p.code;
    if (!m || said.has(m)) return;
    said.add(m);
    list.push({ p, entry, rest: restOf(p.message || p.code, entry) });
  };
  for (const f of result.files) {
    // A job that cannot be read is one entry with no nest: its sentence belongs to the job, not to a nest.
    const entry = f.sourceKind === 'pronest' && f.jobNestNo == null ? null : f;
    for (const p of f.errors) take(fix, p, entry);
    // A plate whose file is the one saved is not written again: what it says is not a reason to save anyway.
    if (f.action !== 'unchanged') for (const p of f.warnings) take(check, p, entry);
  }
  for (const j of result.jobs) if (j.error?.message) take(fix, { code: j.error.code, message: j.error.message }, null);
  for (const p of result.problemList) take(fix, p, null);
  for (const m of result.problems) take(fix, { code: '', message: m }, null);
  for (const p of result.warningList) take(check, p, null);
  for (const m of result.warnings) take(check, { code: '', message: m }, null);

  // Notes: the same note on many nests is one line.
  const notes = new Map<string, NestFileRead[]>();
  for (const f of result.files) for (const n of f.notes) { if (!notes.has(n)) notes.set(n, []); notes.get(n)?.push(f); }
  const info: Review['info'] = [...notes].map(([n, fs]) => ({
    key: `n|${n}`, text: fs.length > 1 ? `${n} — on ${compactNests(fs.map(names.place))}` : n,
  }));
  for (const j of result.jobs) for (const n of j.notes) info.push({ key: `j|${j.filename}|${n}`, text: `${j.jobName || j.filename}: ${n}`, testId: 'job-notes' });
  if (result.message) info.push({ key: 'message', text: `In the server's words: ${result.message}`, testId: 'nest-files-message' });
  return { fix: kindsOf(fix, names, null), check: kindsOf(check, names, result), info };
}

/** The lines of the Check section in the short form the Save-anyway confirmation lists. */
export function checkLines(review: Review, result: NestFilesResult, names: ReviewNames): string[] {
  return review.check.flatMap((k) => [
    ...(k.surplus ? result.surplus.map((s) => {
      const n = names.name(s.cutPlateCode);
      return `${n.short}${n.part ? ` · ${n.part}` : ''}: nested ${s.nested}, the line needs ${s.needed} — ${s.surplus} extra`;
    }) : []),
    ...k.lines.map((l) => l.text),
  ]);
}

