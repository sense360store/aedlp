/* ============================================================
   Wizard front door (Phase A) — derivation + localStorage state.

   A skippable front door for SEs and AMs that pre-filters the Policy
   Creator to a customer's industry and pre-fills the policy metadata.
   This module owns the pure, side-effect-light pieces:

   - which industries qualify for the wizard's dropdown, DERIVED from the
     library (never hardcoded) so no choice lands on an empty filter;
   - the policy name / description / tags the wizard writes;
   - the localStorage state that decides what the app shows on load.

   No backend, no network — persistence is localStorage only, namespaced
   under `aedlp_wizard_*`. Every read tolerates absent or corrupt data by
   falling back to "show the wizard".
   ============================================================ */
import { AEDLP_DATA } from "../data/library";
import { slugify } from "./suggest";
import type { AedlpData } from "../types";

/** A customer + industry pairing chosen in the wizard. */
export interface WizardAccount {
  customer: string;
  industry: string;
}

/* ---------------- qualifying industries (derived from data) ---------------- */

/**
 * Minimum number of industry-specific detectors for an industry to be worth
 * offering as a pre-filter. The industry filter always also surfaces the
 * cross-industry baseline, so below this threshold the vertical brings nothing
 * of its own to the filter and we leave it out.
 */
export const MIN_INDUSTRY_DETECTORS = 3;

/**
 * The umbrella tag in the taxonomy. Inside `filterDetectors` it matches every
 * vertical, so it is not a customer vertical to pre-filter on — exclude it from
 * the wizard's dropdown (selecting it would not focus on anything).
 */
const UMBRELLA_INDUSTRY = "Cross-industry";

/**
 * Industries to offer in the wizard dropdown, derived from the library so the
 * list can never drift from the data or hardcode a vertical that lands on an
 * empty/meaningless filter. An industry qualifies when it carries at least
 * `MIN_INDUSTRY_DETECTORS` detectors of its own; the Cross-industry umbrella is
 * excluded. Order follows `AEDLP_DATA.industries`.
 */
export function qualifyingIndustries(data: AedlpData = AEDLP_DATA): string[] {
  return data.industries.filter((ind) => {
    if (ind === UMBRELLA_INDUSTRY) return false;
    const specific = data.detectors.filter((d) => (d.industries || []).includes(ind)).length;
    return specific >= MIN_INDUSTRY_DETECTORS;
  });
}

/* ---------------- industry coverage hints (wizard-only) ---------------- */

/**
 * A one-line, plain-language hint of what each industry broadly covers, shown
 * under the wizard's industry dropdown so an SE can recognise which vertical a
 * customer belongs to (e.g. an airline is Transportation & logistics) without
 * guessing. Deliberately wizard-only — NOT the per-detector tooltips the library
 * dropped. Each value is ONE short phrase: no company names, no sub-industry
 * lists, no long enumerations (kept minimal so it stays scannable). Keyed by the
 * exact industry label in `AEDLP_DATA.industries`; cover every label so a
 * selected industry always has a hint.
 */
export const INDUSTRY_HINTS: Record<string, string> = {
  "Cross-industry": "Applies across every industry",
  "Financial services": "Banking and financial products",
  Insurance: "Insuring people and businesses against risk",
  "Healthcare & life sciences": "Medical care and life sciences",
  "Technology & SaaS": "Software and online services",
  "Legal & professional services": "Legal and professional advisory work",
  "Manufacturing & engineering": "Designing and making physical products",
  "Aerospace & defense": "Aircraft and military equipment",
  "Transportation & logistics": "Moving people and goods",
  "Retail & e-commerce": "Selling goods in shops and online",
  "Energy & utilities": "Power and utility supply",
  "Public sector": "Government and public services",
  Education: "Schools and education providers",
};

/** The coverage hint for an industry, or "" when none is known (render nothing). */
export function industryHint(industry: string): string {
  return INDUSTRY_HINTS[industry] ?? "";
}

/* ---------------- policy field prefill ---------------- */

/** Policy name in the agreed format: "<Customer>, <Industry> DLP". */
export function wizardPolicyName(a: WizardAccount): string {
  return `${a.customer.trim()}, ${a.industry} DLP`;
}

/** One-line description: "DLP policy for <Customer> (<Industry>)." */
export function wizardPolicyDescription(a: WizardAccount): string {
  return `DLP policy for ${a.customer.trim()} (${a.industry}).`;
}

