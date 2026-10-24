import { api } from './client';

/**
 * The law layer — the client side of CF_HRMS_HIRING_SPEC.md §36.1 (backend `routes/law.js`,
 * `services/law/*`). The law is product-level data, READ-ONLY for a company: these calls read it,
 * and write only the company's choices, its own note against a version, a location's state and
 * zone, and a role's skill, scheduled employment and default salary structure.
 */

export type LawStatus = 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
export type SkillCategory = 'UNSKILLED' | 'SEMI_SKILLED' | 'SKILLED' | 'HIGHLY_SKILLED';

export interface LawHistoryItem {
  id: number | string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  version: number;
  status: LawStatus;
  verified: boolean;
  publishedAt: string | null;
  reviewedBy?: string | null;
  value?: unknown;
  sourceUrl?: string | null;
  sourceNote?: string | null;
}

export interface LawRule {
  id: number | string;
  kind: 'LAW' | 'TAX';
  domain: string;
  domainName?: string;
  jurisdiction: string;
  ruleKey: string;
  title: string | null;
  value: Record<string, unknown>;
  effectiveFrom: string;
  effectiveTo: string | null;
  version: number;
  status: LawStatus;
  sourceUrl: string | null;
  sourceNote: string | null;
  note: string | null;
  verified: boolean;
  reviewedBy: string | null;
  publishedAt: string | null;
  reviewBy: string | null;
  taxYear?: string;
  regime?: 'OLD' | 'NEW';
  companyNote?: { verification: 'VERIFIED' | 'UNVERIFIED' | null; note: string | null } | null;
  history?: LawHistoryItem[];
}

export interface RulesInForce {
  on: string;
  states: { code: string; name: string }[];
  domains: { domain: string; name: string; rules: LawRule[] }[];
  unverified: number;
}

export interface TaxRulesPage {
  year: string;
  years: string[];
  rules: LawRule[];
  unverified: number;
}

export interface LawChoices {
  pfWageBasis: 'CEILING' | 'FULL';
  pfEstablishmentCode: string | null;
  esiEmployerCode: string | null;
  ptRegistrationNo: string | null;
  ptEnrolmentNo: string | null;
  lwfRegistrationNo: string | null;
  bonusRate: number | null;
  note: string | null;
  exists: boolean;
}

export interface LocationLaw {
  locationId: number;
  name: string;
  code: string | null;
  status: string;
  stateCode: string | null;
  zone: string | null;
  note: string | null;
}

export interface RoleLaw {
  roleId: number;
  title: string;
  skillCategory: SkillCategory | null;
  scheduledEmployment: string | null;
  defaultStructure: { structureId: number; name: string | null; ctcMin?: number | null; ctcMax?: number | null } | null;
  options: {
    skills: { key: SkillCategory; name: string }[];
    employments: { key: string; name: string; schedule: string | null; ruleKey: string; state: string }[];
    structures: { id: number; name: string; code: string }[];
  };
}

export interface MinimumWage {
  found: boolean;
  reason?: string;
  wage?: { zone: string; skill: SkillCategory; basic: number; vda: number | null; total: number; vdaPending: boolean; unit: string; daily: number };
  rule?: { id: number; ruleKey: string; title: string | null; effectiveFrom: string; version: number; sourceUrl: string | null; verified: boolean };
}

export interface SalaryDefault {
  structure: { structureId: number; name: string; ctcMin: number | null; ctcMax: number | null; roleId: number; roleTitle: string | null } | null;
  pfWageBasis: 'CEILING' | 'FULL';
  place: { state: string; stateFrom: 'LOCATION' | 'COMPANY'; locationName: string | null; zone: string | null; roleTitle: string | null; skill: SkillCategory | null; employment: string | null };
  minimumWage: MinimumWage;
}

export const SKILL_WORD: Record<SkillCategory, string> = { UNSKILLED: 'Unskilled', SEMI_SKILLED: 'Semi-skilled', SKILLED: 'Skilled', HIGHLY_SKILLED: 'Highly skilled' };

export const lawApi = {
  rulesInForce: (on?: string) => api.get<RulesInForce>(`/law/rules-in-force${on ? `?on=${encodeURIComponent(on)}` : ''}`),
  taxRules: (year?: string) => api.get<TaxRulesPage>(`/law/tax-rules${year ? `?year=${encodeURIComponent(year)}` : ''}`),
  choices: () => api.get<{ choices: LawChoices; law: { bonus: LawRule | null } }>('/law/choices'),
  putChoices: (body: Partial<Omit<LawChoices, 'exists'>>) => api.put<{ choices: LawChoices }>('/law/choices', body),
  locations: () => api.get<{ locations: LocationLaw[]; states: { code: string; name: string }[]; zones: { code: string; name: string }[] }>('/law/locations'),
  putLocation: (id: number, body: { stateCode: string | null; zone: string | null }) => api.put<{ location: LocationLaw }>(`/law/locations/${id}`, body),
  role: (id: number) => api.get<RoleLaw>(`/law/roles/${id}`),
  putRole: (id: number, body: { skillCategory?: SkillCategory | null; scheduledEmployment?: string | null; defaultStructureId?: number | null; ctcMin?: number | null; ctcMax?: number | null }) =>
    api.put<RoleLaw>(`/law/roles/${id}`, body),
  salaryDefault: (employeeId: number, on?: string) => api.get<SalaryDefault>(`/law/people/${employeeId}/salary-default${on ? `?on=${encodeURIComponent(on)}` : ''}`),
};
