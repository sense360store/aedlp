/* ============================================================
   AEDLP Policy Creator — domain types
   Modelled from the prototype data in handoff project/app/data.js.
   Every field used by a detector in that file is represented here.
   ============================================================ */

/** The five copy/paste condition types in the detector library. */
export type ConditionType =
  | "regular_expression"
  | "keyword"
  | "keyword_pattern"
  | "recipient_domain"
  | "file_extension";

/** Recommended enforcement action. Ranked low -> high in AEDLP_DATA.actions. */
export type RecommendedAction =
  | "silently_track"
  | "warn"
  | "warn_require_justification"
  | "block";

/** False-positive risk band. */
export type Risk = "low" | "medium" | "high";

/** Boundary strategy ids used when wrapping a regex. */
export type BoundaryStrategyId = "as_is" | "word";

/** Logical operator across keyword-pattern groups. */
export type PatternOperator = "AND" | "OR";

/** Match mode for keyword / pattern / recipient detectors. */
export interface KeywordMatchMode {
  caseInsensitive: boolean;
  wholeWord: boolean;
}

/** File-extension detectors only constrain case sensitivity. */
export interface FileMatchMode {
  caseInsensitive: boolean;
  wholeWord?: boolean;
}

/** Fields shared by every detector shape. */
export interface DetectorBase {
  id: string;
  displayName: string;
  aliases?: string[];
  description: string;
  country: string;
  regionLabel: string;
  /** Present on a single keyword detector (GDPR special category). */
  region?: string;
  category: string;
  /** Source industry label; drives the derived `industries` list. */
  industry?: string;
  /** Derived (or explicit, for file types) industry tags for filtering. */
  industries?: string[];
  contextKeywords?: string[];
  positiveExamples: string[];
  negativeExamples?: string[];
  recommendedAction: RecommendedAction;
  falsePositiveRisk: Risk;
  notes?: string[];
}

export interface RegexDetector extends DetectorBase {
  conditionType: "regular_expression";
  regex: string;
}

export interface KeywordDetector extends DetectorBase {
  conditionType: "keyword";
  keywords: string[];
  matchMode: KeywordMatchMode;
}

export interface KeywordPatternDetector extends DetectorBase {
  conditionType: "keyword_pattern";
  /** Synonym groups: OR within a group, `operator` across groups. */
  groups: string[][];
  operator: PatternOperator;
  /** Words within which AND groups must co-occur; null = anywhere. */
  proximity: number | null;
  matchMode: KeywordMatchMode;
}

export interface RecipientDomainDetector extends DetectorBase {
  conditionType: "recipient_domain";
  domains: string[];
  matchMode: KeywordMatchMode;
}

export interface FileExtensionDetector extends DetectorBase {
  conditionType: "file_extension";
  extensions: string[];
  family: string;
  matchMode: FileMatchMode;
}

/** A library detector: one of the five condition shapes. */
export type Detector =
  | RegexDetector
  | KeywordDetector
  | KeywordPatternDetector
  | RecipientDomainDetector
  | FileExtensionDetector;

/** Runtime-only fields a detector gains once added to the policy draft. */
export interface ConditionExtras {
  boundary?: BoundaryStrategyId;
  _effectiveRegex?: string;
}

/**
 * A detector added to the policy draft. Regex conditions carry a boundary
 * choice and the effective (boundary-wrapped) regex, per the prototype.
 * Distributed over the union so `conditionType` still narrows the variant.
 */
export type Condition =
  | (RegexDetector & ConditionExtras)
  | (KeywordDetector & ConditionExtras)
  | (KeywordPatternDetector & ConditionExtras)
  | (RecipientDomainDetector & ConditionExtras)
  | (FileExtensionDetector & ConditionExtras);

/* ---------------- metadata blocks ---------------- */

export interface ConditionTypeMeta {
  id: ConditionType;
  short: string;
  label: string;
}

export interface ActionMeta {
  label: string;
  desc: string;
  rank: number;
}

export interface BoundaryStrategy {
  id: BoundaryStrategyId;
  label: string;
  prefix: string;
  suffix: string;
}

export interface SampleSnippet {
  id: string;
  label: string;
  text: string;
}

/** The exported library, equivalent to the prototype `window.AEDLP_DATA`. */
export interface AedlpData {
  detectors: Detector[];
  conditionTypes: ConditionTypeMeta[];
  categories: string[];
  regions: string[];
  industries: string[];
  actions: Record<RecommendedAction, ActionMeta>;
  boundaryStrategies: BoundaryStrategy[];
  sampleSnippets: SampleSnippet[];
}

/** Recipient-domain lists loaded before the library (prototype recipients.js). */
export interface RecipientDomains {
  freemail: string[];
  disposable: string[];
  competitors: string[];
}