/**
 * Tags for the draft: the customer and the industry. Tags everywhere else in
 * the app are slugged chips (see `suggestTags` / `TagsField`), so these are
 * slugged for consistency. Empty slugs are dropped and duplicates collapsed
 * (e.g. a customer named after its own industry).
 */
export function wizardPolicyTags(a: WizardAccount): string[] {
  return [...new Set([slugify(a.customer), slugify(a.industry)].filter(Boolean))];
}

/* ---------------- localStorage persistence ---------------- */

const LS_GLOBAL_DISMISS = "aedlp_wizard_global_dismiss";
const LS_LAST = "aedlp_wizard_last";
const LS_ACCOUNTS = "aedlp_wizard_accounts";

/** A completed account, with the time it was completed. */
export interface CompletedAccount extends WizardAccount {
  completedAt: number;
}

export interface WizardState {
  /** Global "don't show the wizard again" preference. */
  globalDismiss: boolean;
  /** The most recently completed account (drives reapply-on-load), or null. */
  last: WizardAccount | null;
  /** Every completed account, keyed by customer+industry. */
  accounts: Record<string, CompletedAccount>;
}

/** Stable per-account key: slugged customer + industry. */
export function accountKey(a: WizardAccount): string {
  return `${slugify(a.customer)}__${slugify(a.industry)}`;
}

function isAccount(v: unknown): v is WizardAccount {
  if (typeof v !== "object" || v === null) return false;
  const a = v as Partial<WizardAccount>;
  return (
    typeof a.customer === "string" &&
    typeof a.industry === "string" &&
    a.customer.trim() !== "" &&
    a.industry.trim() !== ""
  );
}

function readGlobalDismiss(): boolean {
  try {
    return localStorage.getItem(LS_GLOBAL_DISMISS) === "1";
  } catch {
    return false;
  }
}

function readLast(): WizardAccount | null {
  try {
    const raw = localStorage.getItem(LS_LAST);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    return isAccount(v) ? { customer: v.customer, industry: v.industry } : null;
  } catch {
    return null;
  }
}

function readAccounts(): Record<string, CompletedAccount> {
  try {
    const raw = localStorage.getItem(LS_ACCOUNTS);
    if (!raw) return {};
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return {};
    const out: Record<string, CompletedAccount> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (!isAccount(val)) continue;
      const at = (val as Partial<CompletedAccount>).completedAt;
      out[k] = { customer: val.customer, industry: val.industry, completedAt: typeof at === "number" ? at : 0 };
    }
    return out;
  } catch {
    return {};
  }
}

/** Read the full wizard state. Never throws on missing/corrupt data. */
export function loadWizardState(): WizardState {
  return { globalDismiss: readGlobalDismiss(), last: readLast(), accounts: readAccounts() };
}

/** Set or clear the global "don't show again" preference. Storage errors are non-fatal. */
export function setGlobalDismiss(on: boolean): void {
  try {
    if (on) localStorage.setItem(LS_GLOBAL_DISMISS, "1");
    else localStorage.removeItem(LS_GLOBAL_DISMISS);
  } catch {
    /* storage unavailable (private mode / quota) — non-fatal */
  }
}

/** Re-open helper: clear the global preference so the wizard can auto-show again. */
export function clearGlobalDismiss(): void {
  setGlobalDismiss(false);
}

/**
 * Record an account as completed: update the per-account map (keyed by
 * customer+industry) and the `last` pointer that drives reapply-on-load.
 */
export function recordCompletedAccount(a: WizardAccount): void {
  const account: WizardAccount = { customer: a.customer.trim(), industry: a.industry.trim() };
  if (!isAccount(account)) return;
  try {
    const accounts = readAccounts();
    accounts[accountKey(account)] = { ...account, completedAt: Date.now() };
    localStorage.setItem(LS_ACCOUNTS, JSON.stringify(accounts));
    localStorage.setItem(LS_LAST, JSON.stringify(account));
  } catch {
    /* non-fatal */
  }
}

/* ---------------- landing decision ---------------- */

export type Landing =
  | { kind: "wizard" }
  | { kind: "library"; account: WizardAccount | null };

/**
 * Decide what to show on load:
 *  - global "don't show again" set  → the library, no pre-fill;
 *  - a previously completed account → the library, reapply that account;
 *  - otherwise (first load / cleared / corrupt) → the wizard.
 */
export function decideLanding(state: WizardState = loadWizardState()): Landing {
  if (state.globalDismiss) return { kind: "library", account: null };
  if (state.last) return { kind: "library", account: state.last };
  return { kind: "wizard" };
}
