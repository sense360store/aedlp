// Domain types for the AEDLP Policy Creator pattern library.

export type ConditionType =
  | "regular_expression"
  | "keyword"
  | "keyword_pattern"
  | "mip_label"
  | "attachment_metadata"
  | "classification_label";

export type RecommendedAction =
  | "silently_track"
  | "warn"
  | "warn_require_justification"
  | "block";

export type Risk = "low" | "medium" | "high";
export type Confidence = "low" | "medium" | "high";
export type Status = "draft" | "curated" | "approved" | "deprecated";

export interface Compatibility {
  regexEngine: "javascript_prototype" | "unknown" | "aedlp_confirmed";
  lookbehind: "supported" | "unsupported" | "unknown";
  unicodeClasses: "supported" | "unsupported" | "unknown";
  caseInsensitiveFlag: "supported" | "unsupported" | "unknown";
}

export interface Detector {
  id: string;
  displayName: string;
  aliases: string[];
  description: string;
  country: string;
  regionLabel: string;
  category: string;
  conditionType: ConditionType;
  regex?: string;
  contextKeywords: string[];
  positiveExamples: string[];
  negativeExamples: string[];
  recommendedAction: RecommendedAction;
  falsePositiveRisk: Risk;
  supportsAttachmentScanning: boolean;
  confidence: Confidence;
  version: string;
  status: Status;
  notes: string[];
  compatibility: Compatibility;
}

export interface BoundaryStrategy {
  id: "as_is" | "word" | "aedlp" | "none";
  label: string;
  prefix: string;
  suffix: string;
  desc: string;
}

export interface DetectionTypeOption {
  id: ConditionType;
  label: string;
  ready: boolean;
}

export interface ActionInfo {
  label: string;
  desc: string;
  gateway: boolean;
}

export interface CompatNote {
  icon: string;
  text: string;
}

export interface RegexTestResult {
  ok: boolean;
  error: string | null;
  matches: { value: string; index: number }[];
  count: number;
}

/** Context passed to the output panel to render copy/paste guidance. */
export interface OutputCtx {
  policyName: string;
  setPolicyName: (v: string) => void;
  baseRegex: string;
  effectiveRegex: string;
  boundaryLabel: string;
  keywords: string[];
  action: RecommendedAction;
  setAction: (v: RecommendedAction) => void;
  actionLabel: string;
}
